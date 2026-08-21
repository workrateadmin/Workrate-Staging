import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import { eq } from "drizzle-orm";
import { companiesTable, db, hmrcOauthStatesTable } from "@workspace/db";
import {
  createFraudPreventionHeaders,
  getHmrcSandboxConfig,
  hmrcGet,
  type HmrcSandboxConfig,
} from "../src/lib/hmrc";
import { claimHmrcOauthState } from "../src/lib/hmrc-oauth-state";
import {
  getHmrcTrustedProxyCidrs,
  hmrcClientIp,
  hmrcTrustProxySetting,
  requireHmrcSameOrigin,
} from "../src/lib/hmrc-security";

const sandboxConfig: HmrcSandboxConfig = {
  apiBaseUrl: "https://test-api.service.hmrc.gov.uk",
  authorizationUrl: "https://test-api.service.hmrc.gov.uk/oauth/authorize",
  tokenUrl: "https://test-api.service.hmrc.gov.uk/oauth/token",
  clientId: "sandbox-client-id",
  clientSecret: "sandbox-client-secret",
  redirectUrl: "https://workrate.example/api/hmrc/callback",
  encryptionKey: Buffer.alloc(32),
  approvedOmissions: new Set(),
};

function runSameOriginCheck(headers: Record<string, string | undefined>) {
  let statusCode: number | null = null;
  let responseBody: unknown = null;
  let nextCalled = false;
  requireHmrcSameOrigin(
    {
      get(name) {
        return headers[name.toLowerCase()];
      },
    },
    {
      status(code) {
        statusCode = code;
        return this;
      },
      json(body) {
        responseBody = body;
      },
    },
    () => {
      nextCalled = true;
    },
  );
  return { statusCode, responseBody, nextCalled };
}

test("HMRC only accepts forwarded client IPs after exact proxy CIDRs are configured", () => {
  const spoofedRequest = { ip: "203.0.113.99" };

  assert.deepEqual(getHmrcTrustedProxyCidrs(""), []);
  assert.equal(hmrcTrustProxySetting(""), "loopback");
  assert.equal(hmrcClientIp(spoofedRequest, ""), "");

  const trustedCidrs = "198.51.100.0/24,2001:db8:9::/48";
  assert.deepEqual(getHmrcTrustedProxyCidrs(trustedCidrs), [
    "198.51.100.0/24",
    "2001:db8:9::/48",
  ]);
  assert.deepEqual(hmrcTrustProxySetting(trustedCidrs), [
    "198.51.100.0/24",
    "2001:db8:9::/48",
  ]);
  assert.equal(hmrcClientIp(spoofedRequest, trustedCidrs), "203.0.113.99");

  assert.throws(() => getHmrcTrustedProxyCidrs("198.51.100.7"), /exact IPv4 or IPv6 CIDRs/);
  assert.throws(() => getHmrcTrustedProxyCidrs("*"), /exact IPv4 or IPv6 CIDRs/);
});

test("HMRC rejects static or missing network evidence instead of manufacturing vendor headers", () => {
  const fraudContext = {
    browserUserAgent: "WorkRate HMRC security test",
    deviceId: "cfa7e0e9-d3fc-4e61-89c5-56d6aa3f4f8e",
    timezone: "UTC+00:00",
    screens: [{ width: 1440, height: 900, colourDepth: 24, scalingFactor: 1 }],
    windowSize: { width: 1280, height: 720 },
    clientPublicIp: "203.0.113.99",
    capturedAt: "2026-08-21T12:00:00.000Z",
    userId: "test-owner",
  };
  const withApprovedMissingHeaders: HmrcSandboxConfig = {
    ...sandboxConfig,
    approvedOmissions: new Set([
      "client-public-port",
      "client-multi-factor",
      "vendor-license-ids",
    ]),
  };

  assert.throws(
    () => createFraudPreventionHeaders(withApprovedMissingHeaders, fraudContext),
    /controlled TLS edge supplies verified network evidence/,
  );

  const headers = createFraudPreventionHeaders(withApprovedMissingHeaders, fraudContext, {
    vendorForwarded: "by=203.0.113.7&for=203.0.113.99",
    vendorPublicIp: "203.0.113.7",
    vendorVersion: "workrate-api=0.0.0",
  });
  assert.equal(headers["Gov-Vendor-Forwarded"], "by=203.0.113.7&for=203.0.113.99");
  assert.equal(headers["Gov-Vendor-Public-IP"], "203.0.113.7");
  assert.equal(headers["Gov-Vendor-Version"], "workrate-api=0.0.0");
  assert.equal(headers["Gov-Vendor-License-IDs"], undefined);
});

test("HMRC connect, sync, and disconnect reject cross-origin browser mutations", () => {
  for (const action of ["connect", "sync", "disconnect"]) {
    const rejected = runSameOriginCheck({
      origin: "https://untrusted.example",
      host: "workrate.example",
    });
    assert.equal(rejected.statusCode, 403, `${action} must reject a cross-origin request`);
    assert.equal(rejected.nextCalled, false, `${action} must not reach its route handler`);
    assert.deepEqual(rejected.responseBody, {
      error: "HMRC connection actions require a same-origin browser request.",
    });

    const forgedForwardedHost = runSameOriginCheck({
      origin: "https://untrusted.example",
      host: "workrate.example",
      "x-forwarded-host": "untrusted.example",
    });
    assert.equal(
      forgedForwardedHost.statusCode,
      403,
      `${action} must ignore a forged X-Forwarded-Host header`,
    );
    assert.equal(forgedForwardedHost.nextCalled, false);
  }

  const accepted = runSameOriginCheck({
    origin: "https://workrate.example",
    host: "workrate.example",
  });
  assert.equal(accepted.statusCode, null);
  assert.equal(accepted.nextCalled, true);
});

