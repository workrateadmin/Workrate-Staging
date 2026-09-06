-- Income Tax MTD sandbox preparation and submission-attempt history only.
-- No VAT or corporation-tax tables are introduced.
CREATE TABLE IF NOT EXISTS "hmrc_quarterly_preparations" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "owner_user_id" text NOT NULL,
  "obligation_key" text NOT NULL,
  "business_id" text NOT NULL,
  "business_type" text NOT NULL,
  "due_date" date,
  "obligation_status" text NOT NULL,
  "period_start" date NOT NULL,
  "period_end" date NOT NULL,
  "figures" jsonb NOT NULL,
  "payload_hash" text NOT NULL,
  "status" text NOT NULL DEFAULT 'prepared',
  "declaration_text" text,
  "reviewed_by_user_id" text,
  "reviewed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "hmrc_quarterly_preparations_company_obligation_unique"
  ON "hmrc_quarterly_preparations" ("company_id", "obligation_key");

CREATE TABLE IF NOT EXISTS "hmrc_submission_attempts" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "owner_user_id" text NOT NULL,
  "preparation_id" integer NOT NULL REFERENCES "hmrc_quarterly_preparations"("id") ON DELETE CASCADE,
  "idempotency_key" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "payload_hash" text NOT NULL,
  "hmrc_reference" text,
  "safe_response" jsonb,
  "safe_error" text,
  "attempted_at" timestamptz NOT NULL DEFAULT now(),
  "completed_at" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "hmrc_submission_attempts_company_idempotency_unique"
  ON "hmrc_submission_attempts" ("company_id", "idempotency_key");