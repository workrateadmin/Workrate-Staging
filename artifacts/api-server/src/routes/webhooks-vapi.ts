import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, aiCallsTable, companiesTable, enquiriesTable, enquiryMessagesTable } from "@workspace/db";
import { handleEnquiryCompletion } from "./chat";
import {
  extractVapiCallData,
  findVapiBusiness,
  isVapiAssistantRequestEvent,
  isVapiEndOfCallEvent,
  normalizePhone,
  verifyVapiWebhookAuthentication,
  type VapiCallData,
} from "../services/vapi";
import { extractEmailWithFallback, isValidEmailAddress } from "../services/vapi-email";
import { reserveMeteredFeature } from "../services/billing/authorization";
import { finalizeUsageReservation, recordUsage, releaseUsageReservation } from "../services/billing/usage";

const EMAIL_NEEDS_CONFIRMATION_NOTE = "Email needs confirmation — the transcript did not contain one clearly confirmed email address.";

const router: IRouter = Router();

type EnquiryDetails = {
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  postcode?: string;
  projectType?: string;
  measurements?: string;
  materials?: string;
  finish?: string;
  budget?: string;
  timescale?: string;
  description?: string;
  emailNeedsConfirmation: boolean;
};

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

// Resolves the customer's email with a strict "never guess" rule, in three
// stages: (1) Vapi's own structured-data extraction, trusted only when it's
// already a syntactically valid address; (2) our own deterministic transcript
// parser (services/vapi-email.ts), which understands literal, spoken, and
// spelled-out emails; (3) only when that parser isn't confident, a narrow
// LLM fallback scoped to just the transcript text around the email statement,
// for the real-world transcripts garbled badly enough that no fixed pattern
// can safely recover them. If nothing across all three stages yields one
// confident, unambiguous address, the email is left blank rather than saving
// a guess, and the caller is told to flag it for confirmation. The resolved
// semantic candidate (if any) is preserved in `semanticCandidate` purely for
// internal follow-up review — it is never written to customerEmail itself.
async function resolveCustomerEmail(call: VapiCallData): Promise<{
  email: string | undefined;
  needsConfirmation: boolean;
  semanticCandidate?: { email: string; confidence: string; evidence: string };
}> {
  const structured = firstString(call.collectedData.customerEmail, call.collectedData.email);
  if (structured && isValidEmailAddress(structured)) {
    return { email: structured.toLowerCase(), needsConfirmation: false };
  }

  const { deterministic, semantic } = await extractEmailWithFallback(call.transcript);
  if (deterministic.status === "confident" && deterministic.email) {
    return { email: deterministic.email, needsConfirmation: false };
  }

  if (semantic && semantic.email && !semantic.needsConfirmation) {
    return { email: semantic.email, needsConfirmation: false };
  }

  // Nothing crossed the confidence bar. If the semantic fallback produced a
  // plausible-but-unconfirmed candidate, keep it around for a human to review
  // — but never write it to customerEmail itself.
  return {
    email: undefined,
    needsConfirmation: true,
    semanticCandidate: semantic?.email
      ? { email: semantic.email, confidence: semantic.confidence, evidence: semantic.evidence }
      : undefined,
  };
}

async function detailsFromCall(call: VapiCallData): Promise<EnquiryDetails & {
  semanticCandidate?: { email: string; confidence: string; evidence: string };
}> {
  const data = call.collectedData;
  const location = firstString(data.location, data.address, data.postcode);
  const resolvedEmail = await resolveCustomerEmail(call);
  return {
    customerName: firstString(data.customerName, data.name, call.callerName),
    customerEmail: resolvedEmail.email,
    customerPhone: firstString(data.customerPhone, data.phone, call.callerPhone),
    postcode: location,
    projectType: firstString(data.projectType, data.jobType, data.project),
    measurements: firstString(data.measurements, data.dimensions),
    materials: firstString(data.materials),
    finish: firstString(data.finish),
    budget: firstString(data.budget),
    timescale: firstString(data.timescale, data.timing),
    description: firstString(data.description, data.requirements, data.notes),
    emailNeedsConfirmation: resolvedEmail.needsConfirmation,
    semanticCandidate: resolvedEmail.semanticCandidate,
  };
}

