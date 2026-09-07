import PDFDocument from "pdfkit";
import { downloadBufferFromStorage, isStorageUrl, parseObjectPath } from "../lib/storageUpload";

type PdfBranding = {
  documentMode?: string | null;
  name?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  companyRegNumber?: string | null;
  vatNumber?: string | null;
  bankPaymentDetails?: string | null;
  depositPaymentInstructions?: string | null;
  brandColourPrimary?: string | null;
  brandColourSecondary?: string | null;
  paymentTerms?: string | null;
  termsAndConditions?: string | null;
  quoteFooter?: string | null;
  invoiceFooter?: string | null;
  logoUrl?: string | null;
};

type PdfLine = {
  id?: string;
  description?: string;
  quantity?: number | string;
  unit?: string;
  unitPrice?: number | string;
  lineTotal?: number | string;
};

export type InvoicePdfInput = {
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  dueDate?: string | null;
  customerDetails?: string | null;
  projectDescription?: string | null;
  lineItems?: string | null;
  materialsAllowance?: number | string | null;
  vatRate?: number | string | null;
  vatAmount?: number | string | null;
  totalWithVat?: number | string | null;
  notes?: string | null;
  status?: string | null;
  brandingSnapshot?: string | null;
  depositType?: string | null;
  depositPercent?: number | string | null;
  depositAmount?: number | string | null;
  remainingBalance?: number | string | null;
  depositPaidAmount?: number | string | null;
  company?: PdfBranding | null;
};

export type QuotePdfInput = {
  quoteRef?: string | null;
  quoteDate?: string | null;
  validUntil?: string | null;
  customerDetails?: string | null;
  projectDescription?: string | null;
  lineItems?: string | null;
  materialsAllowance?: number | string | null;
  labourAllowance?: number | string | null;
  estimatedTotal?: number | string | null;
  vatRate?: number | string | null;
  vatAmount?: number | string | null;
  totalWithVat?: number | string | null;
  notes?: string | null;
  assumptions?: string | null;
  status?: string | null;
  proposalStatus?: string | null;
  brandingSnapshot?: string | null;
  depositType?: string | null;
  depositPercent?: number | string | null;
  depositAmount?: number | string | null;
  remainingBalance?: number | string | null;
  depositPaidAmount?: number | string | null;
  company?: PdfBranding | null;
};

type PdfDocumentInput = InvoicePdfInput | QuotePdfInput;
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const DARK = "#1E293B";
const TEAL = "#0d9488";
const MUTED = "#64748b";
const LIGHT_BORDER = "#e2e8f0";
const LIGHT_BG = "#f8fafc";

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function money(value: unknown): string {
  return `£${numberValue(value).toFixed(2)}`;
}

function quantityText(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim()) return value.trim();
  return "—";
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function safeColour(value: unknown, fallback: string): string {
  const colour = text(value);
  return /^#[0-9a-f]{6}$/i.test(colour) ? colour : fallback;
}

function isLight(hex: string): boolean {
  const value = hex.replace("#", "");
  if (value.length !== 6) return false;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 160;
}

function parseBranding(document: PdfDocumentInput): PdfBranding {
  if (document.brandingSnapshot) {
    try {
      const snapshot = JSON.parse(document.brandingSnapshot);
      if (snapshot && typeof snapshot === "object") return snapshot as PdfBranding;
    } catch {
      // Fall back to the company's current branding for draft invoices.
    }
  }
  return document.company ?? {};
}

function parseLines(value: unknown): PdfLine[] {
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((line): line is PdfLine => Boolean(line && typeof line === "object"));
  } catch {
    return [];
  }
}

export function isAllowedInvoiceLogoObjectPath(objectPath: string): boolean {
  return /^\/objects\/(?:(?:development|staging|production)\/)?uploads\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:png|jpe?g)$/i.test(
    objectPath,
  );
}

