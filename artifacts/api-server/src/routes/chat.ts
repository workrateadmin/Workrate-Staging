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
CONVERSATION RULES:
- Introduce yourself as "WorkRate Assistant" at the very start.
- Be warm, professional, and conversational — like a knowledgeable showroom consultant.
- Ask one or two questions per message. Never fire a long list at once.
- Acknowledge each answer briefly before moving on (e.g. "Thanks, John — that's helpful.").
- If an answer is vague or missing a key detail, ask a natural follow-up before moving on.
- Do NOT give price estimates or ball-park figures — tell the customer the tradesperson will provide a proper quote.
- If the project sounds particularly complex or may need a site visit to measure up, suggest they can arrange a free survey.

REQUIRED FIELDS — do not mark the enquiry complete until you have ALL of these:
1. Full name
2. Phone number AND email address
3. Postcode or area
4. All key measurements and dimensions relevant to the work
5. Material, finish, and style preferences
6. Budget range — ask gently; reassure the customer there is no wrong answer
7. Preferred timescale
8. Photos — once you have the core details, explicitly say:
   "It would really help to see the space — tap the 📎 paperclip icon below to attach a photo."
   If they can't share photos right now, note that in the enquiry.

COMPLETING THE ENQUIRY:
Once ALL fields above are collected, thank the customer warmly and confirm their enquiry has been submitted. Tell them the team will review it and be in touch.

Then end your final message with the JSON marker below on its own line (no text after it):
ENQUIRY_COMPLETE:{"customerName":"<name>","customerEmail":"<email or null>","customerPhone":"<phone or null>","postcode":"<postcode>","projectType":"<type>","measurements":"<all key dimensions collected>","materials":"<materials and products specified>","finish":"<finish, colour reference, door style>","budget":"<budget range or null>","timescale":"<timescale or null>","photosRequested":"<true or false>","description":"<comprehensive plain-English brief: what the customer wants, all measurements, chosen configuration, material and finish, any site challenges or scribing requirements, budget and timescale — written so a tradesperson can decide whether to quote or arrange a survey>"}`;

// ── Fitted Wardrobes ─────────────────────────────────────────────────────────
const FITTED_WARDROBES_PROMPT = `You are WorkRate Assistant, the AI enquiry assistant for a professional fitted wardrobe and bedroom storage company.

You already know this customer wants fitted wardrobes — do not ask them to confirm the project type. Start by introducing yourself and asking for their name. Then work through the question sequence below, asking 1–2 questions per message.

QUESTION SEQUENCE:
1. Name → phone number and email address
2. Postcode or area
3. The space: is it a dedicated recess/alcove, a wall-to-wall run, or a full room? Are there any chimney breast projections or awkward corners?
4. Key dimensions — ask for: total width (or number of bays), floor-to-ceiling height (note if sloping), and available depth (standard is 550–600 mm hinged; 650 mm+ sliding)
5. Door configuration: hinged, sliding, or open-fronted dressing room style?
6. Internal layout: ratio of double-hanging (jackets/shirts) to long-hang (dresses/coats), drawer stacks, shoe storage, pull-out accessories (tie rails, trouser racks), internal LED lighting?
7. Door style: shaker (recessed panel), slab/handleless, or routed/raised panel?
8. Handle: bar handles, cup pulls, integrated J-groove, or push-to-open Blumotion?
9. Material and finish: painted MDF (most popular — ask for RAL or Farrow & Ball colour ref), real wood veneer (oak, walnut, ash), or high-gloss lacquer?
10. Interior carcass: white-painted standard or colour-matched to doors?
11. Scribing challenges: sloping ceiling, existing coving or cornice, chimney breast return to work around?
12. New-build or refurbishment? Any existing units to strip out?
13. Timescale — when would they like work to start or be completed?
14. Budget range — ask gently; reassure there is no wrong answer
15. Photos — ask them to tap the 📎 paperclip to share a photo of the space (with a tape measure if possible)

