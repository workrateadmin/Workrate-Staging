/**
 * WhatsApp Business Cloud API webhook handler.
 *
 * Routes:
 *   GET  /webhooks/whatsapp  — Meta hub challenge verification
 *   POST /webhooks/whatsapp  — Inbound message processor
 *
 * Security model:
 *   - HMAC-SHA256 signature verified on every POST via x-hub-signature-256
 *   - Duplicate messages skipped via externalMessageId (idempotent)
 *   - Tenant isolation: phone_number_id → integration row → owner_user_id
 *   - No provider credentials logged; rawBody consumed only for signature check
 *
 * Channel architecture:
 *   - Messages stored with channel='whatsapp' in enquiry_messages
 *   - Enquiries use channel='whatsapp' and whatsapp_phone for customer lookup
 *   - Reuses handleEnquiryCompletion and getSystemPrompt from the web widget
 *   - Photos: downloaded from Meta CDN → GCS (same storageUpload pipeline)
 *   - Vision: gpt-4o-mini analyses room photos and adds context to history
 *
 * Future channels (Instagram DM, Facebook Messenger) follow this same pattern:
 * each gets its own channel value and route file, sharing the AI helpers.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { randomBytes } from "node:crypto";
import OpenAI from "openai";
import { db, enquiriesTable, enquiryMessagesTable, enquiryAttachmentsTable, companiesTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import {
  verifyWebhookSignature,
  findBusinessByPhoneNumberId,
  sendTextMessage,
  downloadMedia,
  type WABusiness,
} from "../services/whatsapp";
import { uploadBufferToStorage } from "../lib/storageUpload";
import { handleEnquiryCompletion, getSystemPrompt } from "./chat";
import { reserveMeteredFeature } from "../services/billing/authorization";
import { finalizeUsageReservation, recordUsage, releaseUsageReservation } from "../services/billing/usage";
import { canSendCustomerMessages } from "../lib/runtime-environment";

const router: IRouter = Router();

// ── GET /webhooks/whatsapp — Meta hub verification ────────────────────────────
router.get("/webhooks/whatsapp", (req: Request, res: Response): void => {
  if (!canSendCustomerMessages()) {
    res.status(403).send("WhatsApp is disabled in this environment");
    return;
  }
  const mode      = req.query["hub.mode"]         as string | undefined;
  const token     = req.query["hub.verify_token"] as string | undefined;
  const challenge = req.query["hub.challenge"]    as string | undefined;

  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (!verifyToken) {
    console.error("[wa-webhook] WHATSAPP_WEBHOOK_VERIFY_TOKEN not set");
    res.status(500).send("Server configuration error");
    return;
  }

  if (mode === "subscribe" && token === verifyToken) {
    console.log("[wa-webhook] Hub verification successful");
    res.status(200).send(challenge ?? "");
  } else {
    console.warn("[wa-webhook] Hub verification failed — wrong mode or token");
    res.status(403).send("Forbidden");
  }
});

// ── POST /webhooks/whatsapp — inbound messages ────────────────────────────────
router.post("/webhooks/whatsapp", async (req: Request, res: Response): Promise<void> => {
  if (!canSendCustomerMessages()) {
    res.status(403).json({ error: "WhatsApp is disabled in this environment" });
    return;
  }
  // ── Signature verification ────────────────────────────────────────────────
  const appSecret       = process.env.WHATSAPP_APP_SECRET;
  const sigHeader       = req.headers["x-hub-signature-256"] as string | undefined;
  const rawBody         = (req as any).rawBody as Buffer | undefined;

  if (!appSecret || !sigHeader || !rawBody) {
    console.warn("[wa-webhook] Missing webhook authentication configuration or signature — rejecting");
    res.status(403).json({ error: "Missing webhook authentication" });
    return;
  }
  if (!verifyWebhookSignature(appSecret, rawBody, sigHeader)) {
    console.warn("[wa-webhook] Invalid signature — rejecting");
    res.status(403).json({ error: "Invalid signature" });
    return;
  }

  // Respond 200 immediately — Meta requires a fast acknowledgement and will
  // retry delivery on non-200 responses.
  res.status(200).json({ received: true });

  // Process asynchronously after the response is flushed
  processPayload(req.body).catch((err) =>
    console.error("[wa-webhook] Unhandled error:", err?.message ?? err),
  );
});

// ── Payload router ────────────────────────────────────────────────────────────

async function processPayload(body: any): Promise<void> {
  if (body?.object !== "whatsapp_business_account") return;

  for (const entry of (body?.entry ?? [])) {
    for (const change of (entry?.changes ?? [])) {
      if (change?.field !== "messages") continue;
      const value = change?.value;
      if (!value) continue;

      const phoneNumberId = value?.metadata?.phone_number_id as string | undefined;
      if (!phoneNumberId) continue;

      const business = await findBusinessByPhoneNumberId(phoneNumberId);
      if (!business) {
        console.log(`[wa-webhook] No connected integration for phone_number_id=${phoneNumberId}`);
        continue;
      }

      for (const msg of (value?.messages ?? [])) {
        await processMessage(msg, business).catch((err) =>
          console.error(`[wa-webhook] Message ${msg?.id} failed:`, err?.message ?? err),
        );
      }
    }
  }
}

// ── Message processor ─────────────────────────────────────────────────────────

async function processMessage(msg: any, business: WABusiness): Promise<void> {
  const externalMessageId = msg.id as string;
  const customerPhone     = msg.from as string; // E.164 without '+'
  const msgType           = msg.type as string;

  // ── Idempotency ───────────────────────────────────────────────────────────
  const [dup] = await db
    .select({ id: enquiryMessagesTable.id })
    .from(enquiryMessagesTable)
    .where(eq(enquiryMessagesTable.externalMessageId, externalMessageId))
    .limit(1);

  if (dup) {
    console.log(`[wa-webhook] Duplicate message ${externalMessageId} — skipping`);
    return;
  }

  // ── Extract content ───────────────────────────────────────────────────────
  let messageText        = "";
  let mediaId: string | undefined;
  let mediaContentType: string | undefined;

  switch (msgType) {
    case "text":
      messageText = msg.text?.body ?? "";
      break;
    case "image":
      mediaId          = msg.image?.id;
      mediaContentType = msg.image?.mime_type ?? "image/jpeg";
      messageText      = msg.image?.caption ?? "";
      break;
    case "document":
      mediaId          = msg.document?.id;
      mediaContentType = msg.document?.mime_type ?? "application/octet-stream";
      messageText      = msg.document?.caption ?? `[Document: ${msg.document?.filename ?? "file"}]`;
      break;
    case "audio":
      mediaId          = msg.audio?.id;
      mediaContentType = msg.audio?.mime_type ?? "audio/ogg";
      messageText      = "[Voice message]";
      break;
    case "video":
      mediaId          = msg.video?.id;
      mediaContentType = msg.video?.mime_type ?? "video/mp4";
      messageText      = msg.video?.caption ?? "[Video]";
      break;
    case "sticker":
    case "reaction":
    case "unsupported":
      return; // Silently ignore
    default:
      console.log(`[wa-webhook] Unsupported message type: ${msgType}`);
      return;
  }

  // ── Company + trade type ──────────────────────────────────────────────────
  const [company] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.ownerUserId, business.ownerUserId))
    .limit(1);

  const tradeType = company?.tradeType ?? "joinery";

  // ── Find or create enquiry ────────────────────────────────────────────────
  let enquiry = await findActiveWhatsAppEnquiry(customerPhone, business.ownerUserId);
  if (!enquiry) {
    const [created] = await db
      .insert(enquiriesTable)
      .values({
        ownerUserId:  business.ownerUserId,
        customerName: "WhatsApp Enquiry",
        customerPhone: `+${customerPhone}`,
        projectType:  tradeType,
        channel:      "whatsapp",
        whatsappPhone: customerPhone,
        chatToken:    randomBytes(24).toString("hex"),
        status:       "new_enquiry",
      })
      .returning();
    enquiry = created;
    console.log(`[wa-webhook] Created enquiry ${enquiry.id} for +${customerPhone}`);
  }
  const reservationKey = `social_ai:whatsapp:${externalMessageId}`;
  // Vision is an OpenAI request too. Reserve the one inbound-message unit
  // before it runs, then the text response shares this same reservation.
  const socialReservation = business.settings.aiEnabled !== false && !enquiry.description
    ? await reserveMeteredFeature(business.ownerUserId, "social_ai_meta", reservationKey)
    : null;
  // Provider retries must stop before media download or OpenAI vision. The
  // first claimant owns all AI work and the outbound response for this message.
  if (socialReservation && "duplicate" in socialReservation && socialReservation.duplicate) return;

  // ── Handle media attachment ───────────────────────────────────────────────
  let visionContext = "";
  if (mediaId) {
    visionContext = await handleMedia(
      mediaId,
      mediaContentType ?? "application/octet-stream",
      msgType,
      enquiry.id,
      business, Boolean(socialReservation?.allowed),
    );
  }

  // ── Store customer message ────────────────────────────────────────────────
  const displayText = visionContext
    ? `${messageText ? messageText + " " : ""}[Photo: ${visionContext}]`.trim()
    : (messageText || `[${msgType}]`);

  await db.insert(enquiryMessagesTable).values({
    enquiryId:         enquiry.id,
    role:              "customer",
    content:           displayText,
    channel:           "whatsapp",
    externalMessageId,
  });

  // ── Guard: AI disabled ────────────────────────────────────────────────────
  if (business.settings.aiEnabled === false) {
    console.log(`[wa-webhook] AI disabled for business ${business.ownerUserId}`);
    return;
  }

  // ── Guard: conversation already completed ─────────────────────────────────
  // handleEnquiryCompletion sets description; use this to detect a finished conversation.
  if (enquiry.description) {
    const ackMsg =
      `Thanks for your message! Your enquiry has already been received and ` +
      `${company?.name ?? "the team"} will be in touch shortly.`;
    await db.insert(enquiryMessagesTable).values({
      enquiryId: enquiry.id,
      role:      "assistant",
      content:   ackMsg,
      channel:   "whatsapp",
    });
    await sendTextMessage(business.config, customerPhone, ackMsg).catch((err) =>
      console.error("[wa-webhook] Ack send failed:", err?.message),
    );
    return;
  }

  // ── AI response pipeline ──────────────────────────────────────────────────
  // Tenant mapping and the customer message insert above happen before this
  // check. No AI/provider request is made unless the mapped tenant is entitled
  // and has allowance remaining.
  const access = socialReservation ?? await reserveMeteredFeature(business.ownerUserId, "social_ai_meta", reservationKey);
  if (!access.allowed) {
    console.warn(`[wa-webhook] Social AI unavailable for business ${business.ownerUserId}: ${access.error}`);
    return;
  }
  // A provider retry for the same inbound message must acknowledge/no-op rather
  // than invoke OpenAI or send another outbound reply. The reservation claim is
  // serialized and deduped in PostgreSQL.
  if ("duplicate" in access && access.duplicate) return;
  const [meterCompany] = await db.select({ id: companiesTable.id }).from(companiesTable)
    .where(eq(companiesTable.ownerUserId, business.ownerUserId)).limit(1);
  await runAIResponse(enquiry, customerPhone, business, tradeType, company, externalMessageId, meterCompany?.id ?? null, reservationKey);
}

// ── Media handling ────────────────────────────────────────────────────────────

async function handleMedia(
  mediaId: string,
  contentType: string,
  msgType: string,
  enquiryId: number,
  business: WABusiness,
  allowVision: boolean,
): Promise<string> {
  let visionContext = "";
  try {
    const { buffer, contentType: actual } = await downloadMedia(business.config, mediaId);
    const mimeType = actual || contentType;
    const ext      = mimeType.split("/")[1]?.replace("jpeg", "jpg") ?? "bin";

    const { objectPath } = await uploadBufferToStorage(buffer, mimeType);
    const url = buildStorageUrl(objectPath);

    await db.insert(enquiryAttachmentsTable).values({
      enquiryId,
      url,
      filename: `wa-${mediaId}.${ext}`,
      mimetype: mimeType,
      fileSize: buffer.length,
    });

    console.log(`[wa-webhook] Media stored: ${objectPath} (${buffer.length} B)`);

    // Vision analysis for images — enriches the conversation context
    if (allowVision && msgType === "image" && mimeType.startsWith("image/")) {
      visionContext = await analyseImage(buffer, mimeType);
    }
  } catch (err: any) {
    console.error(`[wa-webhook] Media handling failed for ${mediaId}:`, err?.message ?? err);
  }
  return visionContext;
}

// ── Vision analysis ───────────────────────────────────────────────────────────

async function analyseImage(buffer: Buffer, mimeType: string): Promise<string> {
  try {
    const openai  = getOpenAI();
    const dataUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;
    const resp    = await openai.chat.completions.create({
      model:      "gpt-4o-mini",
      max_tokens: 150,
      messages: [{
        role: "user",
        content: [
          {
            type: "text",
            text: "Describe this room or space in 2-3 sentences for a tradesperson reviewing a bespoke joinery enquiry. Note visible dimensions, wall/floor/ceiling finishes, existing furniture, and any relevant structural features.",
          },
          { type: "image_url", image_url: { url: dataUrl, detail: "low" } },
        ],
      }],
    });
    return resp.choices[0]?.message?.content?.trim() ?? "";
  } catch (err: any) {
    console.error("[wa-webhook] Vision analysis failed:", err?.message);
    return "";
  }
}

// ── AI conversation pipeline ──────────────────────────────────────────────────

const COMPLETION_MARKER = "ENQUIRY_COMPLETE:";

async function runAIResponse(
  enquiry:       typeof enquiriesTable.$inferSelect,
  customerPhone: string,
  business:      WABusiness,
  tradeType:     string,
  company:       typeof companiesTable.$inferSelect | undefined,
  providerMessageId: string,
  companyId: number | null,
  reservationKey: string,
): Promise<void> {
  try {
    const openai       = getOpenAI();
    const systemPrompt = getSystemPrompt(tradeType);

    // Load full conversation history
    const history = await db
      .select({ role: enquiryMessagesTable.role, content: enquiryMessagesTable.content })
      .from(enquiryMessagesTable)
      .where(eq(enquiryMessagesTable.enquiryId, enquiry.id))
      .orderBy(asc(enquiryMessagesTable.createdAt));

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...history.map((m) => ({
        role:    m.role === "customer" ? "user" as const : "assistant" as const,
        content: m.content,
      })),
    ];

    // Non-streaming call for WhatsApp (no SSE client to stream to)
    const completion = await openai.chat.completions.create({
      model:      "gpt-4o-mini",
      messages,
      max_tokens: 500,
    });

    const fullText = completion.choices[0]?.message?.content
      ?? "Sorry, I had a problem — please try again or call us directly.";

    // ── Parse ENQUIRY_COMPLETE marker (same pattern as web widget) ──────────
    let cleanReply                          = fullText;
    let extracted: Record<string, any> | null = null;
    const markerIdx                         = fullText.indexOf(COMPLETION_MARKER);

    if (markerIdx !== -1) {
      cleanReply = fullText.slice(0, markerIdx).trim();
      try {
        const jsonStr = fullText.slice(markerIdx + COMPLETION_MARKER.length).split("\n")[0].trim();
        extracted = JSON.parse(jsonStr);
      } catch {
        /* ignore bad JSON */
      }
    }

    if (!cleanReply.trim()) {
      cleanReply =
        `Thank you — your enquiry has been received and ` +
        `${company?.name ?? "the team"} will be in touch shortly.`;
    }

    // ── Persist assistant response ──────────────────────────────────────────
    await db.insert(enquiryMessagesTable).values({
      enquiryId: enquiry.id,
      role:      "assistant",
      content:   cleanReply,
      channel:   "whatsapp",
    });

    // ── Send WhatsApp reply ─────────────────────────────────────────────────
    await sendTextMessage(business.config, customerPhone, cleanReply);
    // An inbound human message is never metered. One successful OpenAI-assisted
    // WhatsApp response is, and webhook retries share the provider message id.
    if (companyId) await recordUsage({
      companyId,
      ownerUserId: business.ownerUserId,
      featureCode: "social_ai_meta",
      usageCategory: "ai_assisted_messages", quantity: 1, unit: "messages",
      source: "openai", providerReference: providerMessageId,
      dedupeKey: `social_ai:whatsapp:${providerMessageId}`,
      metadata: { provider: "openai", channel: "whatsapp", providerMessageId },
    });
    if (companyId) await finalizeUsageReservation(companyId, business.ownerUserId, reservationKey);

    // ── Handle enquiry completion ───────────────────────────────────────────
    if (extracted) {
      console.log(`[wa-webhook] Enquiry ${enquiry.id} completed via WhatsApp`);
      await handleEnquiryCompletion(enquiry, extracted);
    }
  } catch (err: any) {
    console.error(`[wa-webhook] AI pipeline failed for enquiry ${enquiry.id}:`, err?.message ?? err);
    if (companyId) await releaseUsageReservation(companyId, business.ownerUserId, reservationKey);
    // Best-effort fallback so the customer isn't left waiting
    try {
      await sendTextMessage(
        business.config,
        customerPhone,
        "Sorry, I had a technical issue. Please try again or call us directly.",
      );
    } catch { /* ignore */ }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");
  return new OpenAI({ apiKey });
}

async function findActiveWhatsAppEnquiry(
  whatsappPhone: string,
  ownerUserId:   string,
) {
  const [enquiry] = await db
    .select()
    .from(enquiriesTable)
    .where(
      and(
        eq(enquiriesTable.channel,       "whatsapp"),
        eq(enquiriesTable.whatsappPhone, whatsappPhone),
        eq(enquiriesTable.ownerUserId,   ownerUserId),
      ),
    )
    .orderBy(asc(enquiriesTable.createdAt))
    .limit(1);

  return enquiry ?? null;
}

/**
 * Build a full HTTPS URL for a GCS object path.
 * Meta webhooks always hit the production server, so we use the production base.
 */
function buildStorageUrl(objectPath: string): string {
  const base =
    process.env.NODE_ENV === "production"
      ? "https://work-rate-manager.replit.app"
      : `http://localhost:${process.env.PORT ?? "8080"}`;
  return `${base}/api/storage${objectPath}`;
}

export default router;
