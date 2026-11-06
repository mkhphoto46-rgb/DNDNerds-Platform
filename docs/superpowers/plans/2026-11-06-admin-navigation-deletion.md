# Admin navigation and table deletion implementation plan

**Goal:** Consolidate related admin functions under four category paths and make permanent table deletion clearly available from table management without removing existing tools.
**Architecture:** Shared category navigation and landing pages, preserve existing API/role/reauth/audit/VTT deletion queue. Move old crowded admin landing console to marketplace settings. Deep links select a table editor directly. Pending deletion reloads version before retry.
**Tech Stack:** Existing Next.js, React, CSS modules, Fastify/PostgreSQL integration tests.

- [x] Add an integration regression proving non-owner admin deletion completes after VTT acknowledges, using original host identity and retaining accounts/other tables. Run current queued deletion tests.
- [x] Add four grouped admin landing pages/shared navigation; retain every existing tool and gate data by existing admin API.
- [x] Direct table edit/delete links from older management and list rows; place confirmation credentials locally; refresh pending deletion versions.
- [x] Explain password hash storage; no plaintext disclosure. Await user choice before adding email reset dispatch.
- [x] Browser QA authenticated synthetic account at 320/390 and desktop, including delete through BFF with disposable fixture and no production deletions.
- [x] Typecheck/build, fresh review, guarded backed-up deployment and live route checks. Preserve API, database, VTT, private settings and supplied UI assets.
