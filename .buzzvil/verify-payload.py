"""Read-only checks for the exact Buzzvil overlay; never import Django or contact a DB."""

import argparse
import hashlib
import json
import re
from pathlib import Path


def instructions(path):
    """Read the simple, single-stage overlay recipes without Docker or a daemon."""
    text = re.sub(r"\\\n\s*", " ", path.read_text())
    return [line.strip() for line in text.splitlines() if line.strip() and not line.startswith("#")]


def verify(args):
    manifest = json.loads(args.manifest.read_text())
    if manifest["schema"] != "buzzvil.authentik-payload/v1":
        raise ValueError("Unsupported payload manifest")
    root = args.root or (Path.cwd() if args.mode == "source" else Path("/"))
    entries = list(manifest["runtime"])
    if args.mode == "source":
        entries += manifest["source_contract"] + manifest["tests"]
    elif args.with_tests:
        entries += manifest["tests"] + manifest["inherited_test_support"]
    for entry in entries:
        relative = entry["source"] if args.mode == "source" else entry["destination"].lstrip("/")
        path = root / relative
        if hashlib.sha256(path.read_bytes()).hexdigest() != entry["sha256"]:
            raise ValueError(f"Payload hash mismatch: {relative}")

    if args.mode == "source":
        recipe = instructions(root / ".buzzvil/Dockerfile")
        if [line for line in recipe if line.startswith("FROM ")] != [
            "FROM " + manifest["base_image"]
        ]:
            raise ValueError("Upstream base image changed")
        if any(line.split()[0] in {"RUN", "USER", "ENTRYPOINT", "CMD"} for line in recipe):
            raise ValueError("Production overlay must inherit the upstream runtime lifecycle")
        expected = [
            f"COPY --chown=authentik:authentik {entry['source']} {entry['destination']}"
            for entry in manifest["runtime"]
        ]
        if [line for line in recipe if line.startswith("COPY ")] != expected:
            raise ValueError("Dockerfile COPY list differs from the exact runtime manifest")
        test_recipe = instructions(root / ".buzzvil/Dockerfile.test")
        expected_cmd = "CMD " + json.dumps(["test", *manifest["regression_labels"]])
        if [line for line in test_recipe if line.startswith("CMD ")] != [expected_cmd]:
            raise ValueError("Regression labels differ from the reviewed manifest")
        for entry in manifest["tests"]:
            copy = f"COPY --chown=authentik:authentik {entry['source']} {entry['destination']}"
            if copy not in test_recipe:
                raise ValueError(f"Test image does not copy {entry['source']}")
        workflow = (root / ".github/workflows/build-patched-ecr.yaml").read_text()
        sparse = workflow.split("sparse-checkout: |", 1)[1].split("sparse-checkout-cone-mode:", 1)[
            0
        ]
        paths = [line.strip() for line in sparse.splitlines() if line.strip()]
        for entry in entries:
            if not any(entry["source"] == p or entry["source"].startswith(p + "/") for p in paths):
                raise ValueError(f"Publishing checkout omits {entry['source']}")
        if "platforms: " + ",".join(manifest["platforms"]) not in workflow:
            raise ValueError("Publishing platforms differ from the manifest")
    print(
        f"{args.mode}: {len(entries)} exact payload hashes verified; no DB/startup/build executed"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("source", "installed"))
    parser.add_argument("--manifest", type=Path, default=Path(__file__).with_name("payload.json"))
    parser.add_argument("--root", type=Path)
    parser.add_argument("--with-tests", action="store_true")
    verify(parser.parse_args())
