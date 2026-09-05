import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { and, asc, eq, sql } from "drizzle-orm";
import {
  billingAddOnsTable, billingPlansTable, billingReceptionistTopUpPacksTable, billingReceptionistTopUpPurchasesTable, billingUsageEventsTable, companiesTable,
  companySubscriptionsTable, db, onboardingProgressTable,
} from "@workspace/db";
import {
  CompleteOnboardingResponse, GetBillingCatalogResponse, GetBillingOverviewResponse,
  GetBillingUsageResponse, GetOnboardingResponse, SaveBillingSelectionBody,
  SaveBillingSelectionResponse, SimulateBillingStateBody, SimulateBillingStateResponse,
  SkipOnboardingResponse, StartOnboardingResponse, UpdateOnboardingBody, UpdateOnboardingResponse,
} from "@workspace/api-zod";
import { billingProvider } from "../services/billing/provider";
import { verifyCatalogPrice } from "../services/billing/provider";
import { StripeApiClient } from "../services/billing/stripeClient";
import { allowanceQuantity, grantedReceptionistTopUpMinutes, providerCostHistoryForTenant, summarizeProviderCosts, usageForTenant, usagePeriodForTenant } from "../services/billing/usage";
import { tenantEntitlements } from "../services/billing/authorization";
import { catalogAvailability, trialPriceGbp } from "../services/billing/pricing";
import { isBillingAdmin } from "../services/billing/pricing";
import { createReceptionistTopUpCheckout, listReceptionistTopUps, verifyTopUpPrice } from "../services/billing/topups";
import { z } from "zod/v4";

const router: IRouter = Router();

function authUser(req: any, res: any): string | undefined {
  const userId = getAuth(req).userId;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  return userId;
}
async function tenantCompany(ownerUserId: string) {
  return (await db.select().from(companiesTable).where(eq(companiesTable.ownerUserId, ownerUserId)).limit(1))[0];
}
function overview(subscription: any) {
  return subscription
    ? { legacyAccess: false, status: subscription.status, planCode: subscription.planCode, addOnCodes: subscription.addOnCodes, pendingPlanCode: subscription.pendingPlanCode, pendingAddOnCodes: subscription.pendingAddOnCodes, cancelAtPeriodEnd: subscription.cancelAtPeriodEnd, provider: subscription.provider, trialEndsAt: subscription.trialEndsAt, currentPeriodStartsAt: subscription.currentPeriodStartsAt, currentPeriodEndsAt: subscription.currentPeriodEndsAt, cancelledAt: subscription.cancelledAt, failedPaymentAt: subscription.failedPaymentAt }
    : { legacyAccess: true, status: null, planCode: null, addOnCodes: [], pendingPlanCode: null, pendingAddOnCodes: [], cancelAtPeriodEnd: false, provider: null, trialEndsAt: null, currentPeriodStartsAt: null, currentPeriodEndsAt: null, cancelledAt: null, failedPaymentAt: null };
}
function onboarding(row: any) {
  return row ? { exists: true, status: row.status, currentStep: row.currentStep, data: row.data } : { exists: false, status: null, currentStep: null, data: {} };
}
async function subscriptionFor(companyId: number, ownerUserId: string) {
  return (await db.select().from(companySubscriptionsTable).where(and(eq(companySubscriptionsTable.companyId, companyId), eq(companySubscriptionsTable.ownerUserId, ownerUserId))).limit(1))[0];
}
const money = z.union([z.string().regex(/^\d+(?:\.\d{1,2})?$/), z.number().finite().nonnegative()]).nullable().optional();
const internalCatalogPatch = z.object({
  description: z.string().nullable().optional(), monthlyPriceGbp: money, manualTrialPriceGbp: money,
  trialPercentage: z.union([z.string().regex(/^\d+(?:\.\d{1,2})?$/).refine((value) => Number(value) <= 100, "Must be at most 100"), z.number().finite().min(0).max(100)]).optional(),
  active: z.boolean().optional(), comingSoon: z.boolean().optional(), sortOrder: z.number().int().nonnegative().optional(),
  featureCategories: z.array(z.string()).optional(), usageLimits: z.record(z.string(), z.number().nonnegative()).nullable().optional(),
  includedAllowance: z.record(z.string(), z.number().nonnegative()).nullable().optional(), overagePolicy: z.record(z.string(), z.unknown()).nullable().optional(),
  stripeProductId: z.string().nullable().optional(), stripeRecurringPriceId: z.string().nullable().optional(), stripeTrialPriceId: z.string().nullable().optional(),
}).strict();
function requireBillingAdmin(req: any, res: any): string | undefined {
  const userId = authUser(req, res);
  if (!userId) return;
  if (!isBillingAdmin(userId)) { res.status(403).json({ error: "Billing administrator access is required" }); return; }
  return userId;
}
function normalizeInternalCatalogItem(row: any, trialDays: number | null) {
  return {
    id: row.id, code: row.code, name: row.name, description: row.description,
    monthlyPriceGbp: row.monthlyPriceGbp == null ? null : Number(row.monthlyPriceGbp),
    trialPercentage: Number(row.trialPercentage), manualTrialPriceGbp: row.manualTrialPriceGbp == null ? null : Number(row.manualTrialPriceGbp),
    trialDays, featureCategories: row.featureCategories, usageLimits: row.usageLimits, includedAllowance: row.includedAllowance,
    overagePolicy: row.overagePolicy, active: row.active, comingSoon: row.comingSoon, sortOrder: row.sortOrder,
    stripeProductId: row.stripeProductId, stripeRecurringPriceId: row.stripeRecurringPriceId, stripeTrialPriceId: row.stripeTrialPriceId,
    stripeMappingValidatedAt: row.stripeMappingValidatedAt, updatedByUserId: row.updatedByUserId,
  };
}
function normalizeInternalTopUpPack(row: any) {
  return {
    id: row.id, code: row.code, name: row.name, minutes: Number(row.minutes),
    customerPriceGbp: row.customerPriceGbp == null ? null : Number(row.customerPriceGbp),
    currency: row.currency, expiryPolicy: row.expiryPolicy, active: row.active, sortOrder: Number(row.sortOrder),
    stripeProductId: row.stripeProductId, stripePriceId: row.stripePriceId,
    stripeMappingValidatedAt: row.stripeMappingValidatedAt, updatedByUserId: row.updatedByUserId,
  };
}

