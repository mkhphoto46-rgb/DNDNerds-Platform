# Mobile account dropdown overflow fix — 2026-11-06

Published to https://dndnerds.ir with runtime source `358bf22cde4a9a01cd4049682ab28571d63f6e3d`, build `gkdGkQ8jD4TMXXYHv4-ZT`.

The header account dropdown previously extended from x158 to x443 in a 390px viewport. On screens up to 900px it now anchors to the viewport with 12px side clearance, maximum width 340px, and an internally scrollable height limit. Desktop positioning and the inline mobile account variant stay unchanged.

Validation: browser checks at widths 320, 360, 390, 540, 778, 900 and 1280; all account options remained visible. Account navigation closes the dropdown and reaches /account. Escape closes it. At 390x240 the menu stays between y64 and y220 and scrolls internally. Authenticated interaction used a local synthetic API fixture, without accessing a real customer account. Production browser confirmed the exact new CSS loaded and no horizontal document overflow at 390px. Linux production build and Web TypeScript check passed.

Guarded deployment preview checked home, marketplace, games, knowledge, discovery, account and admin routes. API/VTT readiness checks passed after cutover. All 183 protected API/config/public asset files were unchanged; no database writes or migrations were part of this release. Active human rooms before cutover: zero.

Rollback backup: `F:/DND_NERDS_OPS/deploy/mobile-account-20261106/live-web-before.tar.gz`. SHA-256 `911104ce89574c93d611dbd22756430f2835b8400bb7ac3108f15a1c67885524`. Hash and every archived file were read and verified before cutover. Previous build: `_EDzfOvnL78ASF9VUL5Vy`.

Screenshot: `F:/DND_NERDS_OPS/deploy/mobile-account-20261106/mobile-account-390.png` (local test account). Existing unrelated generated-file changes were preserved.
