# Overlay only the Buzzvil RelayState and OAuth2 CORS patches on the matching
# upstream release. Keep all other upstream code, dependencies and security fixes.
FROM ghcr.io/goauthentik/server:2026.8.3@sha256:ab9b4e8cc4ab3f8d1198d2db6aeea66bafea1963b3f2843589e0d163f97d9849

ARG SOURCE_REVISION
LABEL org.opencontainers.image.source="https://github.com/Buzzvil/authentik" \
      org.opencontainers.image.version="2026.8.3-cors-relaystate" \
      org.opencontainers.image.revision="${SOURCE_REVISION}"

COPY --chown=authentik:authentik authentik/providers/saml/processors/authn_request_parser.py /authentik/providers/saml/processors/authn_request_parser.py
COPY --chown=authentik:authentik authentik/providers/saml/views/sso.py /authentik/providers/saml/views/sso.py
COPY --chown=authentik:authentik authentik/providers/oauth2/utils.py /authentik/providers/oauth2/utils.py
COPY --chown=authentik:authentik authentik/providers/oauth2/views/token.py /authentik/providers/oauth2/views/token.py
COPY --chown=authentik:authentik authentik/providers/oauth2/views/userinfo.py /authentik/providers/oauth2/views/userinfo.py
COPY --chown=authentik:authentik authentik/providers/oauth2/views/provider.py /authentik/providers/oauth2/views/provider.py
