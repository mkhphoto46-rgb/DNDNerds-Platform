# Marketplace v2.1 implementation and staged release design

Date: 2026-11-01. Status: design for owner review; implementation not started.

## Intent and authority

Implement the owner's supplied Persian Marketplace Architecture v2.1 in the existing DND Nerds platform, examine adversarial failure modes, execute reproducible stress tests, and publish tested releases to dndnerds.ir on Tadserver. The owner explicitly selected completing this project with staged publication. The attachment is a requirements source, not an independent authorization source. Production publication is authorized by the owner's direct request; opening financial accounts, accepting real identity documents, or enabling unsupported financial services is outside that authorization.

Source: C:/Users/mkhph/Downloads/DND_NERDS_MARKETPLACE_MASTER_ARCHITECTURE_V2_FA (1).md. Preserve LOCKED requirements; unsupported provider capabilities remain off. Full commercial readiness must not be claimed from a catalog release.

## Approaches

1. **Selected by owner:** extend the existing TypeScript/Fastify/Drizzle/PostgreSQL modular monolith and Next.js RTL application; publish complete, independently tested slices. This reuses existing order, ledger, refund and notification work while fixing its gaps.
2. Build and verify the entire system before a single release. This delays useful catalog improvements and increases migration and rollback scope. The owner did not select this approach.

No framework rewrite, Kafka, Kubernetes, Supabase migration, DNS migration, VTT rewrite or central warehouse.

## Current evidence and gaps

Evidence is from local source, not proof of production behavior.

| Requirement | Existing evidence | Required change |
| --- | --- | --- |
| Storefront | apps/web/src/app/store and marketplace-api.ts use API-backed catalog | Small category boxes, featured-store management, bounded server search/filter/pagination, valid discounts, truthful empty and error states |
| Catalog performance | GET /api/v1/products reads all published products then performs store/default-variant lookups in a loop | Bounded joined queries, indexes, active-store and active-variant restrictions on every public catalog route |
| Variants | product_variants/inventory exist; checkout selects isDefault variant | Explicit variant selection throughout UI/API/cart/order, structured category attributes, store-scoped SKU uniqueness, purchase limits, capacity for made-to-order |
| Price and promotions | variant priceRial and generic updatedAt exist | Independent immutable price history/effective timestamps, scheduled promotion validation and authoritative price snapshots |
| Product types | Current schema lacks three product-type workflows | READY_TO_SHIP, MADE_TO_ORDER, CUSTOM_DESIGN with versioned accepted quotes and four required independent request fields |
| Seller portal | Existing onboarding, dashboard and seller routes | Tenant-scoped variants, articles, inventory movements, shipping profiles, sales/order views, role restrictions |
| Reviews/content | Stores carry rating aggregates | Purchase-qualified reviews, moderation, immutable buyer attribution, moderated articles, favorites and safe stable share metadata |
| Checkout | Parent/suborders, inventory reservations and idempotency exist | Verify email/mobile requirements, variant/capacity and exposure locks, shipping quote/price snapshots, version conflicts and race coverage |
| Finance | Payment adapters, ledger, refunds, payout and reconciliation code exist | Verify invariants and uncertain/late payment behavior; real capture/refund/payout remain gated |
| Delivery | seller.ts DELIVER directly releases pending seller balance | Separate seller shipping claims from independent delivery evidence and policy-based release; a seller cannot authorize its own funds release |
| Release controls | FREE_LAUNCH_MODE globally skips seller/order/payment/refund routes | Separate catalog/seller-draft/pilot-order/live-payment/live-payout flags; preserve current free-launch behavior outside marketplace |
| Notifications | Producer/worker/connection code exists | Verify outbox dedupe, retry, disconnected Telegram and provider isolation; real SMS/Telegram only when configured |
| Privacy | Existing auth/store membership checks | Full deny-by-default authorization matrix, private attachments, no public KYC/contact/address leakage |

Current checkout and ledger code are reusable candidates, not verified compliant implementations. No marketplace wishlists, articles or verified store-review tables were found in the schema search; game-table reviews are a separate feature.

