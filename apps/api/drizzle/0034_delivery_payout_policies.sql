CREATE TABLE marketplace_payout_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), version bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  scope text NOT NULL DEFAULT 'SANDBOX' CHECK(scope='SANDBOX'), name varchar(180) NOT NULL,
  return_window_hours integer NOT NULL CHECK(return_window_hours BETWEEN 0 AND 8784),
  settlement_delay_hours integer NOT NULL CHECK(settlement_delay_hours BETWEEN 0 AND 8784),
  evidence_ref varchar(500) NOT NULL, reason varchar(1000) NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE marketplace_payout_policy_approvals (
  policy_id uuid PRIMARY KEY REFERENCES marketplace_payout_policies(id),
  approved_by uuid NOT NULL REFERENCES users(id), reason varchar(1000) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE FUNCTION marketplace_independent_policy_approval() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM marketplace_payout_policies WHERE id=NEW.policy_id AND created_by=NEW.approved_by) THEN
    RAISE EXCEPTION 'Policy approval requires an independent operator';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER independent_payout_policy BEFORE INSERT ON marketplace_payout_policy_approvals FOR EACH ROW EXECUTE FUNCTION marketplace_independent_policy_approval();
--> statement-breakpoint
CREATE TABLE marketplace_payout_policy_revocations (
  policy_id uuid PRIMARY KEY REFERENCES marketplace_payout_policies(id),
  revoked_by uuid NOT NULL REFERENCES users(id), reason varchar(1000) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE marketplace_delivery_evidence ADD COLUMN delivered_at timestamptz;
--> statement-breakpoint
ALTER TABLE marketplace_delivery_evidence ADD CONSTRAINT marketplace_delivery_time_valid CHECK(delivered_at IS NULL OR delivered_at <= confirmed_at);
--> statement-breakpoint
CREATE TRIGGER payout_policy_immutable BEFORE UPDATE OR DELETE ON marketplace_payout_policies FOR EACH STATEMENT EXECUTE FUNCTION marketplace_immutable_journal();
--> statement-breakpoint
CREATE TRIGGER payout_approval_immutable BEFORE UPDATE OR DELETE ON marketplace_payout_policy_approvals FOR EACH STATEMENT EXECUTE FUNCTION marketplace_immutable_journal();
--> statement-breakpoint
CREATE TRIGGER payout_revocation_immutable BEFORE UPDATE OR DELETE ON marketplace_payout_policy_revocations FOR EACH STATEMENT EXECUTE FUNCTION marketplace_immutable_journal();
--> statement-breakpoint
CREATE TRIGGER delivery_evidence_immutable BEFORE UPDATE OR DELETE ON marketplace_delivery_evidence FOR EACH STATEMENT EXECUTE FUNCTION marketplace_immutable_journal();
