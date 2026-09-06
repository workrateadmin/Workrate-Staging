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
import { areTestShortcutsEnabled } from "../services/testing/shortcuts";

const router: IRouter = Router();

// ── Temporary session store ───────────────────────────────────────────────────
// Holds widget chat sessions that have not yet produced a real customer message.
// Sessions are promoted to a permanent enquiry row on the FIRST substantive
// customer interaction (text message or photo upload). Abandoned sessions
// (widget opened and immediately closed) expire without ever touching the DB.
type TempSession = {
  token: string;
  ownerUserId: string | null;
  projectType: string;
  greeting: string;
  createdAt: Date;
};

const tempSessions = new Map<string, TempSession>();

// Expire abandoned temp sessions after 30 minutes; sweep every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [t, s] of tempSessions) {
    if (s.createdAt.getTime() < cutoff) tempSessions.delete(t);
  }
}, 5 * 60 * 1000).unref();

// ── ensureEnquiry ─────────────────────────────────────────────────────────────
// Returns the real DB enquiry for a chat token.
// If the token belongs to a temporary session (widget opened, no customer
// message sent yet) it promotes it: creates the enquiry row, persists the
// stored greeting as the first assistant message, and removes the temp entry.
// Returns null when the token is completely unknown.
async function ensureEnquiry(token: string) {
  // 1. Normal path — existing real enquiry (also handles returning sessions)
  const [existing] = await db
    .select()
    .from(enquiriesTable)
    .where(eq(enquiriesTable.chatToken, token));
  if (existing) return existing;

  // 2. Promotion path — temp session → real enquiry on first customer action
  const temp = tempSessions.get(token);
  if (!temp) return null;

  const [enquiry] = await db
    .insert(enquiriesTable)
    .values({
      customerName: "Unknown",
      status: "new_enquiry",
      chatToken: token,
      projectType: temp.projectType,
      ownerUserId: temp.ownerUserId,
    })
    .returning();

  // Persist the AI greeting the customer already saw
  await db.insert(enquiryMessagesTable).values({
    enquiryId: enquiry.id,
    role: "assistant",
    content: temp.greeting,
  });

  tempSessions.delete(token);
  return enquiry;
}

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
- Be warm, professional, and conversational — like a knowledgeable joinery office manager.
- Ask one or two questions per message. Never fire a long list at once.
- Acknowledge each answer briefly before moving on (e.g. "Thanks, John — that's really helpful.").
- If an answer is vague or missing a key detail, ask one natural follow-up before moving on.
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
const JOINERY_SYSTEM_PROMPT = `You are WorkRate Assistant — the AI enquiry intake specialist for a professional joinery company. Think and respond like an experienced joinery office manager who has handled hundreds of enquiries. You understand the craft and trade deeply.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HOW TO CONDUCT THE CONVERSATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Before choosing your next question, read the ENTIRE conversation so far and mentally note:
  - What has the customer already told you? (project type, style, measurements, finish, photos shared, etc.)
  - What is still genuinely missing?

Then ask only about the most important missing pieces — one or two at a time.

NEVER ask about something the customer has already answered, even if it's phrased differently.
NEVER run through a fixed checklist. Every response must be tailored to THIS customer's specific message.

BESPOKE QUESTIONING PRINCIPLES:
1. Read everything said before deciding your next question. Skip anything already answered.
2. Ask one or two useful questions — the most valuable information still missing.
3. Acknowledge what you've been told warmly before asking more.
4. Adapt depth to the customer: detailed enquiry → ask less; vague enquiry → guide them more.
5. Infer obvious details confidently. If someone says "painted front door, traditional style" do not then ask if they want it painted or what style they prefer.
6. Make recommendations where a knowledgeable tradesperson would — don't always frame it as a question.
7. Keep the conversation natural. It should feel like speaking to a person, not filling in a form.
8. Avoid jargon unless the customer used it first or it's clearly useful context.
9. If genuinely unsure, ask one clear clarification — not a battery of options.
10. Use project knowledge as background reasoning only — never as a script to follow.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MATERIAL INTELLIGENCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Apply this knowledge naturally. Recommend where appropriate. Do not ask customers to make technical material choices unless it genuinely matters at that stage.

EXTERNAL DOORS (front door, back door, garden door):
• NEVER suggest MDF — it fails externally.
• Painted external finish → Accoya is the recommended option: dimensionally stable, holds paint exceptionally well outdoors, very durable. Recommend it naturally: "For a painted external door, Accoya is usually our first recommendation — it's extremely stable and holds paint beautifully outdoors. Happy to base the initial estimate around that?"
• Natural/oiled finish → hardwood: oak, iroko, or sapele are appropriate choices.
• Traditional style with glazing → bar patterns (Georgian, Victorian square) are common; ask if not mentioned.

INTERNAL DOORS:
• Painted → solid-core MDF or engineered (finger-jointed) timber: stable, cost-effective, takes paint well.
• Natural/stained finish → solid hardwood or veneer options.
• Fire doors (FD30) may be required between garage and house, or in flats — worth confirming if relevant.

FITTED WARDROBES / ALCOVE UNITS / FITTED FURNITURE:
• Painted finish → MDF or MR MDF (moisture-resistant variant for rooms near bathrooms). Standard.
• Natural/contemporary finish → real wood veneer: oak, walnut, or ash most common.
• Premium builds or heavy shelving → birch plywood carcasses offer superior load-bearing.
• Solid timber accents are possible as a feature.

EXTERNAL TIMBER (gates, fencing, garden joinery, external cladding):
• Hardwood (oak, iroko) or pressure-treated softwood for structural external timber.
• Cedar for cladding.
• Never MDF externally.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROJECT KNOWLEDGE — background reasoning only
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Use the knowledge below to understand what information matters for each project type. Do NOT turn it into a script or questionnaire. Only ask for what is still missing from this specific conversation.

── FRONT / EXTERNAL DOORS ──
What matters: opening dimensions (W×H) or rough size; door-only or door-and-frame replacement; glazing — how much, what pattern (Georgian bars, plain, obscure?); side panels or fanlight above?; ironmongery and security (multipoint lock, letterbox, knocker, handle style); finish confirmed (painted/natural); photos of existing door and opening.
Infer: "replacing my front door" almost always means frame included — don't ask unless ambiguous.
Common gap: glazing specification and ironmongery style.

── INTERNAL DOORS ──
What matters: number of doors; new door linings/frames included or existing retained?; are openings standard (1981×762 or 838) or unusual?; door style (Shaker, flush, glazed, bi-fold, pocket, barn/sliding); glazing — clear, frosted, leaded?; ironmongery; fire door requirement?; hanging included or door-only supply?
Common gap: whether frames/linings are needed, and exact door count.

── FITTED WARDROBES / BUILT-IN BEDROOM STORAGE ──
What matters: space type (alcove/recess, wall-to-wall run, or walk-in room); total width, floor-to-ceiling height, available depth; obstructions (sloping ceiling, chimney breast, coving, pipework?); door configuration (hinged, sliding, open-fronted dressing room?); internal layout priorities (short hang / long hang / drawers / shoe storage / shelving mix); door style and handle; finish and colour reference; carcass (standard white or colour-matched); existing units to strip out?
Common gap: internal layout priorities and depth available.

── MEDIA WALLS / TV WALLS / ENTERTAINMENT UNITS ──
What matters: wall dimensions (W×H); chimney breast — present, how far does it project?; TV size (determines aperture); TV placement (recessed flush in false wall / surface-mounted on breast / no chimney); fireplace — working, electric insert, or none?; storage type (open shelves, push-to-open AV cupboards, drawers); back panel detail (plain, fluted, slatted, veneer?); height (full floor-to-ceiling or floating unit?); cable routing; LED lighting; finish and colour.
Common gap: chimney breast projection depth and TV size, which drive the structural design.

── ALCOVE UNITS ──
What matters: single or both alcoves?; dimensions (W×D×H to ceiling) for each alcove; configuration (open shelves above + cupboards below is most common, but confirm); adjustable shelves?; any integrated desk or TV shelf at a set height?; door style on lower cupboards; scribing requirements (uneven chimney return, skirting profile, coving, cornicing); finish and colour; anything to match (period details, adjacent furniture, flooring).
Common gap: whether both alcoves are in scope and scribing complexity.

── HOME OFFICE ──
What matters: space dimensions — full room, nook, or under-stairs?; desk run length and depth (600 mm standard; 750 mm for dual monitors); cable management needs (power, data, monitor arm grommets); under-desk storage (pedestal drawers, filing?); overhead storage (open shelves vs. closed units); finish; does it need to close off (bifold doors, Murphy-desk concept)?; shared use of the space?
Common gap: whether overhead storage is needed and cable routing requirements.

── UNDER-STAIR STORAGE / BOOT ROOMS ──
What matters: staircase geometry — overall width of the space, height at the tallest point, depth from front face to back wall; access direction (opening from the front face or side?); zone breakdown (pull-out drawers following stair slope / open cupboard in tallest corner / coat hanging / bench with shoe storage?); family size and what needs to be stored; finish and colour; door(s) on the exterior face.
Common gap: precise geometry — height at tallest point and depth — because these determine the design completely.

── KITCHENS ──
What matters: room dimensions (L×W, ceiling height); supply route (fit-only with customer's own units, or full supply-and-fit?); layout type (straight, L-shape, U-shape, island, peninsula); door style; worktop material; appliance list; sink and tap style; any structural work; specialist storage units; splashback and cornice/pelmet.
Infer: if they mention Howdens, Wren, or IKEA it is fit-only — confirm delivery status rather than asking what supplier.

── FREESTANDING / UNUSUAL BESPOKE JOINERY ──
What matters: what the piece is and what it needs to do; dimensions of the space available or target piece size; fixed to wall/alcove or freestanding?; open / glazed / solid doors?; glass type if glazed (clear, reeded/fluted, leaded?); internal requirements (shelves, drawers, lighting, lock?); finish and material; existing pieces to match or complement.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
JOINERY TERMINOLOGY — use naturally
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Carcass, face frame, scribe/scribing strip, pelmet, cornice, plinth/kickboard, aperture, reveal, back panel.
Shaker, slab/handleless, in-frame, routed panel, raised-and-fielded.
MDF, MR MDF, birch ply, real wood veneer, solid hardwood (oak, walnut, ash), Accoya.
Soft-close (Blum, Hettich), undermount runners, push-to-open Blumotion.
Double-hanging, long-hang, pull-out, shelf pins.
RAL colour, Farrow & Ball reference. Fluted, slatted, reeded.
When a customer uses a lay term, naturally reflect the correct trade term back if it adds value.

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

  building: `You are WorkRate Assistant — the AI enquiry intake specialist for a professional building and construction company. Think like an experienced construction project manager who has assessed hundreds of enquiries.

