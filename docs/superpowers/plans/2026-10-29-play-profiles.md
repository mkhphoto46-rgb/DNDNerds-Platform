# Play and profiles implementation plan

> Execute inline with superpowers:executing-plans. User explicitly requested implementation and deployment without routine questions.

**Goal:** Deliver the six requested navigation, music, table, profile, character and discovery changes.
**Architecture:** Extend the existing Next/React and Fastify/Drizzle implementation. Keep current visual palette and real authorization.
**Tech Stack:** Next 16, React 19, Fastify, PostgreSQL.
**Spec:** Direct user request, 2026-10-29, preserved in this chat.

## Constraints
Preserve source HEAD aabf51f and uncommitted user changes. No broad release overwrite. Existing isolated worktree is used. Campaign images: one WebP <=100KB, <=512x512. Profile images use existing bounded conversion. Private characters remain private; only accepted players can review others' tables.

## Tasks
- [ ] Shared hamburger menu in city and inner header; remove repeated game navigation; icon-only music and compact hosted cards. Browser verify desktop/mobile and keyboard.
- [ ] Add player profile data, bounded campaign image and genre fields via additive migration. Add API tests for ownership, privacy, input limits and persistence.
- [ ] Extend profile editor/public page, campaign editor/details, unified discovery and friend profile links.
- [ ] Run typechecks, production build, migration and authorization tests; inspect diffs.
- [ ] Stage against actual live files, preserve backups and rollback, deploy only site/API changes; verify live routes.
- [ ] Continue prior voice/TURN and SMM work from evidence; report exact unfinished work if infrastructure blocks.

## Review focus
Oversized/invalid images; nonowner updates; anonymous/private character access; self/nonmember reviews; existing tables without genres; live release drift.

## Execution ledger
- Source had only generated tsbuildinfo modification. Worktree fast-forwarded to aabf51f. Live app is a release tree without .git; fingerprints and service manifests must identify its state.

## Verified results
- Shared menu and city icon visually inspected in browser. Duplicate /play tabs removed. All primary destinations remain in the shared menu.
- API integration passed against disposable UTF8 PostgreSQL plus dedicated Redis: profile persistence, nonowner/anonymous rejection, private character omission, campaign metadata, draft exclusion, self/nonmember review rejection and member review success, topic/genre/public-ID discovery.
- Eight launch-role, signed-ticket, public-identity and auth-return tests passed. Web/API typechecks and production builds passed. Independent code review completed; draft privacy and pre-limit search findings fixed.
- Test helper updated for current username registration and UTF8 on Windows; persistent test database avoids embedded-postgres cleanup racing with Windows handles.
- Build ID: kBtKC3gXKb1Dz5aN4JLE7. Release archive: F:/dnd-play-test-temp/play-profiles-20261029.tar.gz (7,094,035 bytes), SHA256 2619f517ad9bf8dc77658a39b9ecbe1738670703b6dcc978201625158603871a.

## Deployment blocked
Automatic approval review rejected preparing the VPS deployment script with only `blocked by policy`. No production release files or database were replaced. Existing live build remains 2Lg6qq7BfwIFPjyivTmwi. A local frontend instance with an overridden test API URL was also rejected; authenticated browser flow is unverified. Anonymous browser UI and real API integration were verified separately.
Deployment should patch only web .next, API db/schema and routes game-hub/profile-image/profile-pages plus migration 0029 and journal. Preserve other live API differences (email provider configuration), VTT and environment. Record and validate fingerprints; database/code backup and rollback are required before swapping code. Additive migration allows old code rollback without destructive schema removal.

## Voice/SMM evidence
Read-only VPS inspection: LiveKit up, TCP 443/5349 and UDP 3478/7882 listeners present. Prior forced relay session obtained relay candidates but did not connect; no new successful TURN claim. SMM env keys unset and no ingress/worker service found. VTT source at F:/DND WEB VTT has substantial pre-existing uncommitted SMM archive/catalog/retention changes; preserved. Eighteen targeted archive/retention/catalog authorization tests passed on that working tree. Those changes are not in this platform release.
