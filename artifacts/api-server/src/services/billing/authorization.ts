import { and, eq } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { billingAddOnsTable, billingPlansTable, companiesTable, companySubscriptionsTable, db } from "@workspace/db";
import { resolveEntitlements } from "./entitlements";

export type BillingAccessError = { error: "PAYMENT_REQUIRED"; featureKey: string; message: string };

/** Resolves only the authenticated owner's tenant; absence of a subscription is legacy access. */
export async function tenantEntitlements(ownerUserId: string) {
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.ownerUserId, ownerUserId)).limit(1);
  if (!company) return resolveEntitlements({ legacyAccess: true, subscription: undefined, plans: [], addOns: [] });
  const [subscription] = await db.select().from(companySubscriptionsTable)
    .where(and(eq(companySubscriptionsTable.companyId, company.id), eq(companySubscriptionsTable.ownerUserId, ownerUserId))).limit(1);
  if (!subscription) return resolveEntitlements({ legacyAccess: true, subscription: undefined, plans: [], addOns: [] });
  const [plans, allAddOns] = await Promise.all([db.select().from(billingPlansTable), db.select().from(billingAddOnsTable)]);
  return resolveEntitlements({
    legacyAccess: false,
    subscription: { status: subscription.status, planCode: subscription.planCode, addOnCodes: subscription.addOnCodes },
    plans: plans.filter((plan) => plan.active).map((plan) => ({ code: plan.code, featureCategories: plan.featureCategories, usageLimits: plan.usageLimits as Record<string, number> | null })),
    // A catalogue deactivation is an immediate revocation on the next request.
    addOns: allAddOns.filter((addOn) => addOn.active && !addOn.comingSoon).map((addOn) => ({ code: addOn.code, featureCategories: addOn.featureCategories, usageLimits: addOn.usageLimits as Record<string, number> | null })),
  });
}

export async function requireFeature(ownerUserId: string, featureKey: string): Promise<BillingAccessError | null> {
  const entitlement = await tenantEntitlements(ownerUserId);
  return featureAccess(entitlement, featureKey);
}
export function featureAccess(entitlement: ReturnType<typeof resolveEntitlements>, featureKey: string): BillingAccessError | null {
  if (entitlement.access === "legacy" || entitlement.categories.includes("*") || entitlement.categories.includes(featureKey)) return null;
  return { error: "PAYMENT_REQUIRED", featureKey, message: `An active subscription with ${featureKey} is required.` };
}

/** Express middleware for Clerk-authenticated, owner-scoped paid feature boundaries. */
export function requireBillingFeature(featureKey: string) {
  return async (req: any, res: any, next: any) => {
    const userId = getAuth(req).userId;
    // Routes put this after their existing Clerk requireAuth middleware.
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const denied = await requireFeature(userId, featureKey);
    if (denied) { res.status(402).json(denied); return; }
    next();
  };
}