import assert from "node:assert/strict";
import test from "node:test";
import { resolveEntitlements, canUseMeteredFeature } from "../src/services/billing/entitlements";
import { UnavailableBillingProvider } from "../src/services/billing/provider";

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