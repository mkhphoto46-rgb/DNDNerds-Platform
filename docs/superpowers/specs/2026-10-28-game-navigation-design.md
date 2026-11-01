# Simplify existing game navigation — draft for owner review

## Intent
Help players and DMs find games and reach their own tables quickly using the existing site and routes.

## Owner decisions
- Primary tasks: finding games and managing tables for both players and DMs.
- Chosen approach: improve existing menus and routes.
- Discuss and approve the design before building UI changes.

## Approaches
1. Improve current navigation (chosen): least disruption; keep current pages and city identity.
2. A shared game dashboard (recommended initially, not selected): consolidates tasks but changes the current structure more.
3. Separate player and DM dashboards (not selected): clearer per-role views but requires switching for dual-role users.

## Proposed scope, awaiting approval
- Expose My Tables, Find a Game, and Create Table directly in the homepage and shared page navigation. Use existing /play, /find-game, /create-game routes.
- Use the same Persian labels across city, menus, and page headers.
- Keep account access visible and group non-game destinations under Other Sections.
- Make My Tables show player/DM roles clearly and distinguish Enter Game from Manage Table; inspect existing authenticated behavior before changing actions.
- Make invitation/code entry easy to discover through its existing supported flow.
- Keep the city experience and existing visual identity.
- On mobile keep the primary game destinations easy to reach without hiding everything behind the full menu; exact placement is an implementation choice to review visually.

## Constraints and non-goals
No permission relaxation, auth removal, account migration, new dashboard architecture, VTT redesign, or payment changes. Preserve post-login destinations and current server authorization.

## Evidence and acceptance
Current visitor screenshots and findings: logs/ux-audit-20261028/report.md.
Each primary game destination must be directly discoverable from home and ordinary site pages; signed-in players and DMs must identify their table action; logged-out paths must return users to the intended destination after authentication. Check desktop, mobile layout and accessible names. Authenticated user flows remain to be inspected.
