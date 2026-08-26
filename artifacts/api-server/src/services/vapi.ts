import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, integrationsTable } from "@workspace/db";
import { decryptIntegrationSecret } from "../lib/integration-secret";

export type VapiIntegrationConfig = {
  assistantId?: string;
  phoneNumberId?: string;
  phoneNumber?: string;
  encryptedWebhookSecret?: string;
  enabled?: boolean;
};

export type VapiBusiness = {
  integrationId: number;
  ownerUserId: string;
  config: VapiIntegrationConfig & { webhookSecret: string };
};

export type VapiCallData = {
  providerCallId: string;
  assistantId: string | null;
  phoneNumberId: string | null;
  phoneNumber: string | null;
  callerPhone: string | null;
  callerName: string | null;
  callStartedAt: Date | null;
  callEndedAt: Date | null;
  durationSeconds: number | null;
  callStatus: "completed" | "dropped" | "missed" | "transferred";
  endedReason: string | null;
  transcript: string | null;
  aiSummary: string | null;
  collectedData: Record<string, string>;
  recordingUrl: string | null;
  providerData: string;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function parseVapiIntegrationConfig(value: unknown): VapiIntegrationConfig {
  if (typeof value !== "string") return asRecord(value) as VapiIntegrationConfig;
  try {
    return asRecord(JSON.parse(value)) as VapiIntegrationConfig;
  } catch {
    return {};
  }
}

function nested(record: Record<string, unknown>, key: string): Record<string, unknown> {
  return asRecord(record[key]);
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    const parsed = asString(value);
    if (parsed) return parsed;
  }
  return null;
}

function parseDate(value: unknown): Date | null {
  const text = asString(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeRole(value: unknown): "ai" | "caller" {
  const role = String(value ?? "").toLowerCase();
  return ["assistant", "bot", "ai", "system"].includes(role) ? "ai" : "caller";
}

function normalizeTranscriptMessages(value: unknown): Array<{ role: "ai" | "caller"; content: string; ts?: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const message = asRecord(entry);
    const content = firstString(message.content, message.message, message.text);
    if (!content) return [];
    const timestamp = firstString(message.time, message.timestamp, message.createdAt);
    return [{
      role: normalizeRole(message.role),
      content,
      ...(timestamp ? { ts: timestamp } : {}),
    }];
  });
}

function stringField(data: Record<string, unknown>, ...keys: string[]): string | null {
  return firstString(...keys.flatMap((key) => [data[key], nested(data, "customer")[key]]));
}

export function normalizePhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 ? digits : null;
}

export function isVapiAssistantRequestEvent(payload: unknown): boolean {
  const body = asRecord(payload);
  const message = nested(body, "message");
  const eventType = String(message.type ?? body.type ?? "").toLowerCase();
  return eventType === "assistant-request";
}

export function isVapiEndOfCallEvent(payload: unknown): boolean {
  const body = asRecord(payload);
  const message = nested(body, "message");
  const eventType = String(message.type ?? body.type ?? "").toLowerCase();
  if (["end-of-call-report", "call-ended", "end-of-call"].includes(eventType)) return true;

  const call = nested(message, "call");
  const status = String(call.status ?? "").toLowerCase();
  return ["ended", "completed"].includes(status) && Boolean(call.id);
}

