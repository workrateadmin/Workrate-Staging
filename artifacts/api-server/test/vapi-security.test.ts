import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import express from "express";
import { randomUUID } from "node:crypto";
import { createServer, request } from "node:http";
import { and, eq } from "drizzle-orm";
import { billingUsageEventsTable, billingUsageReservationsTable, companiesTable, companySubscriptionsTable, db, integrationsTable } from "@workspace/db";
import vapiRouter from "../src/routes/webhooks-vapi";
import { encryptIntegrationSecret } from "../src/lib/integration-secret";
import {
  extractVapiCallData,
  classifyCanonicalVapiCall,
  canonicalTenantIdentityMatches,
  fetchCanonicalVapiCall,
  canonicalCallLedgerPlan,
  isVapiAssistantRequestEvent,
  isVapiEndOfCallEvent,
  normalizePhone,
  parseVapiIntegrationConfig,
  verifyVapiWebhookAuthentication,
} from "../src/services/vapi";

const payload = {
  message: {
    type: "end-of-call-report",
    call: {
      id: "call_vapi_regression_1",
      assistantId: "assistant_test",
      phoneNumberId: "phone_number_test",
      status: "ended",
      startedAt: "2026-08-22T10:00:00.000Z",
      endedAt: "2026-08-22T10:03:30.000Z",
      customer: { number: "+44 7700 900123", name: "Sam Caller" },
    },
    artifact: {
      transcript: "Assistant: How can I help?\nCaller: I need a kitchen quote.",
      recordingUrl: "https://storage.vapi.ai/recordings/call_vapi_regression_1.wav",
    },
    analysis: {
      summary: "Caller requested a kitchen quote.",
      structuredData: { projectType: "Kitchen installation", postcode: "SW1A 1AA" },
    },
  },
};

test("Vapi webhook authentication accepts a configured secret or raw-body HMAC only", () => {
  const secret = "vapi-regression-secret-at-least-16";
  const rawBody = Buffer.from(JSON.stringify(payload));
  const signature = createHmac("sha256", secret).update(rawBody).digest("hex");

  assert.equal(verifyVapiWebhookAuthentication(secret, { "x-vapi-secret": secret }, rawBody), true);
  assert.equal(verifyVapiWebhookAuthentication(secret, { authorization: `Bearer ${secret}` }, rawBody), true);
  assert.equal(verifyVapiWebhookAuthentication(secret, { "x-vapi-signature": `sha256=${signature}` }, rawBody), true);
  assert.equal(verifyVapiWebhookAuthentication(secret, { "x-vapi-secret": "wrong-secret" }, rawBody), false);
  assert.equal(verifyVapiWebhookAuthentication(secret, {}, rawBody), false);
});

test("Vapi end-of-call reports keep the provider identity, raw transcript, and supplied structured fields", () => {
  assert.equal(isVapiEndOfCallEvent(payload), true);
  const call = extractVapiCallData(payload);
  assert.ok(call);
  assert.equal(call.providerCallId, "call_vapi_regression_1");
  assert.equal(call.callerPhone, "+44 7700 900123");
  assert.equal(call.durationSeconds, 210);
  assert.equal(call.transcript, payload.message.artifact.transcript);
  assert.equal(call.collectedData.projectType, "Kitchen installation");
  assert.equal(call.recordingUrl, payload.message.artifact.recordingUrl);
});

test("Vapi ignores incomplete updates and normalizes caller numbers for conservative matching", () => {
  assert.equal(isVapiEndOfCallEvent({ message: { type: "status-update", call: { id: "call_x", status: "ringing" } } }), false);
  assert.equal(normalizePhone("+44 7700 900123"), "447700900123");
  assert.equal(normalizePhone("short"), null);
});

test("Vapi assistant-request events are detected and resolved to the mapped assistant ID", () => {
  const assistantRequestPayload = {
    message: {
      type: "assistant-request",
      call: {
        id: "call_vapi_assistant_request_1",
        phoneNumberId: "phone_number_test",
        phoneNumber: { number: "+442045771693" },
      },
    },
  };

  assert.equal(isVapiAssistantRequestEvent(assistantRequestPayload), true);
  assert.equal(isVapiEndOfCallEvent(assistantRequestPayload), false);
  assert.equal(isVapiAssistantRequestEvent(payload), false);

  const call = extractVapiCallData(assistantRequestPayload);
  assert.ok(call);
  assert.equal(call.providerCallId, "call_vapi_assistant_request_1");
  assert.equal(call.assistantId, null);
  assert.equal(call.phoneNumberId, "phone_number_test");
});

