import { and, eq, sql } from "drizzle-orm";
import { billingAddOnsTable, billingCheckoutAttemptsTable, billingPlansTable, billingWebhookEventsTable, companySubscriptionsTable, db } from "@workspace/db";
import { StripeApiClient } from "./stripeClient";
import { canonicalEventId, checkoutIdempotencyKey, checkoutLineItems, mapStripeSubscriptionStatus, requireCanonicalEventId, verifyStripeSignature } from "./lifecycle";
import { trialPriceGbp } from "./pricing";
import { grantReceptionistTopUpFromStripeSession } from "./topups";
import { isStripeBillingReady, setStripeBillingReady } from "./readiness";

export type PaymentSetupUnavailable = { ok: false; code: "PAYMENT_SETUP_UNAVAILABLE"; message: string };
export type ProviderResult = PaymentSetupUnavailable | { ok: true; url?: string; status?: string };
export interface BillingProvider {
  createCheckoutSession(input: { companyId: number; ownerUserId: string; planCode: string; addOnCodes: string[] }): Promise<ProviderResult>;
  createCustomerPortalSession(input: { companyId: number; ownerUserId: string }): Promise<ProviderResult>;
  getSubscriptionStatus(input: { companyId: number; ownerUserId: string }): Promise<ProviderResult>;
  cancelSubscription(input: { companyId: number; ownerUserId: string }): Promise<ProviderResult>;
  syncSubscription(input: { companyId: number; ownerUserId: string }): Promise<ProviderResult>;
  applySelection(input: { companyId: number; ownerUserId: string; planCode: string; addOnCodes: string[] }): Promise<ProviderResult>;
  verifyWebhook(input: { payload: Buffer; signature?: string }): Promise<ProviderResult>;
}
const unavailable = (): PaymentSetupUnavailable => ({ ok: false, code: "PAYMENT_SETUP_UNAVAILABLE", message: "Payments are not configured yet. No payment or subscription was created." });
const returnUrl = () => {
  const host = process.env.REPLIT_DOMAINS?.split(",")[0];
  if (!host) throw new Error("REPLIT_DOMAINS is required to create hosted billing sessions.");
  return `https://${host}/settings/billing`;
};
const date = (seconds?: number | null) => seconds ? new Date(seconds * 1000) : null;
const local = (companyId: number, ownerUserId: string) => db.select().from(companySubscriptionsTable).where(and(eq(companySubscriptionsTable.companyId, companyId), eq(companySubscriptionsTable.ownerUserId, ownerUserId))).limit(1);
type StripeApi = Pick<StripeApiClient, "get" | "post">;
export interface CheckoutRepository {
  subscription(companyId: number, ownerUserId: string): Promise<any | undefined>;
  establishAttempt(input: { companyId: number; ownerUserId: string; fingerprint: string }): Promise<any>;
  updateAttempt(id: number, values: Record<string, unknown>): Promise<void>;
  updateSubscription(companyId: number, ownerUserId: string, values: Record<string, unknown>): Promise<void>;
}
export interface WebhookRepository {
  tenantForCustomer(customerId: string): Promise<{ companyId: number; ownerUserId: string } | undefined>;
  process(event: any, tenant: { companyId: number; ownerUserId: string }, subscriptionValues?: Record<string, unknown>): Promise<"processed" | "duplicate">;
}
type CatalogItem = { code: string; active: boolean; comingSoon: boolean; monthlyPriceGbp: string | null; stripeProductId: string | null; stripeRecurringPriceId: string | null; stripeTrialPriceId: string | null };
export interface BillingCatalogRepository {
  plan(code: string): Promise<CatalogItem | undefined>;
  addOns(codes: string[]): Promise<CatalogItem[]>;
}
const catalogRepository: BillingCatalogRepository = {
  async plan(code) { return (await db.select().from(billingPlansTable).where(eq(billingPlansTable.code, code)).limit(1))[0]; },
  async addOns(codes) { return Promise.all(codes.map(async (code) => (await db.select().from(billingAddOnsTable).where(eq(billingAddOnsTable.code, code)).limit(1))[0])).then((rows) => rows.filter(Boolean) as CatalogItem[]); },
};
function subscriptionState(subscription: any): Record<string, unknown> {
  const status = mapStripeSubscriptionStatus(subscription.status);
  let addOnCodes: string[] | undefined;
  try { addOnCodes = Array.isArray(subscription.metadata?.addOnCodes) ? subscription.metadata.addOnCodes : JSON.parse(subscription.metadata?.addOnCodes ?? "null"); } catch { addOnCodes = undefined; }
  return {
    status, provider: "stripe", providerCustomerId: typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
    providerSubscriptionId: subscription.id, trialEndsAt: date(subscription.trial_end),
    planCode: subscription.metadata?.planCode || undefined, addOnCodes: Array.isArray(addOnCodes) ? addOnCodes : undefined,
    pendingPlanCode: null, pendingAddOnCodes: [], currentPeriodStartsAt: date(subscription.current_period_start),
    currentPeriodEndsAt: date(subscription.current_period_end), cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    cancelledAt: status === "cancelled" ? new Date() : null, failedPaymentAt: status === "past_due" ? new Date() : null,
  };
}
const checkoutRepository: CheckoutRepository = {
  async subscription(companyId, ownerUserId) { return (await local(companyId, ownerUserId))[0]; },
  async establishAttempt(input) {
    return db.transaction(async (tx: any) => {
      // Tenant-wide lock: a changed selection must not bypass an existing
      // open or completed-but-unreconciled Checkout.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${input.companyId}:${input.ownerUserId}`}))`);
      const found: any = await tx.execute(sql`SELECT * FROM billing_checkout_attempts WHERE company_id=${input.companyId} AND owner_user_id=${input.ownerUserId} AND status NOT IN ('expired','reconciled') ORDER BY created_at DESC LIMIT 1`);
      if (found.rows?.[0]) {
        const row = found.rows[0];
        return { id: row.id, attemptKey: row.attempt_key, providerSessionId: row.provider_session_id, hostedUrl: row.hosted_url, status: row.status };
      }
      const [created] = await tx.insert(billingCheckoutAttemptsTable).values({ companyId: input.companyId, ownerUserId: input.ownerUserId, selectionFingerprint: input.fingerprint }).returning();
      return { id: created.id, attemptKey: created.attemptKey };
    });
  },
  async updateAttempt(id, values) { await db.update(billingCheckoutAttemptsTable).set(values).where(eq(billingCheckoutAttemptsTable.id, id)); },
  async updateSubscription(companyId, ownerUserId, values) { await db.update(companySubscriptionsTable).set(values).where(and(eq(companySubscriptionsTable.companyId, companyId), eq(companySubscriptionsTable.ownerUserId, ownerUserId))); },
};
const webhookRepository: WebhookRepository = {
  async tenantForCustomer(customerId) {
    const [row] = await db.select().from(companySubscriptionsTable).where(eq(companySubscriptionsTable.providerCustomerId, customerId)).limit(1);
    return row ? { companyId: row.companyId, ownerUserId: row.ownerUserId } : undefined;
  },
  async process(event, tenant, values) {
    return db.transaction(async (tx: any) => {
      const inserted = await tx.insert(billingWebhookEventsTable).values({ companyId: tenant.companyId, ownerUserId: tenant.ownerUserId, provider: "stripe", providerEventId: event.id, eventType: event.type, payload: event }).onConflictDoNothing().returning({ id: billingWebhookEventsTable.id });
      let id = inserted[0]?.id;
      if (!id) {
        const locked: any = await tx.execute(sql`SELECT id, processed_at FROM billing_webhook_events WHERE provider='stripe' AND provider_event_id=${event.id} FOR UPDATE`);
        if (locked.rows?.[0]?.processed_at) return "duplicate";
        id = locked.rows?.[0]?.id;
      }
      if (values) await tx.update(companySubscriptionsTable).set(values).where(and(eq(companySubscriptionsTable.companyId, tenant.companyId), eq(companySubscriptionsTable.ownerUserId, tenant.ownerUserId)));
      await tx.update(billingWebhookEventsTable).set({ processedAt: new Date() }).where(eq(billingWebhookEventsTable.id, id));
      return "processed";
    });
  },
};

