import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/** Global, operator-configured catalogue. Prices/allowances not confirmed are null. */
export const billingPlansTable = pgTable("billing_plans", {
  id: serial("id").primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  monthlyPriceGbp: numeric("monthly_price_gbp", { precision: 10, scale: 2 }).notNull(),
  /** Retained for backwards-compatible reads; customer value is computed below. */
  trialPriceGbp: numeric("trial_price_gbp", { precision: 10, scale: 2 }).notNull(),
  trialPercentage: numeric("trial_percentage", { precision: 5, scale: 2 }).notNull().default("50"),
  manualTrialPriceGbp: numeric("manual_trial_price_gbp", { precision: 10, scale: 2 }),
  trialDays: integer("trial_days").notNull().default(7),
  featureCategories: text("feature_categories").array().notNull().default([]),
  usageLimits: jsonb("usage_limits"),
  includedAllowance: jsonb("included_allowance"),
  overagePolicy: jsonb("overage_policy"),
  active: boolean("active").notNull().default(true),
  comingSoon: boolean("coming_soon").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  stripeProductId: text("stripe_product_id"),
  stripeRecurringPriceId: text("stripe_recurring_price_id"),
  stripeTrialPriceId: text("stripe_trial_price_id"),
  stripeMappingValidatedAt: timestamp("stripe_mapping_validated_at", { withTimezone: true }),
  updatedByUserId: text("updated_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [uniqueIndex("billing_plans_code_unique").on(table.code)]);

export const billingAddOnsTable = pgTable("billing_add_ons", {
  id: serial("id").primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  monthlyPriceGbp: numeric("monthly_price_gbp", { precision: 10, scale: 2 }),
  trialPercentage: numeric("trial_percentage", { precision: 5, scale: 2 }).notNull().default("50"),
  manualTrialPriceGbp: numeric("manual_trial_price_gbp", { precision: 10, scale: 2 }),
  usageLimits: jsonb("usage_limits"),
  includedAllowance: jsonb("included_allowance"),
  overagePolicy: jsonb("overage_policy"),
  featureCategories: text("feature_categories").array().notNull().default([]),
  active: boolean("active").notNull().default(true),
  comingSoon: boolean("coming_soon").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  stripeProductId: text("stripe_product_id"),
  stripeRecurringPriceId: text("stripe_recurring_price_id"),
  stripeTrialPriceId: text("stripe_trial_price_id"),
  stripeMappingValidatedAt: timestamp("stripe_mapping_validated_at", { withTimezone: true }),
  updatedByUserId: text("updated_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [uniqueIndex("billing_add_ons_code_unique").on(table.code)]);

export const onboardingProgressTable = pgTable("onboarding_progress", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  ownerUserId: text("owner_user_id").notNull(),
  status: text("status").notNull().default("started"),
  currentStep: text("current_step").notNull().default("welcome"),
  data: jsonb("data").notNull().default({}),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  skippedAt: timestamp("skipped_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [uniqueIndex("onboarding_progress_company_owner_unique").on(table.companyId, table.ownerUserId)]);

export const companySubscriptionsTable = pgTable("company_subscriptions", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  ownerUserId: text("owner_user_id").notNull(),
  planCode: text("plan_code"),
  addOnCodes: text("add_on_codes").array().notNull().default([]),
  status: text("status").notNull().default("pending_selection"),
  provider: text("provider"),
  providerCustomerId: text("provider_customer_id"),
  providerSubscriptionId: text("provider_subscription_id"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  currentPeriodStartsAt: timestamp("current_period_starts_at", { withTimezone: true }),
  currentPeriodEndsAt: timestamp("current_period_ends_at", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  failedPaymentAt: timestamp("failed_payment_at", { withTimezone: true }),
  pendingPlanCode: text("pending_plan_code"),
  pendingAddOnCodes: text("pending_add_on_codes").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [uniqueIndex("company_subscriptions_company_owner_unique").on(table.companyId, table.ownerUserId)]);

export const billingUsagePeriodsTable = pgTable("billing_usage_periods", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  ownerUserId: text("owner_user_id").notNull(),
  subscriptionId: integer("subscription_id"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("billing_usage_periods_tenant_period_unique").on(table.companyId, table.ownerUserId, table.startsAt)]);

export const billingUsageEventsTable = pgTable("billing_usage_events", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  ownerUserId: text("owner_user_id").notNull(),
  usagePeriodId: integer("usage_period_id"),
  featureCode: text("feature_code").notNull(),
  /** Commercial meter, e.g. ai_receptionist_minutes or concept_generations. */
  usageCategory: text("usage_category").notNull().default("unspecified"),
  quantity: integer("quantity").notNull().default(1),
  unit: text("unit").notNull().default("count"),
  source: text("source").notNull().default("server"),
  providerReference: text("provider_reference"),
  relatedEntityId: text("related_entity_id"),
  providerCostGbp: numeric("provider_cost_gbp", { precision: 12, scale: 6 }),
  periodStartsAt: timestamp("period_starts_at", { withTimezone: true }),
  periodEndsAt: timestamp("period_ends_at", { withTimezone: true }),
  dedupeKey: text("dedupe_key"),
  /** Deprecated name retained while existing provider integrations migrate. */
  idempotencyKey: text("idempotency_key"),
  metadata: jsonb("metadata"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("billing_usage_events_tenant_idempotency_unique").on(table.companyId, table.ownerUserId, table.idempotencyKey),
  uniqueIndex("billing_usage_events_tenant_dedupe_unique").on(table.companyId, table.ownerUserId, table.dedupeKey),
]);

/** Short-lived server reservation made before invoking a variable-cost provider. */
export const billingUsageReservationsTable = pgTable("billing_usage_reservations", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  ownerUserId: text("owner_user_id").notNull(),
  usagePeriodId: integer("usage_period_id").notNull(),
  featureCode: text("feature_code").notNull(),
  quantity: integer("quantity").notNull(),
  dedupeKey: text("dedupe_key").notNull(),
  status: text("status").notNull().default("reserved"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  finalizedAt: timestamp("finalized_at", { withTimezone: true }),
  releasedAt: timestamp("released_at", { withTimezone: true }),
}, (table) => [uniqueIndex("billing_usage_reservations_tenant_dedupe_unique").on(table.companyId, table.ownerUserId, table.dedupeKey)]);

/** Delivery receipts ensure each allowance threshold is surfaced once per period. */
export const billingUsageWarningsTable = pgTable("billing_usage_warnings", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  ownerUserId: text("owner_user_id").notNull(),
  usagePeriodId: integer("usage_period_id").notNull(),
  featureCode: text("feature_code").notNull(),
  thresholdPercent: integer("threshold_percent").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("billing_usage_warnings_once_per_period").on(table.companyId, table.ownerUserId, table.usagePeriodId, table.featureCode, table.thresholdPercent)]);

/** Provider event receipt; tenant identity is attached only after verification/mapping. */
export const billingWebhookEventsTable = pgTable("billing_webhook_events", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  ownerUserId: text("owner_user_id").notNull(),
  provider: text("provider").notNull(),
  providerEventId: text("provider_event_id").notNull(),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("billing_webhook_events_provider_event_unique").on(table.provider, table.providerEventId)]);

/** Operator-level provider configuration. Secrets are AES-256-GCM ciphertext only. */
export const billingProviderConfigsTable = pgTable("billing_provider_configs", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull(),
  webhookUrl: text("webhook_url").notNull(),
  providerWebhookId: text("provider_webhook_id").notNull(),
  encryptedWebhookSecret: text("encrypted_webhook_secret").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [uniqueIndex("billing_provider_configs_provider_url_unique").on(table.provider, table.webhookUrl)]);

export const billingCheckoutAttemptsTable = pgTable("billing_checkout_attempts", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  ownerUserId: text("owner_user_id").notNull(),
  selectionFingerprint: text("selection_fingerprint").notNull(),
  attemptKey: uuid("attempt_key").notNull().defaultRandom(),
  providerSessionId: text("provider_session_id"),
  hostedUrl: text("hosted_url"),
  status: text("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("billing_checkout_attempts_attempt_key_unique").on(table.attemptKey),
]);

/** Operator-configured one-time AI Receptionist minute packs. */
export const billingReceptionistTopUpPacksTable = pgTable("billing_receptionist_top_up_packs", {
  id: serial("id").primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  minutes: integer("minutes").notNull(),
  customerPriceGbp: numeric("customer_price_gbp", { precision: 10, scale: 2 }),
  currency: text("currency").notNull().default("gbp"),
  expiryPolicy: text("expiry_policy").notNull().default("period_end"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  stripeProductId: text("stripe_product_id"),
  stripePriceId: text("stripe_price_id"),
  stripeMappingValidatedAt: timestamp("stripe_mapping_validated_at", { withTimezone: true }),
  updatedByUserId: text("updated_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [uniqueIndex("billing_receptionist_top_up_packs_code_unique").on(table.code)]);

/** One-time purchase snapshots are deliberately independent from future plans. */
export const billingReceptionistTopUpPurchasesTable = pgTable("billing_receptionist_top_up_purchases", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  ownerUserId: text("owner_user_id").notNull(),
  packCode: text("pack_code").notNull(),
  packMinutes: integer("pack_minutes").notNull(),
  customerPriceGbp: numeric("customer_price_gbp", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("gbp"),
  expiryPolicy: text("expiry_policy").notNull().default("period_end"),
  periodStartsAt: timestamp("period_starts_at", { withTimezone: true }).notNull(),
  periodEndsAt: timestamp("period_ends_at", { withTimezone: true }).notNull(),
  stripeCheckoutSessionId: text("stripe_checkout_session_id"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  status: text("status").notNull().default("pending"),
  grantedAt: timestamp("granted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("billing_receptionist_top_up_checkout_unique").on(table.stripeCheckoutSessionId),
  uniqueIndex("billing_receptionist_top_up_payment_unique").on(table.stripePaymentIntentId),
]);

export const insertOnboardingProgressSchema = createInsertSchema(onboardingProgressTable).omit({ id: true, companyId: true, ownerUserId: true, createdAt: true, updatedAt: true });
export type BillingPlan = typeof billingPlansTable.$inferSelect;
export type BillingAddOn = typeof billingAddOnsTable.$inferSelect;
export type CompanySubscription = typeof companySubscriptionsTable.$inferSelect;
export type InsertOnboardingProgress = z.infer<typeof insertOnboardingProgressSchema>;