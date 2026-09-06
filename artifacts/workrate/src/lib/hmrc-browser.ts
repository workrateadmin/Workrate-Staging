import type { HmrcAttestationGrant } from "@workspace/api-client-react";

const hmrcDeviceId = crypto.randomUUID();

const SAFE_ATTESTATION_ERRORS: Record<string, string> = {
  invalid_body: "ATTESTATION_SCHEMA_INVALID",
  invalid_grant: "ATTESTATION_GRANT_INVALID_OR_EXPIRED",
  replayed_grant: "ATTESTATION_GRANT_REPLAYED",
  origin_forbidden: "ATTESTATION_ORIGIN_NOT_ALLOWED",
  network_evidence_unavailable: "ATTESTATION_NETWORK_EVIDENCE_UNAVAILABLE",
  rate_limited: "ATTESTATION_RATE_LIMITED",
};

function safeAttestationError(code: unknown, status: number): Error {
  const normalized = typeof code === "string" ? SAFE_ATTESTATION_ERRORS[code] : undefined;
  if (normalized === "ATTESTATION_NETWORK_EVIDENCE_UNAVAILABLE") {
    return new Error(`${normalized}: the gateway could not verify Caddy-observed browser connection evidence.`);
  }
  return new Error(`${normalized ?? "ATTESTATION_UNAVAILABLE"}: gateway attestation failed (${status}).`);
}

export function hmrcBrowserContext() {
  const offsetMinutes = -new Date().getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteMinutes = Math.abs(offsetMinutes);
  const timezone = `UTC${sign}${String(Math.floor(absoluteMinutes / 60)).padStart(2, "0")}:${String(absoluteMinutes % 60).padStart(2, "0")}`;

  return {
    browserUserAgent: navigator.userAgent,
    deviceId: hmrcDeviceId,
    timezone,
    screens: [{
      width: window.screen.width,
      height: window.screen.height,
      colourDepth: window.screen.colorDepth,
      scalingFactor: window.devicePixelRatio || 1,
    }],
    windowSize: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
  };
}

export async function acquireHmrcGatewayAttestation(
  createGrant: () => Promise<HmrcAttestationGrant>,
) {
  const grant = await createGrant();
  const gateway = new URL(grant.gatewayUrl);
  if (
    gateway.protocol !== "https:"
    || gateway.username
    || gateway.password
    || gateway.search
    || gateway.hash
  ) {
    throw new Error("The HMRC sandbox gateway URL is not a valid HTTPS origin.");
  }

  const browserContext = hmrcBrowserContext();
  const response = await fetch(new URL("/v1/attest", gateway), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant: grant.grant, browserContext }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || typeof body.attestation !== "string" || body.attestation.length < 40) {
    throw safeAttestationError(body?.code, response.status);
  }

  return { attestation: body.attestation as string, browserContext };
}