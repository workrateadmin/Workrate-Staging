ALTER TABLE "billing_usage_reservations"
  ADD COLUMN IF NOT EXISTS "expires_at" timestamptz;
-- Existing rows predate leases. They must not permanently consume allowance.
UPDATE "billing_usage_reservations"
  SET "expires_at" = "created_at"
  WHERE "expires_at" IS NULL;
ALTER TABLE "billing_usage_reservations"
  ALTER COLUMN "expires_at" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "billing_usage_reservations_expiry_idx"
  ON "billing_usage_reservations" ("expires_at")
  WHERE "status" = 'reserved';