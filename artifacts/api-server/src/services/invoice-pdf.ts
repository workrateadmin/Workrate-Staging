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

function parseBranding(invoice: InvoicePdfInput): PdfBranding {
  if (invoice.brandingSnapshot) {
    try {
      const snapshot = JSON.parse(invoice.brandingSnapshot);
      if (snapshot && typeof snapshot === "object") return snapshot as PdfBranding;
    } catch {
      // Fall back to the company's current branding for draft invoices.
    }
  }
  return invoice.company ?? {};
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
  return /^\/objects\/uploads\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:png|jpe?g)$/i.test(
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

function drawPageFooter(doc: PDFKit.PDFDocument, pageNumber: number): void {
  doc
    .font("Helvetica")
    .fontSize(7)
    .fillColor("#94a3b8")
    .text(`WorkRate invoice • Page ${pageNumber}`, MARGIN, PAGE_HEIGHT - 28, {
      width: CONTENT_WIDTH,
      align: "center",
    });
}

function ensureSpace(
  doc: PDFKit.PDFDocument,
  y: number,
  required: number,
  pageNumber: { value: number },
): number {
  if (y + required <= PAGE_HEIGHT - 52) return y;
  drawPageFooter(doc, pageNumber.value);
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

function drawInvoicePdf(doc: PDFKit.PDFDocument, invoice: InvoicePdfInput, logo: Buffer | null): void {
  const branding = parseBranding(invoice);
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
  const invoiceNumber = text(invoice.invoiceNumber, "INVOICE");
  const status = text(invoice.status, "draft");
  const statusLabel = status === "paid" ? "PAID" : status.toUpperCase();
  const lines = parseLines(invoice.lineItems);
  const subtotal = numberValue(invoice.materialsAllowance);
  const vatRate = numberValue(invoice.vatRate, 20);
  const vatAmount = numberValue(invoice.vatAmount);
  const total = numberValue(invoice.totalWithVat);
  const depositAmount = numberValue(invoice.depositAmount);
  const depositPaidAmount = numberValue(invoice.depositPaidAmount);
  const remainingBalance = status === "paid"
    ? 0
    : numberValue(invoice.remainingBalance, Math.max(0, total - depositPaidAmount));
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
    .text("INVOICE", PAGE_WIDTH - MARGIN - 190, 38, { width: 190, align: "right" });
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
  drawLabel(doc, "Bill To", MARGIN + 14, y + 13, 220);
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor("#1f2937")
    .text(text(invoice.customerDetails, "—"), MARGIN + 14, y + 30, { width: 230, lineGap: 2 });
  drawLabel(doc, "Invoice Date", PAGE_WIDTH - MARGIN - 190, y + 13, 82);
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor("#1f2937")
    .text(text(invoice.invoiceDate, "—"), PAGE_WIDTH - MARGIN - 190, y + 30, { width: 82, align: "right" });
  if (text(invoice.dueDate)) {
    drawLabel(doc, "Due Date", PAGE_WIDTH - MARGIN - 92, y + 13, 92);
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor("#dc2626")
      .text(text(invoice.dueDate), PAGE_WIDTH - MARGIN - 92, y + 30, { width: 92, align: "right" });
  }
  y += 102;

  if (text(invoice.projectDescription)) {
    drawLabel(doc, "Description", MARGIN, y, CONTENT_WIDTH);
    y += 14;
    doc.font("Helvetica").fontSize(9).fillColor("#475569").text(text(invoice.projectDescription), MARGIN, y, {
      width: CONTENT_WIDTH,
      lineGap: 2,
    });
    y += doc.heightOfString(text(invoice.projectDescription), { width: CONTENT_WIDTH, lineGap: 2 }) + 17;
    drawRule(doc, y - 8);
  }

  y = ensureSpace(doc, y, 55, pageNumber);
  if (lines.length > 0) {
    y = drawTableHeader(doc, y);
    for (const line of lines) {
      const description = text(line.description, "—");
      doc.font("Helvetica").fontSize(8.5);
      const descriptionHeight = doc.heightOfString(description, { width: 230, lineGap: 2 });
      const rowHeight = Math.max(27, descriptionHeight + 13);
      y = ensureSpace(doc, y, rowHeight + 8, pageNumber);
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

  y = ensureSpace(doc, y, 140, pageNumber);
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
    y = ensureSpace(doc, y, 54, pageNumber);
    doc.roundedRect(totalsX, y - 5, 190, 48, 5).fill("#f0fdfa");
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#115e59").text(
      `${depositPaidAmount > 0 ? "Deposit received" : "Deposit due now"}${invoice.depositType === "percentage" && numberValue(invoice.depositPercent) ? ` (${numberValue(invoice.depositPercent)}%)` : ""}`,
      totalsX + 10,
      y + 3,
      { width: 110 },
    );
    doc.text(money(depositAmount), totalsX + 110, y + 3, { width: 70, align: "right" });
    doc.font("Helvetica").fontSize(8).fillColor("#475569").text("Remaining balance", totalsX + 10, y + 21, { width: 110 });
    doc.text(money(remainingBalance), totalsX + 110, y + 21, { width: 70, align: "right" });
    y += 64;
  }

  const footerText = isCustom && text(branding.invoiceFooter)
    ? text(branding.invoiceFooter)
    : "Payment is due by the date stated above. Thank you for your business.";
  const paymentInstructions = depositAmount > 0
    ? (depositPaidAmount > 0 ? text(branding.bankPaymentDetails) : text(branding.depositPaymentInstructions) || text(branding.bankPaymentDetails))
    : isCustom ? text(branding.bankPaymentDetails) : "";

  const sections: Array<{ label: string; value: string }> = [];
  if (text(invoice.notes)) sections.push({ label: "Notes", value: text(invoice.notes) });
  if (paymentInstructions) sections.push({ label: "Payment Details", value: paymentInstructions });
  if (isCustom && text(branding.paymentTerms)) sections.push({ label: "Payment Terms", value: text(branding.paymentTerms) });
  if (isCustom && text(branding.termsAndConditions)) sections.push({ label: "Terms & Conditions", value: text(branding.termsAndConditions) });

  for (const section of sections) {
    const sectionHeight = Math.max(43, doc.heightOfString(section.value, { width: CONTENT_WIDTH, lineGap: 2 }) + 29);
    y = ensureSpace(doc, y, sectionHeight, pageNumber);
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

  y = ensureSpace(doc, y, 42, pageNumber);
  drawRule(doc, y, `${accent}55`);
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor("#64748b")
    .text(footerText, MARGIN, y + 13, { width: CONTENT_WIDTH, align: "center" });
  drawPageFooter(doc, pageNumber.value);
}

export async function renderInvoicePdf(invoice: InvoicePdfInput): Promise<Buffer> {
  const logo = await loadLogo(parseBranding(invoice).logoUrl);
  const doc = new PDFDocument({ size: "A4", margin: 0, autoFirstPage: true });
  const chunks: Buffer[] = [];
  const output = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  drawInvoicePdf(doc, invoice, logo);
  doc.end();
  return output;
}