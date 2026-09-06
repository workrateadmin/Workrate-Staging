import {
  date,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * HMRC credentials are deliberately isolated from the generic integrations
 * table. Token and taxpayer identifier fields contain AES-GCM ciphertext only;
 * readable connection metadata is kept separately for the Finance UI.
 */
export const hmrcConnectionsTable = pgTable("hmrc_connections", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  ownerUserId: text("owner_user_id").notNull(),
  status: text("status").notNull().default("disconnected"),
  encryptedAccessToken: text("encrypted_access_token"),
  encryptedRefreshToken: text("encrypted_refresh_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  scopes: text("scopes").notNull().default(""),
  encryptedTaxpayerId: text("encrypted_taxpayer_id"),
  businessDetails: jsonb("business_details"),
  obligations: jsonb("obligations"),
  lastSuccessfulSyncAt: timestamp("last_successful_sync_at", { withTimezone: true }),
  lastError: text("last_error"),
  connectedAt: timestamp("connected_at", { withTimezone: true }),
  disconnectedAt: timestamp("disconnected_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("hmrc_connections_company_owner_unique").on(table.companyId, table.ownerUserId),
]);

/**
 * Short-lived state records protect the OAuth callback from replay and keep
 * PKCE material, browser context, and the intended business on the server.
 */
export const hmrcOauthStatesTable = pgTable("hmrc_oauth_states", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  ownerUserId: text("owner_user_id").notNull(),
  stateHash: text("state_hash").notNull(),
  encryptedCodeVerifier: text("encrypted_code_verifier").notNull(),
  encryptedTaxpayerId: text("encrypted_taxpayer_id").notNull(),
  fraudContext: jsonb("fraud_context").notNull(),
  returnPath: text("return_path").notNull().default("/finance"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("hmrc_oauth_state_hash_unique").on(table.stateHash),
]);

/** Tenant-scoped Income Tax MTD preparation and sandbox attempt history. */
export const hmrcQuarterlyPreparationsTable = pgTable("hmrc_quarterly_preparations", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  ownerUserId: text("owner_user_id").notNull(),
  obligationKey: text("obligation_key").notNull(),
  businessId: text("business_id").notNull(),
  businessType: text("business_type").notNull(),
  dueDate: date("due_date", { mode: "string" }),
  obligationStatus: text("obligation_status").notNull(),
  periodStart: date("period_start", { mode: "string" }).notNull(),
  periodEnd: date("period_end", { mode: "string" }).notNull(),
  figures: jsonb("figures").notNull(),
  payloadHash: text("payload_hash").notNull(),
  status: text("status").notNull().default("prepared"),
  declarationText: text("declaration_text"),
  reviewedByUserId: text("reviewed_by_user_id"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("hmrc_quarterly_preparations_company_obligation_unique").on(table.companyId, table.obligationKey),
]);

export const hmrcSubmissionAttemptsTable = pgTable("hmrc_submission_attempts", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  ownerUserId: text("owner_user_id").notNull(),
  preparationId: integer("preparation_id").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  status: text("status").notNull().default("pending"),
  payloadHash: text("payload_hash").notNull(),
  hmrcReference: text("hmrc_reference"),
  safeResponse: jsonb("safe_response"),
  safeError: text("safe_error"),
  attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("hmrc_submission_attempts_company_idempotency_unique").on(table.companyId, table.idempotencyKey),
]);

export type HmrcConnection = typeof hmrcConnectionsTable.$inferSelect;
export type HmrcOauthState = typeof hmrcOauthStatesTable.$inferSelect;
export type HmrcQuarterlyPreparation = typeof hmrcQuarterlyPreparationsTable.$inferSelect;
export type HmrcSubmissionAttempt = typeof hmrcSubmissionAttemptsTable.$inferSelect;