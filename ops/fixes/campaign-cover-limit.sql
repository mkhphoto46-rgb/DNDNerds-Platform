-- Targeted repair: 500,000 binary WebP bytes become up to 666,691 data-URL bytes.
-- Does not advance the Drizzle ledger or apply unrelated pending migrations.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
ALTER TABLE public.game_tables DROP CONSTRAINT game_tables_image_data_check;
ALTER TABLE public.game_tables ADD CONSTRAINT game_tables_image_data_check
  CHECK (image_data IS NULL OR octet_length(image_data) <= 700000);
COMMIT;
