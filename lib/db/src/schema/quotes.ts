import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const quotesTable = pgTable("quotes", {
  id: serial("id").primaryKey(),
  enquiryId: integer("enquiry_id").notNull(),
  customerDetails: text("customer_details"),
  projectDescription: text("project_description"),
  materialsAllowance: numeric("materials_allowance", { precision: 10, scale: 2 }).notNull().default("0"),
  labourAllowance: numeric("labour_allowance", { precision: 10, scale: 2 }).notNull().default("0"),
  estimatedTotal: numeric("estimated_total", { precision: 10, scale: 2 }).notNull().default("0"),
  vatAmount: numeric("vat_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  totalWithVat: numeric("total_with_vat", { precision: 10, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  assumptions: text("assumptions"),
  status: text("status").notNull().default("draft"),
  brandingSnapshot: text("branding_snapshot"),

  // ── Proposal fields ────────────────────────────────────────────────────
  proposalStatus: text("proposal_status").notNull().default("draft"),
  proposalToken: text("proposal_token"),      // unique public-facing URL token
  depositType: text("deposit_type"),          // 'none' | 'percentage' | 'fixed'
  depositPercent: numeric("deposit_percent", { precision: 5, scale: 2 }),
  depositFixed: numeric("deposit_fixed", { precision: 10, scale: 2 }),
  depositAmount: numeric("deposit_amount", { precision: 10, scale: 2 }),    // calculated
  remainingBalance: numeric("remaining_balance", { precision: 10, scale: 2 }),
  depositPaidAt: timestamp("deposit_paid_at", { withTimezone: true }),
  depositPaidAmount: numeric("deposit_paid_amount", { precision: 10, scale: 2 }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  acceptedByName: text("accepted_by_name"),
  acceptedByEmail: text("accepted_by_email"),
  viewedAt: timestamp("viewed_at", { withTimezone: true }),
  acceptanceSnapshot: text("acceptance_snapshot"),  // JSON snapshot at acceptance
  customerQuestion: text("customer_question"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertQuoteSchema = createInsertSchema(quotesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertQuote = z.infer<typeof insertQuoteSchema>;
export type Quote = typeof quotesTable.$inferSelect;
