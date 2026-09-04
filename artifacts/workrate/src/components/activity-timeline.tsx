/**
 * WorkRate – Unified Activity Timeline
 *
 * Reusable component backed by the real generated enquiry/job timeline hooks.
 * Supports:
 *   - server limit/offset pagination with "Load more"
 *   - newest/oldest sort toggle (resets on change)
 *   - category filters: All, Messages, Calls, Quotes, Jobs, Invoices & payments
 *   - dateOnly events: show exact UK calendar date, no time, no timezone shift
 *   - loading skeleton, error + retry, empty state
 *   - de-duplication when appending pages
 *   - wouter Link for internal /app routes; plain <a> for external hrefs only
 *
 * No emojis. No invented styling tokens. No raw colours.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { Link } from "wouter";
import {
  useGetEnquiryTimeline,
  useGetJobTimeline,
  getGetEnquiryTimelineQueryKey,
  getGetJobTimelineQueryKey,
} from "@workspace/api-client-react";
import type {
  TimelineEvent,
  TimelineEventCategory,
  TimelineCategoryParameter,
  TimelineOrderParameter,
  TimelinePage,
} from "@workspace/api-client-react";
import { Button } from "@workspace/memphis-bold/components/ui/button";
import { Skeleton } from "@workspace/memphis-bold/components/ui/skeleton";
import { cn } from "@workspace/memphis-bold/lib/utils";
import { formatCurrency } from "@/lib/utils";
import {
  MessageSquare,
  Phone,
  FileText,
  Briefcase,
  CreditCard,
  ArrowUpDown,
  ExternalLink,
  Paperclip,
  Mic,
  AlertCircle,
  RefreshCw,
} from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_LIMIT = 20;

type FilterKey = "all" | TimelineCategoryParameter;

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "messages", label: "Messages" },
  { key: "calls", label: "Calls" },
  { key: "quotes", label: "Quotes" },
  { key: "jobs", label: "Jobs" },
  { key: "invoices_payments", label: "Invoices & payments" },
];

// ── Category meta ─────────────────────────────────────────────────────────────

function categoryIcon(category: TimelineEventCategory) {
  switch (category) {
    case "messages":
      return <MessageSquare className="w-4 h-4" />;
    case "calls":
      return <Phone className="w-4 h-4" />;
    case "quotes":
      return <FileText className="w-4 h-4" />;
    case "jobs":
      return <Briefcase className="w-4 h-4" />;
    case "invoices_payments":
      return <CreditCard className="w-4 h-4" />;
    default:
      return <FileText className="w-4 h-4" />;
  }
}

function categoryColour(category: TimelineEventCategory): string {
  switch (category) {
    case "messages":
      return "bg-primary/10 text-primary";
    case "calls":
    case "quotes":
    case "jobs":
    case "invoices_payments":
      return "bg-secondary text-foreground";
    default:
      return "bg-secondary text-muted-foreground";
  }
}

// ── Timestamp / date formatting ───────────────────────────────────────────────

/**
 * Format a `YYYY-MM-DD` date-only string as a UK calendar date (e.g. "12 Jun 2025").
 * Parsed directly from the string components to avoid any timezone conversion.
 */
