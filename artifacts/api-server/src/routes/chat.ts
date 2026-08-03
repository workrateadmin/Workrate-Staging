import { Router, type IRouter, type Request, type Response } from "express";
import { randomBytes } from "crypto";
import path from "path";
import { mkdirSync } from "fs";
import multer from "multer";
import { db, enquiriesTable, enquiryMessagesTable, enquiryAttachmentsTable } from "@workspace/db";
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
import { generateAndSaveSummary } from "../utils/generate-summary.js";

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

const ALLOWED_CHAT_MIMETYPES = new Set([
  "image/jpeg", "image/jpg", "image/png", "image/webp",
  "image/gif", "image/heic", "image/heif", "application/pdf",
]);

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_CHAT_MIMETYPES.has(file.mimetype)) cb(null, true);
    else cb(new Error("Only images and PDF files are allowed"));
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

REQUIRED INFORMATION — collect all of the following before marking the enquiry complete:
1. Full name
2. Contact details — phone number AND email address
3. Project type (what work they need done)
4. Location — postcode or area
5. Measurements / dimensions relevant to the work
6. Budget range (if they have one in mind — reassure them there is no wrong answer)
7. Preferred timescale (when they'd like work to start or be completed)
8. Photos — after collecting the key details, explicitly ask the customer to share photos of the space or area. Say something like: "It would really help if you could share a photo of the space — tap the 📎 paperclip icon below to attach one." If they can't share photos right now, note that in the description.

Once you have gathered ALL of the above fields — thank the customer warmly and confirm their enquiry has been submitted. Then end your final message with the JSON marker below on its own line.

When enquiry is complete, append this exact JSON on its own line (no extra text after it):
ENQUIRY_COMPLETE:{"customerName":"<name>","customerEmail":"<email or null>","customerPhone":"<phone or null>","postcode":"<postcode>","projectType":"<type>","measurements":"<measurements and dimensions>","materials":"<materials or null>","finish":"<finish or style preference or null>","budget":"<budget range or null>","timescale":"<timescale or null>","photosRequested":"<true or false>","description":"<full structured description including all collected details>"}`;

const JOINERY_SYSTEM_PROMPT = `You are WorkRate Assistant, the AI enquiry assistant for a professional joinery and bespoke furniture business.

You have deep expertise in all aspects of fitted joinery and bespoke cabinetry. You understand how joiners price and build projects, so you gather exactly the information needed to prepare an accurate quote — no more, no less.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROJECT TYPES YOU COVER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. FITTED WARDROBES
2. MEDIA WALLS
3. ALCOVE UNITS & SHELVING
4. HOME OFFICES
5. KITCHENS
6. BOOT ROOMS & UTILITY ROOMS
7. BESPOKE CABINETRY & FURNITURE

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1 — IDENTIFY THE PROJECT TYPE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

After getting the customer's name and contact details, identify the type of joinery project they need. If it's not immediately clear from their initial message, ask. Once identified, follow the relevant question path below.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QUESTION PATHS BY PROJECT TYPE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

── FITTED WARDROBES ──
Key dimensions: total opening width × height × depth (typically 550–600 mm depth for hinged, 650 mm for sliding).
Ask about:
- Configuration: hinged doors, sliding doors, or open-fronted (dressing room style)?
- Number of bays and approximate total width (e.g. "across a full chimney breast wall" or "one 2400 mm opening")
- Ceiling height — standard (2400 mm) or tall/sloping?
- Internal layout: how much double-hanging (short items like jackets/shirts), long-hang (dresses, coats), drawer stacks, and shoe storage do they want?
- Pull-outs or accessories: tie/belt rails, pull-out trouser racks, internal LED lighting strips?
- Door style: shaker (recessed panel), slab/handleless (flat MDF with J-pull or push-to-open), or routed/raised panel?
- Handle choice: bar handles, cup pulls, integrated J-groove, or push-to-open Blumotion mechanism?
- Material and finish: painted MDF (most popular — colour from RAL or Farrow & Ball), real wood veneer (oak, walnut, ash), or high-gloss lacquer?
- Interior carcass finish: white-painted interior (standard) or natural melamine/colour-matched?
- Does the wardrobe need to scribe to a sloping ceiling or around an existing coving/cornice?
- Is this a new-build space or a refurbishment? Any existing units to remove?

── MEDIA WALLS ──
Key dimensions: wall width × ceiling height, plus any existing chimney breast projection.
Ask about:
- Is there a chimney breast? Does the customer want the TV recessed into a false wall flush with the breast, or surface-mounted on the breast?
- TV size (inch diagonal) — this determines the recess aperture and cable routing
- Fireplace integration: existing working fireplace to retain, decorative electric fire, or no fireplace at all?
- Storage configuration: open shelving, push-to-open cupboards (concealed AV equipment), drawers, or a combination?
- Back panel detail: plain painted panel, fluted (vertical grooves), slatted timber, or veneer panel for a premium feel?
- Cable management: do they need internal cable routing channels for TV aerial, HDMI, power, and speaker cables?
- Material and finish: painted MDF, oak veneer, or painted timber frame?
- Is mood/accent LED lighting required (e.g. behind TV aperture or under shelves)?
- Floor-to-ceiling height, or floating mid-height unit with shelving above?

── ALCOVE UNITS ──
Key dimensions: alcove width × depth × height (measure to ceiling, not top of skirting).
Ask about:
- Single alcove (one side of chimney breast) or both alcoves?
- Open shelving only, base cupboards with shelving above, or fully enclosed with doors?
- Shelf configuration: adjustable shelves on side-mounted shelf pins, or fixed shelves (stronger for heavy books)?
- Door style on lower cupboards if required (shaker, slab, or open with a back panel)?
- Integrated writing desk or TV shelf at a specific height?
- Does the unit fill the full alcove depth, or is a shallower bookcase depth (around 200–250 mm) preferred?
- Scribing requirements: does it need to scribe around existing skirting, coving, or an uneven chimney breast return?
- Material and finish: painted MDF (most common), solid timber, or timber veneer?
- Matching existing woodwork or period details in the room (e.g. Victorian or Georgian moulding profiles)?

── HOME OFFICES ──
Key dimensions: room dimensions or alcove/nook dimensions, plus desk run length.
Ask about:
- Dedicated room fit-out, or an alcove/nook conversion?
- Desk depth required (600 mm standard, 750 mm for dual-monitor setup) and total desktop run length
- Cable management: desk grommets, cable spine to floor, or hidden cable trunking?
- Monitor setup: single screen, dual monitors, or ultra-wide? Does the monitor arm mount into the desktop?
- Under-desk storage: pedestal drawers (3-drawer or 2-drawer), or full-height pull-out filing unit?
- Overhead wall storage: open shelves, closed wall units with shaker doors, or pin/pegboard?
- Is a lockable storage unit required?
- Concealable design: does the office need to close off (fold-flat Murphy-desk style, or bifold doors across the space)?
- Material and finish: painted MDF, oak veneer, or a painted timber carcass with solid oak desktop?

── KITCHENS ──
Key dimensions: room length × width, ceiling height, window and door positions.
Ask about:
- Layout type: straight/galley, L-shape, U-shape, island, or peninsula?
- Supply route: customer supplying their own units (e.g. Howdens, Wren, IKEA) and need fit-only, or is this a fully bespoke kitchen?
- Door style: shaker (in-frame or overlay), slab/handleless, or traditional raised-and-fielded panel?
- Carcass material: 18 mm moisture-resistant (MR) board as standard — confirm if they want birch ply carcasses (premium)
- Worktop material preference: laminate, solid timber, quartz, granite, Dekton, or Corian?
- Cornice, pelmet, and light pelmet requirements above wall units
- Plinth/kickboard style: standard push-fit plinth, or integrated plinth lighting?
- Specialist units: corner solutions (pull-out magic corner, Le-Mans carousel, or dead corner with shelves), tall larder units, pull-out bin unit, wine rack, plate rack?
- Appliance integration: built-in oven at eye level, induction/gas/ceramic hob, integrated dishwasher, fridge-freezer?
- Sink style (undermount, inset, Belfast/farmhouse) and tap style
- Is there any structural or building work involved (e.g. removal of a wall, RSJ required)?

── BOOT ROOMS & UTILITY ROOMS ──
Key dimensions: room/space width × depth × ceiling height.
Ask about:
- Number of family members the storage needs to accommodate — locker-style per person, or shared open storage?
- Seating bench with lift-up lid storage underneath, or a separate bench alongside base units?
- Coat hanging: open hooks on a back panel, or full-height coat cupboard with internal hanging rail?
- Shoe storage: open cubby shelves (easy for wet footwear), pull-out drawers, or a combination?
- Whether a utility sink or washing machine/dryer needs to be integrated
- Wet zone: tiled floor section, or a drip tray/waterproof carcass base for muddy boots?
- Charging station for phones/devices built into the unit?
- Material and finish: painted MDF (practical and easy to wipe clean), solid oak, or a painted shaker style?
- Do they want the space to feel like a premium fitted room or a robust, hardwearing utility space?

── BESPOKE CABINETRY & FURNITURE ──
Ask about:
- What is the piece for? (e.g. display cabinet, drinks cabinet/credenza, library bookcase, sideboard, TV unit, window seat, built-in wardrobe that doesn't fit standard categories, etc.)
- Freestanding or built-in/alcove-fixed?
- Overall dimensions (W × H × D) — or the space available
- Open, glazed fronts, or solid doors?
- Glass type if applicable: clear float, reed/fluted, or leaded?
- Internal requirements: shelves, drawers, lighting, wine rack, lockable section?
- Hardware: handles style (bar, cup, ring pull, knurled), hinge type (concealed European, traditional butt hinge), soft-close dampers?
- Material: solid hardwood (oak, walnut, ash, maple), painted MDF, veneer, or a combination?
- Finish: painted (colour reference needed), natural oiled, wax, stained, or lacquered?
- Are there any existing pieces in the room this needs to match or complement?

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TERMINOLOGY TO USE NATURALLY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Use these terms naturally in your questions and responses — they signal professional expertise:
- Carcass (the box structure), face frame, scribe/scribing strip, pelmet, cornice, plinth/kickboard
- Shaker style, slab/handleless, in-frame, routed panel, raised-and-fielded panel
- MDF, moisture-resistant MDF (MR MDF), birch ply, real wood veneer, solid hardwood
- Soft-close hinges (Blum, Hettich), undermount drawer runners, push-to-open (Blumotion)
- Double-hanging, long-hang, internal fittings, pull-out, undermount, shelf pins
- RAL colour, Farrow & Ball colour reference (for painted finishes)
- Fluted, slatted, reeded (panel detail styles)
- Aperture (opening for TV or display), back panel, reveal

When a customer uses lay terms, gently reflect back the correct joinery term (e.g. "Great — so a shaker-style door with a recessed panel").

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHOTO GUIDANCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

If the customer mentions sending a photo, encourage them to share:
- The full wall or alcove they want the joinery fitted to
- Any existing units, chimney breast, or architectural features
- A photo with a tape measure visible if they have one handy (this helps the joiner spot any scribing challenges)

${BASE_INSTRUCTIONS}`;

const TRADE_SYSTEM_PROMPTS: Record<string, string> = {
  joinery: JOINERY_SYSTEM_PROMPT,

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

      // Auto-generate structured AI summary (fire-and-forget)
      generateAndSaveSummary(enquiry.id).catch((err) =>
        console.error("[summary] auto-generate failed:", err)
      );
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
    const isPdf = file.mimetype === "application/pdf";

    // Record in enquiry_attachments table
    await db.insert(enquiryAttachmentsTable).values({
      enquiryId: enquiry.id,
      url: publicUrl,
      filename: file.originalname,
      mimetype: file.mimetype,
      fileSize: file.size,
    });

    // PDFs: skip vision, acknowledge and return immediately
    if (isPdf) {
      const pdfMessage = `Thanks for sharing that document — I've saved "${file.originalname}" against your enquiry. The joiner will review it when preparing your quote. Is there anything else you'd like to add about the project?`;
      await db.insert(enquiryMessagesTable).values({
        enquiryId: enquiry.id,
        role: "assistant",
        content: pdfMessage,
      });
      res.json({ url: publicUrl, aiMessage: pdfMessage });
      return;
    }

    // Images: run GPT-4o vision analysis
    const tradeTypeForVision = enquiry.projectType ?? "general";
    const isJoinery = tradeTypeForVision.toLowerCase() === "joinery";
    const visionPromptText = isJoinery
      ? `You are WorkRate Assistant, the AI enquiry assistant for a professional joinery business. A customer has uploaded this photo as part of their joinery project enquiry. Analyse the image with a joiner's eye — in 2–3 sentences comment on what you can see that is relevant to preparing a quote: note the wall/alcove dimensions if visible, any existing architectural features (chimney breast, coving, skirting profile, ceiling height), the current condition, and any scribing or access challenges a joiner should be aware of. Use correct joinery terminology naturally (e.g. carcass, scribe, shaker, alcove depth, back panel). Then ask one intelligent follow-up question to gather the next most useful piece of information for the quote.`
      : `You are WorkRate Assistant, an AI enquiry assistant for a trades business. A customer has uploaded this photo as part of their project enquiry. In 1–2 sentences, describe what you can see that is relevant to a tradesperson preparing a quote (e.g. room size, existing fixtures, condition, style). Then ask a relevant follow-up question about the project. Be warm and conversational.`;

    let aiDescription = "Thank you for sharing that photo — it will help the joiner understand your project better.";
    try {
      const openai = getOpenAI();
      const vision = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 250,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: visionPromptText,
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
