# Player admission and invitation bridge repair

User authorized production publication to the existing Tadserver VPS serving dndnerds.ir. This was a runtime hotfix, separate from the pending Docker migration.

## Reproduced failures

- The site issued a valid player launch for a published table before the DM had ever entered. VTT rejected it with NOT_OPENED. The site API had already returned200, so the failure occurred after navigation.
- The site invitation form accepted only8–32characters, whereas the VTT DM shares a6-character campaign code. Real failed site requests returned400.
- Initial browser resume hid a rejected socket join and erased its recovery target. A stale adventurer name could also be inherited from another browser account.

## Resulting behavior

A signed site launch can provision a table for its authenticated signed host before that host arrives. Ownership/DM membership belongs to the host; the arriving player receives player membership only. The original site invitation code still uses the existing seat reservation transaction. Native6-character invitations are resolved by an HMAC-authenticated private request and converted to player-only, short-lived, single-use launch tickets. Linked site tables also reserve the same game_applications seat under the existing row lock, status and capacity checks. Native-only campaigns retain their own VTT membership limits. Code/campaign binding is checked again on redemption.

Fresh site launches use the server-authenticated account name instead of another account's saved name. Failed initial socket joins show their actual error and retain the intended table for retry. Canonical base64url signature validation prevents equivalent signature text from bypassing replay detection.

## Validation

- Before/after reproduction: player-first launch initially400NOT_OPENED; after repair player seated before DM, then actual DM entered the same campaign with DM ownership.
- Isolated real PostgreSQL plus API and VTT smoke passed site-code admission, native-code admission, a full table409, two accepted seats, preserved DM ownership and three real Socket.IO joins. Fixture emails use example.invalid and no email was sent.
- Browser proof: a deliberately stale local account name was present; the launched player entered as the current authenticated player while DM remained offline.
- VTT suite:1832tests,1769passed,63skipped,0failed. API targeted tests and Web/API production builds/typechecks passed. Skips are not presented as passed checks.
- Independent review identified a replay encoding edge and deployment permission risk; both received regression verification. A Linux test proved actual runtime-user readability and unchanged existing destination directory metadata.
- Live VTT source baseline verified from the existing release marker:d5a5b7b4f8915ea1d821bb1d99f7c000da1f657f8. Integrated latest main before building; original dirty SMM checkout was not overwritten.

Runtime source: platform aba78fbe120c2ea8776de053450d5a2ca96a1699; VTT ef799734aab593bd9cac51e768fd2d9a9ca85ab5. Web build:hO82nOAijNeb770tA6pmy. Archive SHA256:40721738bd6dfc64a6554c4cf78e635add65725707c81edb229fd450290eb86e.

## Recovery and production checks

Private, server-local recovery snapshot contains a compatible PostgreSQL custom dump, five verified standalone SQLite backups, media, previous runtime and private configuration. Backup paths and contents remain outside public Git. The first preflight rejected a manifest containing transient SQLite WAL/shared-memory files before changing the app. Snapshot code was corrected to checkpoint/close databases before hashing; a new snapshot was verified and used.

The approved second rollout completed and recorded released=true. Service is active. API/VTT readiness, public play/find-game/VTT pages and exact bootstrap/lazy VTT asset hashes were checked after restart. Private app environment, support settings, email override and voice public URL fingerprints remained unchanged. No database migration file, DNS, firewall or TLS setting changed. Runtime rollback preserves player data and existing hashed assets.

Authenticated DM/player journey checks ran in isolated local fixtures. No new real-user registration or email test was performed in production. Public unauthenticated checks remain protected; users can now retry their own table through a freshly loaded site page.
