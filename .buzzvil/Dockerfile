# Buzzvil patched authentik image (overlay on the official server image).
#
# Overlays Buzzvil fork patches by replacing Python files in place. Paths below
# match the official image layout (/authentik/...); patch source of truth is this
# repo's authentik/ tree.
#
#   1) SAML RelayState (PR #1): IdP-initiated SSO forwards the SP-supplied
#      RelayState (AWS WorkSpaces appends a per-session state code via
#      ?RelayState= to the init URL) instead of only using the static
#      default_relay_state. Without this the WorkSpaces native client loops back
#      to sign-in because euc-sso cannot bind the auth code to the client session.
#   2) OAuth2 CORS regex (PR #2): cors_allow honours each redirect URI's
#      matching_mode so REGEX-mode redirect URIs are matched against the request
#      Origin (backport of goauthentik/authentik#22179). utils.py carries the fix;
#      the three view files must be overlaid together because their cors_allow()
#      calls now pass RedirectURI objects to the patched signature.
FROM ghcr.io/goauthentik/server:2026.2.1

COPY --chown=authentik:authentik authentik/providers/saml/processors/authn_request_parser.py /authentik/providers/saml/processors/authn_request_parser.py
COPY --chown=authentik:authentik authentik/providers/saml/views/sso.py /authentik/providers/saml/views/sso.py
COPY --chown=authentik:authentik authentik/providers/oauth2/utils.py /authentik/providers/oauth2/utils.py
COPY --chown=authentik:authentik authentik/providers/oauth2/views/token.py /authentik/providers/oauth2/views/token.py
COPY --chown=authentik:authentik authentik/providers/oauth2/views/userinfo.py /authentik/providers/oauth2/views/userinfo.py
COPY --chown=authentik:authentik authentik/providers/oauth2/views/provider.py /authentik/providers/oauth2/views/provider.py
