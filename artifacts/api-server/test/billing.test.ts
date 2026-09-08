import assert from "node:assert/strict";
import test from "node:test";
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import express from "express";
import { createServer, request } from "node:http";
import billingRouter from "../src/routes/billing";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as dbSchema from "@workspace/db";
import { billingReceptionistTopUpPacksTable, billingReceptionistTopUpPurchasesTable, billingUsageEventsTable, billingUsagePeriodsTable, billingUsageReservationsTable, companiesTable, companySubscriptionsTable, db } from "@workspace/db";
import { resolveEntitlements, canUseMeteredFeature } from "../src/services/billing/entitlements";
import { UnavailableBillingProvider } from "../src/services/billing/unavailable";
import { StripeBillingProvider, type BillingCatalogRepository, type CheckoutRepository, type WebhookRepository } from "../src/services/billing/provider";
import { canonicalEventId, checkoutIdempotencyKey, checkoutLineItems, mapStripeSubscriptionStatus, requireCanonicalEventId, verifyStripeSignature } from "../src/services/billing/lifecycle";
import { processRetryableReceipt } from "../src/services/billing/lifecycle";
import { catalogAvailability, isBillingAdmin, trialPriceGbp } from "../src/services/billing/pricing";
import { featureAccess } from "../src/services/billing/authorization";
import { allowanceQuantity, finalizeUsageReservation, isLegacyVapiCostCoveredByCanonical, recordUsage, releaseUsageReservation, reserveUsage, summarizeProviderCosts, upsertVapiProviderCost, usagePeriodForTenant } from "../src/services/billing/usage";
import { assertExpectedStripeTestAccount, WORKRATE_STRIPE_TEST_ACCOUNT_ID } from "../src/services/billing/stripeClient";
import { createReceptionistTopUpCheckout, grantReceptionistTopUpFromStripeSession, verifyTopUpPrice } from "../src/services/billing/topups";
import { grantedReceptionistTopUpMinutes } from "../src/services/billing/usage";

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
test("unpriced receptionist top-up packs fail closed and configured packs use server amount", async () => {
  const stripe = { get: async (path: string) => path.startsWith("products/")
    ? ({ id: "prod_minutes", active: true, metadata: { workrate_pack_code: "minutes_250", billing_kind: "ai_receptionist_top_up" } })
    : ({ id: "price_minutes", active: true, currency: "gbp", product: "prod_minutes", recurring: null, unit_amount: 2500, metadata: { workrate_pack_code: "minutes_250", billing_kind: "ai_receptionist_top_up" } }) };
  await assert.rejects(() => verifyTopUpPrice({ active: true, customerPriceGbp: null, currency: "gbp", stripeProductId: "prod_minutes", stripePriceId: "price_minutes", stripeMappingValidatedAt: new Date() }, stripe), /configuration/);
  assert.equal(await verifyTopUpPrice({ code: "minutes_250", active: true, customerPriceGbp: "25.00", currency: "gbp", stripeProductId: "prod_minutes", stripePriceId: "price_minutes", stripeMappingValidatedAt: new Date() }, stripe), "price_minutes");
  await assert.rejects(() => verifyTopUpPrice({ code: "minutes_250", active: true, customerPriceGbp: "24.99", currency: "gbp", stripeProductId: "prod_minutes", stripePriceId: "price_minutes", stripeMappingValidatedAt: new Date() }, stripe), /configuration/);
});
test("receptionist packs use exact server-owned GBP amounts and reject mismatched product metadata", async () => {
  const expected = { minutes_100: 1200, minutes_250: 2500, minutes_500: 4500 };
  for (const [code, unit_amount] of Object.entries(expected)) {
    const stripe = { get: async (path: string) => path.startsWith("products/")
      ? ({ active: true, metadata: { workrate_pack_code: code, billing_kind: "ai_receptionist_top_up" } })
      : ({ id: "price", active: true, product: "prod", currency: "gbp", unit_amount, recurring: null, metadata: { workrate_pack_code: code, billing_kind: "ai_receptionist_top_up" } }) };
    assert.equal(await verifyTopUpPrice({ code, active: true, customerPriceGbp: (unit_amount / 100).toFixed(2), currency: "gbp", stripeProductId: "prod", stripePriceId: "price", stripeMappingValidatedAt: new Date() }, stripe), "price");
  }
  const wrongProduct = { get: async (path: string) => path.startsWith("products/")
    ? ({ active: true, metadata: { workrate_pack_code: "minutes_500", billing_kind: "ai_receptionist_top_up" } })
    : ({ active: true, product: "prod", currency: "gbp", unit_amount: 1200, recurring: null, metadata: { workrate_pack_code: "minutes_100", billing_kind: "ai_receptionist_top_up" } }) };
  await assert.rejects(() => verifyTopUpPrice({ code: "minutes_100", active: true, customerPriceGbp: "12.00", currency: "gbp", stripeProductId: "prod", stripePriceId: "price", stripeMappingValidatedAt: new Date() }, wrongProduct), /configuration/);
});
test("unready Stripe webhook safety gate creates no top-up purchase or Checkout", async () => {
  let calls = 0;
  const stripe = { get: async () => { calls++; throw new Error("must not call Stripe"); }, post: async () => { calls++; throw new Error("must not call Stripe"); } };
  const result = await createReceptionistTopUpCheckout({ companyId: 1, ownerUserId: "owner", packCode: "minutes_100" }, stripe, () => false);
  assert.deepEqual(result, { ok: false, code: "PAYMENT_SETUP_UNAVAILABLE", message: "Payments are not configured yet. No payment was created." });
  assert.equal(calls, 0);
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
  assert.equal(featureAccess(resolveEntitlements({ legacyAccess: false, subscription: { status: "active", planCode: "complete", addOnCodes: [] }, plans: catalog, addOns: addOn }), "ai_receptionist"), null);
  assert.equal(featureAccess(resolveEntitlements({ legacyAccess: false, subscription: { status: "active", planCode: "complete", addOnCodes: [] }, plans: catalog, addOns: [] }), "advanced_finance_mtd"), null);
  assert.equal(featureAccess(resolveEntitlements({ legacyAccess: false, subscription: { status: "past_due", planCode: "complete", addOnCodes: [] }, plans: catalog, addOns: [] }), "advanced_finance_mtd")?.error, "PAYMENT_REQUIRED");
});

