import { pgTable, serial, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const companiesTable = pgTable("companies", {
  id: serial("id").primaryKey(),
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCompanySchema = createInsertSchema(companiesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = typeof companiesTable.$inferSelect;
