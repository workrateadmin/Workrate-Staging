import { useGetDashboard, useListJobs, useListAiCalls } from "@workspace/api-client-react";
import { useClerk, useUser } from "@clerk/react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import {
  Inbox, TrendingUp, ChevronRight, MessageSquare, Briefcase, Sparkles,
  Calendar, CalendarDays, Clock, MapPin, Phone, PhoneOff, PhoneForwarded,
  CheckCircle2, AlertCircle, Timer, ArrowUpRight, Wrench, Circle, LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SummaryCard, parseSummary } from "@/components/summary-card";
import { eventsFromJobs, EVENT_CONFIG } from "./schedule";
import {
  format, isToday, parseISO, addDays, isBefore, isAfter,
  startOfDay, formatDistanceToNow, startOfWeek, addDays as addD,
} from "date-fns";
import { cn } from "@/lib/utils";

/* ── Status helpers ─────────────────────────────────────────────────────── */
export function getStatusColorBarClass(status: string) {
  switch (status) {
    case "new_enquiry":      return "bg-blue-500";
    case "reviewing":
    case "survey_required":  return "bg-amber-500";
    case "quote_sent":       return "bg-violet-500";
    case "won":              return "bg-emerald-500";
    case "lost":             return "bg-red-500";
    default:                 return "bg-gray-300";
  }
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    new_enquiry:     { label: "New",            color: "bg-blue-50 text-blue-700 border-blue-200" },
    reviewing:       { label: "Reviewing",      color: "bg-amber-50 text-amber-700 border-amber-200" },
    survey_required: { label: "Survey Required",color: "bg-amber-50 text-amber-700 border-amber-200" },
    quote_sent:      { label: "Quote Sent",     color: "bg-violet-50 text-violet-700 border-violet-200" },
    won:             { label: "Won",            color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    lost:            { label: "Lost",           color: "bg-red-50 text-red-700 border-red-200" },
  };
  const s = map[status] || { label: status, color: "bg-gray-50 text-gray-700 border-gray-200" };
  return (
    <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider border shadow-sm ${s.color}`}>
      {s.label}
    </span>
  );
}

const STATUS_CONFIG: Record<string, { label: string; bar: string; badge: string; text: string }> = {
  new_enquiry:     { label: "New",          bar: "#3b82f6", badge: "#dbeafe", text: "#1e40af" },
  reviewing:       { label: "Reviewing",    bar: "#f59e0b", badge: "#fef3c7", text: "#92400e" },
  survey_required: { label: "Survey Req.",  bar: "#f59e0b", badge: "#fef3c7", text: "#92400e" },
  quote_sent:      { label: "Quote Sent",   bar: "#8b5cf6", badge: "#ede9fe", text: "#5b21b6" },
  won:             { label: "Won",          bar: "#10b981", badge: "#d1fae5", text: "#065f46" },
  lost:            { label: "Lost",         bar: "#ef4444", badge: "#fee2e2", text: "#991b1b" },
};

/* ── Main dashboard ─────────────────────────────────────────────────────── */
export default function Dashboard() {
  const { data: stats, isLoading, isError } = useGetDashboard();

  if (isLoading) {
    return (
      <div className="-mx-4 sm:-mx-6 md:-mx-8 -mt-8">
        <div className="bg-sidebar px-6 md:px-10 py-8">
          <Skeleton className="h-7 w-40 bg-white/10 mb-2" />
          <Skeleton className="h-4 w-24 bg-white/10" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 bg-sidebar/60" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 mt-6 gap-4 px-4 sm:px-6 md:px-8">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-64" />)}
        </div>
      </div>
    );
  }

  if (isError || !stats) {
    return (
      <div className="text-destructive font-medium p-4 border border-destructive/20 bg-destructive/10 rounded-xl">
        Failed to load dashboard data.
      </div>
    );
  }

  const inProgress = stats.reviewing + stats.surveyRequired;

  const metricCards = [
    { label: "New Enquiries", count: stats.newEnquiries, color: "#2dd4bf", bg: "rgba(45,212,191,0.10)", borderColor: "#2dd4bf" },
    { label: "In Progress",   count: inProgress,          color: "#f59e0b", bg: "rgba(245,158,11,0.10)",  borderColor: "#f59e0b" },
    { label: "Quoted",        count: stats.quoteSent,     color: "#8b5cf6", bg: "rgba(139,92,246,0.10)", borderColor: "#8b5cf6" },
    { label: "Won",           count: stats.won,           color: "#10b981", bg: "rgba(16,185,129,0.10)", borderColor: "#10b981" },
  ];

  const totalPipelineEnquiries = stats.newEnquiries + inProgress + stats.quoteSent;
  const breakDown = [
    { label: "New",      value: stats.newEnquiries, color: "bg-teal-400",   hex: "#2dd4bf", percent: totalPipelineEnquiries ? (stats.newEnquiries / totalPipelineEnquiries) * 100 : 0 },
    { label: "In Progress", value: inProgress,       color: "bg-amber-400", hex: "#f59e0b", percent: totalPipelineEnquiries ? (inProgress / totalPipelineEnquiries) * 100 : 0 },
    { label: "Quoted",   value: stats.quoteSent,     color: "bg-violet-400",hex: "#8b5cf6", percent: totalPipelineEnquiries ? (stats.quoteSent / totalPipelineEnquiries) * 100 : 0 },
  ];

  return (
    <div className="animate-in fade-in-0 duration-500">
      {/* ── Full-bleed dark header ───────────────────────────────────────── */}
      <div className="-mx-4 sm:-mx-6 md:-mx-8 -mt-8 bg-sidebar">
        {/* Title row */}
        <div className="flex items-end justify-between px-6 md:px-10 pt-7 pb-6">
          <div>
            <p className="text-[11px] font-bold text-sidebar-foreground/40 uppercase tracking-[0.1em] mb-1">Overview</p>
            <h1 className="text-[26px] font-black text-sidebar-foreground tracking-tight leading-none">Dashboard</h1>
          </div>
          <p className="text-xs text-sidebar-foreground/40 font-medium">Last updated: just now</p>
        </div>

        {/* Metric strip */}
        <div className="grid grid-cols-2 md:grid-cols-4" style={{ gap: 1 }}>
          {metricCards.map((m, i) => (
            <div
              key={m.label}
              className={cn(
                "px-6 md:px-8 py-5",
                i === 0 && "md:rounded-tl-lg",
                i === 3 && "md:rounded-tr-lg",
              )}
              style={{
                background: m.bg,
                borderTop: `3px solid ${m.borderColor}`,
              }}
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.07em] mb-2.5 text-sidebar-foreground/50">
                {m.label}
              </p>
              <div className="flex items-baseline gap-2">
                <span className="text-[44px] font-black text-white leading-none tracking-tight">{m.count}</span>
              </div>
              <Circle
                size={6}
                className="mt-2"
                style={{ color: m.color, fill: m.color }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── Full-bleed 3-column body ─────────────────────────────────────── */}
      <div className="-mx-4 sm:-mx-6 md:-mx-8 flex flex-col md:flex-row border-b border-border/60" style={{ minHeight: 480 }}>

        {/* Col 1 — Recent Leads ─────────────────────────────────────────── */}
        <div className="flex-1 bg-card border-b md:border-b-0 md:border-r border-border/60 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-6 md:px-7 py-5 border-b border-border/60 shrink-0">
            <span className="text-sm font-extrabold text-foreground tracking-tight">Recent Leads</span>
            <Link href="/enquiries" className="flex items-center gap-1 text-[12px] font-bold text-primary hover:text-primary/80 transition-colors">
              View all <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="flex-1 overflow-y-auto">
            {stats.recentEnquiries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center h-full">
                <div className="w-14 h-14 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-4">
                  <Inbox className="w-7 h-7" />
                </div>
                <h3 className="text-base font-bold mb-1">Pipeline is empty</h3>
                <p className="text-sm text-muted-foreground font-medium mb-5">Share your chat link to capture leads.</p>
                <Link href="/chat">
                  <Button size="sm" className="font-semibold rounded-full gap-2">
                    <MessageSquare className="w-3.5 h-3.5" /> View Chat Widget
                  </Button>
                </Link>
              </div>
            ) : (
              stats.recentEnquiries.map((enq, i) => {
                const cfg = STATUS_CONFIG[enq.status] ?? STATUS_CONFIG.new_enquiry;
                const initials = (enq.customerName || "?")
                  .split(" ")
                  .map((w: string) => w[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase();
                return (
                  <Link key={enq.id} href={`/enquiries/${enq.id}`}>
                    <div
                      className={cn(
                        "flex items-center gap-3.5 px-6 md:px-7 py-4 cursor-pointer hover:bg-secondary/40 transition-colors",
                        i < stats.recentEnquiries.length - 1 && "border-b border-border/40"
                      )}
                    >
                      {/* Status bar */}
                      <div className="w-[3px] h-11 rounded-full shrink-0" style={{ background: cfg.bar }} />

                      {/* Avatar */}
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-[13px] font-black shrink-0"
                        style={{ background: `${cfg.bar}20`, color: cfg.bar }}
                      >
                        {initials}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-bold text-foreground leading-none">{enq.customerName}</span>
                          <span
                            className="text-[9.5px] font-extrabold uppercase tracking-[0.05em] px-1.5 py-0.5 rounded"
                            style={{ background: cfg.badge, color: cfg.text }}
                          >
                            {cfg.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground font-medium">
                          {enq.projectType && (
                            <span className="flex items-center gap-1">
                              <Briefcase className="w-2.5 h-2.5" />
                              {enq.projectType}
                            </span>
                          )}
                          {enq.location && (
                            <span className="flex items-center gap-1">
                              <MapPin className="w-2.5 h-2.5" />
                              {enq.location}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Date */}
                      <div className="shrink-0 flex items-center gap-1 text-[11.5px] text-muted-foreground font-medium">
                        <Calendar className="w-3 h-3" />
                        {formatDate(enq.createdAt)}
                      </div>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>

        {/* Col 2 — Pipeline Value + Quick Actions ──────────────────────── */}
        <div className="flex-1 bg-background border-b md:border-b-0 md:border-r border-border/60 flex flex-col overflow-hidden">
          {/* Pipeline value card */}
          <div className="m-5 mb-3 bg-sidebar rounded-2xl p-6 relative overflow-hidden shrink-0">
            <div className="absolute right-[-16px] bottom-[-16px] opacity-[0.05] pointer-events-none">
              <TrendingUp className="w-36 h-36 text-white" />
            </div>

            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-sidebar-foreground/45 mb-2.5">
              Total Pipeline Value
            </p>
            <p className="text-[50px] font-black tracking-tight leading-none text-white mb-2.5">
              {formatCurrency(stats.totalQuoteValue)}
            </p>
            <div className="flex items-center gap-2 mb-5">
              <span className="flex items-center gap-1 bg-emerald-500/18 text-emerald-400 rounded-md px-2.5 py-1 text-[11.5px] font-bold">
                <ArrowUpRight className="w-3 h-3" /> Active pipeline
              </span>
            </div>

            {/* Segmented bar */}
            <div className="flex rounded h-[5px] overflow-hidden gap-[1px] mb-4">
              {breakDown.map((b) =>
                b.value > 0 ? (
                  <div key={b.label} className={cn("h-full", b.color)} style={{ flex: b.value }} />
                ) : null
              )}
            </div>

            {/* Stage legend */}
            {breakDown.map((b) => (
              <div
                key={b.label}
                className="flex items-center justify-between py-[5px] border-b border-white/[0.05] last:border-0"
              >
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-[2px] shrink-0" style={{ background: b.hex }} />
                  <span className="text-[12.5px] font-medium text-sidebar-foreground/70">{b.label}</span>
                </div>
                <span className="text-[12.5px] font-bold text-sidebar-foreground/90">{b.value}</span>
              </div>
            ))}
          </div>

          {/* Quick Actions */}
          <div className="mx-5 mb-5 bg-card rounded-2xl border border-border/60 px-5 py-4 shrink-0">
            <p className="text-[13px] font-extrabold text-foreground tracking-tight mb-3">Quick Actions</p>
            {[
              { icon: TrendingUp, label: "View full pipeline",   sub: `${stats.newEnquiries + inProgress + stats.quoteSent} total enquiries`, href: "/enquiries" },
              { icon: Wrench,     label: "Update company rates", sub: "Labour rates & markup",                                                 href: "/settings" },
            ].map((a, i) => (
              <Link key={i} href={a.href}>
                <div
                  className={cn(
                    "flex items-center gap-3 py-2.5 cursor-pointer hover:opacity-80 transition-opacity",
                    i === 0 && "border-b border-border/60"
                  )}
                >
                  <div className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                    <a.icon className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-foreground">{a.label}</p>
                    <p className="text-[11.5px] text-muted-foreground mt-0.5">{a.sub}</p>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Col 3 — Upcoming Schedule ─────────────────────────────────── */}
        <div className="w-full md:w-[300px] bg-card flex flex-col overflow-hidden shrink-0">
          <UpcomingPanel />
        </div>
      </div>

      {/* ── Below the fold: remaining widgets ───────────────────────────── */}
      <div className="space-y-8 mt-8">
        <SchedulingWidgets />
        <TodaysCallsWidget />
        <AiSummariesSection recentEnquiries={stats.recentEnquiries} />
      </div>
    </div>
  );
}

/* ── Hex colour per event type ────────────────────────────────────────────── */
const EVENT_HEX: Record<string, string> = {
  survey:          "#3b82f6",
  "install-start": "#10b981",
  "install-end":   "#f59e0b",
};

/* ── Upcoming schedule panel (Col 3) ──────────────────────────────────────── */
function UpcomingPanel() {
  const { data: jobs = [] } = useListJobs();
  const events = eventsFromJobs(jobs);
  const today = startOfDay(new Date());
  const in14Days = addDays(today, 14);

  const upcoming = events
    .filter((e) => {
      try {
        const d = parseISO(e.date);
        return (isAfter(d, today) || isToday(d)) && isBefore(d, in14Days);
      } catch { return false; }
    })
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);

  // Mini calendar strip — Mon→Sun of the current week
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addD(weekStart, i));
  const eventDates = new Set(events.map((e) => e.date.slice(0, 10)));

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-5 border-b border-border/60 shrink-0">
        <span className="text-sm font-extrabold text-foreground tracking-tight">Upcoming</span>
        <Link href="/schedule" className="flex items-center gap-1 text-[12px] font-bold text-primary hover:text-primary/80 transition-colors">
          Schedule <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Mini calendar strip */}
      <div className="px-5 pt-4 pb-2 shrink-0">
        <div className="flex gap-1">
          {weekDays.map((day, i) => {
            const isCurrentDay = isToday(day);
            const dateStr = format(day, "yyyy-MM-dd");
            const hasEvent = eventDates.has(dateStr);
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[10px] font-bold text-muted-foreground tracking-[0.04em]">
                  {format(day, "EEEEE")}
                </span>
                <div
                  className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold",
                    isCurrentDay
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground"
                  )}
                >
                  {format(day, "d")}
                </div>
                <div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    background: hasEvent
                      ? (isCurrentDay ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))")
                      : "transparent",
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Event list */}
      <div className="flex-1 overflow-y-auto py-2">
        {upcoming.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 px-5 text-center">
            <Calendar className="w-5 h-5 text-muted-foreground/50" />
            <p className="text-sm font-bold text-foreground/60">Nothing coming up</p>
            <p className="text-xs text-muted-foreground">Schedule events on your jobs to see them here.</p>
          </div>
        ) : (
          upcoming.map((ev, i) => {
            const cfg = EVENT_CONFIG[ev.type];
            const hex = EVENT_HEX[ev.type] ?? "#6366f1";
            const evDay = parseISO(ev.date);
            return (
              <Link key={ev.id} href={`/jobs/${ev.jobId}`}>
                <div
                  className={cn(
                    "flex gap-3.5 px-5 py-3 cursor-pointer hover:bg-secondary/40 transition-colors",
                    i < upcoming.length - 1 && "border-b border-border/40"
                  )}
                >
                  {/* Date block */}
                  <div
                    className="w-11 h-[52px] rounded-xl flex flex-col items-center justify-center shrink-0 border"
                    style={{ background: `${hex}14`, borderColor: `${hex}30` }}
                  >
                    <span className="text-[9.5px] font-bold uppercase tracking-[0.06em]" style={{ color: hex }}>
                      {format(evDay, "EEE")}
                    </span>
                    <span className="text-[20px] font-black leading-none" style={{ color: hex }}>
                      {format(evDay, "d")}
                    </span>
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-foreground mb-0.5">{cfg.label}</p>
                    <p className="text-xs text-muted-foreground font-medium mb-1.5 truncate">{ev.jobName}</p>
                    <span
                      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-bold"
                      style={{ background: `${hex}14`, color: hex }}
                    >
                      <Clock className="w-2.5 h-2.5" /> {format(evDay, "h:mmaaa")}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })
        )}

        {/* Add site visit placeholder */}
        <div className="mx-4 mt-3 mb-2 rounded-xl border border-dashed border-border/60 bg-secondary/30 p-4 flex flex-col items-center gap-1.5">
          <Calendar className="w-5 h-5 text-muted-foreground/50" />
          <p className="text-xs font-bold text-foreground/60">Add a site visit</p>
          <p className="text-[11px] text-muted-foreground text-center">Schedule time on an active job</p>
        </div>
      </div>

      {/* User strip */}
      <UserStrip />
    </>
  );
}

function UserStrip() {
  const { signOut } = useClerk();
  const { user } = useUser();
  return (
    <div className="px-4 py-3.5 border-t border-border/60 bg-secondary/20 flex items-center gap-2.5 shrink-0">
      <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-black shrink-0">
        {user?.firstName?.charAt(0) || "U"}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12.5px] font-bold text-foreground truncate">{user?.fullName || "Account"}</p>
        <p className="text-[11px] text-muted-foreground truncate">{user?.primaryEmailAddress?.emailAddress}</p>
      </div>
      <button
        onClick={() => signOut({ redirectUrl: "/" })}
        className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
        title="Sign out"
      >
        <LogOut className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/* ── Scheduling Widgets ───────────────────────────────────────────────────── */
function SchedulingWidgets() {
  const { data: jobs = [] } = useListJobs();
  const events = eventsFromJobs(jobs);
  const today = startOfDay(new Date());
  const in7Days = addDays(today, 7);

  const todayEvents = events.filter((e) => {
    try { return isToday(parseISO(e.date)); } catch { return false; }
  });

  const upcomingEvents = events
    .filter((e) => {
      try {
        const d = parseISO(e.date);
        return isAfter(d, today) && isBefore(d, in7Days);
      } catch { return false; }
    })
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);

  if (todayEvents.length === 0 && upcomingEvents.length === 0) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card className="shadow-sm border-border/60 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border/60 bg-primary/5 flex items-center justify-between">
          <h2 className="text-base font-bold flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" /> Today's Schedule
          </h2>
          <Link href="/schedule" className="text-xs font-bold text-primary hover:text-primary/80 flex items-center gap-1">
            Calendar <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
        <CardContent className="p-4">
          {todayEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground font-medium text-center py-4 italic">Nothing scheduled for today</p>
          ) : (
            <div className="space-y-2">
              {todayEvents.map((event) => {
                const cfg = EVENT_CONFIG[event.type];
                return (
                  <Link key={event.id} href={`/jobs/${event.jobId}`}>
                    <div className={cn("flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer hover:shadow-sm transition-all", cfg.bg, cfg.border)}>
                      <div className={cn("w-2.5 h-2.5 rounded-full shrink-0", cfg.dot)} />
                      <div className="flex-1 min-w-0">
                        <div className={cn("text-[10px] font-bold uppercase tracking-wider", cfg.text)}>{cfg.label}</div>
                        <div className="text-sm font-bold text-foreground truncate">{event.jobName}</div>
                      </div>
                      {event.location && (
                        <span className="text-xs text-muted-foreground font-medium flex items-center gap-1 shrink-0">
                          <MapPin className="w-3 h-3" />{event.location}
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-sm border-border/60 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border/60 flex items-center justify-between">
          <h2 className="text-base font-bold flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-muted-foreground" /> Upcoming (7 days)
          </h2>
          <Link href="/schedule" className="text-xs font-bold text-primary hover:text-primary/80 flex items-center gap-1">
            Calendar <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
        <CardContent className="p-4">
          {upcomingEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground font-medium text-center py-4 italic">Nothing in the next 7 days</p>
          ) : (
            <div className="space-y-2">
              {upcomingEvents.map((event) => {
                const cfg = EVENT_CONFIG[event.type];
                return (
                  <Link key={event.id} href={`/jobs/${event.jobId}`}>
                    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border/40 cursor-pointer hover:bg-secondary/50 hover:shadow-sm transition-all">
                      <div className={cn("w-2.5 h-2.5 rounded-full shrink-0", cfg.dot)} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{cfg.label}</div>
                        <div className="text-sm font-bold text-foreground truncate">{event.jobName}</div>
                      </div>
                      <span className="text-xs font-bold text-muted-foreground shrink-0">
                        {format(parseISO(event.date), "EEE d MMM")}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ── AI Summaries Section ─────────────────────────────────────────────────── */
function AiSummariesSection({ recentEnquiries }: { recentEnquiries: any[] }) {
  const summarised = recentEnquiries.filter((e) => e.aiSummary && parseSummary(e.aiSummary));
  if (summarised.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pb-2 border-b border-border/60">
        <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" /> Latest AI Job Summaries
        </h2>
        <Link href="/enquiries" className="text-sm font-semibold text-primary hover:text-primary/80 transition-colors flex items-center gap-1">
          All leads <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {summarised.map((enq) => (
          <Link key={enq.id} href={`/enquiries/${enq.id}`}>
            <Card className="border-border/60 shadow-sm hover:shadow-md transition-all cursor-pointer bg-card rounded-2xl overflow-hidden group hover:border-primary/30">
              <div className="px-5 py-4 border-b border-border/60 bg-secondary/30 flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-bold text-sm text-foreground leading-tight">{enq.customerName}</h3>
                  <p className="text-xs text-muted-foreground font-semibold mt-0.5">{enq.projectType || "General Enquiry"}</p>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-semibold shrink-0 pt-0.5">
                  <Calendar className="w-3 h-3" />
                  {formatDate(enq.createdAt)}
                </div>
              </div>
              <CardContent className="p-5">
                <SummaryCard aiSummary={enq.aiSummary!} />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ── Today's Calls Widget ─────────────────────────────────────────────────── */
function TodaysCallsWidget() {
  const { data: calls } = useListAiCalls();

  const todayCalls = (calls ?? []).filter((c) => {
    const ts = c.callStartedAt ?? c.createdAt;
    return ts ? isToday(parseISO(ts)) : false;
  });

  if (todayCalls.length === 0) return null;

  const statusIcons: Record<string, React.ReactNode> = {
    completed:   <CheckCircle2 className="w-4 h-4 text-green-600" />,
    missed:      <PhoneOff className="w-4 h-4 text-red-500" />,
    transferred: <PhoneForwarded className="w-4 h-4 text-blue-600" />,
    dropped:     <AlertCircle className="w-4 h-4 text-amber-600" />,
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between pb-2 border-b border-border/60">
        <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <Phone className="w-5 h-5 text-primary" /> Today's Calls
        </h2>
        <Link href="/ai-receptionist" className="text-sm font-semibold text-primary hover:text-primary/80 transition-colors flex items-center gap-1">
          View all <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {todayCalls.slice(0, 6).map((call) => (
          <Link key={call.id} href="/ai-receptionist">
            <div className="bg-card border border-border/60 rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-primary/20 transition-all cursor-pointer group">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Phone className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-black text-sm tracking-tight truncate">
                      {call.callerName || call.callerPhone || "Unknown caller"}
                    </div>
                    {call.callerPhone && call.callerName && (
                      <div className="text-xs text-muted-foreground truncate">{call.callerPhone}</div>
                    )}
                  </div>
                </div>
                {statusIcons[call.callStatus] ?? <Phone className="w-4 h-4 text-muted-foreground" />}
              </div>

              {call.aiSummary && (() => {
                try {
                  const s = JSON.parse(call.aiSummary);
                  return s.summary ? (
                    <p className="text-xs text-muted-foreground font-medium line-clamp-2 mb-2 leading-relaxed">{s.summary}</p>
                  ) : null;
                } catch { return null; }
              })()}

              <div className="flex items-center gap-3 flex-wrap">
                {call.durationSeconds != null && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1 font-medium">
                    <Timer className="w-3 h-3" />
                    {Math.floor(call.durationSeconds / 60) > 0
                      ? `${Math.floor(call.durationSeconds / 60)}m ${call.durationSeconds % 60}s`
                      : `${call.durationSeconds}s`}
                  </span>
                )}
                {call.followUpRequired && (
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md">
                    Follow-up
                  </span>
                )}
                {call.surveySuggested && (
                  <span className="text-[10px] font-bold text-violet-700 bg-violet-50 border border-violet-200 px-1.5 py-0.5 rounded-md">
                    Survey
                  </span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

