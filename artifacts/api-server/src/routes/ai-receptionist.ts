import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db, aiCallsTable, aiReceptionistSettingsTable, enquiriesTable, companiesTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import OpenAI from "openai";
import { requireBillingFeature } from "../services/billing/authorization";

const router: IRouter = Router();

const requireAuth = (req: any, res: any, next: any) => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
};

function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");
  return new OpenAI({ apiKey });
}

// ── Settings ──────────────────────────────────────────────────────────────────

// GET /ai-receptionist/settings
router.get("/ai-receptionist/settings", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);

  let [settings] = await db
    .select()
    .from(aiReceptionistSettingsTable)
    .where(eq(aiReceptionistSettingsTable.ownerUserId, userId!))
    .limit(1);

  if (!settings) {
    // Seed default settings row for this user
    [settings] = await db
      .insert(aiReceptionistSettingsTable)
      .values({ ownerUserId: userId! })
      .returning();
  }

  res.json(settings);
});

// PUT /ai-receptionist/settings
router.put("/ai-receptionist/settings", requireAuth, requireBillingFeature("ai_receptionist"), async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const body = req.body ?? {};

  let [existing] = await db
    .select()
    .from(aiReceptionistSettingsTable)
    .where(eq(aiReceptionistSettingsTable.ownerUserId, userId!))
    .limit(1);

  if (!existing) {
    const [created] = await db
      .insert(aiReceptionistSettingsTable)
      .values({ ...body, ownerUserId: userId! })
      .returning();
    res.json(created);
    return;
  }

  const updates: Record<string, unknown> = {};
  if (body.enabled !== undefined) updates.enabled = body.enabled;
  if (body.welcomeMessageType !== undefined) updates.welcomeMessageType = body.welcomeMessageType;
  if (body.welcomeMessageText !== undefined) updates.welcomeMessageText = body.welcomeMessageText || null;
  if (body.welcomeMessageUrl !== undefined) updates.welcomeMessageUrl = body.welcomeMessageUrl || null;
  if (body.businessHours !== undefined) updates.businessHours = body.businessHours || null;
  if (body.outOfHoursBehaviour !== undefined) updates.outOfHoursBehaviour = body.outOfHoursBehaviour;
  if (body.outOfHoursMessage !== undefined) updates.outOfHoursMessage = body.outOfHoursMessage || null;
  if (body.transferUrgentCalls !== undefined) updates.transferUrgentCalls = body.transferUrgentCalls;
  if (body.transferPhone !== undefined) updates.transferPhone = body.transferPhone || null;
  if (body.enabledQuestions !== undefined) updates.enabledQuestions = body.enabledQuestions || null;
  if (body.phoneNumber !== undefined) updates.phoneNumber = body.phoneNumber || null;
  if (body.webhookUrl !== undefined) updates.webhookUrl = body.webhookUrl || null;

  const [updated] = await db
    .update(aiReceptionistSettingsTable)
    .set(updates)
    .where(and(
      eq(aiReceptionistSettingsTable.id, existing.id),
      eq(aiReceptionistSettingsTable.ownerUserId, userId!),
    ))
    .returning();

  res.json(updated);
});

// ── Calls ─────────────────────────────────────────────────────────────────────

// GET /ai-calls
router.get("/ai-calls", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  let rows = await db
    .select()
    .from(aiCallsTable)
    .where(eq(aiCallsTable.ownerUserId, userId!))
    .orderBy(desc(aiCallsTable.createdAt));

  const { date, followUpRequired } = req.query as Record<string, string | undefined>;

  if (date) {
    rows = rows.filter((r) => {
      if (!r.callStartedAt) return false;
      return r.callStartedAt.toISOString().startsWith(date);
    });
  }
  if (followUpRequired !== undefined) {
    const wanted = followUpRequired === "true";
    rows = rows.filter((r) => r.followUpRequired === wanted);
  }

  res.json(rows);
});

