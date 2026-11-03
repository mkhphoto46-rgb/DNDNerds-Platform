# Product/store experience — Tadserver — 2026-11-03

Published the owner's requested product/store organization inspired by the public functional structure of https://ellieslucky.rastiva.com/product/stainless-steel and supplied screenshots, retaining DND Nerds blue/cyan/gold UI and actual seller data. No reference site's assets, brand copy, review counts or financial promises were copied.

- Application source: `da702ef91fa84cbec2c3939e9c234642da1a2feb`.
- Web build: `JkBFrZ24zEcZqT_KrdpzV`; previous `6xmoz6WpcP2jzEWPlS4jv`.
- Bundle21,662,508bytes; SHA256 `8ca14c6a8a27bcddab1e1b521a6e1dc34a3aa10cb0591f6ad36518bffc9895d3`.
- Backup `/opt/dndnerds/backups/join-before-20261103T145712Z`; full restore verified15.71seconds;18users/7game tables/0orders/1product preserved.
- Migration head `1793664000005` /0038. Applied pending additive0036 BIGINT and0037 temporal capacity with matching API runtime, then0038 product community. The historical0035 prefix and SQL bytes were preserved.
- Released=true; existingRowsPreserved=true; privateSettingsPreserved=true; financialWritesDisabled=true.

## Visible behavior

Removed the brand-authenticity disclaimer from product and policy copy; brand is a normal specification. Added readable34px desktop/26px mobile product heading, Persian category/breadcrumb/attribute labels, actual product image zoom with close/focus return, separate product summary and specification panels, shop card with actual description/count and configured shipping where present, section navigation, product-specific comments/questions and verified purchase rating statistics, real related products, and shop catalog search/filter/pagination with actual product photographs. Native dark control fallback from the preceding hotfix remains in place.

Authenticated users can submit moderated plain-text product comments/questions. Stars require independent delivery evidence for that exact purchased product; store owner/member cannot self-review. Pending submissions are visible to their author as pending; only published entries appear publicly. Admin moderation requires privileged role, current password and recorded reason. Atomic20-submissions/day limit counts edits, with bounded microsecond-safe keyset pagination and indexed storage. Public community responses include viewer state and use private,no-store.

The currently published catalog has one product, so related products correctly returns an empty state rather than invented suggestions. Existing product name, description, price, image, inventory and store introduction were preserved. No real review, question, purchase or additional product was submitted as a production test.

## Verification

Targeted integration6/6 passed (product presentation/real shipping/related exclusion; product comments, moderated edits, verified reviews and quota races; seller access; product publication). API build and Linux Web production build passed. Python migration/rollback helpers5/5 and deployment-script syntax passed. Guard additionally checked the actual existing product's presentation/community endpoints on the restored staging database before cutover and again live.

Public browser checked https://dndnerds.ir/store/moralin/pirate: new sections, ordinary brand field and absence of the old disclaimer, real photograph, zoom dialog open/close, logged-in comment form without submitting, real empty rating/related states. At320px, document width305px and no offscreen form controls; viewport reset after inspection. Public shop https://dndnerds.ir/store/moralin showed actual product photograph, Persian category, search/filter and count1. API and browser confirmed public product/community paths; final build and migration head independently verified. Snapshot `.deploy/marketplace/product-experience-live-20261103.jpg` remains a local private working artifact.

The earlier financial-concurrency audit findings remain unresolved. This is not real-payment readiness or certification of production capacity under large buyer load. Real purchase/payout routes remain disabled, and no Voice/VTT/backend private configuration was changed. BIGINT runtime rollback retains additive schema and requires the existing financial-off invariant until a compatible runtime is restored.
