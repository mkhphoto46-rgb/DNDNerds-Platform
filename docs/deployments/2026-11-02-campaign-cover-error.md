# Campaign creation500 — campaign cover persistence limit

Status: repaired on the existing Tadserver on2026-11-02 after explicit approval. PostgreSQL backup was verified before applying the targeted CHECK repair. No application restart occurred.

The API/browser campaign-cover limit was raised to500,000 binary WebP bytes in the discovery release, but PostgreSQL retained `game_tables_image_data_check` from migration0029: at most140,000 data-URL bytes. Base64 expands a500,000byte image to666,668 characters, plus the23-character prefix. A valid API request therefore failed the database CHECK and returned500. Production PostgreSQL logs identify that exact constraint; current constraint inspection confirms the old140,000 bound. No real campaign was created for diagnosis.

This omission was in the previous discovery release. A unit test of the image validator passed because it did not exercise PostgreSQL persistence. The new regression covers actual API create and owner edit against real PostgreSQL, plus refusal of500,001binary bytes. Before repair: expected201, received500. After repair: test passed; owner edit200 and oversized input400.

Targeted repair: `ops/fixes/campaign-cover-limit.sql` transactionally replaces only the image CHECK with a700,000byte data-URL bound, matching the existing500KB API allowance. Existing data is preserved; no application restart, asset replacement, role change or unrelated marketplace migration is required. A5second lock timeout prevents waiting indefinitely. Do not execute without approved production repair and a verified PostgreSQL backup.

The SQL does not advance the Drizzle ledger: concurrent unrelated marketplace migrations are pending locally, and changing the journal watermark could skip them. A future generated migration must preserve this image bound. This targeted repair is idempotent in effect and does not modify the older migration files or the concurrent marketplace work.

Validation: `node --import tsx --test --test-force-exit tests/integration/campaign-cover-persistence.test.ts` from apps/api with explicitly configured loopback QA PostgreSQL and Redis. The test owns a disposable randomly named database and applies the repair there; no emails or production writes are made.

Production verification: the700,000byte bound is active; a temporary table copied from the live schema accepted the666,691byte data URL and refused700,001bytes. The temporary transaction rolled back; no real campaign/user/review row was inserted. Service main PID stayed unchanged and systemd reports active. Declarative schema now records the same bound. Concurrent marketplace files and the migration journal were left untouched.
