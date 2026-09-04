import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import {
  useGetOnboarding,
  useStartOnboarding,
  useUpdateOnboarding,
  useCompleteOnboarding,
  useUpdateCompany,
  useGetCompany,
  useGetBillingCatalog,
  useGetBillingOverview,
  useSaveBillingSelection,
  useRequestBillingCheckout,
  useListIntegrations,
  getGetOnboardingQueryKey,
  getGetBillingOverviewQueryKey,
  getGetBillingCatalogQueryKey,
  getGetCompanyQueryKey,
} from "@workspace/api-client-react";
import type { BillingOverview, BillingPlan } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Building2, Wrench, Palette, Settings, Puzzle, CreditCard,
  PlayCircle, FlaskConical, CheckCircle2, ChevronRight, ChevronLeft,
  MapPin, PoundSterling, Clock, Package, Globe, Mail, Phone,
  Hash, AlertCircle, Hammer, Check,
} from "lucide-react";
import { BillingPlanSelector } from "@/components/billing-plan-selector";
import type { BillingSelectionInputPlanCode } from "@workspace/api-client-react";
import {
  initialPlanFromOverview,
  initialAddOnsFromOverview,
  buildSelectionPayload,
} from "@/lib/billing-helpers";

// ── Step definitions ──────────────────────────────────────────────────────────

const STEPS = [
  { id: "welcome",             label: "Welcome",          icon: Hammer },
  { id: "business_details",    label: "Business Details", icon: Building2 },
  { id: "trade_services",      label: "Trade & Services", icon: Wrench },
  { id: "branding",            label: "Branding",         icon: Palette },
  { id: "commercial",          label: "Commercial",       icon: Settings },
  { id: "integrations",        label: "Integrations",     icon: Puzzle },
  { id: "plan",                label: "Choose Plan",      icon: CreditCard },
  { id: "payment",             label: "Start Trial",      icon: PlayCircle },
  { id: "test_enquiry",        label: "Test Enquiry",     icon: FlaskConical },
  { id: "finish",              label: "Finish",           icon: CheckCircle2 },
] as const;

type StepId = (typeof STEPS)[number]["id"];

const STEP_IDS = STEPS.map((s) => s.id) as StepId[];

