import {
  useGetQuote,
  useUpdateQuote,
  useGetEnquiry,
  useGenerateQuote,
  useGetCompany,
  getGetQuoteQueryKey,
  getGetEnquiryQueryKey,
} from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { quoteSchema } from "@/lib/schemas";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  Save,
  Sparkles,
  Send,
  Printer,
  Eye,
  Pencil,
  RefreshCw,
  Mail,
  CheckCircle2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

type QuoteFormValues = z.infer<typeof quoteSchema>;

const VAT_OPTIONS = [
  { label: "0% VAT", value: 0 },
  { label: "5% VAT", value: 5 },
  { label: "20% VAT", value: 20 },
];

// ── Main page ─────────────────────────────────────────────────────────────────
export default function QuoteEditor() {
  const params = useParams();
  const id = Number(params.id);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [vatRate, setVatRate] = useState(20);
  const [mobileTab, setMobileTab] = useState<"edit" | "preview">("edit");
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const initialized = useRef(false);

  const { data: quote, isLoading: isLoadingQuote } = useGetQuote(id, {
    query: { enabled: !!id, queryKey: getGetQuoteQueryKey(id) },
  });
  const { data: enquiry } = useGetEnquiry(id, {
    query: { enabled: !!id, queryKey: getGetEnquiryQueryKey(id) },
  });
  const { data: company } = useGetCompany();

  const updateQuote = useUpdateQuote({
    mutation: {
      onSuccess: (data) => {
        toast({ title: "Quote saved" });
        queryClient.setQueryData([`/api/enquiries/${id}/quote`], data);
      },
      onError: () => {
        toast({ title: "Failed to save quote", variant: "destructive" });
      },
    },
  });

  const regenerate = useGenerateQuote({
    mutation: {
      onSuccess: (data) => {
        toast({ title: "Quote re-generated" });
        queryClient.setQueryData([`/api/enquiries/${id}/quote`], data);
        // Infer VAT rate from returned vatAmount
        const sub = Number(data.materialsAllowance) + Number(data.labourAllowance);
        const vat = Number(data.vatAmount);
        const rate = sub > 0 ? Math.round((vat / sub) * 100) : 20;
        setVatRate([0, 5, 20].includes(rate) ? rate : 20);
        form.reset({
          customerDetails: data.customerDetails ?? "",
          projectDescription: data.projectDescription ?? "",
          materialsAllowance: Number(data.materialsAllowance),
          labourAllowance: Number(data.labourAllowance),
          vatAmount: Number(data.vatAmount),
          notes: data.notes ?? "",
          assumptions: data.assumptions ?? "",
          status: (data.status as any) ?? "draft",
        });
      },
      onError: () => {
        toast({ title: "Failed to re-generate quote", variant: "destructive" });
      },
    },
  });

  const form = useForm<QuoteFormValues>({
    resolver: zodResolver(quoteSchema),
    defaultValues: {
      customerDetails: "",
      projectDescription: "",
      materialsAllowance: 0,
      labourAllowance: 0,
      vatAmount: 0,
      notes: "",
      assumptions: "",
      status: "draft",
    },
  });

  useEffect(() => {
    if (quote && !initialized.current) {
      initialized.current = true;
      // Infer VAT rate from stored amounts
      const sub = Number(quote.materialsAllowance) + Number(quote.labourAllowance);
      const storedVat = Number(quote.vatAmount);
      const rate = sub > 0 ? Math.round((storedVat / sub) * 100) : 20;
      setVatRate([0, 5, 20].includes(rate) ? rate : 20);
      form.reset({
        customerDetails: quote.customerDetails ?? "",
        projectDescription: quote.projectDescription ?? "",
        materialsAllowance: Number(quote.materialsAllowance),
        labourAllowance: Number(quote.labourAllowance),
        vatAmount: Number(quote.vatAmount),
        notes: quote.notes ?? "",
        assumptions: quote.assumptions ?? "",
        status: (quote.status as any) ?? "draft",
      });
    }
  }, [quote, form]);

  const materials = Number(form.watch("materialsAllowance")) || 0;
  const labour = Number(form.watch("labourAllowance")) || 0;
  const subtotal = materials + labour;
  const vatAmount = Math.round(subtotal * (vatRate / 100) * 100) / 100;
  const total = subtotal + vatAmount;

  function onSave(status?: "draft" | "sent" | "accepted") {
    const values = form.getValues();
    updateQuote.mutate({
      id,
      data: {
        ...values,
        materialsAllowance: materials,
        labourAllowance: labour,
        vatAmount,
        estimatedTotal: subtotal,
        totalWithVat: total,
        ...(status ? { status } : {}),
      },
    });
  }

  function handlePrint() {
    window.print();
  }

  if (isLoadingQuote) {
    return (
      <div className="max-w-7xl mx-auto space-y-4 pb-24">
        <Skeleton className="h-16 w-full rounded-2xl" />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Skeleton className="h-[800px] rounded-2xl" />
          <Skeleton className="h-[800px] rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="p-16 text-center text-muted-foreground font-bold text-lg bg-card rounded-2xl border border-border/60 max-w-3xl mx-auto mt-12 shadow-sm">
        Quote not found.{" "}
        <Link href={`/enquiries/${id}`} className="text-primary hover:underline ml-2">
          Back to lead
        </Link>
      </div>
    );
  }

  const isSent = form.watch("status") === "sent" || form.watch("status") === "accepted";

  return (
    <div className="max-w-7xl mx-auto pb-24 space-y-6 animate-in fade-in-0 duration-300 no-print-page">
      {/* ── Toolbar ────────────────────────────────────────────────────── */}
      <div className="no-print flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-5">
        <div className="flex items-center gap-4">
          <Link
            href={`/enquiries/${id}`}
            className="text-sm font-bold text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black tracking-tight">
                Quote #ENQ-{id}
              </h1>
              <span
                className={cn(
                  "px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-widest border shadow-sm",
                  isSent
                    ? "bg-violet-50 text-violet-700 border-violet-200"
                    : "bg-gray-50 text-gray-600 border-gray-200"
                )}
              >
                {form.watch("status")}
              </span>
            </div>
            <p className="text-sm text-muted-foreground font-semibold">
              {enquiry?.customerName}
              {enquiry?.projectType ? ` — ${enquiry.projectType}` : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => regenerate.mutate({ id })}
            disabled={regenerate.isPending}
            className="font-bold border-primary/30 text-primary hover:bg-primary/5 bg-background rounded-xl h-10"
          >
            <RefreshCw className={cn("w-4 h-4 mr-2", regenerate.isPending && "animate-spin")} />
            {regenerate.isPending ? "Re-generating…" : "Re-generate"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="font-bold bg-background border-border/60 rounded-xl h-10"
          >
            <Printer className="w-4 h-4 mr-2" /> Print / PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onSave()}
            disabled={updateQuote.isPending}
            className="font-bold bg-background border-border/60 rounded-xl h-10"
          >
            <Save className="w-4 h-4 mr-2" />
            Save Draft
          </Button>
          {!isSent && (
            <Button
              size="sm"
              onClick={() => onSave("sent")}
              disabled={updateQuote.isPending}
              variant="outline"
              className="font-bold rounded-xl h-10 border-border/60"
            >
              <Send className="w-4 h-4 mr-2" /> Mark as Sent
            </Button>
          )}
          {form.watch("status") === "sent" && (
            <Button
              size="sm"
              onClick={() => onSave("accepted")}
              disabled={updateQuote.isPending || form.watch("status") === "accepted"}
              className="font-bold rounded-xl h-10 bg-green-600 hover:bg-green-700 text-white shadow-md"
            >
              <CheckCircle2 className="w-4 h-4 mr-2" /> Mark as Accepted
            </Button>
          )}
          {form.watch("status") === "accepted" && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-xl bg-green-50 border border-green-200">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <span className="text-sm font-bold text-green-700">Accepted</span>
            </div>
          )}
          <Button
            size="sm"
            onClick={() => setSendDialogOpen(true)}
            className="font-bold shadow-md hover-elevate rounded-xl h-10 bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Mail className="w-4 h-4 mr-2" /> Send to Customer
          </Button>
        </div>
      </div>

      {/* Mobile tab toggle */}
      <div className="no-print flex xl:hidden bg-secondary/80 p-1 rounded-full border border-border/40 w-fit">
        <button
          onClick={() => setMobileTab("edit")}
          className={cn(
            "flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold transition-all",
            mobileTab === "edit" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"
          )}
        >
          <Pencil className="w-3.5 h-3.5" /> Edit
        </button>
        <button
          onClick={() => setMobileTab("preview")}
          className={cn(
            "flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold transition-all",
            mobileTab === "preview" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"
          )}
        >
          <Eye className="w-3.5 h-3.5" /> Preview
        </button>
      </div>

      {/* ── Two-column layout ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-[480px_1fr] gap-6 items-start">

        {/* LEFT — Edit panel */}
        <div className={cn("space-y-5 no-print", mobileTab === "preview" && "hidden xl:block")}>
          <Form {...form}>
            <form className="space-y-5">

              {/* Customer details */}
              <SectionCard label="Customer Details">
                <FormField
                  control={form.control}
                  name="customerDetails"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Textarea
                          rows={3}
                          className="field-input resize-none font-medium"
                          placeholder={`e.g.\nJohn Smith\njohn@example.com | 07700 900000`}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </SectionCard>

              {/* Project description */}
              <SectionCard label="Project Description">
                <FormField
                  control={form.control}
                  name="projectDescription"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Textarea
                          rows={6}
                          className="field-input resize-none font-medium"
                          placeholder="Detailed description of works to be carried out…"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </SectionCard>

              {/* Financials */}
              <SectionCard label="Financial Breakdown">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="materialsAllowance"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="field-label">Materials (£)</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-muted-foreground text-sm">£</span>
                              <Input
                                type="number"
                                step="0.01"
                                min={0}
                                className="field-input pl-7 font-bold"
                                {...field}
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="labourAllowance"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="field-label">Labour (£)</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-muted-foreground text-sm">£</span>
                              <Input
                                type="number"
                                step="0.01"
                                min={0}
                                className="field-input pl-7 font-bold"
                                {...field}
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* VAT rate selector */}
                  <div>
                    <p className="field-label mb-2">VAT Rate</p>
                    <div className="flex gap-2">
                      {VAT_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setVatRate(opt.value)}
                          className={cn(
                            "flex-1 py-2 rounded-xl text-xs font-bold border transition-all",
                            vatRate === opt.value
                              ? "bg-primary text-primary-foreground border-primary shadow-sm"
                              : "bg-background text-muted-foreground border-border/60 hover:border-primary/30"
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Live totals */}
                  <div className="bg-secondary/50 rounded-xl border border-border/40 p-4 space-y-2">
                    {[
                      { label: "Materials", value: materials },
                      { label: "Labour", value: labour },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex justify-between text-sm font-semibold text-muted-foreground">
                        <span>{label}</span>
                        <span>{formatCurrency(value)}</span>
                      </div>
                    ))}
                    <div className="border-t border-border/60 pt-2 flex justify-between text-sm font-bold">
                      <span>Subtotal</span>
                      <span>{formatCurrency(subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-semibold text-muted-foreground">
                      <span>VAT ({vatRate}%)</span>
                      <span>{formatCurrency(vatAmount)}</span>
                    </div>
                    <div className="border-t border-border/60 pt-2 flex justify-between text-base font-black text-primary">
                      <span>Total inc. VAT</span>
                      <span>{formatCurrency(total)}</span>
                    </div>
                  </div>
                </div>
              </SectionCard>

              {/* Notes */}
              <SectionCard label="Notes">
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Textarea
                          rows={4}
                          className="field-input resize-none font-medium"
                          placeholder="Special requirements, timescales, payment terms…"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </SectionCard>

              {/* Assumptions */}
              <SectionCard label="Assumptions & Exclusions">
                <FormField
                  control={form.control}
                  name="assumptions"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Textarea
                          rows={4}
                          className="field-input resize-none font-medium"
                          placeholder="What is not included in this quote…"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </SectionCard>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  onClick={() => onSave()}
                  disabled={updateQuote.isPending}
                  className="flex-1 font-bold rounded-xl h-12"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {updateQuote.isPending ? "Saving…" : "Save"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => regenerate.mutate({ id })}
                  disabled={regenerate.isPending}
                  className="font-bold border-primary/30 text-primary hover:bg-primary/5 bg-background rounded-xl h-12 px-5"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  {regenerate.isPending ? "Working…" : "Re-generate"}
                </Button>
              </div>
            </form>
          </Form>
        </div>

        {/* RIGHT — PDF document preview */}
        <div className={cn(mobileTab === "edit" && "hidden xl:block")}>
          <QuoteDocument
            quoteRef={`ENQ-${id}`}
            date={quote.updatedAt ? formatDate(String(quote.updatedAt)) : formatDate(new Date().toISOString())}
            company={company}
            customerDetails={form.watch("customerDetails") ?? ""}
            projectDescription={form.watch("projectDescription") ?? ""}
            materials={materials}
            labour={labour}
            subtotal={subtotal}
            vatRate={vatRate}
            vatAmount={vatAmount}
            total={total}
            notes={form.watch("notes") ?? ""}
            assumptions={form.watch("assumptions") ?? ""}
            status={form.watch("status") ?? "draft"}
          />
        </div>
      </div>
      {/* Send to Customer dialog */}
      <SendQuoteDialog
        open={sendDialogOpen}
        onOpenChange={setSendDialogOpen}
        enquiry={enquiry}
        company={company}
        quoteRef={`ENQ-${id}`}
        customerDetails={form.watch("customerDetails") ?? ""}
        projectDescription={form.watch("projectDescription") ?? ""}
        materials={materials}
        labour={labour}
        subtotal={subtotal}
        vatRate={vatRate}
        vatAmount={vatAmount}
        total={total}
        notes={form.watch("notes") ?? ""}
        assumptions={form.watch("assumptions") ?? ""}
        isSent={isSent}
        onMarkSent={() => onSave("sent")}
      />
    </div>
  );
}