router.get("/internal/billing/catalog", async (req, res): Promise<void> => {
  if (!requireBillingAdmin(req, res)) return;
  // Internal operational surface deliberately includes Stripe mappings; public catalog never does.
  const [plans, addOns, topUpPacks] = await Promise.all([db.select().from(billingPlansTable).orderBy(asc(billingPlansTable.sortOrder)), db.select().from(billingAddOnsTable).orderBy(asc(billingAddOnsTable.sortOrder)), db.select().from(billingReceptionistTopUpPacksTable).orderBy(asc(billingReceptionistTopUpPacksTable.sortOrder))]);
  res.json({ plans: plans.map((row) => normalizeInternalCatalogItem(row, row.trialDays)), addOns: addOns.map((row) => normalizeInternalCatalogItem(row, null)), receptionistTopUpPacks: topUpPacks.map(normalizeInternalTopUpPack) });
});
const topUpPatch = z.object({ customerPriceGbp: money, active: z.boolean().optional(), sortOrder: z.number().int().nonnegative().optional(), expiryPolicy: z.literal("period_end").optional(), stripeProductId: z.string().nullable().optional(), stripePriceId: z.string().nullable().optional() }).strict();
router.patch("/internal/billing/receptionist-top-ups/:code", async (req, res): Promise<void> => {
  const userId = requireBillingAdmin(req, res); if (!userId) return;
  const parsed = topUpPatch.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const mappingChanged = ["customerPriceGbp", "stripeProductId", "stripePriceId"].some((key) => key in parsed.data);
  const [row] = await db.update(billingReceptionistTopUpPacksTable).set({ ...parsed.data, updatedByUserId: userId, ...(mappingChanged ? { stripeMappingValidatedAt: null } : {}) } as any).where(eq(billingReceptionistTopUpPacksTable.code, req.params.code)).returning();
  if (!row) { res.status(404).json({ error: "Top-up pack not found" }); return; }
  res.json(normalizeInternalTopUpPack(row));
});
router.post("/internal/billing/receptionist-top-ups/:code/validate-mapping", async (req, res): Promise<void> => {
  if (!requireBillingAdmin(req, res)) return;
  const [pack] = await db.select().from(billingReceptionistTopUpPacksTable).where(eq(billingReceptionistTopUpPacksTable.code, req.params.code)).limit(1);
  if (!pack) { res.status(404).json({ error: "Top-up pack not found" }); return; }
  try { await verifyTopUpPrice(pack, new StripeApiClient(), false); } catch { res.status(400).json({ error: "Top-up billing configuration required." }); return; }
  const [updated] = await db.update(billingReceptionistTopUpPacksTable).set({ stripeMappingValidatedAt: new Date() }).where(eq(billingReceptionistTopUpPacksTable.id, pack.id)).returning();
  res.json(normalizeInternalTopUpPack(updated));
});
router.get("/internal/billing/profitability/:companyId", async (req, res): Promise<void> => {
  if (!requireBillingAdmin(req, res)) return;
  const companyId = Number(req.params.companyId);
  if (!Number.isSafeInteger(companyId) || companyId < 1) { res.status(400).json({ error: "Invalid company id" }); return; }
  const [subscription] = await db.select().from(companySubscriptionsTable).where(eq(companySubscriptionsTable.companyId, companyId)).limit(1);
  if (!subscription?.currentPeriodStartsAt || !subscription.currentPeriodEndsAt) { res.status(404).json({ error: "No Stripe billing period for this tenant" }); return; }
  const [plan] = subscription.planCode ? await db.select().from(billingPlansTable).where(eq(billingPlansTable.code, subscription.planCode)).limit(1) : [];
  const addOns = subscription.addOnCodes.length ? await db.select().from(billingAddOnsTable) : [];
  const subscriptionRevenueGbp = Number(plan?.monthlyPriceGbp ?? 0) + addOns
    .filter((addOn) => subscription.addOnCodes.includes(addOn.code)).reduce((total, addOn) => total + Number(addOn.monthlyPriceGbp ?? 0), 0);
  const period = { startsAt: subscription.currentPeriodStartsAt, endsAt: subscription.currentPeriodEndsAt };
  const [topUpRevenue] = await db.select({ value: sql<string>`coalesce(sum(${billingReceptionistTopUpPurchasesTable.customerPriceGbp}), 0)` }).from(billingReceptionistTopUpPurchasesTable).where(and(
    eq(billingReceptionistTopUpPurchasesTable.companyId, companyId), eq(billingReceptionistTopUpPurchasesTable.ownerUserId, subscription.ownerUserId),
    eq(billingReceptionistTopUpPurchasesTable.status, "granted"), eq(billingReceptionistTopUpPurchasesTable.periodStartsAt, period.startsAt), eq(billingReceptionistTopUpPurchasesTable.periodEndsAt, period.endsAt),
  ));
  const topUpRevenueGbp = Number(topUpRevenue?.value ?? 0);
  const revenueGbp = subscriptionRevenueGbp + topUpRevenueGbp;
  const [costEvents, durationEvents] = await Promise.all([
    providerCostHistoryForTenant(companyId, subscription.ownerUserId, period),
    db.select({
      providerReference: billingUsageEventsTable.providerReference,
      quantity: billingUsageEventsTable.quantity,
      occurredAt: billingUsageEventsTable.occurredAt,
    }).from(billingUsageEventsTable).where(and(
      eq(billingUsageEventsTable.companyId, companyId),
      eq(billingUsageEventsTable.ownerUserId, subscription.ownerUserId),
      eq(billingUsageEventsTable.usageCategory, "ai_receptionist_seconds"),
      sql`${billingUsageEventsTable.occurredAt} >= ${period.startsAt} and ${billingUsageEventsTable.occurredAt} < ${period.endsAt}`,
    )),
  ]);
  const durations = new Map(durationEvents.map((event) => [event.providerReference, Number(event.quantity)]));
  const profitability = summarizeProviderCosts(costEvents, revenueGbp);
  // This minimal internal history deliberately omits phone, transcript, and raw
  // Vapi data. Cost events and seconds share the canonical provider call ID.
  const calls = profitability.verified.map((event) => ({
    callId: event.providerReference,
    durationSeconds: durations.get(event.providerReference) ?? 0,
    providerCostAmount: event.providerCostAmount == null
      ? event.providerCostGbp == null ? null : Number(event.providerCostGbp)
      : Number(event.providerCostAmount),
    providerCostCurrency: event.providerCostAmount == null && event.providerCostGbp != null ? "GBP" : event.providerCostCurrency,
    date: event.occurredAt,
  }));
  res.json({
    companyId, period, subscriptionRevenueGbp, topUpRevenueGbp, totalRevenueGbp: revenueGbp,
    ...profitability, calls,
  });
});
router.patch("/internal/billing/:kind/:code", async (req, res): Promise<void> => {
  const userId = requireBillingAdmin(req, res); if (!userId) return;
  const parsed = internalCatalogPatch.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const mappingChanged = ["monthlyPriceGbp", "manualTrialPriceGbp", "trialPercentage", "stripeProductId", "stripeRecurringPriceId", "stripeTrialPriceId"].some((key) => key in parsed.data);
  const values = { ...parsed.data, updatedByUserId: userId, ...(mappingChanged ? { stripeMappingValidatedAt: null } : {}) };
  const table = req.params.kind === "plan" ? billingPlansTable : req.params.kind === "add-on" ? billingAddOnsTable : undefined;
  if (!table) { res.status(404).json({ error: "Unknown catalog kind" }); return; }
  const [updated] = await db.update(table).set(values as any).where(eq(table.code, req.params.code)).returning();
  if (!updated) { res.status(404).json({ error: "Catalog item not found" }); return; }
  res.json(updated);
});
router.post("/internal/billing/:kind/:code/validate-mapping", async (req, res): Promise<void> => {
  if (!requireBillingAdmin(req, res)) return;
  const table = req.params.kind === "plan" ? billingPlansTable : req.params.kind === "add-on" ? billingAddOnsTable : undefined;
  if (!table) { res.status(404).json({ error: "Unknown catalog kind" }); return; }
  const [item] = await db.select().from(table).where(eq(table.code, req.params.code)).limit(1);
  if (!item) { res.status(404).json({ error: "Catalog item not found" }); return; }
  try {
    const stripe = new StripeApiClient();
    await verifyCatalogPrice(item as any, "monthly", stripe);
    await verifyCatalogPrice(item as any, "paid_trial", stripe);
  } catch (error) {
    req.log.warn({ err: error, kind: req.params.kind, code: req.params.code }, "Stripe catalog mapping validation failed");
    res.status(400).json({ error: "Billing configuration required." });
    return;
  }
  const [updated] = await db.transaction(async (tx: any) => tx.update(table).set({ stripeMappingValidatedAt: new Date() }).where(eq(table.code, req.params.code)).returning());
  res.json(normalizeInternalCatalogItem(updated, req.params.kind === "plan" ? (updated as any).trialDays : null));
});

