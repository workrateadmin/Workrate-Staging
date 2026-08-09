-- companies: persist onboarding checklist dismissal across devices/browsers
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "onboarding_dismissed" boolean NOT NULL DEFAULT false;
-- If the column already exists as integer (created by an earlier run), cast it to boolean
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
