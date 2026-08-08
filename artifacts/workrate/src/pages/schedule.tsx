import { useState, useMemo, useCallback } from "react";
import {
  useListJobs,
  useScheduleJob,
  getListJobsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  addDays,
  subDays,
  parseISO,
} from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Calendar,
  LayoutList,
  ExternalLink,
  Save,
  X,
} from "lucide-react";
import { JOB_STATUSES, JobStatusBadge } from "./jobs";

// ── Types ─────────────────────────────────────────────────────────────────────

export type EventType = "survey" | "install-start" | "install-end";

export interface CalendarEvent {
  id: string;
  jobId: number;
  type: EventType;
  date: string; // YYYY-MM-DD
  jobName: string;
  status: string;
  location?: string | null;
  projectType?: string | null;
}

type View = "month" | "week" | "day";

// ── Event config ──────────────────────────────────────────────────────────────

const EVENT_CONFIG: Record<
  EventType,
  { label: string; shortLabel: string; bg: string; text: string; border: string; dot: string }
> = {
  survey: {
    label: "Site Survey",
    shortLabel: "Survey",
    bg: "bg-teal-50",
    text: "text-teal-700",
    border: "border-teal-200",
    dot: "bg-teal-500",
  },
  "install-start": {
    label: "Install Start",
    shortLabel: "Install",
    bg: "bg-green-50",
    text: "text-green-700",
    border: "border-green-200",
    dot: "bg-green-500",
  },
  "install-end": {
    label: "Install End",
    shortLabel: "Ends",
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
    dot: "bg-amber-500",
  },
};

const TYPE_TO_FIELD: Record<EventType, string> = {
  survey: "siteSurveyDate",
  "install-start": "installationStartDate",
  "install-end": "installationEndDate",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function eventsFromJobs(jobs: any[]): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  for (const job of jobs) {
    if (job.siteSurveyDate) {
      events.push({
        id: `${job.id}-survey`,
        jobId: job.id,
        type: "survey",
        date: job.siteSurveyDate,
        jobName: job.customerName,
        status: job.status,
        location: job.location,
        projectType: job.projectType,
      });
    }
    // Use installationStartDate, or fall back to legacy installDate if present
    const startDate = job.installationStartDate || job.installDate;
    if (startDate) {
      events.push({
        id: `${job.id}-start`,
        jobId: job.id,
        type: "install-start",
        date: startDate,
        jobName: job.customerName,
        status: job.status,
        location: job.location,
        projectType: job.projectType,
      });
    }
    if (job.installationEndDate) {
      events.push({
        id: `${job.id}-end`,
        jobId: job.id,
        type: "install-end",
        date: job.installationEndDate,
        jobName: job.customerName,
        status: job.status,
        location: job.location,
        projectType: job.projectType,
      });
    }
  }
  return events;
}

function eventsForDate(events: CalendarEvent[], date: Date): CalendarEvent[] {
  const iso = format(date, "yyyy-MM-dd");
  return events.filter((e) => e.date === iso);
}

// ── Event pill ────────────────────────────────────────────────────────────────

function EventPill({
  event,
  onEdit,
  compact = false,
}: {
  event: CalendarEvent;
  onEdit: (event: CalendarEvent) => void;
  compact?: boolean;
}) {
  const cfg = EVENT_CONFIG[event.type];

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData(
      "application/workrate-event",
      JSON.stringify({ jobId: event.jobId, type: event.type })
    );
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onClick={(e) => {
        e.stopPropagation();
        onEdit(event);
      }}
      title={`${cfg.label}: ${event.jobName}`}
      className={cn(
        "flex items-center gap-1 px-1.5 py-0.5 rounded-md border font-semibold cursor-grab active:cursor-grabbing select-none hover:opacity-90 transition-opacity",
        cfg.bg,
        cfg.text,
        cfg.border,
        compact ? "text-[10px]" : "text-xs"
      )}
    >
      <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", cfg.dot)} />
      <span className="font-bold shrink-0">{cfg.shortLabel}</span>
      <span className="truncate opacity-80">{event.jobName}</span>
    </div>
  );
}

// ── Month view ────────────────────────────────────────────────────────────────