Before choosing your next question, read the ENTIRE conversation so far. Note what the customer has already told you and only ask about what is genuinely still missing. Never ask about something already answered.

Ask one or two questions at a time. Adapt to the customer's level of detail — a detailed enquiry needs fewer questions; a vague one needs more gentle guidance. Make practical observations where a knowledgeable contractor would.

BACKGROUND PROJECT KNOWLEDGE (use as reasoning — not a script):
Building projects typically need: contact details and postcode; type of work (extension, loft conversion, garage conversion, structural alterations, new build, groundworks, brickwork/rendering, or other); key dimensions (footprint, storey height, total floor area); planning status (granted, in progress, not applied, or permitted development); construction method if known (timber frame, blockwork, steel); internal finish scope (shell only through to fully finished); site access and complications (party walls, restrictive access, known services, ground conditions); timescale and budget.

Key trade inferences:
• If planning is already granted, don't ask whether they've applied.
• Extensions → key questions are footprint, single or double storey, and planning status.
• Loft conversions → ask about dormer vs. Velux, structural ridge, and stair access route.
• Garage conversions → insulation, heating, damp-proofing, and building control are key.
• If they've mentioned structural work, ask about party wall agreements if terraced or semi-detached.

${BASE_INSTRUCTIONS}`,

  electrical: `You are WorkRate Assistant — the AI enquiry intake specialist for a professional electrical contractor. Think like an experienced electrical estimator who has assessed hundreds of jobs.