function formatDateOnly(dateOnly: string): string {
  // dateOnly is "YYYY-MM-DD" — parse parts directly so no UTC-to-local shift occurs
  const [year, month, day] = dateOnly.split("-").map(Number);
  const d = new Date(year, month - 1, day); // local midnight, no shift
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Format a full ISO timestamp with a time component as a relative/short string.
 */
function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) {
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }
  if (diffDays === 1) {
    return `Yesterday, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  }
  if (diffDays < 7) {
    return d.toLocaleDateString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Format the display timestamp for an event row.
 * - dateOnly events: show the exact UK calendar date, no time component.
 * - All other events: relative/short timestamp.
 */
function eventTimestamp(event: TimelineEvent): string {
  if (event.dateOnly) {
    // occurredAt for dateOnly events is "YYYY-MM-DD" or an ISO with zeroed time
    // Always parse the date-only portion directly to avoid TZ shift
    const datePart = event.occurredAt.slice(0, 10); // "YYYY-MM-DD"
    return formatDateOnly(datePart);
  }
  return formatTimestamp(event.occurredAt);
}

// ── Day grouping ──────────────────────────────────────────────────────────────

/**
 * Compute a stable day key for grouping.
 * - dateOnly events: key is the bare "YYYY-MM-DD" string from occurredAt.
 * - Timestamped events: key is derived from local calendar date.
 */
function dayKey(event: TimelineEvent): string {
  if (event.dateOnly) {
    return event.occurredAt.slice(0, 10);
  }
  const d = new Date(event.occurredAt);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Format a day separator label.
 * - For "YYYY-MM-DD" keys (always used for dateOnly, also for timestamped): parse parts directly.
 */
function formatDayLabel(key: string): string {
  const [year, month, day] = key.split("-").map(Number);
  const d = new Date(year, month - 1, day); // local midnight — no TZ shift
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);

  if (d.getTime() === today.getTime()) return "Today";
  if (d.getTime() === yesterday.getTime()) return "Yesterday";
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function groupByDay(events: TimelineEvent[]): { key: string; events: TimelineEvent[] }[] {
  const groups: { key: string; events: TimelineEvent[] }[] = [];
  let lastKey = "";
  for (const ev of events) {
    const k = dayKey(ev);
    if (k !== lastKey) {
      groups.push({ key: k, events: [] });
      lastKey = k;
    }
    groups[groups.length - 1].events.push(ev);
  }
  return groups;
}

// ── Internal route detection ──────────────────────────────────────────────────

/**
 * Return true if href is an internal app route (starts with /).
 * External URLs (http/https) use a plain <a> with target="_blank".
 */
function isInternalHref(href: string): boolean {
  return href.startsWith("/") && !href.startsWith("//");
}

// ── Event row ─────────────────────────────────────────────────────────────────

function EventRow({ event }: { event: TimelineEvent }) {
  const timestamp = eventTimestamp(event);

  return (
    <div
      className="flex items-start gap-3 py-3.5 border-b border-border/50 last:border-0"
      data-testid={`timeline-event-${event.id}`}
    >
      {/* Category icon */}
      <div
        className={cn(
          "shrink-0 w-8 h-8 rounded-lg flex items-center justify-center mt-0.5",
          categoryColour(event.category)
        )}
        aria-hidden="true"
      >
        {categoryIcon(event.category)}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 mb-0.5">
          <span className="text-sm font-semibold text-foreground leading-snug">
            {event.title}
          </span>
          <span className="text-xs text-muted-foreground font-medium shrink-0 tabular-nums">
            {timestamp}
          </span>
        </div>

        {event.detail && (
          <p className="text-sm text-muted-foreground leading-relaxed mt-0.5">{event.detail}</p>
        )}

        {/* Badges and amounts row */}
        <div className="flex flex-wrap items-center gap-2 mt-1.5">
          {event.channel && (
            <span className="inline-flex items-center text-[11px] font-bold uppercase tracking-wider text-muted-foreground bg-secondary border border-border/40 rounded-md px-2 py-0.5">
              {event.channel}
            </span>
          )}
          {event.amount != null && (
            <span className="inline-flex items-center text-[11px] font-bold text-foreground bg-secondary border border-border/40 rounded-md px-2 py-0.5 tabular-nums">
              {formatCurrency(event.amount)}
            </span>
          )}
          {event.status && (
            <span className="inline-flex items-center text-[11px] font-bold uppercase tracking-wider text-muted-foreground bg-secondary border border-border/40 rounded-md px-2 py-0.5">
              {event.status.replace(/_/g, " ")}
            </span>
          )}
          {event.transcriptAvailable && (
            <span
              className="inline-flex items-center gap-1 text-[11px] font-bold text-muted-foreground"
              title="Transcript available on call record"
            >
              <Mic className="w-3 h-3" />
              Transcript
            </span>
          )}
          {event.attachment && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-muted-foreground">
              <Paperclip className="w-3 h-3" />
              {event.attachment.filename}
            </span>
          )}
        </div>
      </div>

      {/* Protected action link — wouter Link for internal routes, <a> for external */}
      {event.actionLabel && event.actionHref && (
        isInternalHref(event.actionHref) ? (
          <Link
            href={event.actionHref}
            className="shrink-0 flex items-center gap-1 text-xs font-bold text-primary hover:text-primary/80 transition-colors mt-1 whitespace-nowrap"
            data-testid={`timeline-action-${event.id}`}
          >
            {event.actionLabel}
            <ExternalLink className="w-3 h-3" />
          </Link>
        ) : (
          <a
            href={event.actionHref}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 flex items-center gap-1 text-xs font-bold text-primary hover:text-primary/80 transition-colors mt-1 whitespace-nowrap"
            data-testid={`timeline-action-${event.id}`}
          >
            {event.actionLabel}
            <ExternalLink className="w-3 h-3" />
          </a>
        )
      )}
    </div>
  );
}

// ── Day separator ─────────────────────────────────────────────────────────────

function DaySeparator({ dayKeyStr }: { dayKeyStr: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="h-px flex-1 bg-border/50" />
      <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70 shrink-0">
        {formatDayLabel(dayKeyStr)}
      </span>
      <div className="h-px flex-1 bg-border/50" />
    </div>
  );
}

// ── Skeleton loading ──────────────────────────────────────────────────────────

function TimelineSkeleton() {
  return (
    <div className="space-y-0" aria-label="Loading timeline">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-start gap-3 py-3.5 border-b border-border/50 last:border-0">
          <Skeleton className="w-8 h-8 rounded-lg shrink-0" />
          <div className="flex-1 space-y-2 min-w-0">
            <div className="flex justify-between gap-4">
              <Skeleton className="h-4 w-1/2 rounded" />
              <Skeleton className="h-3 w-16 rounded" />
            </div>
            <Skeleton className="h-3 w-3/4 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Enquiry timeline (uses enquiry hook) ──────────────────────────────────────

interface EnquiryTimelineProps {
  enquiryId: number;
  /** Compact layout for narrower columns (e.g. job detail) */
  compact?: boolean;
}

export function EnquiryTimeline({ enquiryId, compact = false }: EnquiryTimelineProps) {
  return <TimelinePanel kind="enquiry" entityId={enquiryId} compact={compact} />;
}

// ── Job timeline (uses job hook) ──────────────────────────────────────────────

interface JobTimelineProps {
  jobId: number;
  compact?: boolean;
}

export function JobTimeline({ jobId, compact = false }: JobTimelineProps) {
  return <TimelinePanel kind="job" entityId={jobId} compact={compact} />;
}

// ── Core panel ────────────────────────────────────────────────────────────────

interface TimelinePanelProps {
  kind: "enquiry" | "job";
  entityId: number;
  compact: boolean;
}

function TimelinePanel({ kind, entityId, compact }: TimelinePanelProps) {
  const [order, setOrder] = useState<TimelineOrderParameter>("newest");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [offset, setOffset] = useState(0);
  const [accumulatedEvents, setAccumulatedEvents] = useState<TimelineEvent[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const seenIds = useRef(new Set<string>());
  // Track the current (order, filter) combination so the data effect can tell
  // whether it belongs to the active query or a stale one.
  const activeComboRef = useRef(`${order}:${filter}`);

  // When order or filter changes: flush accumulated state and reset to page 0.
  // We do this synchronously in the state setters rather than a useEffect so
  // the new query fires in the same render cycle.
  const resetAccumulated = useCallback(() => {
    seenIds.current = new Set();
    setAccumulatedEvents([]);
    setOffset(0);
    setHasMore(false);
  }, []);

  const params = {
    limit: PAGE_LIMIT,
    offset,
    order,
    ...(filter !== "all" ? { category: filter as TimelineCategoryParameter } : {}),
  };

  // Enquiry hook — always called (disabled when kind !== enquiry)
  const enquiryQuery = useGetEnquiryTimeline(entityId, params, {
    query: {
      enabled: kind === "enquiry" && !!entityId,
      queryKey: getGetEnquiryTimelineQueryKey(entityId, params),
    },
  });

  // Job hook — always called (disabled when kind !== job)
  const jobQuery = useGetJobTimeline(entityId, params, {
    query: {
      enabled: kind === "job" && !!entityId,
      queryKey: getGetJobTimelineQueryKey(entityId, params),
    },
  });

  const query = kind === "enquiry" ? enquiryQuery : jobQuery;
  const data = query.data as TimelinePage | undefined;
  const isLoading = query.isLoading;
  const isFetching = query.isFetching;
  const isError = query.isError;
  const refetch = query.refetch;

  // Append new page events (de-duplicating by id).
  // Guard against stale responses by checking the combo ref.
  useEffect(() => {
    if (!data) return;
    const combo = `${order}:${filter}`;
    if (combo !== activeComboRef.current) return; // stale response — discard
    const newEvents = data.events.filter((e) => !seenIds.current.has(e.id));
    newEvents.forEach((e) => seenIds.current.add(e.id));
    setAccumulatedEvents((prev) => [...prev, ...newEvents]);
    setHasMore(data.hasMore);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const handleLoadMore = useCallback(() => {
    if (data?.nextOffset != null) {
      setOffset(data.nextOffset);
    }
  }, [data]);

  const handleFilterChange = useCallback((key: FilterKey) => {
    activeComboRef.current = `${order}:${key}`;
    resetAccumulated();
    setFilter(key);
  }, [order, resetAccumulated]);

  const handleOrderToggle = useCallback(() => {
    setOrder((prev) => {
      const next = prev === "newest" ? "oldest" : "newest";
      activeComboRef.current = `${next}:${filter}`;
      resetAccumulated();
      return next;
    });
  }, [filter, resetAccumulated]);

  const groups = groupByDay(accumulatedEvents);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        {/* Filter pills */}
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter timeline by category">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => handleFilterChange(key)}
              data-testid={`timeline-filter-${key}`}
              className={cn(
                "text-xs font-bold px-3 py-1.5 rounded-full border transition-colors",
                filter === key
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-background text-muted-foreground border-border/60 hover:border-primary/50 hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Sort toggle */}
        <button
          onClick={handleOrderToggle}
          data-testid="timeline-sort-toggle"
          className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors border border-border/60 rounded-full px-3 py-1.5 hover:border-primary/50 shrink-0"
          title={order === "newest" ? "Showing newest first — click to show oldest first" : "Showing oldest first — click to show newest first"}
        >
          <ArrowUpDown className="w-3 h-3" />
          {order === "newest" ? "Newest first" : "Oldest first"}
        </button>
      </div>

      {/* Events list */}
      <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
        {isLoading && accumulatedEvents.length === 0 ? (
          <div className="px-4 py-2">
            <TimelineSkeleton />
          </div>
        ) : isError && accumulatedEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 px-6 text-center gap-3">
            <AlertCircle className="w-8 h-8 text-muted-foreground" />
            <div>
              <p className="text-sm font-bold text-foreground">Could not load activity</p>
              <p className="text-xs text-muted-foreground mt-1">Check your connection and try again.</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="rounded-full font-bold gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </Button>
          </div>
        ) : accumulatedEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 px-6 text-center gap-2">
            <p className="text-sm font-bold text-muted-foreground">No activity recorded yet</p>
            <p className="text-xs text-muted-foreground">
              {filter !== "all"
                ? "Try selecting 'All' to see every event."
                : "Events will appear here as work progresses."}
            </p>
          </div>
        ) : (
          <div className="px-4">
            {groups.map(({ key, events }) => (
              <div key={key}>
                <DaySeparator dayKeyStr={key} />
                {events.map((ev) => (
                  <EventRow key={ev.id} event={ev} />
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Load more / loading next page */}
        {accumulatedEvents.length > 0 && (hasMore || (isFetching && offset > 0)) && (
          <div className="px-4 py-3 border-t border-border/50">
            {isFetching && offset > 0 ? (
              <div className="flex gap-3 py-1">
                <Skeleton className="w-8 h-8 rounded-lg shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/2 rounded" />
                  <Skeleton className="h-3 w-3/4 rounded" />
                </div>
              </div>
            ) : hasMore ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleLoadMore}
                disabled={isFetching}
                data-testid="timeline-load-more"
                className="w-full rounded-lg font-bold text-muted-foreground hover:text-foreground"
              >
                Load more
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
