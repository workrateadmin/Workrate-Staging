/**
 * Internal admin: /internal/product-pricing
 *
 * Protected by WORKRATE_ADMIN_USER_IDS server allowlist.
 * 403 → neutral "Not authorized" state; catalog details never shown.
 * Never appears in customer navigation.
 *
 * Mapping validation flow:
 *  - Each card shows a mapping-validation status + timestamp.
 *  - "Validate Stripe mapping" runs the server verification via
 *    useValidateInternalBillingCatalogMapping; enabled only when the required
 *    Stripe IDs and a commercial monthly price are all present.
 *  - Saving price/mapping changes clears the server's validation timestamp
 *    (backend sets stripeMappingValidatedAt=null), so the UI visibly resets
 *    to "Validation required".
 *  - Validation success refreshes the internal catalog and, when the item is
 *    live-eligible, the public customer catalog. Failure shows a safe
 *    configuration error and never exposes connector details.
 *
 * The internal catalog endpoint returns raw DB rows including Stripe IDs;
 * customers never see any of this. We use the generated hooks from the client.
 */
import { useState, useCallback, useEffect } from "react";
import {
  useGetInternalBillingCatalog,
  useUpdateInternalBillingCatalogItem,
  useValidateInternalBillingCatalogMapping,
  useUpdateInternalReceptionistTopUpPack,
  useValidateInternalReceptionistTopUpPackMapping,
  getGetInternalBillingCatalogQueryKey,
  getGetBillingCatalogQueryKey,
  getGetReceptionistTopUpPacksQueryKey,
} from "@workspace/api-client-react";
import type {
  InternalBillingCatalog,
  InternalReceptionistTopUpPack,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  ShieldOff, ChevronDown, ChevronUp, Save, AlertCircle,
  Check, Loader2, RefreshCw, ShieldCheck, ShieldAlert,
  Phone,
} from "lucide-react";

// ─── Type helpers ─────────────────────────────────────────────────────────────

type InternalCatalogItem = InternalBillingCatalog["plans"][number];
type InternalCatalog = InternalBillingCatalog;

/**
 * The generated `InternalBillingCatalogItem` type omits the validation
 * timestamp column, but the API returns `stripeMappingValidatedAt` on both the
 * update and validate responses (and on catalog rows). Read it permissively.
 */
function readValidatedAt(item: unknown): string | null {
  const v = (item as { stripeMappingValidatedAt?: string | null } | null | undefined)
    ?.stripeMappingValidatedAt;
  return v ?? null;
}

// ─── Safe error messaging ───────────────────────────────────────────────────

/**
 * The only server error message we deliberately surface verbatim is the
 * neutral "Billing configuration required." string. Anything else may contain
 * connector/internal details, so we replace it with a safe generic message.
 */
const SAFE_CONFIG_MESSAGE = "Billing configuration required.";

