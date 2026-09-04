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
  monthlyPriceGbp: numeric("monthly_price_gbp", { precision: 10, scale: 2 }).notNull(),
  trialPriceGbp: numeric("trial_price_gbp", { precision: 10, scale: 2 }).notNull(),
  trialDays: integer("trial_days").notNull().default(7),
  featureCategories: text("feature_categories").array().notNull().default([]),
  usageLimits: jsonb("usage_limits"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [uniqueIndex("billing_plans_code_unique").on(table.code)]);

export const billingAddOnsTable = pgTable("billing_add_ons", {
  id: serial("id").primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  monthlyPriceGbp: numeric("monthly_price_gbp", { precision: 10, scale: 2 }),
  usageLimits: jsonb("usage_limits"),
  featureCategories: text("feature_categories").array().notNull().default([]),
  active: boolean("active").notNull().default(true),
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
  quantity: integer("quantity").notNull().default(1),
  idempotencyKey: text("idempotency_key"),
  metadata: jsonb("metadata"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("billing_usage_events_tenant_idempotency_unique").on(table.companyId, table.ownerUserId, table.idempotencyKey)]);

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

export const insertOnboardingProgressSchema = createInsertSchema(onboardingProgressTable).omit({ id: true, companyId: true, ownerUserId: true, createdAt: true, updatedAt: true });
export type BillingPlan = typeof billingPlansTable.$inferSelect;
export type BillingAddOn = typeof billingAddOnsTable.$inferSelect;
export type CompanySubscription = typeof companySubscriptionsTable.$inferSelect;
export type InsertOnboardingProgress = z.infer<typeof insertOnboardingProgressSchema>;