test("production usage periods allow only explicitly marked legacy tenants without Stripe periods", async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const owner = `billing-legacy-period-${randomUUID()}`;
  let legacyCompanyId: number | undefined;
  let unmarkedCompanyId: number | undefined;
  try {
    process.env.NODE_ENV = "production";
    const [legacyCompany] = await db.insert(companiesTable).values({
      ownerUserId: owner,
      name: `${owner}-legacy`,
      legacyBilling: true,
    }).returning();
    legacyCompanyId = legacyCompany.id;
    const [unmarkedCompany] = await db.insert(companiesTable).values({
      ownerUserId: owner,
      name: `${owner}-unmarked`,
      legacyBilling: false,
    }).returning();
    unmarkedCompanyId = unmarkedCompany.id;

    const period = await usagePeriodForTenant(
      legacyCompany.id,
      owner,
      new Date("2026-09-08T11:28:29.588Z"),
    );
    assert.equal(period.startsAt.toISOString(), "2026-09-01T00:00:00.000Z");
    assert.equal(period.endsAt.toISOString(), "2026-10-01T00:00:00.000Z");
    assert.equal(period.isDevelopmentFallback, false);
    await assert.rejects(
      () => usagePeriodForTenant(unmarkedCompany.id, owner),
      /Stripe subscription billing period is required/,
    );
  } finally {
    if (legacyCompanyId) await db.delete(companiesTable).where(eq(companiesTable.id, legacyCompanyId));
    if (unmarkedCompanyId) await db.delete(companiesTable).where(eq(companiesTable.id, unmarkedCompanyId));
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  }
});

