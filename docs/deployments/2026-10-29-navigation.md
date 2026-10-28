# Live navigation and profile release — 2026-10-29 Tehran

Runtime code commit: `89e96562cc1448227c5d7b884bf4a4edf6c707ea`
Web build: `cvCECDtCtEhH1zreCHl1F`
Web archive SHA256: `3492c782f8ea23b066b1f53c3edd8192ae5adb345f5b1a1ce2c8a3d8bb4df31d`
Host: 94.183.163.87; app: /opt/dndnerds/app; live domain: https://dndnerds.ir

## Changes
Four direct menu links: Games /games, Tools /tools, Store /store, Account /account. No nested account menu, menu scrolling or duplicate primary rows. Child destinations grouped in the Games/Tools hubs and the Account profile/security/purchase sections. Guide, music and chat remain outside the city menu. The menu is opaque and its HUD paints above XP. Includes genre-control layout polish.

The initial release2866d2d also installed bounded campaign images/genres, player profile data, public character privacy and API discovery. Migration0029 completed successfully. Only the four relevant API modules/schema and migration files were patched; other live API/email files and all VTT code were preserved.

## Backups and recovery
- Initial code backup: /opt/dndnerds/backups/play-profiles-20261028T212640Z
- PostgreSQL custom dump and VTT data snapshot: /opt/dndnerds/backups/20261028T212642Z
- Previous web build before compact navigation: /opt/dndnerds/backups/play-genre-web-20261028T214349Z/web-next
- Guarded scripts: ops/deploy-play-profiles.sh and ops/deploy-play-genre-web.sh. Both check expected versions and restore code on failed health checks. Additive database columns remain compatible with previous code rollback.

## Verification
- On-server release marker and BUILD_ID match the runtime commit/build above; service active.
- PostgreSQL/Redis readiness and VTT /api/health succeeded. VTT server SHA256 matches the pre-release backup.
- Live /games, /tools, /play, /account, /create-game, /find-game, /account/profile and /vtt returned200. Site pages each expose exactly the same four direct main-menu links and zero nested menus.
- Live API tables, public table/player detail and empty discovery queries succeeded. Anonymous private-profile read returned401.
- Browser: desktop and320x568 mobile menu inspected on live domain. Exactly four labels, no nested menu, scrollHeight equals clientHeight; mobile menu bottom292px within568px viewport. Account link navigated directly to /account and closed the menu.
- Existing signed-in session loaded profile, hosted table and campaign editor without modifying data. Final account page exposes profile/characters/DM/public profile, security/logout and orders/subscription/seller groups.
- Build/typecheck passed; earlier real PostgreSQL/Redis authorization integration, eight related unit tests and independent code review passed. The review's draft privacy, search-before-limit and XP stacking findings were fixed.

## Limits
The account order-history request still receives404 because FREE_LAUNCH_MODE intentionally omits paid commerce routes. Paid commerce was not enabled as part of this navigation work. TURN relay and SMM production activation remain separate unfinished work; the existing VTT source changes and data were preserved.

SSH was intermittent during transfer. A single authenticated SSH/SFTP session transferred the archive and executed the guarded script. That channel then disconnected, so completion was independently verified through HTTPS and a fresh SSH session rather than inferred from command dispatch.