function MonthView({
  currentDate,
  events,
  onEdit,
  onDrop,
}: {
  currentDate: Date;
  events: CalendarEvent[];
  onEdit: (event: CalendarEvent) => void;
  onDrop: (jobId: number, type: EventType, newDate: string) => void;
}) {
  const [dragOver, setDragOver] = useState<string | null>(null);

  const weeks = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start, end });
    const result: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) {
      result.push(days.slice(i, i + 7));
    }
    return result;
  }, [currentDate]);

  const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const handleDragOver = (e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOver(dateStr);
  };

  const handleDrop = (e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    setDragOver(null);
    try {
      const data = JSON.parse(e.dataTransfer.getData("application/workrate-event"));
      onDrop(data.jobId, data.type, dateStr);
    } catch {}
  };

  return (
    <div className="select-none">
      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_LABELS.map((d) => (
          <div key={d} className="py-2 text-center text-xs font-bold text-muted-foreground uppercase tracking-wider">
            {d}
          </div>
        ))}
      </div>
      {/* Weeks */}
      <div className="border border-border/60 rounded-xl overflow-hidden">
        {weeks.map((week, wi) => (
          <div key={wi} className={cn("grid grid-cols-7", wi < weeks.length - 1 && "border-b border-border/40")}>
            {week.map((day, di) => {
              const dateStr = format(day, "yyyy-MM-dd");
              const dayEvents = eventsForDate(events, day);
              const inMonth = isSameMonth(day, currentDate);
              const today = isToday(day);
              const isDragTarget = dragOver === dateStr;
              const isWeekend = di >= 5;

              return (
                <div
                  key={dateStr}
                  onDragOver={(e) => handleDragOver(e, dateStr)}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={(e) => handleDrop(e, dateStr)}
                  className={cn(
                    "min-h-[90px] p-1.5 transition-colors",
                    di < 6 && "border-r border-border/40",
                    !inMonth && "bg-secondary/30",
                    isWeekend && inMonth && "bg-secondary/20",
                    isDragTarget && "bg-primary/5 ring-1 ring-inset ring-primary/30"
                  )}
                >
                  <div className={cn(
                    "w-7 h-7 flex items-center justify-center rounded-full text-sm font-bold mb-1 transition-colors",
                    today && "bg-primary text-primary-foreground",
                    !today && !inMonth && "text-muted-foreground/50",
                    !today && inMonth && "text-foreground hover:bg-secondary cursor-default"
                  )}>
                    {format(day, "d")}
                  </div>
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 2).map((event) => (
                      <EventPill key={event.id} event={event} onEdit={onEdit} compact />
                    ))}
                    {dayEvents.length > 2 && (
                      <div
                        className="text-[10px] font-bold text-muted-foreground px-1.5 cursor-pointer hover:text-foreground"
                        onClick={() => onEdit(dayEvents[2])}
                      >
                        +{dayEvents.length - 2} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Week view ─────────────────────────────────────────────────────────────────

function WeekView({
  currentDate,
  events,
  onEdit,
  onDrop,
}: {
  currentDate: Date;
  events: CalendarEvent[];
  onEdit: (event: CalendarEvent) => void;
  onDrop: (jobId: number, type: EventType, newDate: string) => void;
}) {
  const [dragOver, setDragOver] = useState<string | null>(null);

  const days = useMemo(() => {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end: addDays(start, 6) });
  }, [currentDate]);

  const handleDrop = (e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    setDragOver(null);
    try {
      const data = JSON.parse(e.dataTransfer.getData("application/workrate-event"));
      onDrop(data.jobId, data.type, dateStr);
    } catch {}
  };

  return (
    <div className="border border-border/60 rounded-xl overflow-hidden">
      <div className="grid grid-cols-7 border-b border-border/60">
        {days.map((day, i) => {
          const today = isToday(day);
          return (
            <div
              key={i}
              className={cn(
                "py-3 text-center border-r border-border/40 last:border-r-0",
                today && "bg-primary/5"
              )}
            >
              <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                {format(day, "EEE")}
              </div>
              <div className={cn(
                "w-8 h-8 flex items-center justify-center rounded-full text-sm font-black mx-auto mt-1",
                today ? "bg-primary text-primary-foreground" : "text-foreground"
              )}>
                {format(day, "d")}
              </div>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-7 min-h-[300px]">
        {days.map((day, i) => {
          const dateStr = format(day, "yyyy-MM-dd");
          const dayEvents = eventsForDate(events, day);
          const isDragTarget = dragOver === dateStr;
          return (
            <div
              key={dateStr}
              onDragOver={(e) => { e.preventDefault(); setDragOver(dateStr); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => handleDrop(e, dateStr)}
              className={cn(
                "p-2 border-r border-border/40 last:border-r-0 transition-colors",
                isDragTarget && "bg-primary/5 ring-1 ring-inset ring-primary/30",
                isToday(day) && !isDragTarget && "bg-primary/5"
              )}
            >
              <div className="space-y-1">
                {dayEvents.map((event) => (
                  <EventPill key={event.id} event={event} onEdit={onEdit} />
                ))}
                {dayEvents.length === 0 && (
                  <div className="h-8" /> // empty spacer for drop target
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Day view ──────────────────────────────────────────────────────────────────

function DayView({
  currentDate,
  events,
  onEdit,
  onDrop,
}: {
  currentDate: Date;
  events: CalendarEvent[];
  onEdit: (event: CalendarEvent) => void;
  onDrop: (jobId: number, type: EventType, newDate: string) => void;
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const dayEvents = eventsForDate(events, currentDate);
  const dateStr = format(currentDate, "yyyy-MM-dd");

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    try {
      const data = JSON.parse(e.dataTransfer.getData("application/workrate-event"));
      onDrop(data.jobId, data.type, dateStr);
    } catch {}
  };

  return (
    <div className="border border-border/60 rounded-xl overflow-hidden">
      <div className={cn(
        "px-6 py-4 border-b border-border/60",
        isToday(currentDate) && "bg-primary/5"
      )}>
        <div className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
          {format(currentDate, "EEEE")}
        </div>
        <div className="text-3xl font-black tracking-tight">
          {format(currentDate, "d MMMM yyyy")}
          {isToday(currentDate) && (
            <span className="ml-3 text-sm font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">Today</span>
          )}
        </div>
      </div>
      <div
        className={cn(
          "p-4 min-h-[200px] transition-colors",
          isDragOver && "bg-primary/5 ring-1 ring-inset ring-primary/30"
        )}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
      >
        {dayEvents.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-semibold">Nothing scheduled</p>
            <p className="text-sm mt-1 opacity-70">Drag an event here or click Edit on a job to add dates</p>
          </div>
        ) : (
          <div className="space-y-3">
            {dayEvents.map((event) => {
              const cfg = EVENT_CONFIG[event.type];

              const handleDragStart = (e: React.DragEvent) => {
                e.dataTransfer.setData(
                  "application/workrate-event",
                  JSON.stringify({ jobId: event.jobId, type: event.type })
                );
                e.dataTransfer.effectAllowed = "move";
              };

              return (
                <div
                  key={event.id}
                  draggable
                  onDragStart={handleDragStart}
                  onClick={() => onEdit(event)}
                  className={cn(
                    "flex items-center gap-4 p-4 rounded-xl border cursor-grab active:cursor-grabbing hover:shadow-md transition-all select-none",
                    cfg.bg, cfg.border
                  )}
                >
                  <div className={cn("w-3 h-3 rounded-full shrink-0", cfg.dot)} />
                  <div className="flex-1 min-w-0">
                    <div className={cn("text-xs font-bold uppercase tracking-wider mb-0.5", cfg.text)}>
                      {cfg.label}
                    </div>
                    <div className="font-black text-lg tracking-tight text-foreground">{event.jobName}</div>
                    {(event.projectType || event.location) && (
                      <div className="text-sm text-muted-foreground font-medium mt-0.5">
                        {event.projectType}{event.location ? ` · ${event.location}` : ""}
                      </div>
                    )}
                  </div>
                  <JobStatusBadge status={event.status} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Edit dialog ───────────────────────────────────────────────────────────────

function EventEditDialog({
  event,
  job,
  open,
  onClose,
  onSave,
  isSaving,
}: {
  event: CalendarEvent | null;
  job: any;
  open: boolean;
  onClose: () => void;
  onSave: (data: {
    siteSurveyDate?: string;
    installationStartDate?: string;
    installationEndDate?: string;
    status?: string;
    notes?: string;
  }) => void;
  isSaving: boolean;
}) {
  const [surveyDate, setSurveyDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState("");
  const [notes, setNotes] = useState("");

  // Populate from job when dialog opens
  const init = useCallback(() => {
    if (job) {
      setSurveyDate(job.siteSurveyDate ?? "");
      setStartDate(job.installationStartDate ?? "");
      setEndDate(job.installationEndDate ?? "");
      setStatus(job.status ?? "");
      setNotes(job.notes ?? "");
    }
  }, [job]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        className="max-w-md rounded-2xl"
        onOpenAutoFocus={() => init()}
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-black tracking-tight">
            {job?.customerName ?? "Job"}
          </DialogTitle>
          {(job?.projectType || job?.location) && (
            <p className="text-sm text-muted-foreground font-medium">
              {job?.projectType}{job?.location ? ` · ${job.location}` : ""}
            </p>
          )}
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Status */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-10 rounded-xl border-border/60 font-semibold">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {JOB_STATUSES.map((s) => (
                  <SelectItem key={s} value={s} className="font-semibold">{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Scheduling dates */}
          <div className="space-y-3 bg-secondary/30 rounded-xl p-4 border border-border/40">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-teal-500" />
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Site Survey</Label>
            </div>
            <Input
              type="date"
              value={surveyDate}
              onChange={(e) => setSurveyDate(e.target.value)}
              className="h-10 rounded-xl border-border/60 font-medium"
            />

            <div className="flex items-center gap-2 mt-3 mb-1">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Installation Start</Label>
            </div>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-10 rounded-xl border-border/60 font-medium"
            />

            <div className="flex items-center gap-2 mt-3 mb-1">
              <div className="w-2 h-2 rounded-full bg-amber-500" />
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Installation End</Label>
            </div>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-10 rounded-xl border-border/60 font-medium"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Notes</Label>
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add scheduling notes…"
              className="field-input resize-none font-medium rounded-xl"
            />
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 text-[11px] font-semibold text-muted-foreground">
            <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-teal-500" /> Survey</span>
            <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-500" /> Install</span>
            <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-amber-500" /> End</span>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <Button
            onClick={() =>
              onSave({
                siteSurveyDate: surveyDate,
                installationStartDate: startDate,
                installationEndDate: endDate,
                status,
                notes,
              })
            }
            disabled={isSaving}
            className="flex-1 h-11 rounded-xl font-bold hover-elevate"
          >
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? "Saving…" : "Save"}
          </Button>
          {job && (
            <Link href={`/jobs/${job.id}`}>
              <Button variant="outline" size="icon" className="h-11 w-11 rounded-xl border-border/60">
                <ExternalLink className="w-4 h-4" />
              </Button>
            </Link>
          )}
          <Button variant="outline" size="icon" onClick={onClose} className="h-11 w-11 rounded-xl border-border/60">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Legend ────────────────────────────────────────────────────────────────────

function CalendarLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold text-muted-foreground">
      {(Object.entries(EVENT_CONFIG) as [EventType, (typeof EVENT_CONFIG)[EventType]][]).map(([type, cfg]) => (
        <span key={type} className="flex items-center gap-1.5">
          <div className={cn("w-2.5 h-2.5 rounded-full", cfg.dot)} />
          {cfg.label}
        </span>
      ))}
      <span className="text-muted-foreground/50 text-[11px] hidden sm:inline">
        · Drag events to reschedule
      </span>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Schedule() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<View>("month");
  const [editEvent, setEditEvent] = useState<CalendarEvent | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: jobs = [] } = useListJobs();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const scheduleJob = useScheduleJob({
    mutation: {
      onSuccess: () => {
        toast({ title: "Schedule updated" });
        queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
        setDialogOpen(false);
      },
      onError: () => toast({ title: "Failed to update schedule", variant: "destructive" }),
    },
  });

  const events = useMemo(() => eventsFromJobs(jobs), [jobs]);

  // The full job object for the currently-editing event
  const editingJob = useMemo(
    () => (editEvent ? jobs.find((j: any) => j.id === editEvent.jobId) ?? null : null),
    [editEvent, jobs]
  );

  const handleEdit = useCallback((event: CalendarEvent) => {
    setEditEvent(event);
    setDialogOpen(true);
  }, []);

  const handleDrop = useCallback(
    (jobId: number, type: EventType, newDate: string) => {
      const field = TYPE_TO_FIELD[type];
      scheduleJob.mutate({ id: jobId, data: { [field]: newDate } });
      // Optimistic feedback
      toast({ title: `Rescheduled to ${newDate}` });
    },
    [scheduleJob, toast]
  );

  const handleSave = useCallback(
    (data: {
      siteSurveyDate?: string;
      installationStartDate?: string;
      installationEndDate?: string;
      status?: string;
      notes?: string;
    }) => {
      if (!editingJob) return;
      scheduleJob.mutate({ id: editingJob.id, data });
    },
    [editingJob, scheduleJob]
  );

  // Navigation
  const handlePrev = () => {
    if (view === "month") setCurrentDate(subMonths(currentDate, 1));
    else if (view === "week") setCurrentDate(subWeeks(currentDate, 1));
    else setCurrentDate(subDays(currentDate, 1));
  };
  const handleNext = () => {
    if (view === "month") setCurrentDate(addMonths(currentDate, 1));
    else if (view === "week") setCurrentDate(addDays(currentDate, 7));
    else setCurrentDate(addDays(currentDate, 1));
  };
  const handleToday = () => setCurrentDate(new Date());

  const title = (() => {
    if (view === "month") return format(currentDate, "MMMM yyyy");
    if (view === "week") {
      const start = startOfWeek(currentDate, { weekStartsOn: 1 });
      const end = addDays(start, 6);
      return isSameMonth(start, end)
        ? `${format(start, "d")}–${format(end, "d MMM yyyy")}`
        : `${format(start, "d MMM")} – ${format(end, "d MMM yyyy")}`;
    }
    return format(currentDate, "d MMMM yyyy");
  })();

  return (
    <div className="max-w-6xl mx-auto space-y-4 animate-in fade-in-0 duration-300">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        {/* Left: nav + title */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handlePrev} className="h-9 w-9 rounded-xl border-border/60">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={handleNext} className="h-9 w-9 rounded-xl border-border/60">
            <ChevronRight className="w-4 h-4" />
          </Button>
          <h2 className="text-lg font-black tracking-tight ml-1">{title}</h2>
          {!isToday(currentDate) && (
            <Button variant="ghost" size="sm" onClick={handleToday} className="rounded-xl font-bold text-xs h-8">
              Today
            </Button>
          )}
        </div>

        {/* Right: view toggle */}
        <div className="flex items-center gap-1 bg-secondary/60 border border-border/60 rounded-xl p-1 w-fit">
          {(["month", "week", "day"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all",
                view === v
                  ? "bg-background shadow-sm text-foreground border border-border/60"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <CalendarLegend />

      {/* Calendar */}
      {view === "month" && (
        <MonthView
          currentDate={currentDate}
          events={events}
          onEdit={handleEdit}
          onDrop={handleDrop}
        />
      )}
      {view === "week" && (
        <WeekView
          currentDate={currentDate}
          events={events}
          onEdit={handleEdit}
          onDrop={handleDrop}
        />
      )}
      {view === "day" && (
        <DayView currentDate={currentDate} events={events} onEdit={handleEdit} onDrop={handleDrop} />
      )}

      {/* Empty state */}
      {events.length === 0 && (
        <Card className="border-dashed border-border/60 bg-secondary/30 rounded-2xl mt-4">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <CalendarDays className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <p className="text-xl font-black tracking-tight mb-2">No events scheduled</p>
            <p className="text-sm text-muted-foreground font-medium max-w-xs">
              Open a job and set survey or installation dates to see them here.
            </p>
            <Link href="/jobs">
              <Button className="mt-5 font-bold rounded-xl hover-elevate">Go to Jobs</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Edit dialog */}
      <EventEditDialog
        event={editEvent}
        job={editingJob}
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditEvent(null); }}
        onSave={handleSave}
        isSaving={scheduleJob.isPending}
      />
    </div>
  );
}

// ── Re-export helpers for dashboard ──────────────────────────────────────────
export { eventsFromJobs, EVENT_CONFIG };
