# Mobile Admin, Verification, and Game Subscription Design

## Intent

Give the owner one mobile-friendly place to manage site accounts, game tables, subscriptions, payments, and basic VPS health. Require each player and DM to hold a current 30-day game subscription once paid access is launched. Let the owner grant, extend, or revoke access by account email at any time. Let a registrant choose email or SMS verification once both delivery services exist; exactly one verified contact route is required.

## Current system and constraints

- The live site and VTT run on the VPS at `https://dndnerds.ir/` and `https://dndnerds.ir/vtt/`. The site uses PostgreSQL; VTT keeps its own SQLite accounts and campaign data and links site identities through launch tickets.
- `/admin`, `/admin/accounts`, and `/admin/game-hub` already manage marketplace, site accounts, and some tables/content. Admin changes reauthenticate and write audit records. Extend these routes and roles rather than replace accounts.
- The current registration form and `users.email` require email. Email verification code exists, but no production email provider is configured. There is no SMS provider.
- `/pricing` is a placeholder. Existing payment code serves marketplace orders and has a ZarinPal adapter; no real gateway credentials are configured. `FREE_LAUNCH_MODE=true` is active and also affects marketplace readiness, so game subscription enforcement needs its own flag.
- LiveKit and VTT share an 8 GiB VPS. The target of 200–300 paying members is a commercial scenario, not a tested concurrent-user capacity claim.

## Decisions from the owner

- Extend the existing admin site. It must be usable on a phone without horizontal scrolling for primary tasks.
- Every game user pays for their own subscription, including the DM. Public site browsing and registration remain available without one.
- Initial price: **599,000 toman / 30 days** per account (5,990,000 rial in payment records). The owner can change the price for future purchases; existing receipts retain the paid amount.
- Renewal is an explicit user payment, not an automatic card charge. If paid before expiry, the next 30 days start at the current expiry; otherwise they start when payment succeeds.
- The owner can grant access through a chosen end date/time, extend it, and revoke it immediately. Every manual change requires reason and reauthentication and is audited.
- Only the owner role (`SUPER_ADMIN`) can grant, extend, revoke, edit the plan price, or use the paid-access exemption. Other admin roles may view only data their existing role permits.
- Email verification is sufficient; Google sign-in is out of scope. Users eventually choose email or SMS. No email, SMS, or payment provider is available yet, so delivery and checkout cannot be declared live until their credentials and end-to-end tests exist.
- Existing game accounts are not changed automatically. When the paid gate starts, each existing account retains its current game access under a recorded legacy exemption until the owner individually grants a timed subscription or removes that exemption. The dashboard lists these accounts for individual decisions; no bulk expiry, grace period, or automatic conversion runs.

## Approaches considered

1. **Extend the current admin and identity system (chosen).** Preserve account IDs, marketplace payments, and VTT links. Add separate game entitlements, a subscription checkout, admin tabs, and an internal VTT management API. Lowest migration risk and fastest route to a usable mobile panel.
2. Replace the site admin/auth and VTT account management with one new application. One surface in theory, but it would require migrating live account and campaign data and revisiting permissions across the game.
3. Put auth, billing, and admin in an external service. It would reduce some code but introduce account migration, monthly dependency costs, and an extra boundary around local game data.

## Product behavior

### Mobile admin

- `/admin` becomes an overview with counts for new/active/suspended/unverified accounts, active/expiring subscriptions, paid and failed renewals, published/active tables, and service health.
- `/admin/accounts` keeps search, filtering, roles, suspension, and audit. A detail view shows verified contact methods, premium status, payment history, and manual entitlement actions. Search accepts email, phone, username, or public account ID. The primary task layout becomes stacked cards and large touch targets on narrow screens.
- `/admin/game-hub` adds linked VTT campaign/member counts and bounded, read-only operational summaries via an authenticated internal VTT API; table moderation remains role-gated. Campaign contents are not exposed by default.
- `/admin/subscriptions` shows plan price, payment/entitlement history, expiring accounts, and manual grants. An admin can enter an email for an existing account or a pending grant. Pending grants attach only after that exact email is verified by its eventual owner. Phone-only accounts can be selected by account ID or verified phone.
- `/admin/system` shows read-only CPU, memory, disk, uptime, and web/API/VTT/LiveKit health with bounded recent errors. Root shell access and arbitrary service control stay outside the public site admin; the owner uses a separate secured server console for deep maintenance.

