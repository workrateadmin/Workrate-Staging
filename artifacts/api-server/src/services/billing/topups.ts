import { and, eq, sql } from "drizzle-orm";
import { billingReceptionistTopUpPacksTable, billingReceptionistTopUpPurchasesTable, companySubscriptionsTable, db } from "@workspace/db";
import { featureAccess, tenantEntitlements } from "./authorization";
import { StripeApiClient } from "./stripeClient";
import { isStripeBillingReady } from "./readiness";

type StripeApi = Pick<StripeApiClient, "get" | "post">;
const returnUrl = () => {
  const host = process.env.REPLIT_DOMAINS?.split(",")[0];
  if (!host) throw new Error("REPLIT_DOMAINS is required to create hosted billing sessions.");
  return `https://${host}/settings/billing`;
};

function unavailable(error: unknown) {
  if (error instanceof Error && /credential|required|not connected/i.test(error.message)) {
    return { ok: false as const, code: "PAYMENT_SETUP_UNAVAILABLE" as const, message: "Payments are not configured yet. No payment was created." };
  }
  throw error;
}

/** Validates the remote one-time price against the immutable server catalogue. */
export async function verifyTopUpPrice(pack: any, stripe: StripeApi, requireValidated = true) {
  if (!pack.active || pack.customerPriceGbp == null || pack.currency !== "gbp" || !pack.stripeProductId || !pack.stripePriceId || (requireValidated && !pack.stripeMappingValidatedAt)) {
    throw new Error("Top-up billing configuration required.");
  }
  const [product, price]: any[] = await Promise.all([
    stripe.get(`products/${pack.stripeProductId}`),
    stripe.get(`prices/${pack.stripePriceId}`),
  ]);
  const expected = Math.round(Number(pack.customerPriceGbp) * 100);
  if (!product?.active || product.metadata?.workrate_pack_code !== pack.code || product.metadata?.billing_kind !== "ai_receptionist_top_up"
    || !price?.active || price.product !== pack.stripeProductId || price.currency !== "gbp" || price.recurring || price.unit_amount !== expected
    || price.metadata?.workrate_pack_code !== pack.code || price.metadata?.billing_kind !== "ai_receptionist_top_up") {
    throw new Error("Top-up billing configuration required.");
  }
  return price.id as string;
}

export async function listReceptionistTopUps() {
  const packs = await db.select().from(billingReceptionistTopUpPacksTable)
    .orderBy(billingReceptionistTopUpPacksTable.sortOrder, billingReceptionistTopUpPacksTable.id);
  return packs.map((pack) => {
    const purchasable = Boolean(pack.active && pack.customerPriceGbp != null && pack.stripeProductId && pack.stripePriceId && pack.stripeMappingValidatedAt);
    return { code: pack.code, name: pack.name, minutes: pack.minutes, customerPriceGbp: pack.customerPriceGbp == null ? null : Number(pack.customerPriceGbp), currency: pack.currency, expiryPolicy: pack.expiryPolicy, active: pack.active, sortOrder: pack.sortOrder, purchasable, configurationMessage: purchasable ? null : "Price not set" };
  });
}