router.get("/billing/catalog", async (_req, res): Promise<void> => {
  const [plans, addOns] = await Promise.all([
    db.select().from(billingPlansTable).where(eq(billingPlansTable.active, true)).orderBy(asc(billingPlansTable.sortOrder), asc(billingPlansTable.id)),
    db.select().from(billingAddOnsTable).where(eq(billingAddOnsTable.active, true)).orderBy(asc(billingAddOnsTable.sortOrder), asc(billingAddOnsTable.id)),
  ]);
  res.json(GetBillingCatalogResponse.parse({
    plans: plans.map((p) => ({ code: p.code, name: p.name, description: p.description, monthlyPriceGbp: Number(p.monthlyPriceGbp), trialPriceGbp: trialPriceGbp(p), trialDays: p.trialDays, featureCategories: p.featureCategories, usageLimits: p.usageLimits as Record<string, number> | null, includedAllowance: p.includedAllowance as Record<string, number> | null, overagePolicy: p.overagePolicy, active: p.active, comingSoon: p.comingSoon, sortOrder: p.sortOrder, ...catalogAvailability(p) })),
    addOns: addOns.map((a) => ({ code: a.code, name: a.name, description: a.description, monthlyPriceGbp: a.monthlyPriceGbp == null ? null : Number(a.monthlyPriceGbp), trialPriceGbp: trialPriceGbp(a), trialDays: 7, featureCategories: a.featureCategories, usageLimits: a.usageLimits as Record<string, number> | null, includedAllowance: a.includedAllowance as Record<string, number> | null, overagePolicy: a.overagePolicy, active: a.active, comingSoon: a.comingSoon, sortOrder: a.sortOrder, ...catalogAvailability(a) })),
  }));
});
router.get("/billing/receptionist-top-ups", async (_req, res): Promise<void> => {
  res.json({ packs: await listReceptionistTopUps() });
});
router.post("/billing/receptionist-top-ups/checkout", async (req, res): Promise<void> => {
  const userId = authUser(req, res); if (!userId) return;
  const parsed = z.object({ packCode: z.string().min(1).max(100) }).strict().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Only a top-up pack code may be submitted." }); return; }
  const company = await tenantCompany(userId); if (!company) { res.status(400).json({ error: "Company profile is required" }); return; }
  try {
    const result = await createReceptionistTopUpCheckout({ companyId: company.id, ownerUserId: userId, packCode: parsed.data.packCode });
    if (!result.ok) { res.status(501).json(result); return; }
    res.json(result);
  } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : "Unable to create top-up Checkout." }); }
});