Before choosing your next question, read the ENTIRE conversation so far. Note what the customer has already told you and only ask about what is genuinely still missing. Never ask about something already answered.

Ask one or two questions at a time. Adapt to the customer's level of detail. Make practical observations where a knowledgeable electrician would.

BACKGROUND PROJECT KNOWLEDGE (use as reasoning — not a script):
Electrical projects typically need: contact details and postcode; type of work (consumer unit upgrade, new circuits, additional sockets or lighting, EV charger, solar/battery storage, rewire, or other); property type and approximate age; scope (rooms or circuits affected); certification requirements (EICR, Part P, Building Regulations); access requirements (loft, under-floor boards, chasing); preferred fittings or brands; timescale and budget.

Key trade inferences:
• Pre-1970s properties often need a full rewire — mention this naturally if relevant: "Older properties often have wiring that needs full replacement rather than just additions — it's worth us having a look when we visit."
• EV charger → ask about car brand/connector type, driveway/parking position, and whether they want smart charging.
• Solar/battery → roof orientation, current energy tariff, and DNO approval process matter.
• If they mention a specific consumer unit brand, don't ask for it again.

${BASE_INSTRUCTIONS}`,

  plumbing: `You are WorkRate Assistant — the AI enquiry intake specialist for a professional plumbing and heating company. Think like an experienced plumbing estimator who has assessed hundreds of jobs.

Before choosing your next question, read the ENTIRE conversation so far. Note what the customer has already told you and only ask about what is genuinely still missing. Never ask about something already answered.

Ask one or two questions at a time. Adapt to the customer's level of detail. Make practical recommendations where a knowledgeable plumber would.