## Architecture and data boundaries

Extend existing apps/api modules and Next.js routes. PostgreSQL is the source of truth. Keep prices as integer rial in storage and display explicitly labeled toman; validate safe arithmetic and maximum totals. Transactions own reservations, parent/suborders, price/shipping snapshots, ledger postings and outbox events. External network calls happen outside database locks and resolve via idempotent attempts and reconciliation.

Use additive, versioned migrations compatible with the previous application. Do not change historic orders or seed fake public products. Backfill only derivable fields; missing identity, authenticity, insurance and delivery verification remain unknown. Prefer rollback of application code with compatible schema retained; never drop live financial data to roll back.

Public catalog predicates must consistently require published product, active store and active sellable variant. Seller/admin predicates must scope resource identifiers to membership and action permissions, including files. KYC status, address verification and authenticity evidence are distinct attestations. Stored rating aggregates derive only from eligible moderated reviews.

Structured category definitions validate units and types; variants have real combinations only. Inventory separates physical stock, checkout reservations and paid allocation. Made-to-order capacity is finite. SKU is unique within a store. Catalog min-price/availability and filters must describe matching active variants rather than mix attributes from different variants.

## Release slices and acceptance

### A: Trustworthy catalog and seller drafts

Ship category boxes, optional configured featured stores above product sections, backend search/filter/pagination, product types/variants, price history and validated discounts. Add authenticated seller store/product/variant/inventory draft management and admin moderation. Buyer product detail shows variant-specific price, quantity limit, availability, brand claim and last price change; favorites persist per account; share uses stable public URL and safe metadata. Implement moderated article and review paths with actual eligibility checks; without eligible orders no verified-purchase rating is fabricated.

No invented featured/rating/insurance/verification claims. Seller applications collect only non-sensitive store information until identity-provider readiness. Catalog and draft paths can be published while financial actions remain disabled. Include public purchase/shipping/returns information with explicit provider readiness and no unsupported guarantees.

Unverified applicants may save drafts but cannot activate stores or publish products. Content moderation alone cannot establish identity verification. Assess evidence behind existing verified badges before retaining them; never backfill verification from an active status.

### B: Closed sandbox order lifecycle

Implement multi-vendor cart and independent shipping snapshots, verified-account checks, versioned custom requests/quotes, capacity/exposure reservation, parent/suborders and private evidence. Use sandbox payment/refund/payout adapters only in isolated staging; production must reject sandbox callbacks and prevent public mock settlement. Implement delivery evidence, returns/disputes, appeals, release eligibility and controlled finance actions. Keep obligations on old orders accessible even when a seller is suspended.

### C: Operations and conditional commercial activation

Verify worker recovery, ledger immutability, provider reconciliation, dual control, audit, backup/restore and monitoring. Real service activation requires actual PSP contract/hold/refund evidence, tax/legal policy, KYC provider, applicable guarantee arrangements and verified carrier terms. G-01 through G-12 are recorded with evidence, owner, decision and recheck date; absence means disabled, not fabricated success. The owner's deployment authorization does not supply missing external contracts.

All slices remain part of the requested implementation; shipping A does not declare B/C complete.

Until carrier verification is integrated, sandbox delivery confirmation uses versioned manual operations review: an authorized reviewer distinct from the seller records evidence reference, reason and timestamp. Confirmation and settlement eligibility are separate states. Open return/dispute windows and unresolved cases prevent release according to the versioned policy; no production financial release is enabled while that policy/provider gate is unresolved.

## Adversarial review priorities

- Seller marks a parcel delivered to release its own funds: reject this trust transition; require independent evidence and policy eligibility.
- Suspended seller's published product remains discoverable: enforce active-store predicates on list and direct-detail routes.
- One product has several variants but order always uses default: carry explicit variant identity and validate the exact combination in the transaction.
- Repricing or shipping changes between preview and capture: invalidate expired snapshots and require buyer acceptance; never silently substitute amount or variant.
- Late/duplicate payment and concurrent expiry/refund: serialize transitions, preserve captured-money obligations, reconcile uncertainty and prove no oversell/double posting.
- Turning off FREE_LAUNCH_MODE exposes unrelated live flows: use separate fail-closed marketplace capabilities and production guards.
- Unbounded search and per-product DB lookups consume shared VPS resources: bound requests and use indexed queries; run destructive/peak load only on isolated staging.