test("DB-backed receptionist grants snapshot minutes once and reject canonical session mismatches", async () => {
  const [pack] = await db.select().from(billingReceptionistTopUpPacksTable).where(eq(billingReceptionistTopUpPacksTable.code, "minutes_100")).limit(1);
  assert.ok(pack, "minutes_100 catalogue fixture must exist");
  const owner = `billing-topup-${randomUUID()}`;
  const period = { startsAt: new Date("2030-01-01T00:00:00.000Z"), endsAt: new Date("2030-02-01T00:00:00.000Z") };
  const oldPeriod = { startsAt: new Date("2029-12-01T00:00:00.000Z"), endsAt: period.startsAt };
  let companyId: number | undefined;
  const originalPack = {
    customerPriceGbp: pack.customerPriceGbp, active: pack.active, stripeProductId: pack.stripeProductId,
    stripePriceId: pack.stripePriceId, stripeMappingValidatedAt: pack.stripeMappingValidatedAt,
  };
  try {
    await db.update(billingReceptionistTopUpPacksTable).set({
      customerPriceGbp: "12.00", active: true, stripeProductId: "prod_test_minutes_100",
      stripePriceId: "price_test_minutes_100", stripeMappingValidatedAt: new Date(),
    }).where(eq(billingReceptionistTopUpPacksTable.id, pack.id));
    const [company] = await db.insert(companiesTable).values({ ownerUserId: owner, name: owner }).returning();
    companyId = company.id;
    await db.insert(companySubscriptionsTable).values({
      companyId, ownerUserId: owner, planCode: "core", addOnCodes: ["ai_receptionist"], status: "active",
      provider: "stripe", providerSubscriptionId: "sub_topup_test", currentPeriodStartsAt: period.startsAt, currentPeriodEndsAt: period.endsAt,
    });
    const createPurchase = async (sessionId: string, periodFixture = period) => {
      const [purchase] = await db.insert(billingReceptionistTopUpPurchasesTable).values({
        companyId: company.id, ownerUserId: owner, packCode: "minutes_100", packMinutes: 100,
        customerPriceGbp: "12.00", currency: "gbp", expiryPolicy: "period_end",
        periodStartsAt: periodFixture.startsAt, periodEndsAt: periodFixture.endsAt, stripeCheckoutSessionId: sessionId,
      }).returning();
      return purchase;
    };
    const good = await createPurchase("cs_topup_good");
    const fakeStripe = (overrides: Record<string, unknown> = {}) => ({
      get: async (path: string) => {
        if (path.endsWith("/line_items")) return { data: [{
          quantity: 1, price: { id: "price_test_minutes_100", product: "prod_test_minutes_100" }, ...(overrides.lineItem as object ?? {}),
        }] };
        if (path.startsWith("subscriptions/")) return overrides.subscription ?? {
          id: "sub_topup_test", status: "active",
          current_period_start: Math.floor(period.startsAt.getTime() / 1000),
          current_period_end: Math.floor(period.endsAt.getTime() / 1000),
        };
        const baseMetadata = { billing_kind: "ai_receptionist_top_up", purchaseId: String(good.id), companyId: String(company.id), ownerUserId: owner, packCode: "minutes_100", workrate_environment: "development" };
        return {
          id: "cs_topup_good", mode: "payment", payment_status: "paid", payment_intent: "pi_topup_good",
          currency: "gbp", amount_total: 1200,
          ...overrides,
          metadata: { ...baseMetadata, ...((overrides.metadata as object | undefined) ?? {}) },
        };
      },
    });
    assert.equal(await grantReceptionistTopUpFromStripeSession({ id: "cs_topup_good", mode: "payment", payment_status: "paid", metadata: { billing_kind: "ai_receptionist_top_up", purchaseId: String(good.id) } }, fakeStripe() as any), "granted");
    assert.equal(await grantedReceptionistTopUpMinutes(company.id, owner, period), 100);
    assert.equal(await grantReceptionistTopUpFromStripeSession({ id: "cs_topup_good", mode: "payment", payment_status: "paid", metadata: { billing_kind: "ai_receptionist_top_up", purchaseId: String(good.id) } }, fakeStripe() as any), "duplicate");
    assert.equal(await grantedReceptionistTopUpMinutes(company.id, owner, period), 100, "duplicate grant adds zero minutes");

    const wrongAmount = await createPurchase("cs_topup_amount");
    await assert.rejects(() => grantReceptionistTopUpFromStripeSession({ id: "cs_topup_amount", mode: "payment", payment_status: "paid", metadata: { billing_kind: "ai_receptionist_top_up", purchaseId: String(wrongAmount.id) } }, fakeStripe({ id: "cs_topup_amount", payment_intent: "pi_topup_amount", amount_total: 1199, metadata: { billing_kind: "ai_receptionist_top_up", purchaseId: String(wrongAmount.id), companyId: String(company.id), ownerUserId: owner, packCode: "minutes_100" } }) as any), /amount mismatch/);
    const wrongPrice = await createPurchase("cs_topup_price");
    await assert.rejects(() => grantReceptionistTopUpFromStripeSession({ id: "cs_topup_price", mode: "payment", payment_status: "paid", metadata: { billing_kind: "ai_receptionist_top_up", purchaseId: String(wrongPrice.id) } }, fakeStripe({ id: "cs_topup_price", payment_intent: "pi_topup_price", metadata: { billing_kind: "ai_receptionist_top_up", purchaseId: String(wrongPrice.id), companyId: String(company.id), ownerUserId: owner, packCode: "minutes_100" }, lineItem: { price: { id: "price_other", product: "prod_other" } } }) as any), /price mapping mismatch/);
    const wrongTenant = await createPurchase("cs_topup_tenant");
    await assert.rejects(() => grantReceptionistTopUpFromStripeSession({ id: "cs_topup_tenant", mode: "payment", payment_status: "paid", metadata: { billing_kind: "ai_receptionist_top_up", purchaseId: String(wrongTenant.id) } }, fakeStripe({ id: "cs_topup_tenant", payment_intent: "pi_topup_tenant", metadata: { billing_kind: "ai_receptionist_top_up", purchaseId: String(wrongTenant.id), companyId: String(company.id), ownerUserId: "other-owner", packCode: "minutes_100" } }) as any), /identity mismatch/);
    const renewed = await createPurchase("cs_topup_renewed");
    await assert.rejects(() => grantReceptionistTopUpFromStripeSession({ id: "cs_topup_renewed", mode: "payment", payment_status: "paid", metadata: { billing_kind: "ai_receptionist_top_up", purchaseId: String(renewed.id) } }, fakeStripe({
      id: "cs_topup_renewed", payment_intent: "pi_topup_renewed",
      metadata: { billing_kind: "ai_receptionist_top_up", purchaseId: String(renewed.id), companyId: String(company.id), ownerUserId: owner, packCode: "minutes_100" },
      subscription: { id: "sub_topup_test", status: "active", current_period_start: Math.floor(period.endsAt.getTime() / 1000), current_period_end: Math.floor(new Date("2030-03-01T00:00:00.000Z").getTime() / 1000) },
    }) as any), /period no longer matches/);
    assert.equal(await grantedReceptionistTopUpMinutes(company.id, owner, period), 100, "renewed Stripe period cannot grant an old Checkout");

    await db.insert(billingReceptionistTopUpPurchasesTable).values({
      companyId: company.id, ownerUserId: owner, packCode: "minutes_100", packMinutes: 100, customerPriceGbp: "12.00",
      currency: "gbp", expiryPolicy: "period_end", periodStartsAt: oldPeriod.startsAt, periodEndsAt: oldPeriod.endsAt,
      stripeCheckoutSessionId: "cs_topup_old", stripePaymentIntentId: "pi_topup_old", status: "granted", grantedAt: new Date(),
    });
    assert.equal(await grantedReceptionistTopUpMinutes(company.id, owner, period), 100, "old-period grants are excluded");
  } finally {
    if (companyId) await db.delete(companiesTable).where(eq(companiesTable.id, companyId));
    await db.update(billingReceptionistTopUpPacksTable).set(originalPack).where(eq(billingReceptionistTopUpPacksTable.id, pack.id));
  }
});

