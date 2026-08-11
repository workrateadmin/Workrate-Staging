/**
 * Concept Visual routes — Phase 1
 *
 * Chat-side (no auth, uses chatToken for identity):
 *   POST /api/chat/:token/concept-visual/generate
 *   POST /api/chat/:token/concept-visual/:conceptId/feedback
 *
 * Dashboard-side (Clerk auth):
 *   GET  /api/enquiries/:id/concept-visuals
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { db, enquiriesTable, enquiryAttachmentsTable, conceptVisualsTable } from "@workspace/db";
import { eq, and, count } from "drizzle-orm";
import OpenAI from "openai";
import { toFile } from "openai/uploads";
import fs from "node:fs";
import path from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const router: IRouter = Router();

const uploadsDir = path.join(process.cwd(), "uploads");
mkdirSync(uploadsDir, { recursive: true });

function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");
  return new OpenAI({ apiKey });
}

// Joinery sub-types that support concept visual generation
export const SUPPORTED_CONCEPT_TRADE_TYPES = new Set([
  "joinery",
  "fitted wardrobes",
  "freestanding wardrobes",
  "media wall",
  "media units",
  "alcove units",
  "home office",
  "bespoke joinery",
  "kitchen installation",
  "built-in storage",
]);

export function isConceptSupported(tradeType: string | null): boolean {
  if (!tradeType) return false;
  return SUPPORTED_CONCEPT_TRADE_TYPES.has(tradeType.toLowerCase());
}

function buildConceptPrompt(enquiry: {
  projectType: string | null;
  description: string | null;
  location: string | null;
}, revisionNotes?: string): string {
  const lines: string[] = [
    "Interior design concept image for a bespoke joinery project.",
    `Project type: ${enquiry.projectType ?? "joinery"}`,
  ];
  if (enquiry.description) lines.push(`Project brief: ${enquiry.description}`);
  if (enquiry.location)    lines.push(`Location: ${enquiry.location}`);
  lines.push(
    "",
    "Using the uploaded room photo as the base image, show how the proposed joinery would look when professionally installed in this exact space.",
    "Preserve all existing features of the room: walls, ceiling, floor, windows, natural lighting, and proportions.",
    "The joinery should look realistically fitted and naturally integrated — like a professional site photograph after installation.",
    "Photorealistic interior photography style, warm natural lighting.",
  );
  if (revisionNotes?.trim()) {
    lines.push("", `Revision requested by customer: ${revisionNotes.trim()}`);
  }
  return lines.join("\n");
}

const requireAuth = (req: any, res: any, next: any) => {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  next();
};

// ── POST /api/chat/:token/concept-visual/generate ─────────────────────────────
router.post("/chat/:token/concept-visual/generate", async (req: Request, res: Response): Promise<void> => {
  const token = req.params.token as string;
  const { revisionNotes } = req.body as { revisionNotes?: string };

  const [enquiry] = await db
    .select()
    .from(enquiriesTable)
    .where(eq(enquiriesTable.chatToken, token));

  if (!enquiry) {
    res.status(404).json({ error: "Chat session not found" });
    return;
  }

  if (!isConceptSupported(enquiry.projectType)) {
    res.status(400).json({ error: "Concept visuals not available for this project type" });
    return;
  }

  // Enforce max 2 generated concept images per enquiry
  const [{ cnt }] = await db
    .select({ cnt: count() })
    .from(conceptVisualsTable)
    .where(
      and(
        eq(conceptVisualsTable.enquiryId, enquiry.id),
        eq(conceptVisualsTable.status, "generated"),
      )
    );

  if (Number(cnt) >= 2) {
    res.status(400).json({ error: "Maximum 2 concept visuals per enquiry reached", limitReached: true });
    return;
  }

  // Find the most recent suitable image attachment
  const attachments = await db
    .select()
    .from(enquiryAttachmentsTable)
    .where(eq(enquiryAttachmentsTable.enquiryId, enquiry.id))
    .orderBy(enquiryAttachmentsTable.uploadedAt);

  const imageAttachment = attachments
    .reverse()
    .find(
      (a) =>
        a.mimetype.startsWith("image/") &&
        !a.mimetype.includes("heic") &&
        !a.mimetype.includes("heif"),
    );

  if (!imageAttachment) {
    res.status(400).json({ error: "No suitable image attachment found for concept generation" });
    return;
  }

  // Derive local file path from the stored URL
  const photoFilename = path.basename(new URL(imageAttachment.url).pathname);
  const photoPath = path.join(uploadsDir, photoFilename);

  if (!fs.existsSync(photoPath)) {
    res.status(500).json({ error: "Original photo not accessible on this server. Try re-uploading the image.", status: "failed" });
    return;
  }

  // Create a concept_visuals record in 'generating' status
  const promptBrief = buildConceptPrompt(enquiry, revisionNotes);
  const [conceptRecord] = await db
    .insert(conceptVisualsTable)
    .values({
      enquiryId: enquiry.id,
      status: "generating",
      originalPhotoUrl: imageAttachment.url,
      promptBrief,
    })
    .returning();

  // Generate concept image via gpt-image-1
  try {
    const openai = getOpenAI();
    const photoFile = await toFile(
      fs.createReadStream(photoPath),
      photoFilename,
      { type: imageAttachment.mimetype.startsWith("image/") ? imageAttachment.mimetype : "image/jpeg" },
    );

    const response = await openai.images.edit({
      model: "gpt-image-1",
      image: photoFile,
      prompt: promptBrief,
      n: 1,
      size: "1024x1024",
    });

    const b64 = response.data[0]?.b64_json;
    if (!b64) throw new Error("No image data returned from OpenAI");

    // Save the generated image to disk
    const conceptFilename = `concept-${Date.now()}-${randomBytes(6).toString("hex")}.png`;
    const conceptPath = path.join(uploadsDir, conceptFilename);
    writeFileSync(conceptPath, Buffer.from(b64, "base64"));

    const host = req.get("host") ?? "localhost";
    const conceptUrl = `${req.protocol}://${host}/uploads/${conceptFilename}`;

    await db
      .update(conceptVisualsTable)
      .set({
        status: "generated",
        generatedImageUrl: conceptUrl,
        revisionCount: revisionNotes ? 1 : 0,
        generatedAt: new Date(),
      })
      .where(eq(conceptVisualsTable.id, conceptRecord.id));

    res.json({ conceptId: conceptRecord.id, imageUrl: conceptUrl, status: "generated" });
  } catch (err: any) {
    console.error("[concept-visual] generation failed:", err?.message ?? err);
    await db
      .update(conceptVisualsTable)
      .set({ status: "failed" })
      .where(eq(conceptVisualsTable.id, conceptRecord.id));

    res.status(500).json({
      error: "Image generation failed",
      status: "failed",
      conceptId: conceptRecord.id,
    });
  }
});

// ── POST /api/chat/:token/concept-visual/:conceptId/feedback ──────────────────
router.post("/chat/:token/concept-visual/:conceptId/feedback", async (req: Request, res: Response): Promise<void> => {
  const token = req.params.token as string;
  const conceptId = parseInt(req.params.conceptId as string, 10);
  const { feedback, isPreferred, revisionText } = req.body as {
    feedback: "selected" | "skipped" | "revision_requested";
    isPreferred?: boolean;
    revisionText?: string;
  };

  if (!feedback) { res.status(400).json({ error: "feedback is required" }); return; }

  const [enquiry] = await db
    .select()
    .from(enquiriesTable)
    .where(eq(enquiriesTable.chatToken, token));
  if (!enquiry) { res.status(404).json({ error: "Chat session not found" }); return; }

  const [concept] = await db
    .select()
    .from(conceptVisualsTable)
    .where(and(eq(conceptVisualsTable.id, conceptId), eq(conceptVisualsTable.enquiryId, enquiry.id)));
  if (!concept) { res.status(404).json({ error: "Concept visual not found" }); return; }

  const newStatus =
    feedback === "selected" ? "selected" :
    feedback === "skipped"  ? "skipped"  :
    feedback === "revision_requested" ? "revision_requested" :
    concept.status;

  await db
    .update(conceptVisualsTable)
    .set({
      status: newStatus,
      customerFeedback: revisionText ?? concept.customerFeedback,
      isPreferred: isPreferred ?? concept.isPreferred,
    })
    .where(eq(conceptVisualsTable.id, conceptId));

  res.json({ success: true });
});

// ── GET /api/enquiries/:id/concept-visuals (dashboard — Clerk auth) ────────────
router.get("/enquiries/:id/concept-visuals", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { userId } = getAuth(req);
  const enquiryId = parseInt(req.params.id as string, 10);

  const [enquiry] = await db
    .select()
    .from(enquiriesTable)
    .where(and(eq(enquiriesTable.id, enquiryId), eq(enquiriesTable.ownerUserId, userId!)));

  if (!enquiry) { res.status(404).json({ error: "Enquiry not found" }); return; }

  const visuals = await db
    .select()
    .from(conceptVisualsTable)
    .where(eq(conceptVisualsTable.enquiryId, enquiryId))
    .orderBy(conceptVisualsTable.createdAt);

  res.json(visuals);
});

export default router;
