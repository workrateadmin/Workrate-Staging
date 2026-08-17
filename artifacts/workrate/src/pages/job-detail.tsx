import {
  useGetJob,
  useUpdateJob,
  useScheduleJob,
  useGetEnquiry,
  useListEnquiryAttachments,
  getGetEnquiryQueryKey,
  getGetJobQueryKey,
  getListEnquiryAttachmentsQueryKey,
} from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useState, useEffect } from "react";
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
  const { data: attachments } = useListEnquiryAttachments(enquiryId, {
    query: { enabled: !!job?.enquiryId, queryKey: getListEnquiryAttachmentsQueryKey(enquiryId) },
  });

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
      toast({ title: "Document uploaded" });
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
              {/* Final amount charged */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Final Amount Charged (£)</Label>
                <Input
                  type="number" min="0" step="0.01"
                  placeholder="e.g. 4800"
                  value={completionForm.finalAmountCharged}
                  onChange={(e) => setCompletionForm(f => ({ ...f, finalAmountCharged: e.target.value }))}
                  className="field-input font-medium h-10"
                />
              </div>
              {/* Completion date */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Completion Date</Label>
                <Input
                  type="date"
                  value={completionForm.completedAt}
                  onChange={(e) => setCompletionForm(f => ({ ...f, completedAt: e.target.value }))}
                  className="field-input font-medium h-10"
                />
              </div>
              {/* Labour hours */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Total Labour Hours</Label>
                <Input
                  type="number" min="0" step="0.5"
                  placeholder="e.g. 24"
                  value={completionForm.actualLabourHours}
                  onChange={(e) => setCompletionForm(f => ({ ...f, actualLabourHours: e.target.value }))}
                  className="field-input font-medium h-10"
                />
              </div>
              {/* Labour cost */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Labour Cost (£) <span className="normal-case font-normal text-muted-foreground/70">optional</span></Label>
                <Input
                  type="number" min="0" step="0.01"
                  placeholder="e.g. 840"
                  value={completionForm.actualLabourCost}
                  onChange={(e) => setCompletionForm(f => ({ ...f, actualLabourCost: e.target.value }))}
                  className="field-input font-medium h-10"
                />
              </div>
              {/* Materials cost */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Materials Cost (£)</Label>
                <Input
                  type="number" min="0" step="0.01"
                  placeholder="e.g. 1200"
                  value={completionForm.actualMaterialsCost}
                  onChange={(e) => setCompletionForm(f => ({ ...f, actualMaterialsCost: e.target.value }))}
                  className="field-input font-medium h-10"
                />
              </div>
              {/* Variation amount */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Variation (£) <span className="normal-case font-normal text-muted-foreground/70">+ added / − removed</span></Label>
                <Input
                  type="number" step="0.01"
                  placeholder="e.g. 250 or -150"
                  value={completionForm.variationAmount}
                  onChange={(e) => setCompletionForm(f => ({ ...f, variationAmount: e.target.value }))}
                  className="field-input font-medium h-10"
                />
              </div>
            </div>
            {/* Variation note */}
            {completionForm.variationAmount && (
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Variation Reason</Label>
                <Input
                  placeholder="e.g. Extra shelf run added on site"
                  value={completionForm.variationNote}
                  onChange={(e) => setCompletionForm(f => ({ ...f, variationNote: e.target.value }))}
                  className="field-input font-medium h-10"
                />
              </div>
            )}
            {/* Completion notes */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Completion Notes <span className="normal-case font-normal text-muted-foreground/70">optional</span></Label>
              <Textarea
                rows={3}
                placeholder="Any notes on how the job went, issues encountered, snagging…"
                value={completionForm.completionNotes}
                onChange={(e) => setCompletionForm(f => ({ ...f, completionNotes: e.target.value }))}
                className="field-input resize-none font-medium"
              />
            </div>
            {/* Finished photos */}
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
            {/* Actions */}
            <div className="flex gap-3 pt-2 border-t border-border/40">
              <Button
                onClick={handleCompleteJob}
                disabled={completionSaving}
                className="font-bold h-11 rounded-xl bg-green-600 hover:bg-green-700 text-white px-6"
              >
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
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setNotesVal(job.notes ?? ""); setEditingNotes(true); }}
                  className="rounded-lg"
                >
                  <Pencil className="w-4 h-4 mr-1" /> Edit
                </Button>
              )}
            </div>
            <CardContent className="p-6">
              {editingNotes ? (
                <div className="space-y-3">
                  <Textarea
                    rows={5}
                    value={notesVal}
                    onChange={(e) => setNotesVal(e.target.value)}
                    className="field-input resize-none font-medium"
                    placeholder="Job notes, special requirements, access info…"
                  />
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
                    {/* Variation */}
                    {jx.variationAmount != null && (
                      <div className="bg-secondary/40 rounded-xl border border-border/40 p-4">
                        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Variation</p>
                        <p className="text-sm font-bold">
                          {Number(jx.variationAmount) >= 0 ? "+" : ""}{formatCurrency(Number(jx.variationAmount))}
                          {jx.variationNote && <span className="font-normal text-muted-foreground ml-2">— {jx.variationNote}</span>}
                        </p>
                      </div>
                    )}
                    {/* Completion notes */}
                    {jx.completionNotes && (
                      <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Completion Notes</p>
                        <p className="text-sm font-medium text-muted-foreground whitespace-pre-line">{jx.completionNotes}</p>
                      </div>
                    )}
                    {/* Finished photos */}
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
                    {/* Add more photos */}
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

                  {/* Doc list */}
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
                            <p className="text-xs text-muted-foreground font-medium">
                              {DOC_TYPE_LABELS[doc.docType as keyof typeof DOC_TYPE_LABELS] ?? doc.docType}
                              {doc.fileSizeBytes && <span className="ml-2 opacity-60">· {formatFileSize(doc.fileSizeBytes)}</span>}
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

                  {/* Upload row */}
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
                      {docUploading ? "Uploading…" : "Add document"}
                      <input
                        type="file"
                        className="hidden"
                        disabled={docUploading}
                        accept="image/*,application/pdf,.xlsx,.xls,.csv,.docx,.doc"
                        onChange={handleUploadDoc}
                      />
                    </label>
                  </div>
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
                    <a
                      key={att.id}
                      href={att.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group relative aspect-square rounded-xl overflow-hidden border border-border/60 bg-secondary/40 hover:border-primary/30 transition-all"
                    >
                      {att.mimetype?.startsWith("image/") ? (
                        <img
                          src={att.url}
                          alt={att.filename}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
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
                <Button
                  onClick={handleSaveStatus}
                  disabled={updateJob.isPending}
                  className="w-full font-bold hover-elevate h-12 rounded-xl"
                >
                  <Check className="w-4 h-4 mr-2" /> Save Status
                </Button>
              )}
              {!isCompleted && !completingJob && (
                <Button
                  onClick={() => setCompletingJob(true)}
                  variant="outline"
                  className="w-full font-bold h-12 rounded-xl border-green-500/40 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/30"
                >
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

          {/* Scheduling */}
          <Card className="shadow-sm border-border/60 rounded-2xl">
            <div className="px-6 py-5 border-b border-border/60 flex items-center justify-between">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-muted-foreground" /> Scheduling
              </h2>
              {!editingSchedule && (
                <Button variant="ghost" size="sm" onClick={handleOpenSchedule} className="rounded-lg">
                  <Pencil className="w-4 h-4" />
                </Button>
              )}
            </div>
            <CardContent className="p-6">
              {editingSchedule ? (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-teal-500" />
                      <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Site Survey</Label>
                    </div>
                    <Input type="date" value={surveyDate} onChange={(e) => setSurveyDate(e.target.value)} className="field-input font-medium h-10" />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Install Start</Label>
                    </div>
                    <Input type="date" value={installStartDate} onChange={(e) => setInstallStartDate(e.target.value)} className="field-input font-medium h-10" />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-amber-500" />
                      <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Install End</Label>
                    </div>
                    <Input type="date" value={installEndDate} onChange={(e) => setInstallEndDate(e.target.value)} className="field-input font-medium h-10" />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" onClick={handleSaveSchedule} disabled={scheduleJobMutation.isPending} className="flex-1 rounded-xl font-bold">
                      <Check className="w-4 h-4 mr-1" /> Save
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingSchedule(false)} className="rounded-xl font-bold">
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <ScheduleRow dot="bg-teal-500" label="Survey" value={job.siteSurveyDate} />
                  <ScheduleRow dot="bg-green-500" label="Install Start" value={job.installationStartDate} />
                  <ScheduleRow dot="bg-amber-500" label="Install End" value={job.installationEndDate} />
                  {!job.siteSurveyDate && !job.installationStartDate && !job.installationEndDate && (
                    <p className="text-sm text-muted-foreground font-medium italic">Not scheduled yet.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Linked enquiry */}
          <Card className="shadow-sm border-border/60 rounded-2xl">
            <div className="px-6 py-5 border-b border-border/60">
              <h2 className="text-lg font-bold">Source Enquiry</h2>
            </div>
            <CardContent className="p-6 space-y-3">
              <p className="text-sm text-muted-foreground font-semibold">ENQ-{job.enquiryId}</p>
              {enquiry && (
                <p className="text-xs text-muted-foreground font-medium">
                  Received {formatDate(enquiry.createdAt)}
                </p>
              )}
              <div className="flex gap-2">
                <Link href={`/enquiries/${job.enquiryId}`} className="flex-1">
                  <Button variant="outline" size="sm" className="w-full rounded-xl font-bold">
                    View Lead
                  </Button>
                </Link>
                {job.quoteId && (
                  <Link href={`/quotes/${job.enquiryId}`} className="flex-1">
                    <Button variant="outline" size="sm" className="w-full rounded-xl font-bold">
                      View Quote
                    </Button>
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Assigned team (future) */}
          <Card className="shadow-sm border-border/60 rounded-2xl opacity-60">
            <div className="px-6 py-5 border-b border-border/60">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <User className="w-5 h-5 text-muted-foreground" /> Assigned Team
              </h2>
            </div>
            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground font-medium italic">
                {job.assignedTeam ?? "Coming soon — team management."}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ── Schedule row ──────────────────────────────────────────────────────────────
function ScheduleRow({ dot, label, value }: { dot: string; label: string; value?: string | null }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <div className={cn("w-2.5 h-2.5 rounded-full shrink-0", dot)} />
      <span className="text-muted-foreground font-semibold w-24 shrink-0">{label}</span>
      <span className={cn("font-bold", value ? "text-foreground" : "text-muted-foreground/50 italic font-normal")}>
        {value ?? "Not set"}
      </span>
    </div>
  );
}

// ── Info box ──────────────────────────────────────────────────────────────────
function InfoBox({ icon: Icon, label, value }: { icon: any; label: string; value?: string | number | null }) {
  return (
    <div className="bg-secondary/40 rounded-xl border border-border/40 p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{label}</p>
      </div>
      <p className={cn("text-sm font-bold", !value && "text-muted-foreground italic font-medium")}>
        {value ?? "Not provided"}
      </p>
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

// ── Actual box (job completion actuals) ───────────────────────────────────────
function ActualBox({
  label,
  value,
  sub,
  highlight,
  trend,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
  trend?: "up" | "down";
}) {
  return (
    <div className={cn(
      "rounded-xl border p-4",
      highlight
        ? "bg-primary/5 border-primary/20"
        : "bg-secondary/40 border-border/40"
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
