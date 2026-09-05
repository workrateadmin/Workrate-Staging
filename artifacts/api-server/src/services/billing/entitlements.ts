export type SubscriptionState = "pending_selection" | "trialing" | "active" | "past_due" | "cancelled";
export type CatalogPlan = { code: string; featureCategories: string[]; usageLimits: Record<string, number> | null };
export type CatalogAddOn = { code: string; featureCategories: string[]; usageLimits: Record<string, number> | null };
export type Entitlements = { access: "legacy" | "none" | "subscription"; categories: string[]; limits: Record<string, number>; paid: boolean };

export function resolveEntitlements(input: {
  legacyAccess: boolean; subscription: { status: string; planCode: string | null; addOnCodes: string[]; currentPeriodEndsAt?: Date | null } | undefined;
  plans: CatalogPlan[]; addOns: CatalogAddOn[];
}): Entitlements {
  if (input.legacyAccess) return { access: "legacy" as const, categories: ["*"], limits: {}, paid: false };
  const subscription = input.subscription;
  // A cancellation scheduled for period end remains active until that paid
  // period closes; a fully cancelled subscription does not.
  const cancelledButStillPaid = subscription?.status === "cancelled" && !!subscription.currentPeriodEndsAt && subscription.currentPeriodEndsAt > new Date();
  if (!subscription || !["trialing", "active"].includes(subscription.status) && !cancelledButStillPaid) {
    return { access: "none" as const, categories: [], limits: {}, paid: false };
  }
  const selected = [input.plans.find((p) => p.code === subscription.planCode), ...subscription.addOnCodes.map((code) => input.addOns.find((a) => a.code === code))].filter(Boolean) as (CatalogPlan | CatalogAddOn)[];
  const categories = new Set<string>();
  const limits: Record<string, number> = {};
  for (const item of selected) {
    item.featureCategories.forEach((category) => categories.add(category));
    for (const [feature, limit] of Object.entries(item.usageLimits ?? {})) limits[feature] = (limits[feature] ?? 0) + limit;
  }
  // Complete category access is explicit; variable-cost feature limits remain configuration-driven.
  if (subscription.planCode === "complete") categories.add("*");
  return { access: "subscription" as const, categories: [...categories], limits, paid: subscription.status === "active" };
}

export function canUseMeteredFeature(entitlements: ReturnType<typeof resolveEntitlements>, featureCode: string, used: number, enforce: boolean) {
  if (!enforce) return { allowed: true, reason: "not_enforced" };
  const limit = entitlements.limits[featureCode];
  // Unknown allowances never authorize costly work.
  if (limit == null) return { allowed: false, reason: "LIMIT_NOT_CONFIGURED" };
  return used < limit ? { allowed: true, reason: "within_limit" } : { allowed: false, reason: "LIMIT_REACHED" };
}