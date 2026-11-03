# 2026-11-03 — Admin seller-access hotfix

Owner requested immediate direct seller assignment from the administration panel. Published a narrowly scoped hotfix on the existing Phase-B marketplace + final blue guild UI baseline. This is not publication of the unreleased Phase-C capacity/BIGINT changes.

- Source change: `12ea76c81dd3f3d65458c24111caa3dc060dce63`.
- Published Web build: `XrEusdINN1Di3H8JRK91l`; previous `GzzH-r4DbajrsyraF-tOr`.
- Runtime bundle SHA256: `521602cb2b8ee0d89c0878cfb6ce30cecb13f039df58be4f1b660f5812ae758c` (21,456,003 bytes).
- API delta only: `routes/admin.js` and new `marketplace/seller-access.js`.
- No new migration; observed journal head remains `1793664000002` (0035).
- Full backup: `/opt/dndnerds/backups/join-before-20261103T140653Z`.
- Restore drill passed in 15.38 seconds; preserved counts `18 users | 7 game tables | 0 orders | 0 products`.
- Deployment result: released=true, privateSettingsPreserved=true, existingRowsPreserved=true, financialWritesDisabled=true.

Admins now search an existing account by exact email/username, assign a store and OWNER membership, or approve an existing seller profile. Account detail links directly to the selected account in this panel. Assignment requires SUPER_ADMIN/MARKETPLACE_ADMIN, correct password, reason, active target account, valid category and unique shop slug. Account row lock and transaction prevent duplicate assignment. Store starts unverified; no identity evidence, verification badge or real financial activation is manufactured.

Verification: targeted integration 2/2 passed after observing the missing endpoint fail first. Tests cover non-admin/support/wrong-password denials, no previous seller application, actual membership/dashboard access, duplicate refusal and atomic audit record. API build and isolated Linux Web production build passed. Guarded release restored the current DB into a disposable database before cutover; existing health/catalog/seller/game routes passed. Post-release public admin HTML contains the new panel, Home still renders guild-home, unauthenticated seller-account lookup returns403. No real account was assigned as a production test.

New API SHA256: admin.js `623eee6b5a12c4f422ef0b55a9318f11d952039007d6a4fac07e89affc217c4f9`; seller-access.js `4fd4be4f66330068e6df97cbb87113b3337eb78b0101cb7c4e30aefef84efe57c`.
