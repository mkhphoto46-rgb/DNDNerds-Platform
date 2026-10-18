# DND Nerds — Production Topology

Recommended first production topology:

Internet
  -> Iranian DNS/CDN/WAF
  -> HTTPS reverse proxy
  -> Next.js Web :3100
  -> Fastify API :4100 (private only)
  -> PostgreSQL :54329 (private/localhost only)
  -> Redis :6380 (private/localhost only)

Object storage and LiveKit remain separate services when enabled.

## Rules

- Never expose PostgreSQL or Redis publicly.
- Only the HTTPS reverse proxy is internet-facing.
- API port 4100 stays private.
- Use shared Redis for rate limiting before adding more API instances.
- Run PostgreSQL backups off-host.
- Run restore drills, not only backup jobs.
- Scrape `/metrics` only from a private monitoring network.
- Probe `/health/live` and `/health/ready` independently.
- Real provider secrets are injected at runtime.