// Manual call creation. Provider callbacks must use their dedicated authenticated
// webhook routes (for example /webhooks/vapi), never this user-facing endpoint.
router.post("/ai-calls", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const body = req.body ?? {};
  const [created] = await db.insert(aiCallsTable).values({
    ownerUserId: userId!,
    callStatus: body.callStatus ?? "completed",
    callerPhone: body.callerPhone,
    callerName: body.callerName,
    durationSeconds: body.durationSeconds,
    callStartedAt: body.callStartedAt ? new Date(body.callStartedAt) : null,
    collectedData: body.collectedData,
    transcript: body.transcript,
    aiSummary: body.aiSummary,
    confidenceScore: body.confidenceScore,
    surveySuggested: body.surveySuggested,
    followUpRequired: body.followUpRequired ?? true,
    followUpNotes: body.followUpNotes,
    providerId: body.providerId,
    providerData: body.providerData,
  }).returning();

  res.status(201).json(created);
});

// GET /ai-calls/:id
router.get("/ai-calls/:id", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [call] = await db.select().from(aiCallsTable).where(and(
    eq(aiCallsTable.id, id),
    eq(aiCallsTable.ownerUserId, userId!),
  ));
  if (!call) { res.status(404).json({ error: "Call not found" }); return; }
  res.json(call);
});

// PATCH /ai-calls/:id
router.patch("/ai-calls/:id", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = req.body ?? {};

  const updates: Record<string, unknown> = {};
  if (body.callStatus !== undefined) updates.callStatus = body.callStatus;
  if (body.callerName !== undefined) updates.callerName = body.callerName;
  if (body.followUpRequired !== undefined) updates.followUpRequired = body.followUpRequired;
  if (body.followUpNotes !== undefined) updates.followUpNotes = body.followUpNotes;
  if (body.enquiryId !== undefined) updates.enquiryId = body.enquiryId;

  const [updated] = await db
    .update(aiCallsTable)
    .set(updates)
    .where(and(
      eq(aiCallsTable.id, id),
      eq(aiCallsTable.ownerUserId, userId!),
    ))
    .returning();

  if (!updated) { res.status(404).json({ error: "Call not found" }); return; }
  res.json(updated);
});