test("DB-backed allowance reservations serialize concurrent provider starts and remain idempotent", async () => {
  const owner = `billing-reservation-${randomUUID()}`;
  let companyId: number | undefined;
  const pools: pg.Pool[] = [];
  const clients: pg.PoolClient[] = [];
  try {
    const [company] = await db.insert(companiesTable).values({ ownerUserId: owner, name: owner }).returning();
    companyId = company.id;
    const startsAt = new Date(Date.now() - 60_000);
    const endsAt = new Date(Date.now() + 86_400_000);
    const [period] = await db.insert(billingUsagePeriodsTable).values({
      companyId, ownerUserId: owner, startsAt, endsAt,
    }).returning();
    await db.insert(companySubscriptionsTable).values({
      companyId, ownerUserId: owner, planCode: "complete", addOnCodes: [], status: "active",
      provider: "stripe", providerSubscriptionId: `sub-${owner}`,
      currentPeriodStartsAt: startsAt, currentPeriodEndsAt: endsAt,
    });

    // Each contender owns a dedicated Pool connection.  This exercises the
    // PostgreSQL advisory lock rather than merely concurrent promises sharing
    // one client.
    for (let index = 0; index < 5; index++) pools.push(new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 }));
    clients.push(...await Promise.all(pools.map((pool) => pool.connect())));
    const isolated = clients.map((client) => drizzle(client, { schema: dbSchema }) as Pick<typeof db, "transaction">);
    const reserveMany = (featureCode: string, count: number, prefix: string) => Promise.all(
      Array.from({ length: count }, (_, index) => reserveUsage({
        companyId: company.id, ownerUserId: owner, period, featureCode, quantity: 1, limit: 1,
        dedupeKey: `${prefix}:${index}`,
      }, isolated[index])),
    );

    const social = await reserveMany("social_ai_meta", 5, "social");
    assert.equal(social.filter((result) => result.allowed).length, 1, "five social attempts allow one provider action");
    const socialWinner = social.find((result) => result.allowed)!;
    await db.insert(billingUsageEventsTable).values({
      companyId: company.id, ownerUserId: owner, usagePeriodId: period.id, featureCode: "social_ai_meta",
      usageCategory: "ai_assisted_messages", quantity: 1, unit: "messages", source: "openai",
      dedupeKey: socialWinner.reservation!.dedupeKey, idempotencyKey: socialWinner.reservation!.dedupeKey,
      occurredAt: new Date(),
    });
    await finalizeUsageReservation(company.id, owner, socialWinner.reservation!.dedupeKey);
    assert.equal((await db.select().from(billingUsageEventsTable).where(eq(billingUsageEventsTable.featureCode, "social_ai_meta"))).filter((event) => event.companyId === company.id).length, 1);

    const concept = await reserveMany("concept_visuals", 3, "concept");
    assert.equal(concept.filter((result) => result.allowed).length, 1, "three concept attempts allow one provider action");

    const receptionist = await reserveMany("ai_receptionist", 5, "call");
    assert.equal(receptionist.filter((result) => result.allowed).length, 1, "simultaneous call starts allow one call");
    const acceptedCall = receptionist.find((result) => result.allowed)!.reservation!;
    // A call that was accepted while one minute remained is allowed to finish,
    // even when its actual duration rounds above that threshold.
    await db.insert(billingUsageEventsTable).values({
      companyId: company.id, ownerUserId: owner, usagePeriodId: period.id, featureCode: "ai_receptionist",
      usageCategory: "ai_receptionist_seconds", quantity: 120, unit: "seconds", source: "vapi",
      dedupeKey: acceptedCall.dedupeKey, idempotencyKey: acceptedCall.dedupeKey, occurredAt: new Date(),
    });
    await finalizeUsageReservation(company.id, owner, acceptedCall.dedupeKey);
    assert.equal((await reserveUsage({
      companyId: company.id, ownerUserId: owner, period, featureCode: "ai_receptionist", quantity: 1, limit: 1, dedupeKey: "call:next",
    })).allowed, false, "next call is blocked after final usage");

    const failed = await reserveUsage({
      companyId: company.id, ownerUserId: owner, period, featureCode: "provider_failure", quantity: 1, limit: 1, dedupeKey: "failed",
    });
    assert.equal(failed.allowed, true);
    // Provider failure releases the accepted action first; the next, distinct
    // action gets the capacity back. This must not depend on update ordering.
    await releaseUsageReservation(company.id, owner, "failed");
    assert.equal((await reserveUsage({
      companyId: company.id, ownerUserId: owner, period, featureCode: "provider_failure", quantity: 1, limit: 1, dedupeKey: "retry",
    })).allowed, true, "a failed provider release restores exactly one capacity");

    const released = await reserveUsage({
      companyId: company.id, ownerUserId: owner, period, featureCode: "duplicate_release", quantity: 1, limit: 1, dedupeKey: "released-event",
    });
    assert.equal(released.allowed, true);
    await releaseUsageReservation(company.id, owner, "released-event");
    await releaseUsageReservation(company.id, owner, "released-event");
    const releasedRows = await db.select().from(billingUsageReservationsTable).where(and(
      eq(billingUsageReservationsTable.companyId, company.id),
      eq(billingUsageReservationsTable.dedupeKey, "released-event"),
    ));
    assert.equal(releasedRows.length, 1);
    assert.equal(releasedRows[0].status, "released", "duplicate release is a no-op");

    const finalized = await reserveUsage({
      companyId: company.id, ownerUserId: owner, period, featureCode: "duplicate_finalize", quantity: 1, limit: 1, dedupeKey: "finalized-event",
    });
    assert.equal(finalized.allowed, true);
    await finalizeUsageReservation(company.id, owner, "finalized-event");
    await finalizeUsageReservation(company.id, owner, "finalized-event");
    const finalizedRows = await db.select().from(billingUsageReservationsTable).where(and(
      eq(billingUsageReservationsTable.companyId, company.id),
      eq(billingUsageReservationsTable.dedupeKey, "finalized-event"),
    ));
    assert.equal(finalizedRows.length, 1);
    assert.equal(finalizedRows[0].status, "finalized", "duplicate finalize is a no-op");

    const expired = await reserveUsage({
      companyId: company.id, ownerUserId: owner, period, featureCode: "lease_expiry", quantity: 1, limit: 1, dedupeKey: "lease:old",
    });
    assert.equal(expired.allowed, true);
    await db.update(billingUsageReservationsTable).set({ expiresAt: new Date(Date.now() - 1_000) }).where(eq(billingUsageReservationsTable.dedupeKey, "lease:old"));
    const afterExpiry = await reserveUsage({
      companyId: company.id, ownerUserId: owner, period, featureCode: "lease_expiry", quantity: 1, limit: 1, dedupeKey: "lease:new",
    });
    assert.equal(afterExpiry.allowed, true, "expired claim is released under the feature advisory lock");
    const leaseRows = await db.select().from(billingUsageReservationsTable).where(and(
      eq(billingUsageReservationsTable.companyId, company.id), eq(billingUsageReservationsTable.featureCode, "lease_expiry"),
    ));
    assert.equal(leaseRows.find((row) => row.dedupeKey === "lease:old")?.status, "released");
    assert.equal(leaseRows.filter((row) => row.status === "reserved").reduce((sum, row) => sum + row.quantity, 0), 1);

    // A provider/webhook retry may race. The ledger unique key, rather than
    // caller timing, guarantees a single billable usage record.
    const retriedUsage = await Promise.all(Array.from({ length: 5 }, () => recordUsage({
      companyId: company.id, ownerUserId: owner, featureCode: "record_retry",
      usageCategory: "retry_test", quantity: 1, unit: "messages", source: "provider",
      dedupeKey: "provider-event:once", occurredAt: new Date(),
    })));
    assert.equal(retriedUsage.filter((result) => result.event).length, 1);
    const eventRows = await db.select().from(billingUsageEventsTable).where(and(
      eq(billingUsageEventsTable.companyId, company.id),
      eq(billingUsageEventsTable.dedupeKey, "provider-event:once"),
    ));
    assert.equal(eventRows.length, 1, "concurrent recordUsage retries create one event");
  } finally {
    for (const client of clients) client.release();
    await Promise.all(pools.map((pool) => pool.end()));
    if (companyId) await db.delete(companiesTable).where(eq(companiesTable.id, companyId));
  }
});

