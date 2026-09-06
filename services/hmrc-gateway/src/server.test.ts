import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import test from "node:test";
import { createGateway, observedNetworkEvidence, type GatewayDeps } from "./server.js";

const secret = "workrate-gateway-test-secret", attestSecret = "attestation-test-secret";
const baseEnv = {
  WORKRATE_GATEWAY_HMAC_SECRET: secret,
  GATEWAY_ATTESTATION_SECRET: attestSecret,
  HMRC_SANDBOX_CLIENT_ID: "sandbox-client-id",
  HMRC_SANDBOX_CLIENT_SECRET: "sandbox-client-secret",
  GATEWAY_PUBLIC_IP: "203.0.113.5",
  GATEWAY_VERSION: "test",
  WORKRATE_BROWSER_ORIGINS: "https://app.example.test",
  HMRC_SANDBOX_QUARTERLY_PATH_TEMPLATE: "/sandbox/{nino}/{businessId}/{taxYear}/{periodStart}/{periodEnd}",
  HMRC_SANDBOX_QUARTERLY_METHOD: "PUT",
  HMRC_SANDBOX_ACCEPT: "application/vnd.hmrc.1.0+json",
  HMRC_FRAUD_APPROVED_OMISSIONS: "client-public-port,client-multi-factor,vendor-license-ids",
};
const browser = {
  browserUserAgent: "test-browser",
  deviceId: "123e4567-e89b-42d3-a456-426614174000",
  timezone: "UTC+00:00",
  screens: [{ width: 1280, height: 720, colourDepth: 24, scalingFactor: 1 }],
  windowSize: { width: 1200, height: 700 },
};
const b64 = (value: string) => Buffer.from(value).toString("base64url");
const mac = (value: string, key = secret) => createHmac("sha256", key).update(value).digest("base64url");
const token = (payload: object, key = secret) => {
  const header = b64(JSON.stringify({ alg: "HS256", typ: "TEST" }));
  const body = b64(JSON.stringify(payload));
  return `${header}.${body}.${mac(`${header}.${body}`, key)}`;
};

async function withServer(
  run: (base: string, logs: object[]) => Promise<void>,
  deps: GatewayDeps = {},
) {
  const logs: object[] = [];
  const server = createGateway({ env: baseEnv, log: value => logs.push(value), ...deps });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    await run(`http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`, logs);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

async function attest(base: string, overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  const grant = token({
    version: 1, userId: "user-1", companyId: 1, sessionId: "session-1",
    nonce: randomUUID(), issuedAt: now, expiresAt: now + 60_000, ...overrides,
  });
  return fetch(`${base}/v1/attest`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "origin": "https://app.example.test",
      "x-gateway-observed-ip": "198.51.100.7",
      "x-gateway-observed-port": "51423",
    },
    body: JSON.stringify({ grant, browserContext: browser }),
  });
}

async function signedPost(base: string, path: string, value: Record<string, unknown>, attestation: string, options: { timestamp?: string; requestId?: string; signBody?: string } = {}) {
  const body = JSON.stringify(value);
  const timestamp = options.timestamp ?? String(Date.now());
  const requestId = options.requestId ?? randomUUID();
  const signature = `sha256=${mac(`${timestamp}\n${requestId}\nPOST\n${path}\n${options.signBody ?? body}`)}`;
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-workrate-timestamp": timestamp,
      "x-workrate-request-id": requestId,
      "x-workrate-signature": signature,
      "x-workrate-attestation": attestation,
    },
    body,
  });
}
const jsonBody = async <T extends Record<string, unknown>>(response: Response) => await response.json() as T;

test("issues a tenant/session-bound attestation and rejects grant replay", async () => withServer(async base => {
  const now = Date.now();
  const grant = token({ version: 1, userId: "user-1", companyId: 1, sessionId: "session-1", nonce: randomUUID(), issuedAt: now, expiresAt: now + 60_000 });
  const request = () => fetch(`${base}/v1/attest`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://app.example.test", "x-gateway-observed-ip": "198.51.100.7", "x-gateway-observed-port": "51423" },
    body: JSON.stringify({ grant, browserContext: browser }),
  });
  const first = await request();
  assert.equal(first.status, 201);
  assert.equal(typeof (await jsonBody<{ attestation: string }>(first)).attestation, "string");
  assert.equal((await request()).status, 409);
}));

