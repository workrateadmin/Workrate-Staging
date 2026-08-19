/**
 * Uploads route — logo and template reference file uploads.
 *
 * Both logo and template now use Replit Object Storage (GCS) via the
 * uploadBufferToStorage helper so URLs are durable across server restarts and
 * deployments.  The old multer disk-storage approach wrote to an ephemeral
 * local /uploads/ directory that (a) wasn't served by Express and (b) was
 * wiped on every restart.
 */
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";
import multer from "multer";
import OpenAI from "openai";
import { db, companiesTable } from "@workspace/db";
import { eq, isNull } from "drizzle-orm";
import { uploadBufferToStorage, storageServingUrl } from "../lib/storageUpload";

// ── OpenAI extraction prompt for invoice layout analysis ──────────────────────
const INVOICE_EXTRACTION_PROMPT = `You are an invoice layout extractor. Analyse the invoice image and extract its visual layout as a JSON object with a "blocks" array.

Use a 0-100 coordinate space where (0,0) is the top-left corner and (100,100) is the bottom-right of the page.

For each distinct visual element return an object:
{
  "id": "block_N",
  "type": "text" | "image" | "table",
  "x": <left edge % of page width, 0-100>,
  "y": <top edge % of page height, 0-100>,
  "w": <width % of page width, 0-100>,
  "h": <height % of page height, 0-100>,
  "content": "<detected text, or empty string for dynamic/image blocks>",
  "fieldMapping": "<see values below>",
  "fontSize": <estimated pt, integer>,
  "fontWeight": "normal" | "bold",
  "textAlign": "left" | "center" | "right"
}

fieldMapping values:
- "businessName" — company/trade name (usually prominent near top)
- "businessAddress" — company full address block
- "businessPhone" — phone number
- "businessEmail" — email address
- "businessWebsite" — website URL
- "logo" — company logo graphic (type must be "image")
- "invoiceNumber" — invoice reference/ID
- "invoiceDate" — invoice issue date
- "dueDate" — payment due date
- "customerDetails" — customer/client name and address
- "projectDescription" — job description or project name
- "lineItemsTable" — the line items table (type must be "table")
- "subtotal" — subtotal amount before VAT
- "vatAmount" — VAT or tax amount
- "total" — grand total amount due
- "bankDetails" — bank account/sort code/payment instructions
- "paymentTerms" — payment terms text
- "notes" — notes or instructions
- "footer" — footer text at bottom of page
- "static" — fixed labels ("Invoice Number:", "Date:", "To:", "VAT No:", column headers, decorative lines)

Rules:
- Group related text lines into one block (all address lines = one block)
- Use "static" for labels/headers that never change between invoices
- Subtotal, VAT, and total are separate blocks each
- Line items table = one block with type "table"
- Be generous with h (height) to avoid clipping multi-line text
- Return only a JSON object { "blocks": [...] } — no markdown, no code fences`;

const router: IRouter = Router();

// ── Auth middleware ───────────────────────────────────────────────────────────
const requireAuth = (req: any, res: any, next: any) => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
};

// ── Multer: memory storage (buffer passed to GCS, never touches disk) ─────────
const LOGO_MIMETYPES = new Set([
  "image/jpeg", "image/jpg", "image/png", "image/webp", "image/svg+xml",
]);

// Relaxed template MIME types — some OS/browser combos send non-standard types
// for PDF/DOCX so we also allow the generic octet-stream fallback.
const TEMPLATE_MIMETYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // docx
  "application/msword",   // doc
  "application/octet-stream", // generic fallback (common on some browsers)
]);

const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (LOGO_MIMETYPES.has(file.mimetype)) cb(null, true);
    else cb(new Error("Only image files are allowed for logos (JPG, PNG, WebP, SVG)"));
  },
});

const templateUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    if (TEMPLATE_MIMETYPES.has(file.mimetype)) cb(null, true);
    else {
      // Accept anyway and let the server decide — avoids false rejections on
      // unusual MIME type strings (e.g. "application/x-pdf" from some clients).
      cb(null, true);
    }
  },
});

// Multer error → structured JSON (avoids Express default HTML error page)
function multerErrorHandler(err: any, _req: Request, res: Response, next: NextFunction) {
  if (err?.name === "MulterError" || err instanceof Error) {
    res.status(400).json({ error: err.message ?? "File upload error" });
    return;
  }
  next(err);
}

// ── Helper: find the authenticated user's company ─────────────────────────────
async function getCompanyForUser(userId: string) {
  let [company] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.ownerUserId, userId))
    .limit(1);
  if (!company) {
    [company] = await db
      .select()
      .from(companiesTable)
      .where(isNull(companiesTable.ownerUserId))
      .limit(1);
  }
  return company ?? null;
}

