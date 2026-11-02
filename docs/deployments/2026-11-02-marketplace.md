# Marketplace catalog and seller preparation release — 2026-11-02

Public catalog and seller preparation are deployed to the existing Tadserver runtime. Full commercial marketplace implementation is still in progress. Production purchase/payment/payout/KYC intake remain disabled.

Runtime source: initial scoped release33b3f0c; final Web hotfix94ad02f. Current Web build `Y0q4IMBLgQ_FJZhpC2srT`. Migration0032 applied additively; earlier journal entries and existing data retained. Only12 selected API runtime files were changed; unrelated live compiled patches were preserved and overlaid into restored staging for accurate validation. The second release changed Web only.

Backups:
- `/opt/dndnerds/backups/join-before-20261101T205059Z`: PostgreSQL restore/migration and staging readiness verified in12.98s; restored counts14 users/3 tables/0 marketplace orders/0 products.
- `/opt/dndnerds/backups/join-before-20261101T211102Z`: fresh backup before Web hotfix, restore/staging readiness verified in13.29s; restored counts15 users/3 tables/0 orders/0 products. The additional account created between releases was preserved.

Both snapshots verified PostgreSQL archive readability, standalone SQLite integrity, runtime/media/config archives and SHA256 manifests. Staging explicitly disabled the deletion worker, cleared its VTT bridge signing secret and used an unused loopback VTT endpoint. Live private configuration fingerprints remained unchanged. No DNS, email, Voice, firewall or Docker cutover occurred. Release service reported `released=true`, `existingRowsPreserved=true`, `privateSettingsPreserved=true` for both releases.

The final Web correction allows only `/seller/marketplace` through free-launch middleware; cart, checkout and payout pages remain blocked. A regression was observed failing307 then passing200. Production checks now assert the seller page's actual heading, so a redirect followed by HTTP200 is not considered a successful portal check.

Public QA verified the new catalog/category/filter/empty state and seller portal. At320 CSS pixels the catalog document width was305px. The authenticated browser displayed the blank seller application form; no real application/product/feedback/payment was submitted. Existing database has no published stores/products, so no synthetic catalog was seeded in production.

Final rebuilt archive SHA256: `563f3990f6b1c3dc1516ea5c65099ab11f468c3a1b66e545ca155b449ab5e9ee`. New SSH/SCP connections were unreliable, so the hotfix delta was transferred over the existing authenticated channel. All3862 rebuilt artifact files matched the tested local build tree SHA256 `5fce7d1bbb5425313b5d0ea05b6d93d895e810732a33d34f374f5a654769ba2e` before a fresh guarded restore/release.

See `docs/marketplace/verification.md` for executed load/correctness tests and outstanding domain work. Do not infer full-spec completion or commercial readiness from this release.

## Phase B release — 2026-11-02

- Frozen source:1d966a7f2f18b32f4207187d2fb314a18a8711dd (contains50325d4 partial refunds,b37a519 independent delivery policies,da15dd0 variant identity/audit). Exported and built separately to preserve concurrent campaign-cover work11d7472.
- Live Web build:c-vxnzD_3yqe6ilIOOS-l; database head0035/1793664000002.
- Bundle SHA256:863c0f8fcd3989aa13542ec2431fe3079fa6a12df691a1bd840d9ea2c90fe2d5;14,649,902bytes. All10 selected API runtime hashes match the uploaded archive after release.
- Backup:/opt/dndnerds/backups/join-before-20261102T105043Z. Restored clone and staged migration/API checks succeeded in16.83seconds; preserved counts16users/3game tables/0orders/0products. Private settings and existing rows preserved; no real fixtures inserted.
- Unit:dnd-marketplace-phase-b-20261102; log:/opt/dndnerds/staging/marketplace-phase-b-deploy.log; released=true,financialWritesDisabled=true.
- Applied migration files retained byte-for-byte from live; differences against checkout were line endings only. Current campaign image CHECK remains700000, preserving the separately approved no-restart repair.
- Browser:public store and seller portal headings rendered; anonymous seller portal correctly asks to sign in; console errors[]. Authenticated operations UI was not login-tested in this browser session. Real-DB synthetic approval/delivery/refund tests passed23/23 in frozen source; API/Web production builds and Python guard tests5/5 passed.
- Operational delivery/policy writes return503 in production; checkout503/mock webhook404; financial flags stayoff. Eligibility is explanatory/executable:false and delivery confirmation never releases balances.
- Not full commercial completion:time-window capacity, versioned seller agreements, wider money storage, buyer return UX/scoped operational holds, external channels, final settlement execution and external G01..G12 evidence remain outstanding.

