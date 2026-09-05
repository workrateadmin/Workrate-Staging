/**
 * BillingPlanSelector — shared plan + add-on selection UI used in:
 *  - Onboarding StepPlan
 *  - Settings > Plan & Billing
 *
 * Rules:
 * - All prices, trial amounts, and percentages come from the server catalog.
 * - Never hardcode a price, percentage, trial length, or "50%" string.
 * - Trial percentage is derived client-side from trialPriceGbp / monthlyPriceGbp
 *   (customer catalog does not expose a trialPercentage field).
 * - "Complete is better value" uses >= of server monthly amounts only;
 *   purchasability is a separate concern (disables the action, not the banner).
 * - Submitted amounts are absent — only planCode / addOnCodes go to the API.
 * - selectedAddOns=null means uninitialized; []=user deliberately cleared.
 */
import { useState } from "react";
import type { BillingCatalog, BillingPlan, BillingAddOn } from "@workspace/api-client-react";
import type { BillingSelectionInputPlanCode } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Check, AlertTriangle, ArrowRight, Info, Package, Lock,
} from "lucide-react";
import {
  fmtGbp,
  deriveTrialPercentage,
  trialHeadline,
  isCompleteBetterValue,
  computeSelectionTotals,
  toggleAddOnCode,
} from "@/lib/billing-helpers";

// ── Sub-components ────────────────────────────────────────────────────────────

function AddOnStatusBadge({ addon }: { addon: BillingAddOn }) {
  if (!addon.active) {
    return <Badge variant="secondary" className="text-[10px]">Inactive</Badge>;
  }
  if (addon.comingSoon) {
    return <Badge variant="secondary" className="text-[10px]">Coming soon</Badge>;
  }
  if (!addon.purchasable) {
    return <Badge variant="secondary" className="text-[10px]">Billing configuration required</Badge>;
  }
  return null;
}

// ── Exported component ────────────────────────────────────────────────────────

export interface BillingPlanSelectorProps {
  catalog: BillingCatalog | undefined;
  isLoading: boolean;
  selectedPlan: BillingSelectionInputPlanCode;
  setSelectedPlan: (p: BillingSelectionInputPlanCode) => void;
  /**
   * null  = uninitialized (will show server/overview values)
   * []    = user deliberately cleared all add-ons
   * [...] = user's current selection
   */
  selectedAddOns: string[] | null;
  setSelectedAddOns: (a: string[]) => void;
  /** Enable trial copy and trial amounts in the summary (onboarding mode). */
  trialCopyMode?: boolean;
  /** Show "Current plan" badge for a given code */
  currentPlanCode?: string | null;
  /** Show "Active" badges and prime add-on display for given codes */
  currentAddOnCodes?: string[];
}

