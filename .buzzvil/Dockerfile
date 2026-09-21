# Overlay only the Buzzvil RelayState and OAuth2 CORS patches on the matching
# upstream release. Keep all other upstream code, dependencies and security fixes.
FROM ghcr.io/goauthentik/server:2026.5.7@sha256:76bf433fd434c067cb25dc3e197cee793998441cda912441ea275293e76cc32c

ARG SOURCE_REVISION
LABEL org.opencontainers.image.source="https://github.com/Buzzvil/authentik" \
      org.opencontainers.image.version="2026.5.7-cors-relaystate" \
      org.opencontainers.image.revision="${SOURCE_REVISION}"

COPY --chown=authentik:authentik authentik/providers/saml/processors/authn_request_parser.py /authentik/providers/saml/processors/authn_request_parser.py
COPY --chown=authentik:authentik authentik/providers/saml/views/sso.py /authentik/providers/saml/views/sso.py
COPY --chown=authentik:authentik authentik/providers/oauth2/utils.py /authentik/providers/oauth2/utils.py
COPY --chown=authentik:authentik authentik/providers/oauth2/views/token.py /authentik/providers/oauth2/views/token.py
COPY --chown=authentik:authentik authentik/providers/oauth2/views/userinfo.py /authentik/providers/oauth2/views/userinfo.py
COPY --chown=authentik:authentik authentik/providers/oauth2/views/provider.py /authentik/providers/oauth2/views/provider.py
