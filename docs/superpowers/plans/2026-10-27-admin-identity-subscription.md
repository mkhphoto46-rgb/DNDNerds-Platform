# Admin, Verification, and Subscription Implementation Plan

## Release 1: dashboard and manual access

1. Add persisted game entitlement periods, owner adjustments, legacy exemption records, and plan settings with additive migrations. Keep the enforcement flag off.
2. Add owner-only, reauthenticated grant, extend, revoke, legacy-exemption, and price APIs with audit logs. Include account search and per-account entitlement history.
3. Add mobile-first admin overview, account cards, subscription controls, and read-only system health. Verify in narrow and desktop viewports.
4. Publish the 599,000 toman / 30 day pricing page with checkout marked unavailable while gateway credentials are absent.
5. Deploy migrations and app code, smoke test the live domain, and leave game access unchanged.

## Release 2: contact verification

1. Migrate email to optional; add normalized phone and exactly-one-contact registration flow without invalidating existing accounts.
2. Wire email delivery and SMS provider adapters, rate limits, token expiry, and password recovery. Expose only configured methods.
3. Run end-to-end delivery tests before requiring verified contact.

## Release 3: paid access

1. Add gateway checkout, verified callbacks, idempotent payment periods, refunds, and manual renewal.
2. Enforce entitlements at site launch and inside VTT for direct sessions, retaining recorded legacy exemptions until each owner decision.
3. Test paid, failed, duplicate, refund, expiry, and revocation paths, including active VTT disconnect within 60 seconds.
4. Activate the independent paid gate only after real checkout and verification work in production.

## Deployment gates

- Do not turn on email, SMS, or checkout without the corresponding real provider credentials and delivery/transaction verification.
- Do not enable the paid gate on new users until checkout and recovery are operational. Existing users keep access until the owner individually changes it.
- Never use a site-only paywall that direct VTT access can bypass.
