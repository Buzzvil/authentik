#!/usr/bin/env bash
set -euo pipefail

fail() {
    printf '%s\n' "$*" >&2
    exit 1
}

[[ -z ${CI:-} && ${GITHUB_ACTIONS:-} != true ]] || fail "Run this check locally."
[[ $# -eq 2 || ( $# -eq 3 && ${3:-} == --regression ) ]] ||
    fail "Usage: bash .buzzvil/verify-installed-local.sh FULL_REVIEWED_SHA linux/amd64|linux/arm64 [--regression]"
source_sha=$1
platform=$2
mode=${3:-}
[[ $source_sha =~ ^[0-9a-f]{40}$ ]] || fail "Supply the full reviewed commit SHA."
[[ $mode != --regression || $platform == linux/amd64 ]] || fail "The regression suite requires native linux/amd64."
machine=$(uname -m)
case "$platform:$machine" in
    linux/amd64:x86_64|linux/arm64:aarch64|linux/arm64:arm64) ;;
    *) fail "The requested platform must match the native host architecture." ;;
esac

cd "$(dirname "${BASH_SOURCE[0]}")/.."
head_sha=$(git rev-parse HEAD)
[[ $head_sha == "$source_sha" ]] || fail "Check out the reviewed commit first."
checkout_status=$(git status --porcelain)
[[ -z $checkout_status ]] || fail "Use a clean checkout."
python3 -I .buzzvil/verify-payload.py source

