# Discovery and campaign lifecycle — 2026-11-01

Status: implemented and locally tested; browser visual QA and production release are pending. No production migration or runtime replacement was performed for this change.

- Discovery cards use full-width landscape campaign covers with a native image dialog. DM cards include their banner/avatar, a short biography, direct feedback and recent comments.
- Campaign and DM votes are independent like/dislike records. A user can switch or clear a vote and edit one comment per target. Self-feedback is refused. Historical comments remain; old stars are not converted into votes.
- Visible lists refresh every 15 seconds, on focus and on mutation. Refresh work is serialized. Owner forms initialize once per target so background updates preserve edits.
- Campaign covers now allow a 1280x800 WebP preview up to500,000bytes. Existing smaller images remain valid; a new upload is needed to supply more original detail.
- Owner deletion requires the exact title. A persistent PostgreSQL queue hides the table before contacting VTT. A signed, idempotent VTT operation removes campaign-scoped state/files/seats. Durable tombstones reject outstanding launch tokens. Accounts and independent DM reviews remain.
- Existing native VTT deletion now requires the campaign owner; player membership does not grant deletion.

Validation: API TypeScript/build and Web production build passed. Five focused API tests passed against fresh PostgreSQL (feedback, profile/privacy, deletion retry/cascades, bridge signing, cover bounds). Refresh serialization test passed. VTT server typecheck, eight focused units and isolated deletion integration passed, including player403, forged signature/owner refusal, socket removal, persistent launch revocation and cleanup retry.

Browser QA was attempted with an isolated fixture API. Automatic tool review rejected the local Next preview server both before and after explicit user approval, without a stated reason; desktop/mobile screenshots and browser interactions are NOT verified. This remains a release gate.

Migration0031 must run before the new API is started. Production migration and runtime cutover need explicit approval under the adopted deployment brief after the release package and backup are ready. The earlier player-join hotfix approval is not reused for this migration.