export function BillingPlanSelector({
  catalog,
  isLoading,
  selectedPlan,
  setSelectedPlan,
  selectedAddOns,
  setSelectedAddOns,
  trialCopyMode = false,
  currentPlanCode,
  currentAddOnCodes = [],
}: BillingPlanSelectorProps) {
  const plans = catalog?.plans ?? [];
  const addOns = catalog?.addOns ?? [];

  const [switchConfirmPending, setSwitchConfirmPending] = useState(false);

  const completePlan = plans.find((p) => p.code === "complete");
  const corePlan = plans.find((p) => p.code === "core");

  // Resolve displayed add-ons: null→server values, []→user cleared, [...]→user pick
  const effectiveAddOns: string[] = selectedAddOns ?? currentAddOnCodes;

  // Compare core+addons vs complete — server monthly amounts only, no purchasable gate
  const showCompletePromo =
    selectedPlan === "core" &&
    completePlan != null &&
    isCompleteBetterValue(corePlan, completePlan, effectiveAddOns, addOns);

  // Disable "Switch to Complete" button only when Complete isn't actually purchasable
  const canSwitchToComplete = completePlan?.purchasable ?? false;

  const handleToggleAddOn = (code: string) => {
    setSelectedAddOns(toggleAddOnCode(effectiveAddOns, code));
  };

  const handleSwitchToComplete = () => {
    setSwitchConfirmPending(false);
    setSelectedPlan("complete" as BillingSelectionInputPlanCode);
    setSelectedAddOns([]);
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-16 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Trial copy banner ─────────────────────────────────────────────── */}
      {trialCopyMode && plans.length > 0 && (() => {
        const plan = plans.find((p) => p.code === selectedPlan);
        if (!plan) return null;
        const pct = deriveTrialPercentage(plan.trialPriceGbp, plan.monthlyPriceGbp);
        return (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
            <p className="text-sm font-semibold text-foreground mb-1">
              {pct !== null
                ? `${plan.trialDays}-day paid trial at ${pct}% of your normal monthly subscription`
                : `${plan.trialDays}-day trial period`
              }
            </p>
            {plan.trialPriceGbp != null && plan.monthlyPriceGbp != null ? (
              <ul className="text-xs text-muted-foreground space-y-0.5 mt-1.5">
                <li>
                  <span className="font-semibold text-foreground">
                    First {plan.trialDays} days:
                  </span>{" "}
                  {fmtGbp(plan.trialPriceGbp)}
                </li>
                <li>
                  <span className="font-semibold text-foreground">Then:</span>{" "}
                  {fmtGbp(plan.monthlyPriceGbp)}/month
                </li>
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">
                Pricing not yet configured for this plan.
              </p>
            )}
          </div>
        );
      })()}

      {/* ── Plan cards ────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        {plans.map((plan) => {
          const isSelected = selectedPlan === plan.code;
          const isCurrent = currentPlanCode === plan.code;
          const trialPrice = plan.trialPriceGbp;
          const pct = deriveTrialPercentage(trialPrice, plan.monthlyPriceGbp);

          return (
            <button
              key={plan.code}
              type="button"
              onClick={() => {
                if (plan.code === selectedPlan) return;
                if (plan.code === "complete") {
                  // Switching to Complete clears add-ons
                  setSelectedAddOns([]);
                }
                setSelectedPlan(plan.code as BillingSelectionInputPlanCode);
              }}
              disabled={!plan.purchasable && !isCurrent}
              className={cn(
                "w-full text-left p-5 rounded-xl border-2 transition-all",
                isSelected
                  ? "border-primary bg-primary/5"
                  : plan.purchasable || isCurrent
                  ? "border-border bg-card hover:border-primary/40"
                  : "border-border bg-card opacity-60 cursor-not-allowed"
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <span className="font-black text-base">{plan.name}</span>
                    {isCurrent && (
                      <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">
                        Current plan
                      </Badge>
                    )}
                    {plan.code === "complete" && !isCurrent && (
                      <span className="text-[10px] font-bold bg-primary text-primary-foreground px-2 py-0.5 rounded-full uppercase tracking-widest">
                        Recommended
                      </span>
                    )}
                    {plan.comingSoon && (
                      <Badge variant="secondary" className="text-[10px]">Coming soon</Badge>
                    )}
                    {!plan.active && (
                      <Badge variant="secondary" className="text-[10px]">Inactive</Badge>
                    )}
                    {!plan.purchasable && plan.configurationMessage && !plan.comingSoon && plan.active && (
                      <Badge variant="secondary" className="text-[10px]">Billing configuration required</Badge>
                    )}
                  </div>

                  {plan.description && (
                    <p className="text-xs text-muted-foreground mb-2 leading-relaxed">{plan.description}</p>
                  )}

                  {/* Complete-specific copy */}
                  {plan.code === "complete" && (
                    <p className="text-xs text-muted-foreground mb-2">
                      All currently available premium categories are included, subject to usage limits.
                    </p>
                  )}

                  <div className="flex flex-wrap gap-1.5">
                    {plan.featureCategories.map((f) => (
                      <span
                        key={f}
                        className="text-[11px] font-medium text-muted-foreground bg-secondary px-2 py-0.5 rounded-md border border-border/50"
                      >
                        {f}
                      </span>
                    ))}
                  </div>

                  {plan.includedAllowance && Object.keys(plan.includedAllowance).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-3">
                      {Object.entries(plan.includedAllowance).map(([k, v]) => (
                        <span key={k} className="text-xs text-muted-foreground">
                          {k}: <strong>{v}</strong>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="text-right shrink-0">
                  {plan.monthlyPriceGbp != null ? (
                    <>
                      <div className="text-2xl font-black">
                        {fmtGbp(plan.monthlyPriceGbp)}
                        <span className="text-sm font-normal text-muted-foreground">/mo</span>
                      </div>
                      {trialCopyMode && trialPrice != null && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {pct !== null
                            ? `${plan.trialDays}-day trial (${pct}%): ${fmtGbp(trialPrice)}`
                            : `${plan.trialDays}-day trial: ${fmtGbp(trialPrice)}`
                          }
                        </div>
                      )}
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">Price not set</span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Add-ons (Core only) ────────────────────────────────────────────── */}
      {selectedPlan === "core" && addOns.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Package className="w-4 h-4 text-muted-foreground" />
            <p className="text-sm font-bold">Add-ons</p>
          </div>
          <div className="space-y-2">
            {addOns.map((addon) => {
              const isEnabled = effectiveAddOns.includes(addon.code);
              const isCurrent = currentAddOnCodes.includes(addon.code);
              const unavailable = !addon.purchasable;
              const addonPct = deriveTrialPercentage(addon.trialPriceGbp, addon.monthlyPriceGbp);

              return (
                <button
                  key={addon.code}
                  type="button"
                  onClick={() => {
                    if (unavailable) return;
                    handleToggleAddOn(addon.code);
                  }}
                  disabled={unavailable}
                  className={cn(
                    "w-full text-left p-4 rounded-xl border transition-all",
                    isEnabled
                      ? "border-primary/50 bg-primary/5"
                      : unavailable
                      ? "border-border bg-card opacity-60 cursor-not-allowed"
                      : "border-border bg-card hover:border-primary/30"
                  )}
                >
                  <div className="flex items-start gap-3">
                    {/* Checkbox visual */}
                    <div
                      className={cn(
                        "w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 mt-0.5",
                        isEnabled ? "bg-primary border-primary" : "border-border"
                      )}
                    >
                      {isEnabled && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-0.5">
                        <span className="text-sm font-semibold">{addon.name}</span>
                        {isCurrent && (
                          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">
                            Active
                          </Badge>
                        )}
                        <AddOnStatusBadge addon={addon} />
                        {unavailable && <Lock className="w-3 h-3 text-muted-foreground" />}
                      </div>

                      {addon.description && (
                        <p className="text-xs text-muted-foreground leading-relaxed mb-1">
                          {addon.description}
                        </p>
                      )}

                      {addon.configurationMessage && !addon.active && (
                        <p className="text-xs text-muted-foreground italic">{addon.configurationMessage}</p>
                      )}

                      {addon.includedAllowance && Object.keys(addon.includedAllowance).length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-3">
                          {Object.entries(addon.includedAllowance).map(([k, v]) => (
                            <span key={k} className="text-xs text-muted-foreground">
                              {k}: <strong>{v}</strong>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="text-right shrink-0">
                      {addon.monthlyPriceGbp != null ? (
                        <div>
                          <span className="text-sm font-bold">{fmtGbp(addon.monthlyPriceGbp)}/mo</span>
                          {trialCopyMode && addon.trialPriceGbp != null && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {addonPct !== null
                                ? `${addon.trialDays}-day trial (${addonPct}%): ${fmtGbp(addon.trialPriceGbp)}`
                                : `${addon.trialDays}-day trial: ${fmtGbp(addon.trialPriceGbp)}`
                              }
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Price not set</span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Complete: no add-ons note */}
      {selectedPlan === "complete" && (
        <div className="flex items-start gap-2.5 rounded-xl bg-secondary/40 border border-border p-3">
          <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            The Complete plan includes all currently available premium categories. Add-on selection is not available on this plan.
          </p>
        </div>
      )}

      {/* ── Better value promo ────────────────────────────────────────────── */}
      {showCompletePromo && completePlan && (() => {
        // Compute core+addons total for display
        const coreTotal = corePlan && corePlan.monthlyPriceGbp != null
          ? effectiveAddOns.reduce((acc, code) => {
              const a = addOns.find((x) => x.code === code);
              return acc + (a?.monthlyPriceGbp ?? 0);
            }, corePlan.monthlyPriceGbp)
          : null;

        return (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-amber-900 mb-1">
                  Complete is better value
                </p>
                <div className="text-xs text-amber-800 space-y-0.5 mb-3">
                  <p>
                    Core + selected add-ons:{" "}
                    <strong>{coreTotal != null ? `${fmtGbp(coreTotal)}/month` : "—"}</strong>
                  </p>
                  <p>
                    Complete plan:{" "}
                    <strong>{fmtGbp(completePlan.monthlyPriceGbp)}/month</strong>
                  </p>
                </div>
                {!canSwitchToComplete ? (
                  <p className="text-xs text-amber-700 italic">
                    Complete plan is not yet available for purchase.
                  </p>
                ) : !switchConfirmPending ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-amber-900 border-amber-300 bg-amber-100 hover:bg-amber-200 font-semibold h-8 px-3 text-xs"
                    onClick={() => setSwitchConfirmPending(true)}
                  >
                    Switch to Complete
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                ) : (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold h-8 px-3 text-xs"
                      onClick={handleSwitchToComplete}
                    >
                      Confirm switch
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-3 text-xs text-amber-800"
                      onClick={() => setSwitchConfirmPending(false)}
                    >
                      Keep Core
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Pricing summary ───────────────────────────────────────────────── */}
      <BillingSelectionSummary
        catalog={catalog}
        selectedPlan={selectedPlan}
        selectedAddOns={effectiveAddOns}
        trialCopyMode={trialCopyMode}
      />
    </div>
  );
}

// ── Selection summary ─────────────────────────────────────────────────────────

export function BillingSelectionSummary({
  catalog,
  selectedPlan,
  selectedAddOns,
  trialCopyMode = false,
}: {
  catalog: BillingCatalog | undefined;
  selectedPlan: BillingSelectionInputPlanCode;
  selectedAddOns: string[];
  trialCopyMode?: boolean;
}) {
  if (!catalog) return null;

  const planData = catalog.plans.find((p) => p.code === selectedPlan);
  if (!planData) return null;

  const { monthlyTotal, trialTotal, planTrialDays, addOnTrialDaysMismatch } =
    computeSelectionTotals(planData, selectedAddOns, catalog.addOns);

  const addOnData = catalog.addOns.filter((a) => selectedAddOns.includes(a.code));

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="px-4 py-3 border-b border-border/50">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Selection summary</p>
      </div>
      <div className="p-4 space-y-0 divide-y divide-border/40">
        {/* Base plan */}
        <div className="flex items-center justify-between py-2 first:pt-0">
          <span className="text-xs text-muted-foreground">
            Base plan — {planData.name}
          </span>
          <span className="text-xs font-semibold">
            {planData.monthlyPriceGbp != null ? `${fmtGbp(planData.monthlyPriceGbp)}/mo` : "Price not set"}
          </span>
        </div>

        {/* Add-ons */}
        {addOnData.map((a) => (
          <div key={a.code} className="flex items-center justify-between py-2">
            <span className="text-xs text-muted-foreground">{a.name}</span>
            <span className="text-xs font-semibold">
              {a.monthlyPriceGbp != null ? `${fmtGbp(a.monthlyPriceGbp)}/mo` : "Price not set"}
            </span>
          </div>
        ))}

        {/* Monthly total */}
        <div className="flex items-center justify-between py-2">
          <span className="text-xs font-bold">Monthly total</span>
          <span className="text-xs font-black">
            {monthlyTotal != null ? `${fmtGbp(monthlyTotal)}/month` : "—"}
          </span>
        </div>

        {/* Trial rows — only in trialCopyMode and when plan has a trial period */}
        {trialCopyMode && planTrialDays > 0 && (
          <>
            <div className="flex items-center justify-between py-2">
              <span className="text-xs font-bold text-primary">
                {addOnTrialDaysMismatch
                  ? `First ${planTrialDays} days (plan trial)`
                  : `First ${planTrialDays} days`
                }
              </span>
              <span className="text-xs font-black text-primary">
                {trialTotal != null ? fmtGbp(trialTotal) : "—"}
              </span>
            </div>
            {addOnTrialDaysMismatch && (
              <div className="py-1.5">
                <p className="text-[10px] text-muted-foreground italic">
                  Some add-ons have different trial lengths — see individual add-on cards above.
                </p>
              </div>
            )}
            <div className="flex items-center justify-between py-2">
              <span className="text-xs text-muted-foreground">Then from</span>
              <span className="text-xs font-semibold">
                {monthlyTotal != null ? `${fmtGbp(monthlyTotal)}/month` : "—"}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
