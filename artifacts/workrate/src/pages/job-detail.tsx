import {
  useGetJob,
  useUpdateJob,
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
import { useState } from "react";
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

  const updateJob = useUpdateJob({
    mutation: {
      onSuccess: (data) => {
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
            </CardContent>
          </Card>

          {/* Install date */}
          <Card className="shadow-sm border-border/60 rounded-2xl">
            <div className="px-6 py-5 border-b border-border/60 flex items-center justify-between">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-muted-foreground" /> Install Date
              </h2>
              {!editingInstall && (
                <Button variant="ghost" size="sm" onClick={() => { setInstallVal(job.installDate ?? ""); setEditingInstall(true); }} className="rounded-lg">
                  <Pencil className="w-4 h-4" />
                </Button>
              )}
            </div>
            <CardContent className="p-6">
              {editingInstall ? (
                <div className="space-y-3">
                  <Input
                    type="date"
                    value={installVal}
                    onChange={(e) => setInstallVal(e.target.value)}
                    className="field-input font-medium h-11"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSaveInstall} disabled={updateJob.isPending} className="flex-1 rounded-xl font-bold">
                      <Check className="w-4 h-4 mr-1" /> Save
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingInstall(false)} className="rounded-xl font-bold">
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ) : job.installDate ? (
                <p className="text-sm font-bold text-foreground">{job.installDate}</p>
              ) : (
                <p className="text-sm text-muted-foreground font-medium italic">Not scheduled yet.</p>
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