const TRADE_TYPES = [
  "Joinery", "Building / General Contractor", "Electrical", "Plumbing",
  "Kitchen Installation", "Bathroom Installation", "Plastering", "Roofing",
  "Flooring", "Painting & Decorating", "Landscaping", "HVAC",
];

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: onboardingState, isLoading: onboardingLoading } = useGetOnboarding({
    query: { queryKey: getGetOnboardingQueryKey() },
  });
  const { data: company } = useGetCompany({
    query: { queryKey: getGetCompanyQueryKey() },
  });
  const { data: catalog } = useGetBillingCatalog({
    query: { queryKey: getGetBillingCatalogQueryKey() },
  });
  const { data: billingOverview } = useGetBillingOverview({
    query: { queryKey: getGetBillingOverviewQueryKey() },
  });
  const { data: integrations } = useListIntegrations();

  const startOnboarding = useStartOnboarding();
  const updateOnboarding = useUpdateOnboarding();
  const completeOnboarding = useCompleteOnboarding();
  const updateCompany = useUpdateCompany();
  const saveBillingSelection = useSaveBillingSelection();
  const requestCheckout = useRequestBillingCheckout();

  // ── Local state ──────────────────────────────────────────────────────────
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [checkoutUnavailable, setCheckoutUnavailable] = useState(false);
  const [checkoutMessage, setCheckoutMessage] = useState("");
  // selectedPlan=null → uninitialized; will hydrate from overview once loaded.
  // selectedAddOns=null → uninitialized; [] = user deliberately cleared all.
  const [selectedPlan, setSelectedPlan] = useState<BillingSelectionInputPlanCode | null>(null);
  const [selectedAddOns, setSelectedAddOns] = useState<string[] | null>(null);
  const billingHydratedRef = useRef(false);

  // Business fields
  const [bizName, setBizName] = useState("");
  const [bizEmail, setBizEmail] = useState("");
  const [bizPhone, setBizPhone] = useState("");
  const [bizAddress, setBizAddress] = useState("");
  const [bizWebsite, setBizWebsite] = useState("");

  // Trade
  const [tradeType, setTradeType] = useState("");
  const [serviceArea, setServiceArea] = useState("");
  const [typicalLeadTimes, setTypicalLeadTimes] = useState("");
  const [preferredSuppliers, setPreferredSuppliers] = useState("");

  // Branding
  const [brandPrimary, setBrandPrimary] = useState("#1E293B");
  const [brandSecondary, setBrandSecondary] = useState("#0d9488");
  const [vatNumber, setVatNumber] = useState("");
  const [companyRegNumber, setCompanyRegNumber] = useState("");
  const [bankPaymentDetails, setBankPaymentDetails] = useState("");

  // Commercial
  const [labourRate, setLabourRate] = useState("");
  const [dayRate, setDayRate] = useState("");
  const [markup, setMarkup] = useState("20");
  const [minProject, setMinProject] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");

  const startedRef = useRef(false);
  const initializedRef = useRef(false);

  // ── Bootstrap onboarding on mount ────────────────────────────────────────
  useEffect(() => {
    if (onboardingLoading) return;
    if (startedRef.current) return;
    startedRef.current = true;

    // If existing user with completed onboarding, go to dashboard
    if (onboardingState?.status === "completed") {
      setLocation("/dashboard");
      return;
    }

    // Restore step from server state
    if (onboardingState?.exists && onboardingState.currentStep) {
      const idx = STEP_IDS.indexOf(onboardingState.currentStep as StepId);
      if (idx >= 0) setCurrentStepIdx(idx);
    }

    // Start if not started
    if (!onboardingState?.exists) {
      startOnboarding.mutate(undefined, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetOnboardingQueryKey() });
        },
        onError: () => {
          toast({ title: "Failed to start onboarding", variant: "destructive" });
        },
      });
    }
  }, [onboardingLoading, onboardingState]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Pre-fill fields from company ─────────────────────────────────────────
  useEffect(() => {
    if (!company || initializedRef.current) return;
    initializedRef.current = true;
    setBizName(company.name ?? "");
    setBizEmail(company.email ?? "");
    setBizPhone(company.phone ?? "");
    setBizAddress(company.address ?? "");
    setBizWebsite(company.website ?? "");
    setTradeType(company.tradeType ?? "");
    setServiceArea(company.serviceArea ?? "");
    setTypicalLeadTimes(company.typicalLeadTimes ?? "");
    setPreferredSuppliers(company.preferredSuppliers ?? "");
    setBrandPrimary(company.brandColourPrimary ?? "#1E293B");
    setBrandSecondary(company.brandColourSecondary ?? "#0d9488");
    setVatNumber(company.vatNumber ?? "");
    setCompanyRegNumber(company.companyRegNumber ?? "");
    setBankPaymentDetails(company.bankPaymentDetails ?? "");
    setLabourRate(String(company.labourRatePerHour ?? ""));
    setDayRate(String(company.dayRate ?? ""));
    setMarkup(String(company.materialMarkupPercent ?? 20));
    setMinProject(String(company.minimumProjectValue ?? ""));
    setPaymentTerms(company.paymentTerms ?? "");
  }, [company]);

  // ── Hydrate billing plan/add-ons from overview (once, never overwrite edits) ──
  useEffect(() => {
    if (!billingOverview || billingHydratedRef.current) return;
    billingHydratedRef.current = true;
    const plan = initialPlanFromOverview(billingOverview);
    if (plan) setSelectedPlan(plan);
    setSelectedAddOns(initialAddOnsFromOverview(billingOverview));
  }, [billingOverview]);

  const currentStep = STEPS[currentStepIdx];

  // ── Persist progress ──────────────────────────────────────────────────────
  const persistProgress = useCallback(
    (stepId: StepId, extraData?: Record<string, unknown>) => {
      updateOnboarding.mutate(
        {
          data: {
            currentStep: stepId,
            data: extraData ?? {},
          },
        },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetOnboardingQueryKey() });
          },
        }
      );
    },
    [updateOnboarding, queryClient]
  );

  // ── Navigate steps ────────────────────────────────────────────────────────
  const goNext = useCallback(async () => {
    const nextIdx = Math.min(currentStepIdx + 1, STEPS.length - 1);
    const nextStep = STEPS[nextIdx];
    setCurrentStepIdx(nextIdx);
    persistProgress(nextStep.id);
  }, [currentStepIdx, persistProgress]);

  const goPrev = useCallback(() => {
    const prevIdx = Math.max(currentStepIdx - 1, 0);
    setCurrentStepIdx(prevIdx);
    persistProgress(STEPS[prevIdx].id);
  }, [currentStepIdx, persistProgress]);

  // ── Save company fields helper ────────────────────────────────────────────
  const saveCompanyFields = useCallback(
    (fields: Record<string, unknown>, onDone?: () => void) => {
      // Filter out empty strings for optional fields
      const data: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(fields)) {
        if (v !== "" && v !== undefined) data[k] = v;
      }
      updateCompany.mutate(
        { data: data as any },
        {
          onSuccess: (res) => {
            queryClient.setQueryData(getGetCompanyQueryKey(), res);
            onDone?.();
          },
          onError: () => {
            toast({ title: "Failed to save", variant: "destructive" });
          },
        }
      );
    },
    [updateCompany, queryClient, toast]
  );

  // ── Step-specific next handlers ───────────────────────────────────────────
  const handleBusinessNext = () => {
    if (!bizName.trim()) {
      toast({ title: "Company name is required", variant: "destructive" });
      return;
    }
    saveCompanyFields({ name: bizName, email: bizEmail, phone: bizPhone, address: bizAddress, website: bizWebsite }, goNext);
  };

  const handleTradeNext = () => {
    saveCompanyFields({ tradeType, serviceArea, typicalLeadTimes, preferredSuppliers }, goNext);
  };

  const handleBrandingNext = () => {
    saveCompanyFields({ brandColourPrimary: brandPrimary, brandColourSecondary: brandSecondary, vatNumber, companyRegNumber, bankPaymentDetails }, goNext);
  };

  const handleCommercialNext = () => {
    saveCompanyFields({
      labourRatePerHour: labourRate ? Number(labourRate) : undefined,
      dayRate: dayRate ? Number(dayRate) : undefined,
      materialMarkupPercent: markup ? Number(markup) : 20,
      minimumProjectValue: minProject ? Number(minProject) : undefined,
      paymentTerms,
    }, goNext);
  };

  const handlePlanNext = () => {
    // Resolve null-sentinels: null means "not yet hydrated, use overview values"
    const planCode: BillingSelectionInputPlanCode =
      selectedPlan ?? (initialPlanFromOverview(billingOverview) ?? "core");
    const addOnCodes: string[] =
      selectedAddOns ?? initialAddOnsFromOverview(billingOverview);

    saveBillingSelection.mutate(
      { data: buildSelectionPayload(planCode, addOnCodes) },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetBillingOverviewQueryKey() });
          goNext();
        },
        onError: () => {
          toast({ title: "Failed to save plan selection", variant: "destructive" });
        },
      }
    );
  };

  const handlePaymentNext = () => {
    setCheckoutUnavailable(false);
    requestCheckout.mutate(undefined, {
      onSuccess: (data: any) => {
        if (data?.url) window.location.assign(data.url);
        else toast({ title: "Checkout did not return a hosted URL", variant: "destructive" });
      },
      onError: (err: any) => {
        // 501 = payment not yet available
        const body = err?.response?.data ?? err;
        if (body?.code === "PAYMENT_SETUP_UNAVAILABLE" || err?.status === 501) {
          setCheckoutUnavailable(true);
          setCheckoutMessage(body?.message ?? "Payment setup is not yet available. You can continue setting up and return to billing when ready.");
        } else {
          toast({ title: "Checkout error", description: String(err?.message ?? "Unknown error"), variant: "destructive" });
        }
      },
    });
  };

  const handleComplete = () => {
    completeOnboarding.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetOnboardingQueryKey() });
        setLocation("/dashboard");
      },
      onError: () => {
        toast({ title: "Failed to complete onboarding", variant: "destructive" });
      },
    });
  };

  const handleSkipIntegrations = () => {
    goNext();
  };

  if (onboardingLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <div className="space-y-4 w-full max-w-md px-4">
          <Skeleton className="h-8 w-48 mx-auto" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      {/* Header */}
      <header className="h-[60px] bg-sidebar border-b border-sidebar-border flex items-center px-6 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="bg-primary text-primary-foreground p-1.5 rounded-lg shadow-sm">
            <Hammer className="w-[18px] h-[18px]" />
          </div>
          <span className="font-black text-[17px] text-sidebar-foreground tracking-tight leading-none">WorkRate</span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-muted-foreground font-medium hidden sm:block">
            Step {currentStepIdx + 1} of {STEPS.length}
          </span>
          <div className="h-1.5 w-32 bg-border rounded-full overflow-hidden hidden sm:block">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${((currentStepIdx + 1) / STEPS.length) * 100}%` }}
            />
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Sidebar step list — desktop */}
        <aside className="hidden lg:flex w-56 border-r border-border flex-col py-8 px-4 shrink-0 bg-card">
          {STEPS.map((step, idx) => {
            const Icon = step.icon;
            const state = idx < currentStepIdx ? "done" : idx === currentStepIdx ? "active" : "pending";
            return (
              <button
                key={step.id}
                onClick={() => {
                  if (idx < currentStepIdx) {
                    setCurrentStepIdx(idx);
                    persistProgress(step.id);
                  }
                }}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold mb-1 transition-colors text-left",
                  state === "active" && "bg-primary/10 text-primary border border-primary/20",
                  state === "done" && "text-muted-foreground hover:bg-secondary cursor-pointer",
                  state === "pending" && "text-muted-foreground/50 cursor-default"
                )}
                disabled={idx > currentStepIdx}
              >
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center shrink-0",
                  state === "done" && "bg-emerald-100",
                  state === "active" && "bg-primary",
                  state === "pending" && "bg-border"
                )}>
                  {state === "done"
                    ? <Check className="w-3.5 h-3.5 text-emerald-600" />
                    : <Icon className={cn("w-3.5 h-3.5", state === "active" ? "text-primary-foreground" : "text-muted-foreground/50")} />
                  }
                </div>
                <span className="text-xs">{step.label}</span>
              </button>
            );
          })}
        </aside>

        {/* Main content */}
        <main className="flex-1 flex flex-col items-center py-10 px-4 sm:px-8 overflow-y-auto">
          <div className="w-full max-w-2xl">
            {/* Mobile progress */}
            <div className="flex items-center gap-2 mb-8 lg:hidden">
              <div className="h-1.5 flex-1 bg-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${((currentStepIdx + 1) / STEPS.length) * 100}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground font-medium shrink-0">
                {currentStepIdx + 1}/{STEPS.length}
              </span>
            </div>

            {/* Step content */}
            <div className="animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
              {currentStep.id === "welcome" && <StepWelcome companyName={company?.name} />}
              {currentStep.id === "business_details" && (
                <StepBusinessDetails
                  name={bizName} setName={setBizName}
                  email={bizEmail} setEmail={setBizEmail}
                  phone={bizPhone} setPhone={setBizPhone}
                  address={bizAddress} setAddress={setBizAddress}
                  website={bizWebsite} setWebsite={setBizWebsite}
                />
              )}
              {currentStep.id === "trade_services" && (
                <StepTradeServices
                  tradeType={tradeType} setTradeType={setTradeType}
                  serviceArea={serviceArea} setServiceArea={setServiceArea}
                  typicalLeadTimes={typicalLeadTimes} setTypicalLeadTimes={setTypicalLeadTimes}
                  preferredSuppliers={preferredSuppliers} setPreferredSuppliers={setPreferredSuppliers}
                />
              )}
              {currentStep.id === "branding" && (
                <StepBranding
                  brandPrimary={brandPrimary} setBrandPrimary={setBrandPrimary}
                  brandSecondary={brandSecondary} setBrandSecondary={setBrandSecondary}
                  vatNumber={vatNumber} setVatNumber={setVatNumber}
                  companyRegNumber={companyRegNumber} setCompanyRegNumber={setCompanyRegNumber}
                  bankPaymentDetails={bankPaymentDetails} setBankPaymentDetails={setBankPaymentDetails}
                />
              )}
              {currentStep.id === "commercial" && (
                <StepCommercial
                  labourRate={labourRate} setLabourRate={setLabourRate}
                  dayRate={dayRate} setDayRate={setDayRate}
                  markup={markup} setMarkup={setMarkup}
                  minProject={minProject} setMinProject={setMinProject}
                  paymentTerms={paymentTerms} setPaymentTerms={setPaymentTerms}
                />
              )}
              {currentStep.id === "integrations" && (
                <StepIntegrations integrations={integrations ?? []} />
              )}
              {currentStep.id === "plan" && (
                <StepPlan
                  catalog={catalog}
                  selectedPlan={selectedPlan}
                  setSelectedPlan={setSelectedPlan}
                  selectedAddOns={selectedAddOns}
                  setSelectedAddOns={setSelectedAddOns}
                />
              )}
              {currentStep.id === "payment" && (
                <StepPayment
                  unavailable={checkoutUnavailable}
                  unavailableMessage={checkoutMessage}
                  onSkipToNext={goNext}
                  billingOverview={billingOverview}
                  selectedPlanData={catalog?.plans.find(
                    (p) => p.code === (selectedPlan ?? initialPlanFromOverview(billingOverview) ?? "core")
                  ) ?? null}
                />
              )}
              {currentStep.id === "test_enquiry" && <StepTestEnquiry widgetToken={company?.widgetToken} />}
              {currentStep.id === "finish" && (
                <StepFinish
                  billingOverview={billingOverview}
                  selectedPlanData={catalog?.plans.find(
                    (p) => p.code === (billingOverview?.planCode ?? selectedPlan ?? initialPlanFromOverview(billingOverview) ?? "core")
                  ) ?? null}
                />
              )}
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between mt-10 pt-6 border-t border-border">
              <Button
                variant="outline"
                onClick={goPrev}
                disabled={currentStepIdx === 0 || updateOnboarding.isPending || completeOnboarding.isPending}
                className="gap-2"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </Button>

              <div className="flex items-center gap-3">
                {/* Skip for integrations step */}
                {currentStep.id === "integrations" && (
                  <Button variant="ghost" onClick={handleSkipIntegrations} className="text-muted-foreground">
                    Skip for now
                  </Button>
                )}

                {currentStep.id === "finish" ? (
                  <Button
                    onClick={handleComplete}
                    disabled={completeOnboarding.isPending}
                    className="gap-2 font-bold px-8"
                    size="lg"
                  >
                    {completeOnboarding.isPending ? "Completing…" : "Go to Dashboard"}
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                ) : currentStep.id === "payment" ? (
                  <div className="flex gap-2">
                    {!checkoutUnavailable && (
                      <Button
                        onClick={handlePaymentNext}
                        disabled={requestCheckout.isPending}
                        className="gap-2 font-bold"
                      >
                        {requestCheckout.isPending ? "Connecting…" : "Set Up Payment"}
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    )}
                    {checkoutUnavailable && (
                      <Button variant="outline" onClick={goNext} className="gap-2">
                        Continue Setup
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ) : currentStep.id === "plan" ? (
                  <Button
                    onClick={handlePlanNext}
                    disabled={saveBillingSelection.isPending}
                    className="gap-2 font-bold"
                  >
                    {saveBillingSelection.isPending ? "Saving…" : "Confirm Plan"}
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                ) : currentStep.id === "business_details" ? (
                  <Button onClick={handleBusinessNext} disabled={updateCompany.isPending} className="gap-2 font-bold">
                    {updateCompany.isPending ? "Saving…" : "Continue"}
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                ) : currentStep.id === "trade_services" ? (
                  <Button onClick={handleTradeNext} disabled={updateCompany.isPending} className="gap-2 font-bold">
                    {updateCompany.isPending ? "Saving…" : "Continue"}
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                ) : currentStep.id === "branding" ? (
                  <Button onClick={handleBrandingNext} disabled={updateCompany.isPending} className="gap-2 font-bold">
                    {updateCompany.isPending ? "Saving…" : "Continue"}
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                ) : currentStep.id === "commercial" ? (
                  <Button onClick={handleCommercialNext} disabled={updateCompany.isPending} className="gap-2 font-bold">
                    {updateCompany.isPending ? "Saving…" : "Continue"}
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                ) : (
                  <Button onClick={goNext} className="gap-2 font-bold">
                    Continue
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

// ── Step components ───────────────────────────────────────────────────────────

function StepWelcome({ companyName }: { companyName?: string }) {
  return (
    <div>
      <div className="mb-8">
        <div className="w-14 h-14 bg-primary rounded-2xl flex items-center justify-center mb-6 shadow-lg">
          <Hammer className="w-7 h-7 text-primary-foreground" />
        </div>
        <h1 className="text-3xl font-black tracking-tight mb-3">
          {companyName ? `Welcome back, ${companyName}` : "Welcome to WorkRate"}
        </h1>
        <p className="text-muted-foreground text-base leading-relaxed max-w-lg">
          WorkRate is your business operating system for managing enquiries, quotes, invoices, and your AI receptionist — built for UK tradespeople.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          { icon: Building2, title: "Your business profile", desc: "Name, contact details, trade type, and service area." },
          { icon: CreditCard, title: "Commercial settings", desc: "Labour rates, markup, deposit rules, and payment terms." },
          { icon: Palette, title: "Branding", desc: "Your colours, registration details, and bank information." },
          { icon: PlayCircle, title: "Choose your plan", desc: "Core or Complete — start with a paid trial period." },
        ].map((item) => (
          <div key={item.title} className="flex items-start gap-3 p-4 rounded-xl border border-border bg-card">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <item.icon className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-bold">{item.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-6 text-sm text-muted-foreground font-medium">
        This takes about 5 minutes. All fields can be updated from Settings later.
      </p>
    </div>
  );
}

function FieldRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">{children}</div>;
}

function FieldGroup({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-semibold mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted-foreground mt-1.5 font-medium">{hint}</p>}
    </div>
  );
}

function StepHeader({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="mb-8">
      <h2 className="text-2xl font-black tracking-tight mb-2">{title}</h2>
      <p className="text-muted-foreground text-sm">{desc}</p>
    </div>
  );
}

function StepBusinessDetails({ name, setName, email, setEmail, phone, setPhone, address, setAddress, website, setWebsite }: {
  name: string; setName: (v: string) => void;
  email: string; setEmail: (v: string) => void;
  phone: string; setPhone: (v: string) => void;
  address: string; setAddress: (v: string) => void;
  website: string; setWebsite: (v: string) => void;
}) {
  return (
    <div>
      <StepHeader title="Business Details" desc="Your company information appears on quotes and invoices sent to customers." />
      <div className="space-y-5">
        <FieldGroup label="Company Name *">
          <Input placeholder="e.g. Smith Joinery Ltd" value={name} onChange={(e) => setName(e.target.value)} />
        </FieldGroup>
        <FieldRow>
          <FieldGroup label="Email" hint="For customer communications">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9" type="email" placeholder="hello@yourcompany.co.uk" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </FieldGroup>
          <FieldGroup label="Phone">
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="07700 900000" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </FieldGroup>
        </FieldRow>
        <FieldGroup label="Address" hint="Shown on formal documents">
          <div className="relative">
            <MapPin className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="123 High Street, Manchester, M1 1AA" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
        </FieldGroup>
        <FieldGroup label="Website" hint="Optional — shown on proposals">
          <div className="relative">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="https://yourcompany.co.uk" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </div>
        </FieldGroup>
      </div>
    </div>
  );
}

function StepTradeServices({ tradeType, setTradeType, serviceArea, setServiceArea, typicalLeadTimes, setTypicalLeadTimes, preferredSuppliers, setPreferredSuppliers }: {
  tradeType: string; setTradeType: (v: string) => void;
  serviceArea: string; setServiceArea: (v: string) => void;
  typicalLeadTimes: string; setTypicalLeadTimes: (v: string) => void;
  preferredSuppliers: string; setPreferredSuppliers: (v: string) => void;
}) {
  return (
    <div>
      <StepHeader title="Trade & Services" desc="Tell WorkRate about your trade so the AI can generate accurate quotes and summaries." />
      <div className="space-y-6">
        <FieldGroup label="Your Trade">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
            {TRADE_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTradeType(t)}
                className={cn(
                  "px-3 py-2 rounded-lg text-xs font-semibold border transition-all text-left",
                  tradeType === t
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-secondary/50 text-foreground/70 border-border hover:border-primary/40"
                )}
              >
                {t}
              </button>
            ))}
          </div>
          <Input placeholder="Or enter your specific trade…" value={tradeType} onChange={(e) => setTradeType(e.target.value)} />
        </FieldGroup>
        <FieldRow>
          <FieldGroup label="Service Area" hint="AI flags out-of-area enquiries">
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="e.g. Manchester & 20-mile radius" value={serviceArea} onChange={(e) => setServiceArea(e.target.value)} />
            </div>
          </FieldGroup>
          <FieldGroup label="Typical Lead Times" hint="Added to quote notes automatically">
            <div className="relative">
              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="e.g. 2-3 weeks for new jobs" value={typicalLeadTimes} onChange={(e) => setTypicalLeadTimes(e.target.value)} />
            </div>
          </FieldGroup>
        </FieldRow>
        <FieldGroup label="Preferred Suppliers" hint="AI references these when specifying materials on quotes">
          <div className="relative">
            <Package className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
            <Textarea
              className="pl-9 resize-none min-h-[80px]"
              placeholder="e.g. Jewson for timber, Travis Perkins for fixings, local tile merchant for ceramics"
              value={preferredSuppliers}
              onChange={(e) => setPreferredSuppliers(e.target.value)}
            />
          </div>
        </FieldGroup>
      </div>
    </div>
  );
}

function StepBranding({ brandPrimary, setBrandPrimary, brandSecondary, setBrandSecondary, vatNumber, setVatNumber, companyRegNumber, setCompanyRegNumber, bankPaymentDetails, setBankPaymentDetails }: {
  brandPrimary: string; setBrandPrimary: (v: string) => void;
  brandSecondary: string; setBrandSecondary: (v: string) => void;
  vatNumber: string; setVatNumber: (v: string) => void;
  companyRegNumber: string; setCompanyRegNumber: (v: string) => void;
  bankPaymentDetails: string; setBankPaymentDetails: (v: string) => void;
}) {
  return (
    <div>
      <StepHeader title="Branding" desc="Your brand colours appear on quotes and proposals. Registration details appear on formal documents." />
      <div className="space-y-6">
        <div>
          <p className="text-sm font-semibold mb-3">Brand Colours</p>
          <FieldRow>
            <FieldGroup label="Primary Colour">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg border border-border overflow-hidden shrink-0">
                  <input type="color" className="w-full h-full cursor-pointer border-0 bg-transparent" value={brandPrimary} onChange={(e) => setBrandPrimary(e.target.value)} />
                </div>
                <Input value={brandPrimary} onChange={(e) => setBrandPrimary(e.target.value)} placeholder="#1E293B" />
              </div>
            </FieldGroup>
            <FieldGroup label="Secondary Colour">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg border border-border overflow-hidden shrink-0">
                  <input type="color" className="w-full h-full cursor-pointer border-0 bg-transparent" value={brandSecondary} onChange={(e) => setBrandSecondary(e.target.value)} />
                </div>
                <Input value={brandSecondary} onChange={(e) => setBrandSecondary(e.target.value)} placeholder="#0d9488" />
              </div>
            </FieldGroup>
          </FieldRow>
        </div>

        <div className="border-t border-border pt-5">
          <p className="text-sm font-semibold mb-3">Company Registration</p>
          <FieldRow>
            <FieldGroup label="VAT Number" hint="Optional — shown on VAT invoices">
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input className="pl-9" placeholder="GB123456789" value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} />
              </div>
            </FieldGroup>
            <FieldGroup label="Companies House Number" hint="Optional">
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input className="pl-9" placeholder="12345678" value={companyRegNumber} onChange={(e) => setCompanyRegNumber(e.target.value)} />
              </div>
            </FieldGroup>
          </FieldRow>
        </div>

        <div className="border-t border-border pt-5">
          <FieldGroup label="Bank Payment Details" hint="Shown on invoices to help customers pay — include sort code, account number, and name">
            <Textarea
              className="resize-none min-h-[80px]"
              placeholder="Account: Smith Joinery Ltd&#10;Sort code: 00-00-00&#10;Account number: 12345678"
              value={bankPaymentDetails}
              onChange={(e) => setBankPaymentDetails(e.target.value)}
            />
          </FieldGroup>
        </div>
      </div>
    </div>
  );
}

function StepCommercial({ labourRate, setLabourRate, dayRate, setDayRate, markup, setMarkup, minProject, setMinProject, paymentTerms, setPaymentTerms }: {
  labourRate: string; setLabourRate: (v: string) => void;
  dayRate: string; setDayRate: (v: string) => void;
  markup: string; setMarkup: (v: string) => void;
  minProject: string; setMinProject: (v: string) => void;
  paymentTerms: string; setPaymentTerms: (v: string) => void;
}) {
  return (
    <div>
      <StepHeader title="Commercial Settings" desc="These figures power AI-generated quotes. They can be adjusted at any time in Settings." />
      <div className="space-y-5">
        <FieldRow>
          <FieldGroup label="Labour Hourly Rate (£/hr)">
            <div className="relative">
              <PoundSterling className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9" type="number" min={0} step={0.5} placeholder="e.g. 40" value={labourRate} onChange={(e) => setLabourRate(e.target.value)} />
            </div>
          </FieldGroup>
          <FieldGroup label="Day Rate (£/day)" hint="Optional — for multi-day jobs">
            <div className="relative">
              <PoundSterling className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9" type="number" min={0} step={0.5} placeholder="e.g. 280" value={dayRate} onChange={(e) => setDayRate(e.target.value)} />
            </div>
          </FieldGroup>
        </FieldRow>
        <FieldRow>
          <FieldGroup label="Materials Markup (%)" hint="Applied to material costs on quotes">
            <div className="relative">
              <Input className="pr-9" type="number" min={0} max={100} step={1} placeholder="20" value={markup} onChange={(e) => setMarkup(e.target.value)} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm">%</span>
            </div>
          </FieldGroup>
          <FieldGroup label="Minimum Project Value" hint="AI will not quote below this amount">
            <div className="relative">
              <PoundSterling className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9" type="number" min={0} step={50} placeholder="e.g. 500" value={minProject} onChange={(e) => setMinProject(e.target.value)} />
            </div>
          </FieldGroup>
        </FieldRow>
        <FieldGroup label="Payment Terms" hint="e.g. 50% deposit required, balance due on completion">
          <Textarea className="resize-none min-h-[70px]" placeholder="e.g. 50% deposit on acceptance, balance due within 14 days of completion." value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} />
        </FieldGroup>
      </div>
    </div>
  );
}

function StepIntegrations({ integrations }: { integrations: any[] }) {
  const intMap = Object.fromEntries(integrations.map((i) => [i.provider, i]));
  const items = [
    { provider: "stripe", name: "Stripe Payments", desc: "Collect deposits and final payments online.", href: "/settings/integrations/stripe" },
    { provider: "xero", name: "Xero Accounting", desc: "Sync invoices and expenses to Xero.", href: "/settings/integrations/xero" },
    { provider: "hmrc", name: "HMRC MTD", desc: "Connect for Making Tax Digital VAT filing.", href: "/settings/integrations/hmrc" },
  ];

  return (
    <div>
      <StepHeader title="Integrations" desc="Connect third-party tools to extend WorkRate. All integrations are optional and can be set up later from Settings." />
      <div className="space-y-3">
        {items.map((item) => {
          const connected = intMap[item.provider]?.status === "connected";
          return (
            <div key={item.provider} className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold">{item.name}</p>
                  {connected && (
                    <Badge variant="secondary" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">Connected</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
              </div>
              {!connected && (
                <a href={item.href} className="text-xs font-semibold text-primary border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors rounded-lg px-3 py-1.5 shrink-0">
                  Connect
                </a>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-5 text-xs text-muted-foreground font-medium bg-secondary/50 rounded-lg p-3 border border-border">
        Integrations do not block your setup. Click "Skip for now" or "Continue" below to proceed.
      </p>
    </div>
  );
}

function StepPlan({ catalog, selectedPlan, setSelectedPlan, selectedAddOns, setSelectedAddOns }: {
  catalog: any;
  /** null means not yet hydrated from overview */
  selectedPlan: BillingSelectionInputPlanCode | null;
  setSelectedPlan: (p: BillingSelectionInputPlanCode) => void;
  /** null means not yet hydrated; [] means user deliberately cleared */
  selectedAddOns: string[] | null;
  setSelectedAddOns: (a: string[]) => void;
}) {
  return (
    <div>
      <StepHeader
        title="Choose Your Plan"
        desc="Select the plan that fits your business. Each plan starts with a paid trial period — see the pricing details below. You can switch plans at any time from billing settings."
      />
      <BillingPlanSelector
        catalog={catalog}
        isLoading={!catalog}
        selectedPlan={selectedPlan ?? "core"}
        setSelectedPlan={setSelectedPlan}
        selectedAddOns={selectedAddOns}
        setSelectedAddOns={setSelectedAddOns}
        trialCopyMode={true}
      />
    </div>
  );
}

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

function StepPayment({
  unavailable,
  unavailableMessage,
  onSkipToNext,
  billingOverview,
  selectedPlanData,
}: {
  unavailable: boolean;
  unavailableMessage: string;
  onSkipToNext: () => void;
  billingOverview: BillingOverview | undefined;
  selectedPlanData: BillingPlan | null;
}) {
  const isTrialing = billingOverview?.status === "trialing";
  const trialDaysLeft = daysUntil(billingOverview?.trialEndsAt);

  return (
    <div>
      <StepHeader
        title="Start Your Trial"
        desc="We use Stripe to handle payment securely. Your trial begins immediately — no charge until the trial ends."
      />

      {/* Already trialing: show live timing summary */}
      {isTrialing && (
        <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 p-5">
          <div className="flex items-start gap-3">
            <Clock className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="space-y-1.5">
              <p className="text-sm font-bold text-blue-900">Trial active</p>
              {billingOverview?.trialEndsAt && (
                <p className="text-sm text-blue-800">
                  Your trial ends on{" "}
                  <strong>{fmtDate(billingOverview.trialEndsAt)}</strong>
                  {trialDaysLeft !== null
                    ? <> — <strong>{trialDaysLeft} day{trialDaysLeft !== 1 ? "s" : ""} remaining</strong></>
                    : " — trial has ended"
                  }.
                </p>
              )}
              {selectedPlanData && (
                <p className="text-sm text-blue-800">
                  After the trial your plan renews at{" "}
                  <strong>£{selectedPlanData.monthlyPriceGbp}/month</strong>.
                  Cancel any time before the trial ends to avoid charges.
                </p>
              )}
              {billingOverview?.provider && (
                <p className="text-xs text-blue-700 font-medium">
                  Provider: {billingOverview.provider}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {unavailable ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-amber-900 mb-1">
                Payment setup not yet available
              </p>
              <p className="text-sm text-amber-800 leading-relaxed">
                {unavailableMessage ||
                  "Payment processing is not yet configured. You can continue your setup and return to billing when it becomes available."}
              </p>
              <button
                onClick={onSkipToNext}
                className="mt-4 text-xs font-bold text-amber-900 underline underline-offset-2"
              >
                Continue setup without payment
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Selected plan summary */}
          {selectedPlanData && !isTrialing && (
            <div className="p-4 rounded-xl border border-border bg-card flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold">{selectedPlanData.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {selectedPlanData.trialDays}-day trial
                  {selectedPlanData.trialPriceGbp !== null
                    ? ` for £${selectedPlanData.trialPriceGbp}`
                    : " — free"
                  }, then £{selectedPlanData.monthlyPriceGbp}/month
                </p>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xl font-black">
                  £{selectedPlanData.monthlyPriceGbp}
                  <span className="text-xs font-normal text-muted-foreground">/mo</span>
                </div>
              </div>
            </div>
          )}

          <div className="p-5 rounded-xl border border-border bg-card">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <CreditCard className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-bold">Secure payment via Stripe</p>
                <p className="text-xs text-muted-foreground">
                  Your card details are handled entirely by Stripe — WorkRate never sees them.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {[
                "Cancel anytime before trial ends",
                "No charge during the trial period",
                "Full access to all plan features",
                "Automatic renewal after trial",
              ].map((item) => (
                <div key={item} className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="text-muted-foreground">{item}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Click "Set Up Payment" to open the secure Stripe checkout.
          </p>
        </div>
      )}
    </div>
  );
}

function StepTestEnquiry({ widgetToken }: { widgetToken?: string | null }) {
  const basePath = typeof window !== "undefined" ? window.location.origin : "";
  return (
    <div>
      <StepHeader title="Test Your Enquiry Flow" desc="Send yourself a test enquiry to confirm everything is working before going live." />
      <div className="space-y-4">
        <div className="p-5 rounded-xl border border-border bg-card">
          <p className="text-sm font-bold mb-3">Option 1 — Use the chat widget</p>
          <p className="text-sm text-muted-foreground mb-4">
            Navigate to{" "}
            <a href={`${basePath}/widget`} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 font-medium">
              the widget demo page
            </a>{" "}
            and submit a test enquiry. It will appear in your Enquiries dashboard within seconds.
          </p>
          {widgetToken && (
            <div className="bg-secondary rounded-lg p-3 font-mono text-xs text-muted-foreground break-all">
              Your widget token: <span className="text-foreground font-bold">{widgetToken}</span>
            </div>
          )}
        </div>
        <div className="p-5 rounded-xl border border-border bg-card">
          <p className="text-sm font-bold mb-3">Option 2 — Create manually</p>
          <p className="text-sm text-muted-foreground mb-3">
            Go to Enquiries and click "New Enquiry" to add one manually. This lets you test the AI summary, quoting, and job creation flow.
          </p>
          <a
            href="/enquiries"
            className="inline-flex items-center gap-2 text-xs font-bold text-primary border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors rounded-lg px-3 py-1.5"
          >
            Go to Enquiries
            <ChevronRight className="w-3.5 h-3.5" />
          </a>
        </div>
        <p className="text-xs text-muted-foreground bg-secondary/50 rounded-lg p-3 border border-border">
          You can skip this step and test at any time. Your first real enquiry will appear here once customers find your widget.
        </p>
      </div>
    </div>
  );
}

function StepFinish({
  billingOverview,
  selectedPlanData,
}: {
  billingOverview: BillingOverview | undefined;
  selectedPlanData: BillingPlan | null;
}) {
  const isTrialing   = billingOverview?.status === "trialing";
  const isActive     = billingOverview?.status === "active";
  const trialDaysLeft = daysUntil(billingOverview?.trialEndsAt);
  const renewalDaysLeft = daysUntil(billingOverview?.currentPeriodEndsAt);

  return (
    <div>
      <div className="text-center py-8">
        <div className="w-16 h-16 rounded-full bg-emerald-100 border-2 border-emerald-200 flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-8 h-8 text-emerald-600" />
        </div>
        <h2 className="text-3xl font-black tracking-tight mb-3">You're all set</h2>
        <p className="text-muted-foreground text-base max-w-md mx-auto leading-relaxed">
          WorkRate is configured and ready. Head to your dashboard to start managing enquiries, create quotes, and track your pipeline.
        </p>
      </div>

      {/* Billing summary box */}
      {(isTrialing || isActive || billingOverview?.status === "past_due") && selectedPlanData && (
        <div className="mb-6 rounded-xl border border-border bg-card p-5">
          <p className="text-sm font-bold mb-3 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-primary" />
            Subscription summary
          </p>
          <div className="space-y-0 divide-y divide-border/40">
            <div className="flex items-center justify-between py-2">
              <span className="text-xs text-muted-foreground">Plan</span>
              <span className="text-xs font-semibold">{selectedPlanData.name}</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-xs text-muted-foreground">Status</span>
              <span className={`text-xs font-bold ${isTrialing ? "text-blue-700" : isActive ? "text-emerald-700" : "text-red-700"}`}>
                {billingOverview?.status}
              </span>
            </div>
            {isTrialing && billingOverview?.trialEndsAt && (
              <div className="flex items-center justify-between py-2">
                <span className="text-xs text-muted-foreground">Trial ends</span>
                <span className={`text-xs font-semibold ${trialDaysLeft !== null && trialDaysLeft <= 3 ? "text-red-700" : trialDaysLeft !== null && trialDaysLeft <= 7 ? "text-amber-700" : ""}`}>
                  {fmtDate(billingOverview.trialEndsAt)}
                  {trialDaysLeft !== null ? ` (${trialDaysLeft}d left)` : ""}
                </span>
              </div>
            )}
            {isActive && billingOverview?.currentPeriodEndsAt && (
              <div className="flex items-center justify-between py-2">
                <span className="text-xs text-muted-foreground">Next renewal</span>
                <span className="text-xs font-semibold">
                  {fmtDate(billingOverview.currentPeriodEndsAt)}
                  {renewalDaysLeft !== null ? ` (${renewalDaysLeft}d)` : ""}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between py-2">
              <span className="text-xs text-muted-foreground">Monthly price</span>
              <span className="text-xs font-bold">£{selectedPlanData.monthlyPriceGbp}/month</span>
            </div>
            {billingOverview?.provider && (
              <div className="flex items-center justify-between py-2">
                <span className="text-xs text-muted-foreground">Provider</span>
                <span className="text-xs font-semibold capitalize">{billingOverview.provider}</span>
              </div>
            )}
          </div>
          {isTrialing && (
            <p className="mt-3 text-xs text-muted-foreground bg-secondary/50 rounded-lg px-3 py-2 border border-border">
              You can cancel before the trial ends from{" "}
              <a href="/settings/billing" className="text-primary font-semibold underline underline-offset-2">
                Plan &amp; Billing
              </a>{" "}
              to avoid any charge.
            </p>
          )}
        </div>
      )}

      {/* No billing yet */}
      {!billingOverview?.status && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800">
            Payment was not set up during onboarding. Visit{" "}
            <a href="/settings/billing" className="font-semibold underline underline-offset-2">
              Plan &amp; Billing
            </a>{" "}
            to start your trial when payment becomes available.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { href: "/enquiries",      label: "View Enquiries", desc: "Manage your pipeline" },
          { href: "/settings",       label: "Settings",       desc: "Refine your business profile" },
          { href: "/settings/billing", label: "Plan & Billing", desc: "Manage your plan and trial" },
        ].map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="p-4 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-primary/[0.02] transition-all text-center"
          >
            <p className="text-sm font-bold">{item.label}</p>
            <p className="text-xs text-muted-foreground mt-1">{item.desc}</p>
          </a>
        ))}
      </div>
    </div>
  );
}