router.get("/billing", async (req, res): Promise<void> => {
  const userId = authUser(req, res); if (!userId) return;
  const company = await tenantCompany(userId);
  if (!company) { res.json(GetBillingOverviewResponse.parse(overview(undefined))); return; }
  res.json(GetBillingOverviewResponse.parse(overview(await subscriptionFor(company.id, userId))));
});

router.put("/billing/selection", async (req, res): Promise<void> => {
  const userId = authUser(req, res); if (!userId) return;
  const parsed = SaveBillingSelectionBody.safeParse(req.body);
  if (!parsed.success) { req.log.warn({ errors: parsed.error.message }, "Invalid billing selection"); res.status(400).json({ error: parsed.error.message }); return; }
  const company = await tenantCompany(userId);
  if (!company) { res.status(400).json({ error: "Company profile is required before selecting a plan" }); return; }
  const [plan] = await db.select().from(billingPlansTable).where(and(eq(billingPlansTable.code, parsed.data.planCode), eq(billingPlansTable.active, true)));
  const validAddOns = await db.select().from(billingAddOnsTable).where(eq(billingAddOnsTable.active, true));
  if (!plan || !catalogAvailability(plan).purchasable) { res.status(400).json({ error: "Billing configuration required for this plan" }); return; }
  if (parsed.data.planCode === "complete" && parsed.data.addOnCodes.length) { res.status(400).json({ error: "Complete includes all available premium categories and cannot select add-ons" }); return; }
  const invalid = parsed.data.addOnCodes.find((code) => {
    const addOn = validAddOns.find((candidate) => candidate.code === code);
    return !addOn || !catalogAvailability(addOn).purchasable;
  });
  if (invalid) { res.status(400).json({ error: `Add-on ${invalid} is unavailable or requires billing configuration` }); return; }
  const [row] = await db.insert(companySubscriptionsTable).values({ companyId: company.id, ownerUserId: userId, pendingPlanCode: parsed.data.planCode, pendingAddOnCodes: parsed.data.addOnCodes })
    .onConflictDoUpdate({ target: [companySubscriptionsTable.companyId, companySubscriptionsTable.ownerUserId], set: { pendingPlanCode: parsed.data.planCode, pendingAddOnCodes: parsed.data.addOnCodes } }).returning();
  if (row.provider === "stripe" && ["trialing", "active", "past_due"].includes(row.status)) {
    await billingProvider.applySelection({ companyId: company.id, ownerUserId: userId, planCode: parsed.data.planCode, addOnCodes: parsed.data.addOnCodes });
    res.json(SaveBillingSelectionResponse.parse(overview(await subscriptionFor(company.id, userId))));
    return;
  }
  res.json(SaveBillingSelectionResponse.parse(overview(row)));
});

