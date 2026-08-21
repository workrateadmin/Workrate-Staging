import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const HMRC_SANDBOX_BASE_URL = "https://test-api.service.hmrc.gov.uk";
const HMRC_READ_SCOPE = "read:self-assessment";
const OMITTABLE_HEADERS = new Set([
  "client-public-port",
  "client-multi-factor",
  "vendor-license-ids",
  "vendor-forwarded",
  "vendor-public-ip",
]);

export type HmrcSandboxConfig = {
  apiBaseUrl: string;
  authorizationUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUrl: string;
  encryptionKey: Buffer;
  approvedOmissions: Set<string>;
};

export type HmrcBrowserContext = {
  browserUserAgent: string;
  deviceId: string;
  timezone: string;
  screens: Array<{
    width: number;
    height: number;
    colourDepth: number;
    scalingFactor: number;
  }>;
  windowSize: { width: number; height: number };
  clientPublicPort?: number;
  multiFactor?: string;
};

export type StoredFraudContext = HmrcBrowserContext & {
  clientPublicIp: string;
  capturedAt: string;
};

/**
 * Values supplied by a controlled TLS edge or deployment runtime. They must
 * describe the current request and must never be populated from browser input
 * or a manually maintained environment variable.
 */
export type HmrcTrustedNetworkEvidence = {
  vendorForwarded: string;
  vendorPublicIp: string;
  vendorVersion: string;
};

type HmrcTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

