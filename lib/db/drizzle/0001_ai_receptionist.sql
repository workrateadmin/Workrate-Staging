-- Create AI call records table
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

-- Create AI receptionist settings table
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
