FROM node:22-bookworm-slim AS build

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps ./apps
COPY packages ./packages
COPY docs ./docs
COPY AGENTS.md README.md LICENSE .nvmrc tsconfig.base.json ./

RUN npm ci
RUN npm run build

FROM pgvector/pgvector:pg16-bookworm AS runtime

ENV NODE_ENV=production \
  HIVEMAP_API_HOST=0.0.0.0 \
  HIVEMAP_API_PORT=8787 \
  HIVEMAP_POSTGRES_DB=hivemap \
  HIVEMAP_POSTGRES_PORT=5432 \
  HIVEMAP_DATA_DIR=/var/lib/hivemap/postgres \
  HIVEMAP_WEB_DIST=/app/apps/web/dist

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends git \
  && rm -rf /var/lib/apt/lists/*

COPY --from=node:22-bookworm-slim /usr/local /usr/local
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps ./apps
COPY --from=build /app/packages ./packages
COPY docker/hivemap-entrypoint.sh /usr/local/bin/hivemap-entrypoint

RUN chmod +x /usr/local/bin/hivemap-entrypoint \
  && mkdir -p /var/lib/hivemap/postgres \
  && chown -R postgres:postgres /var/lib/hivemap

EXPOSE 8787
VOLUME ["/var/lib/hivemap/postgres"]

HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=5 CMD node --input-type=module -e "const response = await fetch('http://127.0.0.1:8787/workspaces'); if (!response.ok) process.exit(1);"

ENTRYPOINT ["hivemap-entrypoint"]
