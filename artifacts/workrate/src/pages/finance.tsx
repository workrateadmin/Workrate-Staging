import { useEffect, useMemo, useState } from "react";
import { useListJobs } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import {
  AlertTriangle, ArrowDownLeft, ArrowUpRight, CheckCircle2, FileSearch,
  FileUp, Plus, ReceiptText, ShieldCheck, WalletCards, Building2,
  CalendarClock, Link2, RefreshCw, Unplug,
} from "lucide-react";

type FinanceExpense = {
  id: number;
  jobId?: number | null;
  transactionDate?: string | null;
  supplierName?: string | null;
  description?: string | null;
  category?: string | null;
  grossAmount?: number | null;
  netAmount?: number | null;
  vatAmount?: number | null;
  paymentMethod?: string | null;
  source: string;
  reviewStatus: string;
  notes?: string | null;
};

type FinanceReceipt = {
  id: number;
  expenseId: number;
  originalName: string;
  extractionStatus: string;
  extractedData?: { suggestion?: Record<string, unknown> } | null;
  fileUrl?: string;
};

type HmrcBusiness = {
  typeOfBusiness?: string;
  businessId?: string;
  tradingType?: string;
  tradingName?: string;
};

type HmrcObligation = {
  periodStartDate?: string;
  periodEndDate?: string;
  dueDate?: string;
  status?: string;
  receivedDate?: string;
};

type HmrcStatus = {
  status: "not_connected" | "connected" | "error" | "disconnected";
  sandboxConfigured: boolean;
  configurationMessage: string | null;
  scopes: string[];
  connectedAt: string | null;
  disconnectedAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastError: string | null;
  businesses: HmrcBusiness[];
  obligations: Array<{
    typeOfBusiness?: string;
    businessId?: string;
    obligationDetails?: HmrcObligation[];
  }>;
};

const emptyExpense = {
  transactionDate: new Date().toISOString().slice(0, 10),
  supplierName: "",
  description: "",
  category: "",
  grossAmount: "",
  netAmount: "",
  vatAmount: "",
  paymentMethod: "",
  jobId: "",
  notes: "",
};

const hmrcDeviceStorageKey = "workrate.hmrc.device-id";

function hmrcBrowserContext() {
  let deviceId = window.localStorage.getItem(hmrcDeviceStorageKey);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    window.localStorage.setItem(hmrcDeviceStorageKey, deviceId);
  }
  const offsetMinutes = -new Date().getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteMinutes = Math.abs(offsetMinutes);
  const timezone = `UTC${sign}${String(Math.floor(absoluteMinutes / 60)).padStart(2, "0")}:${String(absoluteMinutes % 60).padStart(2, "0")}`;
  return {
    browserUserAgent: navigator.userAgent,
    deviceId,
    timezone,
    screens: [{
      width: window.screen.width,
      height: window.screen.height,
      colourDepth: window.screen.colorDepth,
      scalingFactor: window.devicePixelRatio || 1,
    }],
    windowSize: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
  };
}

function obligationStatusVariant(status?: string): "default" | "secondary" | "outline" {
  const normalized = status?.toLowerCase();
  if (normalized === "fulfilled") return "default";
  if (normalized === "open") return "secondary";
  return "outline";
}

function statusLabel(status: string) {
  if (status === "confirmed") return "Confirmed";
  if (status === "corrected") return "Corrected";
  if (status === "ai_extracted") return "Review AI suggestion";
  return "Needs review";
}

function statusVariant(status: string): "default" | "secondary" | "outline" {
  if (status === "confirmed" || status === "corrected") return "default";
  if (status === "ai_extracted") return "secondary";
  return "outline";
}

