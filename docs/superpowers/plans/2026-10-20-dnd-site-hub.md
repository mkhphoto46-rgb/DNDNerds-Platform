# DND Site Hub Implementation Plan

> **For agentic workers:** Implement in the current checkout in small, verified steps. The separate WebVTT game engine is outside this plan.

**Goal:** Make the existing DND Nerds site tabs useful for discovering DMs and tables, managing participation, seeing arena lobby information, and administering the platform.

**Architecture:** Extend the existing Fastify/PostgreSQL API and Next.js BFF. Keep authentication in the current session cookie and use the existing active admin role. The site stores lobby and campaign data; a later WebVTT integration will attach to this data without rebuilding the game.

**Tech Stack:** Next.js 16, React, Fastify 5, Drizzle ORM, PostgreSQL.

**Spec:** User request in this conversation on 2026-10-20, including the clarification that WebVTT is built separately.

## Global Constraints

- Preserve the existing site design direction and navigation.
- Do not implement a second game engine or map builder.
- Never show nonworking game launch or payment controls as functional.
- Keep write operations authenticated and admin actions role checked.

## Review Focus

- An unauthenticated visitor can browse public DMs and published tables, but cannot edit or apply.
- A DM cannot approve more players than table capacity.
- A user cannot apply to their own table or duplicate an active application.
- Hidden tables and profiles are absent from public discovery.
- Admin data and moderation are inaccessible without an active admin role.

---

### Task 1: Game hub persistence and API

**Files:** `apps/api/src/db/schema.ts`, generated Drizzle migration, `apps/api/src/routes/game-hub.ts`, `apps/api/src/app.ts`.

- [ ] Add DM profiles, campaign tables, player applications and arena lobby records with indexed owner/status fields.
- [ ] Add public browse endpoints and authenticated profile, table, application and arena actions.
- [ ] Enforce ownership, status transitions and table capacity on the server.
- [ ] Run API typecheck, generate and apply the additive migration, and check public/unauthorized responses.

### Task 2: Site tabs and account flows

**Files:** `apps/web/src/app/api/game-hub/[...path]/route.ts`, game hub components, `/find-game`, `/find-dm`, `/play`, `/arena`, `/account`, shared CSS.

- [ ] Replace placeholder routes with data-driven discovery and management pages.
- [ ] Connect forms to the API and provide useful empty, loading, error and guest states.
- [ ] Add clear WebVTT connection status without a fake game engine.
- [ ] Run web build and inspect desktop and mobile views.

### Task 3: Admin and remaining site content

**Files:** admin API route, `/admin`, `/learn`, `/news`, `/pricing`.

- [ ] Add role-gated platform summary and table/DM moderation.
- [ ] Connect the existing marketplace and payout panels from one dashboard.
- [ ] Replace editorial placeholders with accurate, usable site guidance and status content.
- [ ] Verify unauthorized admin requests, builds, and the running site.
