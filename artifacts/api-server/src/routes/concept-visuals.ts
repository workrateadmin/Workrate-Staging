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
import { eq, and, count, isNotNull } from "drizzle-orm";
import OpenAI from "openai";
import { toFile } from "openai/uploads";
import fs from "node:fs";
import path from "node:path";
import { mkdirSync } from "node:fs";
import sharp from "sharp";
import {
  uploadBufferToStorage,
  downloadBufferFromStorage,
  storageServingUrl,
  isStorageUrl,
  parseObjectPath,
} from "../lib/storageUpload";

const router: IRouter = Router();

const uploadsDir = path.join(process.cwd(), "uploads");
mkdirSync(uploadsDir, { recursive: true });

function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");
  return new OpenAI({ apiKey });
}

// Joinery sub-types that support concept visual generation.
// Matching is case-, whitespace-, and hyphen-tolerant via normalizeTradeType().
const SUPPORTED_CONCEPT_TRADE_TYPES_RAW = [
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
  // Under-stair / boot-room variants
  "boot room storage",
  "under stair storage",
  "understairs storage",
];

/** Collapse case, leading/trailing whitespace, runs of spaces, and hyphens. */
function normalizeTradeType(s: string): string {
  return s.toLowerCase().trim().replace(/[\s-]+/g, " ");
}

// Pre-normalised set for O(1) lookup.
const SUPPORTED_CONCEPT_TRADE_TYPES_NORMALIZED = new Set(
  SUPPORTED_CONCEPT_TRADE_TYPES_RAW.map(normalizeTradeType),
);

// Kept for external reference (e.g. UI labels) — original casing preserved.
export const SUPPORTED_CONCEPT_TRADE_TYPES = new Set(SUPPORTED_CONCEPT_TRADE_TYPES_RAW);

export function isConceptSupported(tradeType: string | null): boolean {
  if (!tradeType) return false;
  return SUPPORTED_CONCEPT_TRADE_TYPES_NORMALIZED.has(normalizeTradeType(tradeType));
}

/**
 * Builds the gpt-image-1 edit prompt.
 *
 * Design principles:
 * - Lead with explicit room-preservation rules so the model treats the photo as a locked base.
 * - Then specify precisely what joinery to ADD and how it should be styled.
 * - Close with photorealism requirements so the result looks like a real site photo.
 * - On revisions, append the customer's instruction at the end.
 */