router.post("/billing/checkout", async (req, res): Promise<void> => {
    const userId = authUser(req, res); if (!userId) return;
    const company = await tenantCompany(userId);
    if (!company) { res.status(400).json({ error: "Company profile is required" }); return; }
    const sub = await subscriptionFor(company.id, userId);
    const result = await billingProvider.createCheckoutSession({ companyId: company.id, ownerUserId: userId, planCode: sub?.pendingPlanCode ?? "", addOnCodes: sub?.pendingAddOnCodes ?? [] });
    if (!result.ok) { req.log.info({ code: result.code }, "Billing provider unavailable"); res.status(501).json(result); return; }
    res.json(result);
});
for (const [path, action] of [["/billing/portal", "createCustomerPortalSession"], ["/billing/cancellation", "cancelSubscription"]] as const) {
  router.post(path, async (req, res): Promise<void> => {
    const userId = authUser(req, res); if (!userId) return;
    const company = await tenantCompany(userId);
    if (!company) { res.status(400).json({ error: "Company profile is required" }); return; }
    const result = await billingProvider[action]({ companyId: company.id, ownerUserId: userId });
    if (!result.ok) { req.log.info({ code: result.code }, "Billing provider unavailable"); res.status(501).json(result); return; }
    if (action === "cancelSubscription") {
      res.json(GetBillingOverviewResponse.parse(overview(await subscriptionFor(company.id, userId))));
      return;
    }
    res.json(result);
  });
}

