CREATE TABLE IF NOT EXISTS "billing_usage_reservations" (
  "id" serial PRIMARY KEY,
  "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "owner_user_id" text NOT NULL,
  "usage_period_id" integer NOT NULL REFERENCES "billing_usage_periods"("id") ON DELETE CASCADE,
  "feature_code" text NOT NULL,
  "quantity" integer NOT NULL CHECK ("quantity" > 0),
  "dedupe_key" text NOT NULL,
  "status" text NOT NULL DEFAULT 'reserved' CHECK ("status" IN ('reserved','finalized','released')),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "finalized_at" timestamptz,
  "released_at" timestamptz,
  UNIQUE ("company_id", "owner_user_id", "dedupe_key")
);
CREATE INDEX IF NOT EXISTS "billing_usage_reservations_active_idx"
  ON "billing_usage_reservations" ("company_id", "owner_user_id", "usage_period_id", "feature_code")
  WHERE "status" = 'reserved';