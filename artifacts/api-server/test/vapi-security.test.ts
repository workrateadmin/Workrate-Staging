import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  extractVapiCallData,
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