import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, aiCallsTable, companiesTable, enquiriesTable, enquiryMessagesTable } from "@workspace/db";
import { handleEnquiryCompletion } from "./chat";
import {
  extractVapiCallData,
  findVapiBusiness,
  isVapiEndOfCallEvent,
  normalizePhone,
  verifyVapiWebhookAuthentication,
  type VapiCallData,
} from "../services/vapi";

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
};

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function detailsFromCall(call: VapiCallData): EnquiryDetails {
  const data = call.collectedData;
  const location = firstString(data.location, data.address, data.postcode);
  return {
    customerName: firstString(data.customerName, data.name, call.callerName),
    customerEmail: firstString(data.customerEmail, data.email),
    customerPhone: firstString(data.customerPhone, data.phone, call.callerPhone),
    postcode: location,
    projectType: firstString(data.projectType, data.jobType, data.project),
    measurements: firstString(data.measurements, data.dimensions),
    materials: firstString(data.materials),
    finish: firstString(data.finish),
    budget: firstString(data.budget),
    timescale: firstString(data.timescale, data.timing),
    description: firstString(data.description, data.requirements, data.notes),
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

async function createOrUpdateEnquiry(call: VapiCallData, ownerUserId: string, database: any = db) {
  const details = detailsFromCall(call);
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

async function processCompletedCall(call: VapiCallData, ownerUserId: string) {
  const result = await db.transaction(async (tx: any) => {
    const [existing] = await tx
      .select()
      .from(aiCallsTable)
      .where(and(
        eq(aiCallsTable.providerId, "vapi"),
        eq(aiCallsTable.providerCallId, call.providerCallId),
      ))
      .limit(1);
    if (existing) return { call: existing, duplicated: true };

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

    const { enquiry, created, details } = await createOrUpdateEnquiry(call, ownerUserId, tx);
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
      })
      .where(eq(aiCallsTable.id, claimed.id))
      .returning();
    return { call: stored, duplicated: false, enquiry, created, details };
  });

  if (!result.duplicated && result.created) {
    await handleEnquiryCompletion(result.enquiry, result.details);
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

  if (!isVapiEndOfCallEvent(req.body)) {
    res.status(200).json({ received: true, ignored: true });
    return;
  }

  const result = await processCompletedCall(call, mapping.business.ownerUserId);
  req.log.info({
    providerCallId: call.providerCallId,
    enquiryId: result.call.enquiryId,
    duplicated: result.duplicated,
  }, "Processed Vapi completed call");
  res.status(200).json({ received: true, callId: result.call.id, duplicated: result.duplicated });
});

export { processCompletedCall };
export default router;