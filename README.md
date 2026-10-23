# DND Nerds Platform

Website (`apps/web`, Next.js on port 3100) and API (`apps/api`, Fastify on port 4100) with PostgreSQL and Redis. Production notes: `DEPLOYMENT_TOPOLOGY.md`, `PRODUCTION_READINESS.md`, `PRODUCTION_PROVIDER_SETUP.md`.

## Local development

Requirements: Node 24 and npm 11. No Docker is needed.

1. Install: `npm ci` at the repository root, then `npm ci` in `apps/api`.
2. Start PostgreSQL and Redis from `apps/api`: `npm run dev:stack`.
   - PostgreSQL 18 comes from the `embedded-postgres` package; its data stays in `apps/api/.data`.
   - Redis can be any Redis-compatible server. Set `REDIS_URL` to one that is running, or `GARNET_SERVER_PATH` to a [Microsoft Garnet](https://github.com/microsoft/garnet) `GarnetServer` executable, which the script starts.
   - The first run writes `apps/api/.env` from `.env.example`, with generated development keys.
3. Start the API from `apps/api` with `npm run dev`, and the website from the root with `npm run dev:web`. Copy `apps/web/.env.example` to `apps/web/.env.local` first.

With Docker instead: `infra/docker-compose.yml` starts PostgreSQL and Redis. It needs `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_PORT`, and keeps data in `DND_NERDS_DATA_DIR` (default `.data` at the repository root).

Development email goes to `logs/email-outbox.log`; payments and payouts use mock providers. Production startup rejects these development providers.
