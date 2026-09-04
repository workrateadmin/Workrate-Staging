/**
 * Applies incremental DDL migrations to bring the live database schema
 * up to date. The SQL is embedded directly so it travels with the compiled
 * bundle regardless of where the server is deployed.
 *
 * All statements use IF NOT EXISTS / SET DEFAULT (safe to re-run).
 * Called automatically at API server startup before accepting connections.
 */
import { pool } from "./index";

// Each entry is applied in order; statements are idempotent.
const MIGRATIONS: { name: string; sql: string }[] = [
  {
    name: "0001_ai_receptionist",
    sql: `
      CREATE TABLE IF NOT EXISTS "ai_calls" (
        "id" serial PRIMARY KEY NOT NULL,
        "enquiry_id" integer,
        "call_status" text NOT NULL DEFAULT 'completed',
        "caller_phone" text,
        "caller_name" text,
        "duration_seconds" integer,
        "call_started_at" timestamp with time zone,
        "collected_data" text,
        "transcript" text,
        "ai_summary" text,
        "confidence_score" integer,
        "survey_suggested" boolean,
        "follow_up_required" boolean NOT NULL DEFAULT true,
        "follow_up_notes" text,
        "provider_id" text,
        "provider_data" text,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS "ai_receptionist_settings" (
        "id" serial PRIMARY KEY NOT NULL,
        "enabled" boolean NOT NULL DEFAULT false,
        "welcome_message_type" text NOT NULL DEFAULT 'generate',
        "welcome_message_text" text,
        "welcome_message_url" text,
        "business_hours" text,
        "out_of_hours_behaviour" text NOT NULL DEFAULT 'voicemail',
        "out_of_hours_message" text,
        "transfer_urgent_calls" boolean NOT NULL DEFAULT false,
        "transfer_phone" text,
        "enabled_questions" text,
        "phone_number" text,
        "webhook_url" text,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
      );
    `,
  },
  {
    name: "0002_owner_user_id",
    sql: `
      ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "owner_user_id" text;
      ALTER TABLE "enquiries" ADD COLUMN IF NOT EXISTS "owner_user_id" text;
      ALTER TABLE "ai_receptionist_settings" ADD COLUMN IF NOT EXISTS "owner_user_id" text;
      ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "owner_user_id" text;
      -- Replace global unique constraint on provider with per-owner unique constraint
      ALTER TABLE "integrations" DROP CONSTRAINT IF EXISTS "integrations_provider_unique";
      CREATE UNIQUE INDEX IF NOT EXISTS "integrations_owner_provider_unique" ON "integrations"("owner_user_id", "provider");
    `,
  },
  {
    name: "0003_documents_branding",
    sql: `
      ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "website" text;
      ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "company_reg_number" text;
      ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "vat_number" text;
      ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "bank_payment_details" text;
      ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "brand_colour_primary" text;
      ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "brand_colour_secondary" text;
      ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "payment_terms" text;
      ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "terms_and_conditions" text;
      ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "quote_footer" text;
      ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "invoice_footer" text;
      ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "document_mode" text NOT NULL DEFAULT 'workrate';
      ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "branding_snapshot" text;
    `,
  },
  {
    name: "0000_add_scheduling_dates",
    sql: `
      -- Add scheduling date columns to jobs table
      ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "site_survey_date" text;
      ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "installation_start_date" text;
      ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "installation_end_date" text;

      -- Update the status column default to the new first status
      ALTER TABLE "jobs" ALTER COLUMN "status" SET DEFAULT 'Survey Required';

      -- Migrate legacy statuses to the nearest equivalent in the new 5-status model
      UPDATE "jobs" SET "status" = 'Survey Required'        WHERE "status" IN ('Quote Accepted');
      UPDATE "jobs" SET "status" = 'Installation Scheduled' WHERE "status" IN ('Materials Ordered');
      UPDATE "jobs" SET "status" = 'Completed'              WHERE "status" IN ('Invoiced', 'Closed');

      -- Backfill new scheduling fields from legacy install_date where not already set
      UPDATE "jobs"
      SET "installation_start_date" = "install_date"
      WHERE "install_date" IS NOT NULL
        AND "install_date" <> ''
        AND "installation_start_date" IS NULL;
    `,
  },
  {
    name: "0004_widget_token",
    sql: `
      ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "widget_token" text;
      CREATE UNIQUE INDEX IF NOT EXISTS "companies_widget_token_unique" ON "companies"("widget_token") WHERE "widget_token" IS NOT NULL;
    `,
  },
  {
    name: "0004_deposit_proposal_fields",
    sql: `
      -- companies: deposit settings
      ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "default_deposit_type"          text         NOT NULL DEFAULT 'percentage';
      ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "default_deposit_percent"       numeric(5,2) NOT NULL DEFAULT 50;
      ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "default_deposit_fixed"         numeric(10,2);
      ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "deposit_payment_instructions"  text;
      ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "remaining_balance_due_days"    integer      NOT NULL DEFAULT 30;

      -- jobs: one job per enquiry (enables atomic idempotent convert-to-job)
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

      -- jobs: one job per enquiry (enables atomic idempotent convert-to-job)
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

      -- quotes: proposal and deposit fields
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
    `,
  },
  {
    name: "0005_onboarding_dismissed",
    sql: `
      ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "onboarding_dismissed" boolean NOT NULL DEFAULT false;
      -- If the column was previously added as integer, cast it to boolean.
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'companies'
            AND column_name = 'onboarding_dismissed'
            AND data_type = 'integer'
        ) THEN
          ALTER TABLE "companies"
            ALTER COLUMN "onboarding_dismissed" TYPE boolean
            USING CASE WHEN "onboarding_dismissed" = 1 THEN true ELSE false END;
          ALTER TABLE "companies" ALTER COLUMN "onboarding_dismissed" SET DEFAULT false;
        END IF;
      END $$;
    `,
  },
  {
    name: "0006_is_test_enquiry",
    sql: `
      ALTER TABLE "enquiries" ADD COLUMN IF NOT EXISTS "is_test" boolean NOT NULL DEFAULT false;
    `,
  },
  {
    name: "0007_concept_visuals",
    sql: `
      CREATE TABLE IF NOT EXISTS "concept_visuals" (
        "id"                  serial PRIMARY KEY NOT NULL,
        "enquiry_id"          integer NOT NULL REFERENCES "enquiries"("id") ON DELETE CASCADE,
        "status"              text NOT NULL DEFAULT 'offered',
        "original_photo_url"  text,
        "prompt_brief"        text,
        "generated_image_url" text,
        "customer_feedback"   text,
        "is_preferred"        boolean NOT NULL DEFAULT false,
        "revision_count"      integer NOT NULL DEFAULT 0,
        "generated_at"        timestamp with time zone,
        "created_at"          timestamp with time zone NOT NULL DEFAULT now()
      );
    `,
  },
  {
    name: "0008_remove_imported_invoice_template",
    sql: `
      UPDATE "companies"
      SET "document_mode" = 'workrate'
      WHERE "document_mode" = 'imported';
      ALTER TABLE "companies" DROP COLUMN IF EXISTS "imported_invoice_template";
    `,
  },
  {
    name: "0009_standalone_invoices",
    sql: `
      -- Make enquiry_id nullable so standalone invoices do not require an enquiry.
      ALTER TABLE "quotes" ALTER COLUMN "enquiry_id" DROP NOT NULL;

      ALTER TABLE "quotes"
        ADD COLUMN IF NOT EXISTS "document_type" TEXT NOT NULL DEFAULT 'quote',
        ADD COLUMN IF NOT EXISTS "invoice_number" TEXT,
        ADD COLUMN IF NOT EXISTS "invoice_date" TEXT,
        ADD COLUMN IF NOT EXISTS "due_date" TEXT,
        ADD COLUMN IF NOT EXISTS "job_id" INTEGER REFERENCES "jobs"("id") ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS "vat_rate" NUMERIC(5,2) NOT NULL DEFAULT 20,
        ADD COLUMN IF NOT EXISTS "line_items" TEXT,
        ADD COLUMN IF NOT EXISTS "owner_user_id" TEXT,
        ADD COLUMN IF NOT EXISTS "paid_at" TIMESTAMPTZ;

      UPDATE "quotes" q
      SET "owner_user_id" = e."owner_user_id"
      FROM "enquiries" e
      WHERE e."id" = q."enquiry_id"
        AND q."owner_user_id" IS NULL;
    `,
  },
  {
    name: "0010_finance_foundation",
    sql: `
      CREATE TABLE IF NOT EXISTS "finance_expenses" (
        "id" serial PRIMARY KEY NOT NULL,
        "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
        "owner_user_id" text NOT NULL,
        "job_id" integer REFERENCES "jobs"("id") ON DELETE SET NULL,
        "transaction_date" date,
        "supplier_name" text,
        "description" text,
        "category" text,
        "gross_amount" numeric(12,2),
        "net_amount" numeric(12,2),
        "vat_amount" numeric(12,2),
        "payment_method" text,
        "source" text NOT NULL DEFAULT 'manual',
        "review_status" text NOT NULL DEFAULT 'needs_review',
        "notes" text,
        "created_by_user_id" text NOT NULL,
        "updated_by_user_id" text NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS "finance_receipts" (
        "id" serial PRIMARY KEY NOT NULL,
        "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
        "owner_user_id" text NOT NULL,
        "expense_id" integer NOT NULL REFERENCES "finance_expenses"("id") ON DELETE CASCADE,
        "job_id" integer REFERENCES "jobs"("id") ON DELETE SET NULL,
        "object_path" text NOT NULL,
        "original_name" text NOT NULL,
        "mime_type" text NOT NULL,
        "file_size_bytes" integer,
        "content_hash" text NOT NULL,
        "extraction_status" text NOT NULL DEFAULT 'pending',
        "extraction_method" text,
        "extracted_data" jsonb,
        "uploaded_by_user_id" text NOT NULL,
        "uploaded_at" timestamptz NOT NULL DEFAULT now(),
        "reviewed_at" timestamptz,
        "reviewed_by_user_id" text
      );

      CREATE TABLE IF NOT EXISTS "finance_income_records" (
        "id" serial PRIMARY KEY NOT NULL,
        "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
        "owner_user_id" text NOT NULL,
        "job_id" integer REFERENCES "jobs"("id") ON DELETE SET NULL,
        "received_date" date NOT NULL,
        "description" text NOT NULL,
        "category" text,
        "gross_amount" numeric(12,2) NOT NULL,
        "net_amount" numeric(12,2),
        "vat_amount" numeric(12,2),
        "payment_method" text,
        "source" text NOT NULL DEFAULT 'manual',
        "notes" text,
        "created_by_user_id" text NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS "finance_audit_events" (
        "id" serial PRIMARY KEY NOT NULL,
        "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
        "owner_user_id" text NOT NULL,
        "entity_type" text NOT NULL,
        "entity_id" integer NOT NULL,
        "action" text NOT NULL,
        "actor_user_id" text NOT NULL,
        "before_data" jsonb,
        "after_data" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS "finance_expenses_tenant_date_idx"
        ON "finance_expenses"("company_id", "owner_user_id", "transaction_date");
      CREATE INDEX IF NOT EXISTS "finance_expenses_job_idx" ON "finance_expenses"("job_id");
      CREATE INDEX IF NOT EXISTS "finance_receipts_tenant_hash_idx"
        ON "finance_receipts"("company_id", "content_hash");
      CREATE INDEX IF NOT EXISTS "finance_receipts_expense_idx" ON "finance_receipts"("expense_id");
      CREATE INDEX IF NOT EXISTS "finance_income_tenant_date_idx"
        ON "finance_income_records"("company_id", "owner_user_id", "received_date");
      CREATE INDEX IF NOT EXISTS "finance_audit_tenant_entity_idx"
        ON "finance_audit_events"("company_id", "entity_type", "entity_id");
    `,
  },
  {
    name: "0011_finance_receipt_integrity",
    sql: `
      CREATE UNIQUE INDEX IF NOT EXISTS "finance_receipts_company_hash_unique"
        ON "finance_receipts"("company_id", "content_hash");
    `,
  },
  {
    name: "0012_hmrc_sandbox_connections",
    sql: `
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
    `,
  },
  {
    name: "0013_vapi_phone_integration",
    sql: `
      ALTER TABLE "ai_calls" ADD COLUMN IF NOT EXISTS "owner_user_id" text;
      ALTER TABLE "ai_calls" ADD COLUMN IF NOT EXISTS "call_ended_at" timestamp with time zone;
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
    `,
  },
  {
    name: "0014_billing_onboarding_foundation",
    sql: `
      CREATE TABLE IF NOT EXISTS "billing_plans" (
        "id" serial PRIMARY KEY, "code" text NOT NULL UNIQUE, "name" text NOT NULL,
        "monthly_price_gbp" numeric(10,2) NOT NULL, "trial_price_gbp" numeric(10,2) NOT NULL,
        "trial_days" integer NOT NULL DEFAULT 7, "feature_categories" text[] NOT NULL DEFAULT '{}',
        "usage_limits" jsonb, "active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now()
      );
      INSERT INTO "billing_plans" ("code","name","monthly_price_gbp","trial_price_gbp","trial_days","feature_categories")
      VALUES ('core','Core',29,5,7,'{}'), ('complete','Complete',99,20,7,'{}')
      ON CONFLICT ("code") DO NOTHING;
      CREATE TABLE IF NOT EXISTS "billing_add_ons" (
        "id" serial PRIMARY KEY, "code" text NOT NULL UNIQUE, "name" text NOT NULL,
        "monthly_price_gbp" numeric(10,2), "usage_limits" jsonb, "feature_categories" text[] NOT NULL DEFAULT '{}',
        "active" boolean NOT NULL DEFAULT true, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS "onboarding_progress" (
        "id" serial PRIMARY KEY, "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
        "owner_user_id" text NOT NULL, "status" text NOT NULL DEFAULT 'started', "current_step" text NOT NULL DEFAULT 'welcome',
        "data" jsonb NOT NULL DEFAULT '{}', "completed_at" timestamptz, "skipped_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
        UNIQUE ("company_id","owner_user_id")
      );
      CREATE TABLE IF NOT EXISTS "company_subscriptions" (
        "id" serial PRIMARY KEY, "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE, "owner_user_id" text NOT NULL,
        "plan_code" text, "add_on_codes" text[] NOT NULL DEFAULT '{}', "status" text NOT NULL DEFAULT 'pending_selection',
        "provider" text, "provider_customer_id" text, "provider_subscription_id" text, "trial_ends_at" timestamptz,
        "current_period_starts_at" timestamptz, "current_period_ends_at" timestamptz, "cancel_at_period_end" boolean NOT NULL DEFAULT false,
        "cancelled_at" timestamptz, "failed_payment_at" timestamptz, "pending_plan_code" text, "pending_add_on_codes" text[] NOT NULL DEFAULT '{}',
        "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), UNIQUE ("company_id","owner_user_id")
      );
      CREATE TABLE IF NOT EXISTS "billing_usage_periods" (
        "id" serial PRIMARY KEY, "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE, "owner_user_id" text NOT NULL,
        "subscription_id" integer REFERENCES "company_subscriptions"("id") ON DELETE SET NULL, "starts_at" timestamptz NOT NULL, "ends_at" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(), UNIQUE ("company_id","owner_user_id","starts_at")
      );
      CREATE TABLE IF NOT EXISTS "billing_usage_events" (
        "id" serial PRIMARY KEY, "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE, "owner_user_id" text NOT NULL,
        "usage_period_id" integer REFERENCES "billing_usage_periods"("id") ON DELETE SET NULL, "feature_code" text NOT NULL, "quantity" integer NOT NULL DEFAULT 1,
        "idempotency_key" text, "metadata" jsonb, "occurred_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "billing_usage_events_tenant_idempotency_unique" ON "billing_usage_events" ("company_id","owner_user_id","idempotency_key");
      CREATE TABLE IF NOT EXISTS "billing_webhook_events" (
        "id" serial PRIMARY KEY, "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE, "owner_user_id" text NOT NULL,
        "provider" text NOT NULL, "provider_event_id" text NOT NULL, "event_type" text NOT NULL, "payload" jsonb NOT NULL,
        "processed_at" timestamptz, "created_at" timestamptz NOT NULL DEFAULT now(), UNIQUE ("provider","provider_event_id")
      );
    `,
  },
  {
    name: "0015_billing_provider_config",
    sql: `
      CREATE TABLE IF NOT EXISTS "billing_provider_configs" (
        "id" serial PRIMARY KEY, "provider" text NOT NULL, "webhook_url" text NOT NULL,
        "provider_webhook_id" text NOT NULL, "encrypted_webhook_secret" text NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "billing_provider_configs_provider_url_unique"
        ON "billing_provider_configs" ("provider", "webhook_url");
    `,
  },
  {
    name: "0016_billing_checkout_attempts",
    sql: `
      CREATE TABLE IF NOT EXISTS "billing_checkout_attempts" (
        "id" serial PRIMARY KEY, "company_id" integer NOT NULL, "owner_user_id" text NOT NULL,
        "selection_fingerprint" text NOT NULL, "attempt_key" uuid NOT NULL DEFAULT gen_random_uuid(),
        "provider_session_id" text, "hosted_url" text, "status" text NOT NULL DEFAULT 'pending',
        "expires_at" timestamptz, "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "billing_checkout_attempts_attempt_key_unique"
        ON "billing_checkout_attempts" ("attempt_key");
      CREATE INDEX IF NOT EXISTS "billing_checkout_attempts_tenant_selection_idx"
        ON "billing_checkout_attempts" ("company_id", "owner_user_id", "selection_fingerprint", "created_at" DESC);
    `,
  },
];

export async function runMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    // Create migrations tracking table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS "_migrations" (
        "name" text PRIMARY KEY,
        "applied_at" timestamp with time zone DEFAULT now() NOT NULL
      )
    `);

    for (const migration of MIGRATIONS) {
      const { rows } = await client.query(
        `SELECT 1 FROM "_migrations" WHERE "name" = $1`,
        [migration.name]
      );
      if (rows.length > 0) {
        // Already applied
        continue;
      }
      console.log(`[migrate] Applying ${migration.name}…`);
      await client.query("BEGIN");
      try {
        await client.query(migration.sql);
        await client.query(
          `INSERT INTO "_migrations" ("name") VALUES ($1)`,
          [migration.name]
        );
        await client.query("COMMIT");
        console.log(`[migrate] ${migration.name} applied.`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }
  } finally {
    client.release();
  }
}
