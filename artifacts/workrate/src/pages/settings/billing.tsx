import { useState, useEffect, useRef } from "react";
import {
  useGetBillingCatalog,
  useGetBillingOverview,
  useGetBillingUsage,
  useSaveBillingSelection,
  useRequestBillingCheckout,
  useRequestBillingPortal,
  useRequestBillingCancellation,
  useSimulateBillingState,
  getGetBillingOverviewQueryKey,
  getGetBillingCatalogQueryKey,
  getGetBillingUsageQueryKey,
} from "@workspace/api-client-react";
import type {
  BillingOverview,
  BillingPlan,
  BillingSimulationInputStatus,
  BillingSimulationInputPlanCode,
  BillingSelectionInputPlanCode,
} from "@workspace/api-client-react";
import { BillingPlanSelector } from "@/components/billing-plan-selector";
import {
  initialPlanFromOverview,
  initialAddOnsFromOverview,
  buildSelectionPayload,
} from "@/lib/billing-helpers";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@workspace/memphis-bold/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  CreditCard, Check, AlertCircle, Clock, AlertTriangle,
  XCircle, RefreshCw, ChevronRight, BarChart2,
  ShieldCheck, CalendarDays, Timer,
} from "lucide-react";

const IS_DEV = import.meta.env.DEV;

// ── Date helpers ──────────────────────────────────────────────────────────────

/** Format an ISO date string to a readable UK date, safely handling null. */
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric", month: "long", year: "numeric",
    });
  } catch {
    return "—";
  }
}

/** Return whole days remaining until an ISO date string, or null if the date is null/past. */
function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  try {
    const diff = new Date(iso).getTime() - Date.now();
    if (diff <= 0) return null;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  } catch {
    return null;
  }
}

/** Return "X days ago" for a past ISO date, or null. */
function daysAgo(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 0) return null;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return "today";
    if (days === 1) return "1 day ago";
    return `${days} days ago`;
  } catch {
    return null;
  }
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <Badge variant="secondary">No subscription</Badge>;
  const map: Record<string, { label: string; className: string }> = {
    trialing:  { label: "Trialing",  className: "bg-blue-50 text-blue-700 border-blue-200" },
    active:    { label: "Active",    className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    past_due:  { label: "Past Due",  className: "bg-red-50 text-red-700 border-red-200" },
    cancelled: { label: "Cancelled", className: "bg-gray-50 text-gray-600 border-gray-200" },
  };
  const cfg = map[status] ?? { label: status, className: "bg-gray-50 text-gray-700 border-gray-200" };
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wide border",
      cfg.className,
    )}>
      {status === "past_due"  && <AlertTriangle className="w-3 h-3" />}
      {status === "active"    && <ShieldCheck   className="w-3 h-3" />}
      {status === "trialing"  && <Clock         className="w-3 h-3" />}
      {status === "cancelled" && <XCircle       className="w-3 h-3" />}
      {cfg.label}
    </span>
  );
}

// ── Timing detail row ─────────────────────────────────────────────────────────

