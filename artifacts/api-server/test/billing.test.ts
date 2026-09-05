import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import { resolveEntitlements, canUseMeteredFeature } from "../src/services/billing/entitlements";
import { UnavailableBillingProvider } from "../src/services/billing/unavailable";
import { StripeBillingProvider, type BillingCatalogRepository, type CheckoutRepository, type WebhookRepository } from "../src/services/billing/provider";
import { canonicalEventId, checkoutIdempotencyKey, checkoutLineItems, mapStripeSubscriptionStatus, requireCanonicalEventId, verifyStripeSignature } from "../src/services/billing/lifecycle";
import { processRetryableReceipt } from "../src/services/billing/lifecycle";
import { catalogAvailability, isBillingAdmin, trialPriceGbp } from "../src/services/billing/pricing";
import { featureAccess } from "../src/services/billing/authorization";
import { assertExpectedStripeTestAccount, WORKRATE_STRIPE_TEST_ACCOUNT_ID } from "../src/services/billing/stripeClient";

test("Stripe operations fail closed outside the authoritative test account", () => {
  assert.doesNotThrow(() => assertExpectedStripeTestAccount({ key: "sk_test_example", accountId: WORKRATE_STRIPE_TEST_ACCOUNT_ID, livemode: false }));
  assert.throws(() => assertExpectedStripeTestAccount({ key: "sk_live_example", accountId: WORKRATE_STRIPE_TEST_ACCOUNT_ID, livemode: false }), /safety check/);
  assert.throws(() => assertExpectedStripeTestAccount({ key: "sk_test_example", accountId: "acct_other", livemode: false }), /safety check/);
  assert.throws(() => assertExpectedStripeTestAccount({ key: "sk_test_example", accountId: WORKRATE_STRIPE_TEST_ACCOUNT_ID, livemode: true }), /safety check/);
  assert.throws(() => assertExpectedStripeTestAccount({ key: undefined, accountId: WORKRATE_STRIPE_TEST_ACCOUNT_ID, livemode: false }), /safety check/);
});

test("server-owned trial prices use 50% defaults, overrides, and exact pence rounding", () => {
  assert.equal(trialPriceGbp({ monthlyPriceGbp: "29.00", trialPercentage: "50" }), 14.5);
  assert.equal(trialPriceGbp({ monthlyPriceGbp: "99.00", trialPercentage: "50" }), 49.5);
  assert.equal(trialPriceGbp({ monthlyPriceGbp: "29.99", trialPercentage: "50" }), 15);
  assert.equal(trialPriceGbp({ monthlyPriceGbp: "29.00", trialPercentage: "50", manualTrialPriceGbp: "4.99" }), 4.99);
});

test("unmapped or unpriced add-ons are customer-visible but never purchasable", () => {
  assert.deepEqual(catalogAvailability({ monthlyPriceGbp: null, active: true, comingSoon: false }), { purchasable: false, configurationMessage: "Billing configuration required." });
  assert.deepEqual(catalogAvailability({ monthlyPriceGbp: "10", active: true, comingSoon: false, stripeProductId: "prod", stripeRecurringPriceId: "month", stripeTrialPriceId: "trial", stripeMappingValidatedAt: new Date() }), { purchasable: true, configurationMessage: null });
});