async function loadLogo(logoUrl: string | null | undefined): Promise<Buffer | null> {
  if (!logoUrl) return null;
  try {
    if (isStorageUrl(logoUrl) || logoUrl.startsWith("/objects/")) {
      const objectPath = parseObjectPath(logoUrl);
      if (!isAllowedInvoiceLogoObjectPath(objectPath)) return null;
      return await downloadBufferFromStorage(objectPath);
    }
    // Logos must come from WorkRate object storage. Never make server-side
    // requests to tenant-controlled URLs.
    return null;
  } catch {
    // A missing logo must not prevent an otherwise valid invoice download.
    return null;
  }
}

function drawRule(doc: PDFKit.PDFDocument, y: number, colour = LIGHT_BORDER): void {
  doc
    .save()
    .strokeColor(colour)
    .lineWidth(0.7)
    .moveTo(MARGIN, y)
    .lineTo(PAGE_WIDTH - MARGIN, y)
    .stroke()
    .restore();
}

function drawLabel(doc: PDFKit.PDFDocument, value: string, x: number, y: number, width: number): void {
  doc
    .font("Helvetica-Bold")
    .fontSize(7)
    .fillColor("#94a3b8")
    .text(value.toUpperCase(), x, y, { width, characterSpacing: 0.8 });
}

function drawPageFooter(doc: PDFKit.PDFDocument, pageNumber: number, title = "INVOICE"): void {
  doc
    .font("Helvetica")
    .fontSize(7)
    .fillColor("#94a3b8")
    .text(`WorkRate ${title.toLowerCase()} • Page ${pageNumber}`, MARGIN, PAGE_HEIGHT - 28, {
      width: CONTENT_WIDTH,
      align: "center",
    });
}

function ensureSpace(
  doc: PDFKit.PDFDocument,
  y: number,
  required: number,
  pageNumber: { value: number },
  title = "INVOICE",
): number {
  if (y + required <= PAGE_HEIGHT - 52) return y;
  drawPageFooter(doc, pageNumber.value, title);
  doc.addPage({ size: "A4", margin: 0 });
  pageNumber.value += 1;
  return MARGIN;
}

function drawTableHeader(doc: PDFKit.PDFDocument, y: number): number {
  doc.rect(MARGIN, y - 5, CONTENT_WIDTH, 22).fill(LIGHT_BG);
  doc
    .font("Helvetica-Bold")
    .fontSize(7)
    .fillColor(MUTED)
    .text("DESCRIPTION", MARGIN + 8, y + 2, { width: 230 });
  doc.text("QTY", MARGIN + 250, y + 2, { width: 35, align: "center" });
  doc.text("UNIT", MARGIN + 290, y + 2, { width: 45 });
  doc.text("UNIT PRICE", MARGIN + 340, y + 2, { width: 65, align: "right" });
  doc.text("TOTAL", MARGIN + 410, y + 2, { width: 80, align: "right" });
  return y + 28;
}