test("canonical Vapi costs repair a pending receipt but never rewrite an amount", async () => {
  const owner = `vapi-cost-${randomUUID()}`;
  let companyId: number | undefined;
  try {
    const [company] = await db.insert(companiesTable).values({ ownerUserId: owner, name: owner }).returning();
    companyId = company.id;
    const startsAt = new Date(Date.now() - 60_000);
    const endsAt = new Date(Date.now() + 86_400_000);
    await db.insert(companySubscriptionsTable).values({
      companyId, ownerUserId: owner, planCode: "complete", addOnCodes: [], status: "active", provider: "stripe",
      providerSubscriptionId: `sub-${owner}`, currentPeriodStartsAt: startsAt, currentPeriodEndsAt: endsAt,
    });
    const base = {
      companyId, ownerUserId: owner, featureCode: "vapi_provider_cost", usageCategory: "vapi_provider_cost",
      quantity: 1, unit: "call", source: "vapi_canonical", providerReference: "call-cost",
      dedupeKey: "vapi_cost:call-cost", occurredAt: new Date(), metadata: { provider: "vapi", authoritative: true },
    };
    await upsertVapiProviderCost({ ...base, providerCostAmount: null, providerCostCurrency: null });
    await upsertVapiProviderCost({ ...base, providerCostAmount: 1.25, providerCostCurrency: null });
    await upsertVapiProviderCost({ ...base, providerCostAmount: 1.25, providerCostCurrency: "GBP" });
    await assert.rejects(() => upsertVapiProviderCost({ ...base, providerCostAmount: 1.5, providerCostCurrency: "GBP" }), /immutable/);
    await upsertVapiProviderCost({ ...base, providerCostAmount: 1.25, providerCostCurrency: "GBP" });
    const rows = await db.select().from(billingUsageEventsTable).where(and(
      eq(billingUsageEventsTable.companyId, companyId), eq(billingUsageEventsTable.dedupeKey, "vapi_cost:call-cost"),
    ));
    assert.equal(rows.length, 1);
    assert.equal(Number(rows[0].providerCostAmount), 1.25);
    assert.equal(rows[0].providerCostCurrency, "GBP");
  } finally {
    if (companyId) await db.delete(companiesTable).where(eq(companiesTable.id, companyId));
  }
});

