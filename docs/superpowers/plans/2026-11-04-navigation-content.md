# Navigation and Content Implementation Plan
> Native execution of the user's fully specified fixes; no new agents required.
Goal: simplify discovery and add a usable article library without changing the new design.
Architecture: current production source snapshot, existing game-hub BFF, PostgreSQL article storage, static editorial articles.
Spec: ../specs/2026-11-04-navigation-content-design.md
- [ ] Pin navigation and invite access behavior with tests.
- [ ] Change rail destinations and Games hub to three entries; label and preserve DM discovery.
- [ ] Include published invited tables in discovery and public profiles, keep launch and code authorization unchanged; test with isolated DB fixtures.
- [ ] Build knowledge categories, long-form editorial pages and authenticated author-owned homebrew CRUD with bounds and escaped text.
- [ ] Remove Home duplicate store and chat launcher; restyle XP using existing artwork.
- [ ] Collapse marketplace filters, add one-line horizontally scrollable category rail, audit mobile overflow.
- [ ] Run API and Linux Web builds, focused regression/integration tests, inspect browser at 320/390/768/1440, verify live baseline and backup before guarded deployment.
Review focus: invited table visible but unauthorized launch rejected; draft never listed; authors cannot edit another author's work; no HTML injection; long text/320px width does not cover rail or neighboring content. No real data mutations as tests.