// POST /ai-calls/:id/process
// Creates an enquiry from the call's collected data and generates an AI summary
router.post("/ai-calls/:id/process", requireAuth, requireBillingFeature("ai_receptionist"), async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [call] = await db.select().from(aiCallsTable).where(and(
    eq(aiCallsTable.id, id),
    eq(aiCallsTable.ownerUserId, userId!),
  ));
  if (!call) { res.status(404).json({ error: "Call not found" }); return; }

  let collected: Record<string, string> = {};
  try {
    collected = call.collectedData ? JSON.parse(call.collectedData) : {};
  } catch {}

  const customerName = collected.customerName || call.callerName || "Unknown Caller";
  const description = [
    collected.projectType ? `Project: ${collected.projectType}` : "",
    collected.measurements ? `Measurements: ${collected.measurements}` : "",
    collected.notes ? `Notes: ${collected.notes}` : "",
  ].filter(Boolean).join("\n");

  // Create enquiry
  const [enquiry] = await db.insert(enquiriesTable).values({
    ownerUserId: userId!,
    customerName,
    customerPhone: collected.phone || call.callerPhone || undefined,
    location: collected.address
      ? `${collected.address}${collected.postcode ? ", " + collected.postcode : ""}`
      : collected.postcode || undefined,
    projectType: collected.projectType || undefined,
    description: description || undefined,
    budget: collected.budget || undefined,
    timescale: collected.timescale || undefined,
    channel: "phone",
    status: "new_enquiry",
  }).returning();

  // Generate AI summary using WorkRate Brain
  const [company] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.ownerUserId, userId!))
    .limit(1);
  const brainLines: string[] = [];
  if (company) {
    brainLines.push(`Business: ${company.name} (${company.tradeType})`);
    brainLines.push(`Labour rate: £${company.labourRatePerHour}/hr${company.dayRate ? `, £${company.dayRate}/day` : ""}`);
    brainLines.push(`Materials markup: ${company.materialMarkupPercent}%`);
    if (company.minimumProjectValue) brainLines.push(`Minimum project value: £${company.minimumProjectValue}`);
    if (company.serviceArea) brainLines.push(`Service area: ${company.serviceArea}`);
  }

  let transcript = "";
  try {
    const lines = call.transcript ? JSON.parse(call.transcript) as Array<{role:string;content:string}> : [];
    transcript = lines.map((l) => `${l.role === "ai" ? "AI Receptionist" : "Customer"}: ${l.content}`).join("\n");
  } catch {}

  const prompt = `You are an experienced trade business office manager in the UK. Analyse the following AI receptionist call and produce a structured job summary.
${brainLines.length > 0 ? `\nBusiness context (WorkRate Brain):\n${brainLines.join("\n")}\n` : ""}
Customer: ${customerName}
Phone: ${collected.phone || call.callerPhone || "Not provided"}
Address: ${collected.address || "Not provided"}
Postcode: ${collected.postcode || "Not provided"}
Project type: ${collected.projectType || "Not specified"}
Measurements: ${collected.measurements || "Not specified"}
Budget: ${collected.budget || "Not specified"}
Timescale: ${collected.timescale || "Not specified"}
Photos to upload: ${collected.photosToUpload || "Not specified"}
${transcript ? `\nCall transcript:\n${transcript}` : ""}

Also determine:
- confidenceScore (0-100): how complete is the information captured?
- surveySuggested (true/false): should a site survey be recommended?

Return ONLY a valid JSON object with these exact keys:
{
  "customer": "<name — phone>",
  "project": "<project type and brief scope>",
  "location": "<address and postcode>",
  "budget": "<budget or 'Not specified'>",
  "summary": "<2-3 sentence professional summary>",
  "measurements": "<dimensions if provided or 'Not specified'>",
  "materials": "<materials/finishes or 'Not specified'>",
  "customerRequirements": "<specific requirements>",
  "potentialChallenges": "<risks or things to verify>",
  "recommendedNextAction": "<concrete next step>",
  "confidenceScore": <0-100>,
  "surveySuggested": <true|false>
}`;

  let aiSummaryJson = call.aiSummary;
  let confidenceScore = call.confidenceScore;
  let surveySuggested = call.surveySuggested;

  try {
    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 800,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    });
    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    confidenceScore = typeof parsed.confidenceScore === "number" ? parsed.confidenceScore : confidenceScore;
    surveySuggested = typeof parsed.surveySuggested === "boolean" ? parsed.surveySuggested : surveySuggested;
    // Strip meta fields from the stored summary
    const { confidenceScore: _cs, surveySuggested: _ss, ...summaryFields } = parsed;
    aiSummaryJson = JSON.stringify(summaryFields);
    // Also save summary on enquiry
    await db.update(enquiriesTable).set({ aiSummary: aiSummaryJson }).where(eq(enquiriesTable.id, enquiry.id));
  } catch (err) {
    console.error("AI summary generation failed:", err);
  }

  // Update call with enquiry link and analysis
  const [updated] = await db
    .update(aiCallsTable)
    .set({
      enquiryId: enquiry.id,
      aiSummary: aiSummaryJson ?? undefined,
      confidenceScore: confidenceScore ?? undefined,
      surveySuggested: surveySuggested ?? undefined,
    })
    .where(and(
      eq(aiCallsTable.id, id),
      eq(aiCallsTable.ownerUserId, userId!),
    ))
    .returning();

  res.json(updated);
});