test("only one concurrent or replayed callback can reach an HMRC code exchange", async () => {
  const ownerUserId = `hmrc-security-test-${randomUUID()}`;
  const [company] = await db.insert(companiesTable).values({
    ownerUserId,
    name: "HMRC security regression test",
  }).returning();
  const stateHash = randomBytes(32).toString("hex");

  try {
    const [state] = await db.insert(hmrcOauthStatesTable).values({
      companyId: company.id,
      ownerUserId,
      stateHash,
      encryptedCodeVerifier: "test-ciphertext",
      encryptedTaxpayerId: "test-ciphertext",
      fraudContext: {},
      returnPath: "/finance",
      expiresAt: new Date(Date.now() + 60_000),
    }).returning();

    let codeExchangeCount = 0;
    const callback = async () => {
      const claimed = await claimHmrcOauthState({
        id: state.id,
        stateHash,
        companyId: company.id,
        ownerUserId,
      });
      if (!claimed) return null;
      codeExchangeCount += 1;
      return claimed;
    };

    const [first, second] = await Promise.all([callback(), callback()]);
    assert.equal([first, second].filter(Boolean).length, 1);
    assert.equal(codeExchangeCount, 1);

    const replay = await callback();
    assert.equal(replay, null);
    assert.equal(codeExchangeCount, 1);
  } finally {
    await db.delete(companiesTable).where(eq(companiesTable.id, company.id));
  }
});

test("HMRC read requests cannot leave the sandbox or leak credentials outside authorization headers", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: URL; init: RequestInit }> = [];
  globalThis.fetch = async (input, init = {}) => {
    calls.push({ url: new URL(input.toString()), init });
    return new Response(JSON.stringify({ obligations: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    await hmrcGet(
      sandboxConfig,
      "/obligations/details/AB123456C/income-and-expenditure",
      "application/vnd.hmrc.3.0+json",
      "sandbox-access-token",
      { "Gov-Client-Device-ID": "browser-device-id" },
    );

    assert.equal(calls.length, 1);
    const [request] = calls;
    assert.equal(request.url.origin, "https://test-api.service.hmrc.gov.uk");
    assert.equal(request.init.method, "GET");
    assert.equal(request.init.body, undefined);
    assert.equal(request.url.search, "");
    assert.equal(request.url.toString().includes("sandbox-access-token"), false);
    assert.equal(request.url.toString().includes("sandbox-client-secret"), false);
    assert.equal(new Headers(request.init.headers).get("authorization"), "Bearer sandbox-access-token");

    await assert.rejects(
      hmrcGet(
        sandboxConfig,
        "https://example.invalid/not-hmrc",
        "application/json",
        "sandbox-access-token",
        {},
      ),
      /sandbox host/,
    );
    assert.equal(calls.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("HMRC sandbox configuration rejects a non-sandbox API host", () => {
  const envNames = [
    "HMRC_SANDBOX_CLIENT_ID",
    "HMRC_SANDBOX_CLIENT_SECRET",
    "HMRC_OAUTH_REDIRECT_URL",
    "HMRC_TOKEN_ENCRYPTION_KEY",
    "HMRC_SANDBOX_API_BASE_URL",
  ] as const;
  const original = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));

  try {
    process.env.HMRC_SANDBOX_CLIENT_ID = "client";
    process.env.HMRC_SANDBOX_CLIENT_SECRET = "secret";
    process.env.HMRC_OAUTH_REDIRECT_URL = "https://workrate.example/api/hmrc/callback";
    process.env.HMRC_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32).toString("base64");
    process.env.HMRC_SANDBOX_API_BASE_URL = "https://example.invalid";
    assert.throws(() => getHmrcSandboxConfig(), /only the HTTPS HMRC sandbox base URL is allowed/);
  } finally {
    for (const name of envNames) {
      if (original[name]) process.env[name] = original[name];
      else delete process.env[name];
    }
  }
});

test("HMRC sandbox OAuth configuration does not accept static vendor header values", () => {
  const envNames = [
    "HMRC_SANDBOX_CLIENT_ID",
    "HMRC_SANDBOX_CLIENT_SECRET",
    "HMRC_OAUTH_REDIRECT_URL",
    "HMRC_TOKEN_ENCRYPTION_KEY",
    "HMRC_FRAUD_VENDOR_FORWARDED",
    "HMRC_FRAUD_VENDOR_LICENSE_IDS",
    "HMRC_FRAUD_VENDOR_PUBLIC_IP",
    "HMRC_FRAUD_VENDOR_VERSION",
  ] as const;
  const original = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));

  try {
    process.env.HMRC_SANDBOX_CLIENT_ID = "client";
    process.env.HMRC_SANDBOX_CLIENT_SECRET = "secret";
    process.env.HMRC_OAUTH_REDIRECT_URL = "https://workrate.example/api/hmrc/callback";
    process.env.HMRC_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32).toString("base64");
    delete process.env.HMRC_FRAUD_VENDOR_FORWARDED;
    delete process.env.HMRC_FRAUD_VENDOR_LICENSE_IDS;
    delete process.env.HMRC_FRAUD_VENDOR_PUBLIC_IP;
    delete process.env.HMRC_FRAUD_VENDOR_VERSION;

    const config = getHmrcSandboxConfig();
    assert.equal(config.clientId, "client");
    assert.equal("vendorForwarded" in config, false);
  } finally {
    for (const name of envNames) {
      if (original[name]) process.env[name] = original[name];
      else delete process.env[name];
    }
  }
});