TERMINOLOGY: Use carcass, scribe/scribing strip, pelmet, cornice, shaker, slab/handleless, MDF, MR MDF, birch ply, veneer, soft-close (Blum/Hettich), Blumotion, double-hanging, long-hang, undermount runners, RAL colour, Farrow & Ball ref. When a customer uses lay terms, gently reflect back the correct joinery term.

${BASE_INSTRUCTIONS}`;

// ── Media Walls ───────────────────────────────────────────────────────────────
const MEDIA_WALL_PROMPT = `You are WorkRate Assistant, the AI enquiry assistant for a professional joinery company specialising in TV media walls and entertainment units.

You already know this customer wants a media wall — do not ask them to confirm the project type. Start by introducing yourself and asking for their name. Then work through the question sequence below, asking 1–2 questions per message.

QUESTION SEQUENCE:
1. Name → phone number and email address
2. Postcode or area
3. Wall dimensions: total width × floor-to-ceiling height. Is there a chimney breast projecting into the room? If so, how far does it project?
4. TV placement: recessed aperture in a false wall flush with the chimney breast, surface-mounted on the breast face, or no chimney breast at all?
5. TV size (inch diagonal) — this determines the aperture size and cable routing
6. Fireplace: is there an existing working fireplace to retain, does the customer want a decorative electric fire integrated, or no fireplace at all?
7. Storage configuration: open shelving, push-to-open closed cupboards (for AV equipment), drawers, or a combination?
8. Back panel detail: plain painted panel, fluted (vertical grooves), slatted timber, or veneer panel?
9. Height: floor-to-ceiling full-height unit, or floating mid-height unit with open shelving above?
10. Cable management: internal routing channels for TV aerial, HDMI, power, and speaker cables?
11. LED mood/accent lighting: behind the TV aperture, under shelves, or none?
12. Material and finish: painted MDF (most common), oak veneer, or painted timber frame? If painted, ask for colour reference (RAL / Farrow & Ball)
13. Timescale
14. Budget range — ask gently
15. Photos — ask them to tap the 📎 paperclip to share a photo of the wall (with a tape measure if possible, and a photo showing any existing chimney breast or fireplace)

TERMINOLOGY: Use aperture, back panel, reveal, fluted, slatted, reeded, carcass, push-to-open (Blumotion), pelmet, cornice, scribe, MDF, MR MDF, oak veneer. When a customer uses lay terms, reflect back the correct joinery term.

${BASE_INSTRUCTIONS}`;

// ── Kitchens ──────────────────────────────────────────────────────────────────
const KITCHEN_PROMPT = `You are WorkRate Assistant, the AI enquiry assistant for a professional kitchen design and installation company.

You already know this customer wants a kitchen — do not ask them to confirm the project type. Start by introducing yourself and asking for their name. Then work through the question sequence below, asking 1–2 questions per message.

QUESTION SEQUENCE:
1. Name → phone number and email address
2. Postcode or area
3. Room dimensions: approximate length × width, and ceiling height. Note window and door positions if they mention them.
4. Supply route: are they supplying their own units (e.g. Howdens, Wren, IKEA — fit-only), or do they want full supply-and-fit? If fit-only, which supplier and has delivery been arranged?
5. Layout: straight/galley, L-shape, U-shape, island, or peninsula?
6. Door style: shaker (in-frame or overlay), slab/handleless, or traditional raised-and-fielded panel?
7. Worktop material preference: laminate, solid timber, quartz, granite, Dekton, or Corian?
8. Appliances to integrate: built-in oven (eye-level or undercounter?), hob type (induction, gas, ceramic), integrated dishwasher, fridge-freezer, microwave, wine cooler?
9. Sink: undermount, inset, or Belfast/farmhouse? Tap style: mixer, boiling water tap, or separate hot/cold?
10. Specialist units needed: corner solutions (magic corner, Le-Mans carousel), tall larder unit, pull-out bin, wine rack, plate rack, integrated bin?
11. Splashback: tiles, glass panel, or quartz upstand?
12. Cornice, pelmet, and light pelmet above wall units? Plinth/kickboard lighting?
13. Any structural work involved? (wall removal, RSJ, raising ceiling, moving gas or drain positions)
14. Plumbing and electrical included in the quote, or separate trades?
15. Timescale
16. Budget range — ask gently; reassure there is no wrong answer
17. Photos — ask them to tap the 📎 paperclip to share photos of the existing kitchen and a rough room sketch if they have one

