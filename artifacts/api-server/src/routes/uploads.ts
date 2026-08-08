/**
 * Uploads route — logo and template reference file uploads.
 * Reuses the same multer/disk-storage pattern as attachments.ts.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { randomBytes } from "crypto";
import path from "path";
import { mkdirSync } from "fs";
import multer from "multer";

const router: IRouter = Router();

const requireAuth = (req: any, res: any, next: any) => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
};

// ── File storage (shared uploads dir) ────────────────────────────────────────
const uploadsDir = path.join(process.cwd(), "uploads");
mkdirSync(uploadsDir, { recursive: true });

const logoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const unique = `logo-${Date.now()}-${randomBytes(6).toString("hex")}`;
    const ext = path.extname(file.originalname);
    cb(null, `${unique}${ext}`);
  },
});

const templateStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const unique = `template-${Date.now()}-${randomBytes(6).toString("hex")}`;
    const ext = path.extname(file.originalname);
    cb(null, `${unique}${ext}`);
  },
});

const LOGO_MIMETYPES = new Set([
  "image/jpeg", "image/jpg", "image/png", "image/webp", "image/svg+xml",
]);

const TEMPLATE_MIMETYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // docx
  "application/msword", // doc
]);

const logoUpload = multer({
  storage: logoStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (LOGO_MIMETYPES.has(file.mimetype)) cb(null, true);
    else cb(new Error("Only image files are allowed for logos (JPG, PNG, WebP, SVG)"));
  },
});

const templateUpload = multer({
  storage: templateStorage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    if (TEMPLATE_MIMETYPES.has(file.mimetype)) cb(null, true);
    else cb(new Error("Only PDF and DOCX files are allowed for templates"));
  },
});

function fileUrl(req: Request, filename: string): string {
  const host = req.get("host") ?? "localhost";
  return `${req.protocol}://${host}/uploads/${filename}`;
}

// ── POST /uploads/logo ────────────────────────────────────────────────────────
router.post(
  "/uploads/logo",
  requireAuth,
  logoUpload.single("file"),
  async (req: Request, res: Response): Promise<void> => {
    const file = req.file;
    if (!file) { res.status(400).json({ error: "No file provided" }); return; }
    res.json({ url: fileUrl(req, file.filename) });
  }
);

// ── POST /uploads/template ───────────────────────────────────────────────────
router.post(
  "/uploads/template",
  requireAuth,
  templateUpload.single("file"),
  async (req: Request, res: Response): Promise<void> => {
    const file = req.file;
    if (!file) { res.status(400).json({ error: "No file provided" }); return; }
    res.json({ url: fileUrl(req, file.filename), filename: file.originalname });
  }
);

export default router;
