import { and, eq } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { billingAddOnsTable, billingPlansTable, companiesTable, companySubscriptionsTable, db } from "@workspace/db";
import { canUseMeteredFeature, resolveEntitlements } from "./entitlements";
import { allowanceQuantity, grantedReceptionistTopUpMinutes, reserveUsage, usageForTenant, usagePeriodForTenant } from "./usage";

export type BillingAccessError = { error: "PAYMENT_REQUIRED"; featureKey: string; message: string };

/** Resolves only the authenticated owner's tenant. Legacy access is explicit. */
export async function tenantEntitlements(ownerUserId: string) {
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.ownerUserId, ownerUserId)).limit(1);
  // A missing company/subscription is not an entitlement. Only the migration's
  // explicit company marker can preserve pre-billing access.
  if (!company) return resolveEntitlements({ legacyAccess: false, subscription: undefined, plans: [], addOns: [] });
  const [subscription] = await db.select().from(companySubscriptionsTable)
    .where(and(eq(companySubscriptionsTable.companyId, company.id), eq(companySubscriptionsTable.ownerUserId, ownerUserId))).limit(1);
  if (!subscription) return resolveEntitlements({ legacyAccess: company.legacyBilling, subscription: undefined, plans: [], addOns: [] });
  const [plans, allAddOns] = await Promise.all([db.select().from(billingPlansTable), db.select().from(billingAddOnsTable)]);
  return resolveEntitlements({
    legacyAccess: false,
    subscription: { status: subscription.status, planCode: subscription.planCode, addOnCodes: subscription.addOnCodes, currentPeriodEndsAt: subscription.currentPeriodEndsAt },
    plans: plans.filter((plan) => plan.active).map((plan) => ({ code: plan.code, featureCategories: plan.featureCategories, usageLimits: plan.usageLimits as Record<string, number> | null })),
    // A catalogue deactivation is an immediate revocation on the next request.
    addOns: allAddOns.filter((addOn) => addOn.active && !addOn.comingSoon).map((addOn) => ({ code: addOn.code, featureCategories: addOn.featureCategories, usageLimits: addOn.usageLimits as Record<string, number> | null })),
  });
}

/** Server-side pre-provider authorization for variable-cost work. */
export async function authorizeMeteredFeature(ownerUserId: string, featureKey: string) {
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.ownerUserId, ownerUserId)).limit(1);
  const entitlement = await tenantEntitlements(ownerUserId);
  const accessError = featureAccess(entitlement, featureKey);
  if (accessError) return { allowed: false as const, ...accessError };
  if (entitlement.access === "legacy") return { allowed: true as const, reason: "legacy_safeguard" as const };
  if (!company) return { allowed: false as const, error: "PAYMENT_REQUIRED" as const, featureKey, message: "Company profile is required." };
  const period = await usagePeriodForTenant(company.id, ownerUserId);
  const usage = await usageForTenant(company.id, ownerUserId, period);
  const used = allowanceQuantity(featureKey, usage);
  const topUpMinutes = featureKey === "ai_receptionist" ? await grantedReceptionistTopUpMinutes(company.id, ownerUserId, period) : 0;
  const effectiveEntitlement = { ...entitlement, limits: { ...entitlement.limits, [featureKey]: (entitlement.limits[featureKey] ?? 0) + topUpMinutes } };
  const decision = canUseMeteredFeature(effectiveEntitlement, featureKey, used, true);
  return decision.allowed
    ? { allowed: true as const, reason: decision.reason, used, limit: effectiveEntitlement.limits[featureKey], period }
    : { allowed: false as const, error: "USAGE_LIMIT_REACHED" as const, featureKey, message: "You've reached this month's included allowance.", reason: decision.reason, used, limit: effectiveEntitlement.limits[featureKey], period };
}

/** Atomically reserves allowance before a provider invocation. */
export async function reserveMeteredFeature(ownerUserId: string, featureKey: string, dedupeKey: string, quantity = 1) {
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.ownerUserId, ownerUserId)).limit(1);
  const entitlement = await tenantEntitlements(ownerUserId);
  const denied = featureAccess(entitlement, featureKey);
  if (denied) return { allowed: false as const, ...denied };
  if (entitlement.access === "legacy") return { allowed: true as const, reason: "legacy_safeguard" as const };
  if (!company || !entitlement.limits[featureKey]) return { allowed: false as const, error: "PAYMENT_REQUIRED" as const, featureKey, message: "An active subscription with an allowance is required." };
  const period = await usagePeriodForTenant(company.id, ownerUserId);
  const topUpMinutes = featureKey === "ai_receptionist" ? await grantedReceptionistTopUpMinutes(company.id, ownerUserId, period) : 0;
  const reserved = await reserveUsage({ companyId: company.id, ownerUserId, period, featureCode: featureKey, quantity, limit: entitlement.limits[featureKey] + topUpMinutes, dedupeKey });
  return reserved.allowed
    ? { ...reserved, companyId: company.id, period }
    : { ...reserved, error: "USAGE_LIMIT_REACHED" as const, featureKey, message: "You've reached this month's included allowance." };
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