test("billing admin allowlist is default deny and exact-match only", () => {
  assert.equal(isBillingAdmin("admin", undefined), false);
  assert.equal(isBillingAdmin("admin", "other, admin "), true);
  assert.equal(isBillingAdmin("ad", "admin"), false);
});
test("paid feature authorization preserves legacy, grants selected add-ons/Complete, and revokes removed or inactive subscriptions", () => {
  const catalog = [{ code: "core", featureCategories: [], usageLimits: null }, { code: "complete", featureCategories: [], usageLimits: null }];
  const addOn = [{ code: "ai_receptionist", featureCategories: ["ai_receptionist"], usageLimits: null }];
  assert.equal(featureAccess(resolveEntitlements({ legacyAccess: true, subscription: undefined, plans: [], addOns: [] }), "ai_receptionist"), null);
  assert.equal(featureAccess(resolveEntitlements({ legacyAccess: false, subscription: { status: "trialing", planCode: "core", addOnCodes: ["ai_receptionist"] }, plans: catalog, addOns: addOn }), "ai_receptionist"), null);
  assert.equal(featureAccess(resolveEntitlements({ legacyAccess: false, subscription: { status: "active", planCode: "core", addOnCodes: [] }, plans: catalog, addOns: addOn }), "ai_receptionist")?.error, "PAYMENT_REQUIRED");
  assert.equal(featureAccess(resolveEntitlements({ legacyAccess: false, subscription: { status: "active", planCode: "complete", addOnCodes: [] }, plans: catalog, addOns: [] }), "advanced_finance_mtd"), null);
  assert.equal(featureAccess(resolveEntitlements({ legacyAccess: false, subscription: { status: "past_due", planCode: "complete", addOnCodes: [] }, plans: catalog, addOns: [] }), "advanced_finance_mtd")?.error, "PAYMENT_REQUIRED");
});

test("legacy companies retain access until they explicitly enter billing", () => {
  const entitlement = resolveEntitlements({ legacyAccess: true, plans: [], addOns: [], subscription: undefined });
  assert.equal(entitlement.access, "legacy");
  assert.deepEqual(entitlement.categories, ["*"]);
});

test("complete unlocks categories but does not invent a metered allowance", () => {
  const entitlement = resolveEntitlements({
    legacyAccess: false,
    subscription: { status: "active", planCode: "complete", addOnCodes: [] },
    plans: [{ code: "complete", featureCategories: [], usageLimits: null }],
    addOns: [],
  });
  assert.equal(entitlement.categories.includes("*"), true);
  assert.deepEqual(canUseMeteredFeature(entitlement, "expensive-ai", 0, true), { allowed: false, reason: "LIMIT_NOT_CONFIGURED" });
});

test("unavailable provider never creates a payment session", async () => {
  const provider = new UnavailableBillingProvider();
  const result = await provider.createCheckoutSession({ companyId: 1, ownerUserId: "user", planCode: "core", addOnCodes: [] });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "PAYMENT_SETUP_UNAVAILABLE");
});

test("Stripe billing fails closed before webhook readiness and never posts Checkout", async () => {
  let posted = false;
  const stripe: any = {
    async get() { throw new Error("must not fetch"); },
    async post() { posted = true; throw new Error("must not post"); },
  };
  const provider = new StripeBillingProvider(
    () => stripe,
    undefined,
    undefined,
    undefined,
    undefined,
    () => false,
  );
  const result = await provider.createCheckoutSession({ companyId: 1, ownerUserId: "user", planCode: "core", addOnCodes: [] });
  assert.equal(result.ok, false);
  assert.equal(posted, false);
});

test("Stripe lifecycle maps trials, payment failure/recovery, and cancellation", () => {
  assert.equal(mapStripeSubscriptionStatus("trialing"), "trialing");
  assert.equal(mapStripeSubscriptionStatus("active"), "active"); // invoice.paid recovery
  assert.equal(mapStripeSubscriptionStatus("past_due"), "past_due"); // invoice.payment_failed
  assert.equal(mapStripeSubscriptionStatus("incomplete"), "past_due");
  assert.equal(mapStripeSubscriptionStatus("canceled"), "cancelled");
});

test("webhook receipt duplicates no-op and failed processing remains retryable", async () => {
  const receipt = { processedAt: null as Date | null };
  await assert.rejects(processRetryableReceipt(receipt, async () => { throw new Error("temporary DB failure"); }));
  assert.equal(receipt.processedAt, null);
  assert.equal(await processRetryableReceipt(receipt, async () => undefined), "processed");
  assert.notEqual(receipt.processedAt, null);
  assert.equal(await processRetryableReceipt(receipt, async () => { throw new Error("must not run"); }), "duplicate");
});

