import { z } from "zod";
import type { Enquiry, EnquiryUpdate, Quote, QuoteUpdate, CompanyInput } from "@workspace/api-client-react";

export const companySchema = z.object({
  name: z.string().min(1, "Required"),
  tradeType: z.string().min(1, "Required"),
  serviceArea: z.string().optional().default(""),
  labourRatePerHour: z.coerce.number().min(0),
  dayRate: z.coerce.number().min(0).optional(),
  materialMarkupPercent: z.coerce.number().min(0),
  minimumProjectValue: z.coerce.number().min(0).optional(),
  typicalLeadTimes: z.string().optional(),
  preferredSuppliers: z.string().optional(),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().optional(),
  address: z.string().optional(),
});

export const enquirySchema = z.object({
  customerName: z.string().min(1, "Required"),
  customerEmail: z.string().email("Invalid email").optional().or(z.literal("")),
  customerPhone: z.string().optional(),
  projectType: z.string().optional(),
  location: z.string().optional(),
  description: z.string().optional(),
  budget: z.string().optional(),
  timescale: z.string().optional(),
});

export const quoteSchema = z.object({
  customerDetails: z.string().optional(),
  projectDescription: z.string().optional(),
  materialsAllowance: z.coerce.number().min(0),
  labourAllowance: z.coerce.number().min(0),
  vatAmount: z.coerce.number().min(0),
  notes: z.string().optional(),
  assumptions: z.string().optional(),
  status: z.enum(["draft", "sent", "accepted"]).optional(),
});
