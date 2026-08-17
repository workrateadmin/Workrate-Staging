/**
 * WorkRate Cost Intelligence Extractor
 *
 * Extracts structured data from production documents (cutting lists, BOMs, supplier invoices)
 * using GPT-4o. Follows the UK timber rule: sawn/nominal and finished/planed dimensions are
 * always stored separately. Sawn dimensions are NEVER invented — they stay null unless the
 * source document explicitly states the stock size.
 */

import OpenAI from "openai";
import * as XLSX from "xlsx";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const EXTRACTION_METHOD = "openai-gpt4o-v1";

// ── Types returned by the extractor ──────────────────────────────────────────

export interface ExtractedComponent {
  item_name: string | null;
  quantity: number | null;
  finished_length_mm: number | null;
  finished_width_mm: number | null;
  finished_thickness_mm: number | null;
  /** NEVER invented from finished dimensions — null if not in document */
  sawn_length_mm: number | null;
  sawn_width_mm: number | null;
  sawn_thickness_mm: number | null;
  material: "timber" | "sheet" | "hardware" | "other" | null;
  timber_species: string | null;
  timber_grade: string | null;
  board_type: string | null;
  sheet_finish: string | null;
  hardware_ref: string | null;
  supplier_ref: string | null;
  unit_cost: number | null;
  total_cost: number | null;
  notes: string | null;
  confidence_score: number;
  original_extracted_text: string;
}

export interface ExtractedInvoiceLine {
  supplier_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  item_description: string | null;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  line_total: number | null;
  vat_amount: number | null;
  material_category: string | null;
  product_ref: string | null;
  confidence_score: number;
  original_extracted_text: string;
}

export interface ExtractionResult {
  method: string;
  rawResponse: unknown;
  components?: ExtractedComponent[];
  invoiceLines?: ExtractedInvoiceLine[];
}

// ── Prompts ───────────────────────────────────────────────────────────────────

const COMPONENT_PROMPT = `You are a UK joinery and carpentry production document parser.
Extract all component/item rows from this cutting list or bill of materials.

CRITICAL UK TIMBER RULES — READ CAREFULLY:
1. UK timber has TWO different sizes that must NEVER be confused:
   - "finished" or "planed" dimensions: the required size of the component AFTER machining. Use finished_*_mm fields.
   - "sawn" or "nominal" dimensions: the purchased/stock size BEFORE machining (always larger). Use sawn_*_mm fields.
2. If the document ONLY gives finished/planed dimensions → set sawn_*_mm fields to null. NEVER calculate or estimate sawn size.
3. If the document shows BOTH sizes (e.g. "44×94 fin. from 50×100 sawn" or "PAR 44×94 from 50×100") → store both.
4. NEVER invent, calculate, or estimate any value not explicitly present in the document.
5. All dimensions: convert to mm. 1 inch = 25.4mm. Round to 1 decimal place.
6. confidence_score: 1.0 = certain, 0.7 = probable, 0.5 = uncertain, 0.0 = guessing.
7. original_extracted_text: the exact raw text from the document for this row (for audit trail).
8. material: classify as "timber" (solid wood), "sheet" (MDF/ply/MFC etc), "hardware" (fixings/hinges/handles), or "other".
9. timber_species examples: Accoya, Oak, Sapele, Iroko, Tulipwood, softwood, pine — NOT a restricted list.
10. board_type examples: MDF, MR MDF, plywood, MFC, veneered board — NOT a restricted list.

Return ONLY valid JSON in this exact shape (no markdown, no explanation):
{
  "components": [
    {
      "item_name": string or null,
      "quantity": number or null,
      "finished_length_mm": number or null,
      "finished_width_mm": number or null,
      "finished_thickness_mm": number or null,
      "sawn_length_mm": number or null,
      "sawn_width_mm": number or null,
      "sawn_thickness_mm": number or null,
      "material": "timber"|"sheet"|"hardware"|"other"|null,
      "timber_species": string or null,
      "timber_grade": string or null,
      "board_type": string or null,
      "sheet_finish": string or null,
      "hardware_ref": string or null,
      "supplier_ref": string or null,
      "unit_cost": number or null,
      "total_cost": number or null,
      "notes": string or null,
      "confidence_score": number,
      "original_extracted_text": string
    }
  ]
}`;

const INVOICE_PROMPT = `You are a UK supplier invoice parser.
Extract every line item from this supplier/material invoice.

RULES:
1. Extract the invoice header fields (supplier name, invoice number, date) and repeat them on every line.
2. Extract every line item — do not skip any.
3. NEVER invent values not present. If a field is missing, use null.
4. unit examples: "each", "pce", "length", "m", "m²", "sheet", "kg", "litre" — not a restricted list.
5. Prices are in GBP unless stated otherwise.
6. confidence_score: 1.0 = certain, 0.7 = probable, 0.5 = uncertain.
7. original_extracted_text: the exact raw text for this line item.

Return ONLY valid JSON (no markdown):
{
  "lines": [
    {
      "supplier_name": string or null,
      "invoice_number": string or null,
      "invoice_date": string or null,
      "item_description": string or null,
      "quantity": number or null,
      "unit": string or null,
      "unit_price": number or null,
      "line_total": number or null,
      "vat_amount": number or null,
      "material_category": string or null,
      "product_ref": string or null,
      "confidence_score": number,
      "original_extracted_text": string
    }
  ]
}`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function bufferToBase64DataUrl(buffer: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

function spreadsheetToText(buffer: Buffer): string {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheets: string[] = [];
  for (const name of workbook.SheetNames) {
    const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[name], { strip: true });
    if (csv.trim()) sheets.push(`Sheet: ${name}\n${csv}`);
  }
  return sheets.join("\n\n");
}

