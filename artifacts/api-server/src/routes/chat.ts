import { Router, type IRouter, type Request, type Response } from "express";
import { randomBytes } from "crypto";
import path from "path";
import { mkdirSync } from "fs";
import multer from "multer";
import { db, enquiriesTable, enquiryMessagesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import {
  StartChatBody,
  StartChatResponse,
  SendChatMessageBody,
  SendChatMessageParams,
  GetChatSessionParams,
  GetChatSessionResponse,
} from "@workspace/api-zod";
import OpenAI from "openai";

const router: IRouter = Router();

// ── File uploads ────────────────────────────────────────────────────────────
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

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

// ── OpenAI ──────────────────────────────────────────────────────────────────
function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");
  return new OpenAI({ apiKey });
}

// ── System prompts ──────────────────────────────────────────────────────────
const BASE_INSTRUCTIONS = `
Guidelines:
- Introduce yourself as "WorkRate Assistant" at the start.
- Be warm, professional, and conversational — like a helpful office manager.
- Ask one or two questions per message, never fire a long list all at once.
- Acknowledge each answer briefly before moving on (e.g. "Great, thanks John.").
- If an answer is vague or missing key detail, ask a natural follow-up.
- Do NOT give price estimates — tell the customer the tradesperson will provide a proper quote.
- If the project sounds complex or needs a site inspection, suggest a survey visit.
- Once you have gathered: name, phone, email, postcode, project type, a description with measurements / dimensions, materials and finish preferences, budget range, and preferred timescale — thank the customer warmly and confirm their enquiry has been submitted. Then end your final message with the JSON marker below on its own line.

When enquiry is complete, append this exact JSON on its own line (no extra text after it):
ENQUIRY_COMPLETE:{"customerName":"<name>","customerEmail":"<email or null>","customerPhone":"<phone or null>","postcode":"<postcode>","projectType":"<type>","measurements":"<measurements and dimensions>","materials":"<materials>","finish":"<finish or style preference>","budget":"<budget range or null>","timescale":"<timescale or null>","description":"<full structured description>"}`;

const TRADE_SYSTEM_PROMPTS: Record<string, string> = {
  joinery: `You are WorkRate Assistant, the AI enquiry assistant for a professional joinery business.

You specialise in helping customers describe joinery projects so the business can prepare an accurate quote.

When gathering information, ask trade-specific questions such as:
- Type of joinery work (bespoke furniture, fitted wardrobes, staircases, doors, windows, flooring, skirting, shelving, etc.)
- Room dimensions and the specific measurements needed (e.g. wardrobe width × depth × height, staircase rise and going)
- Wood species or board material preference (oak, pine, MDF, plywood, etc.)
- Finish preference (painted, stained, natural oiled, lacquered, etc.)
- Whether they have existing drawings or a rough sketch
- Whether the space is being refurbished or is a new build

${BASE_INSTRUCTIONS}`,

  building: `You are WorkRate Assistant, the AI enquiry assistant for a professional building and construction company.

You specialise in helping customers describe building projects so the business can prepare an accurate quote.

When gathering information, ask trade-specific questions such as:
- Type of work (extension, loft conversion, garage conversion, structural alterations, groundworks, brickwork, rendering, etc.)
- Room or footprint dimensions and key measurements
- Type of construction (timber frame, blockwork, steel, etc.)
- Whether planning permission has been obtained
- Internal finish requirements (plastered, insulated, floored, etc.)
- Site access and any known complications

${BASE_INSTRUCTIONS}`,

  electrical: `You are WorkRate Assistant, the AI enquiry assistant for a professional electrical contractor.

You specialise in helping customers describe electrical work so the business can prepare an accurate quote.

When gathering information, ask trade-specific questions such as:
- Type of electrical work (consumer unit upgrade, new circuits, sockets / lighting, EV charger, solar / battery, rewire, etc.)
- Property type and age (house, flat, commercial; rough age of existing wiring)
- Number of rooms / circuits affected
- Whether an EICR or Building Regulations certificate is required
- Access requirements (loft, under-floor, etc.)
- Preferred fittings or brands (if any)

${BASE_INSTRUCTIONS}`,

  plumbing: `You are WorkRate Assistant, the AI enquiry assistant for a professional plumbing and heating company.

You specialise in helping customers describe plumbing and heating projects so the business can prepare an accurate quote.

When gathering information, ask trade-specific questions such as:
- Type of work (boiler replacement, radiators, bathroom fit-out, leak repair, new pipework, underfloor heating, etc.)
- Current system (combi, system, or heat-only boiler; brand and rough age)
- Number of bathrooms / radiators affected
- Preferred brands or product specifications (e.g. Ideal, Worcester Bosch, Grohe)
- Tile and finish requirements for bathrooms
- Whether the property is a new build or refurbishment

${BASE_INSTRUCTIONS}`,

  "kitchen installation": `You are WorkRate Assistant, the AI enquiry assistant for a professional kitchen installation company.

You specialise in helping customers describe kitchen projects so the business can prepare an accurate quote.

When gathering information, ask trade-specific questions such as:
- Kitchen dimensions (length × width, ceiling height)
- Whether they are supplying their own units or need supply-and-fit
- Kitchen unit brand or style if known (e.g. IKEA, Howdens, bespoke)
- Worktop material preference (laminate, solid wood, quartz, granite, etc.)
- Sink and tap style
- Appliance integration (built-in oven, hob type, dishwasher, fridge, etc.)
- Splashback material (tiles, glass, etc.)
- Whether plumbing and electrical works are needed as part of the project

${BASE_INSTRUCTIONS}`,

  default: `You are WorkRate Assistant, the AI enquiry assistant for a professional trades business.

You help customers describe their project so the tradesperson can prepare an accurate quote.

Gather the following information through natural conversation:
- Full name
- Phone number
- Email address
- Postcode
- Type of project and detailed description
- Measurements and dimensions relevant to the work
- Materials or products they have in mind
- Preferred finish or style
- Budget range
- Preferred timescale to start or complete the work

${BASE_INSTRUCTIONS}`,
};

