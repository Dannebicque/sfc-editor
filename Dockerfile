# Image unique : serveur (API, WebSocket) + éditeur construit. Voir docs/deploiement.md.
FROM node:24-slim AS build
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
# Comptes et co-édition activés dans l'éditeur ; même origine que l'API (reverse proxy).
ARG VITE_SHARE_URL=
ENV VITE_ACCOUNTS=1 VITE_SHARE_URL=$VITE_SHARE_URL
RUN pnpm --filter ./apps/web build

FROM node:24-slim
RUN corepack enable && useradd --system --create-home --uid 10001 app
WORKDIR /app
COPY --from=build --chown=app /app /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787 DATA_DIR=/data TRUST_PROXY=1 STATIC_DIR=/app/apps/web/dist
RUN mkdir /data && chown app /data
USER app
VOLUME /data
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:8787/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["pnpm", "--filter", "@grafcet/server", "start"]
