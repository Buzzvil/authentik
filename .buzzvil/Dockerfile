# Buzzvil patched authentik image (overlay on the official server image).
#
# Replaces two SAML provider files so that IdP-initiated SSO forwards the
# SP-supplied RelayState (AWS WorkSpaces appends a per-session state code via
# ?RelayState= to the init URL) instead of only using the static
# default_relay_state. Without this, the WorkSpaces native client loops back to
# sign-in because euc-sso cannot bind the auth code to the client session.
#
# Patch source of truth: this repo's authentik/ tree (see PR #1). File paths below
# match the official image layout (/authentik/...).
FROM ghcr.io/goauthentik/server:2026.2.1

COPY --chown=authentik:authentik authentik/providers/saml/processors/authn_request_parser.py /authentik/providers/saml/processors/authn_request_parser.py
COPY --chown=authentik:authentik authentik/providers/saml/views/sso.py /authentik/providers/saml/views/sso.py
