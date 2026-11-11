ALTER TABLE products ADD COLUMN gallery_extra_urls jsonb NOT NULL DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE products ADD CONSTRAINT products_gallery_limit CHECK (
  jsonb_typeof(gallery_extra_urls) = 'array'
  AND jsonb_array_length(gallery_extra_urls) <= 4
  AND (image_url IS NOT NULL OR gallery_extra_urls = '[]'::jsonb)
);
--> statement-breakpoint
CREATE INDEX products_gallery_extra_urls_idx ON products USING gin (gallery_extra_urls);
