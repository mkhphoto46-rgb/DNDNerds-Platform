# Games: add Find DM category — 2026-11-07

User requested a fourth game category linking to the existing DM discovery page. Added /find-dm card to /games, alongside /play, /find-game and /create-game. Adjusted find-game card description to refer to tables only. User rejected the proposed knowledge rename before publication; all naming edits were reverted. دانشنامه remains unchanged everywhere. Production implementation diff is limited to apps/web/src/app/games/page.tsx.

Validation: three existing navigation tests pass, Web TypeScript check passes, Linux Next production build passes. Browser confirms exactly four category links and no document horizontal overflow at widths 320 and 1280. Clicking Find DM navigates to /find-dm. No API, admission, authentication or database changes.

Runtime source 4c476382e964f97efbfb0642fd815e488521305d; build WuWUy8b6v_zsOERHKzOhI. Previous build 42YaTU2SxBGfbwXqq9pxJ. Verified rollback archive F:/DND_NERDS_OPS/deploy/games-dm-card-20261107/live-web-before.tar.gz; SHA256 41d6ea67ba753b6569b3e4cdcce740f427ebc7c8e57f28d21502419a0b7fc56d. Every archived file was read before cutover.

Published and verified in the live browser: four game categories, unchanged دانشنامه label, Find DM click reaches the separate directory and real DM profiles load. At 390px document width remained within the viewport. Guarded deployment passed with 183 protected API/config/public files unchanged, no API/database changes and zero active human rooms before cutover. Local rollback backup retained.