export async function createReceptionistTopUpCheckout(input: { companyId: number; ownerUserId: string; packCode: string }, stripe: StripeApi = new StripeApiClient(), isReady: () => boolean = isStripeBillingReady) {
  try {
    // This is deliberately before every database mutation or Stripe request.
    if (!isReady()) return { ok: false as const, code: "PAYMENT_SETUP_UNAVAILABLE" as const, message: "Payments are not configured yet. No payment was created." };
    const entitlement = await tenantEntitlements(input.ownerUserId);
    if (featureAccess(entitlement, "ai_receptionist")) throw new Error("AI Receptionist entitlement is required to purchase extra minutes.");
    const [subscription, pack] = await Promise.all([
      db.select().from(companySubscriptionsTable).where(and(eq(companySubscriptionsTable.companyId, input.companyId), eq(companySubscriptionsTable.ownerUserId, input.ownerUserId))).limit(1),
      db.select().from(billingReceptionistTopUpPacksTable).where(eq(billingReceptionistTopUpPacksTable.code, input.packCode)).limit(1),
    ]);
    const current = subscription[0];
    if (!current || current.provider !== "stripe" || !["active", "trialing"].includes(current.status) || !current.currentPeriodStartsAt || !current.currentPeriodEndsAt) {
      throw new Error("An active Stripe billing period is required to purchase extra minutes.");
    }
    if (!pack[0]) throw new Error("Top-up pack not found.");
    const priceId = await verifyTopUpPrice(pack[0], stripe);
    if (!current.providerSubscriptionId) throw new Error("An active Stripe subscription is required to purchase extra minutes.");
    const remoteSubscription: any = await stripe.get(`subscriptions/${encodeURIComponent(current.providerSubscriptionId)}`);
    const startsAt = remoteSubscription.current_period_start ? new Date(remoteSubscription.current_period_start * 1000) : null;
    const endsAt = remoteSubscription.current_period_end ? new Date(remoteSubscription.current_period_end * 1000) : null;
    if (!["active", "trialing"].includes(remoteSubscription.status) || !startsAt || !endsAt) throw new Error("Stripe did not confirm an active billing period.");
    // Do not trust stale local period data for a new paid allocation.
    await db.update(companySubscriptionsTable).set({ status: remoteSubscription.status, currentPeriodStartsAt: startsAt, currentPeriodEndsAt: endsAt })
      .where(and(eq(companySubscriptionsTable.companyId, input.companyId), eq(companySubscriptionsTable.ownerUserId, input.ownerUserId)));
    const [purchase] = await db.insert(billingReceptionistTopUpPurchasesTable).values({
      companyId: input.companyId, ownerUserId: input.ownerUserId, packCode: pack[0].code, packMinutes: pack[0].minutes,
      customerPriceGbp: pack[0].customerPriceGbp!, currency: "gbp", expiryPolicy: pack[0].expiryPolicy,
      periodStartsAt: startsAt, periodEndsAt: endsAt,
    }).returning();
    const session: any = await stripe.post("checkout/sessions", {
      mode: "payment", ...(current.providerCustomerId ? { customer: current.providerCustomerId } : {}),
      success_url: `${returnUrl()}?topup=success`, cancel_url: `${returnUrl()}?topup=cancelled`,
      "line_items[0][price]": priceId, "line_items[0][quantity]": 1,
      "metadata[billing_kind]": "ai_receptionist_top_up", "metadata[purchaseId]": purchase.id,
      "metadata[companyId]": input.companyId, "metadata[ownerUserId]": input.ownerUserId, "metadata[packCode]": pack[0].code,
    }, { "Idempotency-Key": `workrate-topup-${purchase.id}` });
    if (!session?.id || !session.url) throw new Error("Stripe did not return a hosted checkout URL.");
    await db.update(billingReceptionistTopUpPurchasesTable).set({ stripeCheckoutSessionId: session.id }).where(eq(billingReceptionistTopUpPurchasesTable.id, purchase.id));
    return { ok: true as const, url: session.url, purchaseId: purchase.id };
  } catch (error) { return unavailable(error); }
}

