import { createHmac, randomUUID } from "node:crypto";

export type GatewayResult = {
  confirmed: boolean;
  reference?: string;
  safeResponse?: Record<string, unknown>;
  safeError?: string;
  status?: "pass" | "warning" | "fail" | "unavailable";
  checkedAt?: string | null;
  issues?: Array<{ header: string; message: string }>;
};

type GatewayIdentity = { userId: string; companyId: number; sessionId: string };

function config() {
  const url = process.env.HMRC_SANDBOX_GATEWAY_URL?.trim();
  const secret = process.env.HMRC_SANDBOX_GATEWAY_HMAC_SECRET?.trim();
  if (!url || !secret || secret.length < 32) {
    throw new Error("HMRC sandbox gateway is unavailable until controlled edge evidence is configured.");
  }
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error("HMRC sandbox gateway configuration is invalid."); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hash || parsed.search) {
    throw new Error("HMRC sandbox gateway must use a clean HTTPS origin.");
  }
  return { url: parsed, secret };
}

function safeIssues(value: unknown): Array<{ header: string; message: string }> {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).flatMap((issue) => {
    if (!issue || typeof issue !== "object") return [];
    const header = "header" in issue && typeof issue.header === "string" ? issue.header.slice(0, 120) : "";
    const message = "message" in issue && typeof issue.message === "string" ? issue.message.slice(0, 500) : "";
    return header && message ? [{ header, message }] : [];
  });
}

async function signedRequest(path: string, bodyValue: Record<string, unknown>, attestation?: string): Promise<{ response: Response; raw: Record<string, unknown> | null }> {
  const gateway = config();
  const body = JSON.stringify(bodyValue);
  const timestamp = String(Date.now());
  const requestId = randomUUID();
  const canonical = `${timestamp}\n${requestId}\nPOST\n${path}\n${body}`;
  const signature = createHmac("sha256", gateway.secret).update(canonical).digest("base64url");
  const response = await fetch(new URL(path, gateway.url), {
    method: "POST",
    signal: AbortSignal.timeout(12_000),
    headers: {
      "Content-Type": "application/json",
      "X-WorkRate-Timestamp": timestamp,
      "X-WorkRate-Request-Id": requestId,
      "X-WorkRate-Signature": `sha256=${signature}`,
      ...(attestation ? { "X-WorkRate-Attestation": attestation } : {}),
    },
    body,
  });
  const raw = await response.json().catch(() => null) as Record<string, unknown> | null;
  return { response, raw };
}

export function createHmrcGatewayAttestationGrant(identity: GatewayIdentity) {
  const gateway = config();
  const issuedAt = Date.now();
  const payload = {
    version: 1,
    ...identity,
    issuedAt,
    expiresAt: issuedAt + 2 * 60_000,
    nonce: randomUUID(),
  };
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "WRGT" })).toString("base64url");
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", gateway.secret).update(`${header}.${encoded}`).digest("base64url");
  return {
    gatewayUrl: gateway.url.origin,
    grant: `${header}.${encoded}.${signature}`,
    expiresAt: new Date(payload.expiresAt).toISOString(),
  };
}

export async function getHmrcGatewayStatus(): Promise<{
  gateway: "connected" | "unavailable";
  environment: "sandbox";
  publicIp: string | null;
  version: string | null;
  buildId: string | null;
  fraudPrevention: "pass" | "warning" | "fail" | "unavailable";
  hmrcConnectivity: "connected" | "unavailable" | "unknown";
  dynamicSubmission: "available" | "unavailable";
  lastValidationAt: string | null;
  missingHeaders: string[];
  message: string | null;
}> {
  const unavailable = (message: string) => ({
    gateway: "unavailable" as const, environment: "sandbox" as const, publicIp: null, version: null, buildId: null,
    fraudPrevention: "unavailable" as const, hmrcConnectivity: "unknown" as const,
    dynamicSubmission: "unavailable" as const, lastValidationAt: null, missingHeaders: [], message,
  });
  let gateway;
  try { gateway = config(); } catch (error) {
    return unavailable(error instanceof Error ? error.message : "HMRC sandbox gateway is unavailable.");
  }
  try {
    const response = await fetch(new URL("/healthz", gateway.url), { signal: AbortSignal.timeout(4_000) });
    const raw = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok || raw?.status !== "ok" || raw.environment !== "sandbox") return unavailable("HMRC sandbox gateway health check failed.");
    const fraud = ["pass", "warning", "fail"].includes(String(raw.fraudPrevention)) ? raw.fraudPrevention as "pass" | "warning" | "fail" : "unavailable";
    return {
      gateway: "connected", environment: "sandbox",
      publicIp: typeof raw.publicIp === "string" ? raw.publicIp.slice(0, 80) : null,
      version: typeof raw.version === "string" ? raw.version.slice(0, 80) : null,
      buildId: typeof raw.buildId === "string" ? raw.buildId.slice(0, 120) : null,
      fraudPrevention: fraud,
      hmrcConnectivity: raw.hmrcConnectivity === "connected" || raw.hmrcConnectivity === "unavailable" ? raw.hmrcConnectivity : "unknown",
      dynamicSubmission: raw.dynamicSubmission === "available" && fraud === "pass" ? "available" : "unavailable",
      lastValidationAt: typeof raw.lastValidationAt === "string" ? raw.lastValidationAt : null,
      missingHeaders: Array.isArray(raw.missingHeaders) ? raw.missingHeaders.filter((x): x is string => typeof x === "string").slice(0, 30) : [],
      message: typeof raw.message === "string" ? raw.message.slice(0, 500) : null,
    };
  } catch {
    return unavailable("HMRC sandbox gateway could not be reached.");
  }
}