function getSystemPrompt(tradeType: string): string {
  const key = tradeType.toLowerCase();
  return TRADE_SYSTEM_PROMPTS[key] ?? TRADE_SYSTEM_PROMPTS["default"];
}

// Helper to derive a public URL for an uploaded file
function fileUrl(req: Request, filename: string): string {
  const host = req.get("host") ?? "localhost";
  const protocol = req.protocol;
  return `${protocol}://${host}/uploads/${filename}`;
}

// ── POST /chat/start ─────────────────────────────────────────────────────────
router.post("/chat/start", async (req, res): Promise<void> => {
  const parsed = StartChatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const token = randomBytes(24).toString("hex");

  const [enquiry] = await db
    .insert(enquiriesTable)
    .values({
      customerName: "Unknown",
      status: "new_enquiry",
      chatToken: token,
      projectType: parsed.data.tradeType,
    })
    .returning();

  const openai = getOpenAI();
  const systemPrompt = getSystemPrompt(parsed.data.tradeType);

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 200,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `A customer has just opened the chat. Send a warm, professional greeting introducing yourself as WorkRate Assistant and ask for their name to get started. Keep it concise — 2–3 sentences.`,
      },
    ],
  });

  const greeting =
    completion.choices[0]?.message?.content ??
    "Hi there! I'm WorkRate Assistant. I'm here to help gather the details of your project so we can prepare an accurate quote for you. Could I start by asking your name?";

  await db.insert(enquiryMessagesTable).values({
    enquiryId: enquiry.id,
    role: "assistant",
    content: greeting,
  });

  res.status(201).json(
    StartChatResponse.parse({
      token,
      enquiryId: enquiry.id,
      tradeType: parsed.data.tradeType,
      createdAt: enquiry.createdAt,
    }),
  );
});

// ── GET /chat/:token ─────────────────────────────────────────────────────────
router.get("/chat/:token", async (req, res): Promise<void> => {
  const params = GetChatSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid token" });
    return;
  }

  const [enquiry] = await db
    .select()
    .from(enquiriesTable)
    .where(eq(enquiriesTable.chatToken, params.data.token));

  if (!enquiry) {
    res.status(404).json({ error: "Chat session not found" });
    return;
  }

  const messages = await db
    .select()
    .from(enquiryMessagesTable)
    .where(eq(enquiryMessagesTable.enquiryId, enquiry.id))
    .orderBy(enquiryMessagesTable.createdAt);

  res.json(
    GetChatSessionResponse.parse({
      token: enquiry.chatToken!,
      enquiryId: enquiry.id,
      tradeType: enquiry.projectType ?? "General",
      createdAt: enquiry.createdAt,
      messages,
    }),
  );
});

