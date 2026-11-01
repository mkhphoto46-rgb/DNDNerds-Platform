# Campaign Discovery, Feedback and Owner Lifecycle Plan

> **For agentic workers:** Use superpowers:subagent-driven-development with focused implementation tasks, task review and whole-branch review.

**Goal:** Rich responsive campaign/DM discovery with automatic updates, independent likes/dislikes/comments and safe owner edit/delete.
**Architecture:** Existing Next/Fastify/PostgreSQL lists gain independent social targets; VTT remains on the audited linked worktree. Owner deletion persists intent, blocks new admission, deletes the linked VTT campaign through a signed idempotent bridge, then cascades the site row. A VTT tombstone prevents outstanding launch tickets recreating deleted tables.
**Tech Stack:** React19/Next16, Fastify, Drizzle/PostgreSQL, VTT SQLite and signed bridge.
**Spec:** User request1November2026 in this conversation: automatic tables; DM edit/delete including associated data; independent DM/campaign comments and like/dislike replacing stars; prominent clickable covers and DM banners/avatars.

## Global Constraints
- Work in existing clean platform linked worktree and VTT isolated worktree; preserve original dirty SMM checkout.
- Reuse existing active account authorization. Public read, active signed-in non-self write, one vote and one editable review per user/target; rating and comment are independent. No forged conversion of historical stars.
- Remove social star ratings throughout discovery/details/DM pages, retain historical comment text. New comments3–1200characters.
- Existing owner edit remains; auto-refresh must not overwrite unsaved forms. Visible-page refresh about15seconds, plus focus and mutation invalidation; no overlapping flood or background polling.
- Owner deletion requires explicit title confirmation in UI and ownership on server. Delete campaign-scoped state/media/sessions/members/applications/reviews/votes; preserve accounts, personal character libraries, other campaigns and independent DM feedback.
- Database migration and production publication require a fresh concrete approval under the adopted deployment brief. No real-user registration/email/delete tests.

## API contract for parallel implementation
Every summary has `likes`, `dislikes`, `myVote`(-1|1|null), `canReact`, `reviewCount`. Lists include `recentReviews` and DM `bannerData`, `avatarData`. Public DM page continues at game-hub/dms/:id/page.
- PUT game-hub/tables/:id/reaction or dms/:id/reaction with `{value:1|-1|null}` -> data reaction summary.
- PUT game-hub/tables/:id/review or dms/:id/review with `{comment}` -> data review. Independent of vote; one editable review.
- Detail/DM page includes `reviews` `{id,author,authorId?,comment,mine,createdAt,updatedAt}` and `canReview`. DM page may expose campaignReviews separately to retain historical campaign comments without counting them as direct DM votes.
- DELETE game-hub/tables/:id with `{confirmTitle:string}` ->200 `{data:{deleted:true}}` or202 `{data:{deletionPending:true}}`. Non-owner403. Pending rows HIDDEN and joined `deletionPending:true`; retry same delete is idempotent.
- Background processing retries persisted deletion requests, no player-data rollback.

## Tasks
1. Social backend (agent): schema/migration0031, summaries, votes/comments routes, preserve legacy comments, no star aggregates, banners in lists, tests.
2. Frontend (agent): image-first cards, modal image preview, DM identity cards, shared reactions/reviews, automatic refresh, owner lifecycle UI and all star removal. Own only frontend files.
3. Owner lifecycle (controller): PostgreSQL deletion job worker/routes; signed VTT deletion with tombstones and owner-only existing VTT deletion; regression/integration tests. Coordinate schema0031 additions with backend agent.
4. Integrate and review: API/web/VTT tests/builds; isolated realistic fixtures and desktop/mobile CUA screenshots, vote/comment/edit/update/delete/privacy/cascade/retry cases; independent review.
5. Stage snapshot/release and request explicit migration/publication approval. Publish only to existing Tadserver when approved; live checks; safe commits/push with verified remote SHAs.

## Review Focus
Self/other-user authorization and vote switching; historical data migration; cross-store deletion failure/replay/recreation; polling while editing; image preview keyboard/mobile focus.

Ruling: user previously opted out of routine design confirmations; implement their requested direction without another design gate. Publication/migration approval remains explicit. Existing private details and fixtures stay outside public Git.
