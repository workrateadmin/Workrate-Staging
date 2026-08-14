-- Add job completion / actuals columns (all nullable — existing jobs unaffected)
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "completed_at" text;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "final_amount_charged" numeric(10,2);
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "actual_labour_hours" numeric(10,2);
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "actual_labour_cost" numeric(10,2);
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "actual_materials_cost" numeric(10,2);
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "variation_amount" numeric(10,2);
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "variation_note" text;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "completion_notes" text;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "completion_photo_urls" text;
