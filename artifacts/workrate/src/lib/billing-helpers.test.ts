/**
 * billing-helpers.test.ts
 *
 * Pure-function tests for billing-helpers.ts.
 * Run with: cd artifacts/workrate && pnpm vitest run
 */

import { test, expect, describe } from "vitest";

import {
  deriveTrialPercentage,
  trialHeadline,
  resolveAddOns,
  toggleAddOnCode,
  initialAddOnsFromOverview,
  initialPlanFromOverview,
  isCompleteBetterValue,
  computeSelectionTotals,
  buildSelectionPayload,
} from "./billing-helpers";

// ── deriveTrialPercentage ─────────────────────────────────────────────────────

describe("deriveTrialPercentage", () => {
  test("returns 50 for half price", () => {
    expect(deriveTrialPercentage(15, 30)).toBe(50);
  });

  test("returns 33 for ~1/3 (rounds to nearest)", () => {
    // 10/30 = 33.33... → rounds to 33
    expect(deriveTrialPercentage(10, 30)).toBe(33);
  });

  test("returns null when trialPriceGbp is null", () => {
    expect(deriveTrialPercentage(null, 30)).toBeNull();
  });

  test("returns null when monthlyPriceGbp is null", () => {
    expect(deriveTrialPercentage(15, null)).toBeNull();
  });

  test("returns null when monthlyPriceGbp is 0 (avoids division by zero)", () => {
    expect(deriveTrialPercentage(0, 0)).toBeNull();
  });
});

// ── trialHeadline ─────────────────────────────────────────────────────────────

describe("trialHeadline", () => {
  test("includes percentage when derivable", () => {
    const result = trialHeadline(7, 15, 30);
    expect(result).toMatch(/50%/);
    expect(result).toMatch(/7/);
  });

  test("omits percentage when prices are null", () => {
    const result = trialHeadline(14, null, null);
    expect(result).not.toMatch(/%/);
    expect(result).toMatch(/14/);
  });

  test("omits percentage when only trial price is null", () => {
    const result = trialHeadline(7, null, 30);
    expect(result).not.toMatch(/%/);
  });
});

// ── resolveAddOns ─────────────────────────────────────────────────────────────

describe("resolveAddOns", () => {
  test("returns serverAddOns when selectedAddOns is null (uninitialized)", () => {
    expect(resolveAddOns(null, ["seo", "crm"])).toEqual(["seo", "crm"]);
  });

  test("returns [] when user deliberately cleared all add-ons ([] ≠ fallback)", () => {
    // The key behaviour: [] must NOT fall back to serverAddOns
    expect(resolveAddOns([], ["seo", "crm"])).toEqual([]);
  });

  test("returns user selection when user has chosen add-ons", () => {
    expect(resolveAddOns(["seo"], ["crm"])).toEqual(["seo"]);
  });
});

// ── toggleAddOnCode ───────────────────────────────────────────────────────────

describe("toggleAddOnCode", () => {
  test("adds code when not present", () => {
    expect(toggleAddOnCode(["seo"], "crm")).toEqual(["seo", "crm"]);
  });

  test("removes code when present", () => {
    expect(toggleAddOnCode(["seo", "crm"], "seo")).toEqual(["crm"]);
  });

  test("returns a new array reference (immutable)", () => {
    const original = ["seo"];
    const result = toggleAddOnCode(original, "crm");
    expect(result).not.toBe(original);
  });
});

// ── initialAddOnsFromOverview ─────────────────────────────────────────────────

describe("initialAddOnsFromOverview", () => {
  test("prefers pendingAddOnCodes over addOnCodes", () => {
    expect(
      initialAddOnsFromOverview({ pendingAddOnCodes: ["seo"], addOnCodes: ["crm"] })
    ).toEqual(["seo"]);
  });

  test("falls back to addOnCodes when pending is null", () => {
    expect(
      initialAddOnsFromOverview({ pendingAddOnCodes: null, addOnCodes: ["crm"] })
    ).toEqual(["crm"]);
  });

  test("returns [] for null overview", () => {
    expect(initialAddOnsFromOverview(null)).toEqual([]);
  });

  test("returns [] for undefined overview", () => {
    expect(initialAddOnsFromOverview(undefined)).toEqual([]);
  });
});

// ── initialPlanFromOverview ───────────────────────────────────────────────────

describe("initialPlanFromOverview", () => {
  test("returns pendingPlanCode when present", () => {
    expect(
      initialPlanFromOverview({ pendingPlanCode: "complete", planCode: "core" })
    ).toBe("complete");
  });

  test("falls back to planCode when pending is null", () => {
    expect(
      initialPlanFromOverview({ pendingPlanCode: null, planCode: "core" })
    ).toBe("core");
  });

  test("returns null when no plan is set", () => {
    expect(initialPlanFromOverview(null)).toBeNull();
  });

  test("returns null for unknown plan codes (guard against unexpected server values)", () => {
    expect(
      initialPlanFromOverview({ pendingPlanCode: "enterprise" as any })
    ).toBeNull();
  });
});

// ── isCompleteBetterValue ─────────────────────────────────────────────────────

const corePlan = { monthlyPriceGbp: 30 };
const completePlan = { monthlyPriceGbp: 50 };
const addOns = [
  { code: "seo",  monthlyPriceGbp: 10 },
  { code: "crm",  monthlyPriceGbp: 15 },
  { code: "chat", monthlyPriceGbp: 20 },
];

