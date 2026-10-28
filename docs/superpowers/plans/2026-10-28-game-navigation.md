# Game Navigation Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make existing game routes easy to reach for players and DMs and add the existing brand logo as the browser icon.
**Architecture:** Share a compact navigation component between the city and site header; retain current API actions and page routes. Clarify table roles and expose the existing invitation flow.
**Tech Stack:** Next.js 16, React, existing CSS and brand PNG.
**Spec:** ../specs/2026-10-28-game-navigation-design.md (approved by owner in chat; favicon added to scope).

## Global Constraints
Keep the city visuals and existing authentication/authorization. Preserve local tsconfig build state. No new dependencies or dashboard architecture.

## Review Focus
Narrow mobile viewports; logged-out next destinations; users with both table roles; invite links before sign-in; browser icon links and image responses.

### Task 1: Primary navigation
- [x] Add shared GameNavigation with /play, /find-game, /create-game, and /find-game#join; highlight current destinations, including account aliases.
- [x] Integrate in site-header.tsx and home-town-experience.tsx; keep account access visible and put other destinations in secondary menus.
- [x] Update city entry CTA and site-tour.tsx wording; keep tour available on request without an automatic overlay.
- [x] Style desktop and mobile in a focused game-navigation.css while preserving scene assets.

### Task 2: Table clarity and invitations
- [x] Update game-hub.tsx labels, roles, primary player action and DM management links; add empty-state guidance.
- [x] Put the existing invitation form at #join for /play and /find-game; retain the destination through login/register.
- [x] Avoid changing launch and membership API behavior.

### Task 3: Brand icon and verification
- [x] Copy existing logo to app/icon.png; use Next's documented metadata convention (no new artwork).
- [x] Run npm run typecheck:web and npm run build:web.
- [x] Inspect browser screenshots and navigation at desktop and mobile sizes; verify icon response and destination links.
- [x] Deploy the verified web build with backup and rollback; check live page and icon responses.

## Execution notes
Native execution follows the user's explicit instruction to implement the approved scope. No additional permission gate is needed. These reversible UI and metadata edits use build checks and browser verification rather than implementation-mirroring unit tests.

## Verification and review
+- Production build and web typecheck passed. Two redirect safety tests passed.
+- Browser verified city and game navigation at desktop, 390px and 320px; no horizontal overflow in those checks.
+- Live deployment BUILD_ID: hdBFHaHmDUPimY19cZbWC. Backup: /opt/dndnerds/backups/navigation-web-20261028T162636Z/web-next.
+- Live icon metadata, PNG response and API/VTT health checked.
+- Independent code review completed; corrected pending-membership wording and auth cross-link destination preservation.
+- Authenticated player/DM browser journey was not exercised: the automatic approval check rejected starting the separate synthetic local preview. Existing role/launch API permissions were unchanged.
+- Navigation screenshots: logs/navigation-result-20261028/.
