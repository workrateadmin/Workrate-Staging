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
import { db, companiesTable } from "@workspace/db";
import { eq, isNull } from "drizzle-orm";
import { uploadBufferToStorage, storageServingUrl } from "../lib/storageUpload";

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

export default router;