// ── Send to Customer dialog ────────────────────────────────────────────────────
interface SendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enquiry: any;
  company: any;
  quoteRef: string;
  customerDetails: string;
  projectDescription: string;
  materials: number;
  labour: number;
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  total: number;
  notes: string;
  assumptions: string;
  isSent: boolean;
  onMarkSent: () => void;
}

function SendQuoteDialog({
  open,
  onOpenChange,
  enquiry,
  company,
  quoteRef,
  customerDetails,
  projectDescription,
  materials,
  labour,
  subtotal,
  vatRate,
  vatAmount,
  total,
  notes,
  assumptions,
  isSent,
  onMarkSent,
}: SendDialogProps) {
  const { toast } = useToast();
  const [emailOverride, setEmailOverride] = useState("");
  const [sent, setSent] = useState(false);

  const customerEmail = emailOverride || enquiry?.customerEmail || "";
  const companyName = company?.name ?? "Your Trade Business";

  function buildMailtoLink() {
    const subject = encodeURIComponent(
      `Quotation #${quoteRef} from ${companyName}`
    );

    const lines: string[] = [];
    lines.push(`Dear ${enquiry?.customerName ?? "Customer"},`);
    lines.push("");
    lines.push(
      `Please find below your quotation from ${companyName}.`
    );
    lines.push("");
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`QUOTATION #${quoteRef}`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    if (projectDescription) {
      lines.push("");
      lines.push("DESCRIPTION OF WORKS");
      lines.push(projectDescription);
    }
    lines.push("");
    lines.push("COST BREAKDOWN");
    lines.push(`Materials: ${formatCurrency(materials)}`);
    lines.push(`Labour:    ${formatCurrency(labour)}`);
    lines.push(`Subtotal:  ${formatCurrency(subtotal)}`);
    lines.push(`VAT (${vatRate}%): ${formatCurrency(vatAmount)}`);
    lines.push(`─────────────────────────`);
    lines.push(`TOTAL (inc. VAT): ${formatCurrency(total)}`);
    if (notes) {
      lines.push("");
      lines.push("NOTES");
      lines.push(notes);
    }
    if (assumptions) {
      lines.push("");
      lines.push("ASSUMPTIONS & EXCLUSIONS");
      lines.push(assumptions);
    }
    lines.push("");
    lines.push("This quotation is valid for 30 days from the date of issue.");
    lines.push("All prices are in GBP.");
    lines.push("");
    lines.push(`Kind regards,`);
    lines.push(companyName);
    if (company?.phone) lines.push(company.phone);
    if (company?.email) lines.push(company.email);

    const body = encodeURIComponent(lines.join("\n"));
    return `mailto:${encodeURIComponent(customerEmail)}?subject=${subject}&body=${body}`;
  }

  function handleSend() {
    if (!customerEmail) {
      toast({ title: "No customer email address found", variant: "destructive" });
      return;
    }
    window.location.href = buildMailtoLink();
    setSent(true);
    if (!isSent) {
      onMarkSent();
    }
  }

  // Reset when dialog closes
  function handleOpenChange(val: boolean) {
    if (!val) {
      setSent(false);
      setEmailOverride("");
    }
    onOpenChange(val);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-black">Send Quote to Customer</DialogTitle>
          <DialogDescription>
            Your email app will open with the quote pre-filled. Review and send from there.
          </DialogDescription>
        </DialogHeader>

        {sent ? (
          <div className="py-6 flex flex-col items-center gap-3 text-center">
            <CheckCircle2 className="w-12 h-12 text-green-500" />
            <p className="font-bold text-lg">Email app opened!</p>
            <p className="text-sm text-muted-foreground">
              The quote has been marked as <span className="font-bold text-violet-600">Sent</span>. Review and send from your email app.
            </p>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* Quote summary */}
            <div className="bg-secondary/50 rounded-xl border border-border/40 p-4 space-y-1.5 text-sm">
              <div className="flex justify-between font-semibold text-muted-foreground">
                <span>Reference</span>
                <span className="text-foreground font-bold">#{quoteRef}</span>
              </div>
              <div className="flex justify-between font-semibold text-muted-foreground">
                <span>Total (inc. VAT)</span>
                <span className="text-primary font-black">{formatCurrency(total)}</span>
              </div>
              {enquiry?.customerName && (
                <div className="flex justify-between font-semibold text-muted-foreground">
                  <span>Customer</span>
                  <span className="text-foreground font-bold">{enquiry.customerName}</span>
                </div>
              )}
            </div>

            {/* Email field */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Send To
              </Label>
              <Input
                type="email"
                placeholder="customer@example.com"
                value={emailOverride || enquiry?.customerEmail || ""}
                onChange={(e) => setEmailOverride(e.target.value)}
                className="field-input font-medium"
              />
              {!enquiry?.customerEmail && !emailOverride && (
                <p className="text-xs text-amber-600 font-semibold">
                  No email on file — please enter one above.
                </p>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => handleOpenChange(false)} className="rounded-xl font-bold">
            {sent ? "Close" : "Cancel"}
          </Button>
          {!sent && (
            <Button
              onClick={handleSend}
              disabled={!customerEmail}
              className="rounded-xl font-bold bg-green-600 hover:bg-green-700 text-white"
            >
              <Mail className="w-4 h-4 mr-2" />
              Open Email App
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Section card helper ────────────────────────────────────────────────────────
function SectionCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border/60 rounded-2xl overflow-hidden shadow-sm">
      <div className="px-5 py-3.5 border-b border-border/60 bg-secondary/30">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{label}</p>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ── Quote document (the "PDF" preview) ─────────────────────────────────────────
interface DocProps {
  quoteRef: string;
  date: string;
  company: any;
  customerDetails: string;
  projectDescription: string;
  materials: number;
  labour: number;
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  total: number;
  notes: string;
  assumptions: string;
  status: string;
}

function QuoteDocument({
  quoteRef,
  date,
  company,
  customerDetails,
  projectDescription,
  materials,
  labour,
  subtotal,
  vatRate,
  vatAmount,
  total,
  notes,
  assumptions,
  status,
}: DocProps) {
  const isSent = status === "sent";
  const companyName = company?.name ?? "Your Trade Business";

  return (
    <div className="print-doc">
      {/* Shadow wrapper (hidden outside print) */}
      <div
        id="quote-document"
        className="bg-white text-gray-900 rounded-2xl shadow-xl border border-gray-200 overflow-hidden font-sans print:shadow-none print:rounded-none print:border-none"
        style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
      >
        {/* ── Header ───────────────────────────────────────────────── */}
        <div className="bg-[#1E293B] px-10 py-8 flex items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-[#2563EB] rounded-xl flex items-center justify-center shadow-lg">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <span className="text-2xl font-black text-white tracking-tight">{companyName}</span>
            </div>
            <div className="text-sm text-slate-400 space-y-0.5 font-medium">
              {company?.address && <p>{company.address}</p>}
              {company?.phone && <p>{company.phone}</p>}
              {company?.email && <p>{company.email}</p>}
            </div>
          </div>

          <div className="text-right shrink-0">
            <p className="text-3xl font-black text-white tracking-tight mb-3">QUOTATION</p>
            <div className="text-sm text-slate-400 space-y-1">
              <p><span className="text-slate-500 font-medium">Ref:</span> <span className="text-white font-bold">#{quoteRef}</span></p>
              <p><span className="text-slate-500 font-medium">Date:</span> <span className="text-white font-bold">{date}</span></p>
              <p><span className="text-slate-500 font-medium">Valid for:</span> <span className="text-white font-bold">30 days</span></p>
            </div>
            {isSent && (
              <div className="mt-3 inline-block px-3 py-1 bg-violet-500/20 border border-violet-400/30 rounded-full">
                <span className="text-xs font-bold text-violet-300 uppercase tracking-widest">Sent</span>
              </div>
            )}
          </div>
        </div>

        <div className="px-10 py-8 space-y-8">

          {/* ── Bill To ──────────────────────────────────────────────── */}
          {customerDetails && (
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Prepared For</p>
                <div className="text-sm font-medium text-gray-800 whitespace-pre-line leading-relaxed">
                  {customerDetails}
                </div>
              </div>
            </div>
          )}

          {/* ── Divider ──────────────────────────────────────────────── */}
          <div className="border-t border-gray-100" />

          {/* ── Description of Works ─────────────────────────────────── */}
          {projectDescription && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Description of Works</p>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{projectDescription}</p>
            </div>
          )}

          {/* ── Cost Breakdown ───────────────────────────────────────── */}
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">Cost Breakdown</p>
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-5 py-3 font-bold text-gray-600 text-xs uppercase tracking-widest">Item</th>
                    <th className="text-right px-5 py-3 font-bold text-gray-600 text-xs uppercase tracking-widest">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <CostRow label="Materials Allowance" value={materials} />
                  <CostRow label="Labour Allowance" value={labour} />
                  <tr className="border-t border-gray-200 bg-gray-50/50">
                    <td className="px-5 py-3 text-gray-600 font-semibold">Subtotal (ex. VAT)</td>
                    <td className="px-5 py-3 text-right font-bold text-gray-900">{formatCurrency(subtotal)}</td>
                  </tr>
                  <tr>
                    <td className="px-5 py-3 text-gray-600 font-semibold">VAT ({vatRate}%)</td>
                    <td className="px-5 py-3 text-right font-bold text-gray-900">{formatCurrency(vatAmount)}</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr className="bg-[#1E293B] text-white">
                    <td className="px-5 py-4 font-black text-sm uppercase tracking-wide">Total (inc. VAT)</td>
                    <td className="px-5 py-4 text-right font-black text-xl text-[#60A5FA]">{formatCurrency(total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* ── Notes ────────────────────────────────────────────────── */}
          {notes && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Notes</p>
              <div className="bg-blue-50 border border-blue-100 rounded-xl px-5 py-4">
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{notes}</p>
              </div>
            </div>
          )}

          {/* ── Assumptions ──────────────────────────────────────────── */}
          {assumptions && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Assumptions &amp; Exclusions</p>
              <div className="bg-amber-50 border border-amber-100 rounded-xl px-5 py-4">
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{assumptions}</p>
              </div>
            </div>
          )}

          {/* ── Acceptance block ─────────────────────────────────────── */}
          <div className="border-t border-gray-100 pt-8">
            <div className="grid grid-cols-2 gap-8">
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-6">Authorised by</p>
                <div className="border-b border-gray-300 mb-2 h-10" />
                <p className="text-xs text-gray-500">{companyName}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-6">Accepted by customer</p>
                <div className="border-b border-gray-300 mb-2 h-10" />
                <p className="text-xs text-gray-500">Date: _________________________</p>
              </div>
            </div>
          </div>

          {/* ── Footer ───────────────────────────────────────────────── */}
          <div className="border-t border-gray-100 pt-6 text-center space-y-1">
            <p className="text-xs text-gray-400 font-medium">
              This quotation is valid for 30 days from the date of issue. All prices are in GBP.
            </p>
            <p className="text-xs text-gray-400 font-medium">
              Thank you for the opportunity to quote for your project.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function CostRow({ label, value }: { label: string; value: number }) {
  return (
    <tr className="border-b border-gray-100">
      <td className="px-5 py-3 text-gray-700 font-medium">{label}</td>
      <td className="px-5 py-3 text-right font-semibold text-gray-900">{formatCurrency(value)}</td>
    </tr>
  );
}
