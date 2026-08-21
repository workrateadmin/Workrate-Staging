import {
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Finance data belongs to a company as well as the owning Clerk user. Keeping
 * both values on each row makes the tenant boundary explicit and protects
 * historical records if ownership data is ever repaired or migrated.
 */
export const financeExpensesTable = pgTable("finance_expenses", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  ownerUserId: text("owner_user_id").notNull(),
  jobId: integer("job_id"),
  transactionDate: date("transaction_date", { mode: "string" }),
  supplierName: text("supplier_name"),
  description: text("description"),
  category: text("category"),
  grossAmount: numeric("gross_amount", { precision: 12, scale: 2 }),
  netAmount: numeric("net_amount", { precision: 12, scale: 2 }),
  vatAmount: numeric("vat_amount", { precision: 12, scale: 2 }),
  paymentMethod: text("payment_method"),
  source: text("source").notNull().default("manual"),
  reviewStatus: text("review_status").notNull().default("needs_review"),
  notes: text("notes"),
  createdByUserId: text("created_by_user_id").notNull(),
  updatedByUserId: text("updated_by_user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const financeReceiptsTable = pgTable("finance_receipts", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  ownerUserId: text("owner_user_id").notNull(),
  expenseId: integer("expense_id").notNull(),
  jobId: integer("job_id"),
  objectPath: text("object_path").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSizeBytes: integer("file_size_bytes"),
  contentHash: text("content_hash").notNull(),
  extractionStatus: text("extraction_status").notNull().default("pending"),
  extractionMethod: text("extraction_method"),
  extractedData: jsonb("extracted_data"),
  uploadedByUserId: text("uploaded_by_user_id").notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewedByUserId: text("reviewed_by_user_id"),
}, (table) => [
  uniqueIndex("finance_receipts_company_hash_unique").on(table.companyId, table.contentHash),
]);

/**
 * This table is intentionally only for income that does not already exist in
 * WorkRate invoices. Invoice, deposit, and final-payment records are derived
 * from quotesTable at query time, so they are not copied into another ledger.
 */
export const financeIncomeRecordsTable = pgTable("finance_income_records", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  ownerUserId: text("owner_user_id").notNull(),
  jobId: integer("job_id"),
  receivedDate: date("received_date", { mode: "string" }).notNull(),
  description: text("description").notNull(),
  category: text("category"),
  grossAmount: numeric("gross_amount", { precision: 12, scale: 2 }).notNull(),
  netAmount: numeric("net_amount", { precision: 12, scale: 2 }),
  vatAmount: numeric("vat_amount", { precision: 12, scale: 2 }),
  paymentMethod: text("payment_method"),
  source: text("source").notNull().default("manual"),
  notes: text("notes"),
  createdByUserId: text("created_by_user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const financeAuditEventsTable = pgTable("finance_audit_events", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  ownerUserId: text("owner_user_id").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  action: text("action").notNull(),
  actorUserId: text("actor_user_id").notNull(),
  beforeData: jsonb("before_data"),
  afterData: jsonb("after_data"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertFinanceExpenseSchema = createInsertSchema(financeExpensesTable).omit({
  id: true,
  companyId: true,
  ownerUserId: true,
  createdByUserId: true,
  updatedByUserId: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFinanceIncomeRecordSchema = createInsertSchema(financeIncomeRecordsTable).omit({
  id: true,
  companyId: true,
  ownerUserId: true,
  createdByUserId: true,
  createdAt: true,
  updatedAt: true,
});

export type FinanceExpense = typeof financeExpensesTable.$inferSelect;
export type FinanceReceipt = typeof financeReceiptsTable.$inferSelect;
export type FinanceIncomeRecord = typeof financeIncomeRecordsTable.$inferSelect;
export type FinanceAuditEvent = typeof financeAuditEventsTable.$inferSelect;
export type InsertFinanceExpense = z.infer<typeof insertFinanceExpenseSchema>;
export type InsertFinanceIncomeRecord = z.infer<typeof insertFinanceIncomeRecordSchema>;