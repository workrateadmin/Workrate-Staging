import { useState, useCallback, useRef, useEffect } from "react";
import {
  useGetAiReceptionistSettings,
  useUpdateAiReceptionistSettings,
  useListAiCalls,
  useUpdateAiCall,
  useProcessAiCall,
  useCompleteDemoCall,
  useGetCompany,
  useGetVapiSettings,
  useConnectVapi,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Phone, PhoneOff, Clock, Settings2, MessageSquare, Mic,
  CheckCircle2, Circle, ChevronDown, ChevronRight, AlertCircle,
  User, Timer, Sparkles, PhoneCall, PhoneForwarded, VolumeX,
  ToggleLeft, ToggleRight, Radio, FileText, TrendingUp, ChevronUp,
  CalendarDays, Zap, Shield, Info, Send, X, PhoneIncoming, ExternalLink,
} from "lucide-react";
import { format, parseISO, isToday } from "date-fns";
import { Link } from "wouter";

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_QUESTIONS = [
  { id: "customerName",    label: "Customer name",             category: "contact",  required: true },
  { id: "phone",           label: "Phone number",              category: "contact",  required: true },
  { id: "address",         label: "Address",                   category: "contact",  required: false },
  { id: "postcode",        label: "Postcode",                  category: "contact",  required: false },
  { id: "projectType",     label: "Type of work needed",       category: "project",  required: false },
  { id: "measurements",    label: "Measurements (if known)",   category: "project",  required: false },
  { id: "budget",          label: "Budget (optional)",         category: "project",  required: false },
  { id: "timescale",       label: "Preferred timescale",       category: "project",  required: false },
  { id: "photosToUpload",  label: "Whether photos will be uploaded", category: "project", required: false },
];

const DAYS = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

const DEFAULT_HOURS = {
  mon: { enabled: true, open: "08:00", close: "18:00" },
  tue: { enabled: true, open: "08:00", close: "18:00" },
  wed: { enabled: true, open: "08:00", close: "18:00" },
  thu: { enabled: true, open: "08:00", close: "18:00" },
  fri: { enabled: true, open: "08:00", close: "17:00" },
  sat: { enabled: false, open: "09:00", close: "13:00" },
  sun: { enabled: false, open: "09:00", close: "12:00" },
};

type Tab = "setup" | "hours" | "handling" | "calls";

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseBusinessHours(json: string | null | undefined) {
  if (!json) return DEFAULT_HOURS;
  try { return { ...DEFAULT_HOURS, ...JSON.parse(json) }; } catch { return DEFAULT_HOURS; }
}

function parseEnabledQuestions(json: string | null | undefined): string[] {
  if (!json) return DEFAULT_QUESTIONS.map((q) => q.id);
  try { return JSON.parse(json); } catch { return DEFAULT_QUESTIONS.map((q) => q.id); }
}

function parseSummary(json: string | null | undefined): Record<string, string> | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" ? parsed : { summary: json };
  } catch {
    return { summary: json };
  }
}

function parseTranscript(json: string | null | undefined): Array<{ role: string; content: string }> {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [{ role: "caller", content: json }];
  } catch {
    return [{ role: "caller", content: json }];
  }
}

function formatDuration(seconds: number | null | undefined) {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// ── Status badge ──────────────────────────────────────────────────────────────

function CallStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed:   "bg-green-50 text-green-700 border-green-200",
    missed:      "bg-red-50 text-red-700 border-red-200",
    transferred: "bg-teal-50 text-teal-700 border-teal-200",
    dropped:     "bg-amber-50 text-amber-700 border-amber-200",
  };
  const icons: Record<string, React.ReactNode> = {
    completed:   <CheckCircle2 className="w-3 h-3" />,
    missed:      <PhoneOff className="w-3 h-3" />,
    transferred: <PhoneForwarded className="w-3 h-3" />,
    dropped:     <AlertCircle className="w-3 h-3" />,
  };
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-widest border shadow-sm",
      styles[status] ?? "bg-gray-50 text-gray-600 border-gray-200"
    )}>
      {icons[status]}
      {status}
    </span>
  );
}

// ── Confidence score ──────────────────────────────────────────────────────────

function ConfidenceScore({ score }: { score: number | null | undefined }) {
  if (score == null) return null;
  const color = score >= 75 ? "text-green-600" : score >= 50 ? "text-amber-600" : "text-red-600";
  const bg = score >= 75 ? "bg-green-500" : score >= 50 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", bg)} style={{ width: `${score}%` }} />
      </div>
      <span className={cn("text-xs font-black tabular-nums", color)}>{score}%</span>
    </div>
  );
}

// ── Call card ─────────────────────────────────────────────────────────────────

