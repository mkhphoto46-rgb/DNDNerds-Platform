DND NERDS - PRODUCTION DEPLOYMENT BUNDLE

This folder contains templates only. Nothing here activates live payment,
payout, SMTP, DNS, TLS, or public networking by itself.

Required external values before production:
1. __APP_DOMAIN__
2. __API_DOMAIN__
3. Linux deployment user
4. Production filesystem root
5. Node binary path
6. Web start command/path
7. TLS certificate paths
8. Real payout provider key/configuration
9. ZarinPal live credentials
10. SMTP credentials

Recommended topology:
Internet
  -> HTTPS reverse proxy
     -> __APP_DOMAIN__ -> 127.0.0.1:3100 (Next.js web)
     -> __API_DOMAIN__ -> 127.0.0.1:4100 (Fastify API)
        -> PostgreSQL
        -> Redis
        -> finance reconciliation worker

The API and web application should not be bound directly to public interfaces.
Use the reverse proxy as the only public HTTP(S) edge.

Do not copy production secret environment files into the project backup folder.