test("canonical Vapi receipt excludes a legacy duration cost without excluding other providers", () => {
  const canonical = new Set<string | null>(["call-1"]);
  assert.equal(isLegacyVapiCostCoveredByCanonical(
    { source: "vapi", usageCategory: "ai_receptionist_seconds", providerReference: "call-1" }, canonical,
  ), true);
  assert.equal(isLegacyVapiCostCoveredByCanonical(
    { source: "vapi", usageCategory: "ai_receptionist_seconds", providerReference: "call-2" }, canonical,
  ), false);
  assert.equal(isLegacyVapiCostCoveredByCanonical(
    { source: "openai", usageCategory: "ai_assisted_messages", providerReference: "call-1" }, canonical,
  ), false);
});

test("profitability stays incomplete for missing or unknown costs and includes verified GBP", () => {
  const complete = summarizeProviderCosts([{ providerReference: "openai-1", source: "openai", usageCategory: "ai", providerCostAmount: null, providerCostCurrency: null, providerCostGbp: "2.50" }], 10);
  assert.equal(complete.grossContributionGbp, 7.5);
  const incomplete = summarizeProviderCosts([
    { providerReference: "vapi-1", source: "vapi_canonical", usageCategory: "vapi_provider_cost", providerCostAmount: null, providerCostCurrency: null, providerCostGbp: null },
    { providerReference: "openai-2", source: "openai", usageCategory: "ai", providerCostAmount: "1", providerCostCurrency: null, providerCostGbp: null },
  ], 10);
  assert.equal(incomplete.costsCompleteForGbpMargin, false);
  assert.equal(incomplete.grossContributionGbp, null);
});

