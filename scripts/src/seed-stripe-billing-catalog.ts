import { StripeConnectorClient } from "./stripeClient";
const plans = [{ code: "core", name: "Core", monthly: 2900, trial: 500 }, { code: "complete", name: "Complete", monthly: 9900, trial: 2000 }] as const;
type Product = { id: string }; type Price = { id: string; unit_amount: number; recurring?: unknown; metadata?: Record<string, string> };
async function ensurePrice(stripe: StripeConnectorClient, product: string, amount: number, recurring: boolean, kind: string) {
  const prices = await stripe.get<{ data: Price[] }>("prices", { product, active: true, limit: 100 });
  if (prices.data.some((price) => price.unit_amount === amount && Boolean(price.recurring) === recurring && price.metadata?.billing_kind === kind)) return;
  await stripe.post("prices", { product, currency: "gbp", unit_amount: amount, ...(recurring ? { "recurring[interval]": "month" } : {}), "metadata[billing_kind]": kind });
}
async function seed() {
  const stripe = new StripeConnectorClient();
  for (const plan of plans) {
    const found = await stripe.get<{ data: Product[] }>("products/search", { query: `metadata['workrate_plan_code']:'${plan.code}'` });
    const product = found.data[0] ?? await stripe.post<Product>("products", { name: `WorkRate ${plan.name}`, "metadata[workrate_plan_code]": plan.code });
    await ensurePrice(stripe, product.id, plan.monthly, true, "monthly");
    await ensurePrice(stripe, product.id, plan.trial, false, "paid_trial");
    console.info(`Ensured Stripe catalog for ${plan.code}.`);
  }
}
seed().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });