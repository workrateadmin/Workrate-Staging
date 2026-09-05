/**
 * /quotes — Pipeline view of enquiries that have reached the quoting stage.
 *
 * Quotes in WorkRate are attached to enquiries (GET /api/enquiries/:id/quote).
 * There is no independent quote entity with a separate ID. This page lists
 * enquiries in quote-relevant statuses and links through to the enquiry detail
 * page where the full quote editor lives.
 */
import { useListEnquiries, getListEnquiriesQueryKey } from "@workspace/api-client-react";
import type { Enquiry } from "@workspace/api-client-react";
import { Link } from "wouter";
import { useState } from "react";
import { Card, CardContent } from "@workspace/memphis-bold/components/ui/card";
import { Skeleton } from "@workspace/memphis-bold/components/ui/skeleton";
import { Badge } from "@workspace/memphis-bold/components/ui/badge";
import { Input } from "@workspace/memphis-bold/components/ui/input";
import { Button } from "@workspace/memphis-bold/components/ui/button";
import { cn } from "@workspace/memphis-bold/lib/utils";
import { formatDate } from "@/lib/utils";
import {
  FileText, Search, ChevronRight, Clock, ExternalLink,
} from "lucide-react";

// Enquiry statuses that indicate a quote is relevant
const QUOTE_STATUSES = ["reviewing", "survey_required", "quote_sent", "won", "lost"];

const STATUS_LABEL: Record<string, string> = {
  reviewing:       "Reviewing",
  survey_required: "Survey Required",
  quote_sent:      "Quote Sent",
  won:             "Won",
  lost:            "Lost",
};

// Map enquiry status to Badge variant — only using defined variants
function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "won")       return "default";      // primary — positive outcome
  if (status === "quote_sent") return "secondary";   // neutral highlight
  if (status === "lost")      return "destructive";  // negative outcome
  return "outline";                                  // reviewing / survey_required
}

const FILTERS = [
  { value: "all",       label: "All" },
  { value: "active",    label: "In Progress" },
  { value: "sent",      label: "Quote Sent" },
  { value: "won",       label: "Won" },
  { value: "lost",      label: "Lost" },
];

export default function QuotesPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const { data: enquiries = [], isLoading } = useListEnquiries(
    undefined,
    { query: { queryKey: getListEnquiriesQueryKey() } },
  );

  const withQuotes = (enquiries as Enquiry[]).filter((e) =>
    QUOTE_STATUSES.includes(e.status)
  );

  const filtered = withQuotes.filter((e) => {
    const matchSearch =
      !search ||
      e.customerName.toLowerCase().includes(search.toLowerCase()) ||
      (e.projectType ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (e.location ?? "").toLowerCase().includes(search.toLowerCase());

    const matchFilter =
      filter === "all"    ? true :
      filter === "active" ? ["reviewing", "survey_required"].includes(e.status) :
      filter === "sent"   ? e.status === "quote_sent" :
      filter === "won"    ? e.status === "won" :
      filter === "lost"   ? e.status === "lost" : true;

    return matchSearch && matchFilter;
  });

  const counts = {
    total:  withQuotes.length,
    active: withQuotes.filter((e) => ["reviewing", "survey_required"].includes(e.status)).length,
    sent:   withQuotes.filter((e) => e.status === "quote_sent").length,
    won:    withQuotes.filter((e) => e.status === "won").length,
    lost:   withQuotes.filter((e) => e.status === "lost").length,
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-16 animate-in fade-in-0 duration-500">
      {/* Header */}
      <div className="border-b border-border pb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight mb-2">Quotes</h1>
          <p className="text-muted-foreground font-medium">
            Enquiries in the quoting pipeline. Open an enquiry to view or edit its quote.
          </p>
        </div>
        <Link href="/enquiries">
          <Button variant="outline" className="font-semibold gap-2 shrink-0">
            <ExternalLink className="w-4 h-4" />
            All Enquiries
          </Button>
        </Link>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "In Progress", count: counts.active },
          { label: "Quote Sent",  count: counts.sent   },
          { label: "Won",         count: counts.won    },
          { label: "Lost",        count: counts.lost   },
        ].map(({ label, count }) => (
          <Card key={label}>
            <CardContent className="p-4">
              <p className="text-2xl font-black">{count}</p>
              <p className="text-xs text-muted-foreground font-semibold mt-0.5">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by customer or project…"
            className="pl-9 field-input"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "px-4 py-2 rounded-full text-sm font-bold transition-all border",
                filter === f.value
                  ? "bg-foreground text-background border-foreground shadow-sm"
                  : "bg-card text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-xl bg-secondary/20">
          <FileText className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="font-bold text-foreground">No quotes found</p>
          <p className="text-sm text-muted-foreground mt-1">
            {search
              ? "Try a different search term."
              : "Quotes appear here once an enquiry moves to Reviewing or Quote Sent."}
          </p>
          {!search && (
            <Link href="/enquiries">
              <Button variant="outline" size="sm" className="mt-4 font-semibold">
                View Enquiries
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((enquiry) => (
            <QuoteRow key={enquiry.id} enquiry={enquiry} />
          ))}
        </div>
      )}
    </div>
  );
}

function QuoteRow({ enquiry }: { enquiry: Enquiry }) {
  return (
    <Card className="transition-all hover:shadow-md">
      <CardContent className="p-5 flex items-center gap-4 min-w-0">
        {/* Icon */}
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <FileText className="w-5 h-5 text-primary" />
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-bold text-foreground truncate">{enquiry.customerName}</span>
            <Badge variant={statusVariant(enquiry.status)}>
              {STATUS_LABEL[enquiry.status] ?? enquiry.status}
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
            {enquiry.projectType && (
              <span className="font-medium">{enquiry.projectType}</span>
            )}
            {enquiry.location && (
              <span>{enquiry.location}</span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDate(enquiry.createdAt)}
            </span>
          </div>
        </div>

        {/* Single clear action — opens enquiry detail where the quote editor lives */}
        <div className="shrink-0">
          <Link href={`/enquiries/${enquiry.id}`}>
            <Button size="sm" className="font-bold gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              View Quote
              <ChevronRight className="w-3 h-3" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