// List phone activity for one enquiry. Enquiry ownership is checked before the
// call query so recording URLs and transcripts never cross tenant boundaries.
router.get("/enquiries/:id/calls", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid enquiry id" });
    return;
  }
  const [enquiry] = await db
    .select({ id: enquiriesTable.id })
    .from(enquiriesTable)
    .where(and(
      eq(enquiriesTable.id, id),
      eq(enquiriesTable.ownerUserId, userId!),
    ))
    .limit(1);
  if (!enquiry) {
    res.status(404).json({ error: "Enquiry not found" });
    return;
  }
  const calls = await db
    .select()
    .from(aiCallsTable)
    .where(and(
      eq(aiCallsTable.enquiryId, id),
      eq(aiCallsTable.ownerUserId, userId!),
    ))
    .orderBy(desc(aiCallsTable.callStartedAt));
  res.json(calls);
});

// ── Demo / simulation mode ────────────────────────────────────────────────────

const DEMO_SYSTEM_PROMPT = (businessName: string, tradeType: string, enabledQuestions: string[]) => {
  const questionLabels: Record<string, string> = {
    customerName:    "full name",
    phone:           "phone number",
    address:         "address",
    postcode:        "postcode",
    projectType:     "type of work needed",
    measurements:    "key measurements",
    budget:          "budget",
    timescale:       "preferred timescale",
    photosToUpload:  "whether they can send photos",
  };
  const questions = enabledQuestions
    .map((id) => questionLabels[id])
    .filter(Boolean)
    .map((q, i) => `${i + 1}. ${q}`)
    .join("\n");

  return `You are an AI phone receptionist for ${businessName || "a trades business"}${tradeType ? ` (${tradeType})` : ""}. You answer inbound calls from customers who want to enquire about work.

Your job is to have a friendly, natural phone conversation to collect the caller's details and project information. Keep it warm and professional — like a real receptionist.

RULES:
- Start by greeting the caller and introducing yourself as the AI receptionist for ${businessName || "the business"}.
- Ask only 1–2 questions per message. Never fire a long list.
- Briefly acknowledge each answer before asking the next question.
- Do NOT give price estimates — tell them the tradesperson will be in touch with a quote.
- If a question isn't relevant to what they're asking, skip it naturally.
- Keep responses concise — this is a phone call, not a chat.

INFORMATION TO COLLECT:
${questions || "1. full name\n2. phone number\n3. type of work needed"}

COMPLETING THE CALL:
Once you have all the required information, thank the caller warmly, confirm their details will be passed on, and tell them someone will be in touch soon.

Then end your final message with this marker on its own line (nothing after it):
CALL_COMPLETE:{"customerName":"<name>","phone":"<phone>","address":"<address or null>","postcode":"<postcode or null>","projectType":"<type of work>","measurements":"<measurements or null>","budget":"<budget or null>","timescale":"<timescale or null>","photosToUpload":"<yes/no/null>"}`;
};

// POST /ai-receptionist/demo/message  (SSE stream)
router.post("/ai-receptionist/demo/message", requireAuth, requireBillingFeature("ai_receptionist"), async (req, res): Promise<void> => {
  // The demo previously invoked OpenAI without a provider event identifier, so
  // it could neither be safely deduplicated nor metered. Keep the endpoint
  // entitled but fail closed rather than create unaccounted provider spend.
  res.status(503).json({ error: "AI receptionist demo is temporarily unavailable." });
  return;
  /* const { messages = [], enabledQuestions = [], businessName = "", tradeType = "" } = req.body ?? {};

  const systemPrompt = DEMO_SYSTEM_PROMPT(businessName, tradeType, enabledQuestions);

  const chatMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemPrompt },
    ...messages.map((m: { role: string; content: string }) => ({
      role: (m.role === "caller" ? "user" : "assistant") as "user" | "assistant",
      content: m.content,
    })),
  ];

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const openai = getOpenAI();
    const stream = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 400,
      messages: chatMessages,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }
  } catch (err) {
    console.error("Demo message error:", err);
    res.write(`data: ${JSON.stringify({ error: "AI unavailable" })}\n\n`);
  }

  res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  res.end();
  */
});

