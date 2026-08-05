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
