import { StripeApiClient } from "./stripeClient";
import { db, billingAddOnsTable, billingPlansTable } from "@workspace/db";
import { eq } from "drizzle-orm";
type Product = { id: string; active?: boolean }; type Price = { id: string; product?: string; active?: boolean; currency?: string; unit_amount: number; recurring?: unknown; metadata?: Record<string, string> };
function trialPriceGbp(item: { monthlyPriceGbp: string | null; trialPercentage: string | null; manualTrialPriceGbp: string | null }) {
  if (item.manualTrialPriceGbp != null) return Number(item.manualTrialPriceGbp);
  return Math.round(Number(item.monthlyPriceGbp) * Number(item.trialPercentage ?? 50)) / 100;
}
async function ensurePrice(stripe: StripeApiClient, product: string, amount: number, recurring: boolean, kind: string, catalogCode: string) {
  const prices = await stripe.get<{ data: Price[] }>("prices", { product, active: true, limit: 100 });
  const existing = prices.data.find((price) => price.unit_amount === amount && Boolean(price.recurring) === recurring && price.metadata?.billing_kind === kind);
  if (existing) return existing.id;
  const created = await stripe.post<Price>(
    "prices",
    { product, currency: "gbp", unit_amount: amount, ...(recurring ? { "recurring[interval]": "month" } : {}), "metadata[billing_kind]": kind },
    `workrate-catalog-${catalogCode}-${kind}-${amount}`,
  );
  return created.id;
}
async function seed() {
  const stripe = new StripeApiClient();
  await stripe.assertTestAccount();
  const items = [
    ...(await db.select().from(billingPlansTable)).map((row) => ({ row, table: billingPlansTable, metadataKey: "workrate_plan_code" })),
    ...(await db.select().from(billingAddOnsTable)).map((row) => ({ row, table: billingAddOnsTable, metadataKey: "workrate_add_on_code" })),
  ];
  for (const item of items) {
    if (item.row.monthlyPriceGbp == null) continue; // deliberately configuration-required
    const found = await stripe.get<{ data: Product[] }>("products/search", { query: `active:'true' AND metadata['${item.metadataKey}']:'${item.row.code}'` });
    const product = found.data[0] ?? await stripe.post<Product>(
      "products",
      { name: `WorkRate ${item.row.name}`, description: item.row.description ?? undefined, [`metadata[${item.metadataKey}]`]: item.row.code },
      `workrate-catalog-${item.row.code}-product`,
    );
    const monthly = await ensurePrice(stripe, product.id, Math.round(Number(item.row.monthlyPriceGbp) * 100), true, "monthly", item.row.code);
    const trial = await ensurePrice(stripe, product.id, Math.round((trialPriceGbp(item.row) ?? 0) * 100), false, "paid_trial", item.row.code);
    const [monthlyPrice, trialPrice] = await Promise.all([stripe.get<Price>(`prices/${monthly}`), stripe.get<Price>(`prices/${trial}`)]);
    const expectedMonthly = Math.round(Number(item.row.monthlyPriceGbp) * 100);
    const expectedTrial = Math.round((trialPriceGbp(item.row) ?? 0) * 100);
    if (!monthlyPrice.active || monthlyPrice.currency !== "gbp" || monthlyPrice.product !== product.id || monthlyPrice.unit_amount !== expectedMonthly || !monthlyPrice.recurring || monthlyPrice.metadata?.billing_kind !== "monthly" || !trialPrice.active || trialPrice.currency !== "gbp" || trialPrice.product !== product.id || trialPrice.unit_amount !== expectedTrial || trialPrice.recurring || trialPrice.metadata?.billing_kind !== "paid_trial") {
      throw new Error(`Stripe mapping validation failed for ${item.row.code}.`);
    }
    await db.update(item.table).set({ stripeProductId: product.id, stripeRecurringPriceId: monthly, stripeTrialPriceId: trial, stripeMappingValidatedAt: new Date() } as any).where(eq(item.table.code, item.row.code));
    console.info(`Ensured Stripe catalog for ${item.row.code}.`);
  }
}
seed().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });