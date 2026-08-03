import {
  useGetEnquiry, useUpdateEnquiry, useGenerateEnquirySummary,
  useListEnquiryMessages, useGenerateQuote, useGetQuote,
  useListEnquiryAttachments, useUploadEnquiryAttachment, useDeleteEnquiryAttachment,
  getGetQuoteQueryKey, getListEnquiryAttachmentsQueryKey,
} from "@workspace/api-client-react";
import { useParams, Link, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "./dashboard";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, MapPin, Hammer, Calendar, Phone, Mail, Sparkles, Plus, Clock,
  PoundSterling, MessageSquare, ChevronDown, Save, ImageIcon, X, FileText,
  Upload, Trash2, ExternalLink, Paperclip,
} from "lucide-react";
import { SummaryCard, SummaryCardSkeleton } from "@/components/summary-card";
import { useQueryClient } from "@tanstack/react-query";
import { formatDate, formatCurrency } from "@/lib/utils";
import { useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

export default function EnquiryDetail() {
  const params = useParams();
  const id = Number(params.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [chatOpen, setChatOpen] = useState(false);
  const [statusVal, setStatusVal] = useState<string | undefined>();

  const { data: enquiry, isLoading: isLoadingEnquiry } = useGetEnquiry(id);
  const { data: messages, isLoading: isLoadingMessages } = useListEnquiryMessages(id);
  const { data: quote, isLoading: isLoadingQuote } = useGetQuote(id, { query: { retry: false, queryKey: getGetQuoteQueryKey(id) } });

  const updateStatus = useUpdateEnquiry({
    mutation: {
      onSuccess: () => {
        toast({ title: "Status updated" });
        queryClient.invalidateQueries({ queryKey: ["/api/enquiries"] });
        queryClient.invalidateQueries({ queryKey: [`/api/enquiries/${id}`] });
      }
    }
  });

  const generateSummary = useGenerateEnquirySummary({
    mutation: {
      onSuccess: () => {
        toast({ title: "AI Summary generated" });
        queryClient.invalidateQueries({ queryKey: [`/api/enquiries/${id}`] });
      },
      onError: () => {
        toast({ title: "Failed to generate summary", variant: "destructive" });
      }
    }
  });

  const generateDraftQuote = useGenerateQuote({
    mutation: {
      onSuccess: () => {
        toast({ title: "Draft Quote generated" });
        setLocation(`/quotes/${id}`);
      },
      onError: () => {
        toast({ title: "Failed to generate quote", variant: "destructive" });
      }
    }
  });

  if (isLoadingEnquiry || !enquiry) {
    return <div className="space-y-4 max-w-6xl mx-auto"><Skeleton className="h-8 w-64 rounded-lg"/><Skeleton className="h-64 w-full rounded-2xl"/></div>;
  }

  const handleSaveStatus = () => {
    if (statusVal && statusVal !== enquiry.status) {
      updateStatus.mutate({ id, data: { status: statusVal } });
    }
  };

  const currentStatusVal = statusVal || enquiry.status;

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-24 animate-in fade-in-0 duration-500">
      <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground mb-6">
        <Link href="/enquiries" className="hover:text-foreground flex items-center gap-1.5 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Pipeline
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column (2/3) */}
        <div className="lg:col-span-2 space-y-8">
          {/* Job Overview Card */}
          <Card className="shadow-sm border-border/60 overflow-hidden rounded-2xl">
            <div className="bg-secondary/40 px-8 py-8 border-b border-border/60">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
                <div>
                  <h1 className="text-3xl font-black tracking-tight mb-3 text-foreground">{enquiry.customerName}</h1>
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm font-semibold text-muted-foreground">
                    <span className="flex items-center gap-2 text-foreground/80 bg-background/50 px-3 py-1.5 rounded-md border border-border/40"><Hammer className="w-4 h-4"/> {enquiry.projectType || "General"}</span>
                    <span className="flex items-center gap-2 text-foreground/80"><MapPin className="w-4 h-4"/> {enquiry.location || "No location"}</span>
                    <span className="flex items-center gap-2 text-foreground/80"><Calendar className="w-4 h-4"/> {formatDate(enquiry.createdAt)}</span>
                  </div>
                </div>
                <div className="hidden sm:block">
                   <StatusBadge status={enquiry.status} />
                </div>
              </div>
            </div>
            <CardContent className="p-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-8">
                <InfoBox icon={Mail} label="Email" value={enquiry.customerEmail} isLink />
                <InfoBox icon={Phone} label="Phone" value={enquiry.customerPhone} />
                <InfoBox icon={PoundSterling} label="Budget" value={enquiry.budget} />
                <InfoBox icon={Clock} label="Timescale" value={enquiry.timescale} />
              </div>
              {enquiry.description && (
                <div className="pt-6 border-t border-border/60">
                  <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-4">Job Description</h3>
                  <p className="text-base leading-relaxed whitespace-pre-wrap font-medium">{enquiry.description}</p>
                </div>
              )}

              {/* Uploaded Photos */}
              <AttachmentsPanel enquiryId={id} />
            </CardContent>
          </Card>

          {/* AI Summary Card */}
          <Card className="shadow-sm border-border/60 rounded-2xl">
            <div className="px-8 py-5 border-b border-border/60 flex items-center justify-between bg-card">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" /> AI Job Summary
              </h2>
              {enquiry.aiSummary && (
                <Button 
                  variant="ghost"
                  size="sm"
                  onClick={() => generateSummary.mutate({ id })}
                  disabled={generateSummary.isPending}
                  className="text-xs font-bold text-primary hover:text-primary hover:bg-primary/10 transition-colors"
                >
                  Regenerate
                </Button>
              )}
            </div>
            <CardContent className="p-8">
              {generateSummary.isPending ? (
                <SummaryCardSkeleton />
              ) : enquiry.aiSummary ? (
                <SummaryCard aiSummary={enquiry.aiSummary} />
              ) : (
                <div className="text-center py-10 bg-secondary/30 rounded-xl border border-dashed border-border/60">
                  <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-5">
                    <Sparkles className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-bold mb-3 tracking-tight">No summary yet</h3>
                  <p className="text-base text-muted-foreground mb-8 max-w-md mx-auto font-medium">
                    Let AI extract the key details, materials needed, and constraints from the customer's description and chat history.
                  </p>
                  <Button 
                    onClick={() => generateSummary.mutate({ id })} 
                    disabled={generateSummary.isPending}
                    className="w-full max-w-xs hover-elevate font-bold rounded-full h-12 text-md"
                  >
                    Generate AI Summary
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Chat History Card */}
          <Card className="shadow-sm border-border/60 rounded-2xl overflow-hidden">
            <div 
              className="px-8 py-5 flex items-center justify-between cursor-pointer hover:bg-secondary/30 transition-colors bg-card select-none"
              onClick={() => setChatOpen(!chatOpen)}
            >
              <h2 className="text-lg font-bold flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-muted-foreground" /> Chat History
              </h2>
              <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform duration-300 ${chatOpen ? "rotate-180" : ""}`} />
            </div>
            <div className={`transition-all duration-300 ease-in-out origin-top ${chatOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"} grid`}>
              <div className="overflow-hidden">
                <div className="max-h-[600px] overflow-y-auto p-8 space-y-6 bg-secondary/20 border-t border-border/60">
                  {isLoadingMessages ? (
                    <div className="space-y-4"><Skeleton className="h-16 w-3/4 rounded-xl"/><Skeleton className="h-16 w-3/4 ml-auto rounded-xl"/></div>
                  ) : messages?.length === 0 ? (
                    <div className="text-center bg-card p-6 rounded-xl border border-border/40 shadow-sm">
                      <p className="text-base font-semibold text-muted-foreground py-4">No chat messages found.</p>
                    </div>
                  ) : (
                    messages?.map(msg => (
                      <div key={msg.id} className={`flex ${msg.role === 'customer' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] rounded-2xl px-6 py-4 ${
                          msg.role === 'customer' 
                            ? 'bg-card border border-border/60 shadow-sm text-foreground rounded-tr-sm' 
                            : 'bg-primary text-primary-foreground shadow-md rounded-tl-sm'
                        }`}>
                          <p className="text-sm font-semibold whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                          <p className={`text-[11px] mt-2 font-bold tracking-wider uppercase ${msg.role === 'customer' ? 'text-muted-foreground' : 'text-primary-foreground/70'}`}>
                            {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Right Column (1/3) */}
        <div className="space-y-8">
          {/* Status Card */}
          <Card className="shadow-sm border-border/60 rounded-2xl bg-card">
            <div className="px-6 py-5 border-b border-border/60">
              <h2 className="text-lg font-bold">Pipeline Status</h2>
            </div>
            <CardContent className="p-6 space-y-6 text-center">
              <div className="flex justify-center">
                <StatusBadge status={currentStatusVal} />
              </div>
              <Select 
                value={currentStatusVal} 
                onValueChange={setStatusVal}
                disabled={updateStatus.isPending}
              >
                <SelectTrigger className="bg-background border-border/60 font-bold h-12 shadow-sm rounded-xl">
                  <SelectValue placeholder="Update Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new_enquiry" className="font-semibold cursor-pointer">New</SelectItem>
                  <SelectItem value="reviewing" className="font-semibold cursor-pointer">Reviewing</SelectItem>
                  <SelectItem value="survey_required" className="font-semibold cursor-pointer">Survey Required</SelectItem>
                  <SelectItem value="quote_sent" className="font-semibold cursor-pointer">Quote Sent</SelectItem>
                  <SelectItem value="won" className="font-semibold cursor-pointer">Won</SelectItem>
                  <SelectItem value="lost" className="font-semibold cursor-pointer">Lost</SelectItem>
                </SelectContent>
              </Select>
              {statusVal && statusVal !== enquiry.status && (
                <Button 
                  onClick={handleSaveStatus} 
                  className="w-full font-bold hover-elevate h-12 rounded-xl"
                  disabled={updateStatus.isPending}
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save Changes
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Quote Card */}
          <Card className="shadow-sm border-border/60 rounded-2xl bg-card">
            <div className="px-6 py-5 border-b border-border/60">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <FileText className="w-5 h-5 text-muted-foreground" /> Quote Estimate
              </h2>
            </div>
            <CardContent className="p-6">
              {isLoadingQuote ? (
                <Skeleton className="h-32 w-full rounded-xl" />
              ) : quote ? (
                <div className="space-y-6">
                  <div className="text-center p-6 bg-secondary/50 rounded-xl border border-border/50 shadow-inner">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Estimated Total</p>
                    <p className="text-4xl font-black text-foreground tracking-tight">{formatCurrency(quote.totalWithVat || 0)}</p>
                    <div className="flex items-center justify-center gap-4 mt-4 text-sm font-semibold text-muted-foreground bg-background px-3 py-1.5 rounded-md border border-border/40 inline-flex mx-auto">
                      <span>Mats: {formatCurrency(quote.materialsAllowance || 0)}</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-border" />
                      <span>Lab: {formatCurrency(quote.labourAllowance || 0)}</span>
                    </div>
                  </div>
                  <Link href={`/quotes/${id}`}>
                    <Button className="w-full font-bold hover-elevate h-12 rounded-xl text-md">Open Quote Editor</Button>
                  </Link>
                </div>
              ) : (
                <div className="text-center py-6">
                  <p className="text-lg font-bold mb-2 tracking-tight">No quote drafted</p>
                  <p className="text-sm text-muted-foreground mb-8 font-medium">Generate an itemised quote based on the job details and AI summary.</p>
                  <Button 
                    onClick={() => generateDraftQuote.mutate({ id })}
                    disabled={generateDraftQuote.isPending}
                    className="w-full font-bold hover-elevate h-12 rounded-xl border-2 border-primary text-primary bg-background hover:bg-primary/5"
                    variant="outline"
                  >
                    <Plus className="w-5 h-5 mr-2" />
                    {generateDraftQuote.isPending ? "Drafting..." : "Draft Quote with AI"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ── Attachments Panel ─────────────────────────────────────────────────────────
function AttachmentsPanel({ enquiryId }: { enquiryId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: attachments = [], isLoading } = useListEnquiryAttachments(enquiryId, {
    query: { queryKey: getListEnquiryAttachmentsQueryKey(enquiryId) },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListEnquiryAttachmentsQueryKey(enquiryId) });
    queryClient.invalidateQueries({ queryKey: [`/api/enquiries/${enquiryId}`] });
    queryClient.invalidateQueries({ queryKey: ["/api/enquiries"] });
  };

  const upload = useUploadEnquiryAttachment({
    mutation: {
      onSuccess: () => { toast({ title: "File uploaded" }); invalidate(); },
      onError: () => toast({ title: "Upload failed", variant: "destructive" }),
    },
  });

  const del = useDeleteEnquiryAttachment({
    mutation: {
      onSuccess: () => { toast({ title: "Attachment removed" }); invalidate(); },
      onError: () => toast({ title: "Failed to remove", variant: "destructive" }),
    },
  });

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((file) => {
      upload.mutate({ id: enquiryId, data: { file } });
    });
  }, [upload, enquiryId]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const images = attachments.filter((a) => a.mimetype.startsWith("image/"));
  const docs   = attachments.filter((a) => !a.mimetype.startsWith("image/"));

  return (
    <div className="pt-6 border-t border-border/60">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
          <Paperclip className="w-4 h-4" />
          Attachments
          {attachments.length > 0 && (
            <span className="text-xs font-bold bg-secondary px-2 py-0.5 rounded-full text-muted-foreground border border-border/40">
              {attachments.length}
            </span>
          )}
        </h3>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={upload.isPending}
          className="flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
        >
          <Upload className="w-3.5 h-3.5" />
          {upload.isPending ? "Uploading…" : "Add files"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !attachments.length && fileInputRef.current?.click()}
        className={cn(
          "rounded-xl border-2 border-dashed transition-all duration-200",
          dragging
            ? "border-primary bg-primary/5 scale-[1.01]"
            : attachments.length === 0
              ? "border-border/50 bg-secondary/20 hover:border-primary/40 hover:bg-primary/5 cursor-pointer"
              : "border-transparent"
        )}
      >
        {isLoading ? (
          <div className="grid grid-cols-3 gap-3 p-4">
            {[1,2,3].map(i => <Skeleton key={i} className="aspect-square rounded-xl" />)}
          </div>
        ) : attachments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
            <div className="w-12 h-12 bg-secondary rounded-full flex items-center justify-center">
              <Upload className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-bold text-muted-foreground">Drop files here or click to browse</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Photos, screenshots, inspiration images, drawings, PDFs</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Image grid */}
            {images.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {images.map((att) => (
                  <div key={att.id} className="relative group aspect-square rounded-xl overflow-hidden border border-border/60 bg-secondary/30 shadow-sm">
                    <button
                      onClick={() => setLightbox(att.url)}
                      className="absolute inset-0 w-full h-full"
                    >
                      <img
                        src={att.url}
                        alt={att.filename}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                      />
                    </button>
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors pointer-events-none rounded-xl" />
                    {/* Delete overlay */}
                    <button
                      onClick={(e) => { e.stopPropagation(); del.mutate({ id: enquiryId, attachmentId: att.id }); }}
                      className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/60 hover:bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all z-10"
                      title="Remove"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                    {/* Filename tooltip */}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2 translate-y-full group-hover:translate-y-0 transition-transform rounded-b-xl">
                      <p className="text-[10px] text-white font-semibold truncate">{att.filename}</p>
                    </div>
                  </div>
                ))}
                {/* Add more button in grid */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="aspect-square rounded-xl border-2 border-dashed border-border/50 hover:border-primary/40 hover:bg-primary/5 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-primary transition-all"
                >
                  <Upload className="w-5 h-5" />
                  <span className="text-[10px] font-bold uppercase tracking-wider">Add more</span>
                </button>
              </div>
            )}

            {/* PDF / document list */}
            {docs.length > 0 && (
              <div className="space-y-2">
                {docs.map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center gap-3 bg-secondary/40 border border-border/50 rounded-xl px-4 py-3 group hover:border-primary/30 transition-colors"
                  >
                    <div className="w-9 h-9 bg-red-50 border border-red-100 rounded-lg flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-red-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate">{att.filename}</p>
                      <p className="text-[11px] text-muted-foreground font-medium">
                        {att.fileSize ? `${(att.fileSize / 1024).toFixed(0)} KB` : "PDF"} · {formatDate(att.uploadedAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <a
                        href={att.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                        title="Open"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      <button
                        onClick={() => del.mutate({ id: enquiryId, attachmentId: att.id })}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                        title="Remove"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
                {images.length === 0 && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-border/50 rounded-xl text-xs font-bold text-muted-foreground hover:border-primary/40 hover:text-primary transition-all"
                  >
                    <Upload className="w-3.5 h-3.5" /> Add more files
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setLightbox(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] w-full" onClick={(e) => e.stopPropagation()}>
            <img
              src={lightbox}
              alt="Full size"
              className="w-full h-full object-contain rounded-2xl shadow-2xl max-h-[85vh]"
            />
            <button
              onClick={() => setLightbox(null)}
              className="absolute top-3 right-3 w-10 h-10 bg-black/60 hover:bg-black/80 text-white rounded-full flex items-center justify-center transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoBox({ icon: Icon, label, value, isLink = false }: { icon: any, label: string, value?: string | null, isLink?: boolean }) {
  if (!value) return null;
  return (
    <div className="bg-background border border-border/60 rounded-xl p-4 flex flex-col gap-2 shadow-sm">
      <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
        <Icon className="w-4 h-4" /> {label}
      </span>
      {isLink ? (
        <a href={label === 'Email' ? `mailto:${value}` : `tel:${value}`} className="text-base font-bold text-primary hover:underline truncate">
          {value}
        </a>
      ) : (
        <span className="text-base font-bold text-foreground truncate">{value}</span>
      )}
    </div>
  );
}