[[ -z ${DOCKER_HOST:-} && -z ${BUILDX_BUILDER:-} ]] || fail "Use the local Docker context and its default builder."
context=$(docker context show)
endpoint=$(docker context inspect "$context" --format '{{.Endpoints.docker.Host}}')
[[ $endpoint == unix:///* && -S ${endpoint#unix://} ]] || fail "An existing local Docker socket is required."
engine=(docker --context "$context")
engine_platform=$("${engine[@]}" version --format '{{.Server.Os}}/{{.Server.Arch}}')
[[ $engine_platform == "$platform" ]] || fail "The Docker engine must match the requested platform."

work=$(mktemp -d "${TMPDIR:-/tmp}/authentik-installed.XXXXXXXX")
image="authentik-p1-qualification:${work##*/}"
container="${work##*/}"
regression_image="$image-regression"
regression_container="$container-regression"
database="$container-postgres"
network="$container-regression"
report_dir=
test_started=false
cleanup() {
    local status=$?
    trap - EXIT
    if [[ $test_started == true ]]; then
        { "${engine[@]}" cp "$regression_container:/tmp/unittest.xml" "$report_dir/unittest.xml" &&
            [[ -s "$report_dir/unittest.xml" ]]; } ||
            { [[ $status -ne 0 ]] || status=1; }
    fi
    local name
    for name in "$container" "$container-ca" "$regression_container" "$database"; do
        if "${engine[@]}" container inspect "$name" >/dev/null 2>&1; then
            "${engine[@]}" container rm -f "$name" >&2 || { [[ $status -ne 0 ]] || status=1; }
        fi
    done
    if [[ $mode == --regression ]] && "${engine[@]}" network inspect "$network" >/dev/null 2>&1; then
        "${engine[@]}" network rm "$network" >&2 || { [[ $status -ne 0 ]] || status=1; }
    fi
    if [[ -s "$work/regression.id" ]]; then
        "${engine[@]}" image rm --no-prune "$regression_image" >&2 || { [[ $status -ne 0 ]] || status=1; }
    fi
    if [[ -s "$work/image.id" ]]; then
        "${engine[@]}" image rm --no-prune "$image" >&2 || { [[ $status -ne 0 ]] || status=1; }
    fi
    rm -rf -- "$work" || { [[ $status -ne 0 ]] || status=1; }
    if [[ -n $report_dir ]]; then
        printf 'regression_report_dir=%s\n' "$report_dir"
    fi
    if [[ $status -eq 0 ]]; then
        printf 'source_sha=%s platform=%s native_machine=%s local_image_id=%s\n%s\n' \
            "$source_sha" "$actual_platform" "$machine" "$image_id" "$payload_evidence"
    fi
    exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Build and mount the overlay from the same immutable Git tree.
mkdir "$work/context"
git archive "$source_sha" -- .buzzvil .dockerignore \
    authentik/providers/saml authentik/providers/oauth2 authentik/stages/user_write blueprints/schema.json \
    | tar -xf - -C "$work/context"
payload_evidence=$(python3 -I - "$work/context/.buzzvil/payload.json" <<'PY'
import hashlib
import json
import sys
from pathlib import Path

raw = Path(sys.argv[1]).read_bytes()
manifest = json.loads(raw)
runtime = manifest["runtime"]
if manifest["schema"] != "buzzvil.authentik-payload/v1" or len(runtime) != 11:
    raise SystemExit("Expected the reviewed eleven-file runtime payload")
payload = json.dumps(runtime, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
print(f"base_image={manifest['base_image']} verified_files={len(runtime)}")
print(f"manifest_sha256={hashlib.sha256(raw).hexdigest()}")
print(f"runtime_payload_sha256={hashlib.sha256(payload).hexdigest()}")
PY
)

"${engine[@]}" build --pull --platform "$platform" -f "$work/context/.buzzvil/Dockerfile" \
    --build-arg "SOURCE_REVISION=$source_sha" --build-arg IMAGE_VERSION=p1-unpublished \
    --iidfile "$work/image.id" -t "$image" "$work/context"
image_id=$(cat "$work/image.id")
[[ $image_id =~ ^sha256:[0-9a-f]{64}$ ]] || fail "The build did not produce an immutable image ID."
actual_platform=$("${engine[@]}" image inspect --format '{{.Os}}/{{.Architecture}}' "$image_id")
[[ $actual_platform == "$platform" ]] || fail "The image platform does not match."
revision=$("${engine[@]}" image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image_id")
[[ $revision == "$source_sha" ]] || fail "The image source revision does not match."
"${engine[@]}" run --rm --name "$container" --platform "$platform" \
    --read-only --network none --cap-drop ALL --security-opt no-new-privileges \
    --entrypoint python -v "$work/context/.buzzvil:/payload:ro" "$image_id" \
    -I /payload/verify-payload.py installed --manifest /payload/payload.json

if [[ $mode != --regression ]]; then
    exit 0
fi

"${engine[@]}" build --platform "$platform" -f "$work/context/.buzzvil/Dockerfile.test" \
    --build-arg "PATCHED_IMAGE=$image" --iidfile "$work/regression.id" -t "$regression_image" "$work/context"
regression_id=$(cat "$work/regression.id")
[[ $regression_id =~ ^sha256:[0-9a-f]{64}$ ]] || fail "The test build did not produce an immutable image ID."
"${engine[@]}" run --rm --name "$regression_container" --platform "$platform" \
    --read-only --network none --cap-drop ALL --security-opt no-new-privileges \
    --entrypoint python -v "$work/context/.buzzvil:/payload:ro" "$regression_id" \
    -I /payload/verify-payload.py installed --manifest /payload/payload.json --with-tests

# Verify the same trust stores and tools previously checked on amd64 in CI.
"${engine[@]}" run --rm -i --name "$container-ca" --platform "$platform" --network none \
    --entrypoint python "$image_id" - <<'PY'
import importlib.metadata
import ssl
import subprocess
import certifi

assert importlib.metadata.version("certifi") == "2026.10.19"
assert subprocess.check_output(["uv", "--version"], text=True).split()[:2] == ["uv", "0.13.4"]
ca_version = subprocess.check_output(["dpkg-query", "-W", "-f=${Version}", "ca-certificates"], text=True)
subprocess.run(["dpkg", "--compare-versions", ca_version, "ge", "20250419+deb13u1"], check=True)
blocked = {"emSign ECC Root CA - G3", "emSign Root TLS CA - G3", "AAA Certificate Services"}
for label, context in {"OS": ssl.create_default_context(), "certifi": ssl.create_default_context(cafile=certifi.where())}.items():
    roots = context.get_ca_certs()
    assert roots, label + ": empty trust store"
    names = {value for cert in roots for rdn in cert["subject"] for key, value in rdn if key == "commonName"}
    assert not names & blocked, label + ": compromised CA remains trusted"
    print(label + ": patched CA store verified")
print("ca-certificates=" + ca_version)
PY

report_dir=$(mktemp -d "${TMPDIR:-/tmp}/authentik-regression-report.XXXXXXXX")
"${engine[@]}" network create "$network" >/dev/null
"${engine[@]}" run -d --name "$database" --network "$network" --network-alias postgres \
    -e POSTGRES_DB=authentik -e POSTGRES_USER=authentik -e POSTGRES_PASSWORD=ci-only-test-password \
    postgres:17.11-bookworm >/dev/null
for (( attempt=1; attempt<=30; attempt++ )); do
    if "${engine[@]}" exec "$database" pg_isready -h 127.0.0.1 -U authentik; then break; fi
    sleep 2
done
"${engine[@]}" exec "$database" pg_isready -h 127.0.0.1 -U authentik
test_started=true
"${engine[@]}" run --name "$regression_container" --network "$network" \
    -e AUTHENTIK_POSTGRESQL__HOST=postgres \
    -e AUTHENTIK_POSTGRESQL__NAME=authentik \
    -e AUTHENTIK_POSTGRESQL__USER=authentik \
    -e AUTHENTIK_POSTGRESQL__PASSWORD=ci-only-test-password \
    -e AUTHENTIK_SECRET_KEY=ci-only-synthetic-key \
    -e PYTEST_ADDOPTS='--junitxml=/tmp/unittest.xml -o cache_dir=/tmp/pytest-cache' \
    "$regression_id"
