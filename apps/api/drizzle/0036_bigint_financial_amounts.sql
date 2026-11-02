-- Widen every remaining marketplace financial integer consistently. Existing
-- snapshots and postings stay intact. JS API values are bounded to exact integers.
SET LOCAL lock_timeout='5s';
--> statement-breakpoint
DO $$
DECLARE field record;
BEGIN
  FOR field IN SELECT * FROM (VALUES
    ('payment_intents','amount_rial'),
    ('payments','amount_rial'),('payments','refunded_rial'),
    ('refunds','amount_rial'),
    ('seller_balances','pending_rial'),('seller_balances','available_rial'),
    ('seller_balances','negative_rial'),('seller_balances','paid_out_rial'),
    ('financial_ledger_postings','amount_rial'),
    ('seller_payout_requests','amount_rial'),
    ('marketplace_refund_cases','refund_amount_rial'),
    ('marketplace_refund_cases','commission_reversal_rial'),
    ('marketplace_refund_cases','seller_net_reversal_rial')
  ) AS target(table_name,column_name)
  LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE bigint',field.table_name,field.column_name);
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (%I BETWEEN -9007199254740991 AND 9007199254740991)',
      field.table_name,'safemoney_'||field.table_name||'_'||field.column_name,field.column_name);
  END LOOP;
END $$;