export function extractVapiCallData(payload: unknown): VapiCallData | null {
  const body = asRecord(payload);
  const message = Object.keys(nested(body, "message")).length ? nested(body, "message") : body;
  const call = nested(message, "call");
  const artifact = nested(message, "artifact");
  const analysis = nested(message, "analysis");
  const callAnalysis = nested(call, "analysis");
  const customer = nested(message, "customer");
  const callCustomer = nested(call, "customer");
  const phoneNumber = nested(message, "phoneNumber");
  const callPhoneNumber = nested(call, "phoneNumber");
  const assistant = nested(message, "assistant");

  const providerCallId = firstString(call.id, message.callId, body.callId);
  if (!providerCallId) return null;

  const startedAt = parseDate(firstString(call.startedAt, call.createdAt, message.timestamp));
  const endedAt = parseDate(firstString(call.endedAt, call.updatedAt, message.timestamp));
  const durationMs = Number(call.duration ?? call.durationMs ?? 0);
  const durationSeconds = Number.isFinite(durationMs) && durationMs > 0
    ? Math.round(durationMs > 10_000 ? durationMs / 1_000 : durationMs)
    : (startedAt && endedAt ? Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1_000)) : null);
  const endedReason = firstString(call.endedReason, message.endedReason);
  const rawStatus = String(call.status ?? "").toLowerCase();
  const callStatus = rawStatus.includes("transfer")
    ? "transferred"
    : rawStatus.includes("miss")
      ? "missed"
      : rawStatus.includes("drop") || rawStatus.includes("fail")
        ? "dropped"
        : "completed";

  const rawTranscript = firstString(artifact.transcript, message.transcript, call.transcript);
  const transcriptMessages = normalizeTranscriptMessages(
    artifact.messages ?? message.messages ?? call.messages,
  );
  const transcript = rawTranscript ?? (
    transcriptMessages.length ? JSON.stringify(transcriptMessages) : null
  );

  const structured = asRecord(
    analysis.structuredData
    ?? callAnalysis.structuredData
    ?? artifact.structuredData
    ?? message.structuredData,
  );
  const collectedData = {
    ...Object.fromEntries(
      Object.entries(structured)
        .filter(([, value]) => typeof value === "string" && value.trim())
        .map(([key, value]) => [key, (value as string).trim()]),
    ),
  };

  const recording = nested(artifact, "recording");
  const recordingUrl = firstString(
    artifact.recordingUrl,
    artifact.stereoRecordingUrl,
    recording.url,
    message.recordingUrl,
  );

  return {
    providerCallId,
    assistantId: firstString(call.assistantId, message.assistantId, assistant.id),
    phoneNumberId: firstString(call.phoneNumberId, message.phoneNumberId, phoneNumber.id, callPhoneNumber.id),
    phoneNumber: firstString(phoneNumber.number, callPhoneNumber.number, call.phoneNumber),
    callerPhone: firstString(callCustomer.number, customer.number, call.customerNumber, message.customerNumber),
    callerName: firstString(callCustomer.name, customer.name, call.customerName, message.customerName),
    callStartedAt: startedAt,
    callEndedAt: endedAt,
    durationSeconds,
    callStatus,
    endedReason,
    transcript,
    aiSummary: firstString(analysis.summary, callAnalysis.summary, artifact.summary, message.summary),
    collectedData,
    recordingUrl,
    providerData: JSON.stringify({
      eventType: message.type ?? body.type ?? null,
      call: {
        id: providerCallId,
        status: call.status ?? null,
        endedReason,
      },
    }),
  };
}

function equalsSecret(expected: string, supplied: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifyVapiWebhookAuthentication(
  secret: string,
  headers: Record<string, string | string[] | undefined>,
  rawBody: Buffer | undefined,
): boolean {
  const direct = firstString(
    headers["x-vapi-secret"],
    headers["x-webhook-secret"],
    headers["x-workrate-webhook-secret"],
  );
  if (direct && equalsSecret(secret, direct)) return true;

  const authorization = firstString(headers.authorization);
  if (authorization?.startsWith("Bearer ") && equalsSecret(secret, authorization.slice(7))) return true;

  const signature = firstString(headers["x-vapi-signature"]);
  if (!signature || !rawBody) return false;
  const digest = createHmac("sha256", secret).update(rawBody).digest("hex");
  return equalsSecret(digest, signature.replace(/^sha256=/, ""));
}

export async function findVapiBusiness(
  assistantId: string | null,
  phoneNumberId: string | null,
  phoneNumber: string | null,
): Promise<{ business: VapiBusiness | null; ambiguous: boolean }> {
  const rows = await db
    .select()
    .from(integrationsTable)
    .where(and(
      eq(integrationsTable.provider, "vapi"),
      eq(integrationsTable.status, "connected"),
    ));

  const normalizedPhone = normalizePhone(phoneNumber);
  const matches = rows.flatMap((row) => {
    const config = parseVapiIntegrationConfig(row.config);
    const configuredPhone = normalizePhone(config.phoneNumber);
    const matchesAssistant = Boolean(assistantId && config.assistantId === assistantId);
    const matchesPhoneId = Boolean(phoneNumberId && config.phoneNumberId === phoneNumberId);
    const matchesPhone = Boolean(normalizedPhone && configuredPhone === normalizedPhone);
    if (!row.ownerUserId || !config.encryptedWebhookSecret || config.enabled === false || !(matchesAssistant || matchesPhoneId || matchesPhone)) {
      return [];
    }
    let webhookSecret: string;
    try {
      webhookSecret = decryptIntegrationSecret(config.encryptedWebhookSecret);
    } catch {
      return [];
    }
    return [{
      integrationId: row.id,
      ownerUserId: row.ownerUserId,
      config: { ...config, webhookSecret },
    }];
  });

  return {
    business: matches.length === 1 ? matches[0] : null,
    ambiguous: matches.length > 1,
  };
}