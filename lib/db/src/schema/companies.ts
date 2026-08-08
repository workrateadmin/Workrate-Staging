import { pgTable, serial, text, numeric, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const companiesTable = pgTable("companies", {
  id: serial("id").primaryKey(),
  ownerUserId: text("owner_user_id"),
  name: text("name").notNull().default("My Trade Business"),
  tradeType: text("trade_type").notNull().default("Joinery"),
  serviceArea: text("service_area").notNull().default(""),
  labourRatePerHour: numeric("labour_rate_per_hour", { precision: 10, scale: 2 }).notNull().default("35"),
  materialMarkupPercent: numeric("material_markup_percent", { precision: 5, scale: 2 }).notNull().default("20"),
  dayRate: numeric("day_rate", { precision: 10, scale: 2 }),
  minimumProjectValue: numeric("minimum_project_value", { precision: 10, scale: 2 }),
  typicalLeadTimes: text("typical_lead_times"),
  preferredSuppliers: text("preferred_suppliers"),
  logoUrl: text("logo_url"),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  website: text("website"),
  companyRegNumber: text("company_reg_number"),
  vatNumber: text("vat_number"),
  bankPaymentDetails: text("bank_payment_details"),
  brandColourPrimary: text("brand_colour_primary"),
  brandColourSecondary: text("brand_colour_secondary"),
  paymentTerms: text("payment_terms"),
  termsAndConditions: text("terms_and_conditions"),
  quoteFooter: text("quote_footer"),
  invoiceFooter: text("invoice_footer"),
  documentMode: text("document_mode").notNull().default("workrate"),

  // ── Deposit settings ────────────────────────────────────────────────────
  defaultDepositType: text("default_deposit_type").notNull().default("percentage"),  // 'none' | 'percentage' | 'fixed'
  defaultDepositPercent: numeric("default_deposit_percent", { precision: 5, scale: 2 }).notNull().default("50"),
  defaultDepositFixed: numeric("default_deposit_fixed", { precision: 10, scale: 2 }),
  depositPaymentInstructions: text("deposit_payment_instructions"),
  remainingBalanceDueDays: integer("remaining_balance_due_days").notNull().default(30),

  // ── Customer communications ─────────────────────────────────────────────
  notificationsFromEmail: text("notifications_from_email"),
  enquiryConfirmationEnabled: integer("enquiry_confirmation_enabled", { mode: "boolean" }).notNull().default(true),
  enquiryEmailEnabled: integer("enquiry_email_enabled", { mode: "boolean" }).notNull().default(true),
  enquirySmsEnabled: integer("enquiry_sms_enabled", { mode: "boolean" }).notNull().default(false),
  enquiryConfirmationMessage: text("enquiry_confirmation_message"),
  proposalEmailEnabled: integer("proposal_email_enabled", { mode: "boolean" }).notNull().default(true),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCompanySchema = createInsertSchema(companiesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = typeof companiesTable.$inferSelect;
