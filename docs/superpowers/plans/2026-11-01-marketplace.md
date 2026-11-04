# Marketplace v2.1 Implementation Plan

> For agentic workers: use superpowers:executing-plans. Owner approved full implementation and staged Tadserver publication; continue without further plan approval.

**Goal:** implement the approved marketplace design and publish verified slices with protected production data.
**Architecture:** existing Fastify/Drizzle/PostgreSQL modular monolith and RTL Next.js. Additive migrations, private tenant data, independent capability flags and gated external finance.
**Tech Stack:** existing Node/TypeScript, PostgreSQL, Redis, Next.js.
**Spec:** ../specs/2026-11-01-marketplace-design.md and owner-supplied v2.1 Persian master architecture.

## Global constraints

- Preserve the latest deployed profile/campaign/Voice work and all user data; no DNS/container cutover.
- Physical products; explicit variants, finite capacity, integer rial and accepted snapshots.
- Production mock payments, real KYC intake and unsupported financial services remain disabled.
- Test with isolated PostgreSQL/Redis and synthetic data; no production stress.

## Review focus

Suspended-store direct links; inconsistent matching variant facets; seller self-delivery; price/quote changes during checkout; rollback bypass of new controls. Add negative tests to owning task.

### Task 1: Reconcile baseline and isolate validation

Files: apps/api/tests/support/api.ts, apps/api/dev/stack-lib.mjs, docs/marketplace/progress.md.
- [ ] Reuse latest clean worktree on codex/marketplace-v21-20261101; preserve original checkout.
- [ ] Run existing marketplace tests with isolated Redis and UTF8 Postgres. Repair only demonstrated setup failures.
- [ ] Record exact baseline and SSH/live-version evidence.

### Task 2: Catalog, variants and publication controls

Files: apps/api/drizzle/0032_marketplace_v21.sql, meta/_journal.json, src/marketplace/{policy,catalog}.ts, src/routes/marketplace-v21.ts, src/routes/marketplace.ts, src/app.ts.
Interfaces: catalog search returns existing product shape plus variants, pagination, categories and price/history metadata. Seller management scopes store membership. Legacy routes use the same public visibility predicate.
- [ ] Write failing real-database tests for active-store visibility, bounded paging, matching-variant facets, price updates, stock and cross-tenant writes.
- [ ] Add compatible schema, indexed joined catalog queries, structured variants, product types, promotions, history, stock movements and explicit capability guards.
- [ ] Add authenticated draft management and reviewed publication/featured-store operations; assert unverified applicants cannot publish.
- [ ] Run focused tests and API typecheck.

### Task 3: Trust and communication

Files: src/routes/marketplace-v21.ts, marketplace policy and migration; integration tests.
Interfaces: account-scoped favorites, moderated article/review submission, published-content reads, provider gate registry and audit.
- [ ] Write negative eligibility/IDOR/moderation tests, then implement persistence and owner/admin workflows.
- [ ] Keep identity/address/authenticity distinct and private; use evidence-backed badges only.
- [ ] Verify worker outbox/retry behavior and preserve gated provider delivery.

### Task 4: Order and financial safety

Files: src/routes/{orders,seller}.ts, src/marketplace/policy.ts, tests/integration/marketplace-v21.test.ts.
Interfaces: explicit variantId, accepted price/shipping/quote version, account verification and snapshot conflicts; independently reviewed delivery, separate release eligibility.
- [ ] Write tests rejecting seller self-delivery and unchecked snapshots, plus 100-way stock race and replay tests.
- [ ] Implement guarded variant ordering and finite capacity/custom quote contracts. Keep closed-pilot order/payment paths gated from public production.
- [ ] Validate ledger/refund invariants and recovery behavior; no real provider activation without evidence.

### Task 5: RTL storefront and portals

Files: apps/web/src/lib/marketplace-api.ts, src/app/store/*, src/components/marketplace/*, seller marketplace portal, API proxy routes.
Interfaces: use canonical v2.1 catalog API, secure session proxy, explicit variants and server-side filters.
- [ ] Build small category boxes, configured featured stores, valid discounts, bounded search/filter/page forms and truthful empty/error states.
- [ ] Add detail variant selection/quantity/date, favorite/share, store articles/reviews and seller product/variant/content management; public policy/readiness information.
- [ ] Verify 320px responsive layouts and keyboard flows, production web build.

### Task 6: Stress and adversarial acceptance

Files: apps/api/dev/marketplace-load.mjs, tests/integration/marketplace-v21.test.ts, docs/marketplace/{traceability,test-report,devils-advocate}.md.
- [ ] Seed isolated 30 sellers/3,000 products/10,000 synthetic users/50,000 historical suborders.
- [ ] Execute catalog 50 VU/10 minutes then ramp to 200 with bounded stop conditions, 10,000 combined Persian filter checks and 100-way last-variant race.
- [ ] Exercise duplicates, auth denials, concurrent refunds, failures and restore; report actual and unexecuted evidence separately.
- [ ] Run relevant complete test suites, API/Web builds and independent whole-change review; fix important findings.

### Task 7: Protected publication

Files: ops/deploy-marketplace.py, docs/deployments/2026-11-01-marketplace.md.
- [ ] Reconcile live versions and settings; check active seats/resources, verify backup and isolated restore.
- [ ] Stage hashes/build/migrations and only required runtime artifacts, preserve permissions and prior files.
- [ ] Publish catalog/draft capabilities with financial writes off; health/public/private negative checks and rollback on failure.
- [ ] Record actual deployed commit/build, active flags, performance and remaining external gates. If SSH unavailable, retain concrete tested artifacts and report blocker without claiming deployment.