function safeJson(text: string): unknown {
  // Strip markdown code fences if present
  const cleaned = text.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
  return JSON.parse(cleaned);
}

function parseNum(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

function coerceComponent(raw: any): ExtractedComponent {
  return {
    item_name: raw.item_name ?? null,
    quantity: parseNum(raw.quantity),
    finished_length_mm: parseNum(raw.finished_length_mm),
    finished_width_mm: parseNum(raw.finished_width_mm),
    finished_thickness_mm: parseNum(raw.finished_thickness_mm),
    sawn_length_mm: parseNum(raw.sawn_length_mm),
    sawn_width_mm: parseNum(raw.sawn_width_mm),
    sawn_thickness_mm: parseNum(raw.sawn_thickness_mm),
    material: raw.material ?? null,
    timber_species: raw.timber_species ?? null,
    timber_grade: raw.timber_grade ?? null,
    board_type: raw.board_type ?? null,
    sheet_finish: raw.sheet_finish ?? null,
    hardware_ref: raw.hardware_ref ?? null,
    supplier_ref: raw.supplier_ref ?? null,
    unit_cost: parseNum(raw.unit_cost),
    total_cost: parseNum(raw.total_cost),
    notes: raw.notes ?? null,
    confidence_score: parseNum(raw.confidence_score) ?? 0.5,
    original_extracted_text: String(raw.original_extracted_text ?? ""),
  };
}

function coerceInvoiceLine(raw: any): ExtractedInvoiceLine {
  return {
    supplier_name: raw.supplier_name ?? null,
    invoice_number: raw.invoice_number ?? null,
    invoice_date: raw.invoice_date ?? null,
    item_description: raw.item_description ?? null,
    quantity: parseNum(raw.quantity),
    unit: raw.unit ?? null,
    unit_price: parseNum(raw.unit_price),
    line_total: parseNum(raw.line_total),
    vat_amount: parseNum(raw.vat_amount),
    material_category: raw.material_category ?? null,
    product_ref: raw.product_ref ?? null,
    confidence_score: parseNum(raw.confidence_score) ?? 0.5,
    original_extracted_text: String(raw.original_extracted_text ?? ""),
  };
}

// ── Core extraction logic ─────────────────────────────────────────────────────

type MessageContent = OpenAI.Chat.ChatCompletionContentPart;

async function buildContentParts(
  buffer: Buffer,
  mimeType: string,
  prompt: string,
): Promise<MessageContent[]> {
  const isSpreadsheet =
    mimeType.includes("spreadsheetml") ||
    mimeType === "application/vnd.ms-excel" ||
    mimeType === "text/csv";

  if (isSpreadsheet) {
    const text = spreadsheetToText(buffer);
    return [
      { type: "text", text: `${prompt}\n\n<document_content>\n${text}\n</document_content>` },
    ];
  }

  // Images and PDFs: pass as base64 to gpt-4o vision
  const dataUrl = bufferToBase64DataUrl(buffer, mimeType);
  return [
    { type: "text", text: prompt },
    { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
  ] as MessageContent[];
}

async function callGpt4o(content: MessageContent[]): Promise<string> {
  const resp = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content }],
    temperature: 0,
    max_tokens: 4096,
    response_format: { type: "json_object" },
  });
  return resp.choices[0]?.message?.content ?? "{}";
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Extract structured intelligence from a production document.
 *
 * @param buffer     File buffer (in memory from multer)
 * @param mimeType   MIME type of the file
 * @param docType    WorkRate document type (cutting_list | bill_of_materials | supplier_invoice | drawings | other)
 * @param timeoutMs  Max time to spend on extraction (default 30s)
 */
export async function extractDocumentIntelligence(
  buffer: Buffer,
  mimeType: string,
  docType: string,
  timeoutMs = 30_000,
): Promise<ExtractionResult> {
  const isComponentDoc = docType === "cutting_list" || docType === "bill_of_materials";
  const isInvoiceDoc = docType === "supplier_invoice";

  if (!isComponentDoc && !isInvoiceDoc) {
    return { method: EXTRACTION_METHOD, rawResponse: null };
  }

  const prompt = isComponentDoc ? COMPONENT_PROMPT : INVOICE_PROMPT;
  const content = await buildContentParts(buffer, mimeType, prompt);

  // Wrap in timeout
  const rawText = await Promise.race([
    callGpt4o(content),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Extraction timed out")), timeoutMs),
    ),
  ]);

  const parsed = safeJson(rawText) as any;

  if (isComponentDoc) {
    const components: ExtractedComponent[] = (parsed.components ?? []).map(coerceComponent);
    return { method: EXTRACTION_METHOD, rawResponse: parsed, components };
  } else {
    const invoiceLines: ExtractedInvoiceLine[] = (parsed.lines ?? []).map(coerceInvoiceLine);
    return { method: EXTRACTION_METHOD, rawResponse: parsed, invoiceLines };
  }
}
