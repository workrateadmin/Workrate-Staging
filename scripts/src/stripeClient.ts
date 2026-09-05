const STRIPE_API_BASE = "https://api.stripe.com/v1";
export const WORKRATE_STRIPE_TEST_ACCOUNT_ID = "acct_1UC1BkDeP2oLIigw";
type Form = Record<string, string | number | boolean | undefined>;

function stripeSecretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key?.startsWith("sk_test_")) throw new Error("Stripe test-mode credentials are required.");
  return key;
}

export class StripeApiClient {
  private safetyCheck?: Promise<void>;
  private async raw<T>(method: "GET" | "POST" | "DELETE", path: string, form: Form = {}): Promise<T> {
    const params = new URLSearchParams(Object.entries(form).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]));
    const body = method === "POST" ? params.toString() : undefined;
    const response = await fetch(`${STRIPE_API_BASE}/${path.replace(/^\//, "")}${method === "GET" && params.size ? `?${params}` : ""}`, {
      method,
      body,
      headers: { Authorization: `Bearer ${stripeSecretKey()}`, ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    });
    const data: any = await response.json();
    if (!response.ok) throw new Error(data?.error?.message ?? `Stripe request failed (${response.status})`);
    return data as T;
  }
  async assertTestAccount(): Promise<void> {
    this.safetyCheck ??= (async () => {
      const [account, balance] = await Promise.all([
        this.raw<{ id?: string }>("GET", "account"),
        this.raw<{ livemode?: boolean }>("GET", "balance"),
      ]);
      if (account.id !== WORKRATE_STRIPE_TEST_ACCOUNT_ID || balance.livemode !== false) throw new Error("Stripe account safety check failed.");
    })();
    return this.safetyCheck;
  }
  async get<T>(path: string, query: Form = {}): Promise<T> { await this.assertTestAccount(); return this.raw<T>("GET", path, query); }
  async post<T>(path: string, form: Form): Promise<T> { await this.assertTestAccount(); return this.raw<T>("POST", path, form); }
}