// ── POST /chat/:token/message — SSE streaming ────────────────────────────────
router.post("/chat/:token/message", async (req, res): Promise<void> => {
  const params = SendChatMessageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid token" });
    return;
  }

  const body = SendChatMessageBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [enquiry] = await db
    .select()
    .from(enquiriesTable)
    .where(eq(enquiriesTable.chatToken, params.data.token));

  if (!enquiry) {
    res.status(404).json({ error: "Chat session not found" });
    return;
  }

  // Save customer message
  await db.insert(enquiryMessagesTable).values({
    enquiryId: enquiry.id,
    role: "customer",
    content: body.data.content,
  });

  // Load full history
  const history = await db
    .select()
    .from(enquiryMessagesTable)
    .where(eq(enquiryMessagesTable.enquiryId, enquiry.id))
    .orderBy(enquiryMessagesTable.createdAt);

  const tradeType = enquiry.projectType ?? "General";
  const systemPrompt = getSystemPrompt(tradeType);

  const chatMessages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history.map((m) => ({
      role: (m.role === "customer" ? "user" : "assistant") as "user" | "assistant",
      content: m.content,
    })),
  ];

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const openai = getOpenAI();
  const stream = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 600,
    messages: chatMessages,
    stream: true,
  });

  let fullResponse = "";

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      fullResponse += content;
      res.write(`data: ${JSON.stringify({ content })}\n\n`);
    }
  }

  // Strip ENQUIRY_COMPLETE marker before storing
  const displayResponse = fullResponse
    .replace(/\nENQUIRY_COMPLETE:.*$/s, "")
    .trim();

  await db.insert(enquiryMessagesTable).values({
    enquiryId: enquiry.id,
    role: "assistant",
    content: displayResponse,
  });

  // Extract structured data if enquiry is complete
  const completionMatch = fullResponse.match(/ENQUIRY_COMPLETE:(\{.*\})/s);
  if (completionMatch) {
    try {
      const extracted = JSON.parse(completionMatch[1]);
      // Build a structured description from all collected fields
      const parts: string[] = [];
      if (extracted.description) parts.push(extracted.description);
      if (extracted.measurements) parts.push(`Measurements: ${extracted.measurements}`);
      if (extracted.materials) parts.push(`Materials: ${extracted.materials}`);
      if (extracted.finish) parts.push(`Finish: ${extracted.finish}`);

      await db
        .update(enquiriesTable)
        .set({
          customerName: extracted.customerName ?? enquiry.customerName,
          customerEmail: extracted.customerEmail ?? enquiry.customerEmail,
          customerPhone: extracted.customerPhone ?? enquiry.customerPhone,
          projectType: extracted.projectType ?? enquiry.projectType,
          location: extracted.postcode ?? enquiry.location,
          description: parts.join("\n") || enquiry.description,
          budget: extracted.budget ?? enquiry.budget,
          timescale: extracted.timescale ?? enquiry.timescale,
        })
        .where(eq(enquiriesTable.id, enquiry.id));
    } catch {
      // ignore parse errors
    }
  }

  res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  res.end();
});

// ── POST /chat/:token/upload — photo upload with AI vision ───────────────────
router.post(
  "/chat/:token/upload",
  upload.single("photo"),
  async (req: Request, res: Response): Promise<void> => {
    const token = Array.isArray(req.params.token) ? req.params.token[0] : req.params.token;
    if (!token) {
      res.status(400).json({ error: "Missing token" });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "No image file provided" });
      return;
    }

    const [enquiry] = await db
      .select()
      .from(enquiriesTable)
      .where(eq(enquiriesTable.chatToken, token));

    if (!enquiry) {
      res.status(404).json({ error: "Chat session not found" });
      return;
    }

    const publicUrl = fileUrl(req, file.filename);

    // Update attachmentUrls (append)
    const existing = enquiry.attachmentUrls ? JSON.parse(enquiry.attachmentUrls) as string[] : [];
    const updatedUrls = [...existing, publicUrl];
    await db
      .update(enquiriesTable)
      .set({ attachmentUrls: JSON.stringify(updatedUrls) })
      .where(eq(enquiriesTable.id, enquiry.id));

    // Use GPT-4o vision to describe the photo
    let aiDescription = "Thank you for sharing that photo — it will help the tradesperson understand your project.";
    try {
      const openai = getOpenAI();
      const vision = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 200,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `You are WorkRate Assistant, an AI enquiry assistant for a trades business. A customer has uploaded this photo as part of their project enquiry. In 1–2 sentences, describe what you can see that is relevant to a tradesperson preparing a quote (e.g. room size, existing fixtures, condition, style). Then ask a relevant follow-up question about the project. Be warm and conversational.`,
              },
              {
                type: "image_url",
                image_url: { url: publicUrl, detail: "low" },
              },
            ],
          },
        ],
      });
      aiDescription =
        vision.choices[0]?.message?.content ?? aiDescription;
    } catch (err) {
      console.error("Vision analysis failed", err);
    }

    // Save AI response as assistant message
    await db.insert(enquiryMessagesTable).values({
      enquiryId: enquiry.id,
      role: "assistant",
      content: aiDescription,
    });

    res.json({ url: publicUrl, aiMessage: aiDescription });
  },
);

export default router;
