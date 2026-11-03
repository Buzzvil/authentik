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

## Proposed normal image verification: execution not authorized by this PR

The existing `build-patched-ghcr` workflow remains the build/publish route.
A `fix/**` branch push or PR targeting the PR #39 branch does not select its
`VULN-688/**` push, tag or manual-dispatch triggers. Do not move this preparation
onto a triggered branch or dispatch it without the separate exact approval.

After review and approval of the concrete resource scope, the verify job would:

1. Check the manifest, build the amd64 production image, and build the test-only
   derivative. The latter installs the existing pinned test dependencies and
   copies the two UserWrite test files, in addition to existing OAuth2/SAML tests.
2. Use `--entrypoint python` and a read-only mount of `.buzzvil` to compare
   installed production and regression bytes against the same manifest. The
   regression check also verifies the three inherited core/flow test helpers.
3. Set up QEMU, build arm64 from the same Dockerfile, and verify its eleven
   installed hashes without starting authentik. This checks arm64 packaging,
   not arm64 native DB/flow execution. The existing CA/tool checks run on amd64.
4. Create the existing recipe's isolated Docker network and a new
   `postgres:17.11-bookworm` container with synthetic credentials, wait for
   readiness, and run the amd64 regression image. This includes existing full
   OAuth2/SAML suites, the upstream `test_user_update_no_change`, and all ten
   `test_email_verification.py` cases (with their subtests). They cover current
   profile/path/unrelated attributes, active/email/UUID drift, missing-row
   non-recreation, trusted/repeated/missing/unusable proof, forbidden prompt
   writes and serializer/configuration readback. Test collection/native fixture
   setup can create the disposable test database inside that new server.

The recipe therefore needs explicit permission for three local images, QEMU
registration (the pinned action's privileged binfmt helper on the hosted verify
runner, and again on the publishing runner), registry/package downloads, one disposable
network, one new PostgreSQL server/container and its native fixture DB, and
five short-lived application/check containers (plus the PG container). No
operating endpoint, account, credential, PVC or data volume is needed. The
existing EXIT trap removes only that run's PG container/network; application
containers use `--rm`; runner-local images disappear with the hosted runner.
Junit remains in the short-lived test container under the existing recipe, so
collecting/exporting it needs a reviewed artifact step before claiming a retained
image-test report. Any earlier step failure prevents publishing via `needs`.

Existing-infrastructure alternative: reuse the previously authorized local
PostgreSQL 18 server and exact `test_authentik_identity_7307` fixture, after its
owner confirms it still exists and is idle. Container-to-host reachability and
that fixture's isolation are not verified here. Do not create a missing DB,
account, forwarding tunnel or listener, broaden a network rule, or change a
shared service to make the alternative work. A proposed reuse run would need
an explicit preflight proving that exact fixture exists, `--keepdb`, and no
concurrent owner. It would qualify PG18 only; it cannot supply PG17.11 evidence.
The current CI recipe has not been switched to this unverified alternative.

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
The existing release step remains tag-triggered, and notes name the derived
image tag. Manual dispatch creates an image without a GitHub Release.

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
