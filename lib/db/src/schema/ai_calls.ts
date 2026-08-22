import { pgTable, serial, integer, text, boolean, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * AI Receptionist call records.
 * Stores every handled call — collected data, transcript, AI analysis.
 * Designed to be telephony-provider agnostic (Twilio, Vonage, etc).
 */
export const AI_CALL_STATUSES = [
  "completed",
  "dropped",
  "missed",
  "transferred",
] as const;

export type AiCallStatus = (typeof AI_CALL_STATUSES)[number];

export const aiCallsTable = pgTable("ai_calls", {
  id: serial("id").primaryKey(),
  ownerUserId: text("owner_user_id"),
  // Link to CRM once enquiry is created
  enquiryId: integer("enquiry_id"),
  // Call metadata
  callStatus: text("call_status").notNull().default("completed"),
  callerPhone: text("caller_phone"),
  callerName: text("caller_name"),
  durationSeconds: integer("duration_seconds"),
  callStartedAt: timestamp("call_started_at", { withTimezone: true }),
  callEndedAt: timestamp("call_ended_at", { withTimezone: true }),
  // Collected data stored as JSON: {customerName, phone, address, postcode, ...}
  collectedData: text("collected_data"),
  // Full call transcript as JSON array: [{role: "ai"|"caller", content: string, ts: number}]
  transcript: text("transcript"),
  // AI-generated structured summary (JSON, same shape as StructuredSummary)
  aiSummary: text("ai_summary"),
  // Confidence 0–100 that the AI captured all required info
  confidenceScore: integer("confidence_score"),
  // Whether AI recommends a site survey
  surveySuggested: boolean("survey_suggested"),
  // Whether a human follow-up is needed
  followUpRequired: boolean("follow_up_required").notNull().default(true),
  followUpNotes: text("follow_up_notes"),
  // Provider integration (Twilio, Vonage, etc) — for future use
  providerId: text("provider_id"),
  providerCallId: text("provider_call_id"),
  assistantId: text("assistant_id"),
  phoneNumberId: text("phone_number_id"),
  phoneNumber: text("phone_number"),
  recordingUrl: text("recording_url"),
  endedReason: text("ended_reason"),
  providerData: text("provider_data"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  providerCallUnique: uniqueIndex("ai_calls_provider_call_unique")
    .on(table.providerId, table.providerCallId),
  ownerCreatedIdx: index("ai_calls_owner_created_idx")
    .on(table.ownerUserId, table.createdAt),
}));

export const insertAiCallSchema = createInsertSchema(aiCallsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAiCall = z.infer<typeof insertAiCallSchema>;
export type AiCall = typeof aiCallsTable.$inferSelect;
