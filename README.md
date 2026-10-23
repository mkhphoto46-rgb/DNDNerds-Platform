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

## Entering a table in the Web VTT

A DM's table launches into the DM's own Web VTT with a signed, single-use
ticket that lives 60 seconds.

1. Generate a key: `npm run launch-key --workspace apps/api` (or run
   `node dev/launch-key.mjs` in `apps/api`). Put the printed
   `PLATFORM_LAUNCH_PRIVATE_KEY` line in `apps/api/.env`; never commit it.
2. On `/play`, the DM registers the VTT's address (https, or http on localhost)
   and picks it for the table. The table page then shows the instance id and the
   Platform's public key.
3. On the VTT host computer, paste both into the D&D Nerds Platform settings on
   the start screen.
4. The DM enters first (that creates the campaign in the table's edition);
   players and the observer follow with "Enter the table".
