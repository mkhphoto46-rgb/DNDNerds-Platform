# Marketplace v2.1 — evidence and release scope

Owner approved staged implementation and Tadserver publication. This release publishes the **catalog and seller preparation portal**, not a commercially complete marketplace. No production payment, payout, wallet, KYC-document intake or carrier coverage is enabled.

## Executed evidence

- Existing real-database marketplace flow: 2/2 passed (signed mock payment, replay, balanced ledger, order ownership, stock/unknown-product refusal).
- New marketplace integration suite: 9/9 passed on isolated PostgreSQL 18 in Docker, including 100 concurrent final-SKU attempts, 50 concurrent seller-exposure attempts, variant IDOR, repricing conflict, shipping-version conflict and accepted totals, private-file denials, immutable journal, account favorites, moderation boundaries, default-SKU alias rejection, empty-page totals and ten concurrent variant edits.
- API source units: 16/16 passed; subsequent deletion-worker isolation policy regression: 1/1 passed.
- Cart variant identity regression: 1/1 passed.
- Deployment rollback filesystem tests: 2/2 passed, covering absent replacement directory and partial copy.
- API and Web production builds passed. Financial routes are absent in production; canonical checkout explicitly returns 503.
- Browser QA on disposable fixtures: catalog and featured store appeared, 320px viewport had 305px document width (no horizontal overflow), server-side purple-color search returned zero with a truthful empty state. Product details were reached; later navigation timed out during development compilation but server log recorded HTTP200. Do not count that timeout as a complete product interaction test.
- Load report in `load-report.json` matches the current catalog source SHA256. Fixtures: 30 sellers, 3,000 products, 9,097 variants (one product has100), 10,000 synthetic users, 50,000 historical suborders. 10,000 compound Persian search/filter correctness requests passed.
- Optimized HTTP load: 50 connections/600.84s, 143,548 requests, p95=317.691ms, p99=409.2805ms, zero errors/timeouts/non2xx. Ramp: 200 connections/120.9s, 23,489 requests, p95=1419.7814ms, p99=1844.2134ms, zero errors/timeouts/non2xx. The 200-connection latency target is **not met**.
- This is loopback Windows host capacity with isolated databases and an intentionally raised per-IP rate limit in the load process. Other local test/build work shared the host. It is not VPS or mixed LiveKit capacity certification. PostgreSQL emitted crash warnings during fixture shutdown after the completed run; the completed HTTP measurements preceded shutdown. Do not describe the Windows harness as crash-free.

## Failed/incomplete broader validation

The broad pre-existing integration run did not pass: Windows subprocess setup stalled and was interrupted, and legacy route tests requested endpoints such as `/api/v1/profile/display-name` and `/api/v1/tables` that returned404. The affected legacy tests were not rewritten to make this release look green. The targeted current marketplace suites were rerun successfully using a dedicated loopback PostgreSQL container. No whole-repository green claim is made.

## Reproducible commands

From `apps/api`, set `REDIS_URL` to a dedicated test Redis and `TEST_POSTGRES_ADMIN_URL` to a dedicated loopback PostgreSQL18 administrator connection. Each suite creates and drops only its random `dnd_test_*` database.

```powershell
node --import tsx --test --test-force-exit --test-timeout=180000 --test-concurrency=1 tests/integration/marketplace.test.ts tests/integration/marketplace-v21.test.ts
node --import tsx --test src/jobs/table-deletion-worker-policy.test.ts
node --import tsx dev/marketplace-load.ts
```

The load tool never accepts an arbitrary target URL; it starts its own isolated API. Set `MARKETPLACE_LOAD_REPORT` to an absolute artifact path when launching outside `apps/api`.

## Not implemented or not established

- Item/quantity-specific partial refund execution and shipping-refund allocation; existing engine supports whole-parent/whole-suborder paths only.
- Time-window production capacity and scheduling beyond finite per-SKU inventory/capacity counts.
- Versioned final seller agreements and their re-acceptance enforcement.
- Independent delivery review and policy/return-window based financial release. Seller self-confirmation is blocked; this is not the completed replacement settlement workflow.
- End-to-end late-capture/uncertain-provider remediation, 100 concurrent partial refunds, provider outage chaos, disk-full drills and mixed LiveKit load for this release.
- Production SMS/Telegram sale delivery. Existing in-app outbox support and stock-event production do not establish external-channel operation.
- External gates G-01..G-12 require actual evidence; gate registry remains pending. An approved deploy does not manufacture PSP/legal/KYC/carrier evidence.

These are remaining work, not silently completed requirements. The public release must retain purchase/settlement disabled until its independent domain gaps and external gates are resolved.