function drawDocumentPdf(
  doc: PDFKit.PDFDocument,
  document: PdfDocumentInput,
  logo: Buffer | null,
  kind: "invoice" | "quote",
): void {
  const branding = parseBranding(document);
  const isInvoice = kind === "invoice";
  const title = isInvoice ? "INVOICE" : "QUOTATION";
  const isCustom = (branding.documentMode ?? "workrate") === "custom";
  const headerBg = isCustom
    ? safeColour(branding.brandColourPrimary, DARK)
    : DARK;
  const accent = isCustom
    ? safeColour(branding.brandColourSecondary, TEAL)
    : TEAL;
  const headerText = isLight(headerBg) ? "#111827" : "#ffffff";
  const headerSubText = isLight(headerBg) ? "#64748b" : "#94a3b8";
  const companyName = text(branding.name, "Your Trade Business");
  const invoiceNumber = text(
    isInvoice ? (document as InvoicePdfInput).invoiceNumber : (document as QuotePdfInput).quoteRef,
    title,
  );
  const status = text(
    isInvoice
      ? (document as InvoicePdfInput).status
      : (document as QuotePdfInput).proposalStatus ?? (document as QuotePdfInput).status,
    "draft",
  );
  const statusLabel = status === "paid" ? "PAID" : status.toUpperCase();
  const lines = parseLines(document.lineItems);
  const subtotal = isInvoice
    ? numberValue((document as InvoicePdfInput).materialsAllowance)
    : numberValue(
        (document as QuotePdfInput).estimatedTotal,
        numberValue((document as QuotePdfInput).materialsAllowance) +
          numberValue((document as QuotePdfInput).labourAllowance),
      );
  const vatRate = numberValue(document.vatRate, 20);
  const vatAmount = numberValue(document.vatAmount);
  const total = numberValue(document.totalWithVat);
  const depositAmount = numberValue(document.depositAmount);
  const depositPaidAmount = numberValue(document.depositPaidAmount);
  const remainingBalance = status === "paid"
    ? 0
    : numberValue(document.remainingBalance, Math.max(0, total - depositPaidAmount));
  const pageNumber = { value: 1 };

  doc.rect(0, 0, PAGE_WIDTH, 178).fill(headerBg);

  if (logo) {
    try {
      doc.image(logo, MARGIN, 34, { fit: [150, 44] });
    } catch {
      // Continue with the text identity if an image format is unsupported.
    }
  } else {
    doc.roundedRect(MARGIN, 34, 38, 38, 7).fill(accent);
    doc
      .font("Helvetica-Bold")
      .fontSize(18)
      .fillColor("#ffffff")
      .text("W", MARGIN + 11, 43, { width: 20, align: "center" });
  }

  const companyX = logo ? MARGIN : MARGIN + 52;
  doc
    .font("Helvetica-Bold")
    .fontSize(15)
    .fillColor(headerText)
    .text(companyName, companyX, 86, { width: 220 });
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(headerSubText)
    .text(
      [
        text(branding.address),
        text(branding.phone),
        text(branding.email),
        text(branding.website),
        isCustom && text(branding.companyRegNumber) ? `Co. Reg: ${text(branding.companyRegNumber)}` : "",
        isCustom && text(branding.vatNumber) ? `VAT: ${text(branding.vatNumber)}` : "",
      ].filter(Boolean).join("\n"),
      companyX,
      108,
      { width: 230, lineGap: 2 },
    );

  doc
    .font("Helvetica-Bold")
    .fontSize(25)
    .fillColor(headerText)
    .text(title, PAGE_WIDTH - MARGIN - 190, 38, { width: 190, align: "right" });
  doc
    .font("Courier-Bold")
    .fontSize(10)
    .fillColor(headerSubText)
    .text(invoiceNumber, PAGE_WIDTH - MARGIN - 190, 72, { width: 190, align: "right" });
  doc.roundedRect(PAGE_WIDTH - MARGIN - 92, 98, 92, 22, 10).fill(accent);
  doc
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor("#ffffff")
    .text(statusLabel, PAGE_WIDTH - MARGIN - 92, 105, { width: 92, align: "center" });

  let y = 206;
  doc.roundedRect(MARGIN, y, CONTENT_WIDTH, 76, 4).fill(LIGHT_BG);
  drawLabel(doc, isInvoice ? "Bill To" : "Prepared For", MARGIN + 14, y + 13, 220);
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor("#1f2937")
    .text(text(document.customerDetails, "—"), MARGIN + 14, y + 30, { width: 230, lineGap: 2 });
  drawLabel(doc, isInvoice ? "Invoice Date" : "Quote Date", PAGE_WIDTH - MARGIN - 190, y + 13, 82);
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor("#1f2937")
    .text(
      text(isInvoice ? (document as InvoicePdfInput).invoiceDate : (document as QuotePdfInput).quoteDate, "—"),
      PAGE_WIDTH - MARGIN - 190,
      y + 30,
      { width: 82, align: "right" },
    );
  const secondDate = isInvoice
    ? (document as InvoicePdfInput).dueDate
    : (document as QuotePdfInput).validUntil;
  if (text(secondDate)) {
    drawLabel(doc, isInvoice ? "Due Date" : "Valid Until", PAGE_WIDTH - MARGIN - 92, y + 13, 92);
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor("#dc2626")
      .text(text(secondDate), PAGE_WIDTH - MARGIN - 92, y + 30, { width: 92, align: "right" });
  }
  y += 102;

  if (text(document.projectDescription)) {
    drawLabel(doc, isInvoice ? "Description" : "Description of Works", MARGIN, y, CONTENT_WIDTH);
    y += 14;
    doc.font("Helvetica").fontSize(9).fillColor("#475569").text(text(document.projectDescription), MARGIN, y, {
      width: CONTENT_WIDTH,
      lineGap: 2,
    });
    y += doc.heightOfString(text(document.projectDescription), { width: CONTENT_WIDTH, lineGap: 2 }) + 17;
    drawRule(doc, y - 8);
  }

  y = ensureSpace(doc, y, 55, pageNumber, title);
  if (lines.length > 0) {
    y = drawTableHeader(doc, y);
    for (const line of lines) {
      const description = text(line.description, "—");
      doc.font("Helvetica").fontSize(8.5);
      const descriptionHeight = doc.heightOfString(description, { width: 230, lineGap: 2 });
      const rowHeight = Math.max(27, descriptionHeight + 13);
      y = ensureSpace(doc, y, rowHeight + 8, pageNumber, title);
      if (y === MARGIN) y = drawTableHeader(doc, y);
      doc
        .font("Helvetica")
        .fontSize(8.5)
        .fillColor("#334155")
        .text(description, MARGIN + 8, y, { width: 230, lineGap: 2 });
      doc.text(quantityText(line.quantity), MARGIN + 250, y, { width: 35, align: "center" });
      doc.fillColor("#64748b").text(text(line.unit, "—"), MARGIN + 290, y, { width: 45 });
      doc.text(line.unitPrice == null ? "—" : money(line.unitPrice), MARGIN + 340, y, {
        width: 65,
        align: "right",
      });
      doc.font("Helvetica-Bold").fillColor("#1f2937").text(line.lineTotal == null ? "—" : money(line.lineTotal), MARGIN + 410, y, {
        width: 80,
        align: "right",
      });
      drawRule(doc, y + rowHeight - 5, "#f1f5f9");
      y += rowHeight;
    }
  } else {
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#475569")
      .text("Works as described", MARGIN, y, { width: 300 });
    doc.font("Helvetica-Bold").fillColor("#1f2937").text(money(subtotal), PAGE_WIDTH - MARGIN - 90, y, {
      width: 90,
      align: "right",
    });
    drawRule(doc, y + 20);
    y += 34;
  }

  y = ensureSpace(doc, y, 140, pageNumber, title);
  const totalsX = PAGE_WIDTH - MARGIN - 190;
  drawLabel(doc, "Subtotal", totalsX, y, 90);
  doc.font("Helvetica").fontSize(9).fillColor("#475569").text(money(subtotal), totalsX + 100, y, { width: 90, align: "right" });
  y += 18;
  doc.font("Helvetica").fontSize(9).fillColor("#64748b").text(`VAT (${vatRate}%)`, totalsX, y, { width: 90 });
  doc.fillColor("#475569").text(money(vatAmount), totalsX + 100, y, { width: 90, align: "right" });
  y += 11;
  drawRule(doc, y);
  y += 12;
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#111827").text("Total", totalsX, y, { width: 90 });
  doc.text(money(total), totalsX + 100, y, { width: 90, align: "right" });
  y += 28;

  if (depositAmount > 0) {
    y = ensureSpace(doc, y, 54, pageNumber, title);
    doc.roundedRect(totalsX, y - 5, 190, 48, 5).fill("#f0fdfa");
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#115e59").text(
      `${depositPaidAmount > 0 ? "Deposit received" : "Deposit due now"}${document.depositType === "percentage" && numberValue(document.depositPercent) ? ` (${numberValue(document.depositPercent)}%)` : ""}`,
      totalsX + 10,
      y + 3,
      { width: 110 },
    );
    doc.text(money(depositAmount), totalsX + 110, y + 3, { width: 70, align: "right" });
    doc.font("Helvetica").fontSize(8).fillColor("#475569").text("Remaining balance", totalsX + 10, y + 21, { width: 110 });
    doc.text(money(remainingBalance), totalsX + 110, y + 21, { width: 70, align: "right" });
    y += 64;
  }

  const footerText = isCustom && text(isInvoice ? branding.invoiceFooter : branding.quoteFooter)
    ? text(isInvoice ? branding.invoiceFooter : branding.quoteFooter)
    : isInvoice
      ? "Payment is due by the date stated above. Thank you for your business."
      : "This quotation is valid for 30 days from the date of issue. All prices are in GBP.";
  const paymentInstructions = depositAmount > 0
    ? (depositPaidAmount > 0 ? text(branding.bankPaymentDetails) : text(branding.depositPaymentInstructions) || text(branding.bankPaymentDetails))
    : isCustom || !isInvoice ? text(branding.bankPaymentDetails) : "";

  const sections: Array<{ label: string; value: string }> = [];
  if (text(document.notes)) sections.push({ label: "Notes", value: text(document.notes) });
  if (paymentInstructions) sections.push({ label: "Payment Details", value: paymentInstructions });
  if (isCustom && text(branding.paymentTerms)) sections.push({ label: "Payment Terms", value: text(branding.paymentTerms) });
  if (isCustom && text(branding.termsAndConditions)) sections.push({ label: "Terms & Conditions", value: text(branding.termsAndConditions) });
  if (!isInvoice && text((document as QuotePdfInput).assumptions)) {
    sections.push({ label: "Assumptions & Exclusions", value: text((document as QuotePdfInput).assumptions) });
  }

  for (const section of sections) {
    const sectionHeight = Math.max(43, doc.heightOfString(section.value, { width: CONTENT_WIDTH, lineGap: 2 }) + 29);
    y = ensureSpace(doc, y, sectionHeight, pageNumber, title);
    drawRule(doc, y);
    y += 12;
    drawLabel(doc, section.label, MARGIN, y, CONTENT_WIDTH);
    y += 14;
    doc.font("Helvetica").fontSize(8.5).fillColor("#475569").text(section.value, MARGIN, y, {
      width: CONTENT_WIDTH,
      lineGap: 2,
    });
    y += sectionHeight - 28;
  }

  y = ensureSpace(doc, y, 42, pageNumber, title);
  drawRule(doc, y, `${accent}55`);
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor("#64748b")
    .text(footerText, MARGIN, y + 13, { width: CONTENT_WIDTH, align: "center" });
  drawPageFooter(doc, pageNumber.value, title);
}

export async function renderInvoicePdf(invoice: InvoicePdfInput): Promise<Buffer> {
  return renderDocumentPdf(invoice, "invoice");
}

export async function renderQuotePdf(quote: QuotePdfInput): Promise<Buffer> {
  return renderDocumentPdf(quote, "quote");
}

async function renderDocumentPdf(document: PdfDocumentInput, kind: "invoice" | "quote"): Promise<Buffer> {
  const logo = await loadLogo(parseBranding(document).logoUrl);
  const doc = new PDFDocument({ size: "A4", margin: 0, autoFirstPage: true });
  const chunks: Buffer[] = [];
  const output = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  drawDocumentPdf(doc, document, logo, kind);
  doc.end();
  return output;
}