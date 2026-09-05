-- Preserve access for companies that existed before billing enforcement, while
-- making the default explicit and safe for every subsequently created tenant.
ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "legacy_billing" boolean NOT NULL DEFAULT false;

-- This migration runs exactly once in production. At this point every current
-- company predates the billing marker and is deliberately grandfathered.
UPDATE "companies"
SET "legacy_billing" = true;

ALTER TABLE "companies"
  ALTER COLUMN "legacy_billing" SET DEFAULT false;