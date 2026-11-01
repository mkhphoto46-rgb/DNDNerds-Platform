# Discovery and campaign lifecycle — 2026-11-01

Status: released to the existing Tadserver serving dndnerds.ir on2026-11-01, after explicit publication approval and a second timing approval covering two active campaign connections.

- Discovery cards use full-width landscape campaign covers with a native image dialog. DM cards include their banner/avatar, a short biography, direct feedback and recent comments.
- Campaign and DM votes are independent like/dislike records. A user can switch or clear a vote and edit one comment per target. Self-feedback is refused. Historical comments remain; old stars are not converted into votes.
- Visible lists refresh every 15 seconds, on focus and on mutation. Refresh work is serialized. Owner forms initialize once per target so background updates preserve edits.
- Campaign covers now allow a 1280x800 WebP preview up to500,000bytes. Existing smaller images remain valid; a new upload is needed to supply more original detail.
- Owner deletion requires the exact title. A persistent PostgreSQL queue hides the table before contacting VTT. A signed, idempotent VTT operation removes campaign-scoped state/files/seats. Durable tombstones reject outstanding launch tokens. Accounts and independent DM reviews remain.
- Existing native VTT deletion now requires the campaign owner; player membership does not grant deletion.

Validation: API TypeScript/build and Web production build passed. Five focused API tests passed against fresh PostgreSQL (feedback, profile/privacy, deletion retry/cascades, bridge signing, cover bounds). Refresh serialization test passed. VTT server typecheck, eight focused units and isolated deletion integration passed, including player403, forged signature/owner refusal, socket removal, persistent launch revocation and cleanup retry.

The local Next preview server was previously blocked by automatic tool review. After the approved release, browser QA on the actual public site verified DM banners/avatars and likes/dislikes, campaign covers, both image dialogs and Escape/focus return. DM and campaign mobile widths were390px with375px document width, without horizontal overflow. The public DM page showed its direct-review section and no star symbols. Authenticated write/delete cases remain covered by isolated fixtures; no production feedback or real campaign deletion was performed.

Migration0031 was applied by the existing production Drizzle migrator before starting the new API. Latest migration timestamp:1793491200000. The previous31entries were preserved and only0031 was added. Prior user, table and campaign-review row counts were preserved. Private app/support/email/voice setting fingerprints stayed unchanged.

A fresh private snapshot passed PostgreSQL custom-archive checks, five standalone SQLite integrity checks, archive-read checks and SHA256 manifest verification. The Linux deployment copier test confirmed actual runtime-user readability and preserved existing directory metadata. Deployment preflight found two active seats; the user explicitly approved a short restart. The release completed with released=true and the app is active. Rollback restores runtime files; the additive migration and user data are preserved.

Live checks: API/VTT readiness and public find-game/find-dm/play/VTT pages passed. Public table/DM summaries expose independent reaction fields and recentReviews, no rating field; DM rows include banner/avatar. Exact JS/CSS bytes referenced by the new public pages matched the staged build. A guest reaction with valid Origin returned401, and unsigned VTT deletion returned403. No DNS, firewall, TLS, email, voice configuration or Docker cutover was changed.

Runtime source: platform ee3b54c031499774c43fb7fc5679f0801e86642b; VTT e5fdf1e83b5d040970cc83853f414c13d50d0f93. Web build:HaKXpHDRvBqrMjDATnJzD. Release archive SHA256:0648b5e02c88361a32beea5af1fdc150b843f75668eeb1067317dcdc3ab4dfc5.

The supplemental Windows rerun completed three of five tests, then stalled with a profile-test subprocess still running; that owned test process was stopped. The earlier complete five-test run passed, and no application source changed after that run. This supplemental run is not counted as a complete pass. Production checks above were completed independently.
