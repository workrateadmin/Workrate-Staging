-- Vapi phone integration: tenant ownership, provider identity, and call metadata.
ALTER TABLE "ai_calls" ADD COLUMN IF NOT EXISTS "owner_user_id" text;
ALTER TABLE "ai_calls" ADD COLUMN IF NOT EXISTS "call_ended_at" timestamptz;
ALTER TABLE "ai_calls" ADD COLUMN IF NOT EXISTS "provider_call_id" text;
ALTER TABLE "ai_calls" ADD COLUMN IF NOT EXISTS "assistant_id" text;
ALTER TABLE "ai_calls" ADD COLUMN IF NOT EXISTS "phone_number_id" text;
ALTER TABLE "ai_calls" ADD COLUMN IF NOT EXISTS "phone_number" text;
ALTER TABLE "ai_calls" ADD COLUMN IF NOT EXISTS "recording_url" text;
ALTER TABLE "ai_calls" ADD COLUMN IF NOT EXISTS "ended_reason" text;

CREATE UNIQUE INDEX IF NOT EXISTS "ai_calls_provider_call_unique"
  ON "ai_calls"("provider_id", "provider_call_id")
  WHERE "provider_call_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "ai_calls_owner_created_idx"
  ON "ai_calls"("owner_user_id", "created_at");