import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetInvoice, useUpdateInvoice, useSendInvoice, useMarkInvoicePaid,
  useGetCompany, getGetInvoiceQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import {
  ArrowLeft, Save, Send, CheckCircle2, Plus, Trash2, PoundSterling,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { InvoiceDocument, InvoiceLine } from "@/components/invoice-document";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";

// ── Utility ──────────────────────────────────────────────────────────────────

function newLine(): InvoiceLine {
  return {
    id: crypto.randomUUID(),
    description: "",
    quantity: 1,
    unit: "",
    unitPrice: 0,
    lineTotal: 0,
  };
}

function calcLineTotal(qty: number | string, price: number | string): number {
  return Math.round(Number(qty || 0) * Number(price || 0) * 100) / 100;
}

function calcTotals(lines: InvoiceLine[], simpleTotal: number, isItemised: boolean, vatRate: number) {
  const subtotal = isItemised
    ? lines.reduce((s, l) => s + Number(l.lineTotal || 0), 0)
    : simpleTotal;
  const vatAmount = Math.round(subtotal * (vatRate / 100) * 100) / 100;
  const total = Math.round((subtotal + vatAmount) * 100) / 100;
  return { subtotal, vatAmount, total };
}

const VAT_OPTS = [
  { label: "0%", value: 0 },
  { label: "5%", value: 5 },
  { label: "20%", value: 20 },
];

// ── Section card ──────────────────────────────────────────────────────────────

function SectionCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Card className="shadow-sm border-border/60 rounded-2xl bg-card">
      <div className="px-6 py-4 border-b border-border/60">
        <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">{label}</h2>
      </div>
      <CardContent className="p-6 space-y-4">{children}</CardContent>
    </Card>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: string }) {
  const cfg: Record<string, { cls: string; label: string }> = {
    draft:  { cls: "bg-gray-100 text-gray-700 border-gray-300",    label: "Draft" },
    sent:   { cls: "bg-violet-50 text-violet-700 border-violet-200", label: "Sent" },
    paid:   { cls: "bg-green-50 text-green-700 border-green-200",   label: "Paid" },
  };
  const { cls, label } = cfg[status] ?? cfg.draft;
  return (
    <span className={`px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-widest border ${cls}`}>
      {label}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function InvoiceEditor() {
  const params = useParams();
  const id = Number(params.id);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: invoice, isLoading: loadingInvoice } = useGetInvoice(id, {
    query: { queryKey: getGetInvoiceQueryKey(id) },
  });
  const { data: company } = useGetCompany();

  // ── Form state ──────────────────────────────────────────────────────────────
  const [customerDetails, setCustomerDetails] = useState("");
  const [customerEmail,   setCustomerEmail]   = useState("");
  const [projectDesc,     setProjectDesc]     = useState("");
  const [invoiceNumber,   setInvoiceNumber]   = useState("");
  const [invoiceDate,     setInvoiceDate]     = useState("");
  const [dueDate,         setDueDate]         = useState("");
  const [notes,           setNotes]           = useState("");
  const [vatRate,         setVatRate]         = useState(20);
  const [isItemised,      setIsItemised]      = useState(false);
  const [simpleTotal,     setSimpleTotal]     = useState(0);
  const [lines,           setLines]           = useState<InvoiceLine[]>([newLine()]);

  // Local save tracker
  const [dirty, setDirty] = useState(false);
  const [paidDialogOpen,  setPaidDialogOpen]  = useState(false);
  const [paidAmount,      setPaidAmount]      = useState("");

  // Initialise form from fetched invoice (once)
  const initialized = useCallback(
    (inv: typeof invoice) => {
      if (!inv) return;
      setCustomerDetails(inv.customerDetails ?? "");
      setCustomerEmail((inv as any).emailRecipient ?? "");
      setProjectDesc(inv.projectDescription ?? "");
      setInvoiceNumber((inv as any).invoiceNumber ?? "");
      setInvoiceDate((inv as any).invoiceDate ?? "");
      setDueDate((inv as any).dueDate ?? "");
      setNotes(inv.notes ?? "");
      setVatRate(Number((inv as any).vatRate ?? 20));

      const savedLines: InvoiceLine[] | null = (() => {
        if (!(inv as any).lineItems) return null;
        try { return JSON.parse((inv as any).lineItems); } catch { return null; }
      })();
      if (savedLines && savedLines.length > 0) {
        setIsItemised(true);
        setLines(savedLines);
      } else {
        setIsItemised(false);
        setSimpleTotal(inv.materialsAllowance ?? 0);
      }
      setDirty(false);
    },
    [],
  );

  const initRef = useState(false);
  useEffect(() => {
    if (invoice && !initRef[0]) {
      initialized(invoice);
      // @ts-ignore
      initRef[1](true);
    }
  }, [invoice]);

  // ── Derived totals ──────────────────────────────────────────────────────────
  const { subtotal, vatAmount, total } = calcTotals(lines, simpleTotal, isItemised, vatRate);

  // ── Mutations ───────────────────────────────────────────────────────────────
  const updateInvoice = useUpdateInvoice({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetInvoiceQueryKey(id) });
        toast({ title: "Invoice saved" });
        setDirty(false);
      },
      onError: () => toast({ title: "Failed to save", variant: "destructive" }),
    },
  });

  const sendInvoice = useSendInvoice({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetInvoiceQueryKey(id) });
        toast({ title: "Invoice sent" });
      },
      onError: () => toast({ title: "Failed to send", variant: "destructive" }),
    },
  });

  const markPaid = useMarkInvoicePaid({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetInvoiceQueryKey(id) });
        setPaidDialogOpen(false);
        toast({ title: "Invoice marked as paid ✓" });
      },
      onError: () => toast({ title: "Failed to mark paid", variant: "destructive" }),
    },
  });

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function buildBody() {
    const body: Record<string, any> = {
      customerDetails,
      customerEmail,
      projectDescription: projectDesc,
      invoiceNumber,
      invoiceDate,
      dueDate: dueDate || null,
      notes,
      vatRate,
      materialsAllowance: subtotal,
      estimatedTotal: subtotal,
      vatAmount,
      totalWithVat: total,
    };
    if (isItemised) {
      body.lineItems = JSON.stringify(lines);
    } else {
      body.lineItems = null;
    }
    return body;
  }

  function onSave() {
    updateInvoice.mutate({ id, data: buildBody() as any });
  }

  function onSend() {
    // Save first, then send
    const body = buildBody();
    updateInvoice.mutate({ id, data: body as any }, {
      onSuccess: () => {
        sendInvoice.mutate({ id });
      },
    });
  }

  function onMarkPaid() {
    const amount = Number(paidAmount);
    if (!amount || amount <= 0) {
      toast({ title: "Enter a valid amount", variant: "destructive" });
      return;
    }
    markPaid.mutate({ id, data: { amount } });
  }

  // ── Line item handlers ──────────────────────────────────────────────────────
  function updateLine(i: number, field: keyof InvoiceLine, value: string | number) {
    setLines((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      if (field === "quantity" || field === "unitPrice") {
        next[i].lineTotal = calcLineTotal(next[i].quantity, next[i].unitPrice);
      }
      return next;
    });
    setDirty(true);
  }

  function addLine() {
    setLines((p) => [...p, newLine()]);
    setDirty(true);
  }

  function removeLine(i: number) {
    setLines((p) => p.filter((_, idx) => idx !== i));
    setDirty(true);
  }

  // ── Mobile tab ──────────────────────────────────────────────────────────────
  const [mobileTab, setMobileTab] = useState<"edit" | "preview">("edit");

  // ── Loading state ───────────────────────────────────────────────────────────
  if (loadingInvoice) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <Skeleton className="h-8 w-48 rounded-xl" />
        <div className="grid xl:grid-cols-2 gap-8">
          <div className="space-y-6">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-36 w-full rounded-2xl" />)}
          </div>
          <Skeleton className="h-[700px] w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="text-center py-20">
        <p className="text-lg font-bold">Invoice not found.</p>
        <Link href="/invoices">
          <Button variant="outline" className="mt-4 font-bold rounded-xl">← Back to Invoices</Button>
        </Link>
      </div>
    );
  }

  const isPaid = invoice.status === "paid";
  const isSent = invoice.status === "sent" || isPaid;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/invoices">
          <button className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" /> Invoices
          </button>
        </Link>
        <span className="text-muted-foreground/40">/</span>
        <span className="text-sm font-bold">{invoiceNumber || `Invoice #${id}`}</span>
        <StatusChip status={invoice.status} />

        {/* Mobile tab toggle */}
        <div className="ml-auto xl:hidden flex gap-1 bg-secondary rounded-lg p-1">
          {(["edit", "preview"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setMobileTab(t)}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-bold capitalize transition-all",
                mobileTab === t ? "bg-background shadow-sm" : "text-muted-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="grid xl:grid-cols-2 gap-8">
        {/* ── LEFT: edit form ─────────────────────────────────────────────── */}
        <div className={cn("space-y-5", mobileTab === "preview" && "hidden xl:block")}>

          {/* Invoice metadata */}
          <SectionCard label="Invoice Details">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Invoice Number</label>
                <Input
                  className="h-10 font-mono font-bold"
                  value={invoiceNumber}
                  onChange={(e) => { setInvoiceNumber(e.target.value); setDirty(true); }}
                  disabled={isSent}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Invoice Date</label>
                <Input
                  type="date"
                  className="h-10 font-medium"
                  value={invoiceDate}
                  onChange={(e) => { setInvoiceDate(e.target.value); setDirty(true); }}
                  disabled={isSent}
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Due Date</label>
                <Input
                  type="date"
                  className="h-10 font-medium"
                  value={dueDate}
                  onChange={(e) => { setDueDate(e.target.value); setDirty(true); }}
                  disabled={isSent}
                />
              </div>
            </div>
          </SectionCard>

          {/* Customer */}
          <SectionCard label="Customer">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Name &amp; Address</label>
              <textarea
                className="w-full border border-border/60 rounded-xl px-3 py-2.5 text-sm font-medium min-h-[80px] resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background disabled:opacity-60 disabled:cursor-not-allowed"
                placeholder={"John Smith\n42 Oak Lane, Bristol, BS1 1AB"}
                value={customerDetails}
                onChange={(e) => { setCustomerDetails(e.target.value); setDirty(true); }}
                disabled={isSent}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Email (for sending)</label>
              <Input
                type="email"
                className="h-10 font-medium"
                placeholder="customer@email.com"
                value={customerEmail}
                onChange={(e) => { setCustomerEmail(e.target.value); setDirty(true); }}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Description / Reference</label>
              <textarea
                rows={3}
                className="w-full min-h-[88px] resize-y border border-border/60 rounded-xl px-3 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background disabled:opacity-60 disabled:cursor-not-allowed"
                placeholder="e.g. Kitchen refit — 14 Elm St"
                value={projectDesc}
                onChange={(e) => { setProjectDesc(e.target.value); setDirty(true); }}
                disabled={isSent}
              />
            </div>
          </SectionCard>

          {/* Line items / totals */}
          <SectionCard label="Charges">
            {/* Mode toggle */}
            {!isSent && (
              <div className="flex gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => { setIsItemised(false); setDirty(true); }}
                  className={cn(
                    "flex-1 py-2 rounded-xl text-xs font-bold border transition-all",
                    !isItemised
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-background text-muted-foreground border-border/60 hover:border-primary/30",
                  )}
                >
                  Simple Total
                </button>
                <button
                  type="button"
                  onClick={() => { setIsItemised(true); setDirty(true); }}
                  className={cn(
                    "flex-1 py-2 rounded-xl text-xs font-bold border transition-all",
                    isItemised
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-background text-muted-foreground border-border/60 hover:border-primary/30",
                  )}
                >
                  Line items
                </button>
              </div>
            )}

            {/* Itemised: line items table */}
            {isItemised ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground font-medium">
                  Add each job or product as a separate line with its own quantity and price.
                </p>
                <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_3.5rem_3.5rem_5.5rem_5.5rem_2rem] gap-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1">
                  <span>Job / Product</span><span className="text-center">Qty</span><span>Unit</span>
                  <span className="text-right">Unit Price</span><span className="text-right">Total</span><span />
                </div>
                {lines.map((line, i) => (
                  <div key={line.id} className="grid grid-cols-2 sm:grid-cols-[minmax(0,1fr)_3.5rem_3.5rem_5.5rem_5.5rem_2rem] gap-2 items-start min-w-0">
                    <textarea
                      rows={2}
                      className="col-span-2 sm:col-span-1 min-w-0 min-h-9 resize-y border border-border/60 rounded-lg px-2.5 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background disabled:opacity-60 disabled:cursor-not-allowed"
                      placeholder="Job or product description"
                      value={line.description}
                      onChange={(e) => updateLine(i, "description", e.target.value)}
                      disabled={isSent}
                    />
                    <div className="min-w-0">
                      <span className="sm:hidden block mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Quantity
                      </span>
                      <Input
                        type="number"
                        className="h-9 text-sm text-center"
                        value={String(line.quantity)}
                        onChange={(e) => updateLine(i, "quantity", e.target.value)}
                        disabled={isSent}
                      />
                    </div>
                    <div className="min-w-0">
                      <span className="sm:hidden block mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Unit
                      </span>
                      <Input
                        className="h-9 text-xs"
                        placeholder="each"
                        value={line.unit}
                        onChange={(e) => updateLine(i, "unit", e.target.value)}
                        disabled={isSent}
                      />
                    </div>
                    <div className="min-w-0">
                      <span className="sm:hidden block mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Unit price
                      </span>
                      <Input
                        type="number"
                        step="0.01"
                        className="h-9 text-sm text-right font-mono"
                        value={String(line.unitPrice)}
                        onChange={(e) => updateLine(i, "unitPrice", e.target.value)}
                        disabled={isSent}
                      />
                    </div>
                    <div className="min-w-0">
                      <span className="sm:hidden block mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Total
                      </span>
                      <div className="h-9 flex items-center justify-end text-sm font-semibold text-right px-2 bg-secondary/40 rounded-lg">
                        £{Number(line.lineTotal).toFixed(2)}
                      </div>
                    </div>
                    {!isSent && (
                      <button
                        onClick={() => removeLine(i)}
                        aria-label={`Remove line ${i + 1}`}
                        title={`Remove line ${i + 1}`}
                        className="h-9 w-9 flex items-center justify-center text-muted-foreground hover:text-destructive rounded-lg transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                {!isSent && (
                  <button
                    onClick={addLine}
                    className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-primary transition-colors mt-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add job or product line
                  </button>
                )}
              </div>
            ) : (
              /* Simple total */
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Total Before VAT (£)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  className="h-11 font-mono font-bold text-lg"
                  value={simpleTotal || ""}
                  onChange={(e) => { setSimpleTotal(Number(e.target.value) || 0); setDirty(true); }}
                  disabled={isSent}
                />
              </div>
            )}

            {/* VAT rate */}
            <div className="space-y-1.5 pt-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">VAT Rate</label>
              <div className="flex gap-2">
                {VAT_OPTS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={isSent}
                    onClick={() => { setVatRate(opt.value); setDirty(true); }}
                    className={cn(
                      "flex-1 py-2 rounded-xl text-xs font-bold border transition-all",
                      vatRate === opt.value
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "bg-background text-muted-foreground border-border/60 hover:border-primary/30",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Live totals */}
            <div className="bg-secondary/50 rounded-xl border border-border/40 p-4 space-y-2 mt-2">
              <div className="flex justify-between text-sm font-semibold text-muted-foreground">
                <span>Subtotal</span><span>{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold text-muted-foreground">
                <span>VAT ({vatRate}%)</span><span>{formatCurrency(vatAmount)}</span>
              </div>
              <div className="border-t border-border/60 pt-2 flex justify-between text-base font-black text-primary">
                <span>Total</span><span>{formatCurrency(total)}</span>
              </div>
            </div>
          </SectionCard>

          {/* Notes */}
          <SectionCard label="Notes">
            <textarea
              className="w-full border border-border/60 rounded-xl px-3 py-2.5 text-sm font-medium min-h-[80px] resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background"
              placeholder="Any additional notes for the customer…"
              value={notes}
              onChange={(e) => { setNotes(e.target.value); setDirty(true); }}
            />
          </SectionCard>

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              className="flex-1 font-bold rounded-xl h-12"
              onClick={onSave}
              disabled={updateInvoice.isPending || !dirty}
            >
              <Save className="w-4 h-4 mr-2" />
              {updateInvoice.isPending ? "Saving…" : dirty ? "Save" : "Saved"}
            </Button>
          </div>
        </div>

        {/* ── RIGHT: preview + actions ─────────────────────────────────────── */}
        <div className={cn("space-y-5", mobileTab === "edit" && "hidden xl:block")}>
          {/* Action buttons */}
          <div className="flex flex-wrap gap-3">
            {!isPaid && (
              <Button
                className="flex-1 font-bold rounded-xl h-12 bg-primary hover:bg-primary/90 hover-elevate"
                onClick={onSend}
                disabled={sendInvoice.isPending || updateInvoice.isPending}
              >
                <Send className="w-4 h-4 mr-2" />
                {sendInvoice.isPending ? "Sending…" : isSent ? "Resend Invoice" : "Send Invoice"}
              </Button>
            )}
            {!isPaid && (
              <Button
                variant="outline"
                className="flex-1 font-bold rounded-xl h-12 border-green-300 text-green-700 hover:bg-green-50"
                onClick={() => { setPaidAmount(String(total)); setPaidDialogOpen(true); }}
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Mark Paid
              </Button>
            )}
            {isPaid && (
              <div className="flex-1 flex items-center justify-center gap-2 h-12 bg-green-50 border border-green-200 rounded-xl text-green-700 font-bold text-sm">
                <CheckCircle2 className="w-4 h-4" /> Invoice Paid
              </div>
            )}
          </div>

          {/* Email status */}
          {(invoice as any).emailDeliveryStatus && (
            <div className={cn(
              "border rounded-xl p-3 text-xs font-bold",
              (invoice as any).emailDeliveryStatus === "sent"
                ? "bg-green-50 border-green-200 text-green-700"
                : (invoice as any).emailDeliveryStatus === "failed"
                ? "bg-red-50 border-red-200 text-red-700"
                : "bg-secondary border-border/60 text-muted-foreground",
            )}>
              {(invoice as any).emailDeliveryStatus === "sent" && `✓ Invoice email sent to ${(invoice as any).emailRecipient}`}
              {(invoice as any).emailDeliveryStatus === "failed" && `✗ Email failed: ${(invoice as any).emailError ?? "unknown error"}`}
              {(invoice as any).emailDeliveryStatus === "no_recipient" && "⚠ No customer email — add one above to send"}
              {(invoice as any).emailDeliveryStatus === "not_configured" && "⚙ Email sending not configured (RESEND_API_KEY missing)"}
            </div>
          )}

          {/* Document preview — WorkRate controls the layout; branding applies within it. */}
          {(() => {
            const snap = (invoice as any).brandingSnapshot;
            const docProps = {
              invoiceNumber: invoiceNumber || `INV-${id}`,
              invoiceDate: invoiceDate || "—",
              dueDate: dueDate || null,
              company,
              brandingSnapshot: snap,
              customerDetails,
              projectDescription: projectDesc,
              lineItems: isItemised ? lines : undefined,
              subtotal,
              vatRate,
              vatAmount,
              total,
              notes,
              status: invoice.status,
            };

            return <InvoiceDocument {...docProps} />;
          })()}
        </div>
      </div>

      {/* Mark Paid dialog */}
      <Dialog open={paidDialogOpen} onOpenChange={setPaidDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-xl font-black">Mark Invoice as Paid</DialogTitle>
            <DialogDescription>
              Record that payment has been received for this invoice.
              <span className="block mt-1 font-semibold text-foreground">
                Invoice total: {formatCurrency(total)}
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div>
              <label className="block text-sm font-bold text-muted-foreground mb-1.5">Amount Received (£)</label>
              <Input
                type="number"
                min={0}
                step={0.01}
                className="h-11 font-mono"
                placeholder={total.toFixed(2)}
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaidDialogOpen(false)} className="font-bold rounded-xl">Cancel</Button>
            <Button
              onClick={onMarkPaid}
              disabled={markPaid.isPending}
              className="font-bold rounded-xl bg-green-600 hover:bg-green-700 text-white"
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              {markPaid.isPending ? "Saving…" : "Confirm Paid"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
