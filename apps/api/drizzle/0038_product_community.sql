CREATE TABLE marketplace_product_community (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES products(id),
 user_id uuid NOT NULL REFERENCES users(id), kind text NOT NULL CHECK(kind IN ('COMMENT','REVIEW')),
 body text NOT NULL CHECK(char_length(btrim(body)) BETWEEN 3 AND 2000), rating integer,
 delivery_evidence_id uuid REFERENCES marketplace_delivery_evidence(id),
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PUBLISHED','REJECTED')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(product_id,user_id,kind),
 CHECK((kind='COMMENT' AND rating IS NULL AND delivery_evidence_id IS NULL) OR
       (kind='REVIEW' AND rating BETWEEN 1 AND 5 AND rating IS NOT NULL AND delivery_evidence_id IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX marketplace_product_community_public ON marketplace_product_community(product_id,status,created_at DESC,id DESC);
CREATE INDEX marketplace_product_community_queue ON marketplace_product_community(status,created_at DESC,id DESC);
CREATE TABLE marketplace_product_community_submissions (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id),
 entry_id uuid NOT NULL REFERENCES marketplace_product_community(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX marketplace_product_community_daily ON marketplace_product_community_submissions(user_id,created_at);
--> statement-breakpoint
CREATE FUNCTION marketplace_product_review_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.kind='REVIEW' AND NOT EXISTS(
  SELECT 1 FROM marketplace_delivery_evidence d
  JOIN marketplace_seller_orders so ON so.id=d.seller_order_id
  JOIN marketplace_orders o ON o.id=so.order_id
  JOIN marketplace_order_items oi ON oi.seller_order_id=so.id AND oi.product_id=NEW.product_id
  JOIN stores s ON s.id=so.store_id JOIN seller_profiles sp ON sp.id=s.seller_profile_id
  WHERE d.id=NEW.delivery_evidence_id AND o.user_id=NEW.user_id AND so.status='DELIVERED'
   AND d.delivered_at IS NOT NULL AND length(btrim(d.evidence_ref))>0
   AND d.reviewer_id<>NEW.user_id AND d.reviewer_id<>sp.user_id AND NEW.user_id<>sp.user_id
   AND NOT EXISTS(SELECT 1 FROM store_members m WHERE m.store_id=s.id AND m.user_id IN(NEW.user_id,d.reviewer_id))
 ) THEN RAISE EXCEPTION 'Verified independent product delivery required' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER marketplace_product_review_evidence BEFORE INSERT OR UPDATE ON marketplace_product_community FOR EACH ROW EXECUTE FUNCTION marketplace_product_review_evidence();