test("accepts production-shaped proxy evidence and rejects missing or malformed evidence safely", async () => withServer(async base => {
  const valid = await attest(base);
  assert.equal(valid.status, 201);

  const now = Date.now();
  const grant = token({
    version: 1, userId: "user-1", companyId: 1, sessionId: "session-1",
    nonce: randomUUID(), issuedAt: now, expiresAt: now + 60_000,
  });
  const missing = await fetch(`${base}/v1/attest`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://app.example.test" },
    body: JSON.stringify({ grant, browserContext: browser }),
  });
  assert.equal(missing.status, 400);
  assert.equal((await jsonBody<{ code: string }>(missing)).code, "network_evidence_unavailable");

  const malformed = await fetch(`${base}/v1/attest`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://app.example.test",
      "x-gateway-observed-ip": "{remote_host}",
      "x-gateway-observed-port": "{remote_port}",
    },
    body: JSON.stringify({
      grant: token({
        version: 1, userId: "user-1", companyId: 1, sessionId: "session-1",
        nonce: randomUUID(), issuedAt: now, expiresAt: now + 60_000,
      }),
      browserContext: browser,
    }),
  });
  assert.equal(malformed.status, 400);
  assert.equal((await jsonBody<{ code: string }>(malformed)).code, "network_evidence_unavailable");
}));

test("ignores spoofed observed-network headers from a non-loopback peer", () => {
  assert.equal(observedNetworkEvidence("203.0.113.77", {
    "x-gateway-observed-ip": "198.51.100.7",
    "x-gateway-observed-port": "51423",
  }), null);
  assert.deepEqual(observedNetworkEvidence("127.0.0.1", {
    "x-gateway-observed-ip": "198.51.100.7",
    "x-gateway-observed-port": "51423",
  }), { ip: "198.51.100.7", port: 51423 });
});

test("rejects fake, expired, cross-tenant, and changed-browser evidence", async () => withServer(async base => {
  assert.equal((await fetch(`${base}/v1/attest`, { method: "POST", headers: { "content-type": "application/json", "x-gateway-observed-ip": "198.51.100.7" }, body: JSON.stringify({ grant: "fake.token.value", browserContext: browser }) })).status, 401);
  assert.equal((await attest(base, { issuedAt: 1, expiresAt: 2 })).status, 401);
  const response = await attest(base);
  const { attestation } = await jsonBody<{ attestation: string }>(response);
  const common = { userId: "user-1", companyId: 2, sessionId: "session-1", browserContext: browser };
  assert.equal((await signedPost(base, "/v1/hmrc/sandbox/validate-fraud", common, attestation)).status, 401);
  const second = await attest(base);
  const next = await jsonBody<{ attestation: string }>(second);
  assert.equal((await signedPost(base, "/v1/hmrc/sandbox/validate-fraud", { ...common, companyId: 1, browserContext: { ...browser, timezone: "UTC+01:00" } }, next.attestation)).status, 401);
}));

test("rejects stale, replayed, and body-mismatched HMAC requests", async () => withServer(async base => {
  const first = await attest(base); const { attestation } = await jsonBody<{ attestation: string }>(first);
  const value = { userId: "user-1", companyId: 1, sessionId: "session-1", browserContext: browser };
  assert.equal((await signedPost(base, "/v1/hmrc/sandbox/validate-fraud", value, attestation, { timestamp: String(Date.now() - 61_000) })).status, 401);
  const requestId = randomUUID();
  assert.equal((await signedPost(base, "/v1/hmrc/sandbox/validate-fraud", value, attestation, { requestId, signBody: "{}" })).status, 401);
  const valid = await signedPost(base, "/v1/hmrc/sandbox/validate-fraud", value, attestation, { requestId });
  assert.notEqual(valid.status, 401);
  assert.equal((await signedPost(base, "/v1/hmrc/sandbox/validate-fraud", value, attestation, { requestId })).status, 401);
}));

test("validates fraud headers with request-scoped app authentication", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fakeFetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input); calls.push({ url, init });
    if (url.endsWith("/oauth/token")) return new Response(JSON.stringify({ access_token: "app-token" }), { status: 200 });
    return new Response(JSON.stringify({ result: "PASS", issues: [] }), { status: 200 });
  };
  await withServer(async base => {
    const response = await attest(base); const { attestation } = await jsonBody<{ attestation: string }>(response);
    const result = await signedPost(base, "/v1/hmrc/sandbox/validate-fraud", { userId: "user-1", companyId: 1, sessionId: "session-1", browserContext: browser }, attestation);
    assert.equal(result.status, 200);
    assert.equal((await jsonBody<{ status: string }>(result)).status, "pass");
    assert.equal(calls[1]?.url.includes("test-api.service.hmrc.gov.uk/test/fraud-prevention-headers/validate"), true);
    assert.equal(JSON.stringify(calls).includes("api.service.hmrc.gov.uk"), true);
  }, { fetch: fakeFetch as typeof fetch });
});