export default function FinancePage() {
  const { toast } = useToast();
  const basePath = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  const apiBase = `${basePath}/api`;
  const [summary, setSummary] = useState<any>(null);
  const [expenses, setExpenses] = useState<FinanceExpense[]>([]);
  const [receipts, setReceipts] = useState<FinanceReceipt[]>([]);
  const [income, setIncome] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [taxTransactions, setTaxTransactions] = useState<any[]>([]);
  const [hmrcStatus, setHmrcStatus] = useState<HmrcStatus | null>(null);
  const [taxCategory, setTaxCategory] = useState<string>("");
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [incomeOpen, setIncomeOpen] = useState(false);
  const [reviewing, setReviewing] = useState<FinanceExpense | null>(null);
  const [periodFrom, setPeriodFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [periodTo, setPeriodTo] = useState(new Date().toISOString().slice(0, 10));
  const [expenseForm, setExpenseForm] = useState(emptyExpense);
  const [incomeForm, setIncomeForm] = useState({
    receivedDate: new Date().toISOString().slice(0, 10), description: "", grossAmount: "",
    netAmount: "", vatAmount: "", category: "", paymentMethod: "", jobId: "", notes: "",
  });
  const [reviewForm, setReviewForm] = useState<Record<string, any>>({});
  const [uploading, setUploading] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptJobId, setReceiptJobId] = useState("");
  const [hmrcDialogOpen, setHmrcDialogOpen] = useState(false);
  const [sandboxTaxpayerId, setSandboxTaxpayerId] = useState("");
  const [hmrcSubmitting, setHmrcSubmitting] = useState(false);
  const { data: jobs = [] } = useListJobs();

  const request = async (path: string, init?: RequestInit) => {
    const response = await fetch(`${apiBase}${path}`, {
      credentials: "include",
      ...init,
      headers: init?.body instanceof FormData
        ? init?.headers
        : { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error ?? "Finance request failed");
    }
    if (response.status === 204) return null;
    return response.json();
  };

  const refresh = async () => {
    setLoading(true);
    try {
      // The company endpoint is the single existing ownership/bootstrap path.
      // Run it first so a newly signed-in owner has a business before Finance
      // fans out to its tenant-scoped endpoints.
      await request("/company");
      const periodParams = new URLSearchParams();
      if (periodFrom) periodParams.set("from", periodFrom);
      if (periodTo) periodParams.set("to", periodTo);
      const periodQuery = periodParams.size ? `?${periodParams.toString()}` : "";
      const [nextSummary, nextExpenses, nextReceipts, nextIncome, nextAudit, nextCategories, nextTransactions, nextHmrcStatus] = await Promise.all([
        request(`/finance/summary${periodQuery}`),
        request("/finance/expenses"),
        request("/finance/receipts"),
        request(`/finance/income${periodQuery}`),
        request("/finance/audit"),
        request("/finance/categories"),
        request(`/finance/transactions${periodQuery}`),
        request("/finance/hmrc/status"),
      ]);
      setSummary(nextSummary);
      setExpenses(nextExpenses);
      setReceipts(nextReceipts);
      setIncome(nextIncome);
      setAudit(nextAudit);
      setCategories(nextCategories.categories ?? []);
      setTaxTransactions(nextTransactions);
      setHmrcStatus(nextHmrcStatus);
      setTaxCategory("");
    } catch (error: any) {
      toast({ title: "Finance data could not be loaded", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const receiptByExpense = useMemo(
    () => new Map(receipts.map((receipt) => [receipt.expenseId, receipt])),
    [receipts],
  );

  async function createExpense() {
    try {
      await request("/finance/expenses", {
        method: "POST",
        body: JSON.stringify({
          ...expenseForm,
          jobId: expenseForm.jobId ? Number(expenseForm.jobId) : undefined,
          grossAmount: expenseForm.grossAmount || undefined,
          netAmount: expenseForm.netAmount || undefined,
          vatAmount: expenseForm.vatAmount || undefined,
        }),
      });
      toast({ title: "Expense saved", description: "It is available for review in Finance." });
      setExpenseOpen(false);
      setExpenseForm(emptyExpense);
      await refresh();
    } catch (error: any) {
      toast({ title: "Could not save expense", description: error.message, variant: "destructive" });
    }
  }

  async function createIncome() {
    try {
      await request("/finance/income", {
        method: "POST",
        body: JSON.stringify({
          ...incomeForm,
          jobId: incomeForm.jobId ? Number(incomeForm.jobId) : undefined,
          grossAmount: incomeForm.grossAmount || undefined,
          netAmount: incomeForm.netAmount || undefined,
          vatAmount: incomeForm.vatAmount || undefined,
        }),
      });
      toast({ title: "Other income recorded" });
      setIncomeOpen(false);
      await refresh();
    } catch (error: any) {
      toast({ title: "Could not record income", description: error.message, variant: "destructive" });
    }
  }

  function startReview(expense: FinanceExpense) {
    setReviewing(expense);
    setReviewForm({
      transactionDate: expense.transactionDate ?? "",
      supplierName: expense.supplierName ?? "",
      description: expense.description ?? "",
      category: expense.category ?? "",
      grossAmount: expense.grossAmount ?? "",
      netAmount: expense.netAmount ?? "",
      vatAmount: expense.vatAmount ?? "",
      paymentMethod: expense.paymentMethod ?? "",
      jobId: expense.jobId?.toString() ?? "",
      notes: expense.notes ?? "",
    });
  }

  async function saveReview(confirm: boolean) {
    if (!reviewing) return;
    try {
      const original = {
        transactionDate: reviewing.transactionDate ?? "", supplierName: reviewing.supplierName ?? "",
        description: reviewing.description ?? "", category: reviewing.category ?? "",
        grossAmount: String(reviewing.grossAmount ?? ""), netAmount: String(reviewing.netAmount ?? ""),
        vatAmount: String(reviewing.vatAmount ?? ""), paymentMethod: reviewing.paymentMethod ?? "",
        jobId: reviewing.jobId?.toString() ?? "", notes: reviewing.notes ?? "",
      };
      const wasCorrected = Object.keys(original).some((key) => String(original[key as keyof typeof original]) !== String(reviewForm[key] ?? ""));
      await request(`/finance/expenses/${reviewing.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...reviewForm,
          jobId: reviewForm.jobId ? Number(reviewForm.jobId) : null,
          grossAmount: reviewForm.grossAmount || null,
          netAmount: reviewForm.netAmount || null,
          vatAmount: reviewForm.vatAmount || null,
        }),
      });
      if (confirm) {
        await request(`/finance/expenses/${reviewing.id}/confirm`, {
          method: "POST",
          body: JSON.stringify({ wasCorrected }),
        });
      }
      toast({
        title: confirm ? "Expense confirmed" : "Review changes saved",
        description: confirm ? "Only now will this expense be included in tax preparation." : undefined,
      });
      setReviewing(null);
      await refresh();
    } catch (error: any) {
      toast({ title: "Could not update expense", description: error.message, variant: "destructive" });
    }
  }

  async function uploadReceipt(file: File, jobId?: string) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (jobId) formData.append("jobId", jobId);
      await request("/finance/receipts", { method: "POST", body: formData });
      toast({
        title: "Receipt stored privately",
        description: "Any AI-extracted details are waiting for human review.",
      });
      await refresh();
      setReceiptOpen(false);
      setReceiptFile(null);
      setReceiptJobId("");
    } catch (error: any) {
      toast({ title: "Receipt upload failed", description: error.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  async function filterTaxTransactions(category = "") {
    try {
      const params = new URLSearchParams();
      if (periodFrom) params.set("from", periodFrom);
      if (periodTo) params.set("to", periodTo);
      if (category) params.set("category", category);
      setTaxTransactions(await request(`/finance/transactions?${params.toString()}`));
      setTaxCategory(category);
    } catch (error: any) {
      toast({ title: "Could not load transaction drill-down", description: error.message, variant: "destructive" });
    }
  }

  async function connectHmrcSandbox() {
    setHmrcSubmitting(true);
    // Preview is itself embedded in an iframe, and its sandbox prevents
    // cross-origin top-frame assignment. Open a real top-level tab while the
    // click still has user activation, then navigate that tab after the API
    // returns the authorization URL.
    const hmrcWindow = window.open("about:blank", "_blank");
    if (!hmrcWindow) {
      toast({
        title: "Could not open HMRC sandbox",
        description: "Allow pop-ups for WorkRate, then try connecting again.",
        variant: "destructive",
      });
      setHmrcSubmitting(false);
      return;
    }
    hmrcWindow.opener = null;
    try {
      const start = await request("/finance/hmrc/connect", {
        method: "POST",
        body: JSON.stringify({
          taxpayerId: sandboxTaxpayerId.trim().toUpperCase(),
          browserContext: hmrcBrowserContext(),
          returnPath: window.location.pathname,
        }),
      });
      hmrcWindow.location.replace(start.authorizationUrl);
    } catch (error: any) {
      hmrcWindow.close();
      toast({ title: "Could not start HMRC sandbox connection", description: error.message, variant: "destructive" });
      setHmrcSubmitting(false);
    }
  }

  async function syncHmrcSandbox() {
    setHmrcSubmitting(true);
    try {
      const nextStatus = await request("/finance/hmrc/sync", {
        method: "POST",
        body: JSON.stringify({ browserContext: hmrcBrowserContext() }),
      });
      setHmrcStatus(nextStatus);
      toast({ title: "HMRC sandbox data refreshed", description: "Only read-only business details and obligations were retrieved." });
    } catch (error: any) {
      toast({ title: "HMRC sandbox sync needs attention", description: error.message, variant: "destructive" });
    } finally {
      setHmrcSubmitting(false);
    }
  }

  async function disconnectHmrcSandbox() {
    setHmrcSubmitting(true);
    try {
      await request("/finance/hmrc", { method: "DELETE" });
      setSandboxTaxpayerId("");
      toast({ title: "HMRC sandbox disconnected", description: "Local encrypted connection credentials were removed." });
      await refresh();
    } catch (error: any) {
      toast({ title: "Could not disconnect HMRC sandbox", description: error.message, variant: "destructive" });
    } finally {
      setHmrcSubmitting(false);
    }
  }

  const warnings = summary?.warnings ?? { unreviewed: [], missingReceipts: [], uncategorized: [], incompleteAmounts: [] };
  const warningCount = Object.values(warnings as Record<string, unknown[]>)
    .reduce((total, list) => total + (Array.isArray(list) ? list.length : 0), 0);
  const hmrcObligations = (hmrcStatus?.obligations ?? []).flatMap((group) =>
    (group.obligationDetails ?? []).map((detail) => ({
      ...detail,
      businessId: group.businessId,
      typeOfBusiness: group.typeOfBusiness,
    })),
  );

  return (
    <div className="max-w-6xl mx-auto space-y-7">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <WalletCards className="w-7 h-7 text-primary" />
            <h1 className="text-3xl font-black tracking-tight">Finance</h1>
          </div>
          <p className="text-muted-foreground font-medium mt-1">
            Keep receipt evidence and tax-preparation records organised. Nothing is sent to HMRC from WorkRate.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="rounded-xl font-bold gap-2" disabled={uploading} onClick={() => setReceiptOpen(true)}>
            <FileUp className="w-4 h-4" /> {uploading ? "Reading receipt…" : "Upload receipt"}
          </Button>
          <Button className="rounded-xl font-bold gap-2" onClick={() => setExpenseOpen(true)}>
            <Plus className="w-4 h-4" /> Add expense
          </Button>
        </div>
      </div>

      <Card className="rounded-2xl border-border/60 shadow-sm">
        <CardContent className="p-4 flex flex-col sm:flex-row sm:items-end gap-3">
          <Field label="Tax period from" className="w-full sm:w-44">
            <Input type="date" value={periodFrom} onChange={(event) => setPeriodFrom(event.target.value)} />
          </Field>
          <Field label="Tax period to" className="w-full sm:w-44">
            <Input type="date" value={periodTo} onChange={(event) => setPeriodTo(event.target.value)} />
          </Field>
          <Button variant="outline" className="rounded-xl font-bold" onClick={() => void refresh()}>Update summary</Button>
          <p className="text-xs text-muted-foreground font-medium sm:mb-2">Applies to the income and tax-preparation totals below.</p>
        </CardContent>
      </Card>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Total invoiced" value={summary?.income?.totalIncome} icon={ArrowUpRight} loading={loading} />
        <MetricCard label="Cash received" value={summary?.income?.cashReceived} icon={CheckCircle2} loading={loading} />
        <MetricCard label="Confirmed expenses" value={summary?.expenses?.confirmedGross} icon={ArrowDownLeft} loading={loading} />
        <Card className="rounded-2xl border-amber-200 bg-amber-50/50 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-muted-foreground">Needs attention</p>
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <p className="text-2xl font-black mt-2">{loading ? "—" : warningCount}</p>
            <p className="text-xs font-medium text-muted-foreground mt-1">Unreviewed or incomplete records</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="w-full sm:w-auto h-auto flex flex-wrap justify-start gap-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="income">Income</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="receipts">Receipts</TabsTrigger>
          <TabsTrigger value="tax">Tax / MTD prep</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card className="rounded-2xl shadow-sm">
            <CardHeader className="pb-3"><CardTitle className="text-lg">Cash and invoice activity</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-3 gap-4 text-sm">
              <InfoStat label="Invoice value" value={summary?.income?.invoiceIncome} />
              <InfoStat label="Deposits received" value={summary?.income?.depositsReceived} />
              <InfoStat label="Final payments received" value={summary?.income?.finalPayments} />
              <InfoStat label="Confirmed net expenses" value={summary?.expenses?.confirmedNet} />
              <InfoStat label="Confirmed VAT recorded" value={summary?.expenses?.confirmedVat} />
              <InfoStat label="Records awaiting review" value={summary?.expenses?.needsReviewCount} numeric />
            </CardContent>
          </Card>
          <ReviewNotice warnings={warnings} />
        </TabsContent>

        <TabsContent value="income">
          <div className="flex justify-end mb-3">
            <Button variant="outline" className="rounded-xl font-bold gap-2" onClick={() => setIncomeOpen(true)}>
              <Plus className="w-4 h-4" /> Add other income
            </Button>
          </div>
          <Card className="rounded-2xl shadow-sm overflow-hidden">
            <ActivityTable rows={income} kind="income" loading={loading} />
          </Card>
        </TabsContent>

        <TabsContent value="expenses">
          <Card className="rounded-2xl shadow-sm overflow-hidden">
            {loading ? <div className="p-8 text-sm text-muted-foreground">Loading expense records…</div> : expenses.length === 0 ? (
              <EmptyState icon={ReceiptText} title="No expenses yet" description="Add an expense manually or upload a receipt to start your finance records." />
            ) : (
              <div className="divide-y divide-border/60">
                {expenses.map((expense) => {
                  const receipt = receiptByExpense.get(expense.id);
                  return (
                    <button key={expense.id} onClick={() => startReview(expense)}
                      className="w-full text-left p-4 sm:px-6 hover:bg-secondary/30 transition-colors">
                      <div className="flex flex-wrap items-center gap-3 justify-between">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-bold truncate">{expense.supplierName || expense.description || "Untitled expense"}</p>
                            <Badge variant={statusVariant(expense.reviewStatus)}>{statusLabel(expense.reviewStatus)}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground font-medium mt-1">
                            {expense.transactionDate || "Date needed"} · {expense.category || "Category needed"}
                            {receipt ? ` · ${receipt.originalName}` : " · No receipt attached"}
                          </p>
                        </div>
                        <p className="font-black">{expense.grossAmount == null ? "Amount needed" : formatCurrency(expense.grossAmount)}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="receipts">
          <Card className="rounded-2xl shadow-sm overflow-hidden">
            {loading ? <div className="p-8 text-sm text-muted-foreground">Loading receipt evidence…</div> : receipts.length === 0 ? (
              <EmptyState icon={FileSearch} title="No receipts uploaded" description="Photos, PDFs, and supplier invoices are stored privately and linked to the record they support." />
            ) : (
              <div className="divide-y divide-border/60">
                {receipts.map((receipt) => {
                  const expense = expenses.find((record) => record.id === receipt.expenseId);
                  const suggestion = receipt.extractedData?.suggestion;
                  return (
                    <div key={receipt.id} className="p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                      <div className="min-w-0">
                        <p className="font-bold truncate">{receipt.originalName}</p>
                        <p className="text-xs text-muted-foreground font-medium mt-1">
                          {receipt.extractionStatus === "completed" ? "AI suggestion ready for review" : `Extraction ${receipt.extractionStatus}`}
                          {suggestion?.supplierName ? ` · ${String(suggestion.supplierName)}` : ""}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {receipt.fileUrl && <Button variant="outline" size="sm" className="rounded-lg" asChild><a href={`${apiBase}/finance/receipts/${receipt.id}/file`} target="_blank">View</a></Button>}
                        {expense && <Button size="sm" className="rounded-lg" onClick={() => startReview(expense)}>Review</Button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="tax" className="space-y-4">
          <Card className="rounded-2xl border-primary/20 bg-primary/5 shadow-sm">
            <CardContent className="p-5 flex gap-4">
              <ShieldCheck className="w-6 h-6 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="font-black">Preparation only — no HMRC submission</p>
                <p className="text-sm text-muted-foreground font-medium mt-1">
                  WorkRate is collecting reviewable records and evidence. Check values against the original documents before using them in your accounting or MTD software.
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl shadow-sm">
            <CardHeader className="pb-3 flex flex-row items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-lg">HMRC sandbox connection</CardTitle>
                  <Badge variant={hmrcStatus?.status === "connected" ? "default" : "outline"}>
                    {hmrcStatus?.status === "connected" ? "Connected" : "Not connected"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground font-medium mt-1">
                  Read-only sandbox business details and MTD obligations. WorkRate cannot submit anything from this page.
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {hmrcStatus?.status === "connected" ? (
                  <>
                    <Button size="sm" variant="outline" className="rounded-lg gap-2" disabled={hmrcSubmitting} onClick={() => void syncHmrcSandbox()}>
                      <RefreshCw className={`w-4 h-4 ${hmrcSubmitting ? "animate-spin" : ""}`} /> Refresh
                    </Button>
                    <Button size="sm" variant="outline" className="rounded-lg gap-2 text-destructive hover:text-destructive" disabled={hmrcSubmitting} onClick={() => void disconnectHmrcSandbox()}>
                      <Unplug className="w-4 h-4" /> Disconnect
                    </Button>
                  </>
                ) : (
                  <Button size="sm" className="rounded-lg gap-2" disabled={!hmrcStatus?.sandboxConfigured || hmrcSubmitting} onClick={() => setHmrcDialogOpen(true)}>
                    <Link2 className="w-4 h-4" /> Connect HMRC
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-4">
              {!hmrcStatus?.sandboxConfigured && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                  <p className="font-bold">Sandbox configuration needed</p>
                  <p className="mt-1">{hmrcStatus?.configurationMessage ?? "Add the HMRC sandbox settings on the server before connecting a business."}</p>
                </div>
              )}
              {hmrcStatus?.lastError && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                  <p className="font-bold">Connection needs attention</p>
                  <p className="mt-1">{hmrcStatus.lastError}</p>
                </div>
              )}
              {hmrcStatus?.status === "connected" && (
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs font-medium text-muted-foreground">
                  <span>Scope: {hmrcStatus.scopes.join(", ") || "read-only"}</span>
                  <span>Last read-only sync: {hmrcStatus.lastSuccessfulSyncAt ? new Date(hmrcStatus.lastSuccessfulSyncAt).toLocaleString() : "Not yet retrieved"}</span>
                </div>
              )}
              {hmrcStatus?.status === "connected" && hmrcStatus.businesses.length > 0 && (
                <div className="grid md:grid-cols-2 gap-3">
                  {hmrcStatus.businesses.map((business, index) => (
                    <div key={`${business.businessId ?? "business"}-${index}`} className="rounded-xl border border-border/60 p-4">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-primary" />
                        <p className="font-bold">{business.tradingName || business.typeOfBusiness || "Registered business"}</p>
                      </div>
                      <p className="text-xs text-muted-foreground font-medium mt-2">
                        {business.typeOfBusiness || "Business type not supplied"}{business.tradingType ? ` · ${business.tradingType}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              {hmrcStatus?.status === "connected" && hmrcStatus.businesses.length === 0 && !hmrcStatus.lastError && (
                <p className="text-sm text-muted-foreground">Connected to HMRC sandbox. Refresh to retrieve registered businesses and current obligations.</p>
              )}
            </CardContent>
          </Card>
          {hmrcStatus?.status === "connected" && (
            <Card className="rounded-2xl shadow-sm">
              <CardHeader className="pb-3"><CardTitle className="text-lg">HMRC MTD obligations</CardTitle></CardHeader>
              <CardContent className="pt-0">
                {hmrcObligations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No sandbox obligations have been retrieved yet.</p>
                ) : (
                  <div className="divide-y divide-border/60">
                    {hmrcObligations.map((obligation, index) => (
                      <div key={`${obligation.businessId ?? "business"}-${obligation.periodEndDate ?? index}`} className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <CalendarClock className="w-4 h-4 text-primary" />
                            <p className="font-bold">{obligation.periodStartDate || "Period start unavailable"} — {obligation.periodEndDate || "Period end unavailable"}</p>
                            <Badge variant={obligationStatusVariant(obligation.status)}>{obligation.status || "Unknown"}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground font-medium mt-1">
                            {obligation.typeOfBusiness || "Business"}{obligation.receivedDate ? ` · Received ${obligation.receivedDate}` : ""}
                          </p>
                        </div>
                        <p className="text-sm font-bold">{obligation.dueDate ? `Due ${obligation.dueDate}` : "No due date supplied"}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          <ReviewNotice warnings={warnings} />
          <Card className="rounded-2xl shadow-sm">
            <CardHeader className="pb-3"><CardTitle className="text-lg">Expense categories in this period</CardTitle></CardHeader>
            <CardContent className="pt-0">
              {(summary?.expenses?.categoryBreakdown ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Confirm expense records to see their category totals here.</p> : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {(summary?.expenses?.categoryBreakdown ?? []).map((category: any) => (
                    <button key={category.category} onClick={() => void filterTaxTransactions(category.category)}
                      className="text-left rounded-xl border border-border/60 p-3 hover:bg-secondary/50 transition-colors">
                      <p className="font-bold text-sm">{category.category}</p>
                      <p className="font-black mt-1">{formatCurrency(category.grossAmount)}</p>
                      <p className="text-xs text-muted-foreground font-medium">{category.count} record{category.count === 1 ? "" : "s"} · click to inspect</p>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          <Card className="rounded-2xl shadow-sm">
            <CardHeader className="pb-3"><CardTitle className="text-lg">Receipt evidence</CardTitle></CardHeader>
            <CardContent className="pt-0 grid sm:grid-cols-3 gap-3">
              <InfoStat label="Confirmed with receipt" value={summary?.expenses?.receiptAttachedGross} />
              <InfoStat label="Attached records" value={summary?.expenses?.receiptAttachedCount} numeric />
              <InfoStat label="Missing receipt" value={summary?.expenses?.missingReceiptCount} numeric />
            </CardContent>
          </Card>
          <Card className="rounded-2xl shadow-sm">
            <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3"><CardTitle className="text-lg">Transaction and document drill-down</CardTitle>{taxCategory && <Button size="sm" variant="outline" onClick={() => void filterTaxTransactions()}>Clear {taxCategory}</Button>}</CardHeader>
            <CardContent className="pt-0">
              {taxTransactions.length === 0 ? <p className="text-sm text-muted-foreground">No expenses match this period and filter.</p> : <div className="divide-y divide-border/60">{taxTransactions.map((record) => <div key={record.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><p className="font-bold">{record.supplierName || record.description || "Untitled expense"}</p><p className="text-xs text-muted-foreground font-medium mt-1">{record.transactionDate || "Date needed"} · {record.category || "Uncategorised"} · {record.receipts?.length ? `${record.receipts.length} receipt attached` : "No receipt attached"}</p>{record.receipts?.map((receipt: any) => <a className="text-xs font-bold text-primary hover:underline mr-3" key={receipt.id} href={`${apiBase}/finance/receipts/${receipt.id}/file`} target="_blank">{receipt.originalName}</a>)}</div><p className="font-black">{record.grossAmount == null ? "Amount needed" : formatCurrency(record.grossAmount)}</p></div>)}</div>}
            </CardContent>
          </Card>
          <Card className="rounded-2xl shadow-sm overflow-hidden">
            <CardHeader className="pb-3"><CardTitle className="text-lg">Recent finance audit trail</CardTitle></CardHeader>
            <CardContent className="pt-0">
              {audit.length === 0 ? <p className="py-6 text-sm text-muted-foreground">Actions such as uploads, edits, and confirmations will be recorded here.</p> : (
                <div className="divide-y divide-border/60">
                  {audit.slice(0, 10).map((event) => (
                    <div key={event.id} className="py-3 flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium"><span className="font-bold capitalize">{event.entityType}</span> {event.action}</span>
                      <span className="text-muted-foreground text-xs">{new Date(event.createdAt).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={hmrcDialogOpen} onOpenChange={setHmrcDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-black">Connect HMRC sandbox</DialogTitle>
            <DialogDescription>
              Use an HMRC sandbox test account only. Your taxpayer identifier is encrypted on the server and is never shown again in WorkRate.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <Field label="Sandbox NINO">
              <Input
                value={sandboxTaxpayerId}
                onChange={(event) => setSandboxTaxpayerId(event.target.value.toUpperCase())}
                placeholder="AA000003D"
                autoCapitalize="characters"
              />
            </Field>
            <p className="text-xs text-muted-foreground">
              This starts a read-only OAuth connection. No Finance records or HMRC tax updates will be created.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHmrcDialogOpen(false)}>Cancel</Button>
            <Button disabled={!sandboxTaxpayerId.trim() || hmrcSubmitting} onClick={() => void connectHmrcSandbox()}>
              {hmrcSubmitting ? "Opening HMRC…" : "Continue to HMRC"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={expenseOpen} onOpenChange={setExpenseOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle className="font-black">Add expense</DialogTitle><DialogDescription>Enter values from a real document or transaction. WorkRate will not calculate missing VAT values for you.</DialogDescription></DialogHeader>
          <ExpenseFields value={expenseForm} onChange={setExpenseForm} categories={categories} jobs={jobs as any[]} />
          <DialogFooter><Button variant="outline" onClick={() => setExpenseOpen(false)}>Cancel</Button><Button onClick={createExpense}>Save expense</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={incomeOpen} onOpenChange={setIncomeOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle className="font-black">Add other income</DialogTitle><DialogDescription>Use this only for income that is not already represented by a WorkRate invoice.</DialogDescription></DialogHeader>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Received date"><Input type="date" value={incomeForm.receivedDate} onChange={(e) => setIncomeForm({ ...incomeForm, receivedDate: e.target.value })} /></Field>
            <Field label="Gross amount"><Input type="number" min="0" step="0.01" value={incomeForm.grossAmount} onChange={(e) => setIncomeForm({ ...incomeForm, grossAmount: e.target.value })} /></Field>
            <Field label="Description" className="sm:col-span-2"><Input value={incomeForm.description} onChange={(e) => setIncomeForm({ ...incomeForm, description: e.target.value })} /></Field>
            <Field label="Category"><Input value={incomeForm.category} onChange={(e) => setIncomeForm({ ...incomeForm, category: e.target.value })} /></Field>
            <Field label="Payment method"><Input value={incomeForm.paymentMethod} onChange={(e) => setIncomeForm({ ...incomeForm, paymentMethod: e.target.value })} /></Field>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setIncomeOpen(false)}>Cancel</Button><Button onClick={createIncome}>Save income</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={receiptOpen} onOpenChange={setReceiptOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="font-black">Upload receipt</DialogTitle><DialogDescription>Store evidence privately. If you select a job, the receipt and its review record stay linked to that job.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2">
            <Field label="Link to job (optional)"><Select value={receiptJobId || "no-job"} onValueChange={(next) => setReceiptJobId(next === "no-job" ? "" : next)}><SelectTrigger><SelectValue placeholder="Not linked to a job" /></SelectTrigger><SelectContent><SelectItem value="no-job">Not linked to a job</SelectItem>{(jobs as any[]).map((job) => <SelectItem key={job.id} value={String(job.id)}>{job.customerName || `Job ${job.id}`}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Receipt file"><Input type="file" accept=".jpg,.jpeg,.png,.webp,.heic,.heif,.pdf" onChange={(event) => setReceiptFile(event.target.files?.[0] ?? null)} /></Field>
            <p className="text-xs text-muted-foreground">Images and PDFs are analysed as unconfirmed suggestions only. Check the original before confirming any financial value.</p>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setReceiptOpen(false)}>Cancel</Button><Button disabled={!receiptFile || uploading} onClick={() => receiptFile && void uploadReceipt(receiptFile, receiptJobId)}>{uploading ? "Reading receipt…" : "Store and review"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(reviewing)} onOpenChange={(open) => !open && setReviewing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-black">Review expense</DialogTitle>
            <DialogDescription>Check every value against the original receipt. AI suggestions are not included in tax preparation until you confirm them.</DialogDescription>
          </DialogHeader>
          {reviewing && <ExpenseFields value={reviewForm} onChange={setReviewForm} categories={categories} jobs={jobs as any[]} />}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => void saveReview(false)}>Save changes</Button>
            <Button onClick={() => void saveReview(true)}><CheckCircle2 className="w-4 h-4 mr-2" /> Confirm reviewed expense</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MetricCard({ label, value, icon: Icon, loading }: { label: string; value: number | undefined; icon: any; loading: boolean }) {
  return <Card className="rounded-2xl shadow-sm"><CardContent className="p-5"><div className="flex justify-between"><p className="text-sm font-bold text-muted-foreground">{label}</p><Icon className="w-5 h-5 text-primary" /></div><p className="text-2xl font-black mt-2">{loading ? "—" : formatCurrency(value ?? 0)}</p></CardContent></Card>;
}

function InfoStat({ label, value, numeric = false }: { label: string; value: number | undefined; numeric?: boolean }) {
  return <div className="bg-secondary/40 rounded-xl p-4"><p className="text-xs uppercase tracking-wider font-bold text-muted-foreground">{label}</p><p className="font-black text-lg mt-1">{numeric ? (value ?? 0) : formatCurrency(value ?? 0)}</p></div>;
}

function ReviewNotice({ warnings }: { warnings: Record<string, any[]> }) {
  const items = [
    [warnings.unreviewed?.length, "receipt-based expenses need human review"],
    [warnings.missingReceipts?.length, "confirmed expenses have no receipt attached"],
    [warnings.uncategorized?.length, "confirmed expenses need a clearer category"],
    [warnings.incompleteAmounts?.length, "confirmed expenses are missing a date or total"],
  ].filter(([count]) => Number(count) > 0);
  return <Card className="rounded-2xl shadow-sm"><CardContent className="p-5"><div className="flex gap-3"><AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" /><div><p className="font-black">Review checks</p>{items.length === 0 ? <p className="text-sm text-muted-foreground font-medium mt-1">No outstanding data-quality checks for the records currently shown.</p> : <ul className="text-sm text-muted-foreground font-medium mt-1 space-y-1">{items.map(([count, text]) => <li key={String(text)}>{count} {text}</li>)}</ul>}</div></div></CardContent></Card>;
}

function EmptyState({ icon: Icon, title, description }: { icon: any; title: string; description: string }) {
  return <div className="py-14 px-6 text-center"><div className="w-12 h-12 rounded-full bg-secondary mx-auto flex items-center justify-center mb-3"><Icon className="w-6 h-6 text-muted-foreground" /></div><p className="font-black">{title}</p><p className="text-sm text-muted-foreground max-w-md mx-auto mt-1">{description}</p></div>;
}

function ActivityTable({ rows, kind, loading }: { rows: any[]; kind: string; loading: boolean }) {
  if (loading) return <div className="p-8 text-sm text-muted-foreground">Loading {kind} activity…</div>;
  if (!rows.length) return <EmptyState icon={kind === "income" ? ArrowUpRight : ReceiptText} title={`No ${kind} records yet`} description="WorkRate invoice activity and manually recorded records will appear here." />;
  return <div className="divide-y divide-border/60">{rows.map((row) => <div key={row.id} className="p-4 sm:px-6 flex items-center justify-between gap-3"><div><p className="font-bold">{row.description}</p><p className="text-xs text-muted-foreground font-medium mt-1">{row.date} · {String(row.type).replaceAll("_", " ")}</p></div><p className="font-black">{formatCurrency(row.grossAmount ?? 0)}</p></div>)}</div>;
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={`grid gap-1.5 text-sm font-bold ${className}`}><span>{label}</span>{children}</label>;
}

function ExpenseFields({ value, onChange, categories, jobs }: { value: Record<string, any>; onChange: (value: any) => void; categories: string[]; jobs: any[] }) {
  const set = (field: string, fieldValue: string) => onChange({ ...value, [field]: fieldValue });
  return <div className="grid sm:grid-cols-2 gap-3 py-2">
    <Field label="Transaction date"><Input type="date" value={value.transactionDate ?? ""} onChange={(e) => set("transactionDate", e.target.value)} /></Field>
    <Field label="Supplier"><Input value={value.supplierName ?? ""} onChange={(e) => set("supplierName", e.target.value)} placeholder="e.g. TradePoint" /></Field>
    <Field label="Description" className="sm:col-span-2"><Input value={value.description ?? ""} onChange={(e) => set("description", e.target.value)} placeholder="What was purchased?" /></Field>
    <Field label="Category">
      <>
        <Input list="finance-category-options" value={value.category ?? ""} onChange={(e) => set("category", e.target.value)} placeholder="Choose or type a category" />
        <datalist id="finance-category-options">{categories.map((category) => <option key={category} value={category} />)}</datalist>
      </>
    </Field>
    <Field label="Linked job (optional)"><Select value={value.jobId || "no-job"} onValueChange={(next) => set("jobId", next === "no-job" ? "" : next)}><SelectTrigger><SelectValue placeholder="Not linked to a job" /></SelectTrigger><SelectContent><SelectItem value="no-job">Not linked to a job</SelectItem>{jobs.map((job) => <SelectItem key={job.id} value={String(job.id)}>{job.customerName || `Job ${job.id}`}</SelectItem>)}</SelectContent></Select></Field>
    <Field label="Gross total"><Input type="number" min="0" step="0.01" value={value.grossAmount ?? ""} onChange={(e) => set("grossAmount", e.target.value)} /></Field>
    <Field label="Net total"><Input type="number" min="0" step="0.01" value={value.netAmount ?? ""} onChange={(e) => set("netAmount", e.target.value)} /></Field>
    <Field label="VAT amount"><Input type="number" min="0" step="0.01" value={value.vatAmount ?? ""} onChange={(e) => set("vatAmount", e.target.value)} /></Field>
    <Field label="Payment method"><Input value={value.paymentMethod ?? ""} onChange={(e) => set("paymentMethod", e.target.value)} placeholder="e.g. business card" /></Field>
    <Field label="Notes" className="sm:col-span-2"><Input value={value.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></Field>
  </div>;
}