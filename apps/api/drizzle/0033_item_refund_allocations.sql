ALTER TABLE marketplace_refund_cases ADD COLUMN requested_scope jsonb;
--> statement-breakpoint
ALTER TABLE marketplace_seller_orders ADD COLUMN fulfillment_snapshot jsonb;
--> statement-breakpoint
ALTER TABLE marketplace_refund_cases ADD COLUMN item_allocation jsonb;
--> statement-breakpoint
ALTER TABLE marketplace_refund_cases ADD CONSTRAINT refund_item_allocation_shape CHECK (
  item_allocation IS NULL OR (jsonb_typeof(item_allocation) = 'object' AND item_allocation->>'version' = '1')
);
