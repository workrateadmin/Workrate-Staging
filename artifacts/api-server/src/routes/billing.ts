import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { and, asc, eq } from "drizzle-orm";
import {
  billingAddOnsTable, billingPlansTable, billingUsageEventsTable, companiesTable,
  companySubscriptionsTable, db, onboardingProgressTable,
} from "@workspace/db";
import {
  CompleteOnboardingResponse, GetBillingCatalogResponse, GetBillingOverviewResponse,
  GetBillingUsageResponse, GetOnboardingResponse, SaveBillingSelectionBody,
  SaveBillingSelectionResponse, SimulateBillingStateBody, SimulateBillingStateResponse,
  SkipOnboardingResponse, StartOnboardingResponse, UpdateOnboardingBody, UpdateOnboardingResponse,
} from "@workspace/api-zod";
import { billingProvider } from "../services/billing/provider";
import { usageForTenant } from "../services/billing/usage";

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

router.get("/billing/catalog", async (_req, res): Promise<void> => {
  const [plans, addOns] = await Promise.all([
    db.select().from(billingPlansTable).where(eq(billingPlansTable.active, true)).orderBy(asc(billingPlansTable.id)),
    db.select().from(billingAddOnsTable).where(eq(billingAddOnsTable.active, true)).orderBy(asc(billingAddOnsTable.id)),
  ]);
  res.json(GetBillingCatalogResponse.parse({
    plans: plans.map((p) => ({ ...p, monthlyPriceGbp: Number(p.monthlyPriceGbp), trialPriceGbp: Number(p.trialPriceGbp), usageLimits: p.usageLimits as Record<string, number> | null })),
    addOns: addOns.map((a) => ({ ...a, monthlyPriceGbp: a.monthlyPriceGbp == null ? null : Number(a.monthlyPriceGbp), usageLimits: a.usageLimits as Record<string, number> | null })),
  }));
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
  if (!plan || parsed.data.addOnCodes.some((code) => !validAddOns.some((addOn) => addOn.code === code))) { res.status(400).json({ error: "Unknown or inactive billing selection" }); return; }
  const [row] = await db.insert(companySubscriptionsTable).values({ companyId: company.id, ownerUserId: userId, pendingPlanCode: parsed.data.planCode, pendingAddOnCodes: parsed.data.addOnCodes })
    .onConflictDoUpdate({ target: [companySubscriptionsTable.companyId, companySubscriptionsTable.ownerUserId], set: { pendingPlanCode: parsed.data.planCode, pendingAddOnCodes: parsed.data.addOnCodes } }).returning();
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
  const events = company ? await usageForTenant(company.id, userId) : [];
  res.json(GetBillingUsageResponse.parse({ events: events.map((event) => ({ ...event, quantity: Number(event.quantity) })) }));
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