-- companies: deposit settings
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "default_deposit_type"          text         NOT NULL DEFAULT 'percentage';
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "default_deposit_percent"       numeric(5,2) NOT NULL DEFAULT 50;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "default_deposit_fixed"         numeric(10,2);
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "deposit_payment_instructions"  text;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "remaining_balance_due_days"    integer      NOT NULL DEFAULT 30;

-- jobs: enforce one job per enquiry (enables atomic idempotent insert)
-- Uses DO block because PostgreSQL does not support ADD CONSTRAINT IF NOT EXISTS.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'jobs_enquiry_id_unique' AND conrelid = 'jobs'::regclass
  ) THEN
    ALTER TABLE "jobs" ADD CONSTRAINT "jobs_enquiry_id_unique" UNIQUE ("enquiry_id");
  END IF;
END $$;

-- quotes: proposal and deposit tracking fields
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "proposal_status"      text         NOT NULL DEFAULT 'draft';
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "proposal_token"       text;
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "deposit_type"         text;
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "deposit_percent"      numeric(5,2);
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "deposit_fixed"        numeric(10,2);
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "deposit_amount"       numeric(10,2);
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "remaining_balance"    numeric(10,2);
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "deposit_paid_at"      timestamptz;
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "deposit_paid_amount"  numeric(10,2);
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "accepted_at"          timestamptz;
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "accepted_by_name"     text;
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "accepted_by_email"    text;
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "viewed_at"            timestamptz;
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "acceptance_snapshot"  text;
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "customer_question"    text;