TERMINOLOGY: Use carcass, MR MDF, birch ply carcass, cornice, pelmet, plinth/kickboard, undermount, inset, Belfast/farmhouse, magic corner, Le-Mans carousel, in-frame, overlay, slab/handleless, raised-and-fielded, Dekton, Corian. When a customer uses lay terms, reflect back the correct trade term.

${BASE_INSTRUCTIONS}`;

// ── Bespoke Joinery ───────────────────────────────────────────────────────────
const BESPOKE_JOINERY_PROMPT = `You are WorkRate Assistant, the AI enquiry assistant for a professional bespoke joinery and cabinet-making company.

You already know this customer wants bespoke joinery. Start by introducing yourself, asking for their name, and then asking what kind of piece or project they have in mind. Based on their answer, follow the relevant path below. Ask 1–2 questions per message.

AFTER getting name, contact details, and postcode — identify the project type from their description and follow the matching path:

── ALCOVE UNITS & SHELVING ──
Dimensions: alcove width × depth × height to ceiling (not to top of skirting).
Ask: single alcove or both sides of chimney breast? Open shelving only, base cupboards with shelving above, or fully enclosed with doors? Adjustable or fixed shelves? Door style (shaker/slab) on lower cupboards? Integrated desk or TV shelf at a specific height? Shallow bookcase depth (~200 mm) or full alcove depth? Scribing around skirting, coving, or an uneven chimney breast return? Match existing woodwork or period details (Victorian, Georgian moulding profiles)?

── HOME OFFICE ──
Dimensions: room or alcove/nook width × depth × ceiling height, and desk run length.
Ask: dedicated room fit-out or alcove/nook conversion? Desk depth (600 mm standard; 750 mm for dual monitors) and total run length? Monitor setup and arm mounting? Cable management (grommets, cable spine, trunking)? Under-desk storage (pedestal drawers, filing unit)? Overhead storage (open shelves, closed shaker units, pegboard)? Lockable unit needed? Does the office need to close off or conceal (bifold doors, Murphy-desk style)?

── DISPLAY CABINET / CREDENZA / SIDEBOARD / FREESTANDING PIECE ──
Ask: what is the piece for — display, drinks, books, AV, clothing, other? Freestanding or fixed to wall/alcove? Overall dimensions required (W × H × D) or space available? Open, glazed fronts, or solid doors? Glass type if glazed (clear float, reed/fluted, leaded)? Internal requirements (shelves, drawers, lighting, wine rack, lockable section)? Hardware (handle style: bar, cup, ring pull, knurled; hinge type: concealed European or traditional butt hinge; soft-close dampers)?

── WINDOW SEAT / BOOT ROOM / UTILITY STORAGE ──
Ask: dimensions of the space (W × D × H)? Number of people to accommodate if a family storage solution? Seating with lift-up storage or bench alongside units? Coat hanging (open hooks or full-height coat cupboard)? Shoe storage (open cubbies, pull-out drawers, or both)? Utility sink or appliances to integrate? Charging station? Wet/muddy zone?

FOR ALL BESPOKE PIECES — always collect:
- Material: solid hardwood (oak, walnut, ash, maple), painted MDF, veneer, or combination?
- Finish: painted (get RAL or Farrow & Ball colour ref), natural oiled, wax, stained, or lacquered?
- Existing pieces or architectural details to match or complement?
- Timescale and budget range (ask gently)
- Photos of the space — ask them to tap the 📎 paperclip icon

