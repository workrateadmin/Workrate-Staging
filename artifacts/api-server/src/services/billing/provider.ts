import { and, eq, sql } from "drizzle-orm";
import { billingCheckoutAttemptsTable, billingProviderConfigsTable, billingWebhookEventsTable, companySubscriptionsTable, db } from "@workspace/db";
import { StripeConnectorClient } from "./stripeClient";
import { canonicalEventId, checkoutIdempotencyKey, checkoutLineItems, mapStripeSubscriptionStatus, requireCanonicalEventId, verifyStripeSignature } from "./lifecycle";
import { decryptIntegrationSecret, encryptIntegrationSecret } from "../../lib/integration-secret";

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
type StripeApi = Pick<StripeConnectorClient, "get" | "post">;
export interface CheckoutRepository {
  subscription(companyId: number, ownerUserId: string): Promise<any | undefined>;
  establishAttempt(input: { companyId: number; ownerUserId: string; fingerprint: string }): Promise<any>;
  updateAttempt(id: number, values: Record<string, unknown>): Promise<void>;
  updateSubscription(companyId: number, ownerUserId: string, values: Record<string, unknown>): Promise<void>;
}
export interface WebhookRepository {
  secret(url: string): Promise<string | undefined>;
  tenantForCustomer(customerId: string): Promise<{ companyId: number; ownerUserId: string } | undefined>;
  process(event: any, tenant: { companyId: number; ownerUserId: string }, subscriptionValues?: Record<string, unknown>): Promise<"processed" | "duplicate">;
}
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
  async secret(url) {
    const [config] = await db.select().from(billingProviderConfigsTable).where(and(eq(billingProviderConfigsTable.provider, "stripe"), eq(billingProviderConfigsTable.webhookUrl, url))).limit(1);
    return config ? decryptIntegrationSecret(config.encryptedWebhookSecret) : undefined;
  },
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

async function catalogPrice(planCode: string, kind: "monthly" | "paid_trial", stripe: StripeApi = new StripeConnectorClient()) {
  const products: any = await stripe.get("products/search", { query: `metadata['workrate_plan_code']:'${planCode}' AND active:'true'`, limit: 1 });
  const product = products.data[0];
  if (!product) throw new Error(`No active Stripe product is configured for plan ${planCode}. Run the billing catalog seed script.`);
  const prices: any = await stripe.get("prices", { product: product.id, active: true, limit: 100 });
  const price = prices.data.find((candidate: any) => candidate.currency === "gbp" && candidate.metadata.billing_kind === kind);
  if (!price) throw new Error(`No ${kind} Stripe price is configured for plan ${planCode}.`);
  return price.id;
}
async function addOnPrice(code: string, stripe: StripeApi = new StripeConnectorClient()) {
  const products: any = await stripe.get("products/search", { query: `metadata['workrate_add_on_code']:'${code}' AND active:'true'`, limit: 1 });
  const product = products.data[0];
  if (!product) throw new Error(`No active Stripe product is configured for add-on ${code}.`);
  const prices: any = await stripe.get("prices", { product: product.id, active: true, limit: 100 });
  const price = prices.data.find((candidate: any) => candidate.currency === "gbp" && candidate.recurring?.interval === "month");
  if (!price) throw new Error(`No monthly Stripe price is configured for add-on ${code}.`);
  return price.id;
}
export { canonicalEventId, checkoutIdempotencyKey, checkoutLineItems, mapStripeSubscriptionStatus };

