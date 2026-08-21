import OpenAI from "openai";
import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

export const RECEIPT_EXTRACTION_METHOD = "openai-gpt4o-receipt-v1";

export type ReceiptSuggestion = {
  supplierName: string | null;
  transactionDate: string | null;
  description: string | null;
  category: string | null;
  grossAmount: number | null;
  netAmount: number | null;
  vatAmount: number | null;
  paymentMethod: string | null;
  jobReference: string | null;
  confidence: number | null;
};

const RECEIPT_PROMPT = `You are extracting facts from a UK trade-business receipt or supplier invoice.
Return only JSON in this exact shape:
{
  "supplierName": string|null,
  "transactionDate": "YYYY-MM-DD"|null,
  "description": string|null,
  "category": string|null,
  "grossAmount": number|null,
  "netAmount": number|null,
  "vatAmount": number|null,
  "paymentMethod": string|null,
  "jobReference": string|null,
  "confidence": number|null
}

Rules:
- Extract only values visibly stated in the document. Never infer, calculate, or invent a date, VAT split, total, category, payment method, or job reference.
- Use a concise, human-readable description of the purchase only when the receipt states it.
- category may be one of Materials, Labour, Fuel and travel, Tools and equipment, Plant hire, Subcontractors, Office and software, Insurance, Training, Marketing, Professional fees, or Other. Use null if unclear.
- This is a suggestion for human review, not a financial decision.`;

const execFileAsync = promisify(execFile);

function money(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isoDate(value: unknown): string | null {
  const candidate = text(value);
  return candidate && /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : null;
}

async function pdfToImageDataUrls(pdf: Buffer): Promise<string[]> {
  const directory = await mkdtemp(join(tmpdir(), "workrate-receipt-"));
  const inputPath = join(directory, "receipt.pdf");
  const outputPrefix = join(directory, "page");
  try {
    await writeFile(inputPath, pdf);
    // Vision receives images, not PDF data URIs. Render the first three pages
    // at readable resolution so ordinary multi-page supplier invoices work
    // without treating a PDF as an unsupported image type.
    await execFileAsync("pdftoppm", [
      "-f", "1", "-l", "3", "-r", "180", "-png", inputPath, outputPrefix,
    ], { maxBuffer: 10 * 1024 * 1024 });
    const pages = (await readdir(directory))
      .filter((name) => /^page-\d+\.png$/.test(name))
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
    if (!pages.length) throw new Error("PDF rendering produced no pages");
    return Promise.all(pages.map(async (page) => {
      const image = await readFile(join(directory, page));
      return `data:image/png;base64,${image.toString("base64")}`;
    }));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function imageDataUrls(buffer: Buffer, mimeType: string): Promise<string[]> {
  if (mimeType === "application/pdf") return pdfToImageDataUrls(buffer);
  return [`data:${mimeType};base64,${buffer.toString("base64")}`];
}

export async function extractReceiptSuggestion(
  buffer: Buffer,
  mimeType: string,
): Promise<{ method: string; rawResponse: unknown; suggestion: ReceiptSuggestion }> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not set");
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const dataUrls = await imageDataUrls(buffer, mimeType);
  const result = await client.chat.completions.create({
    model: "gpt-4o",
    temperature: 0,
    max_tokens: 1000,
    response_format: { type: "json_object" },
    messages: [{
      role: "user",
      content: [
        { type: "text", text: RECEIPT_PROMPT },
        ...dataUrls.map((url) => ({ type: "image_url" as const, image_url: { url, detail: "high" as const } })),
      ] as any,
    }],
  });

  const rawText = result.choices[0]?.message?.content ?? "{}";
  const rawResponse = JSON.parse(rawText) as Record<string, unknown>;
  return {
    method: RECEIPT_EXTRACTION_METHOD,
    rawResponse,
    suggestion: {
      supplierName: text(rawResponse.supplierName),
      transactionDate: isoDate(rawResponse.transactionDate),
      description: text(rawResponse.description),
      category: text(rawResponse.category),
      grossAmount: money(rawResponse.grossAmount),
      netAmount: money(rawResponse.netAmount),
      vatAmount: money(rawResponse.vatAmount),
      paymentMethod: text(rawResponse.paymentMethod),
      jobReference: text(rawResponse.jobReference),
      confidence: money(rawResponse.confidence),
    },
  };
}