function safeValidationError(err: unknown): string {
  const raw =
    (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
    (err as { message?: string })?.message ??
    "";
  if (typeof raw === "string" && raw.trim() === SAFE_CONFIG_MESSAGE) {
    return "Stripe mapping could not be verified — check the price IDs and commercial price, then try again.";
  }
  // Never echo unknown/connector error text.
  return "Validation failed. The stored mapping could not be verified. Review the configuration and try again.";
}

// ─── Computed helpers ─────────────────────────────────────────────────────────

function computeTrialPrice(item: {
  monthlyPriceGbp: string | number | null;
  trialPercentage: string | number | null;
  manualTrialPriceGbp: string | number | null;
}): number | null {
  const monthly = item.monthlyPriceGbp != null ? Number(item.monthlyPriceGbp) : null;
  if (monthly == null || isNaN(monthly)) return null;
  if (item.manualTrialPriceGbp != null && String(item.manualTrialPriceGbp) !== "") {
    const v = Number(item.manualTrialPriceGbp);
    return isNaN(v) ? null : v;
  }
  const pct = item.trialPercentage != null && String(item.trialPercentage) !== ""
    ? Number(item.trialPercentage)
    : 50;
  return Math.round((monthly * pct) / 100 * 100) / 100;
}

/** True when all the identifiers required to validate a mapping are present. */
function hasRequiredMappingInputs(item: {
  monthlyPriceGbp: string | number | null;
  stripeProductId: string | null;
  stripeRecurringPriceId: string | null;
  stripeTrialPriceId: string | null;
}): boolean {
  const priceOk =
    item.monthlyPriceGbp != null && String(item.monthlyPriceGbp).trim() !== "";
  return Boolean(
    priceOk &&
      item.stripeProductId?.trim() &&
      item.stripeRecurringPriceId?.trim() &&
      item.stripeTrialPriceId?.trim()
  );
}

type ConfigStatus = {
  ok: boolean;
  label: string;
  detail: string;
};

/** Static configuration completeness (prerequisites for validation). */
function configStatus(item: {
  active: boolean;
  comingSoon: boolean;
  monthlyPriceGbp: string | number | null;
  stripeProductId: string | null;
  stripeRecurringPriceId: string | null;
  stripeTrialPriceId: string | null;
}): ConfigStatus {
  const missingPrice =
    item.monthlyPriceGbp == null || String(item.monthlyPriceGbp).trim() === "";
  const missingStripe =
    !item.stripeProductId?.trim() ||
    !item.stripeRecurringPriceId?.trim() ||
    !item.stripeTrialPriceId?.trim();

  if (!item.active)
    return { ok: false, label: "Inactive", detail: "Set active to enable." };
  if (item.comingSoon)
    return { ok: false, label: "Coming soon", detail: "Set coming soon = false when ready." };
  if (missingPrice)
    return { ok: false, label: "No price", detail: "Set a monthly price." };
  if (missingStripe)
    return {
      ok: false,
      label: "Missing Stripe mapping",
      detail: [
        !item.stripeProductId?.trim() && "product ID",
        !item.stripeRecurringPriceId?.trim() && "recurring price ID",
        !item.stripeTrialPriceId?.trim() && "trial price ID",
      ]
        .filter(Boolean)
        .join(", "),
    };
  return { ok: true, label: "Configuration complete", detail: "Ready to validate." };
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtGbp(v: number | null): string {
  if (v == null) return "—";
  return `£${v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtTimestamp(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

// ─── Validation status pill ─────────────────────────────────────────────────

type ValidationView =
  | { kind: "validated"; at: string }
  | { kind: "required" }
  | { kind: "blocked"; detail: string };

function MappingStatusPill({ view }: { view: ValidationView }) {
  if (view.kind === "validated") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold border bg-emerald-50 text-emerald-700 border-emerald-200">
        <ShieldCheck className="w-3 h-3" />
        Mapping validated
      </span>
    );
  }
  if (view.kind === "blocked") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold border bg-amber-50 text-amber-700 border-amber-200">
        <AlertCircle className="w-3 h-3" />
        {view.detail || "Configuration incomplete"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold border bg-orange-50 text-orange-700 border-orange-200">
      <ShieldAlert className="w-3 h-3" />
      Validation required
    </span>
  );
}

// ─── Item editor ────────────────────────────────────────────────────────────

type PatchPayload = {
  description?: string | null;
  monthlyPriceGbp?: string | null;
  trialPercentage?: string;
  manualTrialPriceGbp?: string | null;
  active?: boolean;
  comingSoon?: boolean;
  sortOrder?: number;
  featureCategories?: string[];
  usageLimits?: Record<string, number> | null;
  includedAllowance?: Record<string, number> | null;
  overagePolicy?: Record<string, unknown> | null;
  stripeProductId?: string | null;
  stripeRecurringPriceId?: string | null;
  stripeTrialPriceId?: string | null;
};

const ALLOWANCE_FIELDS = {
  ai_receptionist: [{ key: "ai_receptionist_minutes", label: "Receptionist minutes / month" }],
  social_ai_meta: [{ key: "social_ai_messages", label: "Social AI messages / month" }],
  concept_visuals: [{ key: "concept_visual_generations", label: "Concept visual generations / month" }],
  complete: [
    { key: "ai_receptionist_minutes", label: "Receptionist minutes / month" },
    { key: "social_ai_messages", label: "Social AI messages / month" },
    { key: "concept_visual_generations", label: "Concept visual generations / month" },
  ],
} as const;

function ItemEditor({
  item,
  kind,
  validatedAt,
  onValidatedAtChange,
  onCatalogChanged,
}: {
  item: InternalCatalogItem;
  kind: "plan" | "add-on";
  validatedAt: string | null;
  onValidatedAtChange: (next: string | null) => void;
  onCatalogChanged: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateItem = useUpdateInternalBillingCatalogItem();
  const validateMapping = useValidateInternalBillingCatalogMapping();

  // Local form state
  const [description, setDescription] = useState(item.description ?? "");
  const [monthlyPrice, setMonthlyPrice] = useState(
    item.monthlyPriceGbp != null ? String(item.monthlyPriceGbp) : ""
  );
  const [trialPct, setTrialPct] = useState(
    item.trialPercentage != null ? String(item.trialPercentage) : "50"
  );
  const [manualTrialPrice, setManualTrialPrice] = useState(
    item.manualTrialPriceGbp != null ? String(item.manualTrialPriceGbp) : ""
  );
  const [active, setActive] = useState(item.active);
  const [comingSoon, setComingSoon] = useState(item.comingSoon);
  const [sortOrder, setSortOrder] = useState(String(item.sortOrder));
  const [featureCategories, setFeatureCategories] = useState(
    item.featureCategories.join(", ")
  );
  const [usageLimitsRaw, setUsageLimitsRaw] = useState(
    item.usageLimits ? JSON.stringify(item.usageLimits) : ""
  );
  const [includedAllowanceRaw, setIncludedAllowanceRaw] = useState(
    item.includedAllowance ? JSON.stringify(item.includedAllowance) : ""
  );
  const [overagePolicyRaw, setOveragePolicyRaw] = useState(
    item.overagePolicy ? JSON.stringify(item.overagePolicy) : ""
  );
  const [stripeProductId, setStripeProductId] = useState(item.stripeProductId ?? "");
  const [stripeRecurringPriceId, setStripeRecurringPriceId] = useState(
    item.stripeRecurringPriceId ?? ""
  );
  const [stripeTrialPriceId, setStripeTrialPriceId] = useState(
    item.stripeTrialPriceId ?? ""
  );

  const [saveState, setSaveState] = useState<"idle" | "saving" | "ok" | "error">("idle");
  const [validateError, setValidateError] = useState<string | null>(null);
  const allowanceFields = ALLOWANCE_FIELDS[item.code as keyof typeof ALLOWANCE_FIELDS] ?? [];

  const allowanceValue = (key: string) => {
    try {
      const value = JSON.parse(includedAllowanceRaw || "{}")[key];
      return typeof value === "number" ? String(value) : "";
    } catch {
      return "";
    }
  };

  const updateAllowance = (key: string, value: string) => {
    let current: Record<string, number> = {};
    try {
      const parsed = JSON.parse(includedAllowanceRaw || "{}");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) current = parsed;
    } catch {
      // Replacing malformed JSON with a field edit is more useful than retaining it.
    }
    if (value.trim() === "") delete current[key];
    else current[key] = Number(value);
    setIncludedAllowanceRaw(Object.keys(current).length ? JSON.stringify(current) : "");
  };

  // Computed trial price preview
  const computedTrial = computeTrialPrice({
    monthlyPriceGbp: monthlyPrice === "" ? null : Number(monthlyPrice),
    trialPercentage: trialPct || null,
    manualTrialPriceGbp: manualTrialPrice || null,
  });

  // Prerequisites for enabling the Validate button (based on current form state)
  const canValidate = hasRequiredMappingInputs({
    monthlyPriceGbp: monthlyPrice === "" ? null : monthlyPrice,
    stripeProductId: stripeProductId || null,
    stripeRecurringPriceId: stripeRecurringPriceId || null,
    stripeTrialPriceId: stripeTrialPriceId || null,
  });

  const config = configStatus({
    active,
    comingSoon,
    monthlyPriceGbp: monthlyPrice === "" ? null : monthlyPrice,
    stripeProductId: stripeProductId || null,
    stripeRecurringPriceId: stripeRecurringPriceId || null,
    stripeTrialPriceId: stripeTrialPriceId || null,
  });

  // Derive the validation view for the pill inside the editor.
  const validationView: ValidationView = validatedAt
    ? { kind: "validated", at: validatedAt }
    : config.ok
    ? { kind: "required" }
    : { kind: "blocked", detail: config.detail || config.label };

  function parseJsonField(raw: string): Record<string, unknown> | null {
    if (!raw.trim()) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return undefined as unknown as null; // signal invalid
    }
  }

  const handleSave = useCallback(() => {
    const ul = parseJsonField(usageLimitsRaw);
    const ia = parseJsonField(includedAllowanceRaw);
    const op = parseJsonField(overagePolicyRaw);

    if (ul === undefined) {
      toast({ title: "Invalid JSON in Usage Limits", variant: "destructive" });
      return;
    }
    if (ia === undefined) {
      toast({ title: "Invalid JSON in Included Allowance", variant: "destructive" });
      return;
    }
    if (op === undefined) {
      toast({ title: "Invalid JSON in Overage Policy", variant: "destructive" });
      return;
    }

    const patch: PatchPayload = {
      description: description.trim() || null,
      monthlyPriceGbp: monthlyPrice.trim() || null,
      trialPercentage: trialPct.trim() || undefined,
      manualTrialPriceGbp: manualTrialPrice.trim() || null,
      active,
      comingSoon,
      sortOrder: parseInt(sortOrder, 10) || 0,
      featureCategories: featureCategories
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      usageLimits: ul as Record<string, number> | null,
      includedAllowance: ia as Record<string, number> | null,
      overagePolicy: op,
      stripeProductId: stripeProductId.trim() || null,
      stripeRecurringPriceId: stripeRecurringPriceId.trim() || null,
      stripeTrialPriceId: stripeTrialPriceId.trim() || null,
    };

    setSaveState("saving");
    setValidateError(null);
    updateItem.mutate(
      { kind, code: item.code, data: patch },
      {
        onSuccess: (updated) => {
          setSaveState("ok");
          setTimeout(() => setSaveState("idle"), 2500);
          // The server clears the validation timestamp whenever a price/mapping
          // field changes. Reflect whatever the server returns (typically null),
          // so the UI visibly resets to "Validation required".
          onValidatedAtChange(readValidatedAt(updated));
          onCatalogChanged();
        },
        onError: (err: unknown) => {
          setSaveState("error");
          const msg = (err as { message?: string })?.message ?? "Save failed";
          toast({ title: `Save failed: ${msg}`, variant: "destructive" });
          setTimeout(() => setSaveState("idle"), 3000);
        },
      }
    );
  }, [
    description, monthlyPrice, trialPct, manualTrialPrice,
    active, comingSoon, sortOrder, featureCategories,
    usageLimitsRaw, includedAllowanceRaw, overagePolicyRaw,
    stripeProductId, stripeRecurringPriceId, stripeTrialPriceId,
    kind, item.code, updateItem, toast, onValidatedAtChange, onCatalogChanged,
  ]);

  const handleValidate = useCallback(() => {
    setValidateError(null);
    validateMapping.mutate(
      { kind, code: item.code },
      {
        onSuccess: (updated) => {
          const at = readValidatedAt(updated);
          onValidatedAtChange(at);
          toast({ title: "Stripe mapping validated" });
          // Refresh the internal catalog, and the public customer catalog too —
          // a newly validated mapping can flip an item to purchasable.
          queryClient.invalidateQueries({
            queryKey: getGetInternalBillingCatalogQueryKey(),
          });
          queryClient.invalidateQueries({
            queryKey: getGetBillingCatalogQueryKey(),
          });
          onCatalogChanged();
        },
        onError: (err: unknown) => {
          const safe = safeValidationError(err);
          setValidateError(safe);
          toast({ title: "Validation failed", description: safe, variant: "destructive" });
        },
      }
    );
  }, [
    kind, item.code, validateMapping, onValidatedAtChange,
    toast, queryClient, onCatalogChanged,
  ]);

  const validating = validateMapping.isPending;

  return (
    <div className="space-y-5 px-5 py-4">
      {/* Status row */}
      <div className="flex flex-wrap items-center gap-3">
        <MappingStatusPill view={validationView} />
        {validationView.kind === "validated" && (
          <span className="text-xs text-muted-foreground">
            Last validated{" "}
            <strong className="text-foreground">{fmtTimestamp(validationView.at)}</strong>
          </span>
        )}
        {validationView.kind === "blocked" && (
          <span className="text-xs text-muted-foreground">{config.detail}</span>
        )}
        {computedTrial != null && (
          <span className="text-xs text-muted-foreground">
            Computed trial:{" "}
            <strong className="text-foreground">{fmtGbp(computedTrial)}</strong>
          </span>
        )}
      </div>

      {/* ── Pricing ───────────────────────────────────────────────── */}
      <Section title="Pricing">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Monthly price (£)">
            <Input
              value={monthlyPrice}
              onChange={(e) => setMonthlyPrice(e.target.value)}
              placeholder="29.00"
              className="h-8 text-sm"
            />
          </Field>
          <Field label="Trial % of monthly">
            <Input
              value={trialPct}
              onChange={(e) => setTrialPct(e.target.value)}
              placeholder="50"
              className="h-8 text-sm"
            />
          </Field>
          <Field label="Manual trial override (£)">
            <Input
              value={manualTrialPrice}
              onChange={(e) => setManualTrialPrice(e.target.value)}
              placeholder="optional"
              className="h-8 text-sm"
            />
          </Field>
        </div>
      </Section>

      {/* ── Product config ────────────────────────────────────────── */}
      <Section title="Product">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Description">
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short description"
              className="h-8 text-sm"
            />
          </Field>
          <Field label="Feature categories (comma-separated)">
            <Input
              value={featureCategories}
              onChange={(e) => setFeatureCategories(e.target.value)}
              placeholder="AI Receptionist, Quotes"
              className="h-8 text-sm"
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
          <Field label="Sort order">
            <Input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className="h-8 text-sm"
            />
          </Field>
          <Field label="">
            <div className="flex gap-4 mt-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="rounded border-border"
                />
                Active
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={comingSoon}
                  onChange={(e) => setComingSoon(e.target.checked)}
                  className="rounded border-border"
                />
                Coming soon
              </label>
            </div>
          </Field>
        </div>
      </Section>

      {/* ── Usage limits / allowance ───────────────────────────────── */}
      <Section title="Usage limits and allowance">
        {allowanceFields.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            {allowanceFields.map((field) => (
              <Field key={field.key} label={field.label}>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={allowanceValue(field.key)}
                  onChange={(e) => updateAllowance(field.key, e.target.value)}
                  placeholder="Not set"
                  className="h-8 text-sm"
                />
              </Field>
            ))}
          </div>
        )}
        {item.code === "advanced_finance_mtd" || item.code === "cost_intelligence" ? (
          <p className="text-xs text-muted-foreground mb-3">
            This add-on is feature access only and has no artificial usage cap.
          </p>
        ) : null}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Usage limits (JSON)">
            <Input
              value={usageLimitsRaw}
              onChange={(e) => setUsageLimitsRaw(e.target.value)}
              placeholder='{"enquiries": 100}'
              className="h-8 text-sm font-mono"
            />
          </Field>
          <Field label="Included allowance (advanced JSON)">
            <Input
              value={includedAllowanceRaw}
              onChange={(e) => setIncludedAllowanceRaw(e.target.value)}
              placeholder='{"ai_calls": 50}'
              className="h-8 text-sm font-mono"
            />
          </Field>
          <Field label="Overage policy (JSON)">
            <Input
              value={overagePolicyRaw}
              onChange={(e) => setOveragePolicyRaw(e.target.value)}
              placeholder='{"ai_calls": {"pence_per_unit": 10}}'
              className="h-8 text-sm font-mono"
            />
          </Field>
        </div>
      </Section>

      {/* ── Stripe IDs ────────────────────────────────────────────── */}
      <Section title="Stripe IDs">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Product ID">
            <Input
              value={stripeProductId}
              onChange={(e) => setStripeProductId(e.target.value)}
              placeholder="prod_..."
              className="h-8 text-sm font-mono"
            />
          </Field>
          <Field label="Recurring price ID">
            <Input
              value={stripeRecurringPriceId}
              onChange={(e) => setStripeRecurringPriceId(e.target.value)}
              placeholder="price_..."
              className="h-8 text-sm font-mono"
            />
          </Field>
          <Field label="Trial price ID">
            <Input
              value={stripeTrialPriceId}
              onChange={(e) => setStripeTrialPriceId(e.target.value)}
              placeholder="price_..."
              className="h-8 text-sm font-mono"
            />
          </Field>
        </div>
      </Section>

      {/* ── Validation error (safe, no connector detail) ──────────── */}
      {validateError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 leading-relaxed">{validateError}</p>
        </div>
      )}

      {/* ── Actions ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={saveState === "saving" || validating}
          className="gap-2 font-bold"
        >
          {saveState === "saving" ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : saveState === "ok" ? (
            <Check className="w-3.5 h-3.5" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          {saveState === "saving"
            ? "Saving…"
            : saveState === "ok"
            ? "Saved"
            : "Save"}
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={handleValidate}
          disabled={!canValidate || validating || saveState === "saving"}
          className="gap-2 font-bold"
          title={
            !canValidate
              ? "Set a monthly price and all three Stripe IDs to validate."
              : undefined
          }
        >
          {validating ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <ShieldCheck className="w-3.5 h-3.5" />
          )}
          {validating ? "Validating…" : "Validate Stripe mapping"}
        </Button>

        {saveState === "error" && (
          <span className="text-xs text-destructive font-medium">Save failed</span>
        )}
        {!canValidate && (
          <span className="text-xs text-muted-foreground">
            Add a monthly price and all Stripe IDs to enable validation.
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Collapsible catalog item card ────────────────────────────────────────────

function CatalogItemCard({
  item,
  kind,
  onCatalogChanged,
}: {
  item: InternalCatalogItem;
  kind: "plan" | "add-on";
  onCatalogChanged: () => void;
}) {
  const [open, setOpen] = useState(false);

  // Track the validation timestamp locally so a Save (which clears it) or a
  // successful Validate (which sets it) is reflected immediately, independent
  // of the next catalog refetch.
  const [validatedAt, setValidatedAt] = useState<string | null>(readValidatedAt(item));
  useEffect(() => {
    setValidatedAt(readValidatedAt(item));
  }, [item]);

  const computedTrial = computeTrialPrice(item);
  const config = configStatus(item);
  const headerView: ValidationView = validatedAt
    ? { kind: "validated", at: validatedAt }
    : config.ok
    ? { kind: "required" }
    : { kind: "blocked", detail: config.label };

  return (
    <Card className="shadow-sm border-border/60 rounded-xl overflow-hidden">
      {/* Header row */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-secondary/30 transition-colors text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-sm">{item.name}</span>
            <span className="text-[10px] text-muted-foreground font-mono bg-secondary px-1.5 py-0.5 rounded">
              {item.code}
            </span>
            <MappingStatusPill view={headerView} />
            {!item.active && (
              <Badge variant="secondary" className="text-[10px]">Inactive</Badge>
            )}
            {item.comingSoon && (
              <Badge variant="secondary" className="text-[10px]">Coming soon</Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-4 mt-1.5">
            {item.monthlyPriceGbp != null ? (
              <span className="text-xs text-muted-foreground">
                Monthly: <strong className="text-foreground">
                  £{Number(item.monthlyPriceGbp).toFixed(2)}
                </strong>
              </span>
            ) : (
              <span className="text-xs text-amber-600 font-medium">No price set</span>
            )}
            {computedTrial != null && (
              <span className="text-xs text-muted-foreground">
                Trial: <strong className="text-foreground">{fmtGbp(computedTrial)}</strong>
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              Validated: <strong className="text-foreground">{fmtTimestamp(validatedAt)}</strong>
            </span>
          </div>
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {open && (
        <div className="border-t border-border/50">
          <ItemEditor
            item={item}
            kind={kind}
            validatedAt={validatedAt}
            onValidatedAtChange={setValidatedAt}
            onCatalogChanged={onCatalogChanged}
          />
        </div>
      )}
    </Card>
  );
}

// ─── Receptionist top-up packs (editable admin) ───────────────────────────────

/**
 * The only server validation error we surface verbatim is the neutral
 * "Billing configuration required." string. Anything else may leak connector
 * detail so we replace it with a safe generic.
 */
function safeTopUpValidationError(err: unknown): string {
  const raw =
    (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
    (err as { message?: string })?.message ??
    "";
  if (typeof raw === "string" && raw.trim() === "Billing configuration required.") {
    return "Stripe mapping could not be verified — check the product ID, price ID, and customer price, then try again.";
  }
  return "Validation failed. The stored mapping could not be verified. Review the configuration and try again.";
}

/**
 * Read the validated-at timestamp permissively from an InternalReceptionistTopUpPack
 * or any unknown shape returned by the API.
 */
function readTopUpValidatedAt(item: unknown): string | null {
  const v = (item as { stripeMappingValidatedAt?: string | null } | null | undefined)
    ?.stripeMappingValidatedAt;
  return v ?? null;
}

function ReceptionistPacksAdminSection({
  packs,
  isLoading,
}: {
  packs: InternalReceptionistTopUpPack[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    );
  }

  if (packs.length === 0) {
    return (
      <div className="rounded-xl border border-border/40 bg-secondary/20 p-6 text-center">
        <Phone className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm font-semibold text-muted-foreground">No top-up packs found.</p>
        <p className="text-xs text-muted-foreground mt-1">Packs are added server-side.</p>
      </div>
    );
  }

  const sortedPacks = [...packs].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="space-y-3">
      {sortedPacks.map((pack) => (
        <TopUpPackEditorCard key={pack.code} pack={pack} />
      ))}
    </div>
  );
}

// ─── Editable top-up pack card ────────────────────────────────────────────────

function TopUpPackEditorCard({ pack }: { pack: InternalReceptionistTopUpPack }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updatePack = useUpdateInternalReceptionistTopUpPack();
  const validateMapping = useValidateInternalReceptionistTopUpPackMapping();

  const [open, setOpen] = useState(false);

  // ── Local form state — initialised from InternalReceptionistTopUpPack which
  //    already carries stripeProductId, stripePriceId, and stripeMappingValidatedAt
  //    from the internal catalog endpoint. No need to wait for a save round-trip.
  const [customerPrice, setCustomerPrice] = useState(
    pack.customerPriceGbp != null ? String(pack.customerPriceGbp) : ""
  );
  const [active, setActive] = useState(pack.active);
  const [sortOrder, setSortOrder] = useState(String(pack.sortOrder));
  // expiryPolicy: only "period_end" is defined in the update enum
  const [expiryPolicy] = useState<"period_end">("period_end");
  const [stripeProductId, setStripeProductId] = useState(pack.stripeProductId ?? "");
  const [stripePriceId, setStripePriceId] = useState(pack.stripePriceId ?? "");

  // Validation timestamp — initialised from catalog row, then updated locally
  // on save/validate so the UI reflects changes immediately without a refetch.
  const [validatedAt, setValidatedAt] = useState<string | null>(
    pack.stripeMappingValidatedAt ?? null
  );

  // After a successful save/validate we receive the updated InternalReceptionistTopUpPack
  // which carries all Stripe fields. Apply it so the form stays in sync.
  const applyServerResponse = useCallback((updated: InternalReceptionistTopUpPack) => {
    setCustomerPrice(updated.customerPriceGbp != null ? String(updated.customerPriceGbp) : "");
    setActive(updated.active);
    setSortOrder(String(updated.sortOrder));
    setStripeProductId(updated.stripeProductId ?? "");
    setStripePriceId(updated.stripePriceId ?? "");
    setValidatedAt(readTopUpValidatedAt(updated));
  }, []);

  // ── Save state ────────────────────────────────────────────────────────────
  const [saveState, setSaveState] = useState<"idle" | "saving" | "ok" | "error">("idle");
  const [validateError, setValidateError] = useState<string | null>(null);

  // ── Derived flags ─────────────────────────────────────────────────────────
  const priceSet = customerPrice.trim() !== "";
  const canValidate =
    priceSet &&
    stripeProductId.trim() !== "" &&
    stripePriceId.trim() !== "";

  // Header validation view
  const headerValidationView: ValidationView = validatedAt
    ? { kind: "validated", at: validatedAt }
    : canValidate
    ? { kind: "required" }
    : { kind: "blocked", detail: !priceSet ? "No price" : "Missing Stripe IDs" };

  const handleSave = useCallback(() => {
    const priceVal = customerPrice.trim() === "" ? null : Number(customerPrice.trim());
    const sortVal = parseInt(sortOrder, 10);

    setSaveState("saving");
    setValidateError(null);

    updatePack.mutate(
      {
        code: pack.code,
        data: {
          customerPriceGbp: priceVal,
          active,
          sortOrder: isNaN(sortVal) ? 0 : sortVal,
          expiryPolicy,
          stripeProductId: stripeProductId.trim() || null,
          stripePriceId: stripePriceId.trim() || null,
        },
      },
      {
        onSuccess: (updated) => {
          setSaveState("ok");
          setTimeout(() => setSaveState("idle"), 2500);
          // Server clears stripeMappingValidatedAt whenever price/IDs change.
          applyServerResponse(updated);
          // Reload internal catalog so the list reflects updated data after save.
          queryClient.invalidateQueries({ queryKey: getGetInternalBillingCatalogQueryKey() });
          // Invalidate public customer pack list so purchasable/price changes propagate.
          queryClient.invalidateQueries({ queryKey: getGetReceptionistTopUpPacksQueryKey() });
        },
        onError: (err: unknown) => {
          setSaveState("error");
          setTimeout(() => setSaveState("idle"), 3000);
          const msg = (err as { message?: string })?.message ?? "Save failed";
          toast({ title: `Save failed: ${msg}`, variant: "destructive" });
        },
      }
    );
  }, [
    customerPrice, active, sortOrder, expiryPolicy,
    stripeProductId, stripePriceId,
    pack.code, updatePack, applyServerResponse, queryClient, toast,
  ]);

  const handleValidate = useCallback(() => {
    setValidateError(null);
    validateMapping.mutate(
      { code: pack.code },
      {
        onSuccess: (updated) => {
          applyServerResponse(updated);
          toast({ title: "Stripe mapping validated" });
          // Reload internal catalog for consistency, then public list for purchasable state.
          queryClient.invalidateQueries({ queryKey: getGetInternalBillingCatalogQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetReceptionistTopUpPacksQueryKey() });
        },
        onError: (err: unknown) => {
          const safe = safeTopUpValidationError(err);
          setValidateError(safe);
          toast({ title: "Validation failed", description: safe, variant: "destructive" });
        },
      }
    );
  }, [pack.code, validateMapping, applyServerResponse, queryClient, toast]);

  const validating = validateMapping.isPending;
  const saving = saveState === "saving";

  return (
    <Card className="shadow-sm border-border/60 rounded-xl overflow-hidden">
      {/* ── Collapsible header ──────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-secondary/30 transition-colors text-left"
      >
        <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-sm">{pack.name}</span>
            <span className="text-[10px] text-muted-foreground font-mono bg-secondary px-1.5 py-0.5 rounded">
              {pack.code}
            </span>
            <MappingStatusPill view={headerValidationView} />
            {!active && (
              <Badge variant="secondary" className="text-[10px]">Inactive</Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-4 mt-1.5">
            <span className="text-xs text-muted-foreground">
              Minutes: <strong className="text-foreground">{pack.minutes.toLocaleString()}</strong>
            </span>
            {priceSet ? (
              <span className="text-xs text-muted-foreground">
                Price: <strong className="text-foreground">
                  £{Number(customerPrice).toFixed(2)}
                </strong>
              </span>
            ) : (
              <span className="text-xs text-amber-600 font-medium">Price not set</span>
            )}
            {validatedAt && (
              <span className="text-xs text-muted-foreground">
                Validated: <strong className="text-foreground">{fmtTimestamp(validatedAt)}</strong>
              </span>
            )}
          </div>
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {/* ── Editor body ─────────────────────────────────────────────────── */}
      {open && (
        <div className="border-t border-border/50 space-y-5 px-5 py-4">

          {/* Validation status row */}
          <div className="flex flex-wrap items-center gap-3">
            <MappingStatusPill view={headerValidationView} />
            {headerValidationView.kind === "validated" && (
              <span className="text-xs text-muted-foreground">
                Last validated{" "}
                <strong className="text-foreground">{fmtTimestamp(validatedAt)}</strong>
              </span>
            )}
            {headerValidationView.kind === "blocked" && (
              <span className="text-xs text-muted-foreground">
                {!priceSet ? "Set a customer price." : "Set both Stripe IDs to enable validation."}
              </span>
            )}
          </div>

          {/* ── Pricing ───────────────────────────────────────────────── */}
          <PackSection title="Pricing">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <PackField label="Customer price (£)">
                <Input
                  value={customerPrice}
                  onChange={(e) => setCustomerPrice(e.target.value)}
                  placeholder="e.g. 9.99"
                  className="h-8 text-sm"
                />
              </PackField>
              <PackField label="Minutes (read-only)">
                <Input
                  value={pack.minutes.toLocaleString()}
                  readOnly
                  className="h-8 text-sm bg-secondary/40 cursor-default"
                />
              </PackField>
              <PackField label="Currency (read-only)">
                <Input
                  value={pack.currency.toUpperCase()}
                  readOnly
                  className="h-8 text-sm bg-secondary/40 cursor-default"
                />
              </PackField>
            </div>
          </PackSection>

          {/* ── Configuration ─────────────────────────────────────────── */}
          <PackSection title="Configuration">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <PackField label="Sort order">
                <Input
                  type="number"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                  className="h-8 text-sm"
                />
              </PackField>
              <PackField label="Expiry policy (read-only)">
                <Input
                  value={expiryPolicy}
                  readOnly
                  className="h-8 text-sm font-mono bg-secondary/40 cursor-default"
                />
              </PackField>
              <PackField label="">
                <div className="flex items-center gap-3 mt-1">
                  <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={(e) => setActive(e.target.checked)}
                      className="rounded border-border"
                    />
                    Active
                  </label>
                </div>
              </PackField>
            </div>
          </PackSection>

          {/* ── Stripe IDs ────────────────────────────────────────────── */}
          <PackSection title="Stripe IDs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <PackField label="Product ID">
                <Input
                  value={stripeProductId}
                  onChange={(e) => setStripeProductId(e.target.value)}
                  placeholder="prod_..."
                  className="h-8 text-sm font-mono"
                />
              </PackField>
              <PackField label="One-time price ID">
                <Input
                  value={stripePriceId}
                  onChange={(e) => setStripePriceId(e.target.value)}
                  placeholder="price_..."
                  className="h-8 text-sm font-mono"
                />
              </PackField>
            </div>
          </PackSection>

          {/* ── Validate error (safe, no connector detail) ─────────────── */}
          {validateError && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 leading-relaxed">{validateError}</p>
            </div>
          )}

          {/* ── Actions ───────────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || validating}
              className="gap-2 font-bold"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : saveState === "ok" ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              {saving ? "Saving…" : saveState === "ok" ? "Saved" : "Save"}
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={handleValidate}
              disabled={!canValidate || validating || saving}
              className="gap-2 font-bold"
              title={
                !canValidate
                  ? "Set a customer price and both Stripe IDs to enable validation."
                  : undefined
              }
            >
              {validating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ShieldCheck className="w-3.5 h-3.5" />
              )}
              {validating ? "Validating…" : "Validate Stripe mapping"}
            </Button>

            {saveState === "error" && (
              <span className="text-xs text-destructive font-medium">Save failed</span>
            )}
            {!canValidate && (
              <span className="text-xs text-muted-foreground">
                {!priceSet
                  ? "Set a customer price to enable validation."
                  : "Add both Stripe IDs to enable validation."}
              </span>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── Pack section / field layout helpers ──────────────────────────────────────

function PackSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">{title}</p>
      {children}
    </div>
  );
}

function PackField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      {label && (
        <label className="block text-xs font-semibold text-foreground mb-1">{label}</label>
      )}
      {children}
    </div>
  );
}

// ─── Section / Field helpers ──────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">{title}</p>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      {label && (
        <label className="block text-xs font-semibold text-foreground mb-1">{label}</label>
      )}
      {children}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function InternalProductPricingPage() {
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useGetInternalBillingCatalog({
    query: {
      queryKey: getGetInternalBillingCatalogQueryKey(),
      retry: false,
    },
  });

  // The generated hook types the response as `void` because the OpenAPI spec
  // did not include a 200 response body schema. We cast to our known shape.
  const catalog = data as unknown as InternalCatalog | undefined;

  const is403 =
    isError &&
    ((error as { status?: number })?.status === 403 ||
      (error as { response?: { status?: number } })?.response?.status === 403);

  const handleCatalogChanged = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: getGetInternalBillingCatalogQueryKey(),
    });
  }, [queryClient]);

  // ── Loading ───────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-10 space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  // ── 403 ───────────────────────────────────────────────────────────────────

  if (is403) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-6">
          <ShieldOff className="w-7 h-7 text-muted-foreground" />
        </div>
        <h1 className="text-2xl font-black tracking-tight mb-3">Not authorized</h1>
        <p className="text-muted-foreground text-sm leading-relaxed max-w-sm mx-auto">
          This page is restricted to billing administrators. If you believe this is an error, contact support.
        </p>
      </div>
    );
  }

  // ── Other error ───────────────────────────────────────────────────────────

  if (isError) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <AlertCircle className="w-10 h-10 text-destructive mx-auto mb-4" />
        <h1 className="text-xl font-black mb-2">Failed to load catalog</h1>
        <p className="text-muted-foreground text-sm mb-4">
          {(error as { message?: string })?.message ?? "An unexpected error occurred."}
        </p>
        <Button onClick={() => refetch()} variant="outline" className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Retry
        </Button>
      </div>
    );
  }

  const plans = catalog?.plans ?? [];
  const addOns = catalog?.addOns ?? [];
  const receptionistTopUpPacks: InternalReceptionistTopUpPack[] = catalog?.receptionistTopUpPacks ?? [];

  return (
    <div className="max-w-4xl mx-auto px-4 pb-24 animate-in fade-in-0 duration-500">
      {/* Page header */}
      <div className="py-8 border-b border-border/60 mb-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight mb-1">Product Pricing</h1>
            <p className="text-muted-foreground text-sm font-medium">
              Internal admin — edit plans and add-ons, then validate Stripe mappings before they go live.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-2 shrink-0"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Plans */}
      <section className="mb-10">
        <h2 className="text-base font-black uppercase tracking-wide text-muted-foreground mb-4">
          Plans
        </h2>
        {plans.length === 0 ? (
          <p className="text-sm text-muted-foreground">No plans found.</p>
        ) : (
          <div className="space-y-3">
            {plans.map((plan) => (
              <CatalogItemCard
                key={plan.code}
                item={plan}
                kind="plan"
                onCatalogChanged={handleCatalogChanged}
              />
            ))}
          </div>
        )}
      </section>

      {/* Add-ons */}
      <section className="mb-10">
        <h2 className="text-base font-black uppercase tracking-wide text-muted-foreground mb-4">
          Add-ons
        </h2>
        {addOns.length === 0 ? (
          <p className="text-sm text-muted-foreground">No add-ons found.</p>
        ) : (
          <div className="space-y-3">
            {addOns.map((addon) => (
              <CatalogItemCard
                key={addon.code}
                item={addon}
                kind="add-on"
                onCatalogChanged={handleCatalogChanged}
              />
            ))}
          </div>
        )}
      </section>

      {/* AI Receptionist Top-up Packs */}
      <section>
        <div className="mb-4">
          <h2 className="text-base font-black uppercase tracking-wide text-muted-foreground">
            AI Receptionist Top-up Packs
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Edit pack prices, Stripe IDs, and configuration. Validate the Stripe mapping to make a pack purchasable by customers.
          </p>
        </div>
        <ReceptionistPacksAdminSection
          packs={receptionistTopUpPacks}
          isLoading={isLoading}
        />
      </section>
    </div>
  );
}