describe("isCompleteBetterValue", () => {
  test("true at the >= boundary (core+addon equals complete)", () => {
    // 30 + 20 = 50 === complete(50) → true
    const addOns2 = [{ code: "chat", monthlyPriceGbp: 20 }];
    expect(isCompleteBetterValue(corePlan, completePlan, ["chat"], addOns2)).toBe(true);
  });

  test("true when core+addons exceeds complete", () => {
    // 30 + 10 + 15 = 55 > 50
    expect(isCompleteBetterValue(corePlan, completePlan, ["seo", "crm"], addOns)).toBe(true);
  });

  test("false when core+addons is below complete", () => {
    // 30 + 10 = 40 < 50
    expect(isCompleteBetterValue(corePlan, completePlan, ["seo"], addOns)).toBe(false);
  });

  test("false when no add-ons selected (core alone < complete)", () => {
    expect(isCompleteBetterValue(corePlan, completePlan, [], addOns)).toBe(false);
  });

  test("false when an add-on price is null (can't safely compare)", () => {
    const addOnsWithNull = [{ code: "seo", monthlyPriceGbp: null }];
    expect(isCompleteBetterValue(corePlan, completePlan, ["seo"], addOnsWithNull)).toBe(false);
  });

  test("false when complete plan is null", () => {
    expect(isCompleteBetterValue(corePlan, null, ["seo"], addOns)).toBe(false);
  });

  test("false when core plan is null", () => {
    expect(isCompleteBetterValue(null, completePlan, ["seo"], addOns)).toBe(false);
  });

  // Critical: purchasable is NOT part of the comparison — only monthly amounts
  test("comparison is purely on monthly amounts (purchasable field not involved)", () => {
    // Same amounts, should still be true regardless of any purchasable state
    const addOns2 = [{ code: "chat", monthlyPriceGbp: 20 }];
    expect(isCompleteBetterValue(corePlan, completePlan, ["chat"], addOns2)).toBe(true);
  });
});

// ── computeSelectionTotals ────────────────────────────────────────────────────

const planFull = { monthlyPriceGbp: 30, trialPriceGbp: 15, trialDays: 7 };
const addonsFull = [
  { code: "seo",  monthlyPriceGbp: 10, trialPriceGbp: 5,    trialDays: 7  },
  { code: "crm",  monthlyPriceGbp: 15, trialPriceGbp: 7,    trialDays: 14 },
  { code: "chat", monthlyPriceGbp: 20, trialPriceGbp: null, trialDays: 7  },
];

describe("computeSelectionTotals", () => {
  test("computes correct monthly total", () => {
    const { monthlyTotal } = computeSelectionTotals(planFull, ["seo"], addonsFull);
    expect(monthlyTotal).toBe(40); // 30 + 10
  });

  test("computes correct trial total when all add-ons are priced", () => {
    const { trialTotal } = computeSelectionTotals(planFull, ["seo"], addonsFull);
    expect(trialTotal).toBe(20); // 15 + 5
  });

  test("trialTotal is null when an add-on has null trial price", () => {
    const { trialTotal } = computeSelectionTotals(planFull, ["chat"], addonsFull);
    expect(trialTotal).toBeNull();
  });

  test("monthlyTotal is null when an add-on has null monthly price", () => {
    const addOnsWithNull = [{ code: "x", monthlyPriceGbp: null, trialPriceGbp: null, trialDays: 7 }];
    const { monthlyTotal } = computeSelectionTotals(planFull, ["x"], addOnsWithNull);
    expect(monthlyTotal).toBeNull();
  });

  test("detects trial days mismatch across add-ons (crm=14 ≠ plan=7)", () => {
    const { addOnTrialDaysMismatch } = computeSelectionTotals(planFull, ["seo", "crm"], addonsFull);
    expect(addOnTrialDaysMismatch).toBe(true);
  });

  test("no mismatch when all add-ons match plan trial days", () => {
    const { addOnTrialDaysMismatch } = computeSelectionTotals(planFull, ["seo"], addonsFull);
    expect(addOnTrialDaysMismatch).toBe(false);
  });

  test("planTrialDays always returns the plan's value (not add-on's)", () => {
    const { planTrialDays } = computeSelectionTotals(planFull, ["crm"], addonsFull);
    expect(planTrialDays).toBe(7); // plan=7, crm=14, but we want plan's value
  });

  test("handles empty add-on selection correctly", () => {
    const { monthlyTotal, trialTotal } = computeSelectionTotals(planFull, [], addonsFull);
    expect(monthlyTotal).toBe(30);
    expect(trialTotal).toBe(15);
  });

  test("returns zero planTrialDays for null plan", () => {
    const { planTrialDays } = computeSelectionTotals(null, [], addonsFull);
    expect(planTrialDays).toBe(0);
  });
});

// ── buildSelectionPayload ─────────────────────────────────────────────────────

describe("buildSelectionPayload", () => {
  test("preserves empty addOnCodes array (submitting [] removes all add-ons)", () => {
    const payload = buildSelectionPayload("core", []);
    expect(payload).toEqual({ planCode: "core", addOnCodes: [] });
  });

  test("includes add-on codes in payload", () => {
    const payload = buildSelectionPayload("core", ["seo", "crm"]);
    expect(payload).toEqual({ planCode: "core", addOnCodes: ["seo", "crm"] });
  });

  test("works for complete plan with no add-ons", () => {
    const payload = buildSelectionPayload("complete", []);
    expect(payload).toEqual({ planCode: "complete", addOnCodes: [] });
  });
});