/** Stripe implementation remains behind this provider-neutral interface. */
export class StripeBillingProvider implements BillingProvider {
  constructor(private readonly connectorFactory: () => StripeApi = () => new StripeConnectorClient(), private readonly checkoutRepo: CheckoutRepository = checkoutRepository, private readonly webhookRepo: WebhookRepository = webhookRepository) {}
  async createCheckoutSession(input: { companyId: number; ownerUserId: string; planCode: string; addOnCodes: string[] }): Promise<ProviderResult> {
    if (!input.planCode) return unavailable();
    try {
      const existing = await this.checkoutRepo.subscription(input.companyId, input.ownerUserId);
      if (existing && ["trialing", "active"].includes(existing.status)) throw new Error("An active subscription already exists.");
      const stripe = this.connectorFactory();
      const monthly = await catalogPrice(input.planCode, "monthly", stripe);
      const trial = await catalogPrice(input.planCode, "paid_trial", stripe);
      const addOnPrices = await Promise.all(input.addOnCodes.map((code) => addOnPrice(code, stripe)));
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
      checkoutLineItems(monthly, trial, addOnPrices).forEach((item, index) => { form[`line_items[${index}][price]`] = item.price; form[`line_items[${index}][quantity]`] = item.quantity; });
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
      if (error instanceof Error && /not connected|credential|required/i.test(error.message)) return unavailable();
      throw error;
    }
  }
  async createCustomerPortalSession(input: { companyId: number; ownerUserId: string }): Promise<ProviderResult> {
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
    const [localSubscription] = await local(input.companyId, input.ownerUserId);
    if (!localSubscription?.providerSubscriptionId) return unavailable();
    const stripe = this.connectorFactory();
    const current: any = await stripe.get(`subscriptions/${localSubscription.providerSubscriptionId}`);
    const desired = [await catalogPrice(input.planCode, "monthly", stripe), ...await Promise.all(input.addOnCodes.map((code) => addOnPrice(code, stripe)))];
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
    const [subscription] = await local(input.companyId, input.ownerUserId);
    if (!subscription?.providerSubscriptionId) return unavailable();
    const stripe = this.connectorFactory();
    const result: any = await stripe.post(`subscriptions/${subscription.providerSubscriptionId}`, { cancel_at_period_end: true });
    await this.applySubscription(result as any, input.companyId, input.ownerUserId);
    return { ok: true, status: mapStripeSubscriptionStatus(result.status) };
  }
  async syncSubscription(input: { companyId: number; ownerUserId: string }): Promise<ProviderResult> {
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
    const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
    if (!domain) throw new Error("REPLIT_DOMAINS is required for Stripe webhooks.");
    const url = `https://${domain}/api/stripe/webhook`;
    const secret = await this.webhookRepo.secret(url);
    if (!secret) throw new Error("Stripe webhook signing configuration is unavailable.");
    verifyStripeSignature(input.payload, input.signature, secret);
    const signedId = canonicalEventId(input.payload, input.signature);
    const stripe = this.connectorFactory();
    const event: any = await stripe.get(`events/${encodeURIComponent(signedId)}`);
    requireCanonicalEventId(signedId, event.id);
    const object: any = event.data.object;
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
export const billingProvider: BillingProvider = new StripeBillingProvider();

const webhookEventTypes = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
  "invoice.paid",
] as const;

/** Ensures each runtime environment has its own idempotently registered endpoint. */
export async function initializeStripeBilling(): Promise<void> {
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
  if (!domain) throw new Error("REPLIT_DOMAINS is required to register the Stripe webhook.");

  const url = `https://${domain}/api/stripe/webhook`;
  const stripe = new StripeConnectorClient();
  const form: Record<string, string> = { url };
  webhookEventTypes.forEach((eventType, index) => {
    form[`enabled_events[${index}]`] = eventType;
  });
  const [stored] = await db.select().from(billingProviderConfigsTable).where(and(eq(billingProviderConfigsTable.provider, "stripe"), eq(billingProviderConfigsTable.webhookUrl, url))).limit(1);
  if (stored) {
    await stripe.post(`webhook_endpoints/${stored.providerWebhookId}`, form);
    return;
  }
  const endpoints = await stripe.get<{ data: Array<{ id: string; url: string }> }>("webhook_endpoints", { limit: 100 });
  for (const endpoint of endpoints.data) if (endpoint.url === url) await stripe.delete(`webhook_endpoints/${endpoint.id}`);
  const created = await stripe.post<{ id: string; secret?: string }>("webhook_endpoints", form);
  if (!created.secret) throw new Error("Stripe did not return the new webhook signing secret.");
  await db.insert(billingProviderConfigsTable).values({
    provider: "stripe", webhookUrl: url, providerWebhookId: created.id,
    encryptedWebhookSecret: encryptIntegrationSecret(created.secret),
  }).onConflictDoNothing();
}