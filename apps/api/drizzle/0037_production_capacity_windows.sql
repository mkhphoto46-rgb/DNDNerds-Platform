CREATE TABLE marketplace_capacity_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), variant_id uuid NOT NULL REFERENCES product_variants(id),
  starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, order_cutoff_at timestamptz NOT NULL,
  capacity_total integer NOT NULL CHECK(capacity_total BETWEEN 1 AND 1000000),
  reserved integer NOT NULL DEFAULT 0 CHECK(reserved>=0), committed integer NOT NULL DEFAULT 0 CHECK(committed>=0),
  version integer NOT NULL DEFAULT 1 CHECK(version>0), status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','CLOSED')),
  created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(ends_at>starts_at AND order_cutoff_at<=starts_at), CHECK(reserved+committed<=capacity_total)
);
--> statement-breakpoint
CREATE INDEX marketplace_capacity_variant_period ON marketplace_capacity_windows(variant_id,status,order_cutoff_at);
--> statement-breakpoint
CREATE TABLE marketplace_capacity_bookings (
  reservation_id uuid PRIMARY KEY REFERENCES inventory_reservations(id),
  window_id uuid NOT NULL REFERENCES marketplace_capacity_windows(id),
  order_item_id uuid NOT NULL UNIQUE REFERENCES marketplace_order_items(id),
  quantity integer NOT NULL CHECK(quantity>0), released_quantity integer NOT NULL DEFAULT 0,
  started_at timestamptz, window_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), CHECK(released_quantity BETWEEN 0 AND quantity)
);
--> statement-breakpoint
CREATE INDEX marketplace_capacity_booking_window ON marketplace_capacity_bookings(window_id);
--> statement-breakpoint
CREATE FUNCTION marketplace_capacity_window_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'CAPACITY_WINDOW_IMMUTABLE'; END IF;
  IF NEW.variant_id IS DISTINCT FROM OLD.variant_id OR NEW.starts_at IS DISTINCT FROM OLD.starts_at OR NEW.ends_at IS DISTINCT FROM OLD.ends_at
    OR NEW.order_cutoff_at IS DISTINCT FROM OLD.order_cutoff_at OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'CAPACITY_WINDOW_PROMISE_IMMUTABLE';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER capacity_window_immutable BEFORE UPDATE OR DELETE ON marketplace_capacity_windows FOR EACH ROW EXECUTE FUNCTION marketplace_capacity_window_immutable();
--> statement-breakpoint
CREATE FUNCTION marketplace_capacity_booking_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r record; w record; delta integer;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'CAPACITY_BOOKING_IMMUTABLE'; END IF;
  IF TG_OP='INSERT' THEN
    SELECT * INTO r FROM inventory_reservations WHERE id=NEW.reservation_id FOR SHARE;
    IF NOT FOUND OR r.status<>'ACTIVE' THEN RAISE EXCEPTION 'CAPACITY_RESERVATION_INVALID'; END IF;
    SELECT * INTO w FROM marketplace_capacity_windows WHERE id=NEW.window_id FOR UPDATE;
    IF NOT FOUND OR w.variant_id<>r.variant_id THEN RAISE EXCEPTION 'CAPACITY_WINDOW_SCOPE_INVALID'; END IF;
    NEW.order_item_id=r.order_item_id; NEW.quantity=r.quantity; NEW.released_quantity=0; NEW.started_at=NULL;
    NEW.window_snapshot=jsonb_build_object('id',w.id,'version',w.version,'startsAt',w.starts_at,'endsAt',w.ends_at,'orderCutoffAt',w.order_cutoff_at);
  ELSE
    IF NEW.reservation_id IS DISTINCT FROM OLD.reservation_id OR NEW.window_id IS DISTINCT FROM OLD.window_id OR NEW.order_item_id IS DISTINCT FROM OLD.order_item_id
      OR NEW.quantity IS DISTINCT FROM OLD.quantity OR NEW.window_snapshot IS DISTINCT FROM OLD.window_snapshot OR NEW.released_quantity<OLD.released_quantity
      OR (OLD.started_at IS NOT NULL AND NEW.started_at IS DISTINCT FROM OLD.started_at) THEN RAISE EXCEPTION 'CAPACITY_BOOKING_IMMUTABLE'; END IF;
    delta=NEW.released_quantity-OLD.released_quantity;
    IF delta>0 THEN
      SELECT * INTO r FROM inventory_reservations WHERE id=NEW.reservation_id;
      IF NEW.started_at IS NOT NULL OR r.status NOT IN ('CONSUMED','RELEASED') THEN RAISE EXCEPTION 'CAPACITY_WORK_ALREADY_STARTED'; END IF;
      UPDATE marketplace_capacity_windows SET committed=committed-delta WHERE id=NEW.window_id AND committed>=delta;
      IF NOT FOUND THEN RAISE EXCEPTION 'CAPACITY_COUNTER_MISMATCH'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER capacity_booking_snapshot BEFORE INSERT OR UPDATE OR DELETE ON marketplace_capacity_bookings FOR EACH ROW EXECUTE FUNCTION marketplace_capacity_booking_snapshot();
