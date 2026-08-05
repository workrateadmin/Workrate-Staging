import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * AI Receptionist configuration.
 * Single-row table (one per company) — get or upsert via the API.
 */
export const aiReceptionistSettingsTable = pgTable("ai_receptionist_settings", {
  id: serial("id").primaryKey(),
  // Master switch
  enabled: boolean("enabled").notNull().default(false),
  // Welcome message: "generate" | "text" | "recorded"
  welcomeMessageType: text("welcome_message_type").notNull().default("generate"),
  welcomeMessageText: text("welcome_message_text"),
  welcomeMessageUrl: text("welcome_message_url"),
  // Business hours JSON: {mon:{open:"09:00",close:"17:30",enabled:true}, ...}
  businessHours: text("business_hours"),
  // Out-of-hours: "voicemail" | "ai_anyway" | "reject"
  outOfHoursBehaviour: text("out_of_hours_behaviour").notNull().default("voicemail"),
  outOfHoursMessage: text("out_of_hours_message"),
  // Urgent call transfer
  transferUrgentCalls: boolean("transfer_urgent_calls").notNull().default(false),
  transferPhone: text("transfer_phone"),
  // JSON array of question IDs the AI should ask (from DEFAULT_QUESTIONS list)
  enabledQuestions: text("enabled_questions"),
  // Future telephony integration
  phoneNumber: text("phone_number"),
  webhookUrl: text("webhook_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAiReceptionistSettingsSchema = createInsertSchema(aiReceptionistSettingsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAiReceptionistSettings = z.infer<typeof insertAiReceptionistSettingsSchema>;
export type AiReceptionistSettings = typeof aiReceptionistSettingsTable.$inferSelect;
