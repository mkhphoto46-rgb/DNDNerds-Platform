# Find game: tables only — 2026-11-06

User requested all discoverable tables in find-game, with DM profiles remaining exclusively in their separate section. Removed DM profile fetching and profile cards from the find-game mode in the shared GameHub component. Updated introductory/search text. Host attribution on each table remains. Table data fetching, pagination, filters, detail links, public/invite entry, and dedicated find-dm mode remain unchanged. Applies to /find-game and /account/find-game.

Validation: Web TypeScript and Linux production build passed. Browser at 390px with a local synthetic API displayed both PUBLIC and PRIVATE table cards, with their distinct admission labels, no DM profile section, and no horizontal document overflow. Dedicated /find-dm still displayed the synthetic DM profile. Fixture request log confirmed find-game requested tables and no dms endpoint before navigating to find-dm. No production data writes were used for testing.

Runtime source: 2ff9156d29f2615d49d7d98517fc5222a8e81304. Build: 42YaTU2SxBGfbwXqq9pxJ. Previous build Z-7fVjURZYWCVGKoN9fju. Rollback archive F:/DND_NERDS_OPS/deploy/find-game-only-20261106/live-web-before.tar.gz, SHA256 d3dfec2a4d020ceacc3ceb411e49a2b9171cea43ac8dcd8db53a8945eef60b6c. Archive hash and every archived file were verified before deployment. Artifacts and final release result are in that directory.

Published and browser verified: three live table cards, no DM profile section, no horizontal overflow at 390px. Deployment retained all 183 protected API/config/public files; no API/database changes. Stage route and API/VTT readiness checks passed. Zero active human rooms before cutover.