function compatibleProject(existing: string | null, incoming: string | undefined): boolean {
  if (!existing || !incoming) return false;
  const existingWords = new Set(existing.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2));
  const incomingWords = incoming.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2);
  return incomingWords.some((word) => existingWords.has(word));
}

async function findRelatedPhoneEnquiry(
  ownerUserId: string,
  callerPhone: string | undefined,
  projectType: string | undefined,
  database: any = db,
) {
  const normalized = normalizePhone(callerPhone);
  if (!normalized) return null;

  const candidates = await database
    .select()
    .from(enquiriesTable)
    .where(and(
      eq(enquiriesTable.ownerUserId, ownerUserId),
      inArray(enquiriesTable.status, ["new_enquiry", "reviewing", "survey_required", "quote_sent"]),
    ))
    .orderBy(desc(enquiriesTable.updatedAt));

  const recentThreshold = Date.now() - 45 * 24 * 60 * 60 * 1000;
  return candidates.find((enquiry: typeof enquiriesTable.$inferSelect) => (
    enquiry.updatedAt.getTime() >= recentThreshold
    && normalizePhone(enquiry.customerPhone) === normalized
    && compatibleProject(enquiry.projectType, projectType)
  )) ?? null;
}

async function createOrUpdateEnquiry(
  call: VapiCallData,
  ownerUserId: string,
  details: EnquiryDetails & { semanticCandidate?: { email: string; confidence: string; evidence: string } },
  database: any = db,
) {
  const existing = await findRelatedPhoneEnquiry(ownerUserId, details.customerPhone, details.projectType, database);
  if (existing) {
    const [updated] = await database
      .update(enquiriesTable)
      .set({
        customerName: existing.customerName === "Phone Enquiry" && details.customerName
          ? details.customerName
          : existing.customerName,
        customerEmail: existing.customerEmail ?? details.customerEmail ?? null,
        customerPhone: existing.customerPhone ?? details.customerPhone ?? null,
        projectType: existing.projectType ?? details.projectType ?? null,
        location: existing.location ?? details.postcode ?? null,
        budget: existing.budget ?? details.budget ?? null,
        timescale: existing.timescale ?? details.timescale ?? null,
      })
      .where(and(
        eq(enquiriesTable.id, existing.id),
        eq(enquiriesTable.ownerUserId, ownerUserId),
      ))
      .returning();
    return { enquiry: updated, created: false, details };
  }

  const [created] = await database
    .insert(enquiriesTable)
    .values({
      ownerUserId,
      customerName: details.customerName ?? "Phone Enquiry",
      customerEmail: details.customerEmail,
      customerPhone: details.customerPhone,
      projectType: details.projectType,
      location: details.postcode,
      description: details.description,
      budget: details.budget,
      timescale: details.timescale,
      channel: "phone",
      status: "new_enquiry",
    })
    .returning();
  return { enquiry: created, created: true, details };
}

function buildFollowUpNotes(details: EnquiryDetails & { semanticCandidate?: { email: string; confidence: string; evidence: string } }): string | null {
  if (!details.emailNeedsConfirmation) return null;
  if (details.semanticCandidate) {
    return `${EMAIL_NEEDS_CONFIRMATION_NOTE} Possible candidate from AI review (unconfirmed, ${details.semanticCandidate.confidence} confidence): ${details.semanticCandidate.email}.`;
  }
  return EMAIL_NEEDS_CONFIRMATION_NOTE;
}

