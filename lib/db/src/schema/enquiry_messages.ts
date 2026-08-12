import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const enquiryMessagesTable = pgTable("enquiry_messages", {
  id: serial("id").primaryKey(),
  enquiryId: integer("enquiry_id").notNull(),
  role: text("role").notNull(), // 'customer' | 'assistant'
  content: text("content").notNull(),
  // ── Channel provenance ───────────────────────────────────────────────────
  // Tracks which channel this message came through.
  // Future channels: 'facebook' | 'instagram' | 'email'
  channel: text("channel").notNull().default("widget"), // 'widget' | 'whatsapp'
  // Provider-assigned message ID for idempotent deduplication.
  // WhatsApp: msg.id  |  Widget: null
  // Application-level dedup: checked before insert in the webhook handler.
  externalMessageId: text("external_message_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertEnquiryMessageSchema = createInsertSchema(enquiryMessagesTable).omit({ id: true, createdAt: true });
export type InsertEnquiryMessage = z.infer<typeof insertEnquiryMessageSchema>;
export type EnquiryMessage = typeof enquiryMessagesTable.$inferSelect;
