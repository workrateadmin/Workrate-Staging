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