function TimingRow({
  icon: Icon, label, value, highlight,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  highlight?: "warn" | "danger" | "info" | "success";
}) {
  const valueClass = highlight === "danger"  ? "text-red-700 font-bold"
    : highlight === "warn"    ? "text-amber-700 font-bold"
    : highlight === "success" ? "text-emerald-700 font-bold"
    : highlight === "info"    ? "text-blue-700 font-bold"
    : "text-foreground font-semibold";

  return (
    <div className="flex items-center gap-2.5 py-2 border-b border-border/40 last:border-0">
      <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      <span className="text-xs text-muted-foreground flex-1">{label}</span>
      <span className={cn("text-xs tabular-nums", valueClass)}>{value}</span>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: catalog, isLoading: catalogLoading } = useGetBillingCatalog({
    query: { queryKey: getGetBillingCatalogQueryKey() },
  });
  const { data: overview, isLoading: overviewLoading } = useGetBillingOverview({
    query: { queryKey: getGetBillingOverviewQueryKey() },
  });
  const { data: usage, isLoading: usageLoading } = useGetBillingUsage({
    query: { queryKey: getGetBillingUsageQueryKey() },
  });

  // ── Selection state ──────────────────────────────────────────────────────
  // selectedPlan=null → uninitialized; will hydrate from overview once loaded.
  // selectedAddOns=null → uninitialized; [] = user deliberately cleared all.
  const [selectedPlan, setSelectedPlan] = useState<BillingSelectionInputPlanCode | null>(null);
  const [selectedAddOns, setSelectedAddOns] = useState<string[] | null>(null);
  const overviewHydratedRef = useRef(false);

  // Hydrate once from overview — never overwrite later user edits.
  useEffect(() => {
    if (!overview || overviewHydratedRef.current) return;
    overviewHydratedRef.current = true;
    const plan = initialPlanFromOverview(overview);
    if (plan) setSelectedPlan(plan);
    setSelectedAddOns(initialAddOnsFromOverview(overview));
  }, [overview]);

  const [checkoutUnavailable, setCheckoutUnavailable] = useState(false);
  const [checkoutMessage, setCheckoutMessage] = useState("");
  const [portalUnavailable, setPortalUnavailable] = useState(false);
  const [cancelUnavailable, setCancelUnavailable] = useState(false);

  const saveBillingSelection  = useSaveBillingSelection();
  const requestCheckout       = useRequestBillingCheckout();
  const requestPortal         = useRequestBillingPortal();
  const requestCancellation   = useRequestBillingCancellation();

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: getGetBillingOverviewQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetBillingCatalogQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetBillingUsageQueryKey() });
  };

  const activePlan = catalog?.plans.find(
    (p) => p.code === (overview?.planCode ?? overview?.pendingPlanCode)
  );

  // Resolve effective plan: explicit selection, or server pending/active, or "core" default
  const currentSelectPlan: BillingSelectionInputPlanCode = selectedPlan
    ?? (initialPlanFromOverview(overview) ?? "core");

  const handleSaveSelection = () => {
    // selectedAddOns=null means not yet hydrated; fall back to server values
    const addOnCodes = selectedAddOns ?? initialAddOnsFromOverview(overview);
    saveBillingSelection.mutate(
      { data: buildSelectionPayload(currentSelectPlan, addOnCodes) },
      {
        onSuccess: (data) => {
          queryClient.setQueryData(getGetBillingOverviewQueryKey(), data);
          toast({ title: "Plan selection saved" });
        },
        onError: () => toast({ title: "Failed to save selection", variant: "destructive" }),
      }
    );
  };

  const handleCheckout = () => {
    setCheckoutUnavailable(false);
    requestCheckout.mutate(undefined, {
      onSuccess: (data: any) => {
        if (data?.url) window.location.assign(data.url);
        else toast({ title: "Checkout did not return a hosted URL", variant: "destructive" });
      },
      onError: (err: any) => {
        const body = err?.response?.data ?? err;
        if (body?.code === "PAYMENT_SETUP_UNAVAILABLE" || err?.status === 501) {
          setCheckoutUnavailable(true);
          setCheckoutMessage(body?.message ?? "Payment setup is not yet available.");
        } else {
          toast({ title: "Checkout error", variant: "destructive" });
        }
      },
    });
  };

  const handlePortal = () => {
    setPortalUnavailable(false);
    requestPortal.mutate(undefined, {
      onSuccess: (data: any) => {
        if (data?.url) window.location.assign(data.url);
        else toast({ title: "Billing portal did not return a hosted URL", variant: "destructive" });
      },
      onError: (err: any) => {
        const body = err?.response?.data ?? err;
        if (body?.code === "PAYMENT_SETUP_UNAVAILABLE" || err?.status === 501) {
          setPortalUnavailable(true);
        } else {
          toast({ title: "Unable to open billing portal", variant: "destructive" });
        }
      },
    });
  };

  const handleCancel = () => {
    if (!confirm(
      "Are you sure you want to cancel your subscription? Access continues until the end of your billing period."
    )) return;
    setCancelUnavailable(false);
    requestCancellation.mutate(undefined, {
      onSuccess: (data: any) => {
        queryClient.setQueryData(getGetBillingOverviewQueryKey(), data);
        toast({ title: "Cancellation scheduled. Access continues until period end." });
      },
      onError: (err: any) => {
        const body = err?.response?.data ?? err;
        if (body?.code === "PAYMENT_SETUP_UNAVAILABLE" || err?.status === 501) {
          setCancelUnavailable(true);
        } else {
          toast({ title: "Cancellation failed", variant: "destructive" });
        }
      },
    });
  };

  const isLoading = catalogLoading || overviewLoading;
  const noSubscription = !overview?.status && !overview?.legacyAccess;
  const canStartTrial  = noSubscription || overview?.status === "cancelled";

  return (
    <div className="max-w-4xl mx-auto pb-24 space-y-8 animate-in fade-in-0 duration-500">

      {/* Page header */}
      <div className="border-b border-border/60 pb-8">
        <h1 className="text-4xl font-black tracking-tight mb-3">Plan &amp; Billing</h1>
        <p className="text-muted-foreground font-semibold text-lg max-w-2xl">
          Manage your WorkRate subscription, plan selection, and usage.
        </p>
      </div>

      {/* ── Subscription status ──────────────────────────────────────────── */}
      <SubscriptionStatusCard
        overview={overview}
        activePlan={activePlan ?? null}
        isLoading={isLoading}
        onPortal={handlePortal}
        onCancel={handleCancel}
        portalPending={requestPortal.isPending}
        cancelPending={requestCancellation.isPending}
        portalUnavailable={portalUnavailable}
        cancelUnavailable={cancelUnavailable}
      />

      {/* ── Past-due banner ───────────────────────────────────────────────── */}
      {overview?.status === "past_due" && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 flex items-start gap-4">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-red-900 mb-1">Payment past due</p>
            <p className="text-sm text-red-800">
              {overview.failedPaymentAt
                ? <>A payment failed <strong>{daysAgo(overview.failedPaymentAt)}</strong> ({fmtDate(overview.failedPaymentAt)}). Update your payment method to keep access.</>
                : "A payment failed. Update your payment method to keep your subscription active."
              }
            </p>
            <Button
              size="sm"
              className="mt-3 bg-red-600 hover:bg-red-700 text-white"
              onClick={handlePortal}
              disabled={requestPortal.isPending}
            >
              Update Payment Method
            </Button>
          </div>
        </div>
      )}

      {/* ── Cancelled banner ──────────────────────────────────────────────── */}
      {overview?.status === "cancelled" && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-5 flex items-start gap-4">
          <XCircle className="w-5 h-5 text-gray-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-gray-900 mb-1">Subscription cancelled</p>
            <p className="text-sm text-gray-700">
              {overview.cancelledAt
                ? <>Cancelled on <strong>{fmtDate(overview.cancelledAt)}</strong>. Select a plan below to reactivate your account.</>
                : "Your subscription has been cancelled. Select a plan below to reactivate."
              }
            </p>
          </div>
        </div>
      )}

      {/* ── Checkout unavailable notice ──────────────────────────────────── */}
      {checkoutUnavailable && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 flex items-start gap-4">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-900 mb-1">Payment setup not yet available</p>
            <p className="text-sm text-amber-800">{checkoutMessage}</p>
          </div>
        </div>
      )}

      {/* ── Portal unavailable notice ─────────────────────────────────────── */}
      {portalUnavailable && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 flex items-start gap-4">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-900 mb-1">Billing portal not yet available</p>
            <p className="text-sm text-amber-800">
              The billing management portal is not yet configured. Contact support to manage your subscription.
            </p>
          </div>
        </div>
      )}

      {/* ── Cancel unavailable notice ─────────────────────────────────────── */}
      {cancelUnavailable && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 flex items-start gap-4">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-900">Cancellation unavailable</p>
            <p className="text-sm text-amber-800 mt-1">
              Subscription cancellation is not yet configured. Contact support for assistance.
            </p>
          </div>
        </div>
      )}

      {/* ── Plan + add-on selection ───────────────────────────────────────── */}
      <Card className="shadow-sm border-border/60 rounded-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-border/60 bg-secondary/30 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <CreditCard className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-bold">Plans &amp; Add-ons</h2>
            <p className="text-xs text-muted-foreground font-medium">
              Choose the plan that fits your business
            </p>
          </div>
        </div>
        <CardContent className="p-6">
          <BillingPlanSelector
            catalog={catalog}
            isLoading={isLoading}
            selectedPlan={currentSelectPlan}
            setSelectedPlan={(p) => setSelectedPlan(p)}
            selectedAddOns={selectedAddOns}
            setSelectedAddOns={setSelectedAddOns}
            currentPlanCode={overview?.planCode}
            currentAddOnCodes={overview?.addOnCodes ?? []}
            trialCopyMode={canStartTrial}
          />
        </CardContent>
      </Card>

      {/* ── CTA: start trial / save changes ──────────────────────────────── */}
      {canStartTrial ? (
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            onClick={handleSaveSelection}
            disabled={saveBillingSelection.isPending}
            variant="outline"
            className="font-semibold"
          >
            {saveBillingSelection.isPending ? "Saving…" : "Save Plan Selection"}
          </Button>
          <Button
            onClick={handleCheckout}
            disabled={requestCheckout.isPending}
            className="gap-2 font-bold"
          >
            {requestCheckout.isPending ? "Connecting…" : "Start Trial"}
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            onClick={handleSaveSelection}
            disabled={saveBillingSelection.isPending}
            variant="outline"
            className="font-semibold"
          >
            {saveBillingSelection.isPending ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      )}

      {/* ── Usage ────────────────────────────────────────────────────────── */}
      <UsageCard usage={usage} overview={overview} catalog={catalog} isLoading={usageLoading} />

      {/* ── Pending selection notice ──────────────────────────────────────── */}
      {(overview?.pendingPlanCode || (overview?.pendingAddOnCodes?.length ?? 0) > 0) && (
        <div className="rounded-xl border border-border bg-secondary/30 p-5">
          <p className="text-sm font-bold mb-2">Pending selection</p>
          <div className="flex flex-wrap gap-2">
            {overview!.pendingPlanCode && (
              <Badge variant="secondary">{overview!.pendingPlanCode}</Badge>
            )}
            {overview!.pendingAddOnCodes?.map((code) => (
              <Badge key={code} variant="outline">{code}</Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            This selection takes effect on your next billing cycle or when you start a trial.
          </p>
        </div>
      )}

      {/* ── DEV ONLY simulator ──────────────────────────────────────────── */}
      {IS_DEV && <DevBillingSimulator onSimulate={invalidateAll} catalog={catalog} />}
    </div>
  );
}

// ── Subscription status card ──────────────────────────────────────────────────

function SubscriptionStatusCard({
  overview, activePlan, isLoading,
  onPortal, onCancel,
  portalPending, cancelPending,
  portalUnavailable, cancelUnavailable,
}: {
  overview:          BillingOverview | undefined;
  activePlan:        BillingPlan | null;
  isLoading:         boolean;
  onPortal:          () => void;
  onCancel:          () => void;
  portalPending:     boolean;
  cancelPending:     boolean;
  portalUnavailable: boolean;
  cancelUnavailable: boolean;
}) {
  // Derive timing display
  const trialDaysLeft    = overview?.trialEndsAt   ? daysUntil(overview.trialEndsAt)          : null;
  const renewalDaysLeft  = overview?.currentPeriodEndsAt ? daysUntil(overview.currentPeriodEndsAt) : null;

  return (
    <Card className="shadow-sm border-border/60 rounded-2xl overflow-hidden">
      <div className="px-6 py-5 border-b border-border/60 bg-secondary/30 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
          <ShieldCheck className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h2 className="text-base font-bold">Subscription</h2>
          <p className="text-xs text-muted-foreground font-medium">Your current plan and status</p>
        </div>
      </div>
      <CardContent className="p-6">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-4 w-40" />
          </div>
        ) : overview?.legacyAccess ? (
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold">Legacy Access</p>
              <p className="text-sm text-muted-foreground">
                You have full access as an early WorkRate user.
              </p>
            </div>
          </div>
        ) : overview?.status ? (
          <div className="space-y-4">
            {/* Status + plan name */}
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge status={overview.status} />
              {activePlan && (
                <span className="text-sm font-semibold">{activePlan.name}</span>
              )}
              {overview.provider && (
                <span className="text-[11px] text-muted-foreground font-medium bg-secondary border border-border/50 px-2 py-0.5 rounded-md">
                  via {overview.provider}
                </span>
              )}
              {overview.cancelAtPeriodEnd && (
                <Badge
                  variant="outline"
                  className="text-[10px] text-amber-700 border-amber-300"
                >
                  Cancels at period end
                </Badge>
              )}
            </div>

            {/* Timing details */}
            <div className="bg-secondary/40 rounded-xl border border-border/50 px-4 py-1 divide-y divide-border/30">
              {/* Trial */}
              {overview.status === "trialing" && overview.trialEndsAt && (
                <TimingRow
                  icon={Timer}
                  label="Trial ends"
                  value={
                    trialDaysLeft !== null
                      ? `${fmtDate(overview.trialEndsAt)} — ${trialDaysLeft} day${trialDaysLeft !== 1 ? "s" : ""} remaining`
                      : `${fmtDate(overview.trialEndsAt)} — trial ended`
                  }
                  highlight={
                    trialDaysLeft === null ? "danger"
                    : trialDaysLeft <= 2   ? "danger"
                    : trialDaysLeft <= 5   ? "warn"
                    : "info"
                  }
                />
              )}

              {/* After-trial monthly price */}
              {overview.status === "trialing" && activePlan && (
                <TimingRow
                  icon={CreditCard}
                  label="After trial"
                  value={`£${activePlan.monthlyPriceGbp}/month`}
                  highlight="info"
                />
              )}

              {/* Active renewal */}
              {overview.status === "active" && overview.currentPeriodEndsAt && (
                <TimingRow
                  icon={CalendarDays}
                  label="Next renewal"
                  value={
                    renewalDaysLeft !== null
                      ? `${fmtDate(overview.currentPeriodEndsAt)} — in ${renewalDaysLeft} day${renewalDaysLeft !== 1 ? "s" : ""}`
                      : fmtDate(overview.currentPeriodEndsAt)
                  }
                  highlight="success"
                />
              )}

              {/* Active: monthly price */}
              {overview.status === "active" && activePlan && (
                <TimingRow
                  icon={CreditCard}
                  label="Monthly charge"
                  value={`£${activePlan.monthlyPriceGbp}/month`}
                />
              )}

              {/* Period start */}
              {overview.currentPeriodStartsAt && (
                <TimingRow
                  icon={CalendarDays}
                  label="Period started"
                  value={fmtDate(overview.currentPeriodStartsAt)}
                />
              )}

              {/* Past due: failed payment date */}
              {overview.status === "past_due" && overview.failedPaymentAt && (
                <TimingRow
                  icon={AlertTriangle}
                  label="Payment failed"
                  value={`${fmtDate(overview.failedPaymentAt)} (${daysAgo(overview.failedPaymentAt) ?? "recently"})`}
                  highlight="danger"
                />
              )}

              {/* Cancelled: cancellation date */}
              {overview.cancelledAt && (
                <TimingRow
                  icon={XCircle}
                  label="Cancelled"
                  value={fmtDate(overview.cancelledAt)}
                  highlight="warn"
                />
              )}
            </div>

            {/* Active add-ons */}
            {(overview.addOnCodes?.length ?? 0) > 0 && (
              <div>
                <p className="text-xs text-muted-foreground font-medium mb-1.5">Active add-ons</p>
                <div className="flex flex-wrap gap-2">
                  {overview.addOnCodes.map((code) => (
                    <Badge key={code} variant="secondary">{code}</Badge>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onPortal}
                disabled={portalPending}
                className="gap-2 font-semibold"
              >
                <CreditCard className="w-3.5 h-3.5" />
                {portalPending ? "Loading…" : "Manage Billing"}
              </Button>
              {!overview.cancelAtPeriodEnd && overview.status !== "cancelled" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onCancel}
                  disabled={cancelPending}
                  className="text-muted-foreground font-semibold hover:text-destructive"
                >
                  {cancelPending ? "Cancelling…" : "Cancel Subscription"}
                </Button>
              )}
            </div>

            {/* Provider unavailable inline notes */}
            {portalUnavailable && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Billing portal is not yet available. Contact support to manage payment details.
              </p>
            )}
            {cancelUnavailable && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Subscription cancellation is not yet configured. Contact support for assistance.
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No active subscription. Select a plan below to get started.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Usage card ────────────────────────────────────────────────────────────────

const USAGE_DETAILS = [
  { key: "ai_receptionist_minutes", featureCode: "ai_receptionist", label: "AI Receptionist", unit: "minutes" },
  { key: "social_ai_messages", featureCode: "social_ai_meta", label: "Social AI", unit: "messages" },
  { key: "concept_visual_generations", featureCode: "concept_visuals", label: "Concept Visuals", unit: "generations" },
] as const;

function UsageCard({ usage, overview, catalog, isLoading }: {
  usage: any;
  overview: BillingOverview | undefined;
  catalog: any;
  isLoading: boolean;
}) {
  const events = usage?.events ?? [];
  const plan = catalog?.plans?.find((item: any) => item.code === overview?.planCode);
  const addOns = catalog?.addOns ?? [];
  const allowances = overview?.planCode === "complete"
    ? plan?.includedAllowance
    : (overview?.addOnCodes ?? []).reduce((all: Record<string, number>, code: string) => ({
      ...all,
      ...(addOns.find((item: any) => item.code === code)?.includedAllowance ?? {}),
    }), {});
  const usageByCode = events.reduce((all: Record<string, number>, event: any) => {
    all[event.featureCode] = (all[event.featureCode] ?? 0) + Number(event.quantity ?? 0);
    return all;
  }, {});
  const meteredUsage = USAGE_DETAILS.filter((detail) => typeof allowances?.[detail.key] === "number");
  return (
    <Card className="shadow-sm border-border/60 rounded-2xl overflow-hidden">
      <div className="px-6 py-5 border-b border-border/60 bg-secondary/30 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
          <BarChart2 className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h2 className="text-base font-bold">Usage</h2>
          <p className="text-xs text-muted-foreground font-medium">Feature usage this billing period</p>
        </div>
      </div>
      <CardContent className="p-6">
        {isLoading ? (
          <Skeleton className="h-24 rounded-xl" />
        ) : meteredUsage.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Your current plan has no metered feature allowances.
          </p>
        ) : (
          <div className="space-y-4">
            {overview?.currentPeriodStartsAt && overview?.currentPeriodEndsAt && (
              <p className="text-xs text-muted-foreground">
                Allowances reset each billing period: <strong className="text-foreground">{fmtDate(overview.currentPeriodStartsAt)} – {fmtDate(overview.currentPeriodEndsAt)}</strong>.
              </p>
            )}
            {meteredUsage.map((detail) => {
              const allowance = Number(allowances[detail.key]);
              const used = usageByCode[detail.featureCode] ?? 0;
              const percentage = allowance > 0 ? Math.min(100, Math.round((used / allowance) * 100)) : 0;
              const remaining = Math.max(0, allowance - used);
              const locked = used >= allowance;
              const warning = locked
                ? "You've reached this month's included allowance."
                : percentage >= 90
                  ? `You've used ${percentage}% of this month's included ${detail.unit}.`
                  : percentage >= 75
                    ? `You're approaching your ${detail.label} allowance.`
                    : null;
              return (
                <div key={detail.key} className="rounded-xl border border-border/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <p className="text-sm font-bold">{detail.label}</p>
                    <Badge variant={locked ? "destructive" : percentage >= 75 ? "secondary" : "outline"}>
                      {locked ? "Allowance reached" : `${percentage}% used`}
                    </Badge>
                  </div>
                  <p className="text-sm font-semibold tabular-nums">
                    {used.toLocaleString()} / {allowance.toLocaleString()} {detail.unit} used
                  </p>
                  <Progress value={percentage} className={cn("mt-3", locked && "[&>div]:bg-destructive")} />
                  <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                    <span>{remaining.toLocaleString()} {detail.unit} remaining</span>
                    <span>{percentage}% used</span>
                  </div>
                  {warning && (
                    <p className={cn("mt-3 text-xs font-semibold", locked ? "text-destructive" : "text-amber-700")}>
                      {warning} {locked ? "Wait until your allowance resets or switch to Complete." : ""}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── DEV-ONLY billing simulator ────────────────────────────────────────────────

function DevBillingSimulator({
  onSimulate, catalog,
}: {
  onSimulate: () => void;
  catalog: any;
}) {
  const { toast } = useToast();
  const simulateBilling = useSimulateBillingState();
  const [simStatus, setSimStatus]   = useState<BillingSimulationInputStatus>("trialing");
  const [simPlan,   setSimPlan]     = useState<BillingSimulationInputPlanCode>("core");
  const [simAddOns, setSimAddOns]   = useState<string[]>([]);

  const plans   = catalog?.plans  ?? [];
  const addOns  = catalog?.addOns ?? [];
  const STATUSES: BillingSimulationInputStatus[] = ["trialing", "active", "past_due", "cancelled"];

  const handleSimulate = () => {
    simulateBilling.mutate(
      { data: { status: simStatus, planCode: simPlan, addOnCodes: simAddOns } },
      {
        onSuccess: () => {
          toast({ title: `[DEV] Simulated: ${simStatus} / ${simPlan}` });
          onSimulate();
        },
        onError: () => toast({ title: "Simulation failed", variant: "destructive" }),
      }
    );
  };

  return (
    <Card className="shadow-sm border-2 border-dashed border-amber-300 rounded-2xl overflow-hidden bg-amber-50/50">
      <div className="px-6 py-4 border-b border-amber-200 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-amber-100 border border-amber-300 flex items-center justify-center">
          <RefreshCw className="w-4 h-4 text-amber-700" />
        </div>
        <div>
          <h2 className="text-base font-bold text-amber-900">DEV ONLY — Billing Simulator</h2>
          <p className="text-xs text-amber-700 font-medium">
            Not visible in production. Simulate subscription states for testing.
          </p>
        </div>
      </div>
      <CardContent className="p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Status */}
          <div>
            <label className="block text-xs font-bold mb-2 text-amber-900">Status</label>
            <div className="space-y-1">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSimStatus(s)}
                  className={cn(
                    "w-full text-left px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all",
                    simStatus === s
                      ? "bg-amber-600 text-white border-amber-600"
                      : "bg-white text-amber-900 border-amber-200 hover:border-amber-400"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Plan */}
          <div>
            <label className="block text-xs font-bold mb-2 text-amber-900">Plan</label>
            <div className="space-y-1">
              {plans.map((p: any) => (
                <button
                  key={p.code}
                  type="button"
                  onClick={() => setSimPlan(p.code as BillingSimulationInputPlanCode)}
                  className={cn(
                    "w-full text-left px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all",
                    simPlan === p.code
                      ? "bg-amber-600 text-white border-amber-600"
                      : "bg-white text-amber-900 border-amber-200 hover:border-amber-400"
                  )}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          {/* Add-ons */}
          {addOns.length > 0 && (
            <div>
              <label className="block text-xs font-bold mb-2 text-amber-900">Add-ons</label>
              <div className="space-y-1">
                {addOns.map((a: any) => {
                  const checked = simAddOns.includes(a.code);
                  return (
                    <button
                      key={a.code}
                      type="button"
                      onClick={() =>
                        setSimAddOns(
                          checked
                            ? simAddOns.filter((x) => x !== a.code)
                            : [...simAddOns, a.code]
                        )
                      }
                      className={cn(
                        "w-full text-left px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all flex items-center gap-2",
                        checked
                          ? "bg-amber-600 text-white border-amber-600"
                          : "bg-white text-amber-900 border-amber-200 hover:border-amber-400"
                      )}
                    >
                      <div className={cn(
                        "w-3 h-3 rounded border flex items-center justify-center shrink-0",
                        checked ? "bg-white border-white" : "border-amber-400"
                      )}>
                        {checked && <Check className="w-2 h-2 text-amber-600" />}
                      </div>
                      {a.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <Button
          onClick={handleSimulate}
          disabled={simulateBilling.isPending}
          className="bg-amber-600 hover:bg-amber-700 text-white font-bold gap-2"
        >
          <RefreshCw className={cn("w-4 h-4", simulateBilling.isPending && "animate-spin")} />
          {simulateBilling.isPending ? "Simulating…" : "Apply Simulation"}
        </Button>
      </CardContent>
    </Card>
  );
}

// Export helpers for use in onboarding
export { fmtDate, daysUntil, daysAgo };
