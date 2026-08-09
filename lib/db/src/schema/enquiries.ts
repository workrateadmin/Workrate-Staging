import { pgTable, serial, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ENQUIRY_STATUSES = [
  "new_enquiry",
  "reviewing",
  "survey_required",
  "quote_sent",
  "won",
  "lost",
] as const;

export type EnquiryStatus = typeof ENQUIRY_STATUSES[number];

export const enquiriesTable = pgTable("enquiries", {
  id: serial("id").primaryKey(),
  ownerUserId: text("owner_user_id"),
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email"),
  customerPhone: text("customer_phone"),
  projectType: text("project_type"),
  location: text("location"),
  description: text("description"),
  budget: text("budget"),
  timescale: text("timescale"),
  status: text("status").notNull().default("new_enquiry"),
  aiSummary: text("ai_summary"),
  attachmentUrls: text("attachment_urls"),
  chatToken: text("chat_token"),
  // ── Customer confirmation tracking ─────────────────────────────────────
  confirmationEmailStatus: text("confirmation_email_status").notNull().default("pending"),
  // 'pending' | 'sent' | 'failed' | 'not_configured' | 'disabled'
  confirmationEmailSentAt: timestamp("confirmation_email_sent_at", { withTimezone: true }),
  confirmationSmsStatus: text("confirmation_sms_status").notNull().default("pending"),
  confirmationSmsSentAt: timestamp("confirmation_sms_sent_at", { withTimezone: true }),
  isTest: boolean("is_test").notNull().default(false),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertEnquirySchema = createInsertSchema(enquiriesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEnquiry = z.infer<typeof insertEnquirySchema>;
export type Enquiry = typeof enquiriesTable.$inferSelect;