async function processCompletedCall(call: VapiCallData, ownerUserId: string) {
  // Cheap pre-check outside any transaction: a duplicated/retried webhook
  // delivery for a call we've already processed should never pay for
  // transcript extraction (and possibly an LLM call) below.
  const [alreadyProcessed] = await db
    .select()
    .from(aiCallsTable)
    .where(and(
      eq(aiCallsTable.providerId, "vapi"),
      eq(aiCallsTable.providerCallId, call.providerCallId),
    ))
    .limit(1);
  if (alreadyProcessed) return { call: alreadyProcessed, duplicated: true };

  // Email resolution can call out to an LLM (the semantic fallback in
  // services/vapi-email.ts). Resolve it before opening a DB transaction so
  // that network call never holds a transaction/connection open.
  const details = await detailsFromCall(call);

  const result = await db.transaction(async (tx: any) => {
    let claimed: any;
    try {
      [claimed] = await tx
        .insert(aiCallsTable)
      .values({
        ownerUserId,
        callStatus: call.callStatus,
        callerPhone: call.callerPhone,
        callerName: call.callerName,
        durationSeconds: call.durationSeconds,
        callStartedAt: call.callStartedAt,
        callEndedAt: call.callEndedAt,
        collectedData: Object.keys(call.collectedData).length ? JSON.stringify(call.collectedData) : null,
        transcript: call.transcript,
        aiSummary: call.aiSummary,
        followUpRequired: true,
        providerId: "vapi",
        providerCallId: call.providerCallId,
        assistantId: call.assistantId,
        phoneNumberId: call.phoneNumberId,
        phoneNumber: call.phoneNumber,
        recordingUrl: call.recordingUrl,
        endedReason: call.endedReason,
        providerData: call.providerData,
      })
      .returning();
    } catch (error: any) {
      if (error?.code !== "23505") throw error;
      const [duplicate] = await tx
        .select()
        .from(aiCallsTable)
        .where(and(
          eq(aiCallsTable.providerId, "vapi"),
          eq(aiCallsTable.providerCallId, call.providerCallId),
        ))
        .limit(1);
      if (!duplicate) throw error;
      return { call: duplicate, duplicated: true };
    }

    const { enquiry, created } = await createOrUpdateEnquiry(call, ownerUserId, details, tx);
    await tx.insert(enquiryMessagesTable).values({
      enquiryId: enquiry.id,
      role: "customer",
      content: call.transcript ?? "No transcript supplied by Vapi.",
      channel: "phone",
      externalMessageId: `vapi:${call.providerCallId}`,
    });
    const [stored] = await tx
      .update(aiCallsTable)
      .set({
        enquiryId: enquiry.id,
        callerPhone: details.customerPhone ?? call.callerPhone,
        callerName: details.customerName ?? call.callerName,
        followUpNotes: buildFollowUpNotes(details),
      })
      .where(eq(aiCallsTable.id, claimed.id))
      .returning();
    return { call: stored, duplicated: false, enquiry, created };
  });

  if (!result.duplicated && result.created) {
    await handleEnquiryCompletion(result.enquiry, details);
  }
  return { call: result.call, duplicated: result.duplicated };
}

