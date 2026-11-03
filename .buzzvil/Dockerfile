# Overlay the Buzzvil RelayState, OAuth2 CORS and conditional UserWrite patches.
# Keep the matching upstream release, dependencies and security fixes.
FROM ghcr.io/goauthentik/server:2026.8.5@sha256:602227a86455d6772e3d16b7d852713c4f864f40df5df894abd1285bb53979a5

ARG SOURCE_REVISION
ARG IMAGE_VERSION=2026.8.5-cors-relaystate-p1-unpublished
LABEL org.opencontainers.image.source="https://github.com/Buzzvil/authentik" \
      org.opencontainers.image.version="${IMAGE_VERSION}" \
      org.opencontainers.image.revision="${SOURCE_REVISION}"

COPY --chown=authentik:authentik authentik/providers/saml/processors/authn_request_parser.py /authentik/providers/saml/processors/authn_request_parser.py
COPY --chown=authentik:authentik authentik/providers/saml/views/sso.py /authentik/providers/saml/views/sso.py
COPY --chown=authentik:authentik authentik/providers/oauth2/utils.py /authentik/providers/oauth2/utils.py
COPY --chown=authentik:authentik authentik/providers/oauth2/views/token.py /authentik/providers/oauth2/views/token.py
COPY --chown=authentik:authentik authentik/providers/oauth2/views/userinfo.py /authentik/providers/oauth2/views/userinfo.py
COPY --chown=authentik:authentik authentik/providers/oauth2/views/provider.py /authentik/providers/oauth2/views/provider.py

# Copy the model, serializer, implementation and additive migration together.
# The inherited ak entrypoint retains the normal migration lifecycle.
COPY --chown=authentik:authentik authentik/stages/user_write/stage.py /authentik/stages/user_write/stage.py
COPY --chown=authentik:authentik authentik/stages/user_write/models.py /authentik/stages/user_write/models.py
COPY --chown=authentik:authentik authentik/stages/user_write/api.py /authentik/stages/user_write/api.py
COPY --chown=authentik:authentik authentik/stages/user_write/migrations/0009_userwritestage_email_verification_attribute.py /authentik/stages/user_write/migrations/0009_userwritestage_email_verification_attribute.py
# Editor schema; the blueprint importer itself uses the model's serializer.
COPY --chown=authentik:authentik blueprints/schema.json /blueprints/schema.json
