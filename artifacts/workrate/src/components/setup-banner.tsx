import { useState, useEffect, useRef } from "react";
import {
  useGetCompany,
  useGetOnboarding,
  useGetBillingOverview,
  useGetBillingCatalog,
  useUpdateCompany,
  getGetCompanyQueryKey,
  getGetOnboardingQueryKey,
  getGetBillingOverviewQueryKey,
} from "@workspace/api-client-react";
import { Link } from "wouter";
import { X, CheckCircle2, ChevronRight, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const DISMISSED_KEY = "wr_onboarding_dismissed";
export const FIRST_ENQUIRY_SEEN_KEY = "wr_first_enquiry_seen";

/**
 * Post-onboarding compact checklist. Driven by server data (onboarding status,
 * billing overview, company data) with no localStorage dependencies for
 * individual step state — dismissal only is persisted locally as a fast path.
 *
 * Legacy users (no onboarding record, no subscription) see nothing forced.
 */
export function SetupBanner() {
  const { data: company } = useGetCompany({
    query: { queryKey: getGetCompanyQueryKey() },
  });
  const { data: onboarding } = useGetOnboarding({
    query: { queryKey: getGetOnboardingQueryKey() },
  });
  const { data: billing } = useGetBillingOverview({
    query: { queryKey: getGetBillingOverviewQueryKey() },
  });
  const { data: catalog } = useGetBillingCatalog();
  const { mutate: updateCompany } = useUpdateCompany();

  const [dismissed, setDismissed] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem(DISMISSED_KEY) === "1" : true
  );

  const serverDismissApplied = useRef(false);
  useEffect(() => {
    if (!company || serverDismissApplied.current) return;
    serverDismissApplied.current = true;
    if ((company as any).onboardingDismissed) {
      localStorage.setItem(DISMISSED_KEY, "1");
      setDismissed(true);
    }
  }, [company]);

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, "1");
    setDismissed(true);
    updateCompany({ data: { onboardingDismissed: true } });
  }

  // ── Derive checklist items from server data ───────────────────────────────
  const onboardingDone = onboarding?.status === "completed" || onboarding?.status === "skipped";
  const hasBusinessName = !!(company?.name && company.name.trim() !== "" && company.name !== "My Trade Business");
  const hasWidgetToken = !!company?.widgetToken;

  // Billing: active or trialing = subscription step done
  const hasBilling = !!(billing && (billing.legacyAccess || billing.status === "active" || billing.status === "trialing"));
  const billingPastDue = billing?.status === "past_due";
  const billingCancelled = billing?.status === "cancelled";

  const items: ChecklistItem[] = [
    {
      id: "onboarding",
      label: "Complete business setup",
      done: onboardingDone,
      href: "/onboarding",
      hrefLabel: "Resume setup",
    },
    {
      id: "billing",
      label: billingPastDue
        ? "Payment past due — update billing"
        : billingCancelled
        ? "Subscription cancelled — reactivate"
        : "Activate your plan",
      done: hasBilling && !billingPastDue,
      href: "/settings/billing",
      hrefLabel: billingPastDue ? "Fix billing" : billingCancelled ? "Reactivate" : "View plans",
      warning: billingPastDue,
    },
    {
      id: "widget",
      label: "Add the chat widget to your website",
      done: hasWidgetToken,
      href: "/settings/integrations/website-widget",
      hrefLabel: "Widget setup",
    },
    {
      id: "enquiry",
      label: "Send a test enquiry",
      done: false,
      href: "/widget",
      hrefLabel: "Open widget demo",
    },
  ];

  const doneCount = items.filter((i) => i.done).length;
  const allDone = doneCount === items.length;
  const autoDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!allDone || dismissed) return;
    autoDismissRef.current = setTimeout(dismiss, 2500);
    return () => { if (autoDismissRef.current) clearTimeout(autoDismissRef.current); };
  }, [allDone, dismissed]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Don't show for completely fresh users with no company or onboarding ───
  // Legacy users: no onboarding record AND legacyAccess = don't force banner
  const isLegacyUser = !onboarding?.exists && billing?.legacyAccess;
  if (isLegacyUser) return null;

  // Don't show if fully set up and dismissed
  if (dismissed) return null;

  // Don't show until we have at least company data
  if (!company) return null;

  return (
    <div className="w-full bg-primary/[0.04] border-b border-primary/15 px-4 sm:px-6 md:px-8 py-3">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-2.5">
          <span className="text-xs font-bold uppercase tracking-widest text-primary/80">Setup checklist</span>
          <span className="text-[11px] font-semibold text-muted-foreground bg-secondary px-2 py-0.5 rounded-full border border-border/50">
            {doneCount}/{items.length}
          </span>
          <button
            onClick={dismiss}
            className="ml-auto text-muted-foreground/50 hover:text-foreground transition-colors rounded-md p-0.5 hover:bg-secondary"
            title="Dismiss"
            aria-label="Dismiss setup checklist"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 flex-wrap">
          {items.map((item) => (
            <ChecklistRow key={item.id} item={item} />
          ))}
        </div>
      </div>
    </div>
  );
}

type ChecklistItem = {
  id: string;
  label: string;
  done: boolean;
  href: string;
  hrefLabel: string;
  warning?: boolean;
};

function ChecklistRow({ item }: { item: ChecklistItem }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 flex-1 min-w-0 rounded-lg border px-3 py-2 transition-all",
        item.done
          ? "bg-emerald-50/70 border-emerald-200/60"
          : item.warning
          ? "bg-red-50/70 border-red-200/60"
          : "bg-card border-border/60"
      )}
    >
      <div className="shrink-0">
        {item.done ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
        ) : item.warning ? (
          <AlertCircle className="w-4 h-4 text-red-500" />
        ) : (
          <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30" />
        )}
      </div>
      <span className={cn(
        "text-xs font-semibold flex-1 min-w-0 truncate",
        item.done && "line-through text-muted-foreground",
        item.warning && "text-red-900"
      )}>
        {item.label}
      </span>
      {!item.done && (
        <Link
          href={item.href}
          className={cn(
            "shrink-0 text-[11px] font-bold flex items-center gap-1 transition-colors",
            item.warning ? "text-red-600 hover:text-red-700" : "text-primary hover:text-primary/80"
          )}
        >
          {item.hrefLabel}
          <ChevronRight className="w-3 h-3" />
        </Link>
      )}
    </div>
  );
}
