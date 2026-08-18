/**
 * ImportedInvoiceDocument — renders a company's imported invoice template.
 *
 * Blocks are positioned absolutely on an A4 canvas (794 × 1123 px).
 * Dynamic field values from live invoice data are substituted for each block's
 * fieldMapping; static blocks render their stored content verbatim.
 *
 * This is the third document mode: "workrate" | "custom" | "imported".
 */

import { TemplateBlock, FieldMapping, parseTemplateBlocks } from "@/types/template-blocks";
import { InvoiceLine } from "./invoice-document";

// A4 at 96 DPI
export const A4_W = 794;
export const A4_H = 1123;

interface BrandingData {
  documentMode?: string | null;
  name?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  companyRegNumber?: string | null;
  vatNumber?: string | null;
  bankPaymentDetails?: string | null;
  paymentTerms?: string | null;
  termsAndConditions?: string | null;
  invoiceFooter?: string | null;
  logoUrl?: string | null;
  importedInvoiceTemplate?: string | null;
}

export interface ImportedInvoiceDocProps {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string | null;
  company: any;
  brandingSnapshot?: string | null;
  customerDetails: string;
  projectDescription: string;
  lineItems?: InvoiceLine[];
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  total: number;
  notes: string;
  status: string;
}

function fmt(n: number): string {
  return `£${n.toFixed(2)}`;
}

function resolveField(
  mapping: FieldMapping,
  content: string,
  b: BrandingData,
  props: ImportedInvoiceDocProps,
): string {
  switch (mapping) {
    case "businessName":      return b.name ?? "Your Trade Business";
    case "businessAddress":   return b.address ?? "";
    case "businessPhone":     return b.phone ?? "";
    case "businessEmail":     return b.email ?? "";
    case "businessWebsite":   return b.website ?? "";
    case "invoiceNumber":     return props.invoiceNumber;
    case "invoiceDate":       return props.invoiceDate;
    case "dueDate":           return props.dueDate ?? "—";
    case "customerDetails":   return props.customerDetails;
    case "projectDescription": return props.projectDescription;
    case "subtotal":          return fmt(props.subtotal);
    case "vatAmount":         return fmt(props.vatAmount);
    case "total":             return fmt(props.total);
    case "bankDetails":       return b.bankPaymentDetails ?? "";
    case "paymentTerms":      return b.paymentTerms ?? "";
    case "notes":             return props.notes;
    case "footer":            return b.invoiceFooter ?? "";
    case "static":
    default:                  return content;
  }
}

function LineItemsTable({ lineItems, projectDescription }: {
  lineItems?: InvoiceLine[];
  projectDescription: string;
}) {
  if (!lineItems || lineItems.length === 0) {
    return <div style={{ fontSize: 11, color: "#64748b", padding: "4px" }}>{projectDescription}</div>;
  }
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
      <thead>
        <tr style={{ backgroundColor: "#f8fafc", borderBottom: "1.5px solid #e2e8f0" }}>
          <th style={{ textAlign: "left", padding: "5px 8px", fontWeight: 700 }}>Description</th>
          <th style={{ textAlign: "right", padding: "5px 8px", fontWeight: 700, width: "8%" }}>Qty</th>
          <th style={{ textAlign: "right", padding: "5px 8px", fontWeight: 700, width: "15%" }}>Unit Price</th>
          <th style={{ textAlign: "right", padding: "5px 8px", fontWeight: 700, width: "15%" }}>Total</th>
        </tr>
      </thead>
      <tbody>
        {lineItems.map((line) => (
          <tr key={line.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
            <td style={{ padding: "4px 8px" }}>{line.description}</td>
            <td style={{ textAlign: "right", padding: "4px 8px" }}>{line.quantity}</td>
            <td style={{ textAlign: "right", padding: "4px 8px" }}>£{Number(line.unitPrice).toFixed(2)}</td>
            <td style={{ textAlign: "right", padding: "4px 8px" }}>£{Number(line.lineTotal).toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ImportedInvoiceDocument(props: ImportedInvoiceDocProps) {
  const b: BrandingData = (() => {
    if (props.brandingSnapshot) {
      try { return JSON.parse(props.brandingSnapshot); } catch {}
    }
    return (props.company as BrandingData) ?? {};
  })();

  // Prefer snapshot template (historical), fall back to live company template
  const templateRaw = b.importedInvoiceTemplate ?? (props.company as any)?.importedInvoiceTemplate;
  const blocks: TemplateBlock[] = parseTemplateBlocks(templateRaw);

  if (blocks.length === 0) {
    return (
      <div
        id="invoice-document"
        className="print-doc"
        style={{
          width: A4_W, minHeight: A4_H,
          background: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#94a3b8",
          fontSize: 14,
        }}
      >
        No imported template found. Go to Settings → Documents & Branding to import one.
      </div>
    );
  }

  return (
    <div
      id="invoice-document"
      className="print-doc"
      style={{
        position: "relative",
        width: A4_W,
        minHeight: A4_H,
        background: "white",
        overflow: "hidden",
      }}
    >
      {blocks.map((block) => {
        const style: React.CSSProperties = {
          position: "absolute",
          left: `${block.x}%`,
          top: `${block.y}%`,
          width: `${block.w}%`,
          height: `${block.h}%`,
          overflow: "hidden",
        };

        if (block.fieldMapping === "logo") {
          const logoUrl = b.logoUrl ?? (props.company as any)?.logoUrl;
          if (!logoUrl) return null;
          return (
            <div key={block.id} style={style}>
              <img
                src={logoUrl}
                alt="Company logo"
                style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
              />
            </div>
          );
        }

        if (block.fieldMapping === "lineItemsTable") {
          return (
            <div key={block.id} style={style}>
              <LineItemsTable lineItems={props.lineItems} projectDescription={props.projectDescription} />
            </div>
          );
        }

        const text = resolveField(block.fieldMapping, block.content, b, props);

        return (
          <div
            key={block.id}
            style={{
              ...style,
              fontSize: block.fontSize ? `${block.fontSize}pt` : "10pt",
              fontWeight: block.fontWeight ?? "normal",
              textAlign: block.textAlign ?? "left",
              whiteSpace: "pre-wrap",
              lineHeight: 1.45,
              color: "#1e293b",
              padding: "1px 2px",
            }}
          >
            {text}
          </div>
        );
      })}
    </div>
  );
}
