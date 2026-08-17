import {
  pgTable, serial, integer, text, numeric, timestamp, jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const JOB_STATUSES = [
  "Survey Required",
  "Survey Booked",
  "Installation Scheduled",
  "In Progress",
  "Completed",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export const jobsTable = pgTable("jobs", {
  id: serial("id").primaryKey(),
  enquiryId: integer("enquiry_id").notNull().unique(),
  quoteId: integer("quote_id"),
  // Customer snapshot
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email"),
  customerPhone: text("customer_phone"),
  location: text("location"),
  // Project snapshot
  projectType: text("project_type"),
  projectDescription: text("project_description"),
  // Financial snapshot (from quote)
  materialsAllowance: numeric("materials_allowance", { precision: 10, scale: 2 }).notNull().default("0"),
  labourAllowance: numeric("labour_allowance", { precision: 10, scale: 2 }).notNull().default("0"),
  totalWithVat: numeric("total_with_vat", { precision: 10, scale: 2 }).notNull().default("0"),
  // Job-specific fields
  status: text("status").notNull().default("Survey Required"),
  // Scheduling dates (ISO date strings YYYY-MM-DD)
  siteSurveyDate: text("site_survey_date"),
  installationStartDate: text("installation_start_date"),
  installationEndDate: text("installation_end_date"),
  installDate: text("install_date"),
  assignedTeam: text("assigned_team"),
  notes: text("notes"),
  // Snapshot of enquiry AI summary / attachments
  aiSummary: text("ai_summary"),
  attachmentUrls: text("attachment_urls"),
  // ── Job completion / actuals ──────────────────────────────────────────────
  completedAt: text("completed_at"),
  finalAmountCharged: numeric("final_amount_charged", { precision: 10, scale: 2 }),
  actualLabourHours: numeric("actual_labour_hours", { precision: 10, scale: 2 }),
  actualLabourCost: numeric("actual_labour_cost", { precision: 10, scale: 2 }),
  actualMaterialsCost: numeric("actual_materials_cost", { precision: 10, scale: 2 }),
  variationAmount: numeric("variation_amount", { precision: 10, scale: 2 }),
  variationNote: text("variation_note"),
  completionNotes: text("completion_notes"),
  completionPhotoUrls: text("completion_photo_urls"), // JSON array of serving URLs
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertJobSchema = createInsertSchema(jobsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobsTable.$inferSelect;

// ── Production documents ──────────────────────────────────────────────────────
export const DOC_TYPES = [
  "cutting_list",
  "bill_of_materials",
  "drawings",
  "supplier_invoice",
  "other",
] as const;

export type DocType = (typeof DOC_TYPES)[number];

// Extraction lifecycle: pending → processing → completed | failed | not_applicable
export const DOC_EXTRACTION_STATUSES = [
  "pending",
  "processing",
  "completed",
  "failed",
  "not_applicable",
] as const;

// Per-row review status (both intelligence tables use this enum)
export const INTEL_ROW_STATUSES = [
  "ai_extracted",
  "reviewed",
  "corrected",
  "manually_added",
] as const;

export const jobProductionDocumentsTable = pgTable("job_production_documents", {
  id:                  serial("id").primaryKey(),
  jobId:               integer("job_id").notNull(),
  url:                 text("url").notNull(),
  objectPath:          text("object_path").notNull(),
  originalName:        text("original_name").notNull(),
  mimeType:            text("mime_type").notNull(),
  docType:             text("doc_type").notNull(),
  fileSizeBytes:       integer("file_size_bytes"),
  uploadedAt:          timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  uploadedByUserId:    text("uploaded_by_user_id"),
  // Extraction provenance (added migration 0008)
  extractionStatus:    text("extraction_status").notNull().default("pending"),
  extractionTimestamp: timestamp("extraction_timestamp", { withTimezone: true }),
  extractionMethod:    text("extraction_method"),
  // Raw AI response dump — kept for auditability
  extractedData:       jsonb("extracted_data"),
});

export type JobProductionDocument = typeof jobProductionDocumentsTable.$inferSelect;

// ── Intelligence: cutting list / BOM components ───────────────────────────────
// One row per component/item. Sawn and finished dimensions are ALWAYS separate.
// sawn_*_mm is null unless the source document explicitly states the stock size.
export const jobIntelligenceComponentsTable = pgTable("job_intelligence_components", {
  id:                   serial("id").primaryKey(),
  jobId:                integer("job_id").notNull(),
  documentId:           integer("document_id").notNull(),
  itemName:             text("item_name"),
  quantity:             numeric("quantity", { precision: 10, scale: 3 }),
  // Finished / planed dimensions (required size after machining)
  finishedLengthMm:     numeric("finished_length_mm", { precision: 10, scale: 2 }),
  finishedWidthMm:      numeric("finished_width_mm", { precision: 10, scale: 2 }),
  finishedThicknessMm:  numeric("finished_thickness_mm", { precision: 10, scale: 2 }),
  // Sawn / nominal dimensions (purchased stock — NEVER invented)
  sawnLengthMm:         numeric("sawn_length_mm", { precision: 10, scale: 2 }),
  sawnWidthMm:          numeric("sawn_width_mm", { precision: 10, scale: 2 }),
  sawnThicknessMm:      numeric("sawn_thickness_mm", { precision: 10, scale: 2 }),
  // Material
  material:             text("material"),   // 'timber' | 'sheet' | 'hardware' | 'other'
  timberSpecies:        text("timber_species"),
  timberGrade:          text("timber_grade"),
  boardType:            text("board_type"),
  sheetFinish:          text("sheet_finish"),
  hardwareRef:          text("hardware_ref"),
  supplierRef:          text("supplier_ref"),
  unitCost:             numeric("unit_cost", { precision: 10, scale: 2 }),
  totalCost:            numeric("total_cost", { precision: 10, scale: 2 }),
  notes:                text("notes"),
  // Provenance
  extractionStatus:     text("extraction_status").notNull().default("ai_extracted"),
  confidenceScore:      numeric("confidence_score", { precision: 4, scale: 3 }),
  originalExtractedText: text("original_extracted_text"),
  correctedAt:          timestamp("corrected_at", { withTimezone: true }),
  extractedAt:          timestamp("extracted_at", { withTimezone: true }).notNull().defaultNow(),
});

export type JobIntelligenceComponent = typeof jobIntelligenceComponentsTable.$inferSelect;

// ── Intelligence: supplier invoice lines ──────────────────────────────────────
export const jobIntelligenceInvoiceLinesTable = pgTable("job_intelligence_invoice_lines", {
  id:                    serial("id").primaryKey(),
  jobId:                 integer("job_id").notNull(),
  documentId:            integer("document_id").notNull(),
  // Invoice header (repeated per line for self-contained querying)
  supplierName:          text("supplier_name"),
  invoiceNumber:         text("invoice_number"),
  invoiceDate:           text("invoice_date"),
  // Line item
  itemDescription:       text("item_description"),
  quantity:              numeric("quantity", { precision: 10, scale: 3 }),
  unit:                  text("unit"),
  unitPrice:             numeric("unit_price", { precision: 10, scale: 2 }),
  lineTotal:             numeric("line_total", { precision: 10, scale: 2 }),
  vatAmount:             numeric("vat_amount", { precision: 10, scale: 2 }),
  materialCategory:      text("material_category"),
  productRef:            text("product_ref"),
  // Provenance
  extractionStatus:      text("extraction_status").notNull().default("ai_extracted"),
  confidenceScore:       numeric("confidence_score", { precision: 4, scale: 3 }),
  originalExtractedText: text("original_extracted_text"),
  correctedAt:           timestamp("corrected_at", { withTimezone: true }),
  extractedAt:           timestamp("extracted_at", { withTimezone: true }).notNull().defaultNow(),
});

export type JobIntelligenceInvoiceLine = typeof jobIntelligenceInvoiceLinesTable.$inferSelect;