function configuredValue(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function safeConfigError(message: string): never {
  throw new Error(`HMRC sandbox configuration incomplete: ${message}`);
}

export function getHmrcSandboxConfig(): HmrcSandboxConfig {
  const clientId = configuredValue("HMRC_SANDBOX_CLIENT_ID");
  const clientSecret = configuredValue("HMRC_SANDBOX_CLIENT_SECRET");
  const redirectUrl = configuredValue("HMRC_OAUTH_REDIRECT_URL");
  const keyValue = configuredValue("HMRC_TOKEN_ENCRYPTION_KEY");
  const apiBaseUrl = configuredValue("HMRC_SANDBOX_API_BASE_URL") ?? HMRC_SANDBOX_BASE_URL;

  if (!clientId || !clientSecret || !redirectUrl || !keyValue) {
    safeConfigError("add the sandbox client credentials, redirect URL, and token encryption key.");
  }
  let parsedBase: URL;
  let parsedRedirect: URL;
  try {
    parsedBase = new URL(apiBaseUrl);
    parsedRedirect = new URL(redirectUrl);
  } catch {
    safeConfigError("the configured sandbox URLs are invalid.");
  }
  if (
    parsedBase.protocol !== "https:" ||
    parsedBase.origin !== HMRC_SANDBOX_BASE_URL ||
    parsedRedirect.protocol !== "https:"
  ) {
    safeConfigError("only the HTTPS HMRC sandbox base URL is allowed.");
  }

  const encryptionKey = Buffer.from(keyValue, "base64");
  if (encryptionKey.length !== 32) {
    safeConfigError("HMRC_TOKEN_ENCRYPTION_KEY must be a 32-byte base64 value.");
  }

  const approvedOmissions = new Set(
    (configuredValue("HMRC_FRAUD_APPROVED_OMISSIONS") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  for (const omission of approvedOmissions) {
    if (!OMITTABLE_HEADERS.has(omission)) {
      safeConfigError("HMRC_FRAUD_APPROVED_OMISSIONS contains an unsupported header name.");
    }
  }

  return {
    apiBaseUrl: parsedBase.origin,
    authorizationUrl: new URL("/oauth/authorize", parsedBase).toString(),
    tokenUrl: new URL("/oauth/token", parsedBase).toString(),
    clientId,
    clientSecret,
    redirectUrl: parsedRedirect.toString(),
    encryptionKey,
    approvedOmissions,
  };
}

export function getHmrcSandboxConfigStatus(): { configured: boolean; message: string | null } {
  try {
    getHmrcSandboxConfig();
    return { configured: true, message: null };
  } catch (error) {
    return {
      configured: false,
      message: error instanceof Error ? error.message : "HMRC sandbox is not configured.",
    };
  }
}

function aad(purpose: string): Buffer {
  return Buffer.from(`workrate:hmrc:${purpose}`, "utf8");
}

export function encryptHmrcValue(value: string, config: HmrcSandboxConfig, purpose: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", config.encryptionKey, iv);
  cipher.setAAD(aad(purpose));
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptHmrcValue(value: string, config: HmrcSandboxConfig, purpose: string): string {
  const [version, ivValue, tagValue, ciphertextValue] = value.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !ciphertextValue) {
    throw new Error("Stored HMRC credential cannot be decrypted.");
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", config.encryptionKey, Buffer.from(ivValue, "base64url"));
    decipher.setAAD(aad(purpose));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("Stored HMRC credential cannot be decrypted.");
  }
}

export function createOpaqueValue(): string {
  return randomBytes(32).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function createCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function createAuthorizationUrl(config: HmrcSandboxConfig, input: {
  state: string;
  codeChallenge: string;
}): string {
  const url = new URL(config.authorizationUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUrl);
  url.searchParams.set("scope", HMRC_READ_SCOPE);
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

function encodeFormValue(value: string): string {
  return encodeURIComponent(value);
}

async function readTokenResponse(response: Response, action: string): Promise<HmrcTokenResponse> {
  const payload = await response.json().catch(() => null) as HmrcTokenResponse | null;
  if (!response.ok) {
    const errorCode = typeof payload?.error === "string"
      ? payload.error.replace(/\s+/g, " ").slice(0, 100)
      : "unknown_error";
    const errorDescription = typeof payload?.error_description === "string"
      ? payload.error_description.replace(/\s+/g, " ").slice(0, 300)
      : "";
    const detail = errorDescription ? `: ${errorCode} — ${errorDescription}` : `: ${errorCode}`;
    throw new Error(`HMRC ${action} failed (${response.status})${detail}`);
  }
  if (!payload?.access_token || typeof payload.access_token !== "string") {
    throw new Error(`HMRC ${action} returned an invalid token response.`);
  }
  return payload;
}

function basicAuth(config: HmrcSandboxConfig): string {
  return `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`, "utf8").toString("base64")}`;
}

export async function exchangeAuthorizationCode(
  config: HmrcSandboxConfig,
  code: string,
  codeVerifier: string,
): Promise<HmrcTokenResponse> {
  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      Authorization: basicAuth(config),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: [
      "grant_type=authorization_code",
      `code=${encodeFormValue(code)}`,
      `redirect_uri=${encodeFormValue(config.redirectUrl)}`,
      `code_verifier=${encodeFormValue(codeVerifier)}`,
    ].join("&"),
  });
  return readTokenResponse(response, "token exchange");
}

export async function refreshAccessToken(
  config: HmrcSandboxConfig,
  refreshToken: string,
): Promise<HmrcTokenResponse> {
  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      Authorization: basicAuth(config),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: `grant_type=refresh_token&refresh_token=${encodeFormValue(refreshToken)}`,
  });
  return readTokenResponse(response, "token refresh");
}

function isPublicIp(value: string): boolean {
  const normalized = value.replace(/^::ffff:/, "");
  if (
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized.startsWith("10.") ||
    normalized.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(normalized)
  ) {
    return false;
  }
  return Boolean(normalized);
}

function positiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function encodeRecord(entries: Record<string, string | number>): string {
  return Object.entries(entries)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");
}

function omitAllowed(config: HmrcSandboxConfig, name: string): boolean {
  return config.approvedOmissions.has(name);
}

/**
 * HMRC mandates all headers for a web application via server. This helper
 * deliberately rejects unknown or unavailable data rather than manufacturing it.
 */
export function createFraudPreventionHeaders(
  config: HmrcSandboxConfig,
  input: StoredFraudContext & { userId: string },
  networkEvidence?: HmrcTrustedNetworkEvidence,
): Record<string, string> {
  if (!networkEvidence?.vendorForwarded || !networkEvidence.vendorPublicIp || !networkEvidence.vendorVersion) {
    throw new Error(
      "HMRC sandbox cannot make a read request until a controlled TLS edge supplies verified network evidence.",
    );
  }
  if (!input.browserUserAgent || input.browserUserAgent.length > 1024) {
    throw new Error("HMRC fraud-prevention data needs the browser JavaScript user agent.");
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.deviceId)) {
    throw new Error("HMRC fraud-prevention data needs a persistent browser device ID.");
  }
  if (!/^UTC[+-](?:0\d|1\d|2[0-3]):[0-5]\d$/.test(input.timezone)) {
    throw new Error("HMRC fraud-prevention data needs the browser timezone offset.");
  }
  if (!isPublicIp(input.clientPublicIp)) {
    throw new Error("HMRC fraud-prevention data needs the originating public client IP.");
  }
  if (!input.screens.length || !input.screens.every((screen) =>
    positiveInteger(screen.width) &&
    positiveInteger(screen.height) &&
    positiveInteger(screen.colourDepth) &&
    typeof screen.scalingFactor === "number" &&
    Number.isFinite(screen.scalingFactor) &&
    screen.scalingFactor > 0,
  )) {
    throw new Error("HMRC fraud-prevention data needs real browser screen information.");
  }
  if (!positiveInteger(input.windowSize.width) || !positiveInteger(input.windowSize.height)) {
    throw new Error("HMRC fraud-prevention data needs the real browser window size.");
  }

  const capturedAt = new Date(input.capturedAt);
  if (Number.isNaN(capturedAt.getTime())) {
    throw new Error("HMRC fraud-prevention data has an invalid collection timestamp.");
  }

  const headers: Record<string, string> = {
    "Gov-Client-Connection-Method": "WEB_APP_VIA_SERVER",
    "Gov-Client-Browser-JS-User-Agent": input.browserUserAgent,
    "Gov-Client-Device-ID": input.deviceId,
    "Gov-Client-Public-IP": input.clientPublicIp,
    "Gov-Client-Public-IP-Timestamp": capturedAt.toISOString(),
    "Gov-Client-Screens": input.screens.map((screen) => encodeRecord({
      width: screen.width,
      height: screen.height,
      "scaling-factor": screen.scalingFactor,
      "colour-depth": screen.colourDepth,
    })).join(","),
    "Gov-Client-Timezone": input.timezone,
    "Gov-Client-User-IDs": encodeRecord({ workrate: input.userId }),
    "Gov-Client-Window-Size": encodeRecord({
      width: input.windowSize.width,
      height: input.windowSize.height,
    }),
    "Gov-Vendor-Forwarded": networkEvidence.vendorForwarded,
    "Gov-Vendor-Product-Name": "WorkRate",
    "Gov-Vendor-Public-IP": networkEvidence.vendorPublicIp,
    "Gov-Vendor-Version": networkEvidence.vendorVersion,
  };

  if (!omitAllowed(config, "vendor-license-ids")) {
    throw new Error(
      "HMRC requires documented approval to omit Gov-Vendor-License-IDs when WorkRate has no vendor licence on the browser.",
    );
  }

  if (input.clientPublicPort != null) {
    if (!positiveInteger(input.clientPublicPort)) {
      throw new Error("HMRC fraud-prevention data has an invalid public client port.");
    }
    headers["Gov-Client-Public-Port"] = String(input.clientPublicPort);
  } else if (!omitAllowed(config, "client-public-port")) {
    throw new Error("HMRC requires the actual public client port or documented approval to omit it.");
  }

  if (input.multiFactor) {
    headers["Gov-Client-Multi-Factor"] = input.multiFactor;
  } else if (!omitAllowed(config, "client-multi-factor")) {
    throw new Error("HMRC requires real multi-factor data or documented approval to omit it.");
  }
  return headers;
}

export async function hmrcGet<T>(
  config: HmrcSandboxConfig,
  path: string,
  accept: string,
  accessToken: string,
  fraudHeaders: Record<string, string>,
): Promise<T> {
  const configuredBase = new URL(config.apiBaseUrl);
  if (configuredBase.origin !== HMRC_SANDBOX_BASE_URL) {
    throw new Error("HMRC read requests must use the sandbox host.");
  }
  const url = new URL(path, configuredBase);
  if (url.origin !== HMRC_SANDBOX_BASE_URL) {
    throw new Error("HMRC read requests must use the sandbox host.");
  }
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: accept,
      Authorization: `Bearer ${accessToken}`,
      ...fraudHeaders,
    },
  });
  if (!response.ok) {
    throw new Error(`HMRC sandbox request failed (${response.status}).`);
  }
  return response.json() as Promise<T>;
}

export function expiresAt(expiresIn: number | undefined): Date {
  const seconds = typeof expiresIn === "number" && Number.isFinite(expiresIn) ? expiresIn : 0;
  return new Date(Date.now() + Math.max(0, seconds) * 1000);
}

export function grantedScope(value: string | undefined): string {
  const scopes = (value ?? HMRC_READ_SCOPE).split(/\s+/).filter(Boolean);
  if (!scopes.includes(HMRC_READ_SCOPE)) {
    throw new Error("HMRC did not grant the required read:self-assessment scope.");
  }
  return scopes.join(" ");
}