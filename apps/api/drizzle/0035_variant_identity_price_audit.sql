-- Fail for ambiguous legacy combinations; never discard or rewrite live variants.
ALTER TABLE product_variants ADD COLUMN options_fingerprint bytea;
--> statement-breakpoint
UPDATE product_variants SET options_fingerprint=sha256(convert_to(options::text,'UTF8'));
--> statement-breakpoint
ALTER TABLE product_variants ALTER COLUMN options_fingerprint SET NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX marketplace_variant_combination_unique ON product_variants(product_id,options_fingerprint);
--> statement-breakpoint
ALTER TABLE marketplace_price_history ADD COLUMN actor_id uuid REFERENCES users(id);
--> statement-breakpoint
ALTER TABLE marketplace_price_history ADD COLUMN actor_db_role text;
--> statement-breakpoint
ALTER TABLE marketplace_price_history ADD COLUMN reason text;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION marketplace_variant_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  SELECT store_id INTO NEW.store_id FROM products WHERE id=NEW.product_id;
  NEW.options_fingerprint=sha256(convert_to(NEW.options::text,'UTF8'));
  IF TG_OP='INSERT' THEN
    NEW.price_effective_at=now();
  ELSIF NEW.price_rial IS DISTINCT FROM OLD.price_rial OR NEW.discount_rial IS DISTINCT FROM OLD.discount_rial OR NEW.discount_starts_at IS DISTINCT FROM OLD.discount_starts_at OR NEW.discount_ends_at IS DISTINCT FROM OLD.discount_ends_at THEN
    NEW.price_effective_at=now();
    INSERT INTO marketplace_price_history(variant_id,old_price_rial,new_price_rial,old_state,new_state,actor_id,actor_db_role,reason)
    VALUES(NEW.id,OLD.price_rial,NEW.price_rial,
      jsonb_build_object('price',OLD.price_rial,'discount',OLD.discount_rial,'starts',OLD.discount_starts_at,'ends',OLD.discount_ends_at),
      jsonb_build_object('price',NEW.price_rial,'discount',NEW.discount_rial,'starts',NEW.discount_starts_at,'ends',NEW.discount_ends_at),
      nullif(current_setting('dnd.marketplace_actor',true),'')::uuid,current_user,
      coalesce(nullif(current_setting('dnd.marketplace_reason',true),''),'Database operation; no application actor supplied'));
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE FUNCTION marketplace_variant_initial_price() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO marketplace_price_history(variant_id,old_price_rial,new_price_rial,old_state,new_state,effective_at,actor_id,actor_db_role,reason)
  VALUES(NEW.id,NULL,NEW.price_rial,'{}'::jsonb,
    jsonb_build_object('price',NEW.price_rial,'discount',NEW.discount_rial,'starts',NEW.discount_starts_at,'ends',NEW.discount_ends_at),
    NEW.price_effective_at,nullif(current_setting('dnd.marketplace_actor',true),'')::uuid,current_user,
    coalesce(nullif(current_setting('dnd.marketplace_reason',true),''),'Initial price; no application actor supplied'));
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER marketplace_variant_initial_price AFTER INSERT ON product_variants FOR EACH ROW EXECUTE FUNCTION marketplace_variant_initial_price();
