import {
  boolean, date, integer, jsonb, numeric, pgTable, serial, text, timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Tenant-private cost evidence. These records deliberately complement the
 * scalar completion values on jobs; they never backfill or replace old jobs.
 * Numeric fields are nullable unless a value is required to make a confirmed
 * allocation/cost meaningful.
 */
export const materialLibraryTable = pgTable("material_library", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  ownerUserId: text("owner_user_id").notNull(),
  name: text("name").notNull(),
  category: text("category"),
  supplierName: text("supplier_name"),
  supplierSku: text("supplier_sku"),
  unit: text("unit"),
  attributes: jsonb("attributes"),
  active: boolean("active").notNull().default(true),
  latestConfirmedUnitCost: numeric("latest_confirmed_unit_cost", { precision: 14, scale: 4 }),
  latestConfirmedTotalCost: numeric("latest_confirmed_total_cost", { precision: 14, scale: 2 }),
  latestConfirmedAt: timestamp("latest_confirmed_at", { withTimezone: true }),
  latestSourceType: text("latest_source_type"),
  latestSourceDocumentId: integer("latest_source_document_id"),
  latestSourceReceiptId: integer("latest_source_receipt_id"),
  latestSourceExpenseId: integer("latest_source_expense_id"),
  createdByUserId: text("created_by_user_id").notNull(),
  updatedByUserId: text("updated_by_user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

/** Immutable price observations. Confirming a new price appends a row. */
export const materialCostHistoryTable = pgTable("material_cost_history", {
  id: serial("id").primaryKey(),
  materialId: integer("material_id").notNull(),
  companyId: integer("company_id").notNull(),
  ownerUserId: text("owner_user_id").notNull(),
  unitCost: numeric("unit_cost", { precision: 14, scale: 4 }).notNull(),
  totalCost: numeric("total_cost", { precision: 14, scale: 2 }),
  quantity: numeric("quantity", { precision: 14, scale: 3 }),
  unit: text("unit"),
  supplierName: text("supplier_name"),
  sourceType: text("source_type").notNull(),
  sourceDocumentId: integer("source_document_id"),
  sourceReceiptId: integer("source_receipt_id"),
  sourceExpenseId: integer("source_expense_id"),
  extractionMethod: text("extraction_method"),
  confidenceScore: numeric("confidence_score", { precision: 4, scale: 3 }),
  confirmedByUserId: text("confirmed_by_user_id").notNull(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jobLabourEntriesTable = pgTable("job_labour_entries", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull(),
  companyId: integer("company_id").notNull(),
  ownerUserId: text("owner_user_id").notNull(),
  workDate: date("work_date", { mode: "string" }),
  personName: text("person_name"),
  personReference: text("person_reference"),
  entryType: text("entry_type"),
  estimatedHours: numeric("estimated_hours", { precision: 12, scale: 2 }),
  actualHours: numeric("actual_hours", { precision: 12, scale: 2 }),
  hourlyCost: numeric("hourly_cost", { precision: 14, scale: 4 }),
  estimatedCost: numeric("estimated_cost", { precision: 14, scale: 2 }),
  actualCost: numeric("actual_cost", { precision: 14, scale: 2 }),
  notes: text("notes"),
  sourceType: text("source_type").notNull().default("manual"),
  sourceDocumentId: integer("source_document_id"),
  sourceReceiptId: integer("source_receipt_id"),
  sourceExpenseId: integer("source_expense_id"),
  extractionMethod: text("extraction_method"),
  confidenceScore: numeric("confidence_score", { precision: 4, scale: 3 }),
  confirmationState: text("confirmation_state").notNull().default("confirmed"),
  confirmedByUserId: text("confirmed_by_user_id"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  createdByUserId: text("created_by_user_id").notNull(),
  updatedByUserId: text("updated_by_user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const jobMaterialUsagesTable = pgTable("job_material_usages", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull(),
  companyId: integer("company_id").notNull(),
  ownerUserId: text("owner_user_id").notNull(),
  materialId: integer("material_id"),
  name: text("name").notNull(),
  supplierName: text("supplier_name"),
  supplierSku: text("supplier_sku"),
  unit: text("unit"),
  specification: text("specification"),
  attributes: jsonb("attributes"),
  estimatedQuantity: numeric("estimated_quantity", { precision: 14, scale: 3 }),
  actualQuantity: numeric("actual_quantity", { precision: 14, scale: 3 }),
  wasteQuantity: numeric("waste_quantity", { precision: 14, scale: 3 }),
  wastePercent: numeric("waste_percent", { precision: 7, scale: 3 }),
  estimatedUnitCost: numeric("estimated_unit_cost", { precision: 14, scale: 4 }),
  actualUnitCost: numeric("actual_unit_cost", { precision: 14, scale: 4 }),
  estimatedCost: numeric("estimated_cost", { precision: 14, scale: 2 }),
  actualCost: numeric("actual_cost", { precision: 14, scale: 2 }),
  notes: text("notes"),
  sourceType: text("source_type").notNull().default("manual"),
  sourceDocumentId: integer("source_document_id"),
  sourceReceiptId: integer("source_receipt_id"),
  sourceExpenseId: integer("source_expense_id"),
  extractionMethod: text("extraction_method"),
  confidenceScore: numeric("confidence_score", { precision: 4, scale: 3 }),
  confirmationState: text("confirmation_state").notNull().default("confirmed"),
  confirmedByUserId: text("confirmed_by_user_id"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  createdByUserId: text("created_by_user_id").notNull(),
  updatedByUserId: text("updated_by_user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const jobOtherDirectCostsTable = pgTable("job_other_direct_costs", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull(),
  companyId: integer("company_id").notNull(),
  ownerUserId: text("owner_user_id").notNull(),
  description: text("description").notNull(),
  category: text("category"),
  estimatedCost: numeric("estimated_cost", { precision: 14, scale: 2 }),
  actualCost: numeric("actual_cost", { precision: 14, scale: 2 }),
  notes: text("notes"),
  sourceType: text("source_type").notNull().default("manual"),
  sourceDocumentId: integer("source_document_id"),
  sourceReceiptId: integer("source_receipt_id"),
  sourceExpenseId: integer("source_expense_id"),
  extractionMethod: text("extraction_method"),
  confidenceScore: numeric("confidence_score", { precision: 4, scale: 3 }),
  confirmationState: text("confirmation_state").notNull().default("confirmed"),
  confirmedByUserId: text("confirmed_by_user_id"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  createdByUserId: text("created_by_user_id").notNull(),
  updatedByUserId: text("updated_by_user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

/** Explicitly allocated evidence only; a receipt is never implicitly whole-job. */
export const jobFinanceAllocationsTable = pgTable("job_finance_allocations", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull(),
  companyId: integer("company_id").notNull(),
  ownerUserId: text("owner_user_id").notNull(),
  receiptId: integer("receipt_id"),
  expenseId: integer("expense_id"),
  receiptLineReference: text("receipt_line_reference"),
  allocatedAmount: numeric("allocated_amount", { precision: 14, scale: 2 }).notNull(),
  allocatedQuantity: numeric("allocated_quantity", { precision: 14, scale: 3 }),
  unit: text("unit"),
  notes: text("notes"),
  confirmationState: text("confirmation_state").notNull().default("confirmed"),
  confirmedByUserId: text("confirmed_by_user_id"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  createdByUserId: text("created_by_user_id").notNull(),
  updatedByUserId: text("updated_by_user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertMaterialLibrarySchema = createInsertSchema(materialLibraryTable).omit({ id: true, companyId: true, ownerUserId: true, createdByUserId: true, updatedByUserId: true, createdAt: true, updatedAt: true });
export const insertJobLabourEntrySchema = createInsertSchema(jobLabourEntriesTable).omit({ id: true, companyId: true, ownerUserId: true, createdByUserId: true, updatedByUserId: true, createdAt: true, updatedAt: true });
export const insertJobMaterialUsageSchema = createInsertSchema(jobMaterialUsagesTable).omit({ id: true, companyId: true, ownerUserId: true, createdByUserId: true, updatedByUserId: true, createdAt: true, updatedAt: true });
export const insertJobOtherDirectCostSchema = createInsertSchema(jobOtherDirectCostsTable).omit({ id: true, companyId: true, ownerUserId: true, createdByUserId: true, updatedByUserId: true, createdAt: true, updatedAt: true });
export const insertJobFinanceAllocationSchema = createInsertSchema(jobFinanceAllocationsTable).omit({ id: true, companyId: true, ownerUserId: true, createdByUserId: true, updatedByUserId: true, createdAt: true, updatedAt: true });
export type MaterialLibrary = typeof materialLibraryTable.$inferSelect;
export type MaterialCostHistory = typeof materialCostHistoryTable.$inferSelect;
export type JobLabourEntry = typeof jobLabourEntriesTable.$inferSelect;
export type JobMaterialUsage = typeof jobMaterialUsagesTable.$inferSelect;
export type JobOtherDirectCost = typeof jobOtherDirectCostsTable.$inferSelect;
export type JobFinanceAllocation = typeof jobFinanceAllocationsTable.$inferSelect;
export type InsertMaterialLibrary = z.infer<typeof insertMaterialLibrarySchema>;
export type InsertJobLabourEntry = z.infer<typeof insertJobLabourEntrySchema>;
export type InsertJobMaterialUsage = z.infer<typeof insertJobMaterialUsageSchema>;
export type InsertJobOtherDirectCost = z.infer<typeof insertJobOtherDirectCostSchema>;
export type InsertJobFinanceAllocation = z.infer<typeof insertJobFinanceAllocationSchema>;