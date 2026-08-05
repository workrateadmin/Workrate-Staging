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
