import type { HmrcAttestationGrant } from "@workspace/api-client-react";

const hmrcDeviceId = crypto.randomUUID();

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
    throw new Error(body?.message ?? body?.error ?? `Gateway attestation failed (${response.status}).`);
  }

  return { attestation: body.attestation as string, browserContext };
}