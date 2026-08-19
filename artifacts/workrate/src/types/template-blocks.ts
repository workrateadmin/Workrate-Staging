/**
 * Shared type definitions for imported invoice template blocks.
 *
 * Templates are stored as JSON in companies.importedInvoiceTemplate. Legacy
 * templates use a blocks array; current templates also retain the imported
 * artwork as a background image for high-fidelity rendering.
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

export interface ImportedInvoiceTemplate {
  blocks: TemplateBlock[];
  /** Original imported PDF/image rendered to a durable image URL. */
  backgroundUrl?: string;
  /** Position and size of the original artwork layer on the A4 canvas. */
  artwork?: TemplateArtworkPosition;
}

export interface TemplateArtworkPosition {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const DEFAULT_ARTWORK_POSITION: TemplateArtworkPosition = {
  x: 0,
  y: 0,
  w: 100,
  h: 100,
};

/** Parse importedInvoiceTemplate JSON safely, including legacy block arrays. */
export function parseImportedInvoiceTemplate(
  raw: string | null | undefined,
): ImportedInvoiceTemplate {
  if (!raw) return { blocks: [] };
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return { blocks: parsed };
    if (parsed && Array.isArray(parsed.blocks)) {
      return {
        blocks: parsed.blocks,
        backgroundUrl: typeof parsed.backgroundUrl === "string" ? parsed.backgroundUrl : undefined,
        artwork: parsed.artwork && typeof parsed.artwork === "object"
          ? {
              x: Number(parsed.artwork.x) || 0,
              y: Number(parsed.artwork.y) || 0,
              w: Number(parsed.artwork.w) || 100,
              h: Number(parsed.artwork.h) || 100,
            }
          : undefined,
      };
    }
  } catch {
    // A malformed saved template should never prevent a user opening an invoice.
  }
  return { blocks: [] };
}

/** Parse just the layout blocks, retained for existing callers. */
export function parseTemplateBlocks(raw: string | null | undefined): TemplateBlock[] {
  return parseImportedInvoiceTemplate(raw).blocks;
}