// ── POST /uploads/logo ────────────────────────────────────────────────────────
router.post(
  "/uploads/logo",
  requireAuth,
  logoUpload.single("file"),
  multerErrorHandler,
  async (req: Request, res: Response): Promise<void> => {
    const file = req.file;
    if (!file) { res.status(400).json({ error: "No file provided" }); return; }

    try {
      const { objectPath } = await uploadBufferToStorage(file.buffer, file.mimetype);
      const url = storageServingUrl(req, objectPath);
      res.json({ url });
    } catch (err: any) {
      req.log?.error({ err }, "Logo upload to object storage failed");
      res.status(500).json({ error: "Storage upload failed. Please try again." });
    }
  }
);

// ── POST /uploads/template ────────────────────────────────────────────────────
// Query param: ?type=quote | ?type=invoice (defaults to "invoice")
// Saves the uploaded reference template to GCS and persists the URL to the
// company record so it survives page refreshes.
router.post(
  "/uploads/template",
  requireAuth,
  templateUpload.single("file"),
  multerErrorHandler,
  async (req: Request, res: Response): Promise<void> => {
    const { userId } = getAuth(req);
    const file = req.file;
    if (!file) { res.status(400).json({ error: "No file provided" }); return; }

    const docType = req.query.type === "quote" ? "quote" : "invoice";
    const contentType = file.mimetype === "application/octet-stream"
      ? (file.originalname.endsWith(".docx") ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : file.originalname.endsWith(".doc") ? "application/msword"
        : "application/pdf")
      : file.mimetype;

    try {
      const { objectPath } = await uploadBufferToStorage(file.buffer, contentType);
      const url = storageServingUrl(req, objectPath);

      // Persist URL to the company record so it survives page refresh
      const company = await getCompanyForUser(userId!);
      if (company) {
        const field = docType === "quote" ? "quoteTemplateUrl" : "invoiceTemplateUrl";
        await db
          .update(companiesTable)
          .set({ [field]: url })
          .where(eq(companiesTable.id, company.id));
      }

      res.json({ url, filename: file.originalname, docType });
    } catch (err: any) {
      req.log?.error({ err }, "Template upload to object storage failed");
      res.status(500).json({ error: "Storage upload failed. Please try again." });
    }
  }
);

// ── Multer: invoice import image ──────────────────────────────────────────────
const invoiceImportUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, _file, cb) => cb(null, true), // client validates type
});

// ── POST /uploads/import-invoice ──────────────────────────────────────────────
// Client converts PDF→PNG before uploading (pdf.js in browser).
// We send the PNG to gpt-4o vision and return detected layout blocks. The
// original artwork is also stored so colours, logos, borders and type treatment
// remain faithful when live invoice values are overlaid.
router.post(
  "/uploads/import-invoice",
  requireAuth,
  invoiceImportUpload.single("file"),
  multerErrorHandler,
  async (req: Request, res: Response): Promise<void> => {
    const file = req.file;
    if (!file) { res.status(400).json({ error: "No file provided" }); return; }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "AI analysis not configured — OPENAI_API_KEY missing" });
      return;
    }

    try {
      const openai = new OpenAI({ apiKey });
      const base64 = file.buffer.toString("base64");
      const mimeType = file.mimetype.startsWith("image/") ? file.mimetype : "image/png";

      req.log?.info({ bytes: file.size, mime: mimeType }, "Analysing invoice image with gpt-4o");

      const aiResponse = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: INVOICE_EXTRACTION_PROMPT },
              {
                type: "image_url",
                image_url: { url: `data:${mimeType};base64,${base64}`, detail: "high" },
              },
            ],
          },
        ],
        response_format: { type: "json_object" },
        max_tokens: 4096,
      });

      const content = aiResponse.choices[0].message.content ?? "{}";
      let blocks: any[] = [];
      try {
        const parsed = JSON.parse(content);
        blocks = Array.isArray(parsed) ? parsed : (parsed.blocks ?? []);
      } catch {
        req.log?.warn({ content }, "Failed to parse AI response as JSON");
      }

      // Ensure every block has a stable ID
      blocks = blocks.map((b: any, i: number) => ({
        ...b,
        id: b.id ?? `block_${i + 1}`,
      }));

      const { objectPath } = await uploadBufferToStorage(file.buffer, mimeType);
      const backgroundUrl = storageServingUrl(req, objectPath);

      req.log?.info({ blockCount: blocks.length }, "Invoice layout extracted successfully");
      res.json({ blocks, backgroundUrl });
    } catch (err: any) {
      req.log?.error({ err }, "Invoice import AI analysis failed");
      res.status(500).json({ error: "AI analysis failed. Please try again." });
    }
  }
);

export default router;
