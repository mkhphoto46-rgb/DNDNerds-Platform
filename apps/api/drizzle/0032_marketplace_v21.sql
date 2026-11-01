ALTER TABLE products ADD COLUMN product_type text NOT NULL DEFAULT 'READY_TO_SHIP' CHECK (product_type IN ('READY_TO_SHIP','MADE_TO_ORDER','CUSTOM_DESIGN'));
ALTER TABLE products ADD COLUMN brand text NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN production_days integer NOT NULL DEFAULT 0 CHECK (production_days BETWEEN 0 AND 365);
ALTER TABLE products ADD COLUMN image_url text;
ALTER TABLE stores ADD COLUMN identity_evidence_ref text;
ALTER TABLE stores ADD COLUMN address_verified_at timestamptz;
ALTER TABLE stores ADD COLUMN featured_until timestamptz;
ALTER TABLE product_variants ADD COLUMN options jsonb NOT NULL DEFAULT '{}';
ALTER TABLE product_variants ADD COLUMN per_order_limit integer NOT NULL DEFAULT 99 CHECK (per_order_limit BETWEEN 1 AND 999);
ALTER TABLE product_variants ADD COLUMN price_effective_at timestamptz;
ALTER TABLE product_variants ADD COLUMN discount_rial bigint CHECK (discount_rial >= 1000);
ALTER TABLE product_variants ADD COLUMN discount_starts_at timestamptz;
ALTER TABLE product_variants ADD COLUMN discount_ends_at timestamptz;
ALTER TABLE product_variants ADD CONSTRAINT marketplace_discount_valid CHECK (discount_rial IS NULL OR (discount_rial < price_rial AND discount_starts_at IS NOT NULL AND discount_ends_at > discount_starts_at));
ALTER TABLE product_variants ADD COLUMN store_id uuid REFERENCES stores(id);
UPDATE product_variants v SET store_id=p.store_id FROM products p WHERE p.id=v.product_id;
ALTER TABLE product_variants ALTER COLUMN store_id SET NOT NULL;
ALTER TABLE product_variants DROP CONSTRAINT IF EXISTS product_variants_sku_unique;
CREATE UNIQUE INDEX marketplace_store_sku_unique ON product_variants(store_id,sku);
CREATE UNIQUE INDEX marketplace_one_default_variant ON product_variants(product_id) WHERE is_default;
CREATE INDEX marketplace_product_search ON products USING gin(to_tsvector('simple',name || ' ' || description || ' ' || category));
CREATE INDEX marketplace_product_listing ON products(status,category,id);
CREATE INDEX marketplace_variant_listing ON product_variants(product_id,status,price_rial);
CREATE INDEX marketplace_variant_options ON product_variants USING gin(options);
CREATE TABLE marketplace_price_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),variant_id uuid NOT NULL REFERENCES product_variants(id),old_price_rial bigint,new_price_rial bigint NOT NULL,old_state jsonb NOT NULL,new_state jsonb NOT NULL,effective_at timestamptz NOT NULL DEFAULT now());
CREATE FUNCTION marketplace_variant_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  SELECT store_id INTO NEW.store_id FROM products WHERE id=NEW.product_id;
  IF TG_OP='INSERT' THEN
    NEW.price_effective_at=now();
  ELSIF NEW.price_rial IS DISTINCT FROM OLD.price_rial OR NEW.discount_rial IS DISTINCT FROM OLD.discount_rial OR NEW.discount_starts_at IS DISTINCT FROM OLD.discount_starts_at OR NEW.discount_ends_at IS DISTINCT FROM OLD.discount_ends_at THEN
    NEW.price_effective_at=now();
    INSERT INTO marketplace_price_history(variant_id,old_price_rial,new_price_rial,old_state,new_state) VALUES(NEW.id,OLD.price_rial,NEW.price_rial,jsonb_build_object('price',OLD.price_rial,'discount',OLD.discount_rial,'starts',OLD.discount_starts_at,'ends',OLD.discount_ends_at),jsonb_build_object('price',NEW.price_rial,'discount',NEW.discount_rial,'starts',NEW.discount_starts_at,'ends',NEW.discount_ends_at));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER marketplace_variant_audit BEFORE INSERT OR UPDATE ON product_variants FOR EACH ROW EXECUTE FUNCTION marketplace_variant_audit();
