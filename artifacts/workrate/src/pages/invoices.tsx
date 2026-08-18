import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListInvoices, useCreateInvoice, useListJobs,
  getListInvoicesQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { Plus, FileText, CheckCircle2, Send, Clock, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function InvoiceStatusBadge({ status }: { status: string }) {
  if (status === "paid") return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-widest border bg-green-50 text-green-700 border-green-200">
      <CheckCircle2 className="w-3 h-3" /> Paid
    </span>
  );
  if (status === "sent") return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-widest border bg-violet-50 text-violet-700 border-violet-200">
      <Send className="w-3 h-3" /> Sent
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-widest border bg-gray-50 text-gray-600 border-gray-200">
      <Clock className="w-3 h-3" /> Draft
    </span>
  );
}

function today(): string {
  return new Date().toISOString().split("T")[0];
}

function thirtyDaysFromNow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().split("T")[0];
}

export default function InvoicesPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Form state for the create dialog
  const [form, setForm] = useState({
    customerDetails: "",
    customerEmail: "",
    projectDescription: "",
    invoiceDate: today(),
    dueDate: thirtyDaysFromNow(),
    jobId: "",
  });

  const { data: invoices, isLoading } = useListInvoices({
    query: { queryKey: getListInvoicesQueryKey() },
  });

  const { data: jobs } = useListJobs();

  const createInvoice = useCreateInvoice({
    mutation: {
      onSuccess: (invoice: any) => {
        queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
        setCreateOpen(false);
        navigate(`/invoices/${invoice.id}`);
      },
      onError: () => {
        toast({ title: "Failed to create invoice", variant: "destructive" });
      },
    },
  });

  const filtered = (invoices ?? []).filter((inv: any) =>
    statusFilter === "all" || inv.status === statusFilter,
  );

  function handleCreate() {
    if (!form.customerDetails.trim()) {
      toast({ title: "Customer name is required", variant: "destructive" });
      return;
    }
    createInvoice.mutate({
      data: {
        customerDetails: form.customerDetails.trim(),
        customerEmail: form.customerEmail.trim() || undefined,
        projectDescription: form.projectDescription.trim() || undefined,
        invoiceDate: form.invoiceDate || today(),
        dueDate: form.dueDate || undefined,
        jobId: form.jobId ? Number(form.jobId) : undefined,
      } as any,
    });
  }

  const counts = {
    all: (invoices ?? []).length,
    draft: (invoices ?? []).filter((i: any) => i.status === "draft").length,
    sent: (invoices ?? []).filter((i: any) => i.status === "sent").length,
    paid: (invoices ?? []).filter((i: any) => i.status === "paid").length,
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Invoices</h1>
          <p className="text-muted-foreground font-medium mt-1">
            Send invoices for agreed work — no quote required.
          </p>
        </div>
        <Button
          className="font-bold h-11 px-5 rounded-xl hover-elevate gap-2"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="w-4 h-4" /> Create Invoice
        </Button>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 bg-secondary/50 rounded-xl p-1 w-fit">
        {(["all", "draft", "sent", "paid"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-bold transition-all capitalize",
              statusFilter === s
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            <span className="ml-1.5 text-xs font-semibold text-muted-foreground/70">
              {counts[s]}
            </span>
          </button>
        ))}
      </div>

      {/* Invoice list */}
      <Card className="shadow-sm border-border/60 rounded-2xl bg-card">
        {isLoading ? (
          <div className="p-6 space-y-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-6">
            <div className="w-16 h-16 rounded-full bg-secondary/50 flex items-center justify-center mb-4">
              <FileText className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-lg font-bold tracking-tight mb-2">
              {statusFilter === "all" ? "No invoices yet" : `No ${statusFilter} invoices`}
            </p>
            <p className="text-sm text-muted-foreground font-medium mb-6 max-w-sm">
              {statusFilter === "all"
                ? "Create your first invoice for work that's already been agreed outside WorkRate."
                : `No invoices with "${statusFilter}" status.`}
            </p>
            {statusFilter === "all" && (
              <Button
                variant="outline"
                className="font-bold rounded-xl border-primary/30 text-primary hover:bg-primary/5"
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="w-4 h-4 mr-2" /> Create Invoice
              </Button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {/* Column headers */}
            <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_10rem_8rem_8rem_7rem] gap-3 px-6 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground bg-secondary/20 rounded-t-2xl">
              <span>Customer / Description</span>
              <span>Invoice #</span>
              <span>Date</span>
              <span className="text-right">Amount</span>
              <span>Status</span>
            </div>
            {filtered.map((invoice: any) => (
              <button
                key={invoice.id}
                onClick={() => navigate(`/invoices/${invoice.id}`)}
                className="w-full text-left grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_10rem_8rem_8rem_7rem] gap-3 items-center px-6 py-4 hover:bg-secondary/30 transition-colors"
              >
                <div className="min-w-0">
                  <p className="font-bold text-sm truncate">
                    {invoice.customerDetails?.split("\n")[0] || "Unnamed customer"}
                  </p>
                  {invoice.projectDescription && (
                    <p className="text-xs text-muted-foreground font-medium truncate mt-0.5">
                      {invoice.projectDescription}
                    </p>
                  )}
                </div>
                <span className="hidden sm:block text-sm font-mono text-muted-foreground">
                  {invoice.invoiceNumber || `INV-${invoice.id}`}
                </span>
                <span className="hidden sm:block text-sm text-muted-foreground">
                  {invoice.invoiceDate || "—"}
                </span>
                <span className="hidden sm:block text-sm font-black text-right">
                  {formatCurrency(invoice.totalWithVat)}
                </span>
                <InvoiceStatusBadge status={invoice.status} />
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* Create Invoice dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-black">Create Invoice</DialogTitle>
            <DialogDescription>
              For work already agreed outside WorkRate. You'll fill in line items and amounts in the editor.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label className="block text-sm font-bold mb-1.5">Customer Name &amp; Address <span className="text-destructive">*</span></label>
              <textarea
                className="w-full border border-border/60 rounded-xl px-3 py-2.5 text-sm font-medium min-h-[72px] resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background"
                placeholder={"e.g.\nJohn Smith\n42 Oak Lane, Bristol, BS1 1AB"}
                value={form.customerDetails}
                onChange={(e) => setForm((f) => ({ ...f, customerDetails: e.target.value }))}
              />
            </div>

            <div>
              <label className="block text-sm font-bold mb-1.5">Customer Email (for sending)</label>
              <Input
                type="email"
                className="h-11 font-medium"
                placeholder="customer@email.com"
                value={form.customerEmail}
                onChange={(e) => setForm((f) => ({ ...f, customerEmail: e.target.value }))}
              />
            </div>

            <div>
              <label className="block text-sm font-bold mb-1.5">Description / Reference</label>
              <Input
                className="h-11 font-medium"
                placeholder="e.g. Kitchen refit — 14 Elm St"
                value={form.projectDescription}
                onChange={(e) => setForm((f) => ({ ...f, projectDescription: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-bold mb-1.5">Invoice Date</label>
                <Input
                  type="date"
                  className="h-11 font-medium"
                  value={form.invoiceDate}
                  onChange={(e) => setForm((f) => ({ ...f, invoiceDate: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-bold mb-1.5">Due Date</label>
                <Input
                  type="date"
                  className="h-11 font-medium"
                  value={form.dueDate}
                  onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                />
              </div>
            </div>

            {jobs && jobs.length > 0 && (
              <div>
                <label className="block text-sm font-bold mb-1.5">Link to Job (optional)</label>
                <Select
                  value={form.jobId}
                  onValueChange={(v) => setForm((f) => ({ ...f, jobId: v }))}
                >
                  <SelectTrigger className="h-11 font-medium">
                    <SelectValue placeholder="No job linked" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No job linked</SelectItem>
                    {jobs.map((j: any) => (
                      <SelectItem key={j.id} value={String(j.id)}>
                        {j.customerName} — {j.projectType || "Job"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} className="font-bold rounded-xl">
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createInvoice.isPending}
              className="font-bold rounded-xl hover-elevate"
            >
              <Plus className="w-4 h-4 mr-2" />
              {createInvoice.isPending ? "Creating…" : "Create & Edit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