export async function validateFraudHeadersViaGateway(input: GatewayIdentity & {
  attestation: string;
  browserContext: unknown;
}): Promise<GatewayResult> {
  try {
    const { response, raw } = await signedRequest("/v1/hmrc/sandbox/validate-fraud", {
      operation: "fraud-header-validation",
      userId: input.userId, companyId: input.companyId, sessionId: input.sessionId,
      browserContext: input.browserContext,
    }, input.attestation);
    const status = ["pass", "warning", "fail"].includes(String(raw?.status)) ? raw!.status as "pass" | "warning" | "fail" : "unavailable";
    return {
      confirmed: response.ok && status === "pass",
      status,
      checkedAt: typeof raw?.checkedAt === "string" ? raw.checkedAt : new Date().toISOString(),
      issues: safeIssues(raw?.issues),
      safeError: typeof raw?.message === "string" ? raw.message.slice(0, 500) : response.ok ? undefined : "HMRC fraud-header validation did not pass.",
    };
  } catch (error) {
    return { confirmed: false, status: "unavailable", checkedAt: null, issues: [], safeError: error instanceof Error && error.message.startsWith("HMRC") ? error.message : "HMRC sandbox gateway could not be reached." };
  }
}

export async function readHmrcSandboxViaGateway<T>(input: GatewayIdentity & {
  operation: "business-details" | "obligations";
  accessToken: string;
  taxpayerId: string;
  attestation: string;
  browserContext: unknown;
}): Promise<T> {
  const { response, raw } = await signedRequest("/v1/hmrc/sandbox/read", {
    operation: input.operation,
    userId: input.userId,
    companyId: input.companyId,
    sessionId: input.sessionId,
    accessToken: input.accessToken,
    taxpayerId: input.taxpayerId,
    browserContext: input.browserContext,
  }, input.attestation);
  if (!response.ok || raw?.confirmed !== true || !raw.data || typeof raw.data !== "object" || Array.isArray(raw.data)) {
    throw new Error("HMRC sandbox gateway did not confirm the requested data read.");
  }
  return raw.data as T;
}

export async function submitViaHmrcSandboxGateway(input: GatewayIdentity & {
  idempotencyKey: string;
  payloadHash: string;
  accessToken: string;
  taxpayerId: string;
  businessId: string;
  taxYear: string;
  periodStart: string;
  periodEnd: string;
  quarterlyPayload: Record<string, unknown>;
  attestation: string;
  browserContext: unknown;
}): Promise<GatewayResult> {
  try {
    const { response, raw } = await signedRequest("/v1/hmrc/sandbox/submit", {
      operation: "income-tax-quarterly-submit",
      userId: input.userId, companyId: input.companyId, sessionId: input.sessionId,
      idempotencyKey: input.idempotencyKey,
      payloadHash: input.payloadHash,
      accessToken: input.accessToken,
      nino: input.taxpayerId,
      businessId: input.businessId,
      taxYear: input.taxYear,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      quarterlyPayload: input.quarterlyPayload,
      browserContext: input.browserContext,
    }, input.attestation);
    const reference = typeof raw?.reference === "string" && raw.reference.length <= 200 ? raw.reference : undefined;
    if (!response.ok || raw?.confirmed !== true || !reference) {
      return { confirmed: false, safeError: typeof raw?.message === "string" ? raw.message.slice(0, 500) : "HMRC sandbox did not confirm this submission." };
    }
    return { confirmed: true, reference, safeResponse: { reference, status: typeof raw.status === "string" ? raw.status.slice(0, 80) : "accepted" } };
  } catch (error) {
    return { confirmed: false, safeError: error instanceof Error && error.message.startsWith("HMRC") ? error.message : "HMRC sandbox gateway could not be reached. Retry later." };
  }
}