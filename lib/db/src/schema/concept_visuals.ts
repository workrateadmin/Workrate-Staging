import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { enquiriesTable } from "./enquiries";

export const conceptVisualsTable = pgTable("concept_visuals", {
  id: serial("id").primaryKey(),
  enquiryId: integer("enquiry_id")
    .notNull()
    .references(() => enquiriesTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("offered"),
  // 'offered' | 'generating' | 'generated' | 'revision_requested' | 'selected' | 'skipped' | 'failed'
  originalPhotoUrl: text("original_photo_url"),
  promptBrief: text("prompt_brief"),
  generatedImageUrl: text("generated_image_url"),
  customerFeedback: text("customer_feedback"),
  isPreferred: boolean("is_preferred").notNull().default(false),
  revisionCount: integer("revision_count").notNull().default(0),
  generatedAt: timestamp("generated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ConceptVisual = typeof conceptVisualsTable.$inferSelect;
