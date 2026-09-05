const STRIPE_API_BASE = "https://api.stripe.com/v1";
export const WORKRATE_STRIPE_TEST_ACCOUNT_ID = "acct_1UC1BkDeP2oLIigw";

export class StripeApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
type Form = Record<string, string | number | boolean | undefined>;

function stripeSecretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key?.startsWith("sk_test_")) throw new Error("Stripe test-mode credentials are required.");
  return key;
}

export function assertExpectedStripeTestAccount(input: { key: string | undefined; accountId: string | undefined; livemode: boolean | undefined }): void {
  if (!input.key?.startsWith("sk_test_") || input.accountId !== WORKRATE_STRIPE_TEST_ACCOUNT_ID || input.livemode !== false) {
    throw new Error("Stripe account safety check failed.");
  }
}

/** Direct Stripe REST client, hard-locked to WorkRate's authoritative test account. */
export class StripeApiClient {
  private safetyCheck?: Promise<void>;
  private async rawRequest<T>(method: "GET" | "POST" | "DELETE", path: string, form?: Form, extraHeaders?: Record<string, string>): Promise<T> {
    const query = form && method === "GET" ? `?${new URLSearchParams(Object.entries(form).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]))}` : "";
    const body = form && method === "POST" ? new URLSearchParams(Object.entries(form).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)])).toString() : undefined;
    const response = await fetch(`${STRIPE_API_BASE}/${path.replace(/^\//, "")}${query}`, {
      method,
      body,
      headers: {
        Authorization: `Bearer ${stripeSecretKey()}`,
        ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
        ...extraHeaders,
      },
    });
    const parsed: any = await response.json().catch(() => ({}));
    if (!response.ok) throw new StripeApiError(parsed?.error?.message ?? `Stripe request failed (${response.status})`, response.status);
    return parsed as T;
  }
  async assertTestAccount(): Promise<void> {
    this.safetyCheck ??= (async () => {
      const [account, balance] = await Promise.all([
        this.rawRequest<{ id?: string }>("GET", "account"),
        this.rawRequest<{ livemode?: boolean }>("GET", "balance"),
      ]);
      assertExpectedStripeTestAccount({ key: process.env.STRIPE_SECRET_KEY, accountId: account.id, livemode: balance.livemode });
    })();
    return this.safetyCheck;
  }
  async request<T>(method: "GET" | "POST" | "DELETE", path: string, form?: Form, extraHeaders?: Record<string, string>): Promise<T> {
    await this.assertTestAccount();
    return this.rawRequest<T>(method, path, form, extraHeaders);
  }
  get<T>(path: string, query?: Form) { return this.request<T>("GET", path, query); }
  post<T>(path: string, form?: Form, headers?: Record<string, string>) {
    return this.request<T>("POST", path, form && { ...form }, headers);
  }
  delete<T>(path: string) { return this.request<T>("DELETE", path); }
}