test("checkout composes upfront paid trial with recurring monthly price and add-ons", () => {
  assert.deepEqual(checkoutLineItems("price_monthly", "price_paid_trial", ["price_addon"]), [
    { price: "price_monthly", quantity: 1 },
    { price: "price_paid_trial", quantity: 1 },
    { price: "price_addon", quantity: 1 },
  ]);
  assert.equal(checkoutIdempotencyKey(1, "11111111-1111-4111-8111-111111111111"), checkoutIdempotencyKey(1, "11111111-1111-4111-8111-111111111111"));
  assert.notEqual(checkoutIdempotencyKey(1, "11111111-1111-4111-8111-111111111111"), checkoutIdempotencyKey(1, "22222222-2222-4222-8222-222222222222"));
});
test("checkout includes selected add-on trial prices before recurring add-ons", () => {
  assert.deepEqual(checkoutLineItems("plan_monthly", "plan_trial", ["addon_monthly_a", "addon_monthly_b"], ["addon_trial_a", "addon_trial_b"]), [
    { price: "plan_monthly", quantity: 1 }, { price: "plan_trial", quantity: 1 },
    { price: "addon_trial_a", quantity: 1 }, { price: "addon_trial_b", quantity: 1 },
    { price: "addon_monthly_a", quantity: 1 }, { price: "addon_monthly_b", quantity: 1 },
  ]);
});

test("webhook submitted fields cannot control canonical event selection", () => {
  const tampered = Buffer.from(JSON.stringify({ id: "evt_canonical", type: "customer.subscription.deleted", data: { object: { status: "active" } } }));
  assert.equal(canonicalEventId(tampered, "present"), "evt_canonical");
  assert.throws(() => canonicalEventId(tampered), /Missing Stripe signature/);
  assert.throws(() => requireCanonicalEventId("evt_canonical", "evt_other"), /mismatch/);
});

test("Stripe HMAC verification accepts valid bytes and rejects invalid, stale, missing, and tampered payloads", () => {
  const secret = "whsec_test";
  const now = 1_700_000_000;
  const payload = Buffer.from('{"id":"evt_valid"}');
  const digest = createHmac("sha256", secret).update(`${now}.`).update(payload).digest("hex");
  const signature = `t=${now},v1=${digest}`;
  assert.doesNotThrow(() => verifyStripeSignature(payload, signature, secret, now));
  assert.throws(() => verifyStripeSignature(payload, undefined, secret, now), /Missing/);
  assert.throws(() => verifyStripeSignature(payload, `t=${now},v1=${"0".repeat(64)}`, secret, now), /Invalid/);
  assert.throws(() => verifyStripeSignature(payload, signature, secret, now + 301), /Stale/);
  assert.throws(() => verifyStripeSignature(Buffer.from('{"id":"evt_tampered"}'), signature, secret, now), /Invalid/);
});

function providerFixture(attempt: any, session: any) {
  const updates: any[] = [];
  const repo: CheckoutRepository = {
    async subscription() { return undefined; },
    async establishAttempt() { return attempt; },
    async updateAttempt(_id, values) { Object.assign(attempt, values); updates.push(values); },
    async updateSubscription(_company, _owner, values) { updates.push({ subscription: values }); },
  };
  const calls: any[] = [];
  let checkoutFailures = 0;
  const connector: any = {
    async get(path: string, query?: any) {
      calls.push(["get", path]);
      if (path.startsWith("prices/")) {
        const id = path.slice("prices/".length);
        return { id, active: true, currency: "gbp", product: "prod_core", unit_amount: id.includes("trial") ? 1450 : 2900, recurring: id.includes("trial") ? null : { interval: "month" }, metadata: { billing_kind: id.includes("trial") ? "paid_trial" : "monthly" } };
      }
      if (path.startsWith("products/search")) return { data: [{ id: path.includes("core") ? "prod_core" : "prod" }] };
      if (path === "prices") return { data: [
        { id: "price_monthly", currency: "gbp", recurring: { interval: "month" }, metadata: { billing_kind: "monthly" } },
        { id: "price_trial", currency: "gbp", recurring: null, metadata: { billing_kind: "paid_trial" } },
      ] };
      if (path.startsWith("checkout/sessions/")) return session;
      if (path.startsWith("subscriptions/")) return { id: "sub_1", customer: "cus_1", status: "active", metadata: { planCode: "core", addOnCodes: "[]" }, items: { data: [] } };
      return { data: [] };
    },
    async post(path: string, form: any, headers: any) {
      calls.push(["post", path, form, headers]);
      if (path === "checkout/sessions" && checkoutFailures++ === 0) throw new Error("lost response");
      return session;
    },
  };
  const catalog: BillingCatalogRepository = {
    async plan(code) { return { code, active: true, comingSoon: false, monthlyPriceGbp: "29", stripeProductId: "prod_core", stripeRecurringPriceId: "price_monthly", stripeTrialPriceId: "price_trial" }; },
    async addOns() { return []; },
  };
  return { provider: new StripeBillingProvider(() => connector, repo, undefined, catalog), calls, updates };
}

