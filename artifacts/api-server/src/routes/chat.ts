import { Router, type IRouter, type Request, type Response } from "express";
import { randomBytes } from "crypto";
import path from "path";
import fs, { mkdirSync } from "fs";
import sharp from "sharp";
import multer from "multer";
import { uploadBufferToStorage, storageServingUrl } from "../lib/storageUpload";
import { db, enquiriesTable, enquiryMessagesTable, enquiryAttachmentsTable, companiesTable } from "@workspace/db";
import { sendEnquiryConfirmation } from "../services/customer-comms";
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

// ── Joinery (all sub-types) ───────────────────────────────────────────────────
const JOINERY_SYSTEM_PROMPT = `You are WorkRate Assistant, the AI enquiry assistant for a professional joinery company.

You cover fitted wardrobes, media walls, kitchens, and all other bespoke joinery. Start by introducing yourself and asking for the customer's name. Once you have their name, contact details, and postcode, ask what kind of joinery project they have in mind. Then follow the matching question path below — do not jump to a path until the customer has described their project.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PATH A — FITTED WARDROBES
(customer mentions wardrobes, bedroom storage, built-in cupboards, walk-in)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Collect in order (1–2 questions per message):
1. The space: dedicated recess/alcove, wall-to-wall run, or full walk-in room? Any chimney breast projections or sloping ceiling?
2. Key dimensions: total width (or number of bays), floor-to-ceiling height, available depth (standard 550–600 mm hinged; 650 mm+ sliding)
3. Door configuration: hinged, sliding, or open-fronted dressing room?
4. Internal layout: ratio of double-hanging (jackets/shirts) to long-hang (dresses/coats); drawer stacks; shoe storage; pull-outs (tie rails, trouser racks); internal LED lighting?
5. Door style: shaker (recessed panel), slab/handleless, or routed/raised panel?
6. Handle: bar, cup pull, integrated J-groove, or push-to-open Blumotion?
7. Material & finish: painted MDF (ask for RAL or Farrow & Ball colour ref), real wood veneer (oak/walnut/ash), or high-gloss lacquer?
8. Interior carcass: white-painted standard or colour-matched to doors?
9. Scribing: sloping ceiling, existing coving or cornice, chimney breast return?
10. New-build or refurb? Existing units to strip out?

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PATH B — MEDIA WALLS
(customer mentions media wall, TV wall, feature wall, fireplace wall, entertainment unit)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Collect in order (1–2 questions per message):
1. Wall dimensions: total width × floor-to-ceiling height. Is there a chimney breast? How far does it project into the room?
2. TV placement: recessed aperture in a false wall flush with the breast, surface-mounted on the breast face, or no chimney breast at all?
3. TV size (inch diagonal) — determines aperture and cable routing
4. Fireplace: existing working fireplace to retain, decorative electric fire to integrate, or none?
5. Storage: open shelving, push-to-open cupboards (AV equipment), drawers, or a combination?
6. Back panel detail: plain painted, fluted (vertical grooves), slatted timber, or veneer?
7. Height: floor-to-ceiling full-height, or floating mid-height unit with open shelving above?
8. Cable management: internal routing channels for aerial, HDMI, power, speakers?
9. LED mood/accent lighting: behind TV aperture, under shelves, or none?
10. Material & finish: painted MDF, oak veneer, or timber frame? Colour reference if painted.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PATH C — KITCHENS
(customer mentions kitchen, kitchen units, worktops, kitchen refit/renovation)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Collect in order (1–2 questions per message):
1. Room dimensions: length × width, ceiling height. Any windows or doors that affect unit runs?
2. Supply route: customer supplying own units (Howdens, Wren, IKEA — fit-only), or full supply-and-fit? If fit-only, which supplier and has delivery been arranged?
3. Layout: straight/galley, L-shape, U-shape, island, or peninsula?
4. Door style: shaker (in-frame or overlay), slab/handleless, or raised-and-fielded panel?
5. Worktop: laminate, solid timber, quartz, granite, Dekton, or Corian?
6. Appliances: built-in oven (eye-level or undercounter?), hob type (induction/gas/ceramic), dishwasher, fridge-freezer, microwave, wine cooler?
7. Sink: undermount, inset, or Belfast/farmhouse? Tap: mixer, boiling water, or separate hot/cold?
8. Specialist units: corner solution (magic corner/Le-Mans), larder unit, pull-out bin, wine rack, plate rack?
9. Splashback: tiles, glass panel, or quartz upstand? Cornice and pelmet above wall units? Plinth lighting?
10. Any structural work? (wall removal, RSJ, moving gas or drain positions) Plumbing and electrical included or separate trades?

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PATH D — BESPOKE JOINERY
(alcove units, home offices, boot rooms, window seats, freestanding cabinetry, any other joinery)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
First confirm the piece type (alcove units / home office / boot room / freestanding cabinet / other), then ask:

ALCOVE UNITS: alcove W × D × H to ceiling; single or both alcoves; open shelving / base cupboards + shelving / fully enclosed; adjustable or fixed shelves; door style (shaker/slab) on lower cupboards; integrated desk or TV shelf at a set height; full depth or shallow bookcase depth (~200 mm); scribing around skirting, coving, uneven chimney return; match existing period details?

HOME OFFICE: room or nook W × D × H, desk run length; desk depth (600 mm standard; 750 mm dual monitors); cable management (grommets, spine, trunking); monitor arm mounting; under-desk storage (pedestal/filing); overhead storage (open shelves / closed units / pegboard); lockable unit; needs to close off (bifold doors / Murphy-desk style)?

FREESTANDING PIECE (cabinet, sideboard, credenza, bookcase, etc.): purpose; freestanding or wall/alcove-fixed; overall W × H × D or space available; open / glazed / solid doors; glass type if glazed (clear, reed/fluted, leaded); internal requirements (shelves, drawers, lighting, wine rack, lockable); hardware (handle style, hinge type, soft-close dampers).

WINDOW SEAT / BOOT ROOM / UTILITY: space W × D × H; seating with lift-up storage or bench alongside units; coat hanging (hooks or full-height cupboard); shoe storage (cubbies / pull-outs); utility sink or appliances; wet/muddy zone; charging station; how many family members to accommodate.

FOR ALL BESPOKE PATHS — always collect: material preference (solid hardwood, painted MDF, veneer, or combination); finish (painted — get colour ref; natural oiled, wax, stained, or lacquered); anything existing to match or complement.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TERMINOLOGY — use naturally throughout
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Carcass, face frame, scribe/scribing strip, pelmet, cornice, plinth/kickboard, aperture, reveal, back panel.
Shaker, slab/handleless, in-frame, routed panel, raised-and-fielded.
MDF, MR MDF, birch ply, real wood veneer, solid hardwood (oak, walnut, ash).
Soft-close (Blum, Hettich), undermount runners, push-to-open Blumotion.
Double-hanging, long-hang, pull-out, shelf pins, undermount.
RAL colour, Farrow & Ball reference. Fluted, slatted, reeded.
When a customer uses a lay term, gently reflect back the correct joinery term.

${BASE_INSTRUCTIONS}`;

