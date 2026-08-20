import {
  useGetJob,
  useGetQuote,
  useUpdateJob,
  useScheduleJob,
  useGetEnquiry,
  useListEnquiryAttachments,
  useListInvoices,
  useCreateInvoice,
  useSendInvoice,
  getGetEnquiryQueryKey,
  getGetJobQueryKey,
  getGetQuoteQueryKey,
  getListEnquiryAttachmentsQueryKey,
  getListInvoicesQueryKey,
} from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  MapPin,
  Hammer,
  Calendar,
  Phone,
  Mail,
  PoundSterling,
  ClipboardList,
  User,
  Pencil,
  Check,
  X,
  CalendarDays,
  FileText,
  ImageIcon,
  ExternalLink,
  Clock,
  CheckCircle2,
  Camera,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ChevronUp,
  Trash2,
  Upload,
  FileText as FileTextIcon,
  FileSpreadsheet,
  Brain,
  AlertCircle,
  Plus,
  Send,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { JobStatusBadge, JOB_STATUSES } from "./jobs";

// ── Intelligence types ────────────────────────────────────────────────────────
type IntelComponent = {
  id: number; jobId: number; documentId: number;
  itemName: string | null; quantity: string | null;
  finishedLengthMm: string | null; finishedWidthMm: string | null; finishedThicknessMm: string | null;
  sawnLengthMm: string | null; sawnWidthMm: string | null; sawnThicknessMm: string | null;
  material: string | null; timberSpecies: string | null; timberGrade: string | null;
  boardType: string | null; sheetFinish: string | null;
  hardwareRef: string | null; supplierRef: string | null;
  unitCost: string | null; totalCost: string | null; notes: string | null;
  extractionStatus: string; confidenceScore: string | null;
  originalExtractedText: string | null; correctedAt: string | null; extractedAt: string;
};

type IntelInvoiceLine = {
  id: number; jobId: number; documentId: number;
  supplierName: string | null; invoiceNumber: string | null; invoiceDate: string | null;
  itemDescription: string | null; quantity: string | null; unit: string | null;
  unitPrice: string | null; lineTotal: string | null; vatAmount: string | null;
  materialCategory: string | null; productRef: string | null;
  extractionStatus: string; confidenceScore: string | null;
  originalExtractedText: string | null; correctedAt: string | null; extractedAt: string;
};

type Intelligence = { components: IntelComponent[]; invoiceLines: IntelInvoiceLine[] };

