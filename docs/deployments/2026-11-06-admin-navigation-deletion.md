# Grouped admin navigation and table deletion — 2026-11-06

Published https://dndnerds.ir/admin. Runtime source `e2ddcc14e34f30d6881284c64ebd31a7f3669063`; Web build `Z-7fVjURZYWCVGKoN9fju`.

Four category paths: `/admin/games` (table control and DM/arena/news), `/admin/commerce` (stores/products/moderation/sales/payouts/settings), `/admin/people` (accounts/subscriptions), `/admin/site` (feedback/system). Old crowded landing console moved intact to `/admin/marketplace/settings`. Shared category navigation keeps related tools together. Existing API authorization and actions retained.

Table list now exposes a direct delete action. Older game-hub table cards link directly to `/admin/control?kind=tables&id=...` for edit/delete. Delete confirmation includes admin reauthentication, reason and exact title together. Pending deletion reloads the latest version before retry; asynchronous refresh guards prevent overwriting a newer selection. Existing permanent VTT-coordinated deletion and audit trail are unchanged.

Passwords remain Argon2 hashes. No plaintext passwords, hashes or reset tokens are returned to admin. Account details explain this and link to the existing user password recovery page. Admin-initiated recovery emails were offered as a separate optional choice and were not implemented or sent in this release.

Validation: 2 PostgreSQL integration suites passed, covering non-owner admin completion after VTT acknowledgement with original owner identity, offline queue/retry and retention of accounts/unrelated products. Authenticated disposable browser QA at 390px completed the entire UI/BFF/API deletion flow: 202 offline, then 200 and zero table rows after test bridge acknowledged. No production table was deleted. Category and account dialog checks at 320px had no document horizontal overflow. Marketplace settings remained reachable with its old controls. Desktop 1280px and live guest category navigation checked. Web TypeScript, API build and final Linux Next production build passed. Fresh read-only review found one selection race, fixed in the final source.

Guarded deployment: stage routes passed, zero active human rooms before cutover, API and VTT health checks passed. 183 protected runtime/config/public asset files unchanged. No API runtime, database migration, customer data or public asset changes.

Verified rollback archive: `F:/DND_NERDS_OPS/deploy/admin-organize-20261106/live-web-before.tar.gz`, SHA256 `55a5d1272393480c33e5aa64a67c0220bc001892614382a189b70598a5cda7db`. Read and verified all archived files before cutover. Previous build `gkdGkQ8jD4TMXXYHv4-ZT`. Temporary server stage and redundant uploaded archives cleaned after verification; local backup retained. Disposable QA resources stopped and removed.

Proof: `live-admin-desktop.png`, `live-admin-390.png`, `admin-home-320.png`, `qa-deleted-390.png` in the same deployment directory. Existing unrelated generated-file changes preserved.

Additional live read-only checks: the VTT deletion endpoint rejects an unsigned request with 403. The actual API and VTT service processes both have a configured matching bridge secret; no secret values were output and no configuration was changed.