router.get("/onboarding", async (req, res): Promise<void> => {
  const userId = authUser(req, res); if (!userId) return;
  const company = await tenantCompany(userId);
  const row = company && (await db.select().from(onboardingProgressTable).where(and(eq(onboardingProgressTable.companyId, company.id), eq(onboardingProgressTable.ownerUserId, userId))).limit(1))[0];
  res.json(GetOnboardingResponse.parse(onboarding(row)));
});
router.post("/onboarding", async (req, res): Promise<void> => {
  const userId = authUser(req, res); if (!userId) return;
  const company = await tenantCompany(userId);
  if (!company) { res.status(400).json({ error: "Company profile is required to start onboarding" }); return; }
  const [row] = await db.insert(onboardingProgressTable).values({ companyId: company.id, ownerUserId: userId })
    .onConflictDoUpdate({ target: [onboardingProgressTable.companyId, onboardingProgressTable.ownerUserId], set: { updatedAt: new Date() } }).returning();
  res.status(201).json(StartOnboardingResponse.parse(onboarding(row)));
});
router.patch("/onboarding/progress", async (req, res): Promise<void> => {
  const userId = authUser(req, res); if (!userId) return;
  const parsed = UpdateOnboardingBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const company = await tenantCompany(userId); if (!company) { res.status(404).json({ error: "Onboarding not started" }); return; }
  const [row] = await db.update(onboardingProgressTable).set(parsed.data).where(and(eq(onboardingProgressTable.companyId, company.id), eq(onboardingProgressTable.ownerUserId, userId))).returning();
  if (!row) { res.status(404).json({ error: "Onboarding not started" }); return; }
  res.json(UpdateOnboardingResponse.parse(onboarding(row)));
});
for (const [path, status, parser] of [["/onboarding/complete", "completed", CompleteOnboardingResponse], ["/onboarding/skip", "skipped", SkipOnboardingResponse]] as const) {
  router.post(path, async (req, res): Promise<void> => {
    const userId = authUser(req, res); if (!userId) return;
    const company = await tenantCompany(userId); if (!company) { res.status(404).json({ error: "Onboarding not started" }); return; }
    const now = new Date();
    const [row] = await db.update(onboardingProgressTable).set(status === "completed" ? { status, completedAt: now } : { status, skippedAt: now }).where(and(eq(onboardingProgressTable.companyId, company.id), eq(onboardingProgressTable.ownerUserId, userId))).returning();
    if (!row) { res.status(404).json({ error: "Onboarding not started" }); return; }
    res.json(parser.parse(onboarding(row)));
  });
}
router.get("/billing/usage", async (req, res): Promise<void> => {
  const userId = authUser(req, res); if (!userId) return;
  const company = await tenantCompany(userId);
  if (!company) { res.json(GetBillingUsageResponse.parse({ events: [], period: null, aiReceptionist: null })); return; }
  const subscription = await subscriptionFor(company.id, userId);
  // Never present a calendar month as a production billing period for an
  // unbilled legacy account. Development's explicit fallback is labelled.
  if (!subscription?.currentPeriodStartsAt || !subscription.currentPeriodEndsAt) {
    if (process.env.NODE_ENV !== "development") { res.json(GetBillingUsageResponse.parse({ events: [], period: null, aiReceptionist: null })); return; }
  }
  const period = await usagePeriodForTenant(company.id, userId);
  const [events, entitlements, receptionistTopUps] = await Promise.all([
    usageForTenant(company.id, userId, period),
    tenantEntitlements(userId),
    grantedReceptionistTopUpMinutes(company.id, userId, period),
  ]);
  const includedMinutes = entitlements.limits.ai_receptionist ?? 0;
  const usedMinutes = allowanceQuantity("ai_receptionist", events);
  const effectiveMinutes = includedMinutes + receptionistTopUps;
  res.json(GetBillingUsageResponse.parse({
    period: { startsAt: period.startsAt, endsAt: period.endsAt, developmentFallback: period.isDevelopmentFallback },
    aiReceptionist: {
      includedMinutes, topUpMinutes: receptionistTopUps, effectiveMinutes, usedMinutes,
      remainingMinutes: Math.max(0, effectiveMinutes - usedMinutes),
      percentageUsed: effectiveMinutes === 0 ? null : Math.min(100, usedMinutes / effectiveMinutes * 100),
      periodStartsAt: period.startsAt, periodEndsAt: period.endsAt,
    },
    events: events.map((event) => {
      // The provider ledger retains exact Vapi seconds, but customers purchase
      // and see call minutes. Never compare/display seconds against minute caps.
      const quantity = event.featureCode === "ai_receptionist"
        ? allowanceQuantity("ai_receptionist", events)
        : Number(event.quantity);
      const includedLimit = entitlements.limits[event.featureCode] ?? null;
      const limit = event.featureCode === "ai_receptionist" && includedLimit != null
        ? includedLimit + receptionistTopUps
        : includedLimit;
      return { ...event, quantity, unit: event.featureCode === "ai_receptionist" ? "minutes" : event.unit, limit, remaining: limit == null ? null : Math.max(0, limit - quantity), percentageUsed: limit == null ? null : Math.min(100, quantity / limit * 100) };
    }),
  }));
});
router.post("/dev/billing/simulate", async (req, res): Promise<void> => {
  if (process.env.NODE_ENV !== "development") { res.sendStatus(404); return; }
  const userId = authUser(req, res); if (!userId) return;
  const parsed = SimulateBillingStateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const company = await tenantCompany(userId); if (!company) { res.status(400).json({ error: "Company profile is required" }); return; }
  const now = new Date();
  const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const stateDates = parsed.data.status === "trialing"
    ? { trialEndsAt: sevenDays, currentPeriodStartsAt: now, currentPeriodEndsAt: sevenDays, cancelledAt: null, failedPaymentAt: null }
    : parsed.data.status === "active"
      ? { trialEndsAt: null, currentPeriodStartsAt: now, currentPeriodEndsAt: thirtyDays, cancelledAt: null, failedPaymentAt: null }
      : parsed.data.status === "past_due"
        ? { trialEndsAt: null, currentPeriodStartsAt: now, currentPeriodEndsAt: thirtyDays, cancelledAt: null, failedPaymentAt: now }
        : { trialEndsAt: null, currentPeriodStartsAt: null, currentPeriodEndsAt: null, cancelledAt: now, failedPaymentAt: null };
  const values = { companyId: company.id, ownerUserId: userId, planCode: parsed.data.planCode, addOnCodes: parsed.data.addOnCodes, status: parsed.data.status, ...stateDates };
  const [row] = await db.insert(companySubscriptionsTable).values(values)
    .onConflictDoUpdate({ target: [companySubscriptionsTable.companyId, companySubscriptionsTable.ownerUserId], set: { planCode: parsed.data.planCode, addOnCodes: parsed.data.addOnCodes, status: parsed.data.status, ...stateDates } }).returning();
  res.json(SimulateBillingStateResponse.parse(overview(row)));
});

export default router;