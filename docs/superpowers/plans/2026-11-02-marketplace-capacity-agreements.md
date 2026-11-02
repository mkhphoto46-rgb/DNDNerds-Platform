# Marketplace continuation: temporal capacity and agreements

Owner already approved full staged implementation. Continue inline using executing-plans/TDD; no additional design approval required for these locked requirements.

Baseline: local f883fbc, live phase B through0035. Financial and operational attestations remain disabled in production. Preserve the separately deployed campaign image constraint700000.

## Capacity model

For READY_TO_SHIP, inventory remains physical stock. For MADE_TO_ORDER/CUSTOM_DESIGN, the existing finite inventory quantity represents declared overall service capacity, and an additional explicit production window constrains when that capacity can be booked. Window capacity cannot create global capacity. No infinite stock, automatic replenishment or invented delivery dates.

1. Add versioned variant-scoped production windows with start/end/cutoff, total/reserved/committed counts and finite bounds. Serialize window configuration through the variant row. Refuse overlapping active windows and capacity reductions below promises. Dates are immutable; replacement requires a new window.
2. Link window reservations one-to-one to existing inventory reservations. Their ACTIVE/CONSUMED/RELEASED/EXPIRED lifecycle atomically changes window counters in the same transaction. Existing payment/cancellation/expiry logic remains the inventory authority. Database CHECKs preserve reserved+committed<=capacity.
3. New non-ready orders require an explicit window and accepted version. Lock rows consistently, validate cutoff/type/quote lead time/remaining capacity and bind slot dates to an immutable booking snapshot. Idempotency and accepted checkout snapshot comparisons include window identity/version.
4. Refunds restore window capacity only for the selected unstarted units; once PROCESSING/SHIPPED begins, capacity remains consumed. Existing fulfillment store lock serializes this decision. Full unstarted refunds release remaining allocation; callbacks/replays never double-release.
5. Expose windows in public variant availability and seller management. Carry selected window through cart/checkout and display accepted dates. Different slot choices for the same variant require explicit cart correction; do not silently merge incompatible promises.

Acceptance:100 concurrent last-window bookings admit exactly the allowed quantity; another variant/window remains unchanged. Payment consumes once, order cancellation/expiry releases once, price/window-version changes conflict, tenant IDOR fails, overlapping windows fail, quote lead time is respected, partial refund/production-start outcomes retain consistent global/window counts. Test reservation lifecycle against real PostgreSQL.

## Seller agreements

Add immutable version/hash documents and append-only store/user acceptances. Prepare and independently approve SANDBOX revisions only while final legal/provider gates lack evidence. Surface version/text/hash for review, preserve old acceptances and require renewed acceptance after a new effective version. Enforce the accepted version at sandbox order boundaries; no agreement label may manufacture KYC or live-payment authorization. Production draft preparation stays accessible while commercial activation remains gated.

## Release

Reconcile latest local/Git/VPS state, build an isolated frozen source artifact if concurrent work is present, run focused financial/capacity/identity tests and independent review, then use the guarded backup/restore release. Old-runtime rollback with BIGINT storage is financial-disabled only; require rolled-forward number mappings before any finance activation.
