import { and, eq } from "drizzle-orm";
import { billingReceptionistTopUpPacksTable, db } from "@workspace/db";
import { StripeApiClient } from "./stripeClient";

type StripeMetadata = Record<string, string>;
type StripeProduct = { id: string; active?: boolean; livemode?: boolean; metadata?: StripeMetadata };
type StripePrice = {
  id: string; active?: boolean; livemode?: boolean; product?: string; currency?: string;
  unit_amount?: number; recurring?: unknown; metadata?: StripeMetadata;
};

const PACKS = [
  { code: "minutes_100", minutes: 100, pricePence: 1200, name: "AI Receptionist +100 minutes" },
  { code: "minutes_250", minutes: 250, pricePence: 2500, name: "AI Receptionist +250 minutes" },
  { code: "minutes_500", minutes: 500, pricePence: 4500, name: "AI Receptionist +500 minutes" },
] as const;

const productMatches = (product: StripeProduct, code: string) =>
  product.active === true
  && product.livemode === false
  && product.metadata?.workrate_pack_code === code
  && product.metadata?.billing_kind === "ai_receptionist_top_up";

const priceMatches = (price: StripePrice, productId: string, code: string, pricePence: number) =>
  price.active === true
  && price.livemode === false
  && price.product === productId
  && price.currency === "gbp"
  && price.unit_amount === pricePence
  && !price.recurring
  && price.metadata?.workrate_pack_code === code
  && price.metadata?.billing_kind === "ai_receptionist_top_up";

async function ensureProduct(stripe: StripeApiClient, pack: typeof PACKS[number]) {
  const matches = await stripe.get<{ data: StripeProduct[] }>("products/search", {
    query: `active:'true' AND metadata['workrate_pack_code']:'${pack.code}'`,
  });
  const existing = matches.data.find((product) => productMatches(product, pack.code));
  if (existing) return existing;
  const created = await stripe.post<StripeProduct>("products", {
    name: pack.name,
    "metadata[workrate_pack_code]": pack.code,
    "metadata[billing_kind]": "ai_receptionist_top_up",
  }, `workrate-receptionist-top-up-${pack.code}-product`);
  if (!productMatches(created, pack.code)) throw new Error(`Stripe product validation failed for ${pack.code}.`);
  return created;
}

async function ensurePrice(stripe: StripeApiClient, productId: string, pack: typeof PACKS[number]) {
  const prices = await stripe.get<{ data: StripePrice[] }>("prices", { product: productId, active: true, limit: 100 });
  const existing = prices.data.find((price) => priceMatches(price, productId, pack.code, pack.pricePence));
  if (existing) return existing;
  const created = await stripe.post<StripePrice>("prices", {
    product: productId,
    currency: "gbp",
    unit_amount: pack.pricePence,
    "metadata[workrate_pack_code]": pack.code,
    "metadata[billing_kind]": "ai_receptionist_top_up",
  }, `workrate-receptionist-top-up-${pack.code}-price-${pack.pricePence}`);
  if (!priceMatches(created, productId, pack.code, pack.pricePence)) throw new Error(`Stripe price validation failed for ${pack.code}.`);
  return created;
}

async function seed() {
  const stripe = new StripeApiClient();
  await stripe.assertTestAccount();
  for (const pack of PACKS) {
    const [stored] = await db.select().from(billingReceptionistTopUpPacksTable)
      .where(eq(billingReceptionistTopUpPacksTable.code, pack.code)).limit(1);
    if (!stored || stored.minutes !== pack.minutes || stored.currency !== "gbp" || stored.expiryPolicy !== "period_end") {
      throw new Error(`Expected receptionist top-up pack ${pack.code} is missing or invalid.`);
    }

    const product = await ensureProduct(stripe, pack);
    // Re-read objects: a created/reused ID is never trusted without full validation.
    const verifiedProduct = await stripe.get<StripeProduct>(`products/${product.id}`);
    if (!productMatches(verifiedProduct, pack.code)) throw new Error(`Stripe product validation failed for ${pack.code}.`);
    const price = await ensurePrice(stripe, verifiedProduct.id, pack);
    const verifiedPrice = await stripe.get<StripePrice>(`prices/${price.id}`);
    if (!priceMatches(verifiedPrice, verifiedProduct.id, pack.code, pack.pricePence)) {
      throw new Error(`Stripe price validation failed for ${pack.code}.`);
    }

    await db.update(billingReceptionistTopUpPacksTable).set({
      customerPriceGbp: (pack.pricePence / 100).toFixed(2),
      currency: "gbp",
      active: true,
      stripeProductId: verifiedProduct.id,
      stripePriceId: verifiedPrice.id,
      stripeMappingValidatedAt: new Date(),
    }).where(and(eq(billingReceptionistTopUpPacksTable.code, pack.code), eq(billingReceptionistTopUpPacksTable.minutes, pack.minutes)));
    console.info(`Ensured receptionist top-up ${pack.code}: ${verifiedProduct.id}/${verifiedPrice.id}.`);
  }
}

seed().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});