// POST /ai-receptionist/demo/complete
router.post("/ai-receptionist/demo/complete", requireAuth, requireBillingFeature("ai_receptionist"), async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const { messages = [], durationSeconds } = req.body ?? {};

  // Build transcript
  const transcript = JSON.stringify(
    messages.map((m: { role: string; content: string }) => ({
      role: m.role === "caller" ? "caller" : "ai",
      content: m.content,
    }))
  );

  // Try to extract collected data from the last CALL_COMPLETE marker in the AI messages
  let collectedData: Record<string, string> = {};
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "caller") {
      const match = (m.content as string).match(/CALL_COMPLETE:(\{.*\})/s);
      if (match) {
        try { collectedData = JSON.parse(match[1]); } catch {}
        break;
      }
    }
  }

  // Generate AI summary for the demo call
  const transcriptText = messages
    .map((m: { role: string; content: string }) =>
      `${m.role === "caller" ? "Customer" : "AI Receptionist"}: ${m.content.replace(/\nCALL_COMPLETE:.*$/s, "")}`
    )
    .join("\n");

  const prompt = `You are an experienced trade business office manager in the UK. Analyse the following AI receptionist demo call and produce a structured job summary.

Customer: ${collectedData.customerName || "Not provided"}
Phone: ${collectedData.phone || "Not provided"}
Address: ${collectedData.address || "Not provided"}
Postcode: ${collectedData.postcode || "Not provided"}
Project type: ${collectedData.projectType || "Not specified"}
Measurements: ${collectedData.measurements || "Not specified"}
Budget: ${collectedData.budget || "Not specified"}
Timescale: ${collectedData.timescale || "Not specified"}

Call transcript:
${transcriptText}

Also determine:
- confidenceScore (0-100): how complete is the information captured?
- surveySuggested (true/false): should a site survey be recommended?

Return ONLY a valid JSON object with these exact keys:
{
  "customer": "<name — phone>",
  "project": "<project type and brief scope>",
  "location": "<address and postcode>",
  "budget": "<budget or 'Not specified'>",
  "summary": "<2-3 sentence professional summary>",
  "measurements": "<dimensions if provided or 'Not specified'>",
  "materials": "<materials/finishes or 'Not specified'>",
  "customerRequirements": "<specific requirements>",
  "potentialChallenges": "<risks or things to verify>",
  "recommendedNextAction": "<concrete next step>",
  "confidenceScore": <0-100>,
  "surveySuggested": <true|false>
}`;

  let aiSummaryJson: string | null = null;
  let confidenceScore: number | null = null;
  let surveySuggested: boolean | null = null;

  try {
    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 800,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    });
    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    confidenceScore = typeof parsed.confidenceScore === "number" ? parsed.confidenceScore : null;
    surveySuggested = typeof parsed.surveySuggested === "boolean" ? parsed.surveySuggested : null;
    const { confidenceScore: _cs, surveySuggested: _ss, ...summaryFields } = parsed;
    aiSummaryJson = JSON.stringify(summaryFields);
  } catch (err) {
    console.error("Demo summary generation failed:", err);
  }

  const [created] = await db.insert(aiCallsTable).values({
    ownerUserId: userId!,
    callStatus: "completed",
    callerName: collectedData.customerName || null,
    callerPhone: collectedData.phone || null,
    durationSeconds: durationSeconds ?? Math.floor(messages.length * 8 + Math.random() * 30),
    callStartedAt: new Date(),
    collectedData: Object.keys(collectedData).length > 0 ? JSON.stringify(collectedData) : null,
    transcript,
    aiSummary: aiSummaryJson,
    confidenceScore: confidenceScore ?? undefined,
    surveySuggested: surveySuggested ?? undefined,
    followUpRequired: true,
    providerData: JSON.stringify({ demo: true }),
  }).returning();

  res.status(201).json(created);
});

export default router;