function buildConceptPrompt(
  enquiry: {
    projectType: string | null;
    description: string | null;
    location: string | null;
  },
  revisionNotes?: string,
): string {
  const projectType = enquiry.projectType ?? "bespoke joinery";

  const lines: string[] = [
    "You are editing this room photograph to show how a proposed bespoke joinery installation would look when professionally fitted in this exact space.",
    "",
    "═══ PRESERVE EXACTLY — DO NOT ALTER ═══",
    "The room in the source photo is the fixed, immovable canvas. Preserve every detail:",
    "• Walls — exact colour, texture, paint sheen, wallpaper pattern, and any marks or features",
    "• Windows — exact position, size, frame style, glazing bars, curtains, blinds, and the angle of incoming daylight",
    "• Doors — exact position, size, and style (only replace if the joinery explicitly covers that door)",
    "• Ceiling — exact height, coving, cornicing, ceiling roses, pendant fittings, spot positions, and colour",
    "• Floor — exact flooring material (carpet, hardwood, engineered wood, tile, LVT), colour, grain direction, and grout lines",
    "• Radiators — keep in their exact position, style, and colour",
    "• Electrical — all visible sockets, switches, and faceplates stay in their exact positions and are not obscured",
    "• Room geometry — do NOT alter the perspective, focal length, field of view, vanishing points, or spatial scale of the scene",
    "• Camera viewpoint — identical angle and height to the source photograph; do not tilt, pan, or zoom",
    "• Lighting — preserve the direction, colour temperature, intensity, and cast-shadow patterns of every light source in the photo",
    "• All existing furniture and décor that the joinery does not physically replace",
    "",
    "═══ JOINERY TO ADD ═══",
    `Project type: ${projectType}`,
  ];

  if (enquiry.description) {
    lines.push(
      `Customer specification: ${enquiry.description}`,
      "",
      "Read the specification carefully and reflect:",
      "• Approximate dimensions or size (e.g. full-height, alcove-width, number of units)",
      "• Door style (e.g. shaker, slab/handleless, beaded-inset, panelled, glass-fronted)",
      "• Colour and finish (e.g. painted, matt, gloss, natural oak, walnut veneer)",
      "• Internal layout (e.g. hanging rail, shelving, drawers, pull-outs, TV recess, cable tray)",
      "• Any hardware details mentioned (e.g. bar handles, J-pull, no visible handle)",
    );
  }

  lines.push(
    "",
    "Place the joinery in the most natural structural position for this project type in the room",
    "(e.g. full-width alcove, chimney-breast flanks, full-height feature wall, under-stair void).",
    "If a dimension, colour, or finish is not specified by the customer, use a style that is neutral,",
    "complementary to the room's existing décor, and typical of high-quality UK bespoke joinery.",
    "",
    "═══ PHOTOREALISM REQUIREMENTS ═══",
    "The result must look like a high-quality DSLR interior site photograph taken after installation:",
    "• Correct perspective aligned to the room's own vanishing points — not arbitrary",
    "• Natural cast shadows from the room's existing light sources — no floating or unlit edges",
    "• Material texture on joinery (paint sheen, wood grain, gloss reflections) that is consistent with room lighting",
    "• No sketched lines, dimension arrows, watermarks, overlays, or render-style backgrounds",
    "• Seamlessly integrated — the joinery looks as though it has always been part of the room",
    "Photorealistic. The customer must not be able to distinguish this from an after-photo.",
  );

  if (revisionNotes?.trim()) {
    lines.push(
      "",
      "═══ CUSTOMER REVISION REQUEST ═══",
      "Apply this change to the concept visual:",
      revisionNotes.trim(),
    );
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

  // ── Enforce max 2 generated images per enquiry (server-side, always) ─────────
  // Count ALL records where a real image was produced (regardless of current status —
  // selected, revision_requested, generated all count). Only records that never produced
  // an image (offered, generating, failed) are excluded.
  const [{ cnt }] = await db
    .select({ cnt: count() })
    .from(conceptVisualsTable)
    .where(
      and(
        eq(conceptVisualsTable.enquiryId, enquiry.id),
        isNotNull(conceptVisualsTable.generatedImageUrl),
      )
    );

  if (Number(cnt) >= 2) {
    res.status(400).json({ error: "Maximum 2 concept visuals per enquiry reached", limitReached: true });
    return;
  }

  // Find the most recent suitable image attachment (JPEG/PNG/WEBP — skip HEIC which
  // gpt-image-1 cannot read)
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

  // Download the photo — supports both new GCS storage URLs and legacy local disk URLs.
  let photoBuffer: Buffer;
  try {
    if (isStorageUrl(imageAttachment.url)) {
      // New format: download from GCS
      const objectPath = parseObjectPath(imageAttachment.url);
      photoBuffer = await downloadBufferFromStorage(objectPath);
    } else {
      // Legacy format: read from local disk (may fail if container restarted)
      const photoFilename = path.basename(new URL(imageAttachment.url).pathname);
      const photoPath = path.join(uploadsDir, photoFilename);
      if (!fs.existsSync(photoPath)) {
        res.status(500).json({
          error: "Original photo is no longer accessible. Re-uploading the photo will resolve this.",
          status: "failed",
        });
        return;
      }
      photoBuffer = fs.readFileSync(photoPath);
    }
  } catch (photoErr: any) {
    console.error("[concept-visual] Failed to load photo:", photoErr?.message ?? photoErr);
    res.status(500).json({ error: "Could not load the original photo.", status: "failed" });
    return;
  }

  // Create a concept_visuals record in 'generating' status BEFORE calling OpenAI.
  // This confirms the enquiry is already safely submitted; generation is a bonus step.
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

  // ── Generate concept image via gpt-image-1 ───────────────────────────────────
  // gpt-image-1 images.edit() requires a PNG file (PNG32 / RGBA).
  // Convert in-memory using sharp — pure Node/libvips, no system PATH dependency.
  // This fixes the production "magick: not found" error on autoscale containers.
  const startedAt = Date.now();
  try {
    const openai = getOpenAI();

    // Convert JPEG / WEBP / HEIC / PNG → PNG (RGBA) via sharp.
    // Flatten transparent backgrounds to white so the model sees a solid canvas.
    let pngBuffer: Buffer;
    try {
      pngBuffer = await sharp(photoBuffer)
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .toFormat("png")
        .toBuffer();
      console.log(`[concept-visual] Converted photo to PNG via sharp (${pngBuffer.length} bytes)`);
    } catch (convertErr: any) {
      console.error("[concept-visual] sharp conversion failed, using raw buffer:", convertErr?.message);
      pngBuffer = photoBuffer;
    }

    const photoFile = await toFile(pngBuffer, "room.png", { type: "image/png" });

    // 85 s server timeout — slightly shorter than the client's 90 s so the server
    // can mark the record as failed and return a structured error before the client
    // gives up.
    const timeoutSignal = AbortSignal.timeout(85_000);

    const response = await openai.images.edit(
      {
        model: "gpt-image-1",
        image: photoFile,
        prompt: promptBrief,
        n: 1,
        size: "1024x1024",
      },
      { signal: timeoutSignal },
    );

    const b64 = response.data[0]?.b64_json;
    if (!b64) throw new Error("No image data in OpenAI response");

    const outputBuffer = Buffer.from(b64, "base64");
    const fileSizeKb = Math.round(outputBuffer.length / 1024);
    const elapsedMs = Date.now() - startedAt;

    // Upload the generated PNG to persistent object storage
    const { objectPath: conceptObjectPath } = await uploadBufferToStorage(outputBuffer, "image/png");
    const conceptUrl = storageServingUrl(req, conceptObjectPath);

    console.log(
      `[concept-visual] Generated in ${elapsedMs}ms | size: ${fileSizeKb}KB | enquiry: ${enquiry.id} | record: ${conceptRecord.id} | url: ${conceptObjectPath}`,
    );

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
    const elapsedMs = Date.now() - startedAt;
    const isTimeout = err?.name === "TimeoutError" || err?.name === "AbortError";
    console.error(
      `[concept-visual] Generation failed after ${elapsedMs}ms | enquiry: ${enquiry.id} | ${isTimeout ? "TIMEOUT" : err?.message ?? err}`,
    );
    await db
      .update(conceptVisualsTable)
      .set({ status: "failed" })
      .where(eq(conceptVisualsTable.id, conceptRecord.id));

    res.status(500).json({
      error: isTimeout ? "Image generation timed out" : "Image generation failed",
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
    feedback === "selected"            ? "selected" :
    feedback === "skipped"             ? "skipped"  :
    feedback === "revision_requested"  ? "revision_requested" :
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
