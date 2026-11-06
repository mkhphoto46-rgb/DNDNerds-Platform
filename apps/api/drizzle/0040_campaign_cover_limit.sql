-- B35: 500,000 binary WebP bytes become up to 666,691 data-URL bytes. Same limit as
-- ops/fixes/campaign-cover-limit.sql; safe to run where that hotfix was applied by hand.
ALTER TABLE game_tables DROP CONSTRAINT IF EXISTS game_tables_image_data_check;
--> statement-breakpoint
ALTER TABLE game_tables ADD CONSTRAINT game_tables_image_data_check CHECK (image_data IS NULL OR octet_length(image_data) <= 700000);
