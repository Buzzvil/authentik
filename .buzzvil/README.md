# Buzzvil authentik 2026.8.5 overlay

This is packaging source for the conditional UserWrite change in PR #39
(`e3fa5f3db877be91d0adb3ad1b83c3555c7bf5e8`), stacked on the custom base
`415a4e7a541910221a6a7c6db657463915906a27`. It does not enable proof mode,
apply a blueprint/migration, publish an image, or authorize a deployment.

## Exact payload and consumers

`.buzzvil/payload.json` pins the official multi-platform base image index
`ghcr.io/goauthentik/server:2026.8.5@sha256:602227a86455d6772e3d16b7d852713c4f864f40df5df894abd1285bb53979a5`.
Upstream source is `version/2026.8.5`, commit
`4ec0d19b98da3c329781894cd550da95d3033954`. The manifest records each source
path, installed path and SHA-256, with separate source-contract and test entries.

The production recipe overlays eleven files:

- The original six files are unchanged: SAML `authn_request_parser.py` and
  `sso.py`, plus OAuth2 `utils.py`, `token.py`, `userinfo.py` and `provider.py`.
  They preserve request/default RelayState and matching-mode CORS behaviour.
- UserWrite `stage.py`, `models.py`, `api.py` and additive migration
  `0009_userwritestage_email_verification_attribute.py` ship together.
- `/blueprints/schema.json` includes the generated field for editor consumers.

`lifecycle/container/Dockerfile` copies the Python package to `/authentik`,
blueprints to `/blueprints`, test support to `/tests`, and inherits the
`dumb-init -- ak` entrypoint. This overlay changes no entrypoint, user, command,
dependency, or unrelated Python module. Both `linux/amd64` and `linux/arm64`
builds use the same explicit COPY list. These are source-layout observations;
installed bytes still require the image checks below.

Normal Python server/worker startup calls `lifecycle.migrate.run_migrations`
(`lifecycle/gunicorn.conf.py` and `lifecycle/worker_process.py`). That path takes
an advisory lock and runs `migrate_schemas`, including the template tenant when
enabled. Shipping 0009 makes it discoverable; building an image does not apply it.
It adds a blank-default optional field and does not enable existing stages.
Never start this image against an operating database merely to inspect it.

The API schema endpoint (`authentik/api/v3/urls.py`) uses
`SpectacularAPIView`/the installed serializer. It does not load root
`schema.yml`; the manifest checks that generated file as a source contract.
The blueprint importer (`authentik/blueprints/v1/importer.py`) validates/saves
through the model serializer, not `blueprints/schema.json`.

The four generated TypeScript files are also checked as source contracts.
They are build inputs, not Python runtime overlays. The upstream compiled
`/web/dist` is retained; this patch does not add a UI control or recompile a web
bundle. A future activation must use the reviewed API/blueprint path and read
back the exact nonempty `email_verification_attribute`,
`user_creation_mode: never_create` and `create_users_group: null` together.
A misspelled field can be ignored despite a successful serializer write; write
success alone is not evidence that proof mode was enabled.

## Checks that do not build or start an image

From the repository root:

```sh
python3 .buzzvil/verify-payload.py source
```

This uses only the standard library. It checks source hashes, the pinned FROM,
the exact production COPY list, inherited lifecycle, test COPY/labels, publishing
sparse checkout and both publishing platforms. It does not import Django, query
a database, contact a registry or create a container. When carrying a patch to a
new release, review/regenerate the manifest from the intended immutable source;
do not change a hash just to silence a failed check.

The source-only packaging review reuses PR #39's native 45 tests + 17 subtests
on the existing local PostgreSQL 18 fixture. That prior PASS is not an image,
PostgreSQL 17.11, arm64 or operating acceptance result. It is not rerun here.

## CI source verification

