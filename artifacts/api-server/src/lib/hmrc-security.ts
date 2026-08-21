import { isIP } from "node:net";

type RequestLike = {
  ip?: unknown;
  get(name: string): string | undefined;
};

type ResponseLike = {
  status(code: number): ResponseLike;
  json(body: unknown): void;
};

type Next = () => void;

function isCidr(value: string): boolean {
  const [address, prefix, ...rest] = value.split("/");
  const version = isIP(address);
  const maxPrefix = version === 4 ? 32 : version === 6 ? 128 : -1;
  return (
    rest.length === 0 &&
    /^\d+$/.test(prefix ?? "") &&
    Number(prefix) >= 0 &&
    Number(prefix) <= maxPrefix
  );
}

/**
 * Parse the only proxy addresses allowed to supply client-forwarded headers.
 * A bare IP, hostname, or wildcard is deliberately not enough: operators must
 * provide the exact CIDR(s) of their controlled proxy chain.
 */
export function getHmrcTrustedProxyCidrs(rawValue = process.env.HMRC_TRUSTED_PROXY_CIDRS): string[] {
  const cidrs = (rawValue ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (cidrs.some((cidr) => !isCidr(cidr))) {
    throw new Error("HMRC_TRUSTED_PROXY_CIDRS must contain exact IPv4 or IPv6 CIDRs.");
  }
  return cidrs;
}

export function hmrcTrustProxySetting(rawValue = process.env.HMRC_TRUSTED_PROXY_CIDRS): string | string[] {
  const cidrs = getHmrcTrustedProxyCidrs(rawValue);
  return cidrs.length ? cidrs : "loopback";
}

/**
 * Do not allow local loopback proxying alone to make a forwarded IP usable for
 * HMRC fraud-prevention headers. That data is accepted only after the
 * deployment explicitly identifies its controlled proxy CIDRs.
 */
export function hmrcClientIp(req: Pick<RequestLike, "ip">, rawValue = process.env.HMRC_TRUSTED_PROXY_CIDRS): string {
  return getHmrcTrustedProxyCidrs(rawValue).length > 0 && typeof req.ip === "string" ? req.ip : "";
}

export function requireHmrcSameOrigin(req: RequestLike, res: ResponseLike, next: Next): void {
  const origin = req.get("origin");
  // X-Forwarded-Host is client-controlled at this layer. Even when Express
  // trusts a proxy for req.ip, reading this header directly would let an
  // attacker pair a forged host with their Origin and bypass CSRF protection.
  const host = req.get("host");
  if (!origin || !host) {
    res.status(403).json({ error: "HMRC connection actions require a same-origin browser request." });
    return;
  }
  try {
    if (new URL(origin).host !== host) {
      res.status(403).json({ error: "HMRC connection actions require a same-origin browser request." });
      return;
    }
  } catch {
    res.status(403).json({ error: "HMRC connection actions require a same-origin browser request." });
    return;
  }
  next();
}