test("Vapi tenant mappings parse the JSON config persisted by the integrations route", () => {
  const config = parseVapiIntegrationConfig(JSON.stringify({
    assistantId: "assistant_saved",
    phoneNumberId: "phone_saved",
    encryptedWebhookSecret: "v1.example",
    enabled: true,
  }));
  assert.equal(config.assistantId, "assistant_saved");
  assert.equal(config.phoneNumberId, "phone_saved");
  assert.equal(config.encryptedWebhookSecret, "v1.example");
  assert.equal(parseVapiIntegrationConfig("{invalid").assistantId, undefined);
});

test("canonical Vapi terminal classification is fail-closed and requires tenant identity", () => {
  assert.equal(classifyCanonicalVapiCall({ status: "completed", endedReason: null }), "billable_completed");
  assert.equal(classifyCanonicalVapiCall({ status: "completed", endedReason: "provider-error" }), "non_billable");
  assert.equal(classifyCanonicalVapiCall({ status: "mystery-new-status", endedReason: null }), "non_billable");
  assert.equal(canonicalTenantIdentityMatches({ assistantId: null, phoneNumberId: null, phoneNumber: null }, 3, 3), false);
  assert.equal(canonicalTenantIdentityMatches({ assistantId: "assistant_3", phoneNumberId: null, phoneNumber: null }, 3, 4), false);
  assert.equal(canonicalTenantIdentityMatches({ assistantId: "assistant_3", phoneNumberId: null, phoneNumber: null }, 3, 3), true);
});

test("charged failed canonical calls release without customer duration while completed calls finalize", () => {
  assert.deepEqual(canonicalCallLedgerPlan({ status: "failed", endedReason: "provider-error", durationSeconds: 10 }),
    { recordProviderCost: true, recordCustomerDuration: false, reservationAction: "release" });
  assert.deepEqual(canonicalCallLedgerPlan({ status: "completed", endedReason: null, durationSeconds: 10 }),
    { recordProviderCost: true, recordCustomerDuration: true, reservationAction: "finalize" });
});

test("canonical Vapi cost parser uses only GET data and retains numeric components", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.VAPI_PRIVATE_KEY;
  process.env.VAPI_PRIVATE_KEY = "test-private-key";
  globalThis.fetch = async () => new Response(JSON.stringify({
    id: "call-canonical-cost", assistantId: "assistant_test", phoneNumberId: "phone_number_test",
    status: "ended", endedReason: "customer-ended-call", startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: "2026-01-01T00:00:12.000Z", cost: 0.1234,
    costBreakdown: { transport: 0.1, invalid: "not-a-number", currency: "USD" },
    costs: [{ llm: 0.0234, transcript: "must never be retained" }],
    transcript: "must never be returned",
  }), { status: 200 });
  try {
    const call = await fetchCanonicalVapiCall("call-canonical-cost");
    assert.equal(call.cost.amount, 0.1234);
    assert.equal(call.cost.currency, "USD");
    assert.deepEqual(call.cost.components, { transport: 0.1, "costs.0.llm": 0.0234 });
    assert.equal(call.endedReason, "customer-ended-call");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.VAPI_PRIVATE_KEY;
    else process.env.VAPI_PRIVATE_KEY = originalKey;
  }
});

