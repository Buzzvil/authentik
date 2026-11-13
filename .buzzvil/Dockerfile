# Overlay only the Buzzvil RelayState and OAuth2 security patches on the matching
# upstream release. Keep all other upstream code, dependencies and security fixes.
FROM ghcr.io/goauthentik/server:2026.8.5@sha256:602227a86455d6772e3d16b7d852713c4f864f40df5df894abd1285bb53979a5

ARG SOURCE_REVISION
LABEL org.opencontainers.image.source="https://github.com/Buzzvil/authentik" \
      org.opencontainers.image.version="2026.8.5-cors-relaystate" \
      org.opencontainers.image.revision="${SOURCE_REVISION}"

COPY --chown=authentik:authentik authentik/providers/saml/processors/authn_request_parser.py /authentik/providers/saml/processors/authn_request_parser.py
COPY --chown=authentik:authentik authentik/providers/saml/views/sso.py /authentik/providers/saml/views/sso.py
COPY --chown=authentik:authentik authentik/providers/oauth2/utils.py /authentik/providers/oauth2/utils.py
COPY --chown=authentik:authentik authentik/providers/oauth2/token/device_code.py /authentik/providers/oauth2/token/device_code.py
COPY --chown=authentik:authentik authentik/providers/oauth2/views/token.py /authentik/providers/oauth2/views/token.py
COPY --chown=authentik:authentik authentik/providers/oauth2/views/device_backchannel.py /authentik/providers/oauth2/views/device_backchannel.py
COPY --chown=authentik:authentik authentik/providers/oauth2/views/userinfo.py /authentik/providers/oauth2/views/userinfo.py
COPY --chown=authentik:authentik authentik/providers/oauth2/views/provider.py /authentik/providers/oauth2/views/provider.py
