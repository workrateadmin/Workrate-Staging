/**
 * Job Finance Allocations
 * Links finance receipts/expenses (partial amounts) to this job.
 * Imports all primitives/helpers from @workspace/memphis-bold per consuming-web.md.
 */
import { useState } from "react";
import {
  useListJobFinanceAllocations,
  useCreateJobFinanceAllocation,
  useDeleteJobFinanceAllocation,
  getListJobFinanceAllocationsQueryKey,
  getGetJobEvidenceSummaryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@workspace/memphis-bold/components/ui/button";
import { Input } from "@workspace/memphis-bold/components/ui/input";
import { Label } from "@workspace/memphis-bold/components/ui/label";
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
import { Plus, Trash2, ExternalLink, Check, Link2 } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface FinanceAlloc {
  id: number;
  receiptId?: number | null;
  expenseId?: number | null;
  allocatedAmount: number;
  allocatedQuantity?: number | null;
  unit?: string | null;
  notes?: string | null;
  receiptLineReference?: string | null;
  confirmationState?: string | null;
  receiptLabel?: string | null;
  expenseLabel?: string | null;
  receiptUrl?: string | null;
  [key: string]: unknown;
}

// ── Allocation Row ─────────────────────────────────────────────────────────────
function AllocationRow({
  alloc,
  onDelete,
}: {
  alloc: FinanceAlloc;
  jobId: number;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const label = alloc.receiptLabel ?? alloc.expenseLabel ?? `Allocation #${alloc.id}`;
  const url = alloc.receiptUrl as string | null | undefined;

  return (
    <div className="flex items-start justify-between gap-2 p-3 rounded-xl border border-border/40 bg-secondary/30">
      <div className="flex-1 min-w-0 overflow-hidden">
        <div className="flex items-center gap-2 flex-wrap">
          <Link2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="text-sm font-semibold truncate">{label}</span>
          {alloc.receiptId && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-muted border border-border/40 font-semibold text-muted-foreground shrink-0">
              Receipt
            </span>
          )}
          {alloc.expenseId && !alloc.receiptId && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-muted border border-border/40 font-semibold text-muted-foreground shrink-0">
              Expense
            </span>
          )}
        </div>
        <div className="flex items-center gap-x-3 gap-y-0.5 flex-wrap mt-0.5 text-xs font-medium text-muted-foreground">
          <span className="font-bold text-foreground">{formatCurrency(Number(alloc.allocatedAmount))}</span>
          {alloc.allocatedQuantity != null && (
            <span>{alloc.allocatedQuantity}{alloc.unit ? ` ${alloc.unit}` : ""}</span>
          )}
          {alloc.receiptLineReference && <span>Line: {alloc.receiptLineReference}</span>}
          {alloc.notes && <span className="italic">{alloc.notes}</span>}
          {alloc.confirmationState === "suggested" && (
            <span className="text-amber-600 dark:text-amber-400 font-semibold">Suggested — confirm or remove</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-lg">
              <ExternalLink className="w-3.5 h-3.5" />
            </Button>
          </a>
        )}
        {confirming ? (
          <div className="flex items-center gap-1">
            <Button size="sm" variant="destructive" className="h-6 px-2 text-xs rounded-lg" onClick={onDelete}>
              Remove
            </Button>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs rounded-lg" onClick={() => setConfirming(false)}>
              Keep
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost" size="sm"
            className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-destructive"
            onClick={() => setConfirming(true)}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Create Allocation Dialog ──────────────────────────────────────────────────
function CreateAllocationDialog({
  open,
  onOpenChange,
  jobId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: number;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const createAlloc = useCreateJobFinanceAllocation();

  const blankForm = {
    linkType: "receipt" as "receipt" | "expense",
    linkId: "",
    allocatedAmount: "",
    allocatedQuantity: "",
    unit: "",
    receiptLineReference: "",
    notes: "",
  };

  const [form, setForm] = useState(blankForm);

  const handleSave = () => {
    const linkId = Number(form.linkId);
    if (!linkId || !form.allocatedAmount) {
      toast({ title: "Please fill in the ID and allocated amount", variant: "destructive" });
      return;
    }
    const payload: Record<string, unknown> = {
      allocatedAmount: Number(form.allocatedAmount),
    };
    if (form.linkType === "receipt") payload.receiptId = linkId;
    else payload.expenseId = linkId;
    if (form.allocatedQuantity) payload.allocatedQuantity = Number(form.allocatedQuantity);
    if (form.unit) payload.unit = form.unit;
    if (form.receiptLineReference) payload.receiptLineReference = form.receiptLineReference;
    if (form.notes) payload.notes = form.notes;

    createAlloc.mutate(
      { id: jobId, data: payload as any },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListJobFinanceAllocationsQueryKey(jobId) });
          qc.invalidateQueries({ queryKey: getGetJobEvidenceSummaryQueryKey(jobId) });
          toast({ title: "Allocation linked" });
          setForm(blankForm);
          onOpenChange(false);
        },
        onError: () => toast({ title: "Failed to link allocation", variant: "destructive" }),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md rounded-2xl overflow-y-auto max-h-[calc(100dvh-2rem)]">
        <DialogHeader>
          <DialogTitle className="font-black text-lg">Link Finance Record</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-1">
          Attach part of a receipt or expense — the finance record may cover multiple jobs.
          Enter only the amount and quantity allocated to this job.
        </p>
        <div className="space-y-4 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="field-label">Type</Label>
              <select
                value={form.linkType}
                onChange={(e) => setForm(f => ({ ...f, linkType: e.target.value as "receipt" | "expense" }))}
                className={cn(
                  "flex h-10 w-full rounded-xl border border-border/60 bg-background px-3 py-1",
                  "text-sm font-medium ring-offset-background",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                )}
              >
                <option value="receipt">Receipt</option>
                <option value="expense">Expense</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="field-label">{form.linkType === "receipt" ? "Receipt ID" : "Expense ID"}</Label>
              <Input
                type="number" min="1" placeholder="ID number"
                value={form.linkId}
                onChange={(e) => setForm(f => ({ ...f, linkId: e.target.value }))}
                className="field-input"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="field-label">
              Allocated Amount (£) <span className="normal-case font-normal text-muted-foreground">— portion for this job</span>
            </Label>
            <Input
              type="number" min="0" step="0.01" placeholder="0.00"
              value={form.allocatedAmount}
              onChange={(e) => setForm(f => ({ ...f, allocatedAmount: e.target.value }))}
              className="field-input"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="field-label">Quantity <span className="normal-case font-normal text-muted-foreground">(optional)</span></Label>
              <Input
                type="number" min="0" step="any"
                value={form.allocatedQuantity}
                onChange={(e) => setForm(f => ({ ...f, allocatedQuantity: e.target.value }))}
                className="field-input"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="field-label">Unit <span className="normal-case font-normal text-muted-foreground">(optional)</span></Label>
              <Input
                placeholder="m, sheet, each…"
                value={form.unit}
                onChange={(e) => setForm(f => ({ ...f, unit: e.target.value }))}
                className="field-input"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="field-label">Line Reference <span className="normal-case font-normal text-muted-foreground">(optional)</span></Label>
            <Input
              placeholder="Invoice line, order ref…"
              value={form.receiptLineReference}
              onChange={(e) => setForm(f => ({ ...f, receiptLineReference: e.target.value }))}
              className="field-input"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="field-label">Notes <span className="normal-case font-normal text-muted-foreground">(optional)</span></Label>
            <Input
              placeholder="Why this amount is allocated here"
              value={form.notes}
              onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
              className="field-input"
            />
          </div>

          <div className="flex flex-wrap gap-3 pt-1 border-t border-border/40">
            <Button onClick={handleSave} disabled={createAlloc.isPending} className="font-bold rounded-xl h-10 px-5">
              <Check className="w-4 h-4 mr-1.5" />
              {createAlloc.isPending ? "Linking…" : "Link Record"}
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={createAlloc.isPending} className="font-bold rounded-xl h-10">
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export function JobFinanceAllocations({ jobId }: { jobId: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const deleteAlloc = useDeleteJobFinanceAllocation();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: allocations, isLoading } = useListJobFinanceAllocations(jobId, {
    query: { queryKey: getListJobFinanceAllocationsQueryKey(jobId) },
  });

  const items: FinanceAlloc[] = (Array.isArray(allocations) ? allocations : []) as FinanceAlloc[];
  const total = items.reduce((sum, a) => sum + Number(a.allocatedAmount), 0);

  const handleDelete = (allocationId: number) => {
    deleteAlloc.mutate(
      { id: jobId, allocationId },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListJobFinanceAllocationsQueryKey(jobId) });
          qc.invalidateQueries({ queryKey: getGetJobEvidenceSummaryQueryKey(jobId) });
          toast({ title: "Allocation removed" });
        },
        onError: () => toast({ title: "Failed to remove", variant: "destructive" }),
      }
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Linked Finance Records</span>
          {total > 0 && (
            <span className="text-xs font-bold text-primary">{formatCurrency(total)}</span>
          )}
        </div>
        <Button
          variant="ghost" size="sm"
          className="h-7 px-3 rounded-lg text-xs font-semibold"
          onClick={() => setDialogOpen(true)}
        >
          <Plus className="w-3.5 h-3.5 mr-1" /> Link record
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-14 w-full rounded-xl" />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground font-medium italic">
          No receipts or expenses linked.{" "}
          <button
            type="button"
            className="text-primary font-semibold hover:underline"
            onClick={() => setDialogOpen(true)}
          >
            Link one
          </button>
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((a) => (
            <AllocationRow
              key={a.id}
              alloc={a}
              jobId={jobId}
              onDelete={() => handleDelete(a.id)}
            />
          ))}
        </div>
      )}

      <CreateAllocationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        jobId={jobId}
      />
    </div>
  );
}
