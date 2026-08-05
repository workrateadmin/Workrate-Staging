import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db, aiCallsTable, aiReceptionistSettingsTable, enquiriesTable, companiesTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import OpenAI from "openai";

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
  let [settings] = await db.select().from(aiReceptionistSettingsTable).limit(1);

  if (!settings) {
    // Seed default settings row
    [settings] = await db.insert(aiReceptionistSettingsTable).values({}).returning();
  }

  res.json(settings);
});

// PUT /ai-receptionist/settings
router.put("/ai-receptionist/settings", requireAuth, async (req, res): Promise<void> => {
  const body = req.body ?? {};
  let [existing] = await db.select().from(aiReceptionistSettingsTable).limit(1);

  if (!existing) {
    const [created] = await db.insert(aiReceptionistSettingsTable).values(body).returning();
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
    .where(eq(aiReceptionistSettingsTable.id, existing.id))
    .returning();

  res.json(updated);
});

// ── Calls ─────────────────────────────────────────────────────────────────────

// GET /ai-calls
router.get("/ai-calls", requireAuth, async (req, res): Promise<void> => {
  let rows = await db
    .select()
    .from(aiCallsTable)
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

// POST /ai-calls  (telephony webhook — no auth required for provider callbacks)
router.post("/ai-calls", async (req, res): Promise<void> => {
  const body = req.body ?? {};
  const [created] = await db.insert(aiCallsTable).values({
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
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [call] = await db.select().from(aiCallsTable).where(eq(aiCallsTable.id, id));
  if (!call) { res.status(404).json({ error: "Call not found" }); return; }
  res.json(call);
});

// PATCH /ai-calls/:id
router.patch("/ai-calls/:id", requireAuth, async (req, res): Promise<void> => {
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
    .where(eq(aiCallsTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Call not found" }); return; }
  res.json(updated);
});

// POST /ai-calls/:id/process
// Creates an enquiry from the call's collected data and generates an AI summary
router.post("/ai-calls/:id/process", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [call] = await db.select().from(aiCallsTable).where(eq(aiCallsTable.id, id));
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
    customerName,
    customerPhone: collected.phone || call.callerPhone || undefined,
    location: collected.address
      ? `${collected.address}${collected.postcode ? ", " + collected.postcode : ""}`
      : collected.postcode || undefined,
    projectType: collected.projectType || undefined,
    description: description || undefined,
    budget: collected.budget || undefined,
    timescale: collected.timescale || undefined,
    status: "new_enquiry",
  }).returning();

  // Generate AI summary using WorkRate Brain
  const [company] = await db.select().from(companiesTable).limit(1);
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
    .where(eq(aiCallsTable.id, id))
    .returning();

  res.json(updated);
});

export default router;
