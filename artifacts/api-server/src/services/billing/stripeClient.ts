import { ReplitConnectors } from "@replit/connectors-sdk";

export class StripeConnectorError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
type Form = Record<string, string | number | boolean | undefined>;

/** Stripe REST through Replit's authenticated connector proxy; no API key is exposed. */
export class StripeConnectorClient {
  constructor(private readonly connectors = new ReplitConnectors()) {}
  async request<T>(method: "GET" | "POST" | "DELETE", path: string, form?: Form, extraHeaders?: Record<string, string>): Promise<T> {
    const query = form && method === "GET" ? `?${new URLSearchParams(Object.entries(form).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]))}` : "";
    const body = form && method === "POST" ? new URLSearchParams(Object.entries(form).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)])).toString() : undefined;
    const response = await this.connectors.proxy("stripe", `/v1/${path.replace(/^\//, "")}${query}`, {
      method, body, headers: { ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}), ...extraHeaders },
    });
    const parsed: any = await response.json().catch(() => ({}));
    if (!response.ok) throw new StripeConnectorError(parsed?.error?.message ?? `Stripe request failed (${response.status})`, response.status);
    return parsed as T;
  }
  get<T>(path: string, query?: Form) { return this.request<T>("GET", path, query); }
  post<T>(path: string, form?: Form, headers?: Record<string, string>) {
    return this.request<T>("POST", path, form && { ...form }, headers);
  }
  delete<T>(path: string) { return this.request<T>("DELETE", path); }
}