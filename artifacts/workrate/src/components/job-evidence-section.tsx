/**
 * Job Evidence Section
 * Structured cost rows (labour / materials / other-costs).
 * Always visible — can be used before or after job completion.
 * Imports all primitives/helpers from @workspace/memphis-bold per consuming-web.md.
 */
import { useState, useCallback } from "react";
import {
  useListJobEvidence,
  useCreateJobEvidence,
  useUpdateJobEvidence,
  useActionJobEvidence,
  useListMaterials,
  getListJobEvidenceQueryKey,
  getListMaterialsQueryKey,
  getGetJobEvidenceSummaryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@workspace/memphis-bold/components/ui/button";
import { Input } from "@workspace/memphis-bold/components/ui/input";
import { Label } from "@workspace/memphis-bold/components/ui/label";
import { Textarea } from "@workspace/memphis-bold/components/ui/textarea";
import { Skeleton } from "@workspace/memphis-bold/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@workspace/memphis-bold/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@workspace/memphis-bold/lib/utils";
import { formatCurrency } from "@/lib/utils";
import {
  Plus,
  Check,
  X,
  Pencil,
  HardHat,
  Package,
  Receipt,
  ChevronDown,
  ChevronUp,
  AlertCircle,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────
type EvidenceKind = "labour" | "materials" | "other-costs";

interface EvidenceRow {
  id: number;
  kind: string;
  description?: string | null;
  amount?: number | null;
  quantity?: number | null;
  unit?: string | null;
  date?: string | null;
  supplierName?: string | null;
  reference?: string | null;
  notes?: string | null;
  confirmationState?: string | null;
  sourceLabel?: string | null;
  provenance?: string | null;
  [key: string]: unknown;
}

interface EvidencePage {
  items: EvidenceRow[];
  limit: number;
  offset: number;
}

const KIND_CONFIG: Record<EvidenceKind, { label: string; icon: typeof HardHat; colour: string }> = {
  labour:        { label: "Labour",            icon: HardHat, colour: "text-primary" },
  materials:     { label: "Materials",          icon: Package, colour: "text-primary" },
  "other-costs": { label: "Other Direct Costs", icon: Receipt, colour: "text-primary" },
};

const STATE_COLOURS: Record<string, string> = {
  suggested: "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-700/30 dark:text-amber-400",
  confirmed:  "bg-secondary/40 border-border/40 text-foreground",
  ignored:    "bg-muted/30 border-border/20 text-muted-foreground opacity-60",
};

// ── Evidence Row Display ──────────────────────────────────────────────────────
function EvidenceRowCard({
  row,
  jobId,
  kind,
  onEdit,
}: {
  row: EvidenceRow;
  jobId: number;
  kind: EvidenceKind;
  onEdit: (row: EvidenceRow) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const actionEvidence = useActionJobEvidence();

  const handleAction = useCallback(
    (action: "confirm" | "ignore") => {
      actionEvidence.mutate(
        { id: jobId, kind, rowId: row.id, action },
        {
          onSuccess: () => {
            qc.invalidateQueries({ queryKey: getListJobEvidenceQueryKey(jobId, kind) });
            qc.invalidateQueries({ queryKey: getGetJobEvidenceSummaryQueryKey(jobId) });
            toast({ title: action === "confirm" ? "Row confirmed" : "Row ignored" });
          },
          onError: () => toast({ title: "Action failed", variant: "destructive" }),
        }
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [jobId, kind, row.id]
  );

  const state = row.confirmationState ?? "confirmed";
  const colourClass = STATE_COLOURS[state] ?? STATE_COLOURS.confirmed;

  return (
    <div className={cn("rounded-xl border p-3 space-y-1 transition-opacity", colourClass)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold break-words">{row.description ?? "—"}</span>
            {state === "suggested" && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-700/30 shrink-0">
                <AlertCircle className="w-3 h-3" /> Suggested
              </span>
            )}
            {state === "ignored" && (
              <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-muted border border-border/40 shrink-0">
                Ignored
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-xs font-medium text-muted-foreground">
            {row.amount != null && (
              <span className="font-bold text-foreground">{formatCurrency(Number(row.amount))}</span>
            )}
            {row.quantity != null && (
              <span>{row.quantity}{row.unit ? ` ${row.unit}` : ""}</span>
            )}
            {row.date && <span>{row.date}</span>}
            {row.supplierName && <span>{row.supplierName}</span>}
            {row.reference && <span>Ref: {row.reference}</span>}
            {row.sourceLabel && (
              <span className="text-muted-foreground/60 italic">
                via {row.sourceLabel}{row.provenance ? ` · ${row.provenance}` : ""}
              </span>
            )}
          </div>
          {row.notes && (
            <p className="text-xs text-muted-foreground mt-0.5 font-medium">{row.notes}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {state === "suggested" && (
            <>
              <Button
                variant="ghost" size="sm"
                className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-green-600"
                title="Confirm"
                disabled={actionEvidence.isPending}
                onClick={() => handleAction("confirm")}
              >
                <Check className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost" size="sm"
                className="h-7 w-7 p-0 rounded-lg text-muted-foreground"
                title="Ignore"
                disabled={actionEvidence.isPending}
                onClick={() => handleAction("ignore")}
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </>
          )}
          <Button
            variant="ghost" size="sm"
            className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-foreground"
            title="Edit"
            onClick={() => onEdit(row)}
          >
            <Pencil className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Evidence Create / Edit Dialog ─────────────────────────────────────────────
function EvidenceDialog({
  open,
  onOpenChange,
  jobId,
  kind,
  row,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: number;
  kind: EvidenceKind;
  row: EvidenceRow | null;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const createEvidence = useCreateJobEvidence();
  const updateEvidence = useUpdateJobEvidence();
  const materialParams = { limit: 100, offset: 0 };
  const { data: materialData } = useListMaterials(materialParams, {
    query: {
      enabled: kind === "materials",
      queryKey: getListMaterialsQueryKey(materialParams),
    },
  });
  const materialOptions = ((materialData as { items?: Array<Record<string, unknown>> } | undefined)?.items ?? []);

  const blank = {
    description: "",
    materialId: "",
    amount: "",
    quantity: "",
    unit: "",
    date: "",
    supplierName: "",
    reference: "",
    notes: "",
  };

  const fromRow = (r: EvidenceRow | null) => ({
    description: r?.description ?? "",
    materialId: r?.materialId != null ? String(r.materialId) : "",
    amount: r?.amount != null ? String(r.amount) : "",
    quantity: r?.quantity != null ? String(r.quantity) : "",
    unit: r?.unit ?? "",
    date: r?.date ?? "",
    supplierName: r?.supplierName ?? "",
    reference: r?.reference ?? "",
    notes: r?.notes ?? "",
  });

  const [form, setForm] = useState(() => fromRow(row));

  const isNew = !row;
  const isPending = createEvidence.isPending || updateEvidence.isPending;

  const handleOpenChange = (v: boolean) => {
    if (!v) setForm(fromRow(row));
    onOpenChange(v);
  };

  const handleSave = () => {
    const payload: Record<string, unknown> = {
      kind,
      description: form.description || null,
      notes: form.notes || null,
      supplierName: form.supplierName || null,
      reference: form.reference || null,
      unit: form.unit || null,
      date: form.date || null,
    };
    if (form.amount) payload.amount = Number(form.amount);
    if (form.quantity) payload.quantity = Number(form.quantity);
    if (kind === "materials" && form.materialId) payload.materialId = Number(form.materialId);

    if (isNew) {
      createEvidence.mutate(
        { id: jobId, kind, data: payload },
        {
          onSuccess: () => {
            toast({ title: "Row added" });
            setForm(blank);
            onSaved();
            onOpenChange(false);
          },
          onError: () => toast({ title: "Failed to add row", variant: "destructive" }),
        }
      );
    } else {
      updateEvidence.mutate(
        { id: jobId, kind, rowId: row!.id, data: payload },
        {
          onSuccess: () => {
            toast({ title: "Row updated" });
            onSaved();
            onOpenChange(false);
          },
          onError: () => toast({ title: "Failed to update row", variant: "destructive" }),
        }
      );
    }
  };

  const isLabour = kind === "labour";
  const label = KIND_CONFIG[kind].label;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* max-w-lg but never overflow 390px screens — use w-[calc(100vw-2rem)] floor */}
      <DialogContent className="w-[calc(100vw-2rem)] max-w-lg rounded-2xl overflow-y-auto max-h-[calc(100dvh-2rem)]">
        <DialogHeader>
          <DialogTitle className="font-black text-lg">
            {isNew ? `Add ${label} row` : `Edit ${label}`}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label className="field-label">Description</Label>
            <Input
              placeholder={
                isLabour ? "e.g. First fix carpentry"
                : kind === "materials" ? "e.g. Oak boards"
                : "e.g. Tool hire"
              }
              value={form.description}
              onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
              className="field-input"
            />
          </div>

          {kind === "materials" && (
            <div className="space-y-1.5">
              <Label className="field-label">
                Private catalogue item <span className="normal-case font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Select
                value={form.materialId || "none"}
                onValueChange={(value) => {
                  const selected = materialOptions.find((item) => String(item.id) === value);
                  setForm((current) => ({
                    ...current,
                    materialId: value === "none" ? "" : value,
                    description: selected?.name ? String(selected.name) : current.description,
                    unit: selected?.unit ? String(selected.unit) : current.unit,
                    supplierName: selected?.supplierName ? String(selected.supplierName) : current.supplierName,
                    reference: selected?.supplierSku ? String(selected.supplierSku) : current.reference,
                  }));
                }}
              >
                <SelectTrigger className="field-input">
                  <SelectValue placeholder="Keep as job-only material" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Keep as job-only material</SelectItem>
                  {materialOptions.map((item) => (
                    <SelectItem key={String(item.id)} value={String(item.id)}>
                      {String(item.name ?? `Material #${item.id}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Linking a catalogue item adds this confirmed unit cost to its private price history.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="field-label">Amount (£)</Label>
              <Input
                type="number" min="0" step="0.01" placeholder="0.00"
                value={form.amount}
                onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))}
                className="field-input"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="field-label">Date</Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))}
                className="field-input"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="field-label">{isLabour ? "Hours" : "Quantity"}</Label>
              <Input
                type="number" min="0" step={isLabour ? "0.5" : "any"}
                value={form.quantity}
                onChange={(e) => setForm(f => ({ ...f, quantity: e.target.value }))}
                className="field-input"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="field-label">{isLabour ? "Rate unit" : "Unit"}</Label>
              <Input
                placeholder={isLabour ? "hour / day" : "m, each, sheet"}
                value={form.unit}
                onChange={(e) => setForm(f => ({ ...f, unit: e.target.value }))}
                className="field-input"
              />
            </div>
          </div>

          {!isLabour && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="field-label">Supplier</Label>
                <Input
                  placeholder="Supplier name"
                  value={form.supplierName}
                  onChange={(e) => setForm(f => ({ ...f, supplierName: e.target.value }))}
                  className="field-input"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="field-label">Reference</Label>
                <Input
                  placeholder="Invoice / order ref"
                  value={form.reference}
                  onChange={(e) => setForm(f => ({ ...f, reference: e.target.value }))}
                  className="field-input"
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="field-label">
              Notes <span className="normal-case font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
              className="field-input resize-none"
            />
          </div>

          <div className="flex flex-wrap gap-3 pt-1 border-t border-border/40">
            <Button onClick={handleSave} disabled={isPending} className="font-bold rounded-xl h-10 px-5">
              <Check className="w-4 h-4 mr-1.5" />
              {isPending ? "Saving…" : isNew ? "Add Row" : "Save Changes"}
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending} className="font-bold rounded-xl h-10">
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Kind Panel (collapsible) ──────────────────────────────────────────────────
function KindPanel({ jobId, kind }: { jobId: number; kind: EvidenceKind }) {
  const config = KIND_CONFIG[kind];
  const Icon = config.icon;
  const [open, setOpen] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRow, setEditRow] = useState<EvidenceRow | null>(null);
  const qc = useQueryClient();

  const { data, isLoading } = useListJobEvidence(jobId, kind, undefined, {
    query: { queryKey: getListJobEvidenceQueryKey(jobId, kind) },
  });

  const items = (data as EvidencePage | undefined)?.items ?? [];
  const activeItems = items.filter((r) => r.confirmationState === "confirmed");
  const total = activeItems.reduce((sum, r) => sum + (r.amount != null ? Number(r.amount) : 0), 0);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListJobEvidenceQueryKey(jobId, kind) });
    qc.invalidateQueries({ queryKey: getGetJobEvidenceSummaryQueryKey(jobId) });
  };

  const handleOpenCreate = () => { setEditRow(null); setDialogOpen(true); };
  const handleOpenEdit = (row: EvidenceRow) => { setEditRow(row); setDialogOpen(true); };

  return (
    <div className="rounded-xl border border-border/50 overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 bg-secondary/30 hover:bg-secondary/50 transition-colors text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Icon className={cn("w-4 h-4 shrink-0", config.colour)} />
          <span className="text-sm font-bold">{config.label}</span>
          {items.length > 0 && (
            <span className="text-xs font-semibold text-muted-foreground">
              ({items.length})
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          {total > 0 && (
            <span className="text-sm font-bold text-primary">{formatCurrency(total)}</span>
          )}
          {open
            ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
            : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {open && (
        <div className="px-3 py-3 space-y-2">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-12 w-full rounded-xl" />
            </div>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground font-medium italic py-1 px-1">
              No {config.label.toLowerCase()} rows yet.
            </p>
          ) : (
            items.map((row) => (
              <EvidenceRowCard
                key={row.id}
                row={row}
                jobId={jobId}
                kind={kind}
                onEdit={handleOpenEdit}
              />
            ))
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full mt-1 rounded-xl font-semibold h-8 border-dashed text-muted-foreground hover:text-foreground"
            onClick={handleOpenCreate}
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Add {config.label} row
          </Button>
        </div>
      )}

      <EvidenceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        jobId={jobId}
        kind={kind}
        row={editRow}
        onSaved={invalidate}
      />
    </div>
  );
}

// ── Evidence Summary Banner ───────────────────────────────────────────────────
interface EvidenceSummaryData {
  readiness?: {
    state?: string;
    percentage?: number | null;
    factors?: Record<string, boolean>;
  } | null;
  actuals?: {
    labour?: number | null;
    materials?: number | null;
    otherDirectCosts?: number | null;
    total?: number | null;
  } | null;
  estimates?: {
    labour?: number | null;
    materials?: number | null;
    total?: number | null;
  } | null;
  variances?: {
    labour?: number | null;
    materials?: number | null;
    total?: number | null;
  } | null;
  outcome?: {
    finalAmount?: number | null;
    grossProfit?: number | null;
    grossMargin?: number | null;
  } | null;
}

function ReadinessBadge({ state }: { state?: string | null }) {
  if (!state) return null;
  const map: Record<string, string> = {
    ready: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-700/30",
    partially_ready: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-700/30",
    not_ready: "bg-secondary text-muted-foreground border-border/40",
  };
  const labels: Record<string, string> = { ready: "Ready", partially_ready: "Partially ready", not_ready: "Not ready" };
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border", map[state] ?? map.not_ready)}>
      {labels[state] ?? state}
    </span>
  );
}

function SummaryCell({ label, value, variance, highlight }: {
  label: string; value: string; variance?: number | null; highlight?: boolean;
}) {
  return (
    <div className={cn(
      "rounded-lg p-2.5",
      highlight ? "bg-primary/5 border border-primary/20" : "bg-background border border-border/40"
    )}>
      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-0.5 truncate">{label}</p>
      <p className={cn("text-sm font-bold", highlight && "text-primary")}>{value}</p>
      {variance != null && (
        <p className={cn("text-xs font-semibold mt-0.5", variance > 0 ? "text-destructive" : "text-green-600 dark:text-green-400")}>
          {variance > 0 ? "+" : ""}{formatCurrency(variance)} vs est.
        </p>
      )}
    </div>
  );
}

export function JobEvidenceSummaryBanner({ summary }: { summary: EvidenceSummaryData }) {
  const { actuals, variances, outcome, readiness } = summary;
  const hasActuals = actuals && (
    actuals.labour != null || actuals.materials != null ||
    actuals.otherDirectCosts != null || actuals.total != null
  );
  const hasOutcome = outcome && (outcome.grossProfit != null || outcome.grossMargin != null);
  if (!hasActuals && !hasOutcome && !readiness) return null;

  return (
    <div className="rounded-xl border border-border/50 bg-secondary/20 p-3 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Evidence Summary</span>
        <div className="flex items-center gap-2">
          <ReadinessBadge state={readiness?.state} />
          {readiness?.percentage != null && (
            <span className="text-xs font-semibold text-muted-foreground">{Math.round(readiness.percentage)}%</span>
          )}
        </div>
      </div>

      {(hasActuals || hasOutcome) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {actuals?.labour != null && (
            <SummaryCell label="Labour" value={formatCurrency(actuals.labour)} variance={variances?.labour} />
          )}
          {actuals?.materials != null && (
            <SummaryCell label="Materials" value={formatCurrency(actuals.materials)} variance={variances?.materials} />
          )}
          {actuals?.total != null && (
            <SummaryCell label="Total Cost" value={formatCurrency(actuals.total)} variance={variances?.total} />
          )}
          {outcome?.grossProfit != null && (
            <SummaryCell label="Gross Profit" value={formatCurrency(outcome.grossProfit)} highlight />
          )}
          {outcome?.grossMargin != null && (
            <SummaryCell label="Margin" value={`${Number(outcome.grossMargin).toFixed(1)}%`} highlight />
          )}
        </div>
      )}

      {readiness?.factors && Object.keys(readiness.factors).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(readiness.factors).map(([factor, complete]) => (
            <span key={factor} className={cn(
              "text-xs font-medium bg-background border rounded-md px-2 py-0.5",
              complete ? "border-green-500/30 text-foreground" : "border-border/40 text-muted-foreground"
            )}>
              {complete ? "Complete: " : "Missing: "}{factor.replace(/([A-Z])/g, " $1").toLowerCase()}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export function JobEvidenceSection({
  jobId,
  summary,
}: {
  jobId: number;
  summary?: EvidenceSummaryData | null;
}) {
  return (
    <div className="space-y-4">
      {summary && <JobEvidenceSummaryBanner summary={summary} />}
      <div className="space-y-2">
        {(["labour", "materials", "other-costs"] as EvidenceKind[]).map((kind) => (
          <KindPanel key={kind} jobId={jobId} kind={kind} />
        ))}
      </div>
    </div>
  );
}