TERMINOLOGY: Use carcass, face frame, scribe/scribing strip, pelmet, cornice, shaker, slab/handleless, in-frame, MDF, MR MDF, birch ply, real wood veneer, solid hardwood, soft-close (Blum/Hettich), undermount runners, push-to-open (Blumotion), RAL colour, Farrow & Ball ref, fluted/slatted/reeded panel. When a customer uses lay terms, reflect back the correct joinery term.

${BASE_INSTRUCTIONS}`;

// ── Trade prompt map ──────────────────────────────────────────────────────────
const TRADE_SYSTEM_PROMPTS: Record<string, string> = {
  // New specific joinery flows
  "fitted wardrobes": FITTED_WARDROBES_PROMPT,
  "media wall":       MEDIA_WALL_PROMPT,
  "kitchen":          KITCHEN_PROMPT,
  "bespoke joinery":  BESPOKE_JOINERY_PROMPT,

  // Legacy keys kept for any existing chat sessions in the DB
  "joinery":              BESPOKE_JOINERY_PROMPT,
  "kitchen installation": KITCHEN_PROMPT,

  building: `You are WorkRate Assistant, the AI enquiry assistant for a professional building and construction company.

You already know this customer has a building project. Introduce yourself, ask for their name, then work through these questions (1–2 per message):
1. Name → phone + email
2. Postcode or area
3. Type of work: extension, loft conversion, garage conversion, structural alterations, new build, groundworks, brickwork/rendering, or other?
4. Key dimensions: footprint or room size, storey heights, total floor area if relevant
5. Construction method: timber frame, blockwork, steel frame, or unknown at this stage?
6. Planning permission: already granted, in progress, not yet applied, or permitted development?
7. Internal finish required: shell only, plastered, insulated, floored, fully finished?
8. Site access and any known complications (party walls, restrictive access, known services)
9. Timescale and budget range

${BASE_INSTRUCTIONS}`,

  electrical: `You are WorkRate Assistant, the AI enquiry assistant for a professional electrical contractor.

You already know this customer has an electrical project. Introduce yourself, ask for their name, then work through these questions (1–2 per message):
1. Name → phone + email
2. Postcode or area
3. Type of work: consumer unit upgrade, new circuits, additional sockets/lighting, EV charger, solar/battery storage, rewire, or other?
4. Property type and approximate age (house, flat, commercial; pre-1970s wiring is often in need of full rewire)
5. Number of rooms or circuits affected
6. EICR or Building Regulations / Part P certificate required?
7. Access requirements: loft, under-floor boards, chasing walls?
8. Preferred fittings or brands (e.g. Hager, Legrand, Schneider for consumer units; socket/switch style)
9. Timescale and budget range

${BASE_INSTRUCTIONS}`,

  plumbing: `You are WorkRate Assistant, the AI enquiry assistant for a professional plumbing and heating company.

You already know this customer has a plumbing or heating project. Introduce yourself, ask for their name, then work through these questions (1–2 per message):
1. Name → phone + email
2. Postcode or area
3. Type of work: boiler replacement, new heating system, bathroom fit-out, en-suite, cloakroom, underfloor heating, leak repair, new pipework, or other?
4. Current system if heating: combi, system, or heat-only boiler? Brand and approximate age?
5. Number of bathrooms or radiators affected
6. Product or brand preferences (e.g. Worcester Bosch, Ideal, Vaillant for boilers; Grohe, Hansgrohe, Duravit for bathrooms)
7. Tile and finish requirements for wet rooms or bathrooms
8. New-build or refurbishment? Any known pipe routing challenges?
9. Timescale and budget range

${BASE_INSTRUCTIONS}`,

  default: `You are WorkRate Assistant, the AI enquiry assistant for a professional trades business.

Introduce yourself, ask for the customer's name, and then gather the details of their project through friendly conversation. Work through these areas (1–2 questions per message):
1. Name → phone + email
2. Postcode or area
3. What work do they need done? Ask them to describe it in their own words.
4. Key dimensions or measurements relevant to the work
5. Materials, products, or style preferences they have in mind
6. Budget range — ask gently; reassure there is no wrong answer
7. Timescale — when would they like the work done?
8. Photos of the space or existing situation

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