// Vapi delivers server events as POSTs. Configure a per-tenant Custom Credential
// in Vapi to send the secret saved in that tenant's Vapi integration settings.
router.post("/webhooks/vapi", async (req: Request, res: Response): Promise<void> => {
  const call = extractVapiCallData(req.body);
  if (!call) {
    req.log.warn("Rejected Vapi webhook without a call identity");
    res.status(400).json({ error: "Invalid Vapi call payload" });
    return;
  }

  const mapping = await findVapiBusiness(call.assistantId, call.phoneNumberId, call.phoneNumber);
  if (mapping.ambiguous) {
    req.log.error({ providerCallId: call.providerCallId }, "Rejected ambiguous Vapi tenant mapping");
    res.status(409).json({ error: "Ambiguous Vapi tenant mapping" });
    return;
  }
  if (!mapping.business) {
    req.log.warn({ providerCallId: call.providerCallId }, "Rejected Vapi webhook with no enabled mapping");
    res.status(403).json({ error: "Unknown Vapi phone mapping" });
    return;
  }

  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!verifyVapiWebhookAuthentication(mapping.business.config.webhookSecret, req.headers, rawBody)) {
    req.log.warn({ providerCallId: call.providerCallId }, "Rejected Vapi webhook authentication");
    res.status(403).json({ error: "Invalid webhook authentication" });
    return;
  }

  if (isVapiAssistantRequestEvent(req.body)) {
    // This is the last point before Vapi starts the assistant. A call already
    // accepted is never cut off; a subsequent call is denied after its final
    // billed duration pushes the tenant over its allowance.
    // Reserve one minute atomically. A started call is allowed to finish; its
    // exact provider seconds are recorded at completion and converted only when
    // checking/displaying the minute allowance.
    const access = await reserveMeteredFeature(
      mapping.business.ownerUserId, "ai_receptionist", `vapi_call:${call.providerCallId}`, 1,
    );
    if (!access.allowed) {
      res.status(402).json(access.error);
      return;
    }
    const { assistantId } = mapping.business.config;
    if (!assistantId) {
      if ("companyId" in access) {
        await releaseUsageReservation(
          access.companyId,
          mapping.business.ownerUserId,
          `vapi_call:${call.providerCallId}`,
        );
      }
      req.log.error(
        { providerCallId: call.providerCallId },
        "Rejected Vapi assistant-request: mapped tenant has no assistantId configured",
      );
      res.status(200).json({ error: "This line is not fully configured yet. Please try again shortly." });
      return;
    }

    // The assistant's prompt/firstMessage use {{businessName}}, {{tradeType}}, {{serviceArea}}
    // Liquid template variables. Vapi only fills these in from assistantOverrides.variableValues
    // supplied in this response — resolving assistantId alone leaves them at their prompt-defined
    // defaults (e.g. "this business"), so the tenant's company profile must be attached here too.
    const [company] = await db
      .select({ name: companiesTable.name, tradeType: companiesTable.tradeType, serviceArea: companiesTable.serviceArea })
      .from(companiesTable)
      .where(eq(companiesTable.ownerUserId, mapping.business.ownerUserId))
      .limit(1);
    const variableValues: Record<string, string> = {};
    if (company?.name) variableValues.businessName = company.name;
    if (company?.tradeType) variableValues.tradeType = company.tradeType;
    if (company?.serviceArea) variableValues.serviceArea = company.serviceArea;

    req.log.info(
      { providerCallId: call.providerCallId, assistantId, variableValues },
      "Resolved Vapi assistant-request",
    );
    res.status(200).json({
      assistantId,
      ...(Object.keys(variableValues).length ? { assistantOverrides: { variableValues } } : {}),
    });
    return;
  }

  if (!isVapiEndOfCallEvent(req.body)) {
    res.status(200).json({ received: true, ignored: true });
    return;
  }

  const result = await processCompletedCall(call, mapping.business.ownerUserId);
  if (!result.duplicated && call.callStatus === "completed" && (call.durationSeconds ?? 0) > 0) {
    const [company] = await db.select({ id: companiesTable.id }).from(companiesTable)
      .where(eq(companiesTable.ownerUserId, mapping.business.ownerUserId)).limit(1);
    if (company) await recordUsage({
      companyId: company.id, ownerUserId: mapping.business.ownerUserId,
      featureCode: "ai_receptionist", usageCategory: "ai_receptionist_seconds", quantity: call.durationSeconds!,
      unit: "seconds", source: "vapi", providerReference: call.providerCallId,
      dedupeKey: `vapi_call:${call.providerCallId}`,
      metadata: { provider: "vapi", providerCallId: call.providerCallId, unit: "seconds" },
    });
    if (company) await finalizeUsageReservation(company.id, mapping.business.ownerUserId, `vapi_call:${call.providerCallId}`);
  } else if ((call.durationSeconds ?? 0) <= 0) {
    const [company] = await db.select({ id: companiesTable.id }).from(companiesTable)
      .where(eq(companiesTable.ownerUserId, mapping.business.ownerUserId)).limit(1);
    if (company) await releaseUsageReservation(company.id, mapping.business.ownerUserId, `vapi_call:${call.providerCallId}`);
  }
  req.log.info({
    providerCallId: call.providerCallId,
    enquiryId: result.call.enquiryId,
    duplicated: result.duplicated,
  }, "Processed Vapi completed call");
  res.status(200).json({ received: true, callId: result.call.id, duplicated: result.duplicated });
});

export { processCompletedCall };
export default router;