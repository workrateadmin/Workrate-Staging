import { ReplitConnectors } from "@replit/connectors-sdk";

export class StripeConnectorClient {
  private readonly connectors = new ReplitConnectors();
  async get<T>(path: string, query: Record<string, string | number | boolean | undefined> = {}): Promise<T> {
    const params = new URLSearchParams(Object.entries(query).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]));
    const response = await this.connectors.proxy("stripe", `/v1/${path.replace(/^\//, "")}${params.size ? `?${params}` : ""}`, { method: "GET" });
    const data: any = await response.json();
    if (!response.ok) throw new Error(data?.error?.message ?? `Stripe request failed (${response.status})`);
    return data as T;
  }
  async post<T>(path: string, form: Record<string, string | number | boolean | undefined>): Promise<T> {
    const body = new URLSearchParams(Object.entries(form).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)])).toString();
    const response = await this.connectors.proxy("stripe", `/v1/${path.replace(/^\//, "")}`, { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" } });
    const data: any = await response.json();
    if (!response.ok) throw new Error(data?.error?.message ?? `Stripe request failed (${response.status})`);
    return data as T;
  }
}