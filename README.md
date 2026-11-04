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

Players and DMs enter a table from the website's game hub ("My tables", or a
6-character invite code). The API signs a short-lived ticket and sends the
browser to the table app; the two apps also talk directly over a private
bridge. Set these on both apps:

- `VTT_BRIDGE_SECRET`: a random secret of at least 32 characters, the same in
  the API, the website and the table app. It signs launch tickets and every
  bridge call. Never commit it.
- `VTT_PUBLIC_URL` (API): the table app's address as the browser sees it. Use
  https in production; http is accepted only outside production.
- `VTT_INTERNAL_URL` (API and website): the table app's bridge address, used
  for invite codes, session status, table deletion and presence. It must be a
  loopback http origin with no path (`http://127.0.0.1:4200`,
  `http://localhost:4200` or `http://host.docker.internal:4200`). If it is
  unset, the bridge falls back to `http://127.0.0.1:4200`; the API logs a
  warning at startup when `VTT_PUBLIC_URL` is set without it, and joining by
  code answers `503 VTT_INTERNAL_URL_MISSING` when the bridge does not answer.

Local example (table app on port 4200):

```
VTT_BRIDGE_SECRET=<64 random hex characters>
VTT_PUBLIC_URL=http://localhost:4200/
VTT_INTERNAL_URL=http://127.0.0.1:4200
```

A local end-to-end check of the invite bridge is in `apps/api/dev/join-bridge-smoke.mjs`.
