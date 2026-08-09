import { pgTable, serial, integer, text, numeric, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
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