The `verify` job in `build-patched-ghcr` runs the standard-library source
verifier. The publishing job still depends on that check. Native installed
files, CA/tool checks, and the PostgreSQL regression suite run through the
[local-only image checks](#local-only-image-checks) after separate approval.

The existing `VULN-688/**` branch, release tag, and manual workflow triggers
remain in place. A `fix/**` branch push or PR does not select them. Publication
uses its existing build/push job and requires the separate exact approval.

## Publication, deployment and rollback contract

No existing tag is reused for P1. The workflow derives the output tag from the
validated `2026.8.5-cors-relaystate` base input plus
`-p1-<full-source-sha>-<run-id>-<run-attempt>`. A retry gets a distinct tag.
`SOURCE_REVISION` records the actual packaging commit; `IMAGE_VERSION` records
that new tag. A local verification build defaults to `p1-unpublished`.
The old base input is a prefix, not the output tag. Do not republish the existing
`2026.8.5-cors-relaystate` image or call its digest the P1 result.

Only after a separately approved normal build/publish run may its new GHCR
index digest and both platform manifest digests be recorded. Confirm the
published images match the verified payload/OCI source label; a registry tag or
a successful job alone is insufficient. The test derivative is never published.
The release step remains tag-triggered. It preserves existing notes and appends
the derived image tag, new index digest, source SHA and run/attempt URL; retries
append their distinct result. Publication jobs for the same ref are serialized
to avoid losing an appended history entry. Manual dispatch creates an image
without a GitHub Release. A failed notes update after a push leaves a published
image with an incomplete release record; that is a failed publication stage.

Mirroring must copy that exact complete index through the reviewed image-mirror
pipeline to the existing ECR repository, then compare index/platform digests.
Do not create a registry/repository or use an ad-hoc operating mutation here.
An exact digest IaC/GitOps proposal in `buzz-k8s-resources` needs its own normal
CODEOWNER/CI and Edward, Hugo and Nonan reviews, current-head human decision,
and official Gitploy CLI path. This authentik packaging PR is not that approval.
Observe Argo/Pod convergence and the normal server/worker migration once that
change is authorized. Neither source merge nor digest publication proves it.

Activation is a separate reviewed blueprint/configuration change. Verify the
exact readback tuple above before testing a real self Google callback followed
by SAML-to-OIDC/Lussera acceptance. Do not infer another person's proof state
from an actor login or impersonation. Preserve existing identities and data;
real production-resource tests remain outside the current test authority.

Before deployment, record the actual previously deployed immutable custom
index/platform digests and configuration; these are not discovered by this PR.
For packaging-source rollback, revert only this stacked commit, preserving
PR #38/#39 and their evidence. For any later operating rollback, leave the
additive column/proof data intact: do not reverse 0009/drop a column. An old
image ignores this new opt-in field and can restore the legacy full-save
behaviour; it is not a safe P1 fallback by itself. Require a separately reviewed
fail-closed configuration/flow rollback and exact previous image digest through
the same normal GitOps/Gitploy path, with acceptance after convergence.

## Bounded execution decision packet (7493; not executed)

The three PR #40 comments were checked against head `52ec5560d`: JSON labels
and CLI logging can be improved within the standard library; the retry/release
mapping is a real mismatch. No Flask `jsonify` dependency is appropriate for this
standalone checker. The quoted organization path rules are reviewer-supplied;
they are not present in this checkout's AGENTS or a repository CodeRabbit file.
The changes above are local compatibility/observability fixes, not a claim that
ASCII JSON output was a vulnerability or that AI review is human approval.

Non-sensitive local observations on 2026-11-03, without a DB connection:

- Host architecture is arm64. PostgreSQL PID 1635 is owned by `luis.hong`, with
  data directory `/opt/homebrew/var/postgresql@18`, `PG_VERSION=18`, and the
  postmaster's existing startup options naming version 18.3. `lsof` observes
  only loopback listeners (`127.0.0.1`/`::1`:5432), no established TCP client
  at that snapshot. This does not prove the absence of Unix-socket clients,
  activity between observations, or an exclusive fixture lease.
- Earlier own native evidence names `test_authentik_identity_7307`. Its current
  existence, owner/exclusivity and migration state cannot be re-established
  from the permitted filesystem/process metadata. No PostgreSQL catalog/data
  files are inspected to infer those facts. Fresh fixture state is UNKNOWN.
- No Docker/Colima daemon was observed in the bounded process snapshot, and
  the three usual local sockets (`/var/run/docker.sock`,
  `~/.docker/run/docker.sock`, `~/.colima/default/docker.sock`) were not observed.
  This does not rule out another context or a remote engine. Engine availability
  and container-to-PG routing are NOT_QUALIFIED; no daemon/API/probe was started.
  `host.docker.internal` is not assumed to reach this loopback-only server.
  An expanded process-name-only snapshot also observes four existing
  `container-runtime-linux` workers from the desktop application's platform.
  Their ownership/isolation, Docker-recipe compatibility and PG route are not
  qualified. Preserve those workers; a qualified existing runtime would be
  preferable to installing/starting another engine, but this is not permission
  to inspect their container contents or change their lifecycle.
  Neither `container` nor `docker` was found on this shell's current PATH.

Separate the required evidence and approve only the next missing stage:

1. **Installed packaging, both architectures.** Native 45+17 at immutable PR #39
   remains source evidence and is not repeated. Each architecture still needs
   a real production image built at the approved packaging SHA and a read-only
   installed eleven-file hash result. The smallest DB-free packet is one
   production image and one Python-only container per native architecture,
   pinned-base downloads, and retained hash logs. There is no test derivative,
   PostgreSQL, custom Docker network, application login or publication in this
   stage. Use the [local-only image checks](#local-only-image-checks)
   once per separately approved native engine.

2. **Image-native flow, migration and serializer.** Eleven matching files do
   not prove Django startup/schema/flow behaviour. The existing local PG18
   option needs a fresh owner receipt for that exact existing idle fixture,
   an already qualified engine route using existing access, and an exclusive
   test window. Hosted runners cannot reach this machine's loopback address.
   Do not add a tunnel/listener, change pg_hba/access, create a missing fixture
   or install/start a local engine to make reuse work. `--keepdb` alone can
   create a missing DB, so it is not an existence guard. Reuse remains blocked
   until these facts exist; prior native evidence cannot authorize new writes.

   Once qualified and separately authorized, one test derivative of the native
   production image and one test container are sufficient for the P1-specific
   no-op case plus the ten conditional cases named in the manifest, using the
   exact existing fixture and `--keepdb`. For example, the test command tail is:

   ```sh
   test --keepdb \
     authentik/stages/user_write/tests.py::TestUserWriteStage::test_user_update_no_change \
     authentik/stages/user_write/test_email_verification.py
   ```

   Connection host/account remain the qualified existing values; the only
   allowed test DB name is `test_authentik_identity_7307`. Fixture setup must
   exercise the installed 0009 migration and serializer persistence, and
   retained JUnit must identify the source/image/platform/PG version. No
   production blueprint or stage is activated. A PG18 result leaves PG17.11
   image compatibility and the full local OAuth2/SAML suite unverified.

3. **Only if reuse is unavailable or PG17.11 image evidence is required:** the
   isolated fallback on an approved native amd64 Docker engine adds
   one new PG17.11 container, its synthetic `authentik` role and disposable
   base/native test databases, one private Docker network, and one regression
   container. These are explicitly new test resources. The local
   `--regression` command below uses the same synthetic settings and runs the
   full existing suite. It downloads the pinned base and test dependencies.

Stop on unexpected target/version, missing fixture lease, unavailable route,
missing/failed JUnit, nonmatching installed hash or any test failure. Keep those
states explicit; do not weaken an assertion to make the packet smaller. Retain
only synthetic test JUnit/hash logs and exact image/source/PG metadata for 14
days. Export reports before deleting only the named test containers/network;
remove only the qualification images on an exclusively owned engine, otherwise
leave cache cleanup to its owner. Reused PG data/server/account and the existing
fixture remain intact; allow only normal native test teardown inside the
reserved fixture, no server restart/drop/recreate. Source rollback is this
review-follow-up commit only. Operating rollback remains the separate
fail-closed contract above. None of these execution permissions is supplied by
this source review packet.

## Local-only image checks

The standalone hosted `artifact-only` entry has been removed. In
[run 41771723140](https://github.com/Buzzvil/authentik/actions/runs/41771723140),
the Buzzvil organization IP allow list blocked the branch-head API query on
both hosted runners before checkout. The standalone checks and the former
CI image regression suite have separate local commands.

For a separately approved check, use a clean checkout at the full reviewed
commit on an existing native Linux Docker engine or local Docker Desktop VM.
Supply the same reviewed SHA on both native hosts. Run each command only on
its matching architecture:

```sh
bash .buzzvil/verify-installed-local.sh "$APPROVED_SOURCE_SHA" linux/amd64
bash .buzzvil/verify-installed-local.sh "$APPROVED_SOURCE_SHA" linux/arm64
```

The helper uses the current local Unix-socket Docker context and its default
builder. It checks the native host, Docker server and built image platforms.
It verifies the reviewed source manifest, builds from the committed Git tree,
checks the OCI revision, and runs the existing verifier against the immutable
image ID. The verifier checks eleven installed files using Python in a
read-only, network-disabled container. The base is pulled from the pinned
image reference. Both native checks use the engine's own architecture.

Keep the successful output from each host. Both platforms must report the
same source SHA, manifest SHA256 and runtime payload SHA256. Local image IDs
are platform-specific. The summary is printed only after verification and
cleanup succeed. The helper removes its own image tag, container and temporary
source tree. Engine cache is handled by the engine owner.

### Isolated amd64 regression

With separate approval for the test image, package downloads, disposable
network, and PostgreSQL container and test databases, run the following on
the same reviewed SHA on native amd64. This mode already includes the amd64
installed check.

```sh
bash .buzzvil/verify-installed-local.sh "$APPROVED_SOURCE_SHA" linux/amd64 --regression
```

The helper builds the existing test derivative and checks its installed
test files and inherited helpers. It verifies the production image's
OS and certifi trust stores, certifi/uv versions, and CA package. It then
uses the existing `postgres:17.11-bookworm` fixture with synthetic credentials
and runs the complete OAuth2/SAML and UserWrite regression labels from
`Dockerfile.test`. The test container uses the disposable network and
its own PostgreSQL container.

Keep `unittest.xml` from the printed local report directory. The helper
exports it before cleaning its own containers, images and network, and
preserves a test failure's exit status. A missing report or failed cleanup
fails an otherwise successful run. Source CI and local image results
are separate evidence. Operating acceptance follows its own approval and
verification path.
