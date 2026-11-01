# Adversarial review — marketplace release

Independent source reviewer examined the implementation and deployment plan. Findings were corrected and focused regressions added where recorded in verification.md.

| Attack / failure | Correction / remaining limitation |
| --- | --- |
| Seller declares delivery and unlocks its own money | Legacy DELIVER rejected403; production financial operations remain disabled. Full independent release workflow remains unfinished. |
| Guess another seller's variant IDs | Membership and store/product predicates; cross-tenant PATCH returns403. |
| Last SKU sold100 times | Locked and conditional atomic reservation; executed race permits exactly1 new order, other SKU unchanged. |
| Fifty checkouts bypass a seller cap | Store locks in stable order, transactionally counted exposure; fixture admits only2 allowed orders. Cap is conservative and does not yet model final post-return release. |
| Omitted default variant plus same explicit variant bypass quantity limit | Reject duplicate canonical selected SKU. |
| Ten editing transactions exhaust the pool | Category lookup moved outside active transaction; ten concurrent edits regression passes. |
| Promotion vanishes during a stock edit | Dashboard returns existing discount fields; form restores them and validates dates. Price history stores old/new base and promotion states. |
| Legacy prices falsely appear changed today | Existing price_effective_at remains null; only observed new changes/insertions stamp it. |
| Small product page still aggregates the entire catalog | Page matching product IDs first, then aggregate page variants; variant creation bounded at100 per product. |
| An empty page reports no matching products | Retrieve preserved matching count for out-of-range pages. |
| Arbitrary category or malformed private key | Category existence and canonical owned-media key enforced. Private media quotas and image checks; SVG rejected. |
| User's two colors edit/remove each other | Cart uses product+variant identity throughout edits/removals and preview. |
| Shipping changes between preview and capture | Server snapshot is account-scoped, versioned, expiring and consumed; changed fee/version requires acceptance. |
| Oversized multi-seller order reserves then overflows integer finance columns | Reject unsupported total above2,000,000,000 rial before insertion/reservation. Future wider finance support needs consistent migrations. |
| Restore clone starts a destructive worker against live VTT | Explicit worker flag false, bridge secret blank, VTT origin points to unused loopback port in stage; staging process ownership checked. Production default unchanged. |
| Failed Web copy leaves service stopped | Rollback handles missing and partial replacement directory; both cases tested. |
| Migration commits then privilege setup fails | Rollback rechecks migration ledger and retains additive journal conservatively. Never replace live DB with backup. |

No direct executable article/review path was identified: content is rendered as React text. This is a scoped engineering review, not a penetration-test certification or a claim that all source §14 cases ran. See verification.md for unimplemented financial and operational requirements.