// ── Trade prompt map ──────────────────────────────────────────────────────────
const TRADE_SYSTEM_PROMPTS: Record<string, string> = {
  "joinery":              JOINERY_SYSTEM_PROMPT,
  // Legacy keys
  "fitted wardrobes":     JOINERY_SYSTEM_PROMPT,
  "media wall":           JOINERY_SYSTEM_PROMPT,
  "kitchen":              JOINERY_SYSTEM_PROMPT,
  "bespoke joinery":      JOINERY_SYSTEM_PROMPT,
  "kitchen installation": JOINERY_SYSTEM_PROMPT,

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

// ── Shared enquiry completion helper ─────────────────────────────────────────
// Called from both the normal AI flow and the TEST SHORTCUT below.
// Handles: DB update, AI summary (fire-and-forget), confirmation email (fire-and-forget).
async function handleEnquiryCompletion(
  enquiry: {
    id: number;
    ownerUserId: string | null;
    customerName: string;
    customerEmail: string | null;
    customerPhone: string | null;
    projectType: string | null;
    location: string | null;
    description: string | null;
    budget: string | null;
    timescale: string | null;
  },
  extracted: {
    customerName?: string | null;
    customerEmail?: string | null;
    customerPhone?: string | null;
    postcode?: string | null;
    projectType?: string | null;
    measurements?: string | null;
    materials?: string | null;
    finish?: string | null;
    budget?: string | null;
    timescale?: string | null;
    description?: string | null;
  },
  isTest = false,
): Promise<void> {
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
      isTest,
    })
    .where(eq(enquiriesTable.id, enquiry.id));

  // Auto-generate structured AI summary (fire-and-forget)
  generateAndSaveSummary(enquiry.id).catch((err) =>
    console.error("[summary] auto-generate failed:", err)
  );

  // Send enquiry confirmation to customer (fire-and-forget — never fails the request)
  const resolvedEmail = extracted.customerEmail ?? enquiry.customerEmail;
  const resolvedPhone = extracted.customerPhone ?? enquiry.customerPhone;
  if (resolvedEmail || resolvedPhone) {
    const businessId = enquiry.ownerUserId;
    Promise.resolve().then(async () => {
      try {
        let company: any = null;
        if (businessId) {
          [company] = await db
            .select()
            .from(companiesTable)
            .where(eq(companiesTable.ownerUserId, businessId))
            .limit(1);
        }
        if (!company) {
          const { isNull } = await import("drizzle-orm");
          [company] = await db
            .select()
            .from(companiesTable)
            .where(isNull(companiesTable.ownerUserId))
            .limit(1);
        }
        if (company) {
          await sendEnquiryConfirmation(
            enquiry.id,
            {
              customerName: extracted.customerName ?? enquiry.customerName,
              customerEmail: resolvedEmail ?? null,
              customerPhone: resolvedPhone ?? null,
              projectType: extracted.projectType ?? enquiry.projectType ?? null,
            },
            company
          );
        }
      } catch (err) {
        console.error("[comms] enquiry confirmation failed:", err);
      }
    });
  }
}