CREATE TABLE marketplace_favorites(user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,product_id));
CREATE TABLE marketplace_articles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),store_id uuid NOT NULL REFERENCES stores(id),author_id uuid NOT NULL REFERENCES users(id),title varchar(180) NOT NULL,body text NOT NULL CHECK(length(body)<=12000),status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('DRAFT','PENDING','PUBLISHED','REJECTED')),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE marketplace_reviews(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),store_id uuid NOT NULL REFERENCES stores(id),user_id uuid NOT NULL REFERENCES users(id),seller_order_id uuid NOT NULL REFERENCES marketplace_seller_orders(id),rating integer NOT NULL CHECK(rating BETWEEN 1 AND 5),body varchar(2000) NOT NULL,status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PUBLISHED','REJECTED')),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(user_id,seller_order_id));
CREATE TABLE marketplace_stock_movements(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),variant_id uuid NOT NULL REFERENCES product_variants(id),actor_id uuid NOT NULL REFERENCES users(id),before_quantity integer NOT NULL,after_quantity integer NOT NULL,reason varchar(500) NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE marketplace_audit(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_id uuid REFERENCES users(id),action text NOT NULL,entity_id uuid,details jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE marketplace_category_definitions(slug text PRIMARY KEY,label text NOT NULL,attributes jsonb NOT NULL DEFAULT '{}');
INSERT INTO marketplace_category_definitions VALUES
('dice','تاس','{"color":"text","material":"text","faces":"text"}'),
('miniatures','مینیاتور','{"scale":"text","material":"text","color":"text","painted":"text"}'),
('clothing','پوشاک','{"size":"text","color":"text","material":"text"}'),
('accessories','اکسسوری و ماکت','{"size":"text","color":"text","material":"text","model":"text"}'),
('books','کتاب و ابزار بازی','{"language":"text","edition":"text"}');
CREATE TABLE marketplace_custom_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),buyer_id uuid NOT NULL REFERENCES users(id),store_id uuid NOT NULL REFERENCES stores(id),reference_key text NOT NULL,desired_output text NOT NULL,dimensions text NOT NULL,material text NOT NULL,quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 999),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE marketplace_quotes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),request_id uuid NOT NULL REFERENCES marketplace_custom_requests(id),version integer NOT NULL CHECK(version>0),price_rial bigint NOT NULL CHECK(price_rial BETWEEN 1000 AND 2000000000),production_days integer NOT NULL CHECK(production_days BETWEEN 1 AND 365),expires_at timestamptz NOT NULL,accepted_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(request_id,version));
CREATE TABLE marketplace_delivery_evidence(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),seller_order_id uuid NOT NULL REFERENCES marketplace_seller_orders(id),reviewer_id uuid NOT NULL REFERENCES users(id),evidence_ref text NOT NULL,reason text NOT NULL,policy_version text NOT NULL,confirmed_at timestamptz NOT NULL DEFAULT now(),UNIQUE(seller_order_id));
CREATE TABLE marketplace_gate_decisions(code text PRIMARY KEY,owner text NOT NULL DEFAULT '',evidence_ref text,decision text NOT NULL DEFAULT 'PENDING' CHECK(decision IN ('PENDING','APPROVED','REJECTED')),approved_by uuid REFERENCES users(id),expires_at timestamptz,updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO marketplace_gate_decisions(code) SELECT 'G-'||lpad(n::text,2,'0') FROM generate_series(1,12)n;
CREATE INDEX marketplace_articles_public ON marketplace_articles(store_id,status,created_at);
CREATE INDEX marketplace_reviews_public ON marketplace_reviews(store_id,status,created_at);
CREATE TABLE marketplace_media(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL REFERENCES users(id),data_webp text NOT NULL CHECK(length(data_webp)<=700000),created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX marketplace_media_owner ON marketplace_media(owner_id);
ALTER TABLE stores ADD COLUMN risk_cap_rial bigint NOT NULL DEFAULT 100000000 CHECK(risk_cap_rial>=0);
CREATE FUNCTION marketplace_immutable_journal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Immutable journal: use a compensating entry' USING ERRCODE='23514'; END $$;
CREATE TRIGGER marketplace_ledger_postings_immutable BEFORE UPDATE OR DELETE ON financial_ledger_postings FOR EACH STATEMENT EXECUTE FUNCTION marketplace_immutable_journal();
CREATE TRIGGER marketplace_ledger_transactions_immutable BEFORE UPDATE OR DELETE ON financial_ledger_transactions FOR EACH STATEMENT EXECUTE FUNCTION marketplace_immutable_journal();
CREATE TRIGGER marketplace_price_history_immutable BEFORE UPDATE OR DELETE ON marketplace_price_history FOR EACH STATEMENT EXECUTE FUNCTION marketplace_immutable_journal();
CREATE FUNCTION marketplace_balanced_journal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid; amount numeric; entries integer;
BEGIN
  IF TG_TABLE_NAME='financial_ledger_transactions' THEN target=NEW.id; ELSE target=NEW.transaction_id; END IF;
  SELECT coalesce(sum(amount_rial),0),count(*) INTO amount,entries FROM financial_ledger_postings WHERE transaction_id=target;
  IF amount<>0 OR entries<2 THEN RAISE EXCEPTION 'Unbalanced journal transaction' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER marketplace_ledger_balance_on_posting AFTER INSERT ON financial_ledger_postings DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION marketplace_balanced_journal();
CREATE CONSTRAINT TRIGGER marketplace_ledger_balance_on_transaction AFTER INSERT ON financial_ledger_transactions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION marketplace_balanced_journal();
CREATE TABLE marketplace_shipping_profiles(store_id uuid PRIMARY KEY REFERENCES stores(id),method text NOT NULL,fee_rial bigint NOT NULL CHECK(fee_rial BETWEEN 0 AND 2000000000),dispatch_days integer NOT NULL CHECK(dispatch_days BETWEEN 1 AND 365),version integer NOT NULL DEFAULT 1,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE marketplace_buyer_verifications(user_id uuid PRIMARY KEY REFERENCES users(id),mobile_verified_at timestamptz,evidence_ref text);
CREATE TABLE marketplace_checkout_snapshots(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id),items jsonb NOT NULL,shipping jsonb NOT NULL,expires_at timestamptz NOT NULL DEFAULT now()+interval '15 minutes',order_id uuid REFERENCES marketplace_orders(id),created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE marketplace_orders ADD COLUMN shipping_total_rial bigint NOT NULL DEFAULT 0 CHECK(shipping_total_rial>=0);
ALTER TABLE marketplace_seller_orders ADD COLUMN shipping_snapshot jsonb;
ALTER TABLE marketplace_quotes ADD COLUMN order_id uuid REFERENCES marketplace_orders(id);
ALTER TABLE inventory ADD COLUMN movement_revision bigint NOT NULL DEFAULT 0;
CREATE FUNCTION marketplace_inventory_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.quantity_on_hand IS DISTINCT FROM OLD.quantity_on_hand THEN NEW.movement_revision=OLD.movement_revision+1; END IF;
 IF NEW.quantity_on_hand<OLD.quantity_on_hand AND NEW.quantity_on_hand-NEW.quantity_reserved<=0 THEN
   INSERT INTO seller_notification_outbox(store_id,recipient_user_id,event_type,channel,dedupe_key,payload)
   SELECT v.store_id,m.user_id,'LOW_STOCK','IN_APP','LOW_STOCK:'||v.id||':'||NEW.movement_revision||':'||m.user_id,jsonb_build_object('variantId',v.id,'available',greatest(0,NEW.quantity_on_hand-NEW.quantity_reserved))
   FROM product_variants v JOIN store_members m ON m.store_id=v.store_id AND m.role IN ('OWNER','MANAGER','ORDER_MANAGER') WHERE v.id=NEW.variant_id ON CONFLICT(dedupe_key) DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER marketplace_inventory_event BEFORE UPDATE ON inventory FOR EACH ROW EXECUTE FUNCTION marketplace_inventory_event();