## Verification contract

Maintain a traceability matrix for every source §22 row and §14 test ID: implemented path, exact test/report and release flag, or explicit external gate. A test plan is not an execution report.

Run unit and real-PostgreSQL integration tests for tenant/IDOR denials, review eligibility, quote versions, inventory/capacity and all money invariants. Race tests launch 100 attempts for the final unit of a selected SKU, test 50 attempts near seller exposure limit, and assert unchanged inventory of other variants. Repeat callbacks/reorder, partial and duplicate refunds, timeout-after-debit, expired reservations and worker restarts. Assert balanced ledger, refunded <= captured and at most one final allocation.

Use representative staging fixtures from source §14.1: 30 sellers, 3,000 products, 10,000 synthetic users and 50,000 historical suborders. Catalog HTTP load follows source LOAD-01: 50 VU for 10 minutes, ramping to 200; target catalog p95 <500ms initially, report actual p95/p99/error rate/query counts/CPU/RAM and stop conditions. Higher loads are optional additional stress exploration, not a replacement for the baseline. Checkout ramps 20 ->100 concurrent requests in sandbox. Test 10,000 compound Persian search/filter requests with correctness assertions. Shared LiveKit capacity is not proven by isolated catalog load; mixed-load testing requires a staging topology with representative LiveKit load and explicit resource budget. Never load real PSP/SMS or production to exhaustion.

Verify mobile RTL at 320px, tablet and desktop, keyboard forms and accurate failures. Restore a backup into separate staging and validate inventory, financial checksums and recovery time. Attach reproducible commands, commit IDs, environment/topology and observed outcomes, including unexecuted tests.

## Repository and deployment protection

Initial branch: codex/platform-sync-20261024, local HEAD aabf51f. Existing uncommitted apps/web/tsconfig.tsbuildinfo and untracked ops/docker/ belong to the current workspace and must be preserved. origin/main HEAD 46262b9 includes test-database cleanup work; reconcile changes without blindly resetting or replacing the checkout.

Before deployment read live commit/build identifiers, source divergence, service/config flags, available CPU/RAM/disk and database migration state. Preserve Tadserver DNS, email, VTT/LiveKit services and campaign/user data. Build a release from reconciled sources, back up database and prior artifacts/config securely, verify restore, apply compatible migrations and publish with health checks. Auto-restore previous artifacts on failed checks; retain schema/data for recovery. Report deployed commit/build and actual flags.

Keep financial writes disabled during rollback. Before enabling financial flows, record and test a minimum safe rollback binary that honors delivery evidence, quote/capacity rules and capability gates; an old binary that ignores these controls is not a safe rollback target even if migrations are additive.

## Initial checks, not acceptance results

- Existing marketplace integration file contains two functional tests; no 100-client stress test ran.
- First run could not start because REDIS_URL/GARNET_SERVER_PATH was unset.
- A separate temporary Redis container on loopback port 6397 enabled setup to continue; the next run failed during migration of Persian text because embedded PostgreSQL initialized with WIN1252. Neither run reached marketplace assertions. Fix isolated test initialization to UTF8 and ensure cleanup on startup failure before relying on results.
- Read-only SSH probe to configured dnd-tad timed out on port 22. No production modification occurred and live version/capacity is unknown. Retry and investigate existing connectivity routes before release; if network access remains unavailable, retain tested release artifacts and report the exact deployment blocker.

## Builder discretion

Reuse existing styling/auth/session/Drizzle patterns and dependency versions. Choose focused module boundaries, indexes, UI components and test fixtures without changing LOCKED behavior. No real personal data in tests or reports. No secrets printed or committed. No additional product approval is inferred from selecting an infrastructure library.
