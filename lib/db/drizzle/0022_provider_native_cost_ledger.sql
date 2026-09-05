ALTER TABLE "billing_usage_events"
  ADD COLUMN IF NOT EXISTS "provider_cost_amount" numeric(16,8);
ALTER TABLE "billing_usage_events"
  ADD COLUMN IF NOT EXISTS "provider_cost_currency" text;
CREATE INDEX IF NOT EXISTS "billing_usage_events_provider_cost_history_idx"
  ON "billing_usage_events" ("company_id","owner_user_id","provider_reference","occurred_at")
  WHERE "provider_cost_amount" IS NOT NULL OR "usage_category" = 'vapi_provider_cost';