CREATE TABLE IF NOT EXISTS "billing_receptionist_top_up_packs" (
  "id" serial PRIMARY KEY,
  "code" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "minutes" integer NOT NULL CHECK ("minutes" > 0),
  "customer_price_gbp" numeric(10,2),
  "currency" text NOT NULL DEFAULT 'gbp' CHECK ("currency" = 'gbp'),
  "expiry_policy" text NOT NULL DEFAULT 'period_end' CHECK ("expiry_policy" = 'period_end'),
  "active" boolean NOT NULL DEFAULT true,
  "sort_order" integer NOT NULL DEFAULT 0,
  "stripe_product_id" text,
  "stripe_price_id" text,
  "stripe_mapping_validated_at" timestamptz,
  "updated_by_user_id" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "billing_receptionist_top_up_purchases" (
  "id" serial PRIMARY KEY,
  "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "owner_user_id" text NOT NULL,
  "pack_code" text NOT NULL,
  "pack_minutes" integer NOT NULL CHECK ("pack_minutes" > 0),
  "customer_price_gbp" numeric(10,2) NOT NULL,
  "currency" text NOT NULL DEFAULT 'gbp' CHECK ("currency" = 'gbp'),
  "expiry_policy" text NOT NULL DEFAULT 'period_end' CHECK ("expiry_policy" = 'period_end'),
  "period_starts_at" timestamptz NOT NULL,
  "period_ends_at" timestamptz NOT NULL,
  "stripe_checkout_session_id" text,
  "stripe_payment_intent_id" text,
  "status" text NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending','granted','failed','expired')),
  "granted_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("stripe_checkout_session_id"),
  UNIQUE ("stripe_payment_intent_id")
);
CREATE INDEX IF NOT EXISTS "billing_receptionist_top_up_tenant_period_idx"
  ON "billing_receptionist_top_up_purchases" ("company_id","owner_user_id","period_starts_at","period_ends_at")
  WHERE "status" = 'granted';
INSERT INTO "billing_receptionist_top_up_packs" ("code","name","minutes","active","sort_order","expiry_policy")
VALUES ('minutes_100','+100 minutes',100,true,100,'period_end'),
       ('minutes_250','+250 minutes',250,true,250,'period_end'),
       ('minutes_500','+500 minutes',500,true,500,'period_end')
ON CONFLICT ("code") DO NOTHING;