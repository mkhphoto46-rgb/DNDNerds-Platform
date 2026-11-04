# Marketplace sales accounting release — 2026-11-04

Released source `08321a40946940c66912509308f96847e35bd515` to Tadserver using the existing guarded deployment. Web build `rwweuxudCduyokVWDmczh`; archive SHA256 `26e7c0629f276eebb54ca33b500e3b5665c6e24b2edb6a501148a30db735df6b`. API delta: routes/admin.js and marketplace/sales-reporting.js only. Applied migration head remains 1793664000005 (0038); no schema changes.

Backup: `/opt/dndnerds/backups/join-before-20261104T014151Z`. Guard result: released=true, restoreVerified=true, restoreSeconds=16.25, privateSettingsPreserved=true, existingRowsPreserved=true, financialWritesDisabled=true. Restored counts: 19 users, 7 game tables, 0 marketplace orders, 1 product. Log: `/opt/dndnerds/staging/sales-reporting-deploy.log`.

Admin entry: https://dndnerds.ir/admin/sales, linked from admin home and marketplace moderation. Seller report embedded in https://dndnerds.ir/seller/marketplace#seller-sales for OWNER/MANAGER stores. Payments remain separately gated. No production transactions or fixtures created.

Verification: integration scenario passed using disposable PostgreSQL QA15497, covering tenant/role restrictions, multistore totals, microsecond paging/date boundaries, pending/cancelled amounts, historical item snapshots, finalized partial and legacy full refunds, and sums exceeding JavaScript safe integers. API build and Linux Next production build passed; guarded-release unit checks 5/5 passed. Independent focused source review reported no material findings.

Authenticated production browser: report and real store chooser loaded; applying Moralin store filter returned truthful empty data. Desktop and 320px mobile checked (document width305px, report281px, viewport320px), no horizontal overflow. Mobile viewport reset. Screenshot: ignored `.deploy/marketplace/sales-report-live-20261104.png`.
