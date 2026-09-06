import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingHttpHeaders, type IncomingMessage, type ServerResponse } from "node:http";
import { isIP } from "node:net";

const HMRC_ORIGIN = "https://test-api.service.hmrc.gov.uk";
const BODY_LIMIT = 64 * 1024;
const SKEW_MS = 60_000;
const ATTEST_TTL_MS = 5 * 60_000;
type Json = Record<string, unknown>;
type Identity = { userId: string; companyId: number; sessionId: string };
type Attestation = Identity & { browserContext: Json; ip: string; port?: number; issuedAt: number; expiresAt: number; jti: string };
export type GatewayDeps = { fetch?: typeof fetch; now?: () => number; log?: (v: Json) => void; env?: NodeJS.ProcessEnv };

class TtlMap {
  private values = new Map<string, number>();
  has(key: string, now: number) { const expiry = this.values.get(key); return !!expiry && expiry > now; }
  add(key: string, expiry: number) { this.values.set(key, expiry); }
  prune(now: number) { for (const [key, expiry] of this.values) if (expiry <= now) this.values.delete(key); }
}
const replay = new TtlMap(), operations = new TtlMap();
const rate = new Map<string, { count: number; expiresAt: number }>();
const health = {
  fraudPrevention: "unavailable" as "pass" | "warning" | "fail" | "unavailable",
  lastValidationAt: null as string | null,
  hmrcConnectivity: "unknown" as "connected" | "unavailable" | "unknown",
};
setInterval(() => {
  const now = Date.now();
  replay.prune(now); operations.prune(now);
  for (const [key, value] of rate) if (value.expiresAt <= now) rate.delete(key);
}, 60_000).unref();

