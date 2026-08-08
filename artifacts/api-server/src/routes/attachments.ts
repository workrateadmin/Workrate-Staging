import { Router, type IRouter, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { randomBytes } from "crypto";
import path from "path";
import { mkdirSync } from "fs";
import { unlink } from "fs/promises";
import multer from "multer";
import { db, enquiriesTable, enquiryAttachmentsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

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

// ── File storage ──────────────────────────────────────────────────────────────
const uploadsDir = path.join(process.cwd(), "uploads");
mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${randomBytes(6).toString("hex")}`;
    const ext = path.extname(file.originalname);
    cb(null, `${unique}${ext}`);
  },
});

const ALLOWED_MIMETYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMETYPES.has(file.mimetype)) cb(null, true);
    else cb(new Error("Only images and PDF files are allowed"));
  },
});

function fileUrl(req: Request, filename: string): string {
  const host = req.get("host") ?? "localhost";
  return `${req.protocol}://${host}/uploads/${filename}`;
}

// ── GET /enquiries/:id/attachments ────────────────────────────────────────────
router.get(
  "/enquiries/:id/attachments",
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId } = getAuth(req);
    const id = Number(req.params.id);
    if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

    const [enquiry] = await db
      .select({ id: enquiriesTable.id })
      .from(enquiriesTable)
      .where(and(eq(enquiriesTable.id, id), eq(enquiriesTable.ownerUserId, userId!)));

    if (!enquiry) { res.status(404).json({ error: "Enquiry not found" }); return; }

    const attachments = await db
      .select()
      .from(enquiryAttachmentsTable)
      .where(eq(enquiryAttachmentsTable.enquiryId, id))
      .orderBy(enquiryAttachmentsTable.uploadedAt);

    res.json(attachments);
  }
);

// ── POST /enquiries/:id/attachments ───────────────────────────────────────────
router.post(
  "/enquiries/:id/attachments",
  requireAuth,
  upload.single("file"),
  async (req: Request, res: Response): Promise<void> => {
    const { userId } = getAuth(req);
    const id = Number(req.params.id);
    if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

    const file = req.file;
    if (!file) { res.status(400).json({ error: "No file provided" }); return; }

    const [enquiry] = await db
      .select({ id: enquiriesTable.id })
      .from(enquiriesTable)
      .where(and(eq(enquiriesTable.id, id), eq(enquiriesTable.ownerUserId, userId!)));

    if (!enquiry) { res.status(404).json({ error: "Enquiry not found" }); return; }

    const url = fileUrl(req, file.filename);

    const [attachment] = await db
      .insert(enquiryAttachmentsTable)
      .values({
        enquiryId: id,
        url,
        filename: file.originalname,
        mimetype: file.mimetype,
        fileSize: file.size,
      })
      .returning();

    res.status(201).json(attachment);
  }
);

// ── DELETE /enquiries/:id/attachments/:attachmentId ───────────────────────────
router.delete(
  "/enquiries/:id/attachments/:attachmentId",
  requireAuth,
  async (req, res): Promise<void> => {
    const { userId } = getAuth(req);
    const id = Number(req.params.id);
    const attachmentId = Number(req.params.attachmentId);
    if (!id || !attachmentId) { res.status(400).json({ error: "Invalid id" }); return; }

    // Verify enquiry ownership
    const [enquiry] = await db
      .select({ id: enquiriesTable.id })
      .from(enquiriesTable)
      .where(and(eq(enquiriesTable.id, id), eq(enquiriesTable.ownerUserId, userId!)));
    if (!enquiry) { res.status(404).json({ error: "Enquiry not found" }); return; }

    const [attachment] = await db
      .select()
      .from(enquiryAttachmentsTable)
      .where(
        and(
          eq(enquiryAttachmentsTable.id, attachmentId),
          eq(enquiryAttachmentsTable.enquiryId, id)
        )
      );

    if (!attachment) { res.status(404).json({ error: "Attachment not found" }); return; }

    // Delete from disk (best-effort)
    try {
      const filename = attachment.url.split("/uploads/").at(-1);
      if (filename) await unlink(path.join(uploadsDir, filename));
    } catch {
      // File may already be gone — not a fatal error
    }

    await db
      .delete(enquiryAttachmentsTable)
      .where(eq(enquiryAttachmentsTable.id, attachmentId));

    res.status(204).end();
  }
);

export default router;