function configurationRequired(): never { throw new Error("Billing configuration required."); }
export async function verifyCatalogPrice(item: CatalogItem, kind: "monthly" | "paid_trial", stripe: StripeApi) {
  if (!item.active || item.comingSoon || item.monthlyPriceGbp == null || !item.stripeProductId) configurationRequired();
  const id = kind === "monthly" ? item.stripeRecurringPriceId : item.stripeTrialPriceId;
  if (!id) configurationRequired();
  const price: any = await stripe.get(`prices/${id}`);
  const expectedRecurring = kind === "monthly";
  if (!price?.active || price.currency !== "gbp" || price.product !== item.stripeProductId || Boolean(price.recurring) !== expectedRecurring || price.metadata?.billing_kind !== kind) configurationRequired();
  if (expectedRecurring && price.recurring?.interval !== "month") configurationRequired();
  const expectedAmount = Math.round((kind === "monthly" ? Number(item.monthlyPriceGbp) : trialPriceGbp(item as any)!) * 100);
  if (!Number.isInteger(price.unit_amount) || price.unit_amount !== expectedAmount) configurationRequired();
  return id;
}
export { canonicalEventId, checkoutIdempotencyKey, checkoutLineItems, mapStripeSubscriptionStatus };

/** Stripe implementation remains behind this provider-neutral interface. */
export class StripeBillingProvider implements BillingProvider {
  constructor(
    private readonly connectorFactory: () => StripeApi = () => new StripeApiClient(),
    private readonly checkoutRepo: CheckoutRepository = checkoutRepository,
    private readonly webhookRepo: WebhookRepository = webhookRepository,
    private readonly catalogRepo: BillingCatalogRepository = catalogRepository,
    private readonly webhookSecret: () => string | undefined = () => process.env.STRIPE_WEBHOOK_SECRET,
    private readonly isReady: () => boolean = () => true,
  ) {}
  async createCheckoutSession(input: { companyId: number; ownerUserId: string; planCode: string; addOnCodes: string[] }): Promise<ProviderResult> {
    if (!this.isReady()) return unavailable();
    if (!input.planCode) return unavailable();
    try {
      const existing = await this.checkoutRepo.subscription(input.companyId, input.ownerUserId);
      if (existing && ["trialing", "active"].includes(existing.status)) throw new Error("An active subscription already exists.");
      const stripe = this.connectorFactory();
      const plan = await this.catalogRepo.plan(input.planCode);
      if (!plan) configurationRequired();
      const addOns = await this.catalogRepo.addOns(input.addOnCodes);
      if (addOns.length !== input.addOnCodes.length || new Set(input.addOnCodes).size !== input.addOnCodes.length || input.planCode === "complete" && addOns.length) configurationRequired();
      const monthly = await verifyCatalogPrice(plan, "monthly", stripe);
      const trial = await verifyCatalogPrice(plan, "paid_trial", stripe);
      const addOnPrices = await Promise.all(addOns.map((addOn) => verifyCatalogPrice(addOn, "monthly", stripe)));
      const addOnTrialPrices = await Promise.all(addOns.map((addOn) => verifyCatalogPrice(addOn, "paid_trial", stripe)));
      const fingerprint = JSON.stringify({ planCode: input.planCode, addOnCodes: [...input.addOnCodes].sort() });
      const attempt: any = await this.checkoutRepo.establishAttempt({ companyId: input.companyId, ownerUserId: input.ownerUserId, fingerprint });
      if (attempt.providerSessionId) {
        const hosted: any = await stripe.get(`checkout/sessions/${attempt.providerSessionId}`);
        if (hosted.status === "open" && hosted.url) return { ok: true, url: hosted.url };
        if (hosted.subscription) {
          const current: any = await stripe.get(`subscriptions/${typeof hosted.subscription === "string" ? hosted.subscription : hosted.subscription.id}`);
          await this.applySubscription(current, input.companyId, input.ownerUserId);
          await this.checkoutRepo.updateAttempt(attempt.id, { status: "reconciled" });
          return { ok: true, url: hosted.url ?? attempt.hostedUrl, status: "complete" };
        }
        if (hosted.status === "complete") return { ok: true, url: hosted.url ?? attempt.hostedUrl, status: "complete" };
        await this.checkoutRepo.updateAttempt(attempt.id, { status: hosted.status ?? "expired" });
        return this.createCheckoutSession(input);
      }
      const form: any = { mode: "subscription", customer: existing?.providerCustomerId, client_reference_id: `${input.companyId}:${input.ownerUserId}`, success_url: `${returnUrl()}?checkout=success`, cancel_url: `${returnUrl()}?checkout=cancelled`, "subscription_data[trial_period_days]": 7, "subscription_data[metadata][companyId]": input.companyId, "subscription_data[metadata][ownerUserId]": input.ownerUserId, "subscription_data[metadata][planCode]": input.planCode, "subscription_data[metadata][addOnCodes]": JSON.stringify(input.addOnCodes), "metadata[companyId]": input.companyId, "metadata[ownerUserId]": input.ownerUserId, "metadata[planCode]": input.planCode };
      checkoutLineItems(monthly, trial, addOnPrices, addOnTrialPrices).forEach((item, index) => { form[`line_items[${index}][price]`] = item.price; form[`line_items[${index}][quantity]`] = item.quantity; });
      const session: any = await stripe.post("checkout/sessions", form, {
        "Idempotency-Key": checkoutIdempotencyKey(input.companyId, attempt.attemptKey),
      });
      await this.checkoutRepo.updateAttempt(attempt.id, {
        providerSessionId: session.id, hostedUrl: session.url, status: session.status ?? "open",
        expiresAt: session.expires_at ? new Date(session.expires_at * 1000) : null,
      });
      if (!session.url) throw new Error("Stripe did not return a hosted checkout URL.");
      return { ok: true, url: session.url };
    } catch (error) {
      if (error instanceof Error && /not connected|credential|required/i.test(error.message) && error.message !== "Billing configuration required.") return unavailable();
      throw error;
    }
  }
  async createCustomerPortalSession(input: { companyId: number; ownerUserId: string }): Promise<ProviderResult> {
    if (!this.isReady()) return unavailable();
    try {
      const [subscription] = await local(input.companyId, input.ownerUserId);
      if (!subscription?.providerCustomerId) return unavailable();
      const stripe = this.connectorFactory();
      const portal: any = await stripe.post("billing_portal/sessions", { customer: subscription.providerCustomerId, return_url: returnUrl() });
      return { ok: true, url: portal.url };
    } catch (error) { if (error instanceof Error && /not connected|credential|required/i.test(error.message)) return unavailable(); throw error; }
  }
  async getSubscriptionStatus(input: { companyId: number; ownerUserId: string }) { return this.syncSubscription(input); }
  async applySelection(input: { companyId: number; ownerUserId: string; planCode: string; addOnCodes: string[] }): Promise<ProviderResult> {
    if (!this.isReady()) return unavailable();
    const [localSubscription] = await local(input.companyId, input.ownerUserId);
    if (!localSubscription?.providerSubscriptionId) return unavailable();
    const stripe = this.connectorFactory();
    const current: any = await stripe.get(`subscriptions/${localSubscription.providerSubscriptionId}`);
    const plan = await this.catalogRepo.plan(input.planCode);
    if (!plan) configurationRequired();
    const addOns = await this.catalogRepo.addOns(input.addOnCodes);
    if (addOns.length !== input.addOnCodes.length || new Set(input.addOnCodes).size !== input.addOnCodes.length || input.planCode === "complete" && addOns.length) configurationRequired();
    const desired = [await verifyCatalogPrice(plan, "monthly", stripe), ...await Promise.all(addOns.map((addOn) => verifyCatalogPrice(addOn, "monthly", stripe)))];
    const currentItems: any[] = current.items?.data ?? [];
    const form: Record<string, string | number | boolean> = {
      proration_behavior: "none", "metadata[planCode]": input.planCode, "metadata[addOnCodes]": JSON.stringify(input.addOnCodes),
    };
    desired.forEach((price, index) => {
      if (currentItems[index]?.id) form[`items[${index}][id]`] = currentItems[index].id;
      form[`items[${index}][price]`] = price;
    });
    currentItems.slice(desired.length).forEach((item, offset) => {
      form[`items[${desired.length + offset}][id]`] = item.id;
      form[`items[${desired.length + offset}][deleted]`] = true;
    });
    const updated: any = await stripe.post(`subscriptions/${localSubscription.providerSubscriptionId}`, form);
    await this.applySubscription(updated, input.companyId, input.ownerUserId);
    return { ok: true, status: mapStripeSubscriptionStatus(updated.status) };
  }
  async cancelSubscription(input: { companyId: number; ownerUserId: string }): Promise<ProviderResult> {
    if (!this.isReady()) return unavailable();
    const [subscription] = await local(input.companyId, input.ownerUserId);
    if (!subscription?.providerSubscriptionId) return unavailable();
    const stripe = this.connectorFactory();
    const result: any = await stripe.post(`subscriptions/${subscription.providerSubscriptionId}`, { cancel_at_period_end: true });
    await this.applySubscription(result as any, input.companyId, input.ownerUserId);
    return { ok: true, status: mapStripeSubscriptionStatus(result.status) };
  }
  async syncSubscription(input: { companyId: number; ownerUserId: string }): Promise<ProviderResult> {
    if (!this.isReady()) return unavailable();
    const [subscription] = await local(input.companyId, input.ownerUserId);
    if (!subscription?.providerSubscriptionId) return unavailable();
    const stripe = this.connectorFactory();
    const fresh: any = await stripe.get(`subscriptions/${subscription.providerSubscriptionId}`);
    await this.applySubscription(fresh as any, input.companyId, input.ownerUserId);
    return { ok: true, status: mapStripeSubscriptionStatus(fresh.status) };
  }
  private async applySubscription(subscription: any, companyId: number, ownerUserId: string, database: any = db) {
    const values = subscriptionState(subscription);
    if (database === db) await this.checkoutRepo.updateSubscription(companyId, ownerUserId, values);
    else await database.update(companySubscriptionsTable).set(values).where(and(eq(companySubscriptionsTable.companyId, companyId), eq(companySubscriptionsTable.ownerUserId, ownerUserId)));
  }
  async verifyWebhook(input: { payload: Buffer; signature?: string }): Promise<ProviderResult> {
    // Verify raw bytes cryptographically first. Canonical retrieval below is
    // defense-in-depth and prevents even validly signed submitted fields from
    // becoming the source of subscription truth.
    const secret = this.webhookSecret();
    if (!secret) throw new Error("Stripe webhook signing configuration is unavailable.");
    verifyStripeSignature(input.payload, input.signature, secret);
    const signedId = canonicalEventId(input.payload, input.signature);
    const stripe = this.connectorFactory();
    const event: any = await stripe.get(`events/${encodeURIComponent(signedId)}`);
    requireCanonicalEventId(signedId, event.id);
    const object: any = event.data.object;
    // One-time top-ups have no subscription to synchronize. Their immutable
    // purchase record is the source of allocation and is updated exactly once.
    if (event.type === "checkout.session.completed" && object?.metadata?.billing_kind === "ai_receptionist_top_up") {
      const status = await grantReceptionistTopUpFromStripeSession(object, stripe);
      return { ok: true, status };
    }
    const metadata = object.metadata ?? {};
    let companyId = Number(metadata.companyId);
    let ownerUserId = metadata.ownerUserId as string | undefined;
    if ((!companyId || !ownerUserId) && object.customer) {
      const row = await this.webhookRepo.tenantForCustomer(typeof object.customer === "string" ? object.customer : object.customer.id);
      companyId = row?.companyId ?? 0; ownerUserId = row?.ownerUserId;
    }
    if (!companyId || !ownerUserId) return { ok: true, status: "ignored" };
    // Fetch remote data before the transaction. The receipt is only marked done
    // after local state commits, so a failed attempt is safely replayable.
    let remoteSubscription: any;
    const subscriptionReference = event.type.startsWith("customer.subscription.")
      ? object.id
      : object.subscription;
    if ((event.type === "checkout.session.completed" || event.type.startsWith("customer.subscription.") || event.type === "invoice.paid" || event.type === "invoice.payment_failed") && subscriptionReference) {
      remoteSubscription = await stripe.get(typeof subscriptionReference === "string" ? `subscriptions/${subscriptionReference}` : `subscriptions/${subscriptionReference.id}`);
    }
    const status = await this.webhookRepo.process(event, { companyId, ownerUserId }, remoteSubscription ? subscriptionState(remoteSubscription) : undefined);
    return { ok: true, status };
  }
}
export { UnavailableBillingProvider } from "./unavailable";
export const billingProvider: BillingProvider = new StripeBillingProvider(
  undefined, undefined, undefined, undefined, undefined, isStripeBillingReady,
);

const webhookEventTypes = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
  "invoice.paid",
] as const;
const workRateStripeWebhookUrl = "https://work-rate-manager.replit.app/api/stripe/webhook";

/** Validates and maintains the single approved test webhook endpoint. */
export async function initializeStripeBilling(): Promise<void> {
  setStripeBillingReady(false);
  const stripe = new StripeApiClient();
  await stripe.assertTestAccount();
  const form: Record<string, string> = { url: workRateStripeWebhookUrl };
  webhookEventTypes.forEach((eventType, index) => {
    form[`enabled_events[${index}]`] = eventType;
  });
  const endpoints = await stripe.get<{ data: Array<{ id: string; url: string }> }>("webhook_endpoints", { limit: 100 });
  const endpoint = endpoints.data.find((candidate) => candidate.url === workRateStripeWebhookUrl);
  if (!endpoint) throw new Error("Stripe webhook endpoint is not configured for this environment.");
  if (!process.env.STRIPE_WEBHOOK_SECRET) throw new Error("STRIPE_WEBHOOK_SECRET is required.");
  await stripe.post(`webhook_endpoints/${endpoint.id}`, form);
  setStripeBillingReady(true);
}