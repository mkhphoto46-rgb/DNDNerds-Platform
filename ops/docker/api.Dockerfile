# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c AS build
WORKDIR /app
COPY apps/api/package.json apps/api/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY apps/api/tsconfig.json ./
COPY apps/api/src ./src
RUN npm run build && find dist -name '*.map' -delete

FROM node:24-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c AS dependencies
WORKDIR /app
COPY apps/api/package.json apps/api/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM node:24-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c AS runtime
ENV NODE_ENV=production API_HOST=0.0.0.0 API_PORT=4100 PROVIDER_CONFIG_FILE=/app/config/providers.json REFUND_EVIDENCE_ROOT=/app/data/refund-evidence
WORKDIR /app
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=dependencies --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node config/providers.json ./config/providers.json
COPY --chown=node:node apps/api/drizzle ./drizzle
RUN mkdir -p /app/data/refund-evidence && chown -R node:node /app/data
USER node
EXPOSE 4100
CMD ["node", "dist/server.js"]
