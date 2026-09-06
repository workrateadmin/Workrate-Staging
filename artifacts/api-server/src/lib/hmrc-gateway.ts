import { createHmac } from "node:crypto";

export type GatewayResult = { confirmed: boolean; reference?: string; safeResponse?: Record<string, unknown>; safeError?: string };

function config() {
  const url = process.env.HMRC_SANDBOX_GATEWAY_URL?.trim();
  const secret = process.env.HMRC_SANDBOX_GATEWAY_HMAC_SECRET?.trim();
  if (!url || !secret) throw new Error("HMRC sandbox gateway is unavailable until controlled edge evidence is configured.");
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error("HMRC sandbox gateway configuration is invalid."); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hash) throw new Error("HMRC sandbox gateway must use an HTTPS URL.");
  return { url: parsed, secret };
}

/**
 * Contract with the dedicated controlled edge. It receives a server-only,
 * HMAC-authenticated request and returns `{confirmed:true, reference:string}`
 * only after HMRC sandbox confirms acceptance. It must never echo tokens,
 * browser context, or tax payloads. This client neither logs nor returns them.
 */
export async function submitViaHmrcSandboxGateway(input: {
  idempotencyKey: string; payloadHash: string; accessToken: string; taxpayerId: string; fraudContext: unknown;
}): Promise<GatewayResult> {
  const gateway = config();
  const body = JSON.stringify({ operation: "income-tax-quarterly-submit", idempotencyKey: input.idempotencyKey, payloadHash: input.payloadHash, accessToken: input.accessToken, taxpayerId: input.taxpayerId, fraudContext: input.fraudContext });
  const signature = createHmac("sha256", gateway.secret).update(body).digest("hex");
  let response: Response;
  try {
    response = await fetch(new URL("/v1/hmrc/sandbox/submit", gateway.url), {
      method: "POST", signal: AbortSignal.timeout(10_000),
      headers: { "Content-Type": "application/json", "X-WorkRate-Signature": `sha256=${signature}` },
      body,
    });
  } catch { return { confirmed: false, safeError: "HMRC sandbox gateway could not be reached. Retry later." }; }
  const raw = await response.json().catch(() => null) as Record<string, unknown> | null;
  const reference = typeof raw?.reference === "string" && raw.reference.length <= 200 ? raw.reference : undefined;
  if (!response.ok || raw?.confirmed !== true || !reference) return { confirmed: false, safeError: "HMRC sandbox did not confirm this submission." };
  return { confirmed: true, reference, safeResponse: { reference, status: typeof raw.status === "string" ? raw.status.slice(0, 80) : "accepted" } };
}

export async function validateFraudHeadersViaGateway(): Promise<GatewayResult> {
  try { config(); } catch (error) { return { confirmed: false, safeError: error instanceof Error ? error.message : "HMRC sandbox gateway is unavailable." }; }
  // Validator requires the same request-specific trusted evidence as submission.
  return { confirmed: false, safeError: "Fraud-header validation is unavailable until the controlled gateway provides request-specific evidence." };
}