### Identity and verification

- Migrate `users.email` to nullable; add normalized unique phone and `phoneVerified`. A database constraint requires at least one contact value. Existing users and sessions remain valid.
- Registration offers email or phone. The selected method requires verification before game access or payment. One method is sufficient; the other may be added later. Password recovery follows the verified method.
- Email uses the existing token flow with a production SMTP or transactional provider. SMS uses a provider adapter with short-lived hashed codes, limited attempts, resend throttling, and no account enumeration.
- Production offers only configured delivery methods. Since neither is configured today, the current registration path remains available during the build, and the new verification requirement is switched on only after at least one real delivery path is proven. The full email/SMS choice appears only when both are configured.

### Subscription and checkout

- Store a versioned 30-day plan, payment attempts, entitlement periods, and append-only admin adjustments in PostgreSQL. Price is stored in rial and snapshotted per attempt. Success is recorded only after server-side gateway verification; callbacks are idempotent and cannot grant twice.
- An early paid renewal starts at the later of payment time and the end of the latest valid paid period. Manual grants are separate periods: they neither consume nor extend purchased days. Access is active when at least one valid paid or manual period covers the current time.
- The public `/pricing` page explains the 599,000 toman price, the 30-day period, manual renewal, current expiry, and what game access includes. A signed-in user can purchase or renew once a real gateway is configured. Without a gateway, purchase controls remain unavailable and clearly say why.
- Admin grants can be made without payment. Revocation supersedes both paid and manual access from the time it is issued; reactivation requires a new grant or verified payment. The history remains visible.
- A refund or chargeback voids the access period created by that specific purchase and preserves unrelated paid periods and manual grants. Reconciliation records the gateway event and never deletes the original payment or audit history.
- A separate `GAME_SUBSCRIPTIONS_ENFORCED` rollout switch is initially off. Do not turn it on until a real email path and payment gateway work in production, a test purchase and renewal pass, and existing accounts have an announced transition path. This switch does not alter marketplace `FREE_LAUNCH_MODE`.
- The legacy-exemption population is a snapshot of game accounts that existed before enforcement activation. New accounts cannot receive that exemption implicitly. Only the owner may remove an existing account's exemption; doing so is reauthenticated and audited. A grant to a legacy account does not silently remove its exemption.
- Enforce entitlement at the site table-launch API and inside VTT for direct login/API/socket paths, with short-lived internal checks or signed entitlement assertions. Revocation must stop new launches immediately and disconnect active game access within 60 seconds. Expiry also disconnects active access within 60 seconds. The owner exemption is explicit and audited.

## Delivery sequence

1. Mobile admin overview, account/game summaries, read-only server health, and audited manual entitlement management. Deploy with game access unchanged.
2. Email verification production wiring after the owner provides a sender and provider credentials; migrate identity model and implement SMS adapter while keeping SMS unavailable until credentials exist.
3. Subscription checkout and pricing after the owner obtains a gateway. Verify successful, failed, duplicate, and delayed callbacks; then enable the paid game gate as a deliberate release step.

## Acceptance and risks

- Existing accounts, campaigns, marketplace orders, and sessions survive migrations. A manual grant by email cannot be claimed by another user or an unverified address.
- Existing game users retain access until the owner explicitly changes their access in the dashboard, even after the gate is enabled for new users.
- Paid and manual access have one effective entitlement calculation; expiration, early renewal, payment retries, refunds, admin revocation, and concurrent sessions have deterministic outcomes.
- Direct `/vtt/` access cannot bypass the paid gate after enforcement. Browser UI hides controls appropriately, but the server remains the authority.
- An admin can complete account search, grant, revoke, price edit, and system-health review on a narrow phone viewport. Destructive actions require reauthentication and a recorded reason.
- The 599,000 toman price is an initial product decision, not a revenue guarantee. At the current approximate 6.8 million toman VPS-plus-ChatGPT-Plus fixed-cost assumption, roughly 12 paid users cover that subtotal before payment fees, SMS/email, support, taxes, and development. A per-player price this high may reduce adoption relative to free-to-join VTT alternatives, so conversion and renewals must be observed before scaling assumptions are trusted.
