# DND Nerds — Production Readiness Contract

## Enforced now

- PostgreSQL is the system of record.
- Redis is required for shared authentication/mutation rate limiting.
- TOTP secrets are encrypted at rest with AES-256-GCM.
- Passwords use Argon2id.
- Password reset revokes all existing sessions.
- Session/device records can be reviewed and revoked by the user.
- State-changing browser BFF requests are protected by same-origin CSRF checks.
- Security headers are applied by both Next.js and Fastify.
- Seller payouts reserve available balance before review.
- Provider payout execution is idempotent.
- Payout ledger postings remain double-entry balanced.
- Production startup guards reject development email and mock payout providers.

## Required before public production launch

1. Replace `EMAIL_PROVIDER=development` with a real transactional-email adapter.
2. Replace `PAYOUT_PROVIDER=mock` with the selected Iranian payout/bank provider adapter.
3. Put Next.js/API behind the final HTTPS reverse proxy/domain.
4. Keep PostgreSQL (54329) and Redis (6380) bound to localhost/private network only.
5. Back up PostgreSQL and Redis data outside the live machine.
6. Configure secret rotation for MFA encryption, payment webhook secrets, and provider keys.
7. Add centralized logs/alerts and off-host monitoring.
8. Run full load tests and restore-from-backup drills before launch.
9. Run dependency/security scanning; do not blindly use `npm audit fix --force`.
10. Use multiple API instances only with the shared Redis limiter enabled.

## Local development providers

- Email: `development` — tokens are written to `logs/email-outbox.log`.
- Payout: `mock` — deterministic provider references for acceptance tests only.

These development providers are intentionally rejected when `NODE_ENV=production`.