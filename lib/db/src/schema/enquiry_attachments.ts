import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { enquiriesTable } from "./enquiries";

export const enquiryAttachmentsTable = pgTable("enquiry_attachments", {
  id: serial("id").primaryKey(),
  enquiryId: integer("enquiry_id")
    .notNull()
    .references(() => enquiriesTable.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  filename: text("filename").notNull(),
  mimetype: text("mimetype").notNull(),
  fileSize: integer("file_size"),
  // Reserved for future AI analysis — store as JSON string
  aiAnalysis: text("ai_analysis"),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type EnquiryAttachment = typeof enquiryAttachmentsTable.$inferSelect;
