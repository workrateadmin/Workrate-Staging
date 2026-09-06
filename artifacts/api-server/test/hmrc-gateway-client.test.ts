import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  checkHmrcGatewayAuthentication,
  createHmrcGatewayAttestationGrant,
  submitViaHmrcSandboxGateway,
  validateFraudHeadersViaGateway,
} from "../src/lib/hmrc-gateway";

const gatewayUrl = "https://gateway.example.test";
const secret = "a-secure-test-secret-that-is-longer-than-32-bytes";
const originalFetch = globalThis.fetch;
process.env.HMRC_GATEWAY_URL = gatewayUrl;
process.env.HMRC_GATEWAY_HMAC_SECRET = secret;

test.after(() => { globalThis.fetch = originalFetch; });

test("attestation grants are short-lived, signed, and identity-bound", () => {
  const grant = createHmrcGatewayAttestationGrant({ userId: "user-1", companyId: 7, sessionId: "session-1" });
  const [header, payload, signature] = grant.grant.split(".");
  assert.equal(signature, createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url"));
  const decoded = JSON.parse(Buffer.from(payload!, "base64url").toString("utf8"));
  assert.deepEqual({ userId: decoded.userId, companyId: decoded.companyId, sessionId: decoded.sessionId }, { userId: "user-1", companyId: 7, sessionId: "session-1" });
  assert.ok(Date.parse(grant.expiresAt) - decoded.issuedAt <= 120_000);
});

test("gateway calls sign timestamp, UUID, method, path and exact body", async () => {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const body = String(init?.body);
    const canonical = `${headers.get("x-workrate-timestamp")}\n${headers.get("x-workrate-request-id")}\nPOST\n/v1/hmrc/sandbox/validate-fraud\n${body}`;
    assert.equal(headers.get("x-workrate-signature"), `sha256=${createHmac("sha256", secret).update(canonical).digest("base64url")}`);
    assert.equal(headers.get("x-workrate-attestation"), "opaque-attestation");
    assert.equal(String(input), `${gatewayUrl}/v1/hmrc/sandbox/validate-fraud`);
    return new Response(JSON.stringify({ status: "pass", checkedAt: new Date().toISOString(), issues: [] }), { status: 200 });
  }) as typeof fetch;
  const result = await validateFraudHeadersViaGateway({
    userId: "user-1", companyId: 7, sessionId: "session-1",
    attestation: "opaque-attestation", browserContext: { deviceId: "device" },
  });
  assert.equal(result.confirmed, true);
});

test("authentication probe proves HMAC acceptance without browser evidence", async () => {
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const body = String(init?.body);
    const canonical = `${headers.get("x-workrate-timestamp")}\n${headers.get("x-workrate-request-id")}\nPOST\n/v1/hmrc/sandbox/read\n${body}`;
    assert.equal(headers.get("x-workrate-signature"), `sha256=${createHmac("sha256", secret).update(canonical).digest("base64url")}`);
    assert.equal(headers.has("x-workrate-attestation"), false);
    return new Response(JSON.stringify({ code: "invalid_attestation" }), { status: 401 });
  }) as typeof fetch;
  assert.deepEqual(await checkHmrcGatewayAuthentication(), { authenticated: true });
});

test("malformed and failed submission responses never become submitted", async () => {
  const input = {
    userId: "user-1", companyId: 7, sessionId: "session-1", idempotencyKey: "123",
    payloadHash: "hash", accessToken: "token", taxpayerId: "AA000000A",
    businessId: "business", taxYear: "2026-27", periodStart: "2026-04-06",
    periodEnd: "2026-07-05", quarterlyPayload: {}, attestation: "opaque",
    browserContext: {},
  };
  globalThis.fetch = (async () => new Response(JSON.stringify({ confirmed: true }), { status: 200 })) as typeof fetch;
  assert.equal((await submitViaHmrcSandboxGateway(input)).confirmed, false);
  globalThis.fetch = (async () => { throw new Error("network exploded"); }) as typeof fetch;
  const unavailable = await submitViaHmrcSandboxGateway(input);
  assert.equal(unavailable.confirmed, false);
  assert.equal(unavailable.safeError, "HMRC sandbox gateway could not be reached. Retry later.");
});