// ── POST /chat/start ─────────────────────────────────────────────────────────
router.post("/chat/start", async (req, res): Promise<void> => {
  const parsed = StartChatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const token = randomBytes(24).toString("hex");

  // Resolve businessId: try widgetToken → company → ownerUserId first.
  // Falls back to treating businessId as a literal Clerk userId for backward
  // compatibility with any widget installs that still use the old user?.id value.
  const rawBusinessId = parsed.data.businessId ?? null;
  let ownerUserId: string | null = rawBusinessId;
  if (rawBusinessId) {
    const [company] = await db
      .select({ ownerUserId: companiesTable.ownerUserId })
      .from(companiesTable)
      .where(eq(companiesTable.widgetToken, rawBusinessId))
      .limit(1);
    if (company?.ownerUserId) {
      ownerUserId = company.ownerUserId;
    }
  }

  const [enquiry] = await db
    .insert(enquiriesTable)
    .values({
      customerName: "Unknown",
      status: "new_enquiry",
      chatToken: token,
      projectType: parsed.data.tradeType,
      ownerUserId,
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

  // ── TEST SHORTCUT ──────────────────────────────────────────────────────────
  // Trigger: type the exact phrase "WorkRateAppTesting" into the live widget.
  // Bypasses the AI Q&A and submits a complete test enquiry through the real
  // production pipeline (DB save, AI summary, confirmation email, dashboard).
  // Exact-match only — never exposed in the chat UI or docs.
  if (body.data.content.trim() === "WorkRateAppTesting") {
    const testExtracted = {
      customerName: "[TEST] WorkRate Test",
      customerEmail: "orhuntley@gmail.com",
      customerPhone: "07000000000",
      postcode: "Test Address, London",
      projectType: "Fitted Wardrobes",
      measurements: "3 metres wide, full-height to ceiling",
      materials: "MDF carcass",
      finish: "Painted finish",
      budget: "£5,000–£7,500",
      timescale: "Within 4–6 weeks",
      description:
        "[TEST ENQUIRY — AUTO-GENERATED] Full-height fitted wardrobes, 3 metres wide, " +
        "painted finish, MDF carcass. Location: Test Address, London. " +
        "Budget: £5,000–£7,500. Timescale: Within 4–6 weeks.",
    };

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const ackMessage =
      "⚡ Test mode activated. Submitting a complete test enquiry through the live production pipeline…";
    res.write(`data: ${JSON.stringify({ content: ackMessage })}\n\n`);

    await db.insert(enquiryMessagesTable).values({
      enquiryId: enquiry.id,
      role: "assistant",
      content: ackMessage,
    });

    await handleEnquiryCompletion(enquiry, testExtracted, true);

    res.write(`data: ${JSON.stringify({ completed: true })}\n\n`);
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
    return;
  }

  // ── VISUAL TEST SHORTCUT ────────────────────────────────────────────────────
  // Trigger: type the exact phrase "WorkRateVisualTesting" into the live widget.
  // Pre-fills a complete fitted-wardrobes enquiry, marks it as a test, then waits
  // for a real photo upload — which uses the full production storage pipeline.
  // After upload the enquiry auto-completes and the concept visual is offered.
  // Never advertised to customers. Exact-match only.
  if (body.data.content.trim() === "WorkRateVisualTesting") {
    const VISUAL_TEST_DESCRIPTION =
      "[TEST ENQUIRY — VISUAL TEST] Wall-to-wall fitted wardrobes, " +
      "3000mm wide x 2400mm high x 600mm deep. Shaker style doors, painted warm white, " +
      "long pull handles. Internal layout: hanging sections, drawers and shelving, " +
      "LED lighting. Location: Test Address, London. Budget: £5,000–£7,500. " +
      "Timescale: 4–6 weeks.";

    await db
      .update(enquiriesTable)
      .set({
        customerName: "[TEST] Visual Test",
        customerEmail: "orhuntley@gmail.com",
        customerPhone: "07000000000",
        projectType: "fitted wardrobes",
        location: "Test Address, London",
        description: VISUAL_TEST_DESCRIPTION,
        budget: "£5,000–£7,500",
        timescale: "4–6 weeks",
        isTest: true,
      })
      .where(eq(enquiriesTable.id, enquiry.id));

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const promptMessage =
      "⚡ Visual test mode activated — enquiry pre-filled with fitted wardrobes spec. " +
      "Please upload ONE real photo of the room to test the full production pipeline.";
    res.write(`data: ${JSON.stringify({ content: promptMessage })}\n\n`);

    await db.insert(enquiryMessagesTable).values({
      enquiryId: enquiry.id,
      role: "assistant",
      content: promptMessage,
    });

    // NOT sending completed:true — waiting for the photo upload to complete the enquiry
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
    return;
  }

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
    // Signal the widget IMMEDIATELY so the success screen shows regardless of AI phrasing
    res.write(`data: ${JSON.stringify({ completed: true })}\n\n`);
    try {
      const extracted = JSON.parse(completionMatch[1]);
      await handleEnquiryCompletion(enquiry, extracted, false);
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

    // Upload to persistent object storage so the URL is stable across container
    // restarts and autoscale instances. Fall back to the local disk URL only if
    // the GCS upload fails (e.g. storage not yet configured in dev).
    let publicUrl = fileUrl(req, file.filename);
    try {
      const fileBuf = fs.readFileSync(path.join(uploadsDir, file.filename));
      const { objectPath } = await uploadBufferToStorage(fileBuf, file.mimetype);
      publicUrl = storageServingUrl(req, objectPath);
    } catch (gcsErr) {
      console.error("[upload] GCS upload failed, falling back to local URL:", gcsErr);
    }

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

    // ── Images: vision → completion-aware main AI response ─────────────────
    // Step 1: Run vision to extract information from the photo (context only —
    //         no follow-up question; the main AI decides what to say next).
    const tradeTypeForVision = enquiry.projectType ?? "general";
    const isJoinery = tradeTypeForVision.toLowerCase() === "joinery";
    const visionPromptText = isJoinery
      ? `You are a joinery estimator reviewing a site photo. In 2–3 sentences, describe what you can observe that would be relevant to preparing a joinery quote: dimensions or proportions visible, existing architectural features (chimney breast, coving, skirting, ceiling height), current condition, and any scribing or access challenges. Use correct joinery terminology (carcass, scribe, alcove, back panel, etc.). Do NOT ask any questions — purely describe what you see.`
      : `You are a trades estimator reviewing a site photo. In 1–2 sentences, describe what is visible that would be relevant to a tradesperson preparing a quote (room size, existing fixtures, condition, style). Do NOT ask any questions — purely describe what you see.`;

    let visionContext = "A photo of the customer's project space.";
    const openai = getOpenAI();
    try {
      // Build the image data URL inline (base64) so OpenAI can read the image
      // regardless of network routing, HTTP/HTTPS differences, or which container
      // instance handles the request. Using a public URL was unreliable on autoscale
      // (the file exists on one container; OpenAI's fetch may hit a different one).
      const filePath = path.join(uploadsDir, file.filename);

      // Detect whether the file is actually HEIC despite having a JPEG extension.
      // iPhones sometimes send HEIC bytes with mimetype "image/jpeg". Read the first
      // 12 bytes — ISO Base Media format (HEIC/HEIF) has "ftyp" at bytes 4–7.
      let visionDataUrl: string;
      try {
        const header = Buffer.alloc(12);
        const fd = fs.openSync(filePath, "r");
        fs.readSync(fd, header, 0, 12, 0);
        fs.closeSync(fd);
        const isActuallyHeic = header.slice(4, 8).toString("ascii") === "ftyp";

        if (isActuallyHeic) {
          // Convert HEIC → JPEG using sharp (pure Node, no system PATH dependency)
          const jpegBuf = await sharp(fs.readFileSync(filePath)).jpeg({ quality: 90 }).toBuffer();
          visionDataUrl = `data:image/jpeg;base64,${jpegBuf.toString("base64")}`;
        } else {
          const b64 = fs.readFileSync(filePath).toString("base64");
          visionDataUrl = `data:${file.mimetype};base64,${b64}`;
        }
      } catch (readErr) {
        // Fallback: read the file as-is and hope it's a supported format
        console.error("[vision] Image prep failed, falling back to raw base64:", readErr);
        const b64 = fs.readFileSync(filePath).toString("base64");
        visionDataUrl = `data:${file.mimetype};base64,${b64}`;
      }

      const vision = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 200,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: visionPromptText },
              { type: "image_url", image_url: { url: visionDataUrl, detail: "low" } },
            ],
          },
        ],
      });
      visionContext = vision.choices[0]?.message?.content ?? visionContext;
    } catch (err) {
      console.error("Vision analysis failed", err);
    }

    // Step 2: Record a customer turn for the photo upload so history is coherent.
    await db.insert(enquiryMessagesTable).values({
      enquiryId: enquiry.id,
      role: "customer",
      content: "[Customer uploaded a photo of their project]",
    });

    // Step 3: Load full history (now includes the photo customer turn).
    const uploadHistory = await db
      .select()
      .from(enquiryMessagesTable)
      .where(eq(enquiryMessagesTable.enquiryId, enquiry.id))
      .orderBy(enquiryMessagesTable.createdAt);

    // Step 4: Run main chat AI with vision context injected as a system note.
    // The AI will either ask the next missing question OR produce ENQUIRY_COMPLETE
    // if all required fields are now satisfied — same logic as a text message.
    const tradeType = enquiry.projectType ?? "General";
    const basePrompt = getSystemPrompt(tradeType);

    // ── VisualTest auto-completion ──────────────────────────────────────────
    // If this upload comes from a WorkRateVisualTesting session, skip the AI
    // chat steps and complete the enquiry immediately using the pre-filled data.
    // Vision analysis above still ran — ensuring the same storage pipeline.
    const isVisualTest =
      enquiry.isTest === true &&
      (enquiry.customerName ?? "").startsWith("[TEST] Visual Test");

    if (isVisualTest) {
      const completionMsg =
        "📸 Photo saved. Enquiry completed through the live production pipeline — " +
        "concept visual generating now.";

      await db.insert(enquiryMessagesTable).values({
        enquiryId: enquiry.id,
        role: "assistant",
        content: completionMsg,
      });

      // Complete the enquiry using the data pre-filled by the visual-test shortcut
      await handleEnquiryCompletion(
        enquiry,
        {
          customerName: enquiry.customerName,
          customerEmail: enquiry.customerEmail,
          customerPhone: enquiry.customerPhone,
          postcode: enquiry.location,
          projectType: enquiry.projectType,
          budget: enquiry.budget,
          timescale: enquiry.timescale,
          description: enquiry.description,
        },
        true, // isTest
      );

      console.log(
        `[visual-test] Enquiry ${enquiry.id} auto-completed. Photo: ${publicUrl}`,
      );

      res.json({
        url: publicUrl,
        aiMessage: completionMsg,
        completed: true,
        conceptVisualOffer: true,
      });
      return;
    }

    // Look up company name so the AI can personalise the completion message
    let companyName = "the team";
    try {
      if (enquiry.ownerUserId) {
        const [co] = await db
          .select({ name: companiesTable.name })
          .from(companiesTable)
          .where(eq(companiesTable.ownerUserId, enquiry.ownerUserId))
          .limit(1);
        if (co?.name) companyName = co.name;
      }
    } catch {
      // fall back to "the team"
    }

    const systemWithVision =
      basePrompt +
      `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━` +
      `\nPHOTO JUST UPLOADED — ACT NOW` +
      `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━` +
      `\nThe customer has uploaded a photo. Vision analysis of the image: "${visionContext}"` +
      `\n\nScan the conversation history above and assess each required field:` +
      `\n  Field 1  — Full name` +
      `\n  Field 2  — Phone AND email` +
      `\n  Field 3  — Postcode / area` +
      `\n  Field 4  — Key measurements / dimensions` +
      `\n  Field 5  — Material, finish, style preferences` +
      `\n  Field 6  — Budget range` +
      `\n  Field 7  — Timescale` +
      `\n  Field 8  — Photos ✅ SATISFIED by this upload` +
      `\n\n► If fields 1–7 are ALL present in the conversation: you MUST complete the enquiry right now.` +
      `\n  Do NOT say "is there anything else?". Do NOT ask for confirmation. Complete immediately.` +
      `\n  Use this wording (substituting names): "Thanks, [first name] — that photo is really helpful. I've got everything I need and I've sent your enquiry to ${companyName}. They'll review the details and get back to you shortly."` +
      `\n  Then output the ENQUIRY_COMPLETE JSON marker on its own line as described above.` +
      `\n\n► If any of fields 1–7 is genuinely still missing: acknowledge the photo in one sentence, then immediately ask the single most important missing question.`;

    const uploadChatMessages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: systemWithVision },
      ...uploadHistory.map((m) => ({
        role: (m.role === "customer" ? "user" : "assistant") as "user" | "assistant",
        content: m.content,
      })),
    ];

    let fullUploadResponse = "Thank you for that photo — it's really helpful. Let me pick up where we left off.";
    try {
      const mainCompletion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 500,
        messages: uploadChatMessages,
      });
      fullUploadResponse = mainCompletion.choices[0]?.message?.content ?? fullUploadResponse;
    } catch (err) {
      console.error("Post-upload AI completion failed", err);
    }

    const displayUploadResponse = fullUploadResponse
      .replace(/\nENQUIRY_COMPLETE:.*$/s, "")
      .trim();

    // Step 5: Save the AI response to the conversation.
    await db.insert(enquiryMessagesTable).values({
      enquiryId: enquiry.id,
      role: "assistant",
      content: displayUploadResponse,
    });

    // Step 6: Check for completion and run the pipeline if triggered.
    let uploadCompleted = false;
    const uploadCompletionMatch = fullUploadResponse.match(/ENQUIRY_COMPLETE:(\{.*\})/s);
    if (uploadCompletionMatch) {
      uploadCompleted = true;
      try {
        const extracted = JSON.parse(uploadCompletionMatch[1]);
        await handleEnquiryCompletion(enquiry, extracted, false);
      } catch {
        // ignore parse errors — enquiry still marked complete on the widget
      }
    }

    // Offer a concept visual for supported joinery enquiries when the enquiry just completed
    const CONCEPT_JOINERY_TYPES = new Set([
      "joinery", "fitted wardrobes", "freestanding wardrobes", "media wall", "media units",
      "alcove units", "home office", "bespoke joinery", "kitchen installation", "built-in storage",
    ]);
    const offerConceptVisual =
      uploadCompleted &&
      CONCEPT_JOINERY_TYPES.has((enquiry.projectType ?? "").toLowerCase());

    res.json({
      url: publicUrl,
      aiMessage: displayUploadResponse,
      ...(uploadCompleted ? { completed: true } : {}),
      ...(offerConceptVisual ? { conceptVisualOffer: true } : {}),
    });
  },
);

export default router;
