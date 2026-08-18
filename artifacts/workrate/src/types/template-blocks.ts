/**
 * Shared type definitions for imported invoice template blocks.
 *
 * Blocks are stored as a JSON array in companies.importedInvoiceTemplate.
 * All positions/sizes are expressed as percentages of the A4 page (0–100)
 * so the layout is resolution-independent across preview and print.
 *
 * A4 reference dimensions: 794 × 1123 px at 96 DPI.
 */

export type FieldMapping =
  | "static"
  | "businessName"
  | "businessAddress"
  | "businessPhone"
  | "businessEmail"
  | "businessWebsite"
  | "logo"
  | "invoiceNumber"
  | "invoiceDate"
  | "dueDate"
  | "customerDetails"
  | "projectDescription"
  | "lineItemsTable"
  | "subtotal"
  | "vatAmount"
  | "total"
  | "bankDetails"
  | "paymentTerms"
  | "notes"
  | "footer";

export const FIELD_MAPPING_LABELS: Record<FieldMapping, string> = {
  static: "Static text",
  businessName: "Business name",
  businessAddress: "Business address",
  businessPhone: "Business phone",
  businessEmail: "Business email",
  businessWebsite: "Business website",
  logo: "Company logo",
  invoiceNumber: "Invoice number",
  invoiceDate: "Invoice date",
  dueDate: "Due date",
  customerDetails: "Customer details",
  projectDescription: "Project description",
  lineItemsTable: "Line items table",
  subtotal: "Subtotal",
  vatAmount: "VAT amount",
  total: "Total",
  bankDetails: "Bank details",
  paymentTerms: "Payment terms",
  notes: "Notes",
  footer: "Footer",
};

/** Colour used in the editor to visually identify each block type */
export const FIELD_MAPPING_COLOURS: Record<FieldMapping, string> = {
  static: "#94a3b8",
  businessName: "#8b5cf6",
  businessAddress: "#a78bfa",
  businessPhone: "#c4b5fd",
  businessEmail: "#c4b5fd",
  businessWebsite: "#c4b5fd",
  logo: "#f59e0b",
  invoiceNumber: "#3b82f6",
  invoiceDate: "#60a5fa",
  dueDate: "#60a5fa",
  customerDetails: "#10b981",
  projectDescription: "#34d399",
  lineItemsTable: "#0891b2",
  subtotal: "#f97316",
  vatAmount: "#fb923c",
  total: "#ef4444",
  bankDetails: "#64748b",
  paymentTerms: "#64748b",
  notes: "#64748b",
  footer: "#64748b",
};

export interface TemplateBlock {
  id: string;
  type: "text" | "image" | "table";
  /** Left edge as % of A4 page width (0–100) */
  x: number;
  /** Top edge as % of A4 page height (0–100) */
  y: number;
  /** Width as % of A4 page width (0–100) */
  w: number;
  /** Height as % of A4 page height (0–100) */
  h: number;
  /** Static text content, or descriptive label for dynamic fields */
  content: string;
  fieldMapping: FieldMapping;
  fontSize?: number;    // in pt
  fontWeight?: "normal" | "bold";
  textAlign?: "left" | "center" | "right";
}

/** Parse importedInvoiceTemplate JSON safely */
export function parseTemplateBlocks(raw: string | null | undefined): TemplateBlock[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
