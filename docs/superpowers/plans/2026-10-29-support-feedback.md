# Voluntary support, feedback and profile images

Direct user request: free accounts for now, manual voluntary donations with owner-supplied public transfer details, a text-only criticism/comment/suggestion page, avatar500KB/header1MB. User explicitly added Support and Feedback to the hamburger; this supersedes the earlier four-item count, while preserving direct links without nested menus.

Implementation uses existing Next/Fastify/PostgreSQL stack. /support exposes only three allowlisted intentionally public config fields, with copy controls and a D&D-themed message. /pricing redirects there and the public plan API explicitly returns free/zero-price under FREE_LAUNCH_MODE; account subscription link becomes voluntary support. Transfer values stay out of source control and are configured in a separate support-public.json on the VPS with backup.

Feedback is account-authenticated, private to its author and authorized admins, persisted with status and audit logs, rate-limited5/10minutes, and strict-schema text only. Admin dashboard has a feedback destination. No image input, attachment storage or public message feed.

Migration0030 adds feedback and relaxes encoded image caps. Profile validators/converters allow500000-byte avatar and1000000-byte banner; campaign image limit remains100000bytes. Two profile PUT routes accept their combined base64 payload without increasing the global request limit.

Verification: tests first failed on old image bounds and missing feedback route. Both tests then passed with disposable PostgreSQL and Redis: boundary validation, combined maximum profile persistence for player/DM, privacy/admin/status/audit paths, image-field rejection and rate limiting. Web/API typechecks and builds passed. Independent review found no important regression; admin view currently lists newest100 messages and author view newest20.

Deployment must preserve current livebase24b42db/buildBbbpBhTcdCgjXUHQ42BUO, unrelated email/API files, VTT and data. Database/code backups and secret-environment fingerprint verification and automatic rollback required. Post-deploy browser checks: public transfer data/copy, menu links, anonymous vs signed-in feedback/admin access, absence of attachment input, updated profile labels, and main service health.

The first deployment-script preparation was rejected with blocked by policy. Deployment scope was reduced to a separate public support config file; no secret environment rewrite. The public plan API returns free/zero-price during free launch, covered by the integration test.