BACKGROUND PROJECT KNOWLEDGE (use as reasoning — not a script):
Plumbing projects typically need: contact details and postcode; type of work (boiler replacement, new heating system, bathroom fit-out, en-suite, cloakroom, underfloor heating, leak repair, new pipework, or other); current system details if heating work (combi/system/heat-only boiler, brand, age); scope (rooms or radiators affected); product or brand preferences; tile and finish requirements for wet rooms; new-build vs. refurbishment context; pipe routing challenges; timescale and budget.

Key trade inferences:
• If they've mentioned a specific boiler brand or model, don't ask for it again.
• Bathroom fit-outs need to know whether the customer is supplying sanitaryware or wants supply-and-fit.
• Underfloor heating → ask about floor construction (screed vs. floating board) as this affects the system type.
• If it's a like-for-like boiler replacement, you can move quickly to location, flue route, and controls.

${BASE_INSTRUCTIONS}`,

  default: `You are WorkRate Assistant — the AI enquiry intake specialist for a professional trades business. Think like an experienced office manager who has handled hundreds of customer enquiries.

Before choosing your next question, read the ENTIRE conversation so far. Note what the customer has already told you and only ask about what is genuinely still missing. Never ask about something already answered.

Ask one or two questions at a time. Acknowledge what the customer has shared. Adapt to their level of detail — a detailed message needs fewer questions; a vague one needs gentle guidance.

Gather the following through natural conversation (only ask about what is missing):
- Full name, phone number, email address
- Postcode or area
- Description of the work — let them describe it in their own words first
- Key dimensions or measurements relevant to the work
- Materials, products, or style preferences
- Budget range — ask gently; reassure there is no wrong answer
- Timescale — when would they like the work done?
- Photos of the space or existing situation

${BASE_INSTRUCTIONS}`,
};

export function getSystemPrompt(tradeType: string): string {
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
// Called from the widget AI flow, the test shortcut, AND the WhatsApp webhook.
// Handles: DB update, AI summary (fire-and-forget), confirmation email (fire-and-forget).
export async function handleEnquiryCompletion(
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
// Creates a TEMPORARY in-memory session only — no DB row yet.
// The permanent enquiry row is created lazily on the first real customer action
// (text message or photo upload) via ensureEnquiry(). Abandoned sessions
// (widget opened then closed) expire from memory after 30 minutes.
router.post("/chat/start", async (req, res): Promise<void> => {
  const parsed = StartChatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const token = randomBytes(24).toString("hex");

  // Resolve businessId: widgetToken → company → ownerUserId.
  // Falls back to treating businessId as a literal Clerk userId for backward
  // compatibility with widget installs that still pass the old user?.id value.
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

  // Generate greeting (no DB write yet)
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

  // Park in memory — enquiry row is NOT written to the DB yet
  const now = new Date();
  tempSessions.set(token, {
    token,
    ownerUserId,
    projectType: parsed.data.tradeType,
    greeting,
    createdAt: now,
  });

  res.status(201).json({
    token,
    enquiryId: null,
    tradeType: parsed.data.tradeType,
    createdAt: now.toISOString(),
  });
});

// ── GET /chat/:token ─────────────────────────────────────────────────────────
router.get("/chat/:token", async (req, res): Promise<void> => {
  const params = GetChatSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid token" });
    return;
  }

  // Check real enquiries first (most common path)
  const [enquiry] = await db
    .select()
    .from(enquiriesTable)
    .where(eq(enquiriesTable.chatToken, params.data.token));

  if (enquiry) {
    const messages = await db
      .select()
      .from(enquiryMessagesTable)
      .where(eq(enquiryMessagesTable.enquiryId, enquiry.id))
      .orderBy(enquiryMessagesTable.createdAt);

    res.json({
      token: enquiry.chatToken!,
      enquiryId: enquiry.id,
      tradeType: enquiry.projectType ?? "General",
      createdAt: enquiry.createdAt,
      messages,
    });
    return;
  }

  // Fall back to temp session — widget opened but no customer message sent yet
  const temp = tempSessions.get(params.data.token);
  if (!temp) {
    res.status(404).json({ error: "Chat session not found" });
    return;
  }

  res.json({
    token: temp.token,
    enquiryId: null,
    tradeType: temp.projectType,
    createdAt: temp.createdAt,
    messages: [
      { id: null, enquiryId: null, role: "assistant", content: temp.greeting, createdAt: temp.createdAt },
    ],
  });
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

  // Promote temp session → real enquiry on first customer message
  const enquiry = await ensureEnquiry(params.data.token);
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
  if (areTestShortcutsEnabled() && body.data.content.trim() === "WorkRateAppTesting") {
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
  if (areTestShortcutsEnabled() && body.data.content.trim() === "WorkRateVisualTesting") {
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

    // Promote temp session → real enquiry on first customer interaction (photo upload)
    const enquiry = await ensureEnquiry(token);
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