/** Called only after signature verification and canonical Stripe event retrieval. */
export async function grantReceptionistTopUpFromStripeSession(session: any, stripe: StripeApi = new StripeApiClient()) {
  if (session?.mode !== "payment" || session?.payment_status !== "paid" || session.metadata?.billing_kind !== "ai_receptionist_top_up") return "ignored" as const;
  const purchaseId = Number(session.metadata.purchaseId);
  if (!Number.isSafeInteger(purchaseId)) return "ignored" as const;
  // Fetching the session ourselves prevents signed event payload fields becoming purchase truth.
  const canonical: any = await stripe.get(`checkout/sessions/${encodeURIComponent(session.id)}`);
  if (canonical.id !== session.id || canonical.mode !== "payment" || canonical.payment_status !== "paid") throw new Error("Canonical Checkout payment verification failed.");
  const lineItems: any = await stripe.get(`checkout/sessions/${encodeURIComponent(session.id)}/line_items`, { limit: 10 });
  const paymentIntent = typeof canonical.payment_intent === "string" ? canonical.payment_intent : canonical.payment_intent?.id;
  if (!paymentIntent) throw new Error("Paid Checkout session has no payment identity.");
  return db.transaction(async (tx: any) => {
    const found: any = await tx.execute(sql`SELECT * FROM billing_receptionist_top_up_purchases WHERE id=${purchaseId} FOR UPDATE`);
    const purchase = found.rows?.[0];
    if (!purchase) return "ignored" as const;
    if (purchase.status === "granted") return "duplicate" as const;
    if (purchase.company_id !== Number(canonical.metadata?.companyId) || purchase.owner_user_id !== canonical.metadata?.ownerUserId || purchase.pack_code !== canonical.metadata?.packCode || purchase.stripe_checkout_session_id !== canonical.id) {
      throw new Error("Top-up Checkout metadata identity mismatch.");
    }
    if (canonical.currency !== purchase.currency || Number(canonical.amount_total) !== Math.round(Number(purchase.customer_price_gbp) * 100)) throw new Error("Top-up Checkout amount mismatch.");
    const [pack] = await tx.select().from(billingReceptionistTopUpPacksTable).where(eq(billingReceptionistTopUpPacksTable.code, purchase.pack_code)).limit(1);
    const item = lineItems?.data?.[0];
    const itemPriceId = typeof item?.price === "string" ? item.price : item?.price?.id;
    const itemProductId = typeof item?.price?.product === "string" ? item.price.product : item?.price?.product?.id;
    if (lineItems?.data?.length !== 1 || item?.quantity !== 1 || !pack || !pack.active || !pack.stripePriceId || !pack.stripeProductId
      || itemPriceId !== pack.stripePriceId || itemProductId !== pack.stripeProductId) {
      throw new Error("Top-up Checkout price mapping mismatch.");
    }
    const current: any = await tx.select().from(companySubscriptionsTable).where(and(eq(companySubscriptionsTable.companyId, purchase.company_id), eq(companySubscriptionsTable.ownerUserId, purchase.owner_user_id))).limit(1);
    if (!current[0] || current[0].provider !== "stripe" || !current[0].providerSubscriptionId) {
      throw new Error("An active Stripe billing period is required to grant a top-up.");
    }
    // Webhooks can arrive before local subscription synchronization. Stripe's
    // current subscription period, not the possibly stale local projection, is
    // authoritative for deciding whether this Checkout can still add allowance.
    const stripeSubscription: any = await stripe.get(`subscriptions/${encodeURIComponent(current[0].providerSubscriptionId)}`);
    const stripeStartsAt = stripeSubscription?.current_period_start ? new Date(stripeSubscription.current_period_start * 1000) : null;
    const stripeEndsAt = stripeSubscription?.current_period_end ? new Date(stripeSubscription.current_period_end * 1000) : null;
    if (stripeSubscription?.id !== current[0].providerSubscriptionId || !["active", "trialing"].includes(stripeSubscription?.status)
      || !stripeStartsAt || !stripeEndsAt
      || stripeStartsAt.getTime() !== new Date(purchase.period_starts_at).getTime()
      || stripeEndsAt.getTime() !== new Date(purchase.period_ends_at).getTime()) {
      throw new Error("Top-up billing period no longer matches.");
    }
    const updated: any = await tx.execute(sql`
      UPDATE billing_receptionist_top_up_purchases SET status='granted', granted_at=now(), stripe_payment_intent_id=${paymentIntent}, updated_at=now()
      WHERE id=${purchaseId} AND status='pending' AND stripe_payment_intent_id IS NULL
      RETURNING id`);
    return updated.rows?.length ? "granted" as const : "duplicate" as const;
  });
}