function b64(data: string | Buffer) { return Buffer.from(data).toString("base64url"); }
function unb64(data: string) { return Buffer.from(data, "base64url").toString("utf8"); }
function sign(data: string, secret: string) { return createHmac("sha256", secret).update(data).digest("base64url"); }
function safeEqual(a: string, b: string) { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); }
function object(v: unknown): v is Json { return !!v && typeof v === "object" && !Array.isArray(v); }
function string(v: unknown, max = 512): v is string { return typeof v === "string" && v.length > 0 && v.length <= max; }
function uuid(v: unknown): v is string { return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v); }
function token(payload: Json, secret: string) { const head = b64(JSON.stringify({ alg: "HS256", typ: "WRAT" })), body = b64(JSON.stringify(payload)); return `${head}.${body}.${sign(`${head}.${body}`, secret)}`; }
function decode(value: unknown, secret: string): Json | null {
  if (!string(value, 16_384)) return null;
  const bits = value.split("."); if (bits.length !== 3 || !safeEqual(bits[2]!, sign(`${bits[0]}.${bits[1]}`, secret))) return null;
  try { const parsed: unknown = JSON.parse(unb64(bits[1]!)); return object(parsed) ? parsed : null; } catch { return null; }
}
function requiredEnv(env: NodeJS.ProcessEnv, name: string) { const value = env[name]?.trim(); if (!value) throw new Error(`missing ${name}`); return value; }
function loopback(ip: string | undefined) { return ip === "::1" || ip === "127.0.0.1" || ip === "::ffff:127.0.0.1"; }
function omissionAllowed(env: NodeJS.ProcessEnv, name: string) { return (env.HMRC_FRAUD_APPROVED_OMISSIONS ?? "").split(",").map(x => x.trim()).includes(name); }
export function observedNetworkEvidence(
  remoteAddress: string | undefined,
  headers: IncomingHttpHeaders,
  allowMissingPort = false,
): { ip: string; port?: number } | null {
  if (!loopback(remoteAddress)) return null;
  const observedIp = headers["x-gateway-observed-ip"];
  if (typeof observedIp !== "string" || isIP(observedIp) === 0) return null;
  const observedPort = headers["x-gateway-observed-port"];
  if (observedPort === undefined && allowMissingPort) return { ip: observedIp };
  if (typeof observedPort !== "string" || !/^\d{1,5}$/.test(observedPort)) return null;
  const port = Number(observedPort);
  if (port < 1 || port > 65_535) return null;
  return { ip: observedIp, port };
}
function browser(value: unknown): Json | null {
  if (!object(value) || !string(value.browserUserAgent, 1024) || !uuid(value.deviceId) || !string(value.timezone, 16) || !Array.isArray(value.screens) || value.screens.length < 1 || !object(value.windowSize)) return null;
  return value;
}
function json(res: ServerResponse, status: number, requestId: string, body: Json) {
  res.statusCode = status; res.setHeader("content-type", "application/json; charset=utf-8"); res.setHeader("x-request-id", requestId);
  res.end(JSON.stringify({ requestId, ...body }));
}
async function read(req: IncomingMessage): Promise<{ raw: string; value: Json } | "limit" | null> {
  let bytes = 0, raw = "";
  for await (const chunk of req) { bytes += Buffer.byteLength(chunk); if (bytes > BODY_LIMIT) return "limit"; raw += chunk; }
  try { const value: unknown = JSON.parse(raw); return object(value) ? { raw, value } : null; } catch { return null; }
}
function configuredPath(template: string, data: Json): string | null {
  if (!template.startsWith("/") || template.includes("\\") || /(^|\/)\.\.?($|\/)/.test(template) || template.includes("://")) return null;
  if (!/^\/[A-Za-z0-9_{}./-]+$/.test(template)) return null;
  return template.replace(/\{(nino|businessId|taxYear|periodStart|periodEnd)\}/g, (_, key: string) => string(data[key], 128) ? encodeURIComponent(data[key] as string) : "\0").includes("\0") ? null : template.replace(/\{(nino|businessId|taxYear|periodStart|periodEnd)\}/g, (_, key: string) => encodeURIComponent(data[key] as string));
}
function fraud(att: Attestation, env: NodeJS.ProcessEnv): Record<string, string> {
  const b = att.browserContext;
  const headers: Record<string, string> = {
    "Gov-Client-Connection-Method": "WEB_APP_VIA_SERVER", "Gov-Client-Browser-JS-User-Agent": b.browserUserAgent as string,
    "Gov-Client-Device-ID": b.deviceId as string, "Gov-Client-Public-IP": att.ip, "Gov-Client-Public-IP-Timestamp": new Date(att.issuedAt).toISOString(),
    "Gov-Client-Timezone": b.timezone as string, "Gov-Client-User-IDs": `workrate=${encodeURIComponent(att.userId)}`,
    "Gov-Client-Screens": JSON.stringify(b.screens), "Gov-Client-Window-Size": JSON.stringify(b.windowSize),
    "Gov-Vendor-Forwarded": "by=workrate-gateway", "Gov-Vendor-Product-Name": "WorkRate", "Gov-Vendor-Public-IP": requiredEnv(env, "GATEWAY_PUBLIC_IP"), "Gov-Vendor-Version": requiredEnv(env, "GATEWAY_VERSION")
  };
  if (att.port) headers["Gov-Client-Public-Port"] = String(att.port); else if (!omissionAllowed(env, "client-public-port")) throw new Error("fraud data unavailable");
  if (!omissionAllowed(env, "client-multi-factor")) throw new Error("fraud data unavailable");
  if (!omissionAllowed(env, "vendor-license-ids")) throw new Error("fraud data unavailable");
  return headers;
}
async function app(req: IncomingMessage, res: ServerResponse, deps: GatewayDeps = {}) {
  const now = deps.now?.() ?? Date.now(), env = deps.env ?? process.env, requestId = randomUUID(), started = now;
  const log = (status: number, hmrcStatus?: number) => deps.log?.({ endpoint: req.url?.split("?")[0] ?? "", status, latencyMs: (deps.now?.() ?? Date.now()) - started, requestId, ...(hmrcStatus ? { hmrcStatus } : {}) });
  res.setHeader("x-content-type-options", "nosniff"); res.setHeader("referrer-policy", "no-referrer"); res.setHeader("cache-control", "no-store");
  const finish = (status: number, body: Json) => { json(res, status, requestId, body); log(status); };
  const url = new URL(req.url ?? "/", "http://localhost");
  if (req.method === "GET" && url.pathname === "/healthz") {
    const ready = ["WORKRATE_GATEWAY_HMAC_SECRET", "GATEWAY_ATTESTATION_SECRET", "HMRC_SANDBOX_CLIENT_ID", "HMRC_SANDBOX_CLIENT_SECRET", "GATEWAY_PUBLIC_IP"].every(k => Boolean(env[k]));
    return finish(200, { status: "ok", version: env.GATEWAY_VERSION ?? "unknown", buildId: env.GATEWAY_BUILD_ID ?? null, environment: "sandbox", hmrcHost: "test-api.service.hmrc.gov.uk", publicIp: env.GATEWAY_PUBLIC_IP ?? null, fraudPrevention: health.fraudPrevention, lastValidationAt: health.lastValidationAt, missingHeaders: [], hmrcConnectivity: ready ? health.hmrcConnectivity : "unavailable", dynamicSubmission: ready && health.fraudPrevention === "pass" && Boolean(env.HMRC_SANDBOX_QUARTERLY_PATH_TEMPLATE) ? "available" : "unavailable", ready });
  }
  if (req.method === "OPTIONS" && url.pathname === "/v1/attest") { const origin = req.headers.origin; if (origin && (env.WORKRATE_BROWSER_ORIGINS ?? "").split(",").map(x => x.trim()).includes(origin)) { res.statusCode = 204; res.setHeader("access-control-allow-origin", origin); res.setHeader("access-control-allow-methods", "POST, OPTIONS"); res.setHeader("access-control-allow-headers", "content-type"); res.end(); return; } return finish(403, { code: "origin_forbidden" }); }
  if (req.method !== "POST" || !["/v1/attest", "/v1/hmrc/sandbox/validate-fraud", "/v1/hmrc/sandbox/submit", "/v1/hmrc/sandbox/read"].includes(url.pathname)) return finish(404, { code: "not_found" });
  if (url.pathname === "/v1/attest") { const origin = req.headers.origin; if (origin && !(env.WORKRATE_BROWSER_ORIGINS ?? "").split(",").map(x => x.trim()).includes(origin)) return finish(403, { code: "origin_forbidden" }); if (origin) res.setHeader("access-control-allow-origin", origin); }
  const body = await read(req); if (body === "limit") return finish(413, { code: "body_too_large" }); if (!body) return finish(400, { code: "invalid_body" });
  if (url.pathname === "/v1/attest") {
    const ipKey = req.socket.remoteAddress ?? "unknown";
    const rateEntry = rate.get(ipKey);
    if (rateEntry && rateEntry.expiresAt > now && rateEntry.count >= 20) return finish(429, { code: "rate_limited" });
    rate.set(ipKey, rateEntry && rateEntry.expiresAt > now ? { ...rateEntry, count: rateEntry.count + 1 } : { count: 1, expiresAt: now + 60_000 });
    const grant = decode(body.value.grant, requiredEnv(env, "WORKRATE_GATEWAY_HMAC_SECRET")); const b = browser(body.value.browserContext);
    if (!grant || grant.version !== 1 || !string(grant.userId) || !Number.isInteger(grant.companyId) || !string(grant.sessionId) || !string(grant.nonce, 128) || typeof grant.issuedAt !== "number" || typeof grant.expiresAt !== "number" || grant.issuedAt > now + SKEW_MS || grant.expiresAt < now || grant.expiresAt - grant.issuedAt > 10 * 60_000 || !b) return finish(401, { code: "invalid_grant" });
    if (replay.has(`grant:${grant.nonce}`, now)) return finish(409, { code: "replayed_grant" }); replay.add(`grant:${grant.nonce}`, grant.expiresAt);
    const network = observedNetworkEvidence(
      req.socket.remoteAddress,
      req.headers,
      omissionAllowed(env, "client-public-port"),
    );
    if (!network) return finish(400, { code: "network_evidence_unavailable" });
    const att: Attestation = { userId: grant.userId as string, companyId: grant.companyId as number, sessionId: grant.sessionId as string, browserContext: b, ...network, issuedAt: now, expiresAt: now + ATTEST_TTL_MS, jti: randomUUID() };
    return finish(201, { attestation: token(att, requiredEnv(env, "GATEWAY_ATTESTATION_SECRET")), expiresAt: att.expiresAt });
  }
  const timestamp = req.headers["x-workrate-timestamp"], rid = req.headers["x-workrate-request-id"], signature = req.headers["x-workrate-signature"];
  const timestampMs = typeof timestamp === "string" && /^\d{13}$/.test(timestamp) ? Number(timestamp) : NaN;
  if (!string(timestamp, 32) || !uuid(rid) || !string(signature, 128) || !Number.isFinite(timestampMs) || Math.abs(now - timestampMs) > SKEW_MS) return finish(401, { code: "invalid_request_signature" });
  const expected = `sha256=${sign(`${timestamp}\n${rid}\n${req.method}\n${url.pathname}\n${body.raw}`, requiredEnv(env, "WORKRATE_GATEWAY_HMAC_SECRET"))}`;
  if (!safeEqual(signature, expected) || replay.has(`request:${rid}`, now)) return finish(401, { code: "invalid_request_signature" }); replay.add(`request:${rid}`, now + SKEW_MS);
  const decoded = decode(req.headers["x-workrate-attestation"], requiredEnv(env, "GATEWAY_ATTESTATION_SECRET")) as Attestation | null;
  if (!decoded || !string(decoded.userId) || !Number.isInteger(decoded.companyId) || !string(decoded.sessionId) || !string(decoded.jti) || typeof decoded.expiresAt !== "number" || decoded.expiresAt < now || !browser(decoded.browserContext) || body.value.userId !== decoded.userId || body.value.companyId !== decoded.companyId || body.value.sessionId !== decoded.sessionId || JSON.stringify(body.value.browserContext) !== JSON.stringify(decoded.browserContext)) return finish(401, { code: "invalid_attestation" });
  const op = url.pathname.endsWith("submit") ? "submit" : url.pathname.endsWith("read") ? `read:${body.value.operation}` : "validate";
  if (operations.has(`${decoded.jti}:${op}`, now)) return finish(409, { code: "attestation_already_used" }); operations.add(`${decoded.jti}:${op}`, decoded.expiresAt);
  let headers: Record<string, string>; try { headers = fraud(decoded, env); } catch { return finish(422, { code: "fraud_data_unavailable" }); }
  const f = deps.fetch ?? fetch;
  try {
    if (url.pathname.endsWith("read")) {
      const readOperation = body.value.operation;
      if (!string(body.value.accessToken, 8192) || !string(body.value.taxpayerId, 128) || (readOperation !== "business-details" && readOperation !== "obligations")) return finish(400, { code: "invalid_read_operation" });
      const paths: Record<string, { path: string; accept: string }> = {
        "business-details": { path: `/individuals/business/details/${encodeURIComponent(body.value.taxpayerId)}/list`, accept: "application/vnd.hmrc.2.0+json" },
        obligations: { path: `/obligations/details/${encodeURIComponent(body.value.taxpayerId)}/income-and-expenditure`, accept: "application/vnd.hmrc.3.0+json" },
      };
      const target = paths[readOperation]!;
      const response = await f(`${HMRC_ORIGIN}${target.path}`, { method: "GET", signal: AbortSignal.timeout(8_000), headers: { ...headers, authorization: `Bearer ${body.value.accessToken}`, accept: target.accept } });
      health.hmrcConnectivity = response.ok ? "connected" : "unavailable";
      const result: unknown = await response.json().catch(() => null); log(response.status, response.status);
      if (!response.ok || !object(result)) return json(res, 502, requestId, { confirmed: false, code: "hmrc_read_failed" });
      return json(res, 200, requestId, { confirmed: true, data: result });
    }
    const basic = b64(`${requiredEnv(env, "HMRC_SANDBOX_CLIENT_ID")}:${requiredEnv(env, "HMRC_SANDBOX_CLIENT_SECRET")}`);
    const tokenResponse = await f(`${HMRC_ORIGIN}/oauth/token`, { method: "POST", signal: AbortSignal.timeout(8000), headers: { authorization: `Basic ${basic}`, "content-type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials" });
    const tokenBody: unknown = await tokenResponse.json().catch(() => null); const appToken = object(tokenBody) && string(tokenBody.access_token, 4096) ? tokenBody.access_token : null;
    if (!tokenResponse.ok || !appToken) { health.hmrcConnectivity = "unavailable"; return finish(502, { code: "hmrc_auth_failed" }); }
    if (op === "validate") {
      const response = await f(`${HMRC_ORIGIN}/test/fraud-prevention-headers/validate?api=self-employment-business-mtd`, { headers: { ...headers, authorization: `Bearer ${appToken}`, accept: "application/json" }, signal: AbortSignal.timeout(8000) });
       health.hmrcConnectivity = response.ok ? "connected" : "unavailable";
      const responseBody: unknown = await response.json().catch(() => null); log(response.status, response.status);
      const issues = object(responseBody) && Array.isArray(responseBody.issues) ? responseBody.issues.filter(object).map(i => ({ header: string(i.header, 128) ? i.header : "unknown", message: string(i.message, 512) ? i.message : "unspecified" })).slice(0, 20) : [];
       const outcome = object(responseBody) && ["PASS", "WARNING", "FAIL"].includes(String(responseBody.result)) ? String(responseBody.result) : response.ok ? "WARNING" : "FAIL";
       health.fraudPrevention = outcome.toLowerCase() as "pass" | "warning" | "fail";
       health.lastValidationAt = new Date(now).toISOString();
       return json(res, response.ok ? 200 : 502, requestId, { status: outcome.toLowerCase(), checkedAt: new Date(now).toISOString(), message: response.ok ? null : "HMRC fraud-header validation failed.", issues });
    }
    const path = configuredPath(requiredEnv(env, "HMRC_SANDBOX_QUARTERLY_PATH_TEMPLATE"), body.value); const accept = requiredEnv(env, "HMRC_SANDBOX_ACCEPT"); const method = env.HMRC_SANDBOX_QUARTERLY_METHOD === "PUT" ? "PUT" : env.HMRC_SANDBOX_QUARTERLY_METHOD === "POST" ? "POST" : null;
    if (!path || !method || !/^application\/[A-Za-z0-9.+-]+$/.test(accept) || !string(body.value.accessToken, 8192) || !string(body.value.idempotencyKey, 255) || !object(body.value.quarterlyPayload)) return finish(400, { code: "invalid_submission" });
    const response = await f(`${HMRC_ORIGIN}${path}`, { method, signal: AbortSignal.timeout(10_000), headers: { ...headers, authorization: `Bearer ${body.value.accessToken}`, accept, "content-type": "application/json", "X-Idempotency-Key": body.value.idempotencyKey }, body: JSON.stringify(body.value.quarterlyPayload) });
    health.hmrcConnectivity = response.ok ? "connected" : "unavailable";
    log(response.status, response.status); const ref = response.headers.get("x-correlationid") ?? response.headers.get("location") ?? ""; const validRef = /^[A-Za-z0-9._:/-]{1,200}$/.test(ref);
    return json(res, response.ok && validRef ? 200 : 502, requestId, response.ok && validRef ? { confirmed: true, reference: ref } : { confirmed: false, code: "hmrc_submission_unconfirmed" });
  } catch { health.hmrcConnectivity = "unavailable"; return finish(504, { code: "hmrc_timeout" }); }
}
export function createGateway(deps: GatewayDeps = {}) { return createServer((req, res) => void app(req, res, deps)); }
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) createGateway().listen(Number(process.env.PORT ?? 8081), "127.0.0.1");