function CallCard({ call, onUpdate }: { call: any; onUpdate: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const { toast } = useToast();
  const updateMutation = useUpdateAiCall();
  const processMutation = useProcessAiCall();

  const summary = parseSummary(call.aiSummary);
  const transcript = parseTranscript(call.transcript);

  const handleProcess = async () => {
    try {
      await processMutation.mutateAsync({ id: call.id });
      toast({ title: "Call processed", description: "Enquiry created and AI summary generated." });
      onUpdate();
    } catch {
      toast({ title: "Failed to process call", variant: "destructive" });
    }
  };

  const toggleFollowUp = async () => {
    try {
      await updateMutation.mutateAsync({ id: call.id, data: { followUpRequired: !call.followUpRequired } });
      onUpdate();
    } catch {
      toast({ title: "Update failed", variant: "destructive" });
    }
  };

  return (
    <Card className="border-border/60 shadow-sm rounded-2xl overflow-hidden">
      <div
        className="p-5 cursor-pointer hover:bg-secondary/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Phone className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="font-black text-base tracking-tight">
                {call.callerName || call.callerPhone || "Unknown caller"}
              </div>
              <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                {call.callerPhone && (
                  <span className="text-xs text-muted-foreground font-medium">{call.callerPhone}</span>
                )}
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Timer className="w-3 h-3" />{formatDuration(call.durationSeconds)}
                </span>
                {call.callStartedAt && (
                  <span className="text-xs text-muted-foreground">
                    {format(parseISO(call.callStartedAt), "HH:mm")}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <CallStatusBadge status={call.callStatus} />
            {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
        </div>

        {/* Quick info row */}
        <div className="mt-3 flex items-center gap-4 flex-wrap">
          {call.confidenceScore != null && (
            <div className="flex items-center gap-2 min-w-[120px]">
              <span className="text-xs text-muted-foreground font-semibold">Confidence</span>
              <ConfidenceScore score={call.confidenceScore} />
            </div>
          )}
          {call.surveySuggested && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-violet-700 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-md">
              <Zap className="w-3 h-3" /> Survey recommended
            </span>
          )}
          {call.followUpNotes?.includes("Email needs confirmation") ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
              <AlertCircle className="w-3 h-3" /> Email needs confirmation
            </span>
          ) : call.followUpRequired && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
              <AlertCircle className="w-3 h-3" /> Follow-up needed
            </span>
          )}
          {call.enquiryId && (
            <Link href={`/enquiries/${call.enquiryId}`} onClick={(e) => e.stopPropagation()}>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80 transition-colors">
                <FileText className="w-3 h-3" /> Lead #{call.enquiryId}
              </span>
            </Link>
          )}
          {call.providerId === "vapi" && (
            <span className="inline-flex items-center text-xs font-semibold text-muted-foreground">Vapi</span>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border/60 bg-secondary/20">
          {/* AI Summary */}
          {summary ? (
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-primary" />
                <h4 className="font-bold text-sm uppercase tracking-widest text-muted-foreground">AI Summary</h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  ["Project", summary.project],
                  ["Location", summary.location],
                  ["Budget", summary.budget],
                  ["Measurements", summary.measurements],
                  ["Materials", summary.materials],
                  ["Requirements", summary.customerRequirements],
                  ["Challenges", summary.potentialChallenges],
                  ["Next Action", summary.recommendedNextAction],
                ].filter(([, v]) => v && v !== "Not specified").map(([label, value]) => (
                  <div key={label} className="bg-background rounded-xl border border-border/60 p-3">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">{label}</div>
                    <div className="text-sm font-medium text-foreground">{value}</div>
                  </div>
                ))}
              </div>
              {summary.summary && (
                <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-primary mb-2">Overview</div>
                  <p className="text-sm font-medium text-foreground leading-relaxed">{summary.summary}</p>
                </div>
              )}
              {call.recordingUrl && (
                <a href={call.recordingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline">
                  <ExternalLink className="w-3.5 h-3.5" /> Open call recording
                </a>
              )}
            </div>
          ) : (
            <div className="p-5">
              <p className="text-sm text-muted-foreground font-medium">No AI summary yet.</p>
              {!call.enquiryId && (
                <Button
                  size="sm"
                  className="mt-3 font-bold rounded-xl"
                  onClick={handleProcess}
                  disabled={processMutation.isPending}
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  {processMutation.isPending ? "Processing…" : "Create Enquiry & Generate Summary"}
                </Button>
              )}
            </div>
          )}

          {/* Transcript */}
          {transcript.length > 0 && (
            <div className="border-t border-border/60 p-5">
              <div className="flex items-center gap-2 mb-3">
                <MessageSquare className="w-4 h-4 text-muted-foreground" />
                <h4 className="font-bold text-sm uppercase tracking-widest text-muted-foreground">Transcript</h4>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {transcript.map((line, i) => (
                  <div key={i} className={cn("flex gap-3", line.role === "ai" ? "" : "flex-row-reverse")}>
                    <div className={cn(
                      "text-xs px-3 py-2 rounded-xl max-w-[80%] font-medium leading-relaxed",
                      line.role === "ai"
                        ? "bg-secondary/80 text-foreground"
                        : "bg-primary/10 text-foreground border border-primary/20"
                    )}>
                      <span className={cn(
                        "block text-[10px] font-bold uppercase tracking-widest mb-1",
                        line.role === "ai" ? "text-muted-foreground" : "text-primary"
                      )}>
                        {line.role === "ai" ? "AI Receptionist" : "Caller"}
                      </span>
                      {line.content}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="border-t border-border/60 p-4 flex items-center gap-3">
            <button
              onClick={toggleFollowUp}
              className={cn(
                "inline-flex items-center gap-2 text-sm font-semibold px-3 py-1.5 rounded-lg border transition-colors",
                call.followUpRequired
                  ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                  : "bg-secondary text-muted-foreground border-border hover:bg-secondary/80"
              )}
            >
              {call.followUpRequired ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
              {call.followUpRequired ? "Mark resolved" : "Flag for follow-up"}
            </button>
            {!call.enquiryId && call.aiSummary && (
              <Button size="sm" variant="outline" className="font-semibold rounded-xl" onClick={handleProcess} disabled={processMutation.isPending}>
                <FileText className="w-4 h-4 mr-2" />
                {processMutation.isPending ? "Creating…" : "Create Enquiry"}
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

// ── Toggle switch ─────────────────────────────────────────────────────────────

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary shrink-0",
        checked ? "bg-primary" : "bg-border"
      )}
      aria-checked={checked}
      role="switch"
    >
      <span className={cn(
        "inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform",
        checked ? "translate-x-6" : "translate-x-1"
      )} />
    </button>
  );
}

// ── Business hours grid ───────────────────────────────────────────────────────

function BusinessHoursGrid({
  hours,
  onChange,
}: {
  hours: typeof DEFAULT_HOURS;
  onChange: (hours: typeof DEFAULT_HOURS) => void;
}) {
  const updateDay = (key: string, field: string, value: any) => {
    onChange({ ...hours, [key]: { ...hours[key as keyof typeof hours], [field]: value } });
  };

  return (
    <div className="space-y-2">
      {DAYS.map(({ key, label }) => {
        const day = hours[key as keyof typeof hours] ?? DEFAULT_HOURS.mon;
        return (
          <div key={key} className={cn(
            "flex items-center gap-4 p-3 rounded-xl border transition-colors",
            day.enabled ? "bg-background border-border/60" : "bg-secondary/30 border-border/40"
          )}>
            <div className="w-24 shrink-0">
              <span className={cn("text-sm font-bold", day.enabled ? "text-foreground" : "text-muted-foreground")}>
                {label}
              </span>
            </div>
            <Toggle
              checked={day.enabled}
              onChange={(v) => updateDay(key, "enabled", v)}
            />
            {day.enabled ? (
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="time"
                  value={day.open}
                  onChange={(e) => updateDay(key, "open", e.target.value)}
                  className="text-sm font-semibold border border-border rounded-lg px-2 py-1 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                />
                <span className="text-muted-foreground text-sm font-medium">to</span>
                <input
                  type="time"
                  value={day.close}
                  onChange={(e) => updateDay(key, "close", e.target.value)}
                  className="text-sm font-semibold border border-border rounded-lg px-2 py-1 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                />
              </div>
            ) : (
              <span className="text-sm text-muted-foreground font-medium">Closed</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Demo call modal ───────────────────────────────────────────────────────────

type DemoMessage = { role: "caller" | "ai"; content: string };

function DemoCallModal({
  open,
  onClose,
  onComplete,
  enabledQuestions,
  businessName,
  tradeType,
}: {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
  enabledQuestions: string[];
  businessName: string;
  tradeType: string;
}) {
  const [messages, setMessages] = useState<DemoMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [isEnding, setIsEnding] = useState(false);
  const [callStartTime] = useState(() => Date.now());
  const [callEnded, setCallEnded] = useState(false);
  const [resultCallId, setResultCallId] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const completeMutation = useCompleteDemoCall();

  // Start the demo with an AI greeting when modal opens
  useEffect(() => {
    if (!open) return;
    setMessages([]);
    setInput("");
    setStreamingContent("");
    setCallEnded(false);
    setResultCallId(null);
    setIsStarting(true);

    // Send an empty "caller opened" trigger so AI sends the greeting
    streamAiResponse([], enabledQuestions, businessName, tradeType).finally(() => {
      setIsStarting(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Scroll to bottom when new content arrives
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streamingContent]);

  async function streamAiResponse(
    history: DemoMessage[],
    eqs: string[],
    bName: string,
    tType: string,
  ) {
    setIsStreaming(true);
    setStreamingContent("");

    try {
      const res = await fetch("/api/ai-receptionist/demo/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history,
          enabledQuestions: eqs,
          businessName: bName,
          tradeType: tType,
        }),
      });

      if (!res.ok || !res.body) throw new Error("Stream failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.content) {
              fullContent += parsed.content;
              // Strip the CALL_COMPLETE marker from display
              const display = fullContent.replace(/\nCALL_COMPLETE:.*$/s, "");
              setStreamingContent(display);
            }
            if (parsed.done) break;
          } catch {}
        }
      }

      // Strip CALL_COMPLETE marker for display
      const displayContent = fullContent.replace(/\nCALL_COMPLETE:.*$/s, "").trim();

      setMessages((prev) => [...prev, { role: "ai", content: fullContent }]);
      setStreamingContent("");

      // Check if the AI signaled completion
      if (fullContent.includes("CALL_COMPLETE:")) {
        setCallEnded(true);
      }

      // Re-focus input
      setTimeout(() => inputRef.current?.focus(), 100);
    } catch (err) {
      toast({ title: "Connection error", description: "Could not reach AI. Try again.", variant: "destructive" });
    } finally {
      setIsStreaming(false);
    }
  }

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isStreaming || callEnded) return;

    const newMessages: DemoMessage[] = [...messages, { role: "caller", content: text }];
    setMessages(newMessages);
    setInput("");

    await streamAiResponse(newMessages, enabledQuestions, businessName, tradeType);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleEndCall = async () => {
    if (isEnding) return;
    setIsEnding(true);
    try {
      const durationSeconds = Math.round((Date.now() - callStartTime) / 1000);
      const result = await completeMutation.mutateAsync({
        data: {
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          durationSeconds,
        },
      });
      setResultCallId(result.id);
      setCallEnded(true);
    } catch {
      toast({ title: "Failed to save demo call", variant: "destructive" });
    } finally {
      setIsEnding(false);
    }
  };

  const handleViewRecord = () => {
    onComplete();
    onClose();
  };

  if (!open) return null;

  // Split AI display content (strip CALL_COMPLETE marker)
  const displayMessages = messages.map((m) => ({
    ...m,
    content: m.role === "ai" ? m.content.replace(/\nCALL_COMPLETE:.*$/s, "").trim() : m.content,
  }));

  const durationLabel = () => {
    const s = Math.round((Date.now() - callStartTime) / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-background border border-border rounded-3xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden"
        style={{ maxHeight: "90vh" }}>

        {/* Header */}
        <div className="bg-primary/5 border-b border-border/60 px-5 py-4 flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
              <PhoneIncoming className="w-5 h-5 text-primary-foreground" />
            </div>
            {!callEnded && (
              <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-background animate-pulse" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-black text-sm tracking-tight">AI Receptionist — Demo Call</div>
            <div className="text-xs text-muted-foreground font-medium flex items-center gap-2">
              <span className={cn(
                "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-widest border",
                callEnded
                  ? "bg-secondary text-muted-foreground border-border"
                  : "bg-green-50 text-green-700 border-green-200"
              )}>
                {callEnded ? "Call ended" : "● Live demo"}
              </span>
              <span>You are the caller</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-secondary flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Context strip */}
        <div className="px-5 py-2 bg-amber-50 border-b border-amber-200 flex items-center gap-2">
          <Info className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <p className="text-xs text-amber-700 font-semibold">
            Type what a caller would say. The AI responds as it would on a real call.
          </p>
        </div>

        {/* Message thread */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-3" style={{ minHeight: 0 }}>
          {(isStarting && messages.length === 0 && !streamingContent) && (
            <div className="flex gap-3">
              <div className="bg-secondary/80 text-foreground text-sm px-3 py-2 rounded-xl max-w-[80%] font-medium">
                <span className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">AI Receptionist</span>
                <span className="inline-flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "300ms" }} />
                </span>
              </div>
            </div>
          )}

          {displayMessages.map((msg, i) => (
            <div key={i} className={cn("flex gap-3", msg.role === "caller" ? "flex-row-reverse" : "")}>
              <div className={cn(
                "text-sm px-3 py-2 rounded-xl max-w-[80%] font-medium leading-relaxed",
                msg.role === "ai"
                  ? "bg-secondary/80 text-foreground"
                  : "bg-primary/10 text-foreground border border-primary/20"
              )}>
                <span className={cn(
                  "block text-[10px] font-bold uppercase tracking-widest mb-1",
                  msg.role === "ai" ? "text-muted-foreground" : "text-primary"
                )}>
                  {msg.role === "ai" ? "AI Receptionist" : "You (caller)"}
                </span>
                {msg.content}
              </div>
            </div>
          ))}

          {/* Streaming bubble */}
          {streamingContent && (
            <div className="flex gap-3">
              <div className="bg-secondary/80 text-foreground text-sm px-3 py-2 rounded-xl max-w-[80%] font-medium leading-relaxed">
                <span className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">AI Receptionist</span>
                {streamingContent}
                <span className="inline-block w-1 h-3.5 bg-muted-foreground/50 ml-0.5 animate-pulse rounded-sm" />
              </div>
            </div>
          )}

          {isStreaming && !streamingContent && messages.length > 0 && (
            <div className="flex gap-3">
              <div className="bg-secondary/80 text-foreground text-sm px-3 py-2 rounded-xl font-medium">
                <span className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">AI Receptionist</span>
                <span className="inline-flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "300ms" }} />
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Result card shown after call ends */}
        {callEnded && resultCallId && (
          <div className="mx-5 mb-4 p-4 bg-green-50 border border-green-200 rounded-2xl">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <span className="font-black text-sm text-green-800">Demo call saved!</span>
            </div>
            <p className="text-xs text-green-700 font-medium mb-3">
              A fake call record has been created with AI summary and confidence score. View it in the Call Log.
            </p>
            <Button size="sm" className="w-full font-bold rounded-xl" onClick={handleViewRecord}>
              <PhoneCall className="w-4 h-4 mr-2" />
              View call record
            </Button>
          </div>
        )}

        {callEnded && !resultCallId && (
          <div className="mx-5 mb-4 p-4 bg-secondary/50 border border-border rounded-2xl">
            <p className="text-xs text-muted-foreground font-medium mb-2">Call ended. Save it as a demo record?</p>
            <Button
              size="sm"
              className="w-full font-bold rounded-xl"
              onClick={handleEndCall}
              disabled={isEnding}
            >
              <Sparkles className="w-4 h-4 mr-2" />
              {isEnding ? "Generating summary…" : "Save & generate AI summary"}
            </Button>
          </div>
        )}

        {/* Input area */}
        {!callEnded && (
          <div className="border-t border-border/60 p-4 flex items-center gap-3">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type what you'd say as a caller…"
              disabled={isStreaming || isStarting}
              className="flex-1 text-sm border border-border rounded-xl px-3 py-2.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none font-medium disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isStreaming || isStarting}
              className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
            <button
              onClick={handleEndCall}
              disabled={isEnding || messages.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm font-bold hover:bg-red-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              <PhoneOff className="w-4 h-4" />
              {isEnding ? "Saving…" : "End"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AiReceptionist() {
  const [activeTab, setActiveTab] = useState<Tab>("setup");
  const [demoOpen, setDemoOpen] = useState(false);
  const { toast } = useToast();

  const { data: settings, isLoading, refetch: refetchSettings } = useGetAiReceptionistSettings();
  const updateSettings = useUpdateAiReceptionistSettings();
  const { data: allCalls, refetch: refetchCalls } = useListAiCalls();
  const { data: company } = useGetCompany({ query: { queryKey: ["company"] } });
  const { data: vapiSettings, refetch: refetchVapiSettings } = useGetVapiSettings();
  const connectVapi = useConnectVapi();

  // Local state for editing
  const [welcomeType, setWelcomeType] = useState<string>("generate");
  const [welcomeText, setWelcomeText] = useState("");
  const [businessHours, setBusinessHours] = useState(DEFAULT_HOURS);
  const [outOfHours, setOutOfHours] = useState("voicemail");
  const [outOfHoursMsg, setOutOfHoursMsg] = useState("");
  const [transferUrgent, setTransferUrgent] = useState(false);
  const [transferPhone, setTransferPhone] = useState("");
  const [enabledQs, setEnabledQs] = useState<string[]>(DEFAULT_QUESTIONS.map((q) => q.id));
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [vapiAssistantId, setVapiAssistantId] = useState("");
  const [vapiPhoneNumberId, setVapiPhoneNumberId] = useState("");
  const [vapiPhoneNumber, setVapiPhoneNumber] = useState("");
  const [vapiWebhookSecret, setVapiWebhookSecret] = useState("");

  useEffect(() => {
    if (!vapiSettings) return;
    setVapiAssistantId(vapiSettings.assistantId ?? "");
    setVapiPhoneNumberId(vapiSettings.phoneNumberId ?? "");
    setVapiPhoneNumber(vapiSettings.phoneNumber ?? "");
  }, [vapiSettings]);

  // Sync settings into local state once loaded
  if (settings && !settingsLoaded) {
    setWelcomeType(settings.welcomeMessageType ?? "generate");
    setWelcomeText(settings.welcomeMessageText ?? "");
    setBusinessHours(parseBusinessHours(settings.businessHours));
    setOutOfHours(settings.outOfHoursBehaviour ?? "voicemail");
    setOutOfHoursMsg(settings.outOfHoursMessage ?? "");
    setTransferUrgent(settings.transferUrgentCalls ?? false);
    setTransferPhone(settings.transferPhone ?? "");
    setEnabledQs(parseEnabledQuestions(settings.enabledQuestions));
    setSettingsLoaded(true);
  }

  const saveSettings = async (extra?: Record<string, unknown>) => {
    try {
      await updateSettings.mutateAsync({
        data: {
          welcomeMessageType: welcomeType,
          welcomeMessageText: welcomeText,
          businessHours: JSON.stringify(businessHours),
          outOfHoursBehaviour: outOfHours,
          outOfHoursMessage: outOfHoursMsg,
          transferUrgentCalls: transferUrgent,
          transferPhone,
          enabledQuestions: JSON.stringify(enabledQs),
          ...extra,
        },
      });
      toast({ title: "Settings saved" });
      refetchSettings();
    } catch {
      toast({ title: "Failed to save settings", variant: "destructive" });
    }
  };

  const toggleEnabled = async () => {
    const newVal = !(settings?.enabled ?? false);
    await saveSettings({ enabled: newVal });
  };

  const toggleQuestion = (id: string) => {
    const q = DEFAULT_QUESTIONS.find((q) => q.id === id);
    if (q?.required) return; // can't disable required
    setEnabledQs((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const saveVapiMapping = async () => {
    try {
      await connectVapi.mutateAsync({
        data: {
          assistantId: vapiAssistantId || undefined,
          phoneNumberId: vapiPhoneNumberId || undefined,
          phoneNumber: vapiPhoneNumber || undefined,
          webhookSecret: vapiWebhookSecret,
          enabled: true,
        },
      });
      setVapiWebhookSecret("");
      await refetchVapiSettings();
      toast({ title: "Vapi mapping saved", description: "Use the shown webhook address in Vapi's server settings." });
    } catch {
      toast({ title: "Couldn't save Vapi mapping", description: "Check the mapping and use a webhook secret of at least 16 characters.", variant: "destructive" });
    }
  };

  const todayCalls = (allCalls ?? []).filter((c) =>
    c.callStartedAt ? isToday(parseISO(c.callStartedAt)) : isToday(parseISO(c.createdAt))
  );

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 w-full rounded-2xl" />)}
      </div>
    );
  }

  const isEnabled = settings?.enabled ?? false;

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "setup",    label: "Welcome & Voice",  icon: <Mic className="w-4 h-4" /> },
    { id: "hours",    label: "Opening Hours",     icon: <Clock className="w-4 h-4" /> },
    { id: "handling", label: "Call Handling",     icon: <Settings2 className="w-4 h-4" /> },
    { id: "calls",    label: `Call Log${todayCalls.length ? ` (${todayCalls.length} today)` : ""}`, icon: <PhoneCall className="w-4 h-4" /> },
  ];

  return (
    <>
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in-0 duration-300">

      {/* ── Master enable/disable ── */}
      <Card className={cn(
        "shadow-sm border-2 rounded-2xl overflow-hidden transition-all",
        isEnabled ? "border-primary/30 bg-primary/5" : "border-border/60"
      )}>
        <CardContent className="p-6">
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className={cn(
                "w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-sm",
                isEnabled ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
              )}>
                {isEnabled ? <Phone className="w-7 h-7" /> : <PhoneOff className="w-7 h-7" />}
              </div>
              <div>
                <h2 className="text-xl font-black tracking-tight">AI Receptionist</h2>
                <p className={cn("text-sm font-semibold mt-0.5", isEnabled ? "text-primary" : "text-muted-foreground")}>
                  {isEnabled ? "Active — answering calls" : "Inactive — calls not being answered"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4 shrink-0">
              <span className="text-sm font-bold text-muted-foreground hidden sm:block">
                {isEnabled ? "ON" : "OFF"}
              </span>
              <button
                onClick={toggleEnabled}
                disabled={updateSettings.isPending}
                className={cn(
                  "relative inline-flex h-8 w-14 items-center rounded-full transition-colors shadow-sm",
                  isEnabled ? "bg-primary" : "bg-border",
                  updateSettings.isPending && "opacity-50 cursor-not-allowed"
                )}
              >
                <span className={cn(
                  "inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform",
                  isEnabled ? "translate-x-7" : "translate-x-1"
                )} />
              </button>
            </div>
          </div>

          {/* Connection-ready notice */}
          <div className="mt-4 flex items-start gap-3 p-3 bg-background/80 rounded-xl border border-border/60">
            <Shield className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground font-medium leading-relaxed">
              <span className="font-bold text-foreground">{vapiSettings?.connected ? "Vapi mapping connected." : "Ready for Vapi."}</span>{" "}
              {vapiSettings?.connected ? "Completed calls will appear in the normal enquiry pipeline." : "Add your Vapi assistant or phone mapping below to receive secure completed-call reports."}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Tabs ── */}
      <div className="flex gap-1 p-1 bg-secondary/50 rounded-xl border border-border/40">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-bold transition-all",
              activeTab === tab.id
                ? "bg-background text-foreground shadow-sm border border-border/60"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50"
            )}
          >
            {tab.icon}
            <span className="hidden sm:block">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ── Setup tab ── */}
      {activeTab === "setup" && (
        <div className="space-y-6">
          <Card className="shadow-sm border-border/60 rounded-2xl">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-black flex items-center gap-2">
                <PhoneCall className="w-5 h-5 text-primary" />
                Vapi phone connection
              </CardTitle>
              <p className="text-sm text-muted-foreground font-medium">
                Match a Vapi assistant or phone number to this business. The webhook secret is stored securely and never shown again.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-bold mb-2">Assistant ID</label>
                  <input value={vapiAssistantId} onChange={(event) => setVapiAssistantId(event.target.value)} placeholder="assistant_…" className="w-full text-sm border border-border rounded-xl px-4 py-2.5 bg-background" />
                </div>
                <div>
                  <label className="block text-sm font-bold mb-2">Phone number ID</label>
                  <input value={vapiPhoneNumberId} onChange={(event) => setVapiPhoneNumberId(event.target.value)} placeholder="phone_number_…" className="w-full text-sm border border-border rounded-xl px-4 py-2.5 bg-background" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold mb-2">Vapi phone number <span className="font-medium text-muted-foreground">(optional fallback)</span></label>
                <input value={vapiPhoneNumber} onChange={(event) => setVapiPhoneNumber(event.target.value)} placeholder="+44 20 7946 0000" className="w-full text-sm border border-border rounded-xl px-4 py-2.5 bg-background" />
              </div>
              <div>
                <label className="block text-sm font-bold mb-2">{vapiSettings?.connected ? "New webhook secret (only to rotate)" : "Webhook secret"}</label>
                <input type="password" value={vapiWebhookSecret} onChange={(event) => setVapiWebhookSecret(event.target.value)} placeholder="At least 16 characters" autoComplete="new-password" className="w-full text-sm border border-border rounded-xl px-4 py-2.5 bg-background" />
              </div>
              <div className="rounded-xl border border-border/60 bg-secondary/30 p-3 text-sm">
                <span className="font-bold">Webhook address:</span>{" "}
                <code className="break-all text-xs">{typeof window === "undefined" ? "/api/webhooks/vapi" : `${window.location.origin}/api/webhooks/vapi`}</code>
                <p className="mt-1 text-xs text-muted-foreground">Configure Vapi Custom Credentials to send this secret as <code>x-vapi-secret</code>, then enable end-of-call reports.</p>
              </div>
              <Button onClick={saveVapiMapping} disabled={connectVapi.isPending || (!vapiWebhookSecret && !vapiSettings?.connected)} className="font-bold rounded-xl">
                {connectVapi.isPending ? "Saving…" : vapiSettings?.connected ? "Update Vapi mapping" : "Connect Vapi"}
              </Button>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-border/60 rounded-2xl">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-black flex items-center gap-2">
                <Mic className="w-5 h-5 text-primary" />
                Welcome Message
              </CardTitle>
              <p className="text-sm text-muted-foreground font-medium">
                What callers hear when the AI answers their call.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Type selector */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "generate", label: "Auto-generate", icon: <Sparkles className="w-4 h-4" />, desc: "AI creates a greeting using your business name and trade type" },
                  { id: "text",     label: "Write my own",  icon: <MessageSquare className="w-4 h-4" />, desc: "Type your own welcome message" },
                  { id: "recorded", label: "Record audio",  icon: <Radio className="w-4 h-4" />, desc: "Upload a recorded greeting (coming soon)" },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setWelcomeType(opt.id)}
                    className={cn(
                      "flex flex-col items-center gap-2 p-4 rounded-xl border text-center transition-all",
                      welcomeType === opt.id
                        ? "bg-primary/5 border-primary/40 text-primary"
                        : "border-border/60 text-muted-foreground hover:bg-secondary/50"
                    )}
                  >
                    {opt.icon}
                    <span className="text-xs font-bold">{opt.label}</span>
                  </button>
                ))}
              </div>

              {welcomeType === "generate" && (
                <div className="flex items-start gap-3 p-4 bg-primary/5 border border-primary/20 rounded-xl">
                  <Sparkles className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-foreground">AI-generated greeting</p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      The AI will say something like: <em>"Hello, you've reached [Business Name], your local [trade type] specialist. I'm the AI receptionist — I can take your details and arrange a call back. How can I help today?"</em>
                    </p>
                  </div>
                </div>
              )}

              {welcomeType === "text" && (
                <textarea
                  value={welcomeText}
                  onChange={(e) => setWelcomeText(e.target.value)}
                  placeholder="Hello, you've reached Hartley Joinery. We're currently busy — please stay on the line and our AI assistant will take your details..."
                  rows={4}
                  className="w-full text-sm border border-border rounded-xl px-4 py-3 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-none font-medium"
                />
              )}

              {welcomeType === "recorded" && (
                <div className="flex flex-col items-center gap-3 p-8 border-2 border-dashed border-border/60 rounded-xl text-center">
                  <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
                    <Radio className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <p className="font-bold text-foreground">Audio upload coming soon</p>
                  <p className="text-sm text-muted-foreground">Connect a telephony provider first, then you'll be able to record or upload a custom greeting.</p>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              onClick={() => setDemoOpen(true)}
              className="font-bold rounded-xl gap-2 border-primary/40 text-primary hover:bg-primary/5"
            >
              <PhoneIncoming className="w-4 h-4" />
              Test conversation
            </Button>
            <Button
              onClick={() => saveSettings()}
              disabled={updateSettings.isPending}
              className="font-bold rounded-xl px-8"
            >
              {updateSettings.isPending ? "Saving…" : "Save Settings"}
            </Button>
          </div>
        </div>
      )}

      {/* ── Hours tab ── */}
      {activeTab === "hours" && (
        <div className="space-y-6">
          <Card className="shadow-sm border-border/60 rounded-2xl">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-black flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary" />
                Business Opening Hours
              </CardTitle>
              <p className="text-sm text-muted-foreground font-medium">
                The AI answers calls during these hours. Outside them, the out-of-hours behaviour applies.
              </p>
            </CardHeader>
            <CardContent>
              <BusinessHoursGrid hours={businessHours} onChange={setBusinessHours} />
            </CardContent>
          </Card>

          <Card className="shadow-sm border-border/60 rounded-2xl">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-black flex items-center gap-2">
                <VolumeX className="w-5 h-5 text-primary" />
                Out-of-Hours Behaviour
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { id: "voicemail",   label: "Take a message", icon: <MessageSquare className="w-5 h-5" />, desc: "Caller leaves their details for a callback" },
                  { id: "ai_anyway",   label: "Always answer",  icon: <Phone className="w-5 h-5" />,         desc: "AI answers at any hour" },
                  { id: "reject",      label: "Don't answer",   icon: <PhoneOff className="w-5 h-5" />,      desc: "Calls are not answered out of hours" },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setOutOfHours(opt.id)}
                    className={cn(
                      "flex flex-col gap-2 p-4 rounded-xl border text-left transition-all",
                      outOfHours === opt.id
                        ? "bg-primary/5 border-primary/40 text-primary"
                        : "border-border/60 hover:bg-secondary/50"
                    )}
                  >
                    <div className={outOfHours === opt.id ? "text-primary" : "text-muted-foreground"}>{opt.icon}</div>
                    <div>
                      <p className="font-bold text-sm text-foreground">{opt.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                    </div>
                  </button>
                ))}
              </div>

              {outOfHours === "voicemail" && (
                <div>
                  <label className="block text-sm font-bold mb-2">Out-of-hours message (optional)</label>
                  <textarea
                    value={outOfHoursMsg}
                    onChange={(e) => setOutOfHoursMsg(e.target.value)}
                    placeholder="We're currently closed but I can take a message. Please leave your name, number and what you need and we'll call you back..."
                    rows={3}
                    className="w-full text-sm border border-border rounded-xl px-4 py-3 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-none font-medium"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={() => saveSettings()} disabled={updateSettings.isPending} className="font-bold rounded-xl px-8">
              {updateSettings.isPending ? "Saving…" : "Save Settings"}
            </Button>
          </div>
        </div>
      )}

      {/* ── Call handling tab ── */}
      {activeTab === "handling" && (
        <div className="space-y-6">
          {/* Urgent call transfer */}
          <Card className="shadow-sm border-border/60 rounded-2xl">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-black flex items-center gap-2">
                <PhoneForwarded className="w-5 h-5 text-primary" />
                Urgent Call Transfer
              </CardTitle>
              <p className="text-sm text-muted-foreground font-medium">
                If a caller indicates it's urgent, the AI can transfer them to your mobile.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-xl border border-border/40">
                <div>
                  <p className="font-bold text-sm">Transfer urgent calls</p>
                  <p className="text-xs text-muted-foreground mt-0.5">AI will ask if the call is urgent and offer to connect them</p>
                </div>
                <Toggle checked={transferUrgent} onChange={setTransferUrgent} />
              </div>
              {transferUrgent && (
                <div>
                  <label className="block text-sm font-bold mb-2">Transfer to phone number</label>
                  <input
                    type="tel"
                    value={transferPhone}
                    onChange={(e) => setTransferPhone(e.target.value)}
                    placeholder="+44 7700 900123"
                    className="w-full sm:w-64 text-sm border border-border rounded-xl px-4 py-2.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none font-medium"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Questions config */}
          <Card className="shadow-sm border-border/60 rounded-2xl">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-black flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-primary" />
                Questions to Collect
              </CardTitle>
              <p className="text-sm text-muted-foreground font-medium">
                Choose which information the AI gathers from every caller.
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {/* Contact group */}
                <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-1 pb-1 pt-2">Contact Details</div>
                {DEFAULT_QUESTIONS.filter((q) => q.category === "contact").map((q) => {
                  const on = enabledQs.includes(q.id);
                  return (
                    <div
                      key={q.id}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-xl border transition-colors",
                        on ? "bg-background border-border/60" : "bg-secondary/30 border-border/40 opacity-60"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn("w-2 h-2 rounded-full", on ? "bg-primary" : "bg-border")} />
                        <span className="text-sm font-semibold">{q.label}</span>
                        {q.required && (
                          <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-md">Required</span>
                        )}
                      </div>
                      <Toggle checked={on} onChange={() => toggleQuestion(q.id)} />
                    </div>
                  );
                })}

                <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-1 pb-1 pt-4">Project Details</div>
                {DEFAULT_QUESTIONS.filter((q) => q.category === "project").map((q) => {
                  const on = enabledQs.includes(q.id);
                  return (
                    <div
                      key={q.id}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-xl border transition-colors",
                        on ? "bg-background border-border/60" : "bg-secondary/30 border-border/40 opacity-60"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn("w-2 h-2 rounded-full", on ? "bg-primary" : "bg-border")} />
                        <span className="text-sm font-semibold">{q.label}</span>
                      </div>
                      <Toggle checked={on} onChange={() => toggleQuestion(q.id)} />
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={() => saveSettings()} disabled={updateSettings.isPending} className="font-bold rounded-xl px-8">
              {updateSettings.isPending ? "Saving…" : "Save Settings"}
            </Button>
          </div>
        </div>
      )}

      {/* ── Call log tab ── */}
      {activeTab === "calls" && (
        <div className="space-y-4">
          {/* Today summary */}
          {todayCalls.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Today's Calls", value: todayCalls.length, color: "text-primary" },
                { label: "Follow-up Needed", value: todayCalls.filter((c) => c.followUpRequired).length, color: "text-amber-600" },
                { label: "Surveys Suggested", value: todayCalls.filter((c) => c.surveySuggested).length, color: "text-violet-600" },
              ].map((s) => (
                <div key={s.label} className="bg-card border border-border/60 rounded-2xl p-4 shadow-sm">
                  <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">{s.label}</div>
                  <div className={cn("text-3xl font-black tracking-tight", s.color)}>{s.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Call list */}
          {(allCalls ?? []).length === 0 ? (
            <div className="text-center py-20 bg-card rounded-2xl border border-border/60 shadow-sm">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <PhoneCall className="w-8 h-8 text-primary" />
              </div>
              <p className="text-xl font-black tracking-tight mb-2">No calls yet</p>
              <p className="text-sm text-muted-foreground font-medium max-w-xs mx-auto">
                Once you connect a telephony provider and enable the receptionist, completed calls will appear here with AI summaries and transcripts.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {todayCalls.length > 0 && (
                <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground px-1">Today</div>
              )}
              {todayCalls.map((call) => (
                <CallCard key={call.id} call={call} onUpdate={refetchCalls} />
              ))}
              {(allCalls ?? []).filter((c) => !todayCalls.includes(c)).length > 0 && (
                <>
                  <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground px-1 pt-2">Earlier</div>
                  {(allCalls ?? []).filter((c) => !todayCalls.includes(c)).map((call) => (
                    <CallCard key={call.id} call={call} onUpdate={refetchCalls} />
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>

    {/* ── Demo call modal ── */}
    <DemoCallModal
      open={demoOpen}
      onClose={() => setDemoOpen(false)}
      onComplete={() => {
        setActiveTab("calls");
        refetchCalls();
      }}
      enabledQuestions={enabledQs}
      businessName={company?.name ?? ""}
      tradeType={company?.tradeType ?? ""}
    />
    </>
  );
}
