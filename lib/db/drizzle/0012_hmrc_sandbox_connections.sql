-- Migration 0012: per-business HMRC sandbox OAuth connections.
-- Ciphertext columns are never populated with plaintext tokens or taxpayer IDs.

CREATE TABLE IF NOT EXISTS "hmrc_connections" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "owner_user_id" text NOT NULL,
  "status" text NOT NULL DEFAULT 'disconnected',
  "encrypted_access_token" text,
  "encrypted_refresh_token" text,
  "access_token_expires_at" timestamptz,
  "scopes" text NOT NULL DEFAULT '',
  "encrypted_taxpayer_id" text,
  "business_details" jsonb,
  "obligations" jsonb,
  "last_successful_sync_at" timestamptz,
  "last_error" text,
  "connected_at" timestamptz,
  "disconnected_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "hmrc_connections_company_owner_unique"
  ON "hmrc_connections"("company_id", "owner_user_id");

CREATE TABLE IF NOT EXISTS "hmrc_oauth_states" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "owner_user_id" text NOT NULL,
  "state_hash" text NOT NULL,
  "encrypted_code_verifier" text NOT NULL,
  "encrypted_taxpayer_id" text NOT NULL,
  "fraud_context" jsonb NOT NULL,
  "return_path" text NOT NULL DEFAULT '/finance',
  "expires_at" timestamptz NOT NULL,
  "used_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "hmrc_oauth_state_hash_unique"
  ON "hmrc_oauth_states"("state_hash");
CREATE INDEX IF NOT EXISTS "hmrc_oauth_states_expiry_idx"
  ON "hmrc_oauth_states"("expires_at");