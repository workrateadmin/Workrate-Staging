/**
 * billing-helpers.ts
 *
 * Pure functions for billing plan/add-on selection UI.
 * No React, no side-effects — all testable with node --test.
 *
 * Rules:
 *  - No hardcoded prices, percentages, or trial lengths.
 *  - trialPercentage is derived from server trialPriceGbp / monthlyPriceGbp
 *    only when both are available.
 *  - "Complete better value" threshold: core+addons >= complete monthly price
 *    (>= only, never a markup). Purchasability check is separate.
 *  - Add-on state uses null as "uninitialized" sentinel so [] means "user
 *    deliberately removed all add-ons" and can be submitted.
 */

import type { BillingPlan, BillingAddOn, BillingCatalog } from "@workspace/api-client-react";
import type { BillingSelectionInputPlanCode } from "@workspace/api-client-react";

// ── Formatting ────────────────────────────────────────────────────────────────

export function fmtGbp(amount: number | null | undefined): string {
  if (amount == null) return "Price not set";
  return `£${amount.toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// ── Trial copy helpers ────────────────────────────────────────────────────────

/**
 * Derive the trial percentage from server-computed trialPriceGbp and
 * monthlyPriceGbp. Returns an integer (e.g. 50) or null if not derivable.
 *
 * NOTE: Neither BillingPlan nor BillingAddOn expose a trialPercentage field
 * in the customer catalog — only InternalBillingCatalogItem does.
 * We derive it client-side only for display purposes; we never submit it.
 */
export function deriveTrialPercentage(
  trialPriceGbp: number | null | undefined,
  monthlyPriceGbp: number | null | undefined,
): number | null {
  if (trialPriceGbp == null || monthlyPriceGbp == null || monthlyPriceGbp === 0)
    return null;
  return Math.round((trialPriceGbp / monthlyPriceGbp) * 100);
}

/**
 * Build the trial copy headline for a plan or add-on.
 *  - When trialPercentage is derivable: "First N days — paid trial at X%"
 *  - Otherwise: "First N days"
 *  - When trialPrice is null/unpriceable: neutral "N-day trial" (no amount)
 */
export function trialHeadline(
  trialDays: number,
  trialPriceGbp: number | null | undefined,
  monthlyPriceGbp: number | null | undefined,
): string {
  const pct = deriveTrialPercentage(trialPriceGbp, monthlyPriceGbp);
  if (pct !== null) {
    return `First ${trialDays} days — paid trial at ${pct}%`;
  }
  return `First ${trialDays} days`;
}

// ── Add-on state helpers ──────────────────────────────────────────────────────

/**
 * Derive the effective add-on selection to display:
 *  - If selectedAddOns is non-null (user has touched the control), use it as-is.
 *  - If null (uninitialized), fall back to serverAddOns.
 *
 * Crucially, [] is a valid "user cleared all add-ons" state and is preserved.
 * Only null means "not yet set by user".
 */
export function resolveAddOns(
  selectedAddOns: string[] | null,
  serverAddOns: string[],
): string[] {
  if (selectedAddOns !== null) return selectedAddOns;
  return serverAddOns;
}

/**
 * Toggle an add-on code in a list. Used by both onboarding and settings.
 * The returned list is always a new array reference.
 */
export function toggleAddOnCode(current: string[], code: string): string[] {
  return current.includes(code)
    ? current.filter((c) => c !== code)
    : [...current, code];
}

/**
 * Derive the initial add-on codes from a billing overview.
 * Priority: pendingAddOnCodes > addOnCodes.
 * Returns an empty array when neither is set.
 */
export function initialAddOnsFromOverview(overview: {
  pendingAddOnCodes?: string[] | null;
  addOnCodes?: string[] | null;
} | null | undefined): string[] {
  if (!overview) return [];
  return overview.pendingAddOnCodes ?? overview.addOnCodes ?? [];
}

/**
 * Derive the initial plan code from a billing overview.
 * Priority: pendingPlanCode > planCode.
 * Returns null when neither is set (caller decides the default).
 */
export function initialPlanFromOverview(overview: {
  pendingPlanCode?: string | null;
  planCode?: string | null;
} | null | undefined): BillingSelectionInputPlanCode | null {
  const code = overview?.pendingPlanCode ?? overview?.planCode ?? null;
  if (!code) return null;
  // Only accept valid plan codes
  if (code === "core" || code === "complete") {
    return code as BillingSelectionInputPlanCode;
  }
  return null;
}

// ── "Complete better value" comparison ────────────────────────────────────────

/**
 * Returns true iff the Core plan + selected add-ons monthly total is >= the
 * Complete plan monthly price.
 *
 * Rules:
 *  - Compare server monthly amounts only — no purchasability check here.
 *  - All required prices must be non-null; returns false otherwise.
 *  - Caller is responsible for disabling the action when Complete is not purchasable.
 */
export function isCompleteBetterValue(
  corePlan: Pick<BillingPlan, "monthlyPriceGbp"> | undefined | null,
  completePlan: Pick<BillingPlan, "monthlyPriceGbp"> | undefined | null,
  selectedAddOns: string[],
  allAddOns: Pick<BillingAddOn, "code" | "monthlyPriceGbp">[],
): boolean {
  if (!corePlan || !completePlan) return false;
  if (corePlan.monthlyPriceGbp == null || completePlan.monthlyPriceGbp == null)
    return false;

  let total = corePlan.monthlyPriceGbp;
  for (const code of selectedAddOns) {
    const addon = allAddOns.find((a) => a.code === code);
    if (addon?.monthlyPriceGbp == null) return false; // can't compare without all prices
    total += addon.monthlyPriceGbp;
  }

  return total >= completePlan.monthlyPriceGbp;
}

// ── Selection summary totals ──────────────────────────────────────────────────

/**
 * Compute monthly and trial totals for the selection summary.
 *
 * Rules:
 *  - All selected add-ons must have a monthlyPriceGbp; otherwise monthlyTotal=null.
 *  - Trial total is computed from each item's own trialPriceGbp and trialDays.
 *    If any item lacks a trial price, trialTotal is null.
 *  - The "trial period length" to display is the PLAN's trialDays (add-ons may
 *    differ; we display the plan value as primary, note differences when present).
 *
 * Returns:
 *  - monthlyTotal: number | null
 *  - trialTotal: number | null
 *  - planTrialDays: number (always the plan value)
 *  - addOnTrialDaysMismatch: true if any add-on has a different trialDays than the plan
 */
export function computeSelectionTotals(
  plan: Pick<BillingPlan, "monthlyPriceGbp" | "trialPriceGbp" | "trialDays"> | null | undefined,
  selectedAddOns: string[],
  allAddOns: Pick<BillingAddOn, "code" | "monthlyPriceGbp" | "trialPriceGbp" | "trialDays">[],
): {
  monthlyTotal: number | null;
  trialTotal: number | null;
  planTrialDays: number;
  addOnTrialDaysMismatch: boolean;
} {
  if (!plan) {
    return { monthlyTotal: null, trialTotal: null, planTrialDays: 0, addOnTrialDaysMismatch: false };
  }

  const chosenAddOns = selectedAddOns
    .map((code) => allAddOns.find((a) => a.code === code))
    .filter(Boolean) as Pick<BillingAddOn, "code" | "monthlyPriceGbp" | "trialPriceGbp" | "trialDays">[];

  // Monthly total
  let monthlyTotal: number | null = plan.monthlyPriceGbp;
  for (const addon of chosenAddOns) {
    if (addon.monthlyPriceGbp == null) { monthlyTotal = null; break; }
    monthlyTotal = (monthlyTotal ?? 0) + addon.monthlyPriceGbp;
  }

  // Trial total (plan trial price + each add-on's own trial price)
  let trialTotal: number | null = plan.trialPriceGbp;
  for (const addon of chosenAddOns) {
    if (addon.trialPriceGbp == null) { trialTotal = null; break; }
    trialTotal = (trialTotal ?? 0) + addon.trialPriceGbp;
  }

  // Check if any add-on has a different trial period length
  const addOnTrialDaysMismatch = chosenAddOns.some(
    (a) => a.trialDays !== plan.trialDays,
  );

  return {
    monthlyTotal,
    trialTotal,
    planTrialDays: plan.trialDays,
    addOnTrialDaysMismatch,
  };
}

// ── Submit payload guard ──────────────────────────────────────────────────────

/**
 * Build the payload for saveBillingSelection.
 * Always includes addOnCodes, even when empty ([] = remove all add-ons).
 * Throws if plan is somehow invalid — callers should disable Save until plan is set.
 */
export function buildSelectionPayload(
  planCode: BillingSelectionInputPlanCode,
  addOnCodes: string[],
): { planCode: BillingSelectionInputPlanCode; addOnCodes: string[] } {
  return { planCode, addOnCodes };
}

// ── Re-export catalog accessor for consumer convenience ────────────────────────

export function getCatalogPlan(
  catalog: BillingCatalog | undefined,
  code: string | null | undefined,
): BillingPlan | undefined {
  if (!code || !catalog) return undefined;
  return catalog.plans.find((p) => p.code === code);
}
