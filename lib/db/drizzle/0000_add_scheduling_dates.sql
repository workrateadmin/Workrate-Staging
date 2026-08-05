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