export default function JobDetail() {
  const params = useParams();
  const id = Number(params.id);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: job, isLoading } = useGetJob(id);
  const enquiryId = job?.enquiryId ?? 0;
  const { data: enquiry } = useGetEnquiry(enquiryId, {
    query: { enabled: !!job?.enquiryId, queryKey: getGetEnquiryQueryKey(enquiryId) },
  });
  const { data: quote } = useGetQuote(enquiryId, {
    query: { enabled: !!job?.enquiryId, retry: false, queryKey: getGetQuoteQueryKey(enquiryId) },
  });
  const { data: attachments } = useListEnquiryAttachments(enquiryId, {
    query: { enabled: !!job?.enquiryId, queryKey: getListEnquiryAttachmentsQueryKey(enquiryId) },
  });
  const { data: invoices = [], isLoading: invoicesLoading } = useListInvoices({
    query: { queryKey: getListInvoicesQueryKey() },
  });
  const createInvoice = useCreateInvoice();
  const sendInvoice = useSendInvoice();

  const [statusVal, setStatusVal] = useState<string | undefined>();
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesVal, setNotesVal] = useState("");
  const [editingInstall, setEditingInstall] = useState(false);
  const [installVal, setInstallVal] = useState("");
  // Scheduling state
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [surveyDate, setSurveyDate] = useState("");
  const [installStartDate, setInstallStartDate] = useState("");
  const [installEndDate, setInstallEndDate] = useState("");
  // Completion form state
  const [completingJob, setCompletingJob] = useState(false);
  const [completionSaving, setCompletionSaving] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [completionForm, setCompletionForm] = useState({
    finalAmountCharged: "",
    actualLabourHours: "",
    actualLabourCost: "",
    actualMaterialsCost: "",
    variationAmount: "",
    variationNote: "",
    completionNotes: "",
    completedAt: new Date().toISOString().slice(0, 10),
  });
  // Edit actuals state
  const [editingActuals, setEditingActuals] = useState(false);
  const [actualsSaving, setActualsSaving] = useState(false);
  const [actualsForm, setActualsForm] = useState({
    finalAmountCharged: "",
    actualLabourHours: "",
    actualLabourCost: "",
    actualMaterialsCost: "",
    variationAmount: "",
    variationNote: "",
    completionNotes: "",
    completedAt: "",
  });
  // Production documents state
  const [prodDocs, setProdDocs] = useState<any[]>([]);
  const [docUploading, setDocUploading] = useState(false);
  const [newDocType, setNewDocType] = useState("cutting_list");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  // Intelligence state
  const [intelligence, setIntelligence] = useState<Intelligence>({ components: [], invoiceLines: [] });
  const [intelLoading, setIntelLoading] = useState(false);
  const [sendingFinalInvoice, setSendingFinalInvoice] = useState(false);

  const updateJob = useUpdateJob({
    mutation: {
      onSuccess: () => {
        toast({ title: "Job updated" });
        queryClient.invalidateQueries({ queryKey: [`/api/jobs/${id}`] });
        queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
        setStatusVal(undefined);
        setEditingNotes(false);
        setEditingInstall(false);
      },
      onError: () => toast({ title: "Failed to update job", variant: "destructive" }),
    },
  });

  const scheduleJobMutation = useScheduleJob({
    mutation: {
      onSuccess: () => {
        toast({ title: "Schedule saved" });
        queryClient.invalidateQueries({ queryKey: [`/api/jobs/${id}`] });
        queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
        setEditingSchedule(false);
      },
      onError: () => toast({ title: "Failed to save schedule", variant: "destructive" }),
    },
  });

  const handleSaveStatus = () => {
    if (!statusVal || statusVal === job.status) return;
    updateJob.mutate({ id, data: { status: statusVal } });
  };

  const handleSaveNotes = () => {
    updateJob.mutate({ id, data: { notes: notesVal } });
  };

  const handleSaveInstall = () => {
    updateJob.mutate({ id, data: { installDate: installVal } });
  };

  const handleOpenSchedule = () => {
    setSurveyDate(job.siteSurveyDate ?? "");
    setInstallStartDate(job.installationStartDate ?? "");
    setInstallEndDate(job.installationEndDate ?? "");
    setEditingSchedule(true);
  };

  const handleSaveSchedule = () => {
    scheduleJobMutation.mutate({
      id,
      data: {
        siteSurveyDate: surveyDate,
        installationStartDate: installStartDate,
        installationEndDate: installEndDate,
      },
    });
  };

  const handleCompleteJob = async () => {
    setCompletionSaving(true);
    try {
      const body: Record<string, any> = { completedAt: completionForm.completedAt };
      if (completionForm.finalAmountCharged) body.finalAmountCharged = Number(completionForm.finalAmountCharged);
      if (completionForm.actualLabourHours) body.actualLabourHours = Number(completionForm.actualLabourHours);
      if (completionForm.actualLabourCost) body.actualLabourCost = Number(completionForm.actualLabourCost);
      if (completionForm.actualMaterialsCost) body.actualMaterialsCost = Number(completionForm.actualMaterialsCost);
      if (completionForm.variationAmount) body.variationAmount = Number(completionForm.variationAmount);
      if (completionForm.variationNote) body.variationNote = completionForm.variationNote;
      if (completionForm.completionNotes) body.completionNotes = completionForm.completionNotes;

      const r = await fetch(`/api/jobs/${id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(await r.text());
      toast({ title: "Job marked as completed" });
      queryClient.invalidateQueries({ queryKey: [`/api/jobs/${id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      setCompletingJob(false);
    } catch {
      toast({ title: "Failed to complete job", variant: "destructive" });
    } finally {
      setCompletionSaving(false);
    }
  };

  const handleSendFinalInvoice = async (existingInvoice?: any) => {
    if (!job) return;
    if (!job.customerEmail) {
      toast({ title: "Add a customer email before sending the final invoice", variant: "destructive" });
      return;
    }

    setSendingFinalInvoice(true);
    try {
      let invoice = existingInvoice;
      if (!invoice) {
        const jobValue = Number((job as any).finalAmountCharged ?? job.totalWithVat);
        const paidDeposit = Number((quote as any)?.depositPaidAmount ?? 0);
        const finalPaymentDue = Math.max(0, Math.round((jobValue - paidDeposit) * 100) / 100);
        if (finalPaymentDue <= 0) {
          toast({ title: "There is no final balance left to invoice" });
          return;
        }

        const vatRate = 20;
        const netAmount = Math.round((finalPaymentDue / (1 + vatRate / 100)) * 100) / 100;
        const vatAmount = Math.round((finalPaymentDue - netAmount) * 100) / 100;
        const description = `Final payment — ${job.projectDescription || job.projectType || "completed job"}`;

        invoice = await createInvoice.mutateAsync({
          data: {
            customerDetails: job.customerName,
            customerEmail: job.customerEmail,
            projectDescription: description,
            jobId: id,
            materialsAllowance: netAmount,
            estimatedTotal: netAmount,
            vatRate,
            vatAmount,
            totalWithVat: finalPaymentDue,
            lineItems: JSON.stringify([{
              id: crypto.randomUUID(),
              description,
              quantity: 1,
              unit: "job",
              unitPrice: netAmount,
              lineTotal: netAmount,
            }]),
            depositType: "none",
          } as any,
        });
      }

      if (invoice.status !== "paid") {
        await sendInvoice.mutateAsync({ id: invoice.id });
      }
      queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
      toast({
        title: invoice.status === "sent" ? "Invoice resent" : "Final invoice sent",
        description: `Sent to ${job.customerEmail}`,
      });
    } catch {
      toast({ title: "Failed to send the final invoice", variant: "destructive" });
    } finally {
      setSendingFinalInvoice(false);
    }
  };

  const handleUploadCompletionPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`/api/jobs/${id}/completion-photos`, { method: "POST", body: fd });
      if (!r.ok) throw new Error(await r.text());
      toast({ title: "Photo uploaded" });
      queryClient.invalidateQueries({ queryKey: [`/api/jobs/${id}`] });
    } catch {
      toast({ title: "Photo upload failed", variant: "destructive" });
    } finally {
      setPhotoUploading(false);
      e.target.value = "";
    }
  };

  // ── Edit actuals ──────────────────────────────────────────────────────────
  const handleOpenEditActuals = () => {
    const jx = job as any;
    setActualsForm({
      finalAmountCharged: jx.finalAmountCharged != null ? String(jx.finalAmountCharged) : "",
      actualLabourHours:  jx.actualLabourHours  != null ? String(jx.actualLabourHours)  : "",
      actualLabourCost:   jx.actualLabourCost   != null ? String(jx.actualLabourCost)   : "",
      actualMaterialsCost: jx.actualMaterialsCost != null ? String(jx.actualMaterialsCost) : "",
      variationAmount:    jx.variationAmount    != null ? String(jx.variationAmount)    : "",
      variationNote:      jx.variationNote      ?? "",
      completionNotes:    jx.completionNotes    ?? "",
      completedAt:        jx.completedAt        ?? new Date().toISOString().slice(0, 10),
    });
    setEditingActuals(true);
  };

  const handleSaveActuals = async () => {
    setActualsSaving(true);
    try {
      const body: Record<string, any> = { completedAt: actualsForm.completedAt };
      if (actualsForm.finalAmountCharged) body.finalAmountCharged = Number(actualsForm.finalAmountCharged);
      if (actualsForm.actualLabourHours)  body.actualLabourHours  = Number(actualsForm.actualLabourHours);
      if (actualsForm.actualLabourCost)   body.actualLabourCost   = Number(actualsForm.actualLabourCost);
      if (actualsForm.actualMaterialsCost) body.actualMaterialsCost = Number(actualsForm.actualMaterialsCost);
      if (actualsForm.variationAmount)    body.variationAmount    = Number(actualsForm.variationAmount);
      body.variationNote   = actualsForm.variationNote;
      body.completionNotes = actualsForm.completionNotes;
      const r = await fetch(`/api/jobs/${id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(await r.text());
      toast({ title: "Actuals updated" });
      queryClient.invalidateQueries({ queryKey: [`/api/jobs/${id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      setEditingActuals(false);
    } catch {
      toast({ title: "Failed to save actuals", variant: "destructive" });
    } finally {
      setActualsSaving(false);
    }
  };

  // ── Production documents ─────────────────────────────────────────────────
  useEffect(() => {
    if (!job || !(job as any).completedAt) return;
    fetch(`/api/jobs/${id}/production-documents`)
      .then(r => r.ok ? r.json() : [])
      .then(setProdDocs)
      .catch(() => {});
  }, [id, job]);

  // ── Intelligence data ─────────────────────────────────────────────────────
  const loadIntelligence = async () => {
    setIntelLoading(true);
    try {
      const r = await fetch(`/api/jobs/${id}/intelligence`);
      if (r.ok) setIntelligence(await r.json());
    } catch { /* silent */ }
    finally { setIntelLoading(false); }
  };

  useEffect(() => {
    if (!job || !(job as any).completedAt) return;
    loadIntelligence();
  }, [id, job]);

  if (isLoading || !job) {
    return (
      <div className="space-y-4 max-w-5xl mx-auto">
        <Skeleton className="h-8 w-48 rounded-lg" />
        <Skeleton className="h-64 w-full rounded-2xl" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-48 rounded-2xl lg:col-span-2" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      </div>
    );
  }

  const currentStatus = statusVal ?? job.status;

  const handleUploadDoc = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDocUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("docType", newDocType);
      const r = await fetch(`/api/jobs/${id}/production-documents`, { method: "POST", body: fd });
      if (!r.ok) throw new Error(await r.text());
      const doc = await r.json();
      setProdDocs(prev => [doc, ...prev]);
      // Refresh intelligence — extraction may have completed synchronously
      await loadIntelligence();
      const itemCount = (doc.extractedComponentCount ?? 0) + (doc.extractedInvoiceLineCount ?? 0);
      toast({ title: itemCount > 0 ? `Document uploaded — ${itemCount} items extracted` : "Document uploaded" });
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setDocUploading(false);
      e.target.value = "";
    }
  };

  const handleDeleteDoc = async (docId: number) => {
    try {
      const r = await fetch(`/api/jobs/${id}/production-documents/${docId}`, { method: "DELETE" });
      if (!r.ok) throw new Error(await r.text());
      setProdDocs(prev => prev.filter(d => d.id !== docId));
      // Also remove intelligence rows that came from this doc
      setIntelligence(prev => ({
        components: prev.components.filter(c => c.documentId !== docId),
        invoiceLines: prev.invoiceLines.filter(l => l.documentId !== docId),
      }));
      setConfirmDeleteId(null);
      toast({ title: "Document removed" });
    } catch {
      toast({ title: "Failed to remove document", variant: "destructive" });
    }
  };

  // Parse AI summary
  let summaryText = "";
  let summaryMeasurements = "";
  let summaryMaterials = "";
  if (job.aiSummary) {
    try {
      const s = JSON.parse(job.aiSummary);
      summaryText = s.summary ?? "";
      summaryMeasurements = s.measurements ?? "";
      summaryMaterials = s.materials ?? "";
    } catch {
      summaryText = job.aiSummary;
    }
  }

  // Parse attachment URLs
  let attachmentList: string[] = [];
  if (job.attachmentUrls) {
    try {
      attachmentList = JSON.parse(job.attachmentUrls);
    } catch {
      if (job.attachmentUrls) attachmentList = [job.attachmentUrls];
    }
  }

  // ── Completion actuals (cast — new fields not yet in generated types) ──────
  const jx = job as any;
  const isCompleted = jx.completedAt != null;
  const jobInvoice = invoices.find((invoice: any) => Number(invoice.jobId) === id);
  const finalPaymentAccepted = jobInvoice?.status === "paid";
  const finalCharged: number | null = jx.finalAmountCharged ?? null;
  const quoteVariance = finalCharged != null ? finalCharged - job.totalWithVat : null;
  const quoteVariancePct = quoteVariance != null && job.totalWithVat > 0
    ? (quoteVariance / job.totalWithVat) * 100 : null;
  const labourVariance = jx.actualLabourCost != null && job.labourAllowance > 0
    ? jx.actualLabourCost - job.labourAllowance : null;
  const materialVariance = jx.actualMaterialsCost != null && job.materialsAllowance > 0
    ? jx.actualMaterialsCost - job.materialsAllowance : null;
  const grossProfit = finalCharged != null && jx.actualLabourCost != null && jx.actualMaterialsCost != null
    ? finalCharged - jx.actualLabourCost - jx.actualMaterialsCost : null;
  const grossMarginPct = grossProfit != null && finalCharged != null && finalCharged > 0
    ? (grossProfit / finalCharged) * 100 : null;
  const completionPhotos: string[] = (() => {
    try { return JSON.parse(jx.completionPhotoUrls ?? "[]"); } catch { return []; }
  })();

  const hasIntelligence = intelligence.components.length > 0 || intelligence.invoiceLines.length > 0;

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-24 animate-in fade-in-0 duration-300">
      {/* Back */}
      <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground">
        <Link href="/jobs" className="hover:text-foreground flex items-center gap-1.5 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Jobs
        </Link>
      </div>

      {/* Hero card */}
      <Card className="shadow-sm border-border/60 overflow-hidden rounded-2xl">
        <div className="bg-secondary/40 px-8 py-8 border-b border-border/60">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-3 flex-wrap">
                <h1 className="text-3xl font-black tracking-tight">{job.customerName}</h1>
                <JobStatusBadge status={currentStatus} />
              </div>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm font-semibold text-muted-foreground">
                {job.projectType && (
                  <span className="flex items-center gap-2 text-foreground/80 bg-background/50 px-3 py-1.5 rounded-md border border-border/40">
                    <Hammer className="w-4 h-4" /> {job.projectType}
                  </span>
                )}
                {job.location && (
                  <span className="flex items-center gap-2"><MapPin className="w-4 h-4" /> {job.location}</span>
                )}
                <span className="flex items-center gap-2"><ClipboardList className="w-4 h-4" /> Job #{job.id}</span>
                <span className="flex items-center gap-2"><Calendar className="w-4 h-4" /> Created {formatDate(job.createdAt)}</span>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">Job Value</p>
              <p className="text-3xl font-black text-primary">{formatCurrency(job.totalWithVat)}</p>
            </div>
          </div>
        </div>

        <CardContent className="p-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <InfoBox icon={Mail} label="Email" value={job.customerEmail} />
            <InfoBox icon={Phone} label="Phone" value={job.customerPhone} />
            <InfoBox icon={PoundSterling} label="Materials" value={job.materialsAllowance ? formatCurrency(job.materialsAllowance) : undefined} />
            <InfoBox icon={PoundSterling} label="Labour" value={job.labourAllowance ? formatCurrency(job.labourAllowance) : undefined} />
          </div>
        </CardContent>
      </Card>

      {/* ── Complete Job form (full-width, shown when completing) ─────────── */}
      {completingJob && (
        <Card className="shadow-sm border-green-500/30 rounded-2xl">
          <div className="px-6 py-5 border-b border-border/60 flex items-center justify-between">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" /> Complete Job — Record Actuals
            </h2>
            <Button variant="ghost" size="sm" onClick={() => setCompletingJob(false)} className="rounded-lg">
              <X className="w-4 h-4" />
            </Button>
          </div>
          <CardContent className="p-6 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Final Amount Charged (£)</Label>
                <Input type="number" min="0" step="0.01" placeholder="e.g. 4800"
                  value={completionForm.finalAmountCharged}
                  onChange={(e) => setCompletionForm(f => ({ ...f, finalAmountCharged: e.target.value }))}
                  className="field-input font-medium h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Completion Date</Label>
                <Input type="date" value={completionForm.completedAt}
                  onChange={(e) => setCompletionForm(f => ({ ...f, completedAt: e.target.value }))}
                  className="field-input font-medium h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Total Labour Hours</Label>
                <Input type="number" min="0" step="0.5" placeholder="e.g. 24"
                  value={completionForm.actualLabourHours}
                  onChange={(e) => setCompletionForm(f => ({ ...f, actualLabourHours: e.target.value }))}
                  className="field-input font-medium h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Labour Cost (£) <span className="normal-case font-normal text-muted-foreground/70">optional</span></Label>
                <Input type="number" min="0" step="0.01" placeholder="e.g. 840"
                  value={completionForm.actualLabourCost}
                  onChange={(e) => setCompletionForm(f => ({ ...f, actualLabourCost: e.target.value }))}
                  className="field-input font-medium h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Materials Cost (£)</Label>
                <Input type="number" min="0" step="0.01" placeholder="e.g. 1200"
                  value={completionForm.actualMaterialsCost}
                  onChange={(e) => setCompletionForm(f => ({ ...f, actualMaterialsCost: e.target.value }))}
                  className="field-input font-medium h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Variation (£) <span className="normal-case font-normal text-muted-foreground/70">+ added / − removed</span></Label>
                <Input type="number" step="0.01" placeholder="e.g. 250 or -150"
                  value={completionForm.variationAmount}
                  onChange={(e) => setCompletionForm(f => ({ ...f, variationAmount: e.target.value }))}
                  className="field-input font-medium h-10" />
              </div>
            </div>
            {completionForm.variationAmount && (
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Variation Reason</Label>
                <Input placeholder="e.g. Extra shelf run added on site"
                  value={completionForm.variationNote}
                  onChange={(e) => setCompletionForm(f => ({ ...f, variationNote: e.target.value }))}
                  className="field-input font-medium h-10" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Completion Notes <span className="normal-case font-normal text-muted-foreground/70">optional</span></Label>
              <Textarea rows={3} placeholder="Any notes on how the job went, issues encountered, snagging…"
                value={completionForm.completionNotes}
                onChange={(e) => setCompletionForm(f => ({ ...f, completionNotes: e.target.value }))}
                className="field-input resize-none font-medium" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5" /> Finished Photos <span className="normal-case font-normal text-muted-foreground/70">optional — upload one at a time</span>
              </Label>
              <label className={cn(
                "flex items-center justify-center gap-2 border-2 border-dashed border-border/60 rounded-xl px-4 py-5 cursor-pointer text-sm font-semibold text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors",
                photoUploading && "opacity-50 pointer-events-none"
              )}>
                <Camera className="w-4 h-4" />
                {photoUploading ? "Uploading…" : "Choose photo"}
                <input type="file" accept="image/*" className="hidden" disabled={photoUploading} onChange={handleUploadCompletionPhoto} />
              </label>
              {completionPhotos.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-2">
                  {completionPhotos.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="aspect-square rounded-lg overflow-hidden border border-border/60 bg-secondary/40">
                      <img src={url} alt={`Finished photo ${i + 1}`} className="w-full h-full object-cover" />
                    </a>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-3 pt-2 border-t border-border/40">
              <Button onClick={handleCompleteJob} disabled={completionSaving}
                className="font-bold h-11 rounded-xl bg-green-600 hover:bg-green-700 text-white px-6">
                <CheckCircle2 className="w-4 h-4 mr-2" />
                {completionSaving ? "Saving…" : "Save & Complete Job"}
              </Button>
              <Button variant="outline" onClick={() => setCompletingJob(false)} className="font-bold h-11 rounded-xl">
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left col — main info */}
        <div className="lg:col-span-2 space-y-6">

          {/* Project description */}
          {job.projectDescription && (
            <Card className="shadow-sm border-border/60 rounded-2xl">
              <div className="px-6 py-5 border-b border-border/60">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <FileText className="w-5 h-5 text-muted-foreground" /> Project Description
                </h2>
              </div>
              <CardContent className="p-6">
                <p className="text-sm text-muted-foreground font-medium leading-relaxed whitespace-pre-line">
                  {job.projectDescription}
                </p>
              </CardContent>
            </Card>
          )}

          {/* AI Summary */}
          {summaryText && (
            <Card className="shadow-sm border-border/60 rounded-2xl">
              <div className="px-6 py-5 border-b border-border/60">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <span className="text-primary">✦</span> AI Summary
                </h2>
              </div>
              <CardContent className="p-6 space-y-4">
                <p className="text-sm font-medium leading-relaxed">{summaryText}</p>
                {summaryMeasurements && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Measurements</p>
                    <p className="text-sm font-medium text-muted-foreground">{summaryMeasurements}</p>
                  </div>
                )}
                {summaryMaterials && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Materials Noted</p>
                    <p className="text-sm font-medium text-muted-foreground">{summaryMaterials}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Notes */}
          <Card className="shadow-sm border-border/60 rounded-2xl">
            <div className="px-6 py-5 border-b border-border/60 flex items-center justify-between">
              <h2 className="text-lg font-bold">Notes</h2>
              {!editingNotes && (
                <Button variant="ghost" size="sm"
                  onClick={() => { setNotesVal(job.notes ?? ""); setEditingNotes(true); }}
                  className="rounded-lg">
                  <Pencil className="w-4 h-4 mr-1" /> Edit
                </Button>
              )}
            </div>
            <CardContent className="p-6">
              {editingNotes ? (
                <div className="space-y-3">
                  <Textarea rows={5} value={notesVal}
                    onChange={(e) => setNotesVal(e.target.value)}
                    className="field-input resize-none font-medium"
                    placeholder="Job notes, special requirements, access info…" />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSaveNotes} disabled={updateJob.isPending} className="rounded-xl font-bold">
                      <Check className="w-4 h-4 mr-1" /> Save
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingNotes(false)} className="rounded-xl font-bold">
                      <X className="w-4 h-4 mr-1" /> Cancel
                    </Button>
                  </div>
                </div>
              ) : job.notes ? (
                <p className="text-sm font-medium leading-relaxed whitespace-pre-line text-muted-foreground">{job.notes}</p>
              ) : (
                <p className="text-sm text-muted-foreground font-medium italic">No notes yet.</p>
              )}
            </CardContent>
          </Card>

          {/* ── Job Actuals (only shown after completion) ─────────────────────── */}
          {isCompleted && (
            <Card className="shadow-sm border-green-500/25 rounded-2xl">
              <div className="px-6 py-5 border-b border-border/60 flex items-center justify-between">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600" /> Job Actuals
                </h2>
                {!editingActuals && (
                  <Button variant="ghost" size="sm" onClick={handleOpenEditActuals} className="rounded-lg">
                    <Pencil className="w-4 h-4 mr-1" /> Edit
                  </Button>
                )}
              </div>
              <CardContent className="p-6 space-y-5">

                {/* ── Edit actuals inline form ──────────────────────────── */}
                {editingActuals ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Final Charged (£)</Label>
                        <Input type="number" min="0" step="0.01" value={actualsForm.finalAmountCharged}
                          onChange={e => setActualsForm(f => ({ ...f, finalAmountCharged: e.target.value }))}
                          className="field-input font-medium h-10" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Completion Date</Label>
                        <Input type="date" value={actualsForm.completedAt}
                          onChange={e => setActualsForm(f => ({ ...f, completedAt: e.target.value }))}
                          className="field-input font-medium h-10" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Labour Hours</Label>
                        <Input type="number" min="0" step="0.5" value={actualsForm.actualLabourHours}
                          onChange={e => setActualsForm(f => ({ ...f, actualLabourHours: e.target.value }))}
                          className="field-input font-medium h-10" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Labour Cost (£)</Label>
                        <Input type="number" min="0" step="0.01" value={actualsForm.actualLabourCost}
                          onChange={e => setActualsForm(f => ({ ...f, actualLabourCost: e.target.value }))}
                          className="field-input font-medium h-10" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Materials Cost (£)</Label>
                        <Input type="number" min="0" step="0.01" value={actualsForm.actualMaterialsCost}
                          onChange={e => setActualsForm(f => ({ ...f, actualMaterialsCost: e.target.value }))}
                          className="field-input font-medium h-10" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Variation (£)</Label>
                        <Input type="number" step="0.01" value={actualsForm.variationAmount}
                          onChange={e => setActualsForm(f => ({ ...f, variationAmount: e.target.value }))}
                          className="field-input font-medium h-10" placeholder="0" />
                      </div>
                    </div>
                    {actualsForm.variationAmount && (
                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Variation Reason</Label>
                        <Input value={actualsForm.variationNote}
                          onChange={e => setActualsForm(f => ({ ...f, variationNote: e.target.value }))}
                          placeholder="e.g. Extra shelf run added on site"
                          className="field-input font-medium h-10" />
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Completion Notes</Label>
                      <Textarea rows={3} value={actualsForm.completionNotes}
                        onChange={e => setActualsForm(f => ({ ...f, completionNotes: e.target.value }))}
                        className="field-input resize-none font-medium" />
                    </div>
                    <div className="flex gap-3 pt-1 border-t border-border/40">
                      <Button onClick={handleSaveActuals} disabled={actualsSaving}
                        className="font-bold h-10 rounded-xl px-5">
                        <Check className="w-4 h-4 mr-1.5" />{actualsSaving ? "Saving…" : "Save Changes"}
                      </Button>
                      <Button variant="outline" onClick={() => setEditingActuals(false)} className="font-bold h-10 rounded-xl">
                        <X className="w-4 h-4 mr-1" /> Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* ── Read-only actuals display ─────────────────────── */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      <ActualBox label="Quoted" value={formatCurrency(job.totalWithVat)} />
                      {finalCharged != null && <ActualBox label="Final Charged" value={formatCurrency(finalCharged)} highlight />}
                      {quoteVariance != null && (
                        <ActualBox
                          label="Quote Variance"
                          value={`${quoteVariance >= 0 ? "+" : ""}${formatCurrency(quoteVariance)}${quoteVariancePct != null ? ` (${quoteVariancePct >= 0 ? "+" : ""}${quoteVariancePct.toFixed(1)}%)` : ""}`}
                          trend={quoteVariance >= 0 ? "up" : "down"}
                        />
                      )}
                      {jx.actualLabourHours != null && (
                        <ActualBox label="Labour Hours" value={`${jx.actualLabourHours}h`} />
                      )}
                      {jx.actualLabourCost != null && (
                        <ActualBox
                          label="Labour Cost"
                          value={formatCurrency(jx.actualLabourCost)}
                          sub={labourVariance != null ? `${labourVariance >= 0 ? "+" : ""}${formatCurrency(labourVariance)} vs quoted` : undefined}
                          trend={labourVariance != null ? (labourVariance <= 0 ? "up" : "down") : undefined}
                        />
                      )}
                      {jx.actualMaterialsCost != null && (
                        <ActualBox
                          label="Materials Cost"
                          value={formatCurrency(jx.actualMaterialsCost)}
                          sub={materialVariance != null ? `${materialVariance >= 0 ? "+" : ""}${formatCurrency(materialVariance)} vs quoted` : undefined}
                          trend={materialVariance != null ? (materialVariance <= 0 ? "up" : "down") : undefined}
                        />
                      )}
                      {grossProfit != null && <ActualBox label="Gross Profit" value={formatCurrency(grossProfit)} highlight />}
                      {grossMarginPct != null && <ActualBox label="Gross Margin" value={`${grossMarginPct.toFixed(1)}%`} highlight />}
                    </div>
                    {jx.variationAmount != null && (
                      <div className="bg-secondary/40 rounded-xl border border-border/40 p-4">
                        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Variation</p>
                        <p className="text-sm font-bold">
                          {Number(jx.variationAmount) >= 0 ? "+" : ""}{formatCurrency(Number(jx.variationAmount))}
                          {jx.variationNote && <span className="font-normal text-muted-foreground ml-2">— {jx.variationNote}</span>}
                        </p>
                      </div>
                    )}
                    {jx.completionNotes && (
                      <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Completion Notes</p>
                        <p className="text-sm font-medium text-muted-foreground whitespace-pre-line">{jx.completionNotes}</p>
                      </div>
                    )}
                    {completionPhotos.length > 0 && (
                      <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
                          <Camera className="w-3.5 h-3.5" /> Finished Photos
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {completionPhotos.map((url, i) => (
                            <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                              className="group relative aspect-square rounded-xl overflow-hidden border border-border/60 bg-secondary/40 hover:border-primary/30 transition-all">
                              <img src={url} alt={`Finished photo ${i + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                                <ExternalLink className="w-5 h-5 text-white drop-shadow" />
                              </div>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                    {!completingJob && (
                      <label className={cn(
                        "flex items-center gap-2 text-sm font-semibold text-muted-foreground cursor-pointer hover:text-primary transition-colors",
                        photoUploading && "opacity-50 pointer-events-none"
                      )}>
                        <Camera className="w-4 h-4" />
                        {photoUploading ? "Uploading…" : "Add finished photo"}
                        <input type="file" accept="image/*" className="hidden" disabled={photoUploading} onChange={handleUploadCompletionPhoto} />
                      </label>
                    )}
                  </>
                )}

                {/* ── Production Documents ──────────────────────────────── */}
                <div className="pt-4 border-t border-border/40 space-y-4">
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                    <FileTextIcon className="w-3.5 h-3.5" /> Production Documents
                    <span className="font-normal normal-case text-muted-foreground/60 ml-1">— cutting lists, drawings, invoices, BOMs</span>
                  </p>

                  {prodDocs.length > 0 && (
                    <div className="space-y-2">
                      {prodDocs.map((doc: any) => (
                        <div key={doc.id} className="flex items-center gap-3 p-3 rounded-xl border border-border/40 bg-secondary/30">
                          {doc.mimeType?.startsWith("image/") ? (
                            <div className="w-9 h-9 rounded-lg overflow-hidden border border-border/40 shrink-0 bg-secondary">
                              <img src={doc.url} alt="" className="w-full h-full object-cover" />
                            </div>
                          ) : doc.mimeType?.includes("spreadsheet") || doc.mimeType === "text/csv" || doc.mimeType?.includes("ms-excel") ? (
                            <div className="w-9 h-9 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center justify-center shrink-0">
                              <FileSpreadsheet className="w-4 h-4 text-green-600" />
                            </div>
                          ) : (
                            <div className="w-9 h-9 rounded-lg bg-primary/8 border border-primary/15 flex items-center justify-center shrink-0">
                              <FileTextIcon className="w-4 h-4 text-primary" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <a href={doc.url} target="_blank" rel="noopener noreferrer"
                              className="text-sm font-semibold truncate block hover:text-primary transition-colors">
                              {doc.originalName}
                            </a>
                            <p className="text-xs text-muted-foreground font-medium flex items-center gap-2">
                              {DOC_TYPE_LABELS[doc.docType as keyof typeof DOC_TYPE_LABELS] ?? doc.docType}
                              {doc.fileSizeBytes && <span className="opacity-60">· {formatFileSize(doc.fileSizeBytes)}</span>}
                              {doc.extractionStatus === "completed" && (
                                <span className="text-green-600 dark:text-green-400">· ✓ extracted</span>
                              )}
                              {doc.extractionStatus === "failed" && (
                                <span className="text-amber-600">· extraction failed</span>
                              )}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <a href={doc.url} target="_blank" rel="noopener noreferrer">
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-lg">
                                <ExternalLink className="w-3.5 h-3.5" />
                              </Button>
                            </a>
                            {confirmDeleteId === doc.id ? (
                              <div className="flex items-center gap-1">
                                <Button size="sm" variant="destructive"
                                  className="h-7 px-2 text-xs font-bold rounded-lg"
                                  onClick={() => handleDeleteDoc(doc.id)}>
                                  Remove
                                </Button>
                                <Button size="sm" variant="ghost"
                                  className="h-7 px-2 text-xs rounded-lg"
                                  onClick={() => setConfirmDeleteId(null)}>
                                  Keep
                                </Button>
                              </div>
                            ) : (
                              <Button variant="ghost" size="sm"
                                className="h-8 w-8 p-0 rounded-lg text-muted-foreground hover:text-destructive"
                                onClick={() => setConfirmDeleteId(doc.id)}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-2 flex-wrap">
                    <Select value={newDocType} onValueChange={setNewDocType}>
                      <SelectTrigger className="h-9 w-[200px] text-sm font-semibold rounded-xl border-border/60">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(DOC_TYPE_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value} className="font-semibold">{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <label className={cn(
                      "flex items-center gap-1.5 h-9 px-4 rounded-xl border border-border/60 bg-background text-sm font-semibold cursor-pointer hover:bg-secondary/60 transition-colors",
                      docUploading && "opacity-50 pointer-events-none"
                    )}>
                      <Upload className="w-3.5 h-3.5" />
                      {docUploading ? "Uploading & extracting…" : "Add document"}
                      <input
                        type="file" className="hidden" disabled={docUploading}
                        accept="image/*,application/pdf,.xlsx,.xls,.csv,.docx,.doc"
                        onChange={handleUploadDoc}
                      />
                    </label>
                  </div>
                </div>

                {/* ── Extracted Intelligence ────────────────────────────── */}
                <div className="pt-4 border-t border-border/40">
                  <IntelligenceSection
                    jobId={id}
                    prodDocs={prodDocs}
                    intelligence={intelligence}
                    setIntelligence={setIntelligence}
                    loading={intelLoading}
                  />
                </div>

              </CardContent>
            </Card>
          )}

          {/* Photos from enquiry */}
          {attachments && attachments.length > 0 && (
            <Card className="shadow-sm border-border/60 rounded-2xl">
              <div className="px-6 py-5 border-b border-border/60">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <ImageIcon className="w-5 h-5 text-muted-foreground" /> Site Photos
                </h2>
              </div>
              <CardContent className="p-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {attachments.map((att: any) => (
                    <a key={att.id} href={att.url} target="_blank" rel="noopener noreferrer"
                      className="group relative aspect-square rounded-xl overflow-hidden border border-border/60 bg-secondary/40 hover:border-primary/30 transition-all">
                      {att.mimetype?.startsWith("image/") ? (
                        <img src={att.url} alt={att.filename} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      ) : (
                        <div className="flex flex-col items-center justify-center h-full gap-2">
                          <FileText className="w-8 h-8 text-muted-foreground" />
                          <span className="text-xs font-semibold text-muted-foreground truncate px-2 text-center">{att.filename}</span>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <ExternalLink className="w-5 h-5 text-white drop-shadow" />
                      </div>
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right col — status & scheduling */}
        <div className="space-y-6">

          {/* Status card */}
          <Card className="shadow-sm border-border/60 rounded-2xl">
            <div className="px-6 py-5 border-b border-border/60">
              <h2 className="text-lg font-bold">Job Status</h2>
            </div>
            <CardContent className="p-6 space-y-4 text-center">
              <div className="flex justify-center">
                <JobStatusBadge status={currentStatus} />
              </div>
              <Select value={currentStatus} onValueChange={setStatusVal} disabled={updateJob.isPending}>
                <SelectTrigger className="bg-background border-border/60 font-bold h-12 shadow-sm rounded-xl">
                  <SelectValue placeholder="Update Status" />
                </SelectTrigger>
                <SelectContent>
                  {JOB_STATUSES.map((s) => (
                    <SelectItem key={s} value={s} className="font-semibold cursor-pointer">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {statusVal && statusVal !== job.status && (
                <Button onClick={handleSaveStatus} disabled={updateJob.isPending}
                  className="w-full font-bold hover-elevate h-12 rounded-xl">
                  <Check className="w-4 h-4 mr-2" /> Save Status
                </Button>
              )}
              {!isCompleted && !completingJob && (
                <Button onClick={() => setCompletingJob(true)} variant="outline"
                  className="w-full font-bold h-12 rounded-xl border-green-500/40 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/30">
                  <CheckCircle2 className="w-4 h-4 mr-2" /> Complete Job
                </Button>
              )}
              {isCompleted && (
                <div className="flex items-center justify-center gap-2 text-sm text-green-600 dark:text-green-400 font-bold">
                  <CheckCircle2 className="w-4 h-4" /> Completed {jx.completedAt}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Final invoice — only available once the work is complete */}
          {isCompleted && (
            <Card className="shadow-sm border-border/60 rounded-2xl">
              <div className="px-6 py-5 border-b border-border/60">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <FileText className="w-5 h-5 text-muted-foreground" /> Final Invoice
                </h2>
              </div>
              <CardContent className="p-5 space-y-3">
                {invoicesLoading ? (
                  <Skeleton className="h-11 w-full rounded-xl" />
                ) : finalPaymentAccepted ? (
                  <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-left">
                    <div className="flex items-center gap-2 text-sm font-bold text-green-800">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      Final payment accepted
                    </div>
                    <p className="mt-1 text-xs font-medium text-green-700">
                      {formatCurrency(Number(jobInvoice.totalWithVat))} received
                    </p>
                  </div>
                ) : (
                  <>
                    {jobInvoice?.status === "sent" && (
                      <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-left">
                        <p className="text-sm font-bold text-violet-800">Invoice sent</p>
                        <p className="mt-1 text-xs font-medium text-violet-700">Final payment is still outstanding.</p>
                      </div>
                    )}
                    {!job.customerEmail && (
                      <p className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                        Add the customer’s email to send the final invoice.
                      </p>
                    )}
                    <Button
                      onClick={() => handleSendFinalInvoice(jobInvoice)}
                      disabled={!job.customerEmail || sendingFinalInvoice}
                      className="w-full font-bold h-11 rounded-xl gap-2"
                    >
                      <Send className="w-4 h-4" />
                      {sendingFinalInvoice
                        ? "Sending…"
                        : jobInvoice?.status === "sent"
                          ? "Resend Invoice"
                          : "Send Invoice"}
                    </Button>
                  </>
                )}
                {jobInvoice && (
                  <Link href={`/invoices/${jobInvoice.id}`}>
                    <Button variant="outline" className="w-full font-bold h-10 rounded-xl">
                      View Invoice
                    </Button>
                  </Link>
                )}
              </CardContent>
            </Card>
          )}

          {/* Financial snapshot */}
          <Card className="shadow-sm border-border/60 rounded-2xl">
            <div className="px-6 py-5 border-b border-border/60">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <PoundSterling className="w-5 h-5 text-muted-foreground" /> Financial
              </h2>
            </div>
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-muted-foreground">Total (inc VAT)</span>
                <span className="text-base font-black">{formatCurrency(job.totalWithVat)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-muted-foreground">Materials</span>
                <span className="text-sm font-bold">{formatCurrency(job.materialsAllowance)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-muted-foreground">Labour</span>
                <span className="text-sm font-bold">{formatCurrency(job.labourAllowance)}</span>
              </div>
              {isCompleted && finalCharged != null && (
                <>
                  <div className="border-t border-border/40 pt-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-muted-foreground">Final Charged</span>
                      <span className="text-base font-black text-primary">{formatCurrency(finalCharged)}</span>
                    </div>
                    {quoteVariance != null && (
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs font-semibold text-muted-foreground">Variance</span>
                        <span className={cn(
                          "text-xs font-bold",
                          quoteVariance >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500"
                        )}>
                          {quoteVariance >= 0 ? "+" : ""}{formatCurrency(quoteVariance)}
                        </span>
                      </div>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Scheduling card */}
          <Card className="shadow-sm border-border/60 rounded-2xl">
            <div className="px-6 py-5 border-b border-border/60 flex items-center justify-between">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-muted-foreground" /> Schedule
              </h2>
              {!editingSchedule && (
                <Button variant="ghost" size="sm" onClick={handleOpenSchedule} className="rounded-lg">
                  <Pencil className="w-4 h-4 mr-1" /> Edit
                </Button>
              )}
            </div>
            <CardContent className="p-6 space-y-4">
              {editingSchedule ? (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Site Survey</Label>
                    <Input type="date" value={surveyDate} onChange={e => setSurveyDate(e.target.value)} className="field-input h-10 font-medium" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Install Start</Label>
                    <Input type="date" value={installStartDate} onChange={e => setInstallStartDate(e.target.value)} className="field-input h-10 font-medium" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Install End</Label>
                    <Input type="date" value={installEndDate} onChange={e => setInstallEndDate(e.target.value)} className="field-input h-10 font-medium" />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" onClick={handleSaveSchedule} disabled={scheduleJobMutation.isPending} className="rounded-xl font-bold">
                      <Check className="w-4 h-4 mr-1" /> Save
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingSchedule(false)} className="rounded-xl font-bold">
                      <X className="w-4 h-4 mr-1" /> Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <DateRow icon={Clock} label="Site Survey" value={job.siteSurveyDate} />
                  <DateRow icon={Calendar} label="Install Start" value={job.installationStartDate} />
                  <DateRow icon={Calendar} label="Install End" value={job.installationEndDate} />
                  {!job.siteSurveyDate && !job.installationStartDate && !job.installationEndDate && (
                    <p className="text-sm text-muted-foreground font-medium italic">No dates scheduled yet.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Enquiry link */}
          {enquiry && (
            <Card className="shadow-sm border-border/60 rounded-2xl">
              <div className="px-6 py-5 border-b border-border/60">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <User className="w-5 h-5 text-muted-foreground" /> Enquiry
                </h2>
              </div>
              <CardContent className="p-6 space-y-3">
                <p className="text-sm font-semibold">{enquiry.customerName}</p>
                {enquiry.customerEmail && (
                  <p className="text-sm text-muted-foreground font-medium flex items-center gap-2">
                    <Mail className="w-4 h-4 shrink-0" /> {enquiry.customerEmail}
                  </p>
                )}
                {enquiry.description && (
                  <p className="text-sm text-muted-foreground font-medium line-clamp-3">{enquiry.description}</p>
                )}
                <Link href={`/enquiries/${enquiry.id}`}>
                  <Button variant="outline" size="sm" className="w-full rounded-xl font-bold mt-2">
                    View Enquiry
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Production document helpers ───────────────────────────────────────────────
const DOC_TYPE_LABELS = {
  cutting_list:      "Cutting List",
  bill_of_materials: "Bill of Materials",
  drawings:          "Workshop / Mfg Drawings",
  supplier_invoice:  "Supplier Invoice",
  other:             "Other",
} as const;

function formatFileSize(bytes: number): string {
  if (bytes < 1024)        return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// ── InfoBox / ActualBox / DateRow ─────────────────────────────────────────────
function InfoBox({ icon: Icon, label, value }: { icon: any; label: string; value?: string | null }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-muted-foreground">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <p className={cn("text-sm font-bold", !value && "text-muted-foreground italic font-medium")}>
        {value ?? "Not provided"}
      </p>
    </div>
  );
}

function ActualBox({ label, value, sub, highlight, trend }: {
  label: string; value: string; sub?: string; highlight?: boolean; trend?: "up" | "down";
}) {
  return (
    <div className={cn(
      "rounded-xl border p-4",
      highlight ? "bg-primary/5 border-primary/20" : "bg-secondary/40 border-border/40"
    )}>
      <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">{label}</p>
      <p className={cn("text-sm font-bold", highlight && "text-primary")}>{value}</p>
      {sub && (
        <p className={cn(
          "text-xs font-semibold mt-0.5 flex items-center gap-1",
          trend === "up" ? "text-green-600 dark:text-green-400" : trend === "down" ? "text-red-500" : "text-muted-foreground"
        )}>
          {trend === "up" && <TrendingUp className="w-3 h-3" />}
          {trend === "down" && <TrendingDown className="w-3 h-3" />}
          {sub}
        </p>
      )}
    </div>
  );
}

function DateRow({ icon: Icon, label, value }: { icon: any; label: string; value?: string | null }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <Icon className="w-4 h-4" /> {label}
      </span>
      <span className={cn("text-sm font-bold", !value && "text-muted-foreground italic font-medium")}>
        {value ?? "—"}
      </span>
    </div>
  );
}

// ── Intelligence status badge ─────────────────────────────────────────────────
function IntelStatusBadge({ status, confidence }: { status: string; confidence?: string | null }) {
  const conf = confidence != null ? Number(confidence) : null;
  if (status === "reviewed") return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
      <Check className="w-3 h-3" /> Reviewed
    </span>
  );
  if (status === "corrected") return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
      <Pencil className="w-3 h-3" /> Corrected
    </span>
  );
  if (status === "manually_added") return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-secondary text-muted-foreground">
      Manual
    </span>
  );
  // ai_extracted
  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold",
      conf != null && conf < 0.6
        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
        : "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400"
    )}>
      <Brain className="w-3 h-3" /> AI{conf != null && conf < 0.7 ? ` ${Math.round(conf * 100)}%` : ""}
    </span>
  );
}

// ── Dim formatter ─────────────────────────────────────────────────────────────
function fmtDim(v: string | null | undefined): string {
  if (v == null || v === "") return "";
  const n = Number(v);
  return isFinite(n) ? String(n % 1 === 0 ? n : n.toFixed(1)) : v;
}

function fmtFinished(c: IntelComponent): string {
  const parts = [fmtDim(c.finishedLengthMm), fmtDim(c.finishedWidthMm), fmtDim(c.finishedThicknessMm)].filter(Boolean);
  return parts.length ? parts.join(" × ") + " mm" : "—";
}

function fmtSawn(c: IntelComponent): string {
  const parts = [fmtDim(c.sawnLengthMm), fmtDim(c.sawnWidthMm), fmtDim(c.sawnThicknessMm)].filter(Boolean);
  return parts.length ? parts.join(" × ") + " mm" : "";
}

// ── Intelligence Section ──────────────────────────────────────────────────────
function IntelligenceSection({
  jobId, prodDocs, intelligence, setIntelligence, loading,
}: {
  jobId: number;
  prodDocs: any[];
  intelligence: Intelligence;
  setIntelligence: React.Dispatch<React.SetStateAction<Intelligence>>;
  loading: boolean;
}) {
  const { toast } = useToast();
  const [expandedRow, setExpandedRow] = useState<{ type: "component" | "invoice"; id: number } | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [confirmDeleteRow, setConfirmDeleteRow] = useState<{ type: "component" | "invoice"; id: number } | null>(null);

  const docById = Object.fromEntries(prodDocs.map(d => [d.id, d]));

  const openEdit = (type: "component" | "invoice", row: any) => {
    setExpandedRow({ type, id: row.id });
    // Pre-fill form with current values
    const form: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) {
      if (v != null && typeof v !== "object") form[k] = String(v);
    }
    setEditForm(form);
  };

  const handleConfirm = async (type: "component" | "invoice", rowId: number) => {
    const endpoint = type === "component"
      ? `/api/jobs/${jobId}/intelligence/components/${rowId}`
      : `/api/jobs/${jobId}/intelligence/invoice-lines/${rowId}`;
    try {
      const r = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extractionStatus: "reviewed" }),
      });
      if (!r.ok) throw new Error();
      const updated = await r.json();
      setIntelligence(prev => ({
        components: type === "component"
          ? prev.components.map(c => c.id === rowId ? updated : c)
          : prev.components,
        invoiceLines: type === "invoice"
          ? prev.invoiceLines.map(l => l.id === rowId ? updated : l)
          : prev.invoiceLines,
      }));
    } catch {
      toast({ title: "Failed to confirm", variant: "destructive" });
    }
  };

  const handleSaveEdit = async () => {
    if (!expandedRow) return;
    setSaving(true);
    const { type, id: rowId } = expandedRow;
    const endpoint = type === "component"
      ? `/api/jobs/${jobId}/intelligence/components/${rowId}`
      : `/api/jobs/${jobId}/intelligence/invoice-lines/${rowId}`;
    try {
      const r = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...editForm, extractionStatus: "corrected" }),
      });
      if (!r.ok) throw new Error();
      const updated = await r.json();
      setIntelligence(prev => ({
        components: type === "component"
          ? prev.components.map(c => c.id === rowId ? updated : c)
          : prev.components,
        invoiceLines: type === "invoice"
          ? prev.invoiceLines.map(l => l.id === rowId ? updated : l)
          : prev.invoiceLines,
      }));
      setExpandedRow(null);
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (type: "component" | "invoice", rowId: number) => {
    const endpoint = type === "component"
      ? `/api/jobs/${jobId}/intelligence/components/${rowId}`
      : `/api/jobs/${jobId}/intelligence/invoice-lines/${rowId}`;
    try {
      const r = await fetch(endpoint, { method: "DELETE" });
      if (!r.ok) throw new Error();
      setIntelligence(prev => ({
        components: type === "component" ? prev.components.filter(c => c.id !== rowId) : prev.components,
        invoiceLines: type === "invoice" ? prev.invoiceLines.filter(l => l.id !== rowId) : prev.invoiceLines,
      }));
      setConfirmDeleteRow(null);
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  };

  const handleAddComponent = async (documentId: number) => {
    try {
      const r = await fetch(`/api/jobs/${jobId}/intelligence/components`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId, extractionStatus: "manually_added" }),
      });
      if (!r.ok) throw new Error();
      const row = await r.json();
      setIntelligence(prev => ({ ...prev, components: [...prev.components, row] }));
      openEdit("component", row);
    } catch {
      toast({ title: "Failed to add item", variant: "destructive" });
    }
  };

  const handleAddInvoiceLine = async (documentId: number) => {
    try {
      const r = await fetch(`/api/jobs/${jobId}/intelligence/invoice-lines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId, extractionStatus: "manually_added" }),
      });
      if (!r.ok) throw new Error();
      const row = await r.json();
      setIntelligence(prev => ({ ...prev, invoiceLines: [...prev.invoiceLines, row] }));
      openEdit("invoice", row);
    } catch {
      toast({ title: "Failed to add line", variant: "destructive" });
    }
  };

  const hasAny = intelligence.components.length > 0 || intelligence.invoiceLines.length > 0;

  // Group by document
  const componentDocIds = [...new Set(intelligence.components.map(c => c.documentId))];
  const invoiceDocIds = [...new Set(intelligence.invoiceLines.map(l => l.documentId))];

  const allDocIds = [...new Set([...componentDocIds, ...invoiceDocIds])];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
          <Brain className="w-3.5 h-3.5" /> Extracted Intelligence
        </p>
        {loading && <span className="text-xs text-muted-foreground animate-pulse">Extracting…</span>}
      </div>

      {!hasAny && !loading && (
        <p className="text-sm text-muted-foreground font-medium italic">
          Upload a cutting list or supplier invoice above — WorkRate will extract structured component and cost data automatically.
        </p>
      )}

      {allDocIds.map(docId => {
        const doc = docById[docId];
        const components = intelligence.components.filter(c => c.documentId === docId);
        const invoiceLines = intelligence.invoiceLines.filter(l => l.documentId === docId);
        const isInvoice = invoiceLines.length > 0;
        const docLabel = doc ? (DOC_TYPE_LABELS[doc.docType as keyof typeof DOC_TYPE_LABELS] ?? doc.docType) : "";
        const docName = doc?.originalName ?? `Document #${docId}`;

        return (
          <div key={docId} className="rounded-xl border border-border/50 overflow-hidden">
            {/* Doc header */}
            <div className="px-4 py-3 bg-secondary/30 border-b border-border/40 flex items-center gap-2">
              <FileTextIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs font-bold text-foreground/80 truncate">{docName}</span>
              <span className="text-xs text-muted-foreground shrink-0">· {docLabel}</span>
              <span className="ml-auto text-xs font-semibold text-muted-foreground shrink-0">
                {isInvoice ? `${invoiceLines.length} line${invoiceLines.length !== 1 ? "s" : ""}` : `${components.length} item${components.length !== 1 ? "s" : ""}`}
              </span>
            </div>

            {/* Components table */}
            {components.length > 0 && (
              <div className="divide-y divide-border/30">
                {/* Header */}
                <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_3rem_minmax(0,10rem)_minmax(0,8rem)_7rem_5rem] gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground bg-secondary/20">
                  <span>Item</span><span className="text-center">Qty</span><span>Finished (L×W×T)</span><span>Material</span><span>Status</span><span />
                </div>
                {components.map(comp => {
                  const isExpanded = expandedRow?.type === "component" && expandedRow.id === comp.id;
                  const isConfirmDelete = confirmDeleteRow?.type === "component" && confirmDeleteRow.id === comp.id;
                  return (
                    <div key={comp.id}>
                      {/* Row */}
                      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] sm:grid-cols-[minmax(0,1fr)_3rem_minmax(0,10rem)_minmax(0,8rem)_7rem_5rem] gap-2 items-center px-4 py-2.5 hover:bg-secondary/20 transition-colors">
                        <span className="text-sm font-semibold truncate">{comp.itemName ?? <span className="text-muted-foreground italic font-medium">Unnamed</span>}</span>
                        <span className="text-sm font-medium text-center">{comp.quantity ?? "—"}</span>
                        <span className="hidden sm:block text-xs font-medium text-muted-foreground">
                          {fmtFinished(comp)}
                          {fmtSawn(comp) && <span className="block text-muted-foreground/60 text-xs">sawn: {fmtSawn(comp)}</span>}
                        </span>
                        <span className="hidden sm:block text-xs font-medium text-muted-foreground truncate">
                          {comp.timberSpecies ? `${comp.timberSpecies}${comp.material ? ` (${comp.material})` : ""}` : comp.boardType ?? comp.material ?? "—"}
                        </span>
                        <span className="hidden sm:flex">
                          <IntelStatusBadge status={comp.extractionStatus} confidence={comp.confidenceScore} />
                        </span>
                        <div className="flex items-center gap-0.5 justify-end">
                          {comp.extractionStatus !== "reviewed" && comp.extractionStatus !== "corrected" && (
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-green-600"
                              title="Confirm" onClick={() => handleConfirm("component", comp.id)}>
                              <Check className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-foreground"
                            title="Edit" onClick={() => isExpanded ? setExpandedRow(null) : openEdit("component", comp)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          {isConfirmDelete ? (
                            <div className="flex items-center gap-1">
                              <Button size="sm" variant="destructive" className="h-6 px-1.5 text-xs rounded-lg"
                                onClick={() => handleDelete("component", comp.id)}>✕</Button>
                              <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs rounded-lg"
                                onClick={() => setConfirmDeleteRow(null)}>Keep</Button>
                            </div>
                          ) : (
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-destructive"
                              onClick={() => setConfirmDeleteRow({ type: "component", id: comp.id })}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Expanded edit form */}
                      {isExpanded && (
                        <div className="px-4 pb-4 pt-1 bg-secondary/20 border-t border-border/30 space-y-3">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="space-y-1 col-span-2 sm:col-span-2">
                              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Item Name</Label>
                              <Input value={editForm.itemName ?? ""} onChange={e => setEditForm(f => ({ ...f, itemName: e.target.value }))} className="h-9 text-sm" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Qty</Label>
                              <Input type="number" value={editForm.quantity ?? ""} onChange={e => setEditForm(f => ({ ...f, quantity: e.target.value }))} className="h-9 text-sm" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Material</Label>
                              <select value={editForm.material ?? ""} onChange={e => setEditForm(f => ({ ...f, material: e.target.value }))}
                                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm font-medium ring-offset-background">
                                <option value="">—</option>
                                <option value="timber">Timber</option>
                                <option value="sheet">Sheet</option>
                                <option value="hardware">Hardware</option>
                                <option value="other">Other</option>
                              </select>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                              Finished dimensions (L × W × T) mm
                              <span className="ml-1 normal-case font-normal text-muted-foreground/70">— size after machining/planing</span>
                            </Label>
                            <div className="grid grid-cols-3 gap-2">
                              <Input placeholder="Length" type="number" value={editForm.finishedLengthMm ?? ""} onChange={e => setEditForm(f => ({ ...f, finishedLengthMm: e.target.value }))} className="h-9 text-sm" />
                              <Input placeholder="Width" type="number" value={editForm.finishedWidthMm ?? ""} onChange={e => setEditForm(f => ({ ...f, finishedWidthMm: e.target.value }))} className="h-9 text-sm" />
                              <Input placeholder="Thickness" type="number" value={editForm.finishedThicknessMm ?? ""} onChange={e => setEditForm(f => ({ ...f, finishedThicknessMm: e.target.value }))} className="h-9 text-sm" />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                              Sawn / nominal stock dimensions mm
                              <span className="ml-1 normal-case font-normal text-muted-foreground/70">— leave blank if not in the document</span>
                            </Label>
                            <div className="grid grid-cols-3 gap-2">
                              <Input placeholder="Length" type="number" value={editForm.sawnLengthMm ?? ""} onChange={e => setEditForm(f => ({ ...f, sawnLengthMm: e.target.value }))} className="h-9 text-sm" />
                              <Input placeholder="Width" type="number" value={editForm.sawnWidthMm ?? ""} onChange={e => setEditForm(f => ({ ...f, sawnWidthMm: e.target.value }))} className="h-9 text-sm" />
                              <Input placeholder="Thickness" type="number" value={editForm.sawnThicknessMm ?? ""} onChange={e => setEditForm(f => ({ ...f, sawnThicknessMm: e.target.value }))} className="h-9 text-sm" />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="space-y-1">
                              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Species</Label>
                              <Input placeholder="e.g. Accoya" value={editForm.timberSpecies ?? ""} onChange={e => setEditForm(f => ({ ...f, timberSpecies: e.target.value }))} className="h-9 text-sm" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Grade</Label>
                              <Input value={editForm.timberGrade ?? ""} onChange={e => setEditForm(f => ({ ...f, timberGrade: e.target.value }))} className="h-9 text-sm" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Board Type</Label>
                              <Input placeholder="e.g. MDF, plywood" value={editForm.boardType ?? ""} onChange={e => setEditForm(f => ({ ...f, boardType: e.target.value }))} className="h-9 text-sm" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Finish</Label>
                              <Input value={editForm.sheetFinish ?? ""} onChange={e => setEditForm(f => ({ ...f, sheetFinish: e.target.value }))} className="h-9 text-sm" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Unit Cost (£)</Label>
                              <Input type="number" step="0.01" value={editForm.unitCost ?? ""} onChange={e => setEditForm(f => ({ ...f, unitCost: e.target.value }))} className="h-9 text-sm" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Total Cost (£)</Label>
                              <Input type="number" step="0.01" value={editForm.totalCost ?? ""} onChange={e => setEditForm(f => ({ ...f, totalCost: e.target.value }))} className="h-9 text-sm" />
                            </div>
                            <div className="space-y-1 col-span-2">
                              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Supplier / Hardware Ref</Label>
                              <Input value={editForm.supplierRef ?? ""} onChange={e => setEditForm(f => ({ ...f, supplierRef: e.target.value }))} className="h-9 text-sm" />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Notes</Label>
                            <Input value={editForm.notes ?? ""} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} className="h-9 text-sm" />
                          </div>
                          {comp.originalExtractedText && (
                            <p className="text-xs text-muted-foreground/60 font-medium">
                              Original AI reading: <span className="italic">{comp.originalExtractedText.slice(0, 120)}{comp.originalExtractedText.length > 120 ? "…" : ""}</span>
                            </p>
                          )}
                          <div className="flex gap-2 pt-1 border-t border-border/30">
                            <Button size="sm" onClick={handleSaveEdit} disabled={saving} className="rounded-xl font-bold h-8">
                              <Check className="w-3.5 h-3.5 mr-1" /> {saving ? "Saving…" : "Save as Corrected"}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setExpandedRow(null)} className="rounded-xl font-bold h-8">
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Invoice lines table */}
            {invoiceLines.length > 0 && (
              <div className="divide-y divide-border/30">
                {/* Invoice header info */}
                {(() => {
                  const first = invoiceLines[0];
                  return (first.supplierName || first.invoiceNumber) ? (
                    <div className="px-4 py-2 text-xs text-muted-foreground font-medium bg-secondary/10">
                      {first.supplierName && <span className="font-semibold text-foreground/70">{first.supplierName}</span>}
                      {first.invoiceNumber && <span className="ml-2">· Inv #{first.invoiceNumber}</span>}
                      {first.invoiceDate && <span className="ml-2">· {first.invoiceDate}</span>}
                    </div>
                  ) : null;
                })()}
                {/* Column headers */}
                <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_3.5rem_4rem_5.5rem_5.5rem_7rem_5rem] gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground bg-secondary/20">
                  <span>Description</span><span className="text-center">Qty</span><span>Unit</span>
                  <span className="text-right">Unit Price</span><span className="text-right">Total</span>
                  <span>Status</span><span />
                </div>
                {invoiceLines.map(line => {
                  const isExpanded = expandedRow?.type === "invoice" && expandedRow.id === line.id;
                  const isConfirmDelete = confirmDeleteRow?.type === "invoice" && confirmDeleteRow.id === line.id;
                  return (
                    <div key={line.id}>
                      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] sm:grid-cols-[minmax(0,1fr)_3.5rem_4rem_5.5rem_5.5rem_7rem_5rem] gap-2 items-center px-4 py-2.5 hover:bg-secondary/20 transition-colors">
                        <span className="text-sm font-semibold truncate">{line.itemDescription ?? <span className="text-muted-foreground italic font-medium">No description</span>}</span>
                        <span className="hidden sm:block text-sm font-medium text-center">{line.quantity ?? "—"}</span>
                        <span className="hidden sm:block text-xs font-medium text-muted-foreground">{line.unit ?? "—"}</span>
                        <span className="hidden sm:block text-sm font-medium text-right">{line.unitPrice != null ? `£${Number(line.unitPrice).toFixed(2)}` : "—"}</span>
                        <span className="hidden sm:block text-sm font-semibold text-right">{line.lineTotal != null ? `£${Number(line.lineTotal).toFixed(2)}` : "—"}</span>
                        <span className="hidden sm:flex"><IntelStatusBadge status={line.extractionStatus} confidence={line.confidenceScore} /></span>
                        <div className="flex items-center gap-0.5 justify-end">
                          {line.extractionStatus !== "reviewed" && line.extractionStatus !== "corrected" && (
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-green-600"
                              title="Confirm" onClick={() => handleConfirm("invoice", line.id)}>
                              <Check className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-foreground"
                            onClick={() => isExpanded ? setExpandedRow(null) : openEdit("invoice", line)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          {isConfirmDelete ? (
                            <div className="flex items-center gap-1">
                              <Button size="sm" variant="destructive" className="h-6 px-1.5 text-xs rounded-lg"
                                onClick={() => handleDelete("invoice", line.id)}>✕</Button>
                              <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs rounded-lg"
                                onClick={() => setConfirmDeleteRow(null)}>Keep</Button>
                            </div>
                          ) : (
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-destructive"
                              onClick={() => setConfirmDeleteRow({ type: "invoice", id: line.id })}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Expanded edit form — invoice line */}
                      {isExpanded && (
                        <div className="px-4 pb-4 pt-1 bg-secondary/20 border-t border-border/30 space-y-3">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="space-y-1 col-span-2">
                              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Description</Label>
                              <Input value={editForm.itemDescription ?? ""} onChange={e => setEditForm(f => ({ ...f, itemDescription: e.target.value }))} className="h-9 text-sm" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Qty</Label>
                              <Input type="number" value={editForm.quantity ?? ""} onChange={e => setEditForm(f => ({ ...f, quantity: e.target.value }))} className="h-9 text-sm" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Unit</Label>
                              <Input placeholder="each, m, sheet…" value={editForm.unit ?? ""} onChange={e => setEditForm(f => ({ ...f, unit: e.target.value }))} className="h-9 text-sm" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Unit Price (£)</Label>
                              <Input type="number" step="0.01" value={editForm.unitPrice ?? ""} onChange={e => setEditForm(f => ({ ...f, unitPrice: e.target.value }))} className="h-9 text-sm" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Line Total (£)</Label>
                              <Input type="number" step="0.01" value={editForm.lineTotal ?? ""} onChange={e => setEditForm(f => ({ ...f, lineTotal: e.target.value }))} className="h-9 text-sm" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">VAT (£)</Label>
                              <Input type="number" step="0.01" value={editForm.vatAmount ?? ""} onChange={e => setEditForm(f => ({ ...f, vatAmount: e.target.value }))} className="h-9 text-sm" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Product Ref</Label>
                              <Input value={editForm.productRef ?? ""} onChange={e => setEditForm(f => ({ ...f, productRef: e.target.value }))} className="h-9 text-sm" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Category</Label>
                              <Input placeholder="e.g. Timber, Sheet" value={editForm.materialCategory ?? ""} onChange={e => setEditForm(f => ({ ...f, materialCategory: e.target.value }))} className="h-9 text-sm" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Supplier</Label>
                              <Input value={editForm.supplierName ?? ""} onChange={e => setEditForm(f => ({ ...f, supplierName: e.target.value }))} className="h-9 text-sm" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Invoice #</Label>
                              <Input value={editForm.invoiceNumber ?? ""} onChange={e => setEditForm(f => ({ ...f, invoiceNumber: e.target.value }))} className="h-9 text-sm" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Invoice Date</Label>
                              <Input value={editForm.invoiceDate ?? ""} onChange={e => setEditForm(f => ({ ...f, invoiceDate: e.target.value }))} className="h-9 text-sm" />
                            </div>
                          </div>
                          {line.originalExtractedText && (
                            <p className="text-xs text-muted-foreground/60 font-medium">
                              Original AI reading: <span className="italic">{line.originalExtractedText.slice(0, 120)}{line.originalExtractedText.length > 120 ? "…" : ""}</span>
                            </p>
                          )}
                          <div className="flex gap-2 pt-1 border-t border-border/30">
                            <Button size="sm" onClick={handleSaveEdit} disabled={saving} className="rounded-xl font-bold h-8">
                              <Check className="w-3.5 h-3.5 mr-1" /> {saving ? "Saving…" : "Save as Corrected"}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setExpandedRow(null)} className="rounded-xl font-bold h-8">
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add manually */}
            <div className="px-4 py-2 bg-secondary/10 border-t border-border/30 flex gap-3">
              {(components.length > 0 || invoiceLines.length === 0) && (
                <button onClick={() => handleAddComponent(docId)}
                  className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-primary transition-colors">
                  <Plus className="w-3 h-3" /> Add component
                </button>
              )}
              {(invoiceLines.length > 0 || components.length === 0) && (
                <button onClick={() => handleAddInvoiceLine(docId)}
                  className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-primary transition-colors">
                  <Plus className="w-3 h-3" /> Add invoice line
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