test("provider retries a lost Checkout response with one persisted server attempt key", async () => {
  const attempt = { id: 1, attemptKey: "11111111-1111-4111-8111-111111111111", status: "pending" };
  const fixture = providerFixture(attempt, { id: "cs_1", status: "open", url: "https://checkout.stripe.test/1", expires_at: 2_000_000_000 });
  await assert.rejects(fixture.provider.createCheckoutSession({ companyId: 1, ownerUserId: "u", planCode: "core", addOnCodes: [] }), /lost response/);
  assert.equal(attempt.status, "pending");
  const result = await fixture.provider.createCheckoutSession({ companyId: 1, ownerUserId: "u", planCode: "core", addOnCodes: [] });
  assert.equal(result.ok && result.url, "https://checkout.stripe.test/1");
  const checkoutCalls = fixture.calls.filter((call) => call[0] === "post" && call[1] === "checkout/sessions");
  assert.equal(checkoutCalls.length, 2);
  assert.equal(checkoutCalls[0][3]["Idempotency-Key"], checkoutCalls[1][3]["Idempotency-Key"]);
});
test("provider rejects stale or wrong stored Stripe mappings before Checkout", async () => {
  let posted = false;
  const catalog: BillingCatalogRepository = {
    async plan() { return { code: "core", active: true, comingSoon: false, monthlyPriceGbp: "29", stripeProductId: "prod_expected", stripeRecurringPriceId: "price_stale", stripeTrialPriceId: "price_trial" }; },
    async addOns() { return []; },
  };
  const repo: CheckoutRepository = { async subscription() { return undefined; }, async establishAttempt() { return { id: 1, attemptKey: "test" }; }, async updateAttempt() {}, async updateSubscription() {} };
  const stripe: any = { async get(path: string) { if (path === "prices/price_stale") return { id: "price_stale", active: true, currency: "gbp", product: "prod_other", recurring: { interval: "month" }, metadata: { billing_kind: "monthly" } }; throw new Error(`unexpected ${path}`); }, async post() { posted = true; return {}; } };
  const provider = new StripeBillingProvider(() => stripe, repo, undefined, catalog);
  await assert.rejects(provider.createCheckoutSession({ companyId: 1, ownerUserId: "u", planCode: "core", addOnCodes: [] }), /Billing configuration required/);
  assert.equal(posted, false);
});

test("provider reconciles a completed persisted Checkout instead of creating another", async () => {
  const attempt = { id: 2, attemptKey: "22222222-2222-4222-8222-222222222222", providerSessionId: "cs_done", hostedUrl: "https://checkout.stripe.test/done", status: "complete" };
  const fixture = providerFixture(attempt, { id: "cs_done", status: "complete", url: null, subscription: "sub_1" });
  const result = await fixture.provider.createCheckoutSession({ companyId: 1, ownerUserId: "u", planCode: "core", addOnCodes: [] });
  assert.equal(result.ok && result.status, "complete");
  assert.equal(fixture.updates.some((update) => update.subscription?.providerSubscriptionId === "sub_1"), true);
  assert.equal(fixture.calls.filter((call) => call[0] === "post" && call[1] === "checkout/sessions").length, 0);
});