test("customer billing contract never exposes provider costs while internal profitability does", () => {
  const spec = readFileSync("../../lib/api-spec/openapi.yaml", "utf8");
  const customerBilling = spec.slice(spec.indexOf("  /billing/usage:"), spec.indexOf("  /internal/billing/catalog:"));
  assert.equal(customerBilling.includes("providerCost"), false);
  const internal = spec.slice(spec.indexOf("  /internal/billing/profitability/{companyId}:"));
  assert.equal(internal.includes("InternalBillingProfitability"), true);
});

test("billing Express routes enforce admin profitability and keep customer usage cost-free", async () => {
  const owner = `billing-http-${randomUUID()}`, admin = `admin-${randomUUID()}`;
  let companyId: number | undefined;
  const oldAdmins = process.env.WORKRATE_ADMIN_USER_IDS;
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => {
    const auth = () => ({ userId: req.headers["x-test-user"] as string, tokenType: "session_token", sessionClaims: {}, sessionId: "test-session" });
    (auth as any)[Symbol.for("@clerk/express.auth")] = true;
    (req as any).auth = auth; (req as any).log = { warn() {}, error() {}, info() {} }; next();
  });
  app.use(billingRouter);
  const server = createServer(app); await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const get = (path: string, user: string) => new Promise<{ status: number; body: any }>((resolve, reject) => {
    const req = request({ port, path, headers: { "x-test-user": user } }, (res) => { let data = ""; res.on("data", (c) => data += c); res.on("end", () => resolve({ status: res.statusCode!, body: JSON.parse(data) })); });
    req.on("error", reject); req.end();
  });
  try {
    const [company] = await db.insert(companiesTable).values({ ownerUserId: owner, name: owner }).returning(); companyId = company.id;
    const startsAt = new Date(Date.now() - 60_000), endsAt = new Date(Date.now() + 86_400_000);
    await db.insert(companySubscriptionsTable).values({ companyId, ownerUserId: owner, planCode: "complete", addOnCodes: [], status: "active", provider: "stripe", providerSubscriptionId: `sub-${owner}`, currentPeriodStartsAt: startsAt, currentPeriodEndsAt: endsAt });
    const [period] = await db.insert(billingUsagePeriodsTable).values({ companyId, ownerUserId: owner, startsAt, endsAt }).returning();
    await db.insert(billingUsageEventsTable).values({ companyId, ownerUserId: owner, usagePeriodId: period.id, featureCode: "provider", usageCategory: "ai", quantity: 1, unit: "call", source: "openai", providerReference: "openai-http", providerCostGbp: "1.25", occurredAt: new Date(), dedupeKey: "http-cost", idempotencyKey: "http-cost" });
    process.env.WORKRATE_ADMIN_USER_IDS = admin;
    assert.equal((await get(`/internal/billing/profitability/${companyId}`, owner)).status, 403);
    const internal = await get(`/internal/billing/profitability/${companyId}`, admin);
    assert.equal(internal.status, 200); assert.equal(internal.body.directProviderCosts[0].currency, "GBP");
    const customer = await get("/billing/usage", owner); assert.equal(customer.status, 200);
    const keys = JSON.stringify(customer.body);
    for (const forbidden of ["providerCost", "providerCostAmount", "providerCostCurrency", "costComponents"]) assert.equal(keys.includes(forbidden), false);
  } finally {
    if (oldAdmins === undefined) delete process.env.WORKRATE_ADMIN_USER_IDS; else process.env.WORKRATE_ADMIN_USER_IDS = oldAdmins;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (companyId) await db.delete(companiesTable).where(eq(companiesTable.id, companyId));
  }
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

test("configured add-on and Complete allowances hard-cap only the next costly action", () => {
  const addOn = [{ code: "ai_receptionist", featureCategories: ["ai_receptionist"], usageLimits: { ai_receptionist: 200 } }];
  const addonEntitlement = resolveEntitlements({ legacyAccess: false, subscription: { status: "active", planCode: "core", addOnCodes: ["ai_receptionist"] }, plans: [{ code: "core", featureCategories: [], usageLimits: null }], addOns: addOn });
  assert.deepEqual(canUseMeteredFeature(addonEntitlement, "ai_receptionist", 199, true), { allowed: true, reason: "within_limit" });
  assert.deepEqual(canUseMeteredFeature(addonEntitlement, "ai_receptionist", 200, true), { allowed: false, reason: "LIMIT_REACHED" });
  const complete = resolveEntitlements({ legacyAccess: false, subscription: { status: "active", planCode: "complete", addOnCodes: [] }, plans: [{ code: "complete", featureCategories: [], usageLimits: { concept_visuals: 30 } }], addOns: [] });
  assert.deepEqual(canUseMeteredFeature(complete, "concept_visuals", 30, true), { allowed: false, reason: "LIMIT_REACHED" });
});

test("receptionist allowance converts stored provider seconds to whole customer minutes", () => {
  assert.equal(allowanceQuantity("ai_receptionist", []), 0);
  assert.equal(allowanceQuantity("ai_receptionist", [{ featureCode: "ai_receptionist", quantity: 199, unit: "seconds" }]), 4);
  assert.equal(allowanceQuantity("ai_receptionist", [{ featureCode: "ai_receptionist", quantity: 11_999, unit: "seconds" }]), 200);
  assert.equal(allowanceQuantity("ai_receptionist", [{ featureCode: "ai_receptionist", quantity: 12_000, unit: "seconds" }]), 200);
  assert.equal(allowanceQuantity("ai_receptionist", [{ featureCode: "ai_receptionist", quantity: 12_001, unit: "seconds" }]), 201);
});

test("a cancelled subscription retains access only through its paid period", () => {
  const future = new Date(Date.now() + 60_000);
  const base = { plans: [{ code: "complete", featureCategories: [], usageLimits: null }], addOns: [], legacyAccess: false };
  assert.equal(resolveEntitlements({ ...base, subscription: { status: "cancelled", planCode: "complete", addOnCodes: [], currentPeriodEndsAt: future } }).access, "subscription");
  assert.equal(resolveEntitlements({ ...base, subscription: { status: "cancelled", planCode: "complete", addOnCodes: [], currentPeriodEndsAt: new Date(Date.now() - 60_000) } }).access, "none");
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
              ? { id: "sub_9", customer: "cus_9", metadata: { workrate_environment: "development" } }
              : { customer: "cus_9", subscription: "sub_9", metadata: { workrate_environment: "development" } },
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