test("Vapi Express webhook route finalizes completed calls once and records charged failures without duration", async () => {
  const owner = `vapi-route-${randomUUID()}`;
  const secret = "route-webhook-secret";
  process.env.SESSION_SECRET ??= "route-test-session-secret";
  process.env.VAPI_PRIVATE_KEY = "route-test-private-key";
  let companyId: number | undefined;
  let companyBId: number | undefined;
  const app = express();
  app.use((req, _res, next) => { (req as any).log = { warn() {}, error() {}, info() {} }; next(); });
  app.use(express.json({ verify: (req, _res, buffer) => { (req as any).rawBody = buffer; } }));
  app.use(vapiRouter);
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const post = (body: unknown) => new Promise<{ status: number }>((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = request({ port, path: "/webhooks/vapi", method: "POST", headers: { "content-type": "application/json", "content-length": Buffer.byteLength(data), "x-vapi-secret": secret } },
      (res) => { res.resume(); res.on("end", () => resolve({ status: res.statusCode! })); });
    req.on("error", reject); req.end(data);
  });
  const originalFetch = globalThis.fetch;
  try {
    const [company] = await db.insert(companiesTable).values({ ownerUserId: owner, name: owner }).returning();
    companyId = company.id;
    const startsAt = new Date(Date.now() - 60_000), endsAt = new Date(Date.now() + 86_400_000);
    await db.insert(companySubscriptionsTable).values({ companyId, ownerUserId: owner, planCode: "complete", addOnCodes: [], status: "active", provider: "stripe", providerSubscriptionId: `sub-${owner}`, currentPeriodStartsAt: startsAt, currentPeriodEndsAt: endsAt });
    await db.insert(integrationsTable).values({ ownerUserId: owner, provider: "vapi", status: "connected", config: JSON.stringify({ assistantId: `assistant-${owner}`, phoneNumberId: `phone-${owner}`, enabled: true, encryptedWebhookSecret: encryptIntegrationSecret(secret) }) });
    const ownerB = `vapi-route-b-${randomUUID()}`;
    const [companyB] = await db.insert(companiesTable).values({ ownerUserId: ownerB, name: ownerB }).returning();
    companyBId = companyB.id;
    await db.insert(integrationsTable).values({ ownerUserId: ownerB, provider: "vapi", status: "connected", config: JSON.stringify({ assistantId: `assistant-${ownerB}`, phoneNumberId: `phone-${ownerB}`, enabled: true, encryptedWebhookSecret: encryptIntegrationSecret("tenant-b-secret") }) });
    const assistantPayload = { message: { type: "assistant-request", call: { id: "route-complete", assistantId: `assistant-${owner}`, phoneNumberId: `phone-${owner}` } } };
    assert.equal((await post(assistantPayload)).status, 200);
    globalThis.fetch = async (url) => {
      const id = String(url).split("/").pop()!;
      const canonicalOwner = id === "route-cross-tenant" ? ownerB : owner;
      return new Response(JSON.stringify({ id, assistantId: `assistant-${canonicalOwner}`, phoneNumberId: `phone-${canonicalOwner}`, status: id.includes("failed") ? "failed" : "completed", endedReason: id.includes("failed") ? "provider-error" : "customer-ended-call", startedAt: new Date(Date.now() - 10_000).toISOString(), endedAt: new Date().toISOString(), cost: 0.2 }), { status: 200 });
    };
    const end = (id: string) => ({ message: { type: "end-of-call-report", call: { id, assistantId: `assistant-${owner}`, phoneNumberId: `phone-${owner}`, status: "ended" } } });
    assert.equal((await post(end("route-complete"))).status, 200);
    assert.equal((await post(end("route-complete"))).status, 200);
    const completeEvents = await db.select().from(billingUsageEventsTable).where(eq(billingUsageEventsTable.companyId, companyId));
    assert.equal(completeEvents.filter((row) => row.usageCategory === "ai_receptionist_seconds").length, 1);
    assert.equal(completeEvents.filter((row) => row.usageCategory === "vapi_provider_cost").length, 1);
    assert.equal((await db.select().from(billingUsageReservationsTable).where(and(eq(billingUsageReservationsTable.companyId, companyId), eq(billingUsageReservationsTable.dedupeKey, "vapi_call:route-complete"))))[0].status, "finalized");
    assert.equal((await post({ message: { type: "assistant-request", call: { id: "route-failed", assistantId: `assistant-${owner}`, phoneNumberId: `phone-${owner}` } } })).status, 200);
    assert.equal((await post(end("route-failed"))).status, 200);
    const failedEvents = await db.select().from(billingUsageEventsTable).where(and(eq(billingUsageEventsTable.companyId, companyId), eq(billingUsageEventsTable.providerReference, "route-failed")));
    assert.equal(failedEvents.filter((row) => row.usageCategory === "vapi_provider_cost").length, 1);
    assert.equal(failedEvents.filter((row) => row.usageCategory === "ai_receptionist_seconds").length, 0);
    assert.equal((await db.select().from(billingUsageReservationsTable).where(eq(billingUsageReservationsTable.dedupeKey, "vapi_call:route-failed")))[0].status, "released");
    assert.equal((await post(end("route-cross-tenant"))).status, 403);
    const crossRows = await db.select().from(billingUsageEventsTable).where(eq(billingUsageEventsTable.providerReference, "route-cross-tenant"));
    assert.equal(crossRows.length, 0, "cross-tenant canonical identity writes neither tenant ledger");
  } finally {
    globalThis.fetch = originalFetch;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (companyId) await db.delete(companiesTable).where(eq(companiesTable.id, companyId));
    if (companyBId) await db.delete(companiesTable).where(eq(companiesTable.id, companyBId));
  }
});