--> statement-breakpoint
CREATE FUNCTION marketplace_capacity_book() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE marketplace_capacity_windows SET reserved=reserved+NEW.quantity WHERE id=NEW.window_id AND status='OPEN'
    AND order_cutoff_at>now() AND capacity_total-reserved-committed>=NEW.quantity;
  IF NOT FOUND THEN RAISE EXCEPTION 'CAPACITY_NOT_AVAILABLE'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER capacity_book AFTER INSERT ON marketplace_capacity_bookings FOR EACH ROW EXECUTE FUNCTION marketplace_capacity_book();
--> statement-breakpoint
CREATE FUNCTION marketplace_capacity_reservation_transition() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b record;
BEGIN
  SELECT * INTO b FROM marketplace_capacity_bookings WHERE reservation_id=NEW.id FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF NEW.order_id IS DISTINCT FROM OLD.order_id OR NEW.order_item_id IS DISTINCT FROM OLD.order_item_id OR NEW.variant_id IS DISTINCT FROM OLD.variant_id
    OR NEW.quantity IS DISTINCT FROM OLD.quantity THEN RAISE EXCEPTION 'CAPACITY_RESERVATION_IMMUTABLE'; END IF;
  IF NEW.status=OLD.status THEN RETURN NEW; END IF;
  IF OLD.status='ACTIVE' AND NEW.status IN ('CONSUMED','RELEASED','EXPIRED') THEN
    UPDATE marketplace_capacity_windows SET reserved=reserved-b.quantity,committed=committed+CASE WHEN NEW.status='CONSUMED' THEN b.quantity ELSE 0 END
      WHERE id=b.window_id AND reserved>=b.quantity;
    IF NOT FOUND THEN RAISE EXCEPTION 'CAPACITY_COUNTER_MISMATCH'; END IF;
  ELSIF OLD.status='CONSUMED' AND NEW.status='RELEASED' THEN
    IF b.started_at IS NULL THEN UPDATE marketplace_capacity_bookings SET released_quantity=quantity WHERE reservation_id=NEW.id; END IF;
  ELSE RAISE EXCEPTION 'CAPACITY_RESERVATION_TRANSITION_INVALID';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER capacity_reservation_transition AFTER UPDATE ON inventory_reservations FOR EACH ROW EXECUTE FUNCTION marketplace_capacity_reservation_transition();
--> statement-breakpoint
CREATE FUNCTION marketplace_capacity_fulfillment_transition() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b record;
BEGIN
  IF NEW.status=OLD.status THEN RETURN NEW; END IF;
  IF NEW.status IN ('PROCESSING','SHIPPED','DELIVERED','REFUNDED') THEN
    FOR b IN SELECT cb.* FROM marketplace_capacity_bookings cb JOIN marketplace_order_items oi ON oi.id=cb.order_item_id
      JOIN inventory_reservations ir ON ir.id=cb.reservation_id WHERE oi.seller_order_id=NEW.id AND ir.status='CONSUMED' ORDER BY cb.window_id
    LOOP
      IF NEW.status='REFUNDED' THEN
        IF b.started_at IS NULL THEN UPDATE marketplace_capacity_bookings SET released_quantity=quantity WHERE reservation_id=b.reservation_id; END IF;
      ELSE UPDATE marketplace_capacity_bookings SET started_at=coalesce(started_at,now()) WHERE reservation_id=b.reservation_id;
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER capacity_fulfillment_transition AFTER UPDATE OF status ON marketplace_seller_orders FOR EACH ROW EXECUTE FUNCTION marketplace_capacity_fulfillment_transition();