test("reports unapproved fraud-evidence omissions without contacting HMRC", async () => {
  let hmrcCalls = 0;
  const fakeFetch = async () => {
    hmrcCalls += 1;
    return new Response(JSON.stringify({ result: "PASS", issues: [] }), { status: 200 });
  };
  await withServer(async base => {
    const response = await attest(base);
    const { attestation } = await jsonBody<{ attestation: string }>(response);
    const result = await signedPost(base, "/v1/hmrc/sandbox/validate-fraud", {
      userId: "user-1",
      companyId: 1,
      sessionId: "session-1",
      browserContext: browser,
    }, attestation);
    const body = await jsonBody<{
      code: string;
      status: string;
      message: string;
      issues: Array<{ header: string; message: string }>;
    }>(result);
    assert.equal(result.status, 422);
    assert.equal(body.code, "approved_omission_required");
    assert.equal(body.status, "unavailable");
    assert.equal(body.message, "Additional fraud-prevention evidence requires HMRC approval.");
    assert.deepEqual(body.issues, [
      { header: "Gov-Client-Multi-Factor", message: "OMISSION_REQUIRED" },
      { header: "Gov-Vendor-License-IDs", message: "OMISSION_REQUIRED" },
    ]);
    assert.equal(hmrcCalls, 0);
  }, {
    env: { ...baseEnv, HMRC_FRAUD_APPROVED_OMISSIONS: "client-public-port" },
    fetch: fakeFetch as typeof fetch,
  });
});

test("pins read operations and quarterly submission to configured sandbox targets", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fakeFetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input); calls.push({ url, init });
    if (url.endsWith("/oauth/token")) return new Response(JSON.stringify({ access_token: "app-token" }), { status: 200 });
    if (init?.method === "PUT") return new Response("{}", { status: 200, headers: { "x-correlationid": "sandbox-reference" } });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  await withServer(async base => {
    const readAttest = await attest(base); const readToken = (await jsonBody<{ attestation: string }>(readAttest)).attestation;
    const common = { userId: "user-1", companyId: 1, sessionId: "session-1", browserContext: browser, accessToken: "user-token", taxpayerId: "AA000000A" };
    assert.equal((await signedPost(base, "/v1/hmrc/sandbox/read", { ...common, operation: "business-details" }, readToken)).status, 200);
    assert.equal((await signedPost(base, "/v1/hmrc/sandbox/read", { ...common, operation: "https://production.example" }, readToken)).status, 400);
    const submitAttest = await attest(base); const submitToken = (await jsonBody<{ attestation: string }>(submitAttest)).attestation;
    const result = await signedPost(base, "/v1/hmrc/sandbox/submit", {
      ...common, idempotencyKey: randomUUID(), nino: "AA000000A", businessId: "XAIS12345678901",
      taxYear: "2026-27", periodStart: "2026-04-06", periodEnd: "2026-07-05", quarterlyPayload: { periodIncome: 100 },
    }, submitToken);
    assert.equal(result.status, 200);
    assert.equal((await jsonBody<{ reference: string }>(result)).reference, "sandbox-reference");
    assert.equal(calls.every(call => call.url.startsWith("https://test-api.service.hmrc.gov.uk")), true);
    assert.equal(calls.some(call => call.init?.method === "PUT"), true);
  }, { fetch: fakeFetch as typeof fetch });
});

test("fails attestation closed without source port or approved omissions", async () => withServer(async base => {
  const now = Date.now();
  const grant = token({ version: 1, userId: "user-1", companyId: 1, sessionId: "session-1", nonce: randomUUID(), issuedAt: now, expiresAt: now + 60_000 });
  const response = await fetch(`${base}/v1/attest`, { method: "POST", headers: { "content-type": "application/json", "x-gateway-observed-ip": "198.51.100.7" }, body: JSON.stringify({ grant, browserContext: browser }) });
  assert.equal(response.status, 400);
  assert.equal((await jsonBody<{ code: string }>(response)).code, "network_evidence_unavailable");
}, { env: { ...baseEnv, HMRC_FRAUD_APPROVED_OMISSIONS: "" } }));

test("enforces CORS, body limits, and redacted logs", async () => withServer(async (base, logs) => {
  assert.equal((await fetch(`${base}/v1/attest`, { method: "OPTIONS", headers: { origin: "https://evil.example" } })).status, 403);
  const malformed = await fetch(`${base}/v1/attest`, { method: "POST", headers: { "content-type": "application/json" }, body: "{" });
  assert.equal(malformed.status, 400);
  assert.equal((await jsonBody<{ code: string }>(malformed)).code, "invalid_body");
  assert.equal((await fetch(`${base}/v1/attest`, { method: "POST", headers: { "content-type": "application/json" }, body: "x".repeat(70_000) })).status, 413);
  const serialised = JSON.stringify(logs);
  assert.equal(serialised.includes("accessToken"), false);
  assert.equal(serialised.includes("browserUserAgent"), false);
  assert.equal(serialised.includes("Gov-Client"), false);
}));