test("provider reuses a tenant-wide open Checkout across different selections", async () => {
  const attempt = { id: 3, attemptKey: "33333333-3333-4333-8333-333333333333", status: "pending" };
  const fixture = providerFixture(attempt, { id: "cs_one", status: "open", url: "https://checkout.stripe.test/one", expires_at: 2_000_000_000 });
  await assert.rejects(fixture.provider.createCheckoutSession({ companyId: 7, ownerUserId: "owner", planCode: "core", addOnCodes: [] }), /lost response/);
  await fixture.provider.createCheckoutSession({ companyId: 7, ownerUserId: "owner", planCode: "complete", addOnCodes: [] });
  await fixture.provider.createCheckoutSession({ companyId: 7, ownerUserId: "owner", planCode: "core", addOnCodes: [] });
  const creates = fixture.calls.filter((call) => call[0] === "post" && call[1] === "checkout/sessions");
  assert.equal(creates.length, 2); // one lost response plus its idempotent replay; never a second session key
  assert.equal(creates[0][3]["Idempotency-Key"], creates[1][3]["Idempotency-Key"]);
});

test("provider webhook canonical recovery, duplicate receipt, and failed retry", async () => {
  process.env.REPLIT_DOMAINS = "billing.test";
  const secret = "whsec_provider";
  const states: any[] = [];
  const receipts = new Set<string>();
  let failOnce = true;
  const webhookRepo: WebhookRepository = {
    async secret() { return secret; },
    async tenantForCustomer() { return { companyId: 9, ownerUserId: "owner" }; },
    async process(event, _tenant, values) {
      if (receipts.has(event.id)) return "duplicate";
      if (event.id === "evt_retry" && failOnce) { failOnce = false; throw new Error("transaction failed"); }
      if (values) states.push(values);
      receipts.add(event.id);
      return "processed";
    },
  };
  let currentStatus = "incomplete";
  const connector: any = {
    async get(path: string) {
      if (path.startsWith("events/")) {
        const id = path.slice("events/".length);
        const type = id === "evt_paid"
          ? "invoice.paid"
          : id === "evt_created"
            ? "customer.subscription.created"
            : id === "evt_deleted"
              ? "customer.subscription.deleted"
              : "invoice.payment_failed";
        return {
          id,
          type,
          data: {
            object: type.startsWith("customer.subscription.")
              ? { id: "sub_9", customer: "cus_9" }
              : { customer: "cus_9", subscription: "sub_9" },
          },
        };
      }
      if (path === "subscriptions/sub_9") return { id: "sub_9", customer: "cus_9", status: currentStatus, metadata: { planCode: "core", addOnCodes: "[]" } };
      throw new Error(`unexpected ${path}`);
    },
    async post() { throw new Error("unexpected post"); },
  };
  const checkoutRepo: CheckoutRepository = {
    async subscription() { return undefined; }, async establishAttempt() { throw new Error("unused"); },
    async updateAttempt() {}, async updateSubscription() {},
  };
  const provider = new StripeBillingProvider(() => connector, checkoutRepo, webhookRepo, undefined, () => secret);
  const deliver = (id: string) => {
    const payload = Buffer.from(JSON.stringify({ id }));
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac("sha256", secret).update(`${timestamp}.`).update(payload).digest("hex");
    return provider.verifyWebhook({ payload, signature: `t=${timestamp},v1=${signature}` });
  };
  currentStatus = "trialing";
  await deliver("evt_created");
  assert.equal(states.at(-1).status, "trialing");
  currentStatus = "past_due";
  await deliver("evt_failed");
  assert.equal(states.at(-1).status, "past_due");
  assert.ok(states.at(-1).failedPaymentAt);
  assert.equal((await deliver("evt_failed")).status, "duplicate");
  await assert.rejects(deliver("evt_retry"), /transaction failed/);
  await deliver("evt_retry");
  currentStatus = "active";
  await deliver("evt_paid");
  assert.equal(states.at(-1).status, "active");
  assert.equal(states.at(-1).failedPaymentAt, null);
  currentStatus = "canceled";
  await deliver("evt_deleted");
  assert.equal(states.at(-1).status, "cancelled");
  assert.ok(states.at(-1).cancelledAt);
});
