# Buzzvil Authentik 2026.8.3

This overlay preserves two integrations used by Buzzvil:

- AWS WorkSpaces IdP-initiated SAML passes the request's `RelayState` through to
  the response. An absent or empty value falls back to the provider default.
- OAuth2 token, userinfo and discovery endpoints honour each redirect URI's
  matching mode when checking the CORS Origin. Regex entries use `re.fullmatch`;
  malformed expressions are skipped. Strict matching and OPTIONS behaviour are
  unchanged. A regex requiring a callback path does not match a bare Origin;
  configure an optional path or a separate allowed origin where necessary.

The source is based on upstream `version/2026.8.3`, commit
`e5a0d2f7572cb776eee7a3e9355937ce38973761`. The production Dockerfile pins the
official multi-platform image index and replaces only six patched Python files.
The remaining upstream code, dependencies and security fixes are retained.
These patches are carried forward from `2026.5.7-cors-relaystate`.

## Build and publish

The `build-patched-ghcr` workflow in `.github/workflows/build-patched-ecr.yaml`
builds both `linux/amd64` and `linux/arm64`. Dispatch it from the intended source
commit's branch with `image_tag=2026.8.3-cors-relaystate`. The OCI revision label
records the source commit. A tag-triggered run also attempts to create a GitHub
Release; dispatch builds only the image.

After validation, copy the complete GHCR index to:

```text
591756927972.dkr.ecr.ap-northeast-1.amazonaws.com/ghcr.io/buzzvil/authentik:2026.8.3-cors-relaystate
```

The `ghcr.io` ECR pull-through cache rule was removed. Use the external-image
mirror workflow or `docker buildx imagetools create` with the source pinned by
digest. Verify the destination index digest and both platform manifest digests.

## Regression tests

Build `.buzzvil/Dockerfile` as `authentik-buzzvil:2026.8.3-test`, then build
`.buzzvil/Dockerfile.test` as `authentik-buzzvil:2026.8.3-regression`. The latter
adds test dependencies only; it must not be published as the production image.

Run the regression image on an isolated container network with PostgreSQL 17.10,
passing `AUTHENTIK_POSTGRESQL__HOST`, `AUTHENTIK_POSTGRESQL__NAME`,
`AUTHENTIK_POSTGRESQL__USER`, `AUTHENTIK_POSTGRESQL__PASSWORD` and a synthetic
`AUTHENTIK_SECRET_KEY`. Its default command runs both complete OAuth2 and SAML
provider test directories. Set `PYTEST_ADDOPTS` to
`--junitxml=/tmp/unittest.xml -o cache_dir=/tmp/pytest-cache` for writable reports.

Before rollout, also validate the `2026.5.7 -> 2026.8.3` database upgrade with a
separate copy of the production backup. Production backup, migration checks,
and authentication smoke tests remain part of the deployment runbook in
`buzz-k8s-resources`.
