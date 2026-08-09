import { useState, useEffect, useRef } from "react";
import { useGetCompany, useListEnquiries, getListEnquiriesQueryKey, useUpdateCompany } from "@workspace/api-client-react";
import { Link } from "wouter";
import { X, CheckCircle2, ArrowRight, Rocket } from "lucide-react";
import { cn } from "@/lib/utils";

const DISMISSED_KEY = "wr_onboarding_dismissed";
const STEP2_DONE_KEY = "wr_onboarding_step2_done";
const STEP3_DONE_KEY = "wr_onboarding_step3_done";
export const FIRST_ENQUIRY_SEEN_KEY = "wr_first_enquiry_seen";

/**
 * One-time setup checklist shown to users who have just created / claimed their
 * company. Disappears permanently once dismissed.
 *
 * Dismissal is persisted to the DB (via PUT /company) so it survives device
 * switches and localStorage clears. localStorage is kept as a fast-path fallback
 * so returning users on the same device never see a flicker.
 */
export function SetupBanner() {
  const { data: company } = useGetCompany();
  const { mutate: updateCompany } = useUpdateCompany();

  // Poll enquiries — used to auto-complete steps 2 & 3 on first widget hit.
  const { data: enquiries } = useListEnquiries(undefined, {
    query: { queryKey: getListEnquiriesQueryKey(), refetchInterval: 30_000 },
  });

  // Initialise from localStorage so returning users on the same device see
  // nothing immediately (no flicker). The DB value takes over once loaded.
  const [dismissed, setDismissed] = useState(() =>
    typeof window !== "undefined"
      ? localStorage.getItem(DISMISSED_KEY) === "1"
      : true
  );
  const [step2Done, setStep2Done] = useState(() =>
    typeof window !== "undefined"
      ? localStorage.getItem(STEP2_DONE_KEY) === "1"
      : false
  );
  const [step3Done, setStep3Done] = useState(() =>
    typeof window !== "undefined"
      ? localStorage.getItem(STEP3_DONE_KEY) === "1"
      : false
  );

  // Once the company record loads, honour the server-side dismissal flag.
  // This covers other devices / incognito windows where localStorage is cold.
  const serverDismissApplied = useRef(false);
  useEffect(() => {
    if (!company || serverDismissApplied.current) return;
    serverDismissApplied.current = true;
    if (company.onboardingDismissed) {
      // Mirror to localStorage so subsequent loads are instant.
      localStorage.setItem(DISMISSED_KEY, "1");
      setDismissed(true);
    }
  }, [company]);

  // Auto-complete steps 2 & 3 when the first enquiry arrives (proves the
  // widget is embedded and working). Only fires once per device.
  useEffect(() => {
    if (!enquiries || enquiries.length === 0) return;
    if (localStorage.getItem(FIRST_ENQUIRY_SEEN_KEY) === "1") return;
    localStorage.setItem(FIRST_ENQUIRY_SEEN_KEY, "1");
    if (!step2Done) {
      setStep2Done(true);
      localStorage.setItem(STEP2_DONE_KEY, "1");
    }
    if (!step3Done) {
      setStep3Done(true);
      localStorage.setItem(STEP3_DONE_KEY, "1");
    }
  }, [enquiries]); // eslint-disable-line react-hooks/exhaustive-deps

  // Step 1 auto-detects: name must be set and not the default placeholder.
  const step1Done = !!(
    company?.name &&
    company.name.trim() !== "" &&
    company.name !== "My Trade Business"
  );

  const allDone = step1Done && step2Done && step3Done;

  // Auto-dismiss 2 seconds after all steps are ticked.
  useEffect(() => {
    if (!allDone) return;
    const t = setTimeout(() => dismiss(), 2000);
    return () => clearTimeout(t);
  }, [allDone]); // eslint-disable-line react-hooks/exhaustive-deps

  function dismiss() {
    // Write to localStorage for instant effect on this device.
    localStorage.setItem(DISMISSED_KEY, "1");
    setDismissed(true);
    // Persist to DB so other devices / future sessions stay dismissed.
    updateCompany({ data: { onboardingDismissed: true } });
  }

  function toggleStep2() {
    const next = !step2Done;
    setStep2Done(next);
    localStorage.setItem(STEP2_DONE_KEY, next ? "1" : "0");
  }

  function toggleStep3() {
    const next = !step3Done;
    setStep3Done(next);
    localStorage.setItem(STEP3_DONE_KEY, next ? "1" : "0");
  }

  // Don't render until company data is loaded (avoids flicker on step 1).
  if (dismissed || !company) return null;

  const completedCount = [step1Done, step2Done, step3Done].filter(Boolean).length;

  return (
    <div className="w-full bg-primary/[0.06] border-b border-primary/20 px-4 sm:px-6 md:px-8 py-4">
      <div className="max-w-5xl mx-auto flex items-start gap-4">
        {/* Icon */}
        <div
          className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shrink-0 mt-0.5 shadow-sm"
          aria-hidden="true"
        >
          <Rocket style={{ width: 17, height: 17 }} className="text-primary-foreground" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2.5 mb-3">
            <h3 className="font-bold text-sm">Complete your setup</h3>
            <span className="text-[11px] font-semibold text-muted-foreground bg-secondary px-2 py-0.5 rounded-full border border-border/50">
              {completedCount}/3 done
            </span>
            {allDone && (
              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full animate-in fade-in-0">
                All done 🎉
              </span>
            )}
          </div>

          {/* Steps */}
          <div className="flex flex-col sm:flex-row gap-2.5">
            {/* Step 1 — auto-detect from company name */}
            <Step
              number={1}
              label="Name your business"
              description="Add your company name in Settings"
              done={step1Done}
              action={
                !step1Done ? (
                  <Link
                    href="/settings"
                    className="text-[11px] font-bold text-primary hover:underline flex items-center gap-1 mt-1"
                  >
                    Open Settings <ArrowRight className="w-3 h-3" />
                  </Link>
                ) : null
              }
            />

            {/* Step 2 — must be done in published app; user manually marks it */}
            <Step
              number={2}
              label="Copy your embed snippet"
              description={
                <>
                  Open <strong>Settings</strong> from your{" "}
                  <strong>published app</strong> — not this dev preview — and
                  copy the snippet from there.
                </>
              }
              done={step2Done}
              clickable
              onToggle={toggleStep2}
            />

            {/* Step 3 — user manually marks done */}
            <Step
              number={3}
              label="Add it to your website"
              description={
                <>
                  Paste the snippet before the closing{" "}
                  <code className="font-mono text-[10px] bg-muted px-1 py-0.5 rounded">
                    &lt;/body&gt;
                  </code>{" "}
                  tag on every page.
                </>
              }
              done={step3Done}
              clickable
              onToggle={toggleStep3}
            />
          </div>
        </div>

        {/* Dismiss button */}
        <button
          onClick={dismiss}
          className="text-muted-foreground/50 hover:text-foreground transition-colors shrink-0 mt-0.5 rounded-md p-0.5 hover:bg-secondary"
          title="Dismiss setup guide"
          aria-label="Dismiss setup guide"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── Step tile ──────────────────────────────────────────────────────────────────
function Step({
  number,
  label,
  description,
  done,
  clickable = false,
  onToggle,
  action,
}: {
  number: number;
  label: string;
  description: React.ReactNode;
  done: boolean;
  clickable?: boolean;
  onToggle?: () => void;
  action?: React.ReactNode;
}) {
  return (
    <div
      onClick={clickable ? onToggle : undefined}
      role={clickable ? "checkbox" : undefined}
      aria-checked={clickable ? done : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === " " || e.key === "Enter") onToggle?.();
            }
          : undefined
      }
      className={cn(
        "flex items-start gap-2.5 flex-1 rounded-xl border p-3 transition-all text-left",
        done
          ? "bg-emerald-50/70 border-emerald-200/70"
          : "bg-card border-border/60",
        clickable &&
          !done &&
          "cursor-pointer hover:border-primary/30 hover:bg-primary/[0.03] focus:outline-none focus:ring-2 focus:ring-primary/40",
        clickable && done && "cursor-pointer"
      )}
    >
      {/* Step number badge or check */}
      <div className="shrink-0 mt-0.5">
        {done ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
        ) : (
          <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30 flex items-center justify-center">
            <span className="text-[8px] font-black text-muted-foreground/50">
              {number}
            </span>
          </div>
        )}
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "text-xs font-bold leading-tight",
            done && "line-through text-muted-foreground"
          )}
        >
          {label}
        </p>
        <p className="text-[11px] text-muted-foreground font-medium mt-0.5 leading-relaxed">
          {description}
        </p>
        {action}
        {clickable && !done && (
          <p className="text-[10px] text-primary/60 font-semibold mt-1.5">
            Click to mark as done
          </p>
        )}
      </div>
    </div>
  );
}
