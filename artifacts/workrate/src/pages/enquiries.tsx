import { useListEnquiries, useUpdateEnquiry, useDeleteEnquiry } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "wouter";
import { useState } from "react";
import { formatDate } from "@/lib/utils";
import { StatusBadge, getStatusColorBarClass } from "./dashboard";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MapPin,
  Hammer,
  Search,
  LayoutList,
  Kanban,
  AlertCircle,
  Calendar,
  PoundSterling,
  Phone,
  Mail,
  ImageIcon,
  ChevronRight,
  ArrowRight,
  Trash2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ── Status configuration ──────────────────────────────────────────────────────
const PIPELINE_COLUMNS = [
  { status: "new_enquiry",     label: "New Enquiry",     color: "bg-teal-500",   light: "bg-teal-50 border-teal-200",   text: "text-teal-700",   dot: "bg-teal-500" },
  { status: "reviewing",       label: "Reviewing",       color: "bg-amber-500",  light: "bg-amber-50 border-amber-200", text: "text-amber-700",  dot: "bg-amber-500" },
  { status: "survey_required", label: "Survey Required", color: "bg-orange-500", light: "bg-orange-50 border-orange-200", text: "text-orange-700", dot: "bg-orange-500" },
  { status: "quote_sent",      label: "Quote Sent",      color: "bg-violet-500", light: "bg-violet-50 border-violet-200", text: "text-violet-700", dot: "bg-violet-500" },
  { status: "won",             label: "Won",             color: "bg-emerald-500",light: "bg-emerald-50 border-emerald-200", text: "text-emerald-700", dot: "bg-emerald-500" },
  { status: "lost",            label: "Lost",            color: "bg-red-400",    light: "bg-red-50 border-red-200",     text: "text-red-700",    dot: "bg-red-400" },
] as const;

type PipelineStatus = typeof PIPELINE_COLUMNS[number]["status"];

const STATUS_FILTERS = [
  { value: "all",              label: "All" },
  { value: "new_enquiry",      label: "New" },
  { value: "reviewing",        label: "Reviewing" },
  { value: "survey_required",  label: "Survey" },
  { value: "quote_sent",       label: "Quote Sent" },
  { value: "won",              label: "Won" },
  { value: "lost",             label: "Lost" },
];

// ── Main component ────────────────────────────────────────────────────────────
export default function Leads() {
  const [view, setView] = useState<"pipeline" | "list">("pipeline");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data: enquiries, isLoading } = useListEnquiries(
    view === "list" && statusFilter !== "all" ? { status: statusFilter } : undefined
  );

  const filtered = enquiries?.filter((e) =>
    !search ||
    e.customerName.toLowerCase().includes(search.toLowerCase()) ||
    e.projectType?.toLowerCase().includes(search.toLowerCase()) ||
    e.location?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5 animate-in fade-in-0 duration-300">
      {/* Toolbar */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-border/60 pb-5">
        <div className="relative w-full xl:w-96">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search leads, customers, projects…"
            className="pl-10 h-11 bg-card border-border/60 rounded-full font-medium shadow-sm focus-visible:ring-primary/30"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar scroll-smooth">
          {view === "list" && STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all ${
                statusFilter === f.value
                  ? "bg-foreground text-background shadow-md"
                  : "bg-secondary/80 text-foreground/70 hover:bg-secondary border border-border/40"
              }`}
            >
              {f.label}
            </button>
          ))}

          <div className={cn("flex bg-secondary/80 p-1 rounded-full border border-border/40 ml-auto shrink-0", view === "list" && "sm:ml-2")}>
            <button
              onClick={() => setView("pipeline")}
              title="Pipeline view"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                view === "pipeline" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Kanban className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Pipeline</span>
            </button>
            <button
              onClick={() => setView("list")}
              title="List view"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                view === "list" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LayoutList className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">List</span>
            </button>
          </div>
        </div>
      </div>

      {/* Views */}
      {view === "pipeline" ? (
        <PipelineView enquiries={filtered} isLoading={isLoading} />
      ) : (
        <ListView enquiries={filtered} isLoading={isLoading} />
      )}
    </div>
  );
}

// ── Pipeline / Kanban view ────────────────────────────────────────────────────
function PipelineView({
  enquiries,
  isLoading,
}: {
  enquiries: any[] | undefined;
  isLoading: boolean;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const updateEnquiry = useUpdateEnquiry({
    mutation: {
      onSuccess: () => {
        toast({ title: "Lead moved" });
        queryClient.invalidateQueries({ queryKey: ["/api/enquiries"] });
      },
      onError: () => {
        toast({ title: "Failed to update status", variant: "destructive" });
      },
    },
  });

  const deleteEnquiry = useDeleteEnquiry({
    mutation: {
      onSuccess: () => {
        toast({ title: "Enquiry deleted" });
        queryClient.invalidateQueries({ queryKey: ["/api/enquiries"] });
      },
      onError: () => {
        toast({ title: "Failed to delete enquiry", variant: "destructive" });
      },
    },
  });

  const grouped = PIPELINE_COLUMNS.reduce(
    (acc, col) => {
      acc[col.status] = (enquiries ?? []).filter((e) => e.status === col.status);
      return acc;
    },
    {} as Record<PipelineStatus, any[]>
  );

  const totalActive = (enquiries ?? []).filter(
    (e) => e.status !== "lost" && e.status !== "won"
  ).length;

  return (
    <div>
      {/* Pipeline stats strip */}
      <div className="flex items-center gap-6 mb-4 px-1">
        <p className="text-sm font-semibold text-muted-foreground">
          <span className="text-foreground font-bold">{totalActive}</span> active{" "}
          {totalActive === 1 ? "lead" : "leads"} in pipeline
        </p>
        <div className="flex gap-1.5">
          {PIPELINE_COLUMNS.filter((c) => c.status !== "lost").map((col) => {
            const count = grouped[col.status]?.length ?? 0;
            return count > 0 ? (
              <span
                key={col.status}
                className={`text-xs font-bold px-2 py-0.5 rounded-full border ${col.light} ${col.text}`}
              >
                {count} {col.label}
              </span>
            ) : null;
          })}
        </div>
      </div>

      {/* Kanban board */}
      <div className="overflow-x-auto pb-6 -mx-4 px-4 sm:-mx-6 sm:px-6 md:-mx-8 md:px-8">
        <div className="flex gap-3 min-w-max">
          {PIPELINE_COLUMNS.map((col) => {
            const cards = grouped[col.status] ?? [];
            return (
              <div key={col.status} className="w-[280px] shrink-0 flex flex-col">
                {/* Column header */}
                <div className={`flex items-center justify-between px-3 py-2.5 rounded-t-xl border-b-2 mb-0 ${col.light} border-current`}>
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${col.dot}`} />
                    <span className={`text-xs font-bold uppercase tracking-widest ${col.text}`}>
                      {col.label}
                    </span>
                  </div>
                  <span className={`text-xs font-black px-2 py-0.5 rounded-full ${col.light} ${col.text} border ${col.light}`}>
                    {cards.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="flex flex-col gap-2 pt-2 min-h-[120px]">
                  {isLoading ? (
                    <>
                      <Skeleton className="h-32 rounded-xl" />
                      <Skeleton className="h-24 rounded-xl" />
                    </>
                  ) : cards.length === 0 ? (
                    <div className="flex-1 border-2 border-dashed border-border/40 rounded-xl flex items-center justify-center py-8">
                      <p className="text-xs font-semibold text-muted-foreground/60">No leads</p>
                    </div>
                  ) : (
                    cards.map((enq) => (
                      <PipelineCard
                        key={enq.id}
                        enquiry={enq}
                        columns={PIPELINE_COLUMNS}
                        onMove={(toStatus) =>
                          updateEnquiry.mutate({ id: enq.id, data: { status: toStatus } })
                        }
                        isPending={updateEnquiry.isPending}
                        onDelete={() => deleteEnquiry.mutate({ id: enq.id })}
                        isDeleting={deleteEnquiry.isPending}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Pipeline card ─────────────────────────────────────────────────────────────
function PipelineCard({
  enquiry: enq,
  columns,
  onMove,
  isPending,
  onDelete,
  isDeleting,
}: {
  enquiry: any;
  columns: typeof PIPELINE_COLUMNS;
  onMove: (status: string) => void;
  isPending: boolean;
  onDelete?: () => void;
  isDeleting?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const photoCount = enq.attachmentCount ?? 0;

  const col = columns.find((c) => c.status === enq.status);
  const nextColumns = columns.filter((c) => c.status !== enq.status);

  return (
    <div className="relative group">
      <Link href={`/enquiries/${enq.id}`}>
        <Card className="border-border/60 shadow-sm hover:shadow-md transition-all cursor-pointer bg-card rounded-xl overflow-hidden group-hover:border-primary/30">
          {/* Status stripe */}
          <div className={`h-1 w-full ${col?.color ?? "bg-gray-300"}`} />
          <CardContent className="p-4 space-y-3">
            {/* Name + date */}
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-bold text-sm leading-tight text-foreground line-clamp-1">
                {enq.customerName}
              </h3>
              <span className="text-[10px] text-muted-foreground font-semibold whitespace-nowrap shrink-0 pt-0.5">
                {formatDate(enq.createdAt)}
              </span>
            </div>

            {/* Project type */}
            {enq.projectType && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-semibold">
                <Hammer className="w-3 h-3 shrink-0" />
                <span className="truncate">{enq.projectType}</span>
              </div>
            )}

            {/* Location */}
            {enq.location && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                <MapPin className="w-3 h-3 shrink-0" />
                <span className="truncate">{enq.location}</span>
              </div>
            )}

            {/* Budget + photos */}
            <div className="flex items-center justify-between pt-1 border-t border-border/40">
              {enq.budget ? (
                <div className="flex items-center gap-1 text-xs font-bold text-foreground">
                  <PoundSterling className="w-3 h-3" />
                  {enq.budget}
                </div>
              ) : (
                <span className="text-[10px] text-muted-foreground/60 font-medium">No budget</span>
              )}
              <div className="flex items-center gap-2">
                {photoCount > 0 && (
                  <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground font-semibold">
                    <ImageIcon className="w-3 h-3" />
                    {photoCount}
                  </span>
                )}
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors" />
              </div>
            </div>

            {/* Contact mini-row */}
            {(enq.customerEmail || enq.customerPhone) && (
              <div className="flex items-center gap-3 pt-1 border-t border-border/40">
                {enq.customerEmail && (
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium truncate">
                    <Mail className="w-2.5 h-2.5 shrink-0" />
                    <span className="truncate">{enq.customerEmail}</span>
                  </span>
                )}
                {enq.customerPhone && (
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium shrink-0">
                    <Phone className="w-2.5 h-2.5" />
                    {enq.customerPhone}
                  </span>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </Link>

      {/* Quick-move button */}
      <div className="absolute top-2.5 right-2.5 z-10">
        <div className="relative">
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            disabled={isPending}
            className="opacity-0 group-hover:opacity-100 transition-opacity bg-background border border-border/60 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground hover:text-foreground hover:border-primary/40 shadow-sm"
            title="Move to stage"
          >
            Move
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => { setMenuOpen(false); setConfirmDelete(false); }} />
              <div className="absolute top-full right-0 mt-1 z-30 bg-card border border-border/60 rounded-xl shadow-xl py-1 w-48 overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-3 py-2 border-b border-border/40">
                  Move to
                </p>
                {nextColumns.map((c) => (
                  <button
                    key={c.status}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onMove(c.status);
                      setMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm font-semibold hover:bg-secondary transition-colors text-left"
                  >
                    <div className={`w-2 h-2 rounded-full ${c.dot} shrink-0`} />
                    {c.label}
                    <ArrowRight className="w-3 h-3 ml-auto text-muted-foreground/50" />
                  </button>
                ))}
                {onDelete && (
                  <>
                    <div className="border-t border-border/40 my-1" />
                    {confirmDelete ? (
                      <div className="px-3 py-2">
                        <p className="text-xs font-bold text-destructive mb-2">Delete this lead?</p>
                        <div className="flex gap-2">
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onDelete();
                              setMenuOpen(false);
                              setConfirmDelete(false);
                            }}
                            disabled={isDeleting}
                            className="flex-1 bg-destructive text-destructive-foreground text-xs font-bold py-1 rounded-md hover:bg-destructive/90 transition-colors"
                          >
                            Delete
                          </button>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setConfirmDelete(false);
                            }}
                            className="flex-1 bg-secondary text-xs font-bold py-1 rounded-md hover:bg-secondary/80 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setConfirmDelete(true);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm font-semibold text-destructive hover:bg-destructive/10 transition-colors text-left"
                      >
                        <Trash2 className="w-3.5 h-3.5 shrink-0" />
                        Delete
                      </button>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── List view ─────────────────────────────────────────────────────────────────
function ListView({
  enquiries,
  isLoading,
}: {
  enquiries: any[] | undefined;
  isLoading: boolean;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const deleteEnquiry = useDeleteEnquiry({
    mutation: {
      onSuccess: () => {
        toast({ title: "Enquiry deleted" });
        setConfirmDeleteId(null);
        queryClient.invalidateQueries({ queryKey: ["/api/enquiries"] });
      },
      onError: () => {
        toast({ title: "Failed to delete enquiry", variant: "destructive" });
      },
    },
  });

  return (
    <div className="grid gap-3">
      {isLoading ? (
        Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-2xl" />
        ))
      ) : !enquiries?.length ? (
        <div className="text-center py-24 bg-secondary/30 rounded-2xl border border-dashed border-border/60">
          <div className="w-16 h-16 bg-card rounded-full shadow-sm flex items-center justify-center mx-auto mb-4 border border-border/50">
            <AlertCircle className="w-8 h-8 text-muted-foreground/40" />
          </div>
          <p className="text-xl font-bold text-foreground tracking-tight">No leads found</p>
          <p className="text-sm mt-2 font-medium text-muted-foreground max-w-sm mx-auto">
            Try adjusting your search or switch to pipeline view to see everything at once.
          </p>
        </div>
      ) : (
        enquiries.map((enq) => {
          let photoCount = 0;
          try {
            if (enq.attachmentUrls) {
              const urls = JSON.parse(enq.attachmentUrls);
              photoCount = Array.isArray(urls) ? urls.length : 0;
            }
          } catch {}

          const isConfirming = confirmDeleteId === enq.id;

          return (
            <div key={enq.id} className="relative group">
              <Link href={`/enquiries/${enq.id}`}>
                <Card className="relative overflow-hidden hover-elevate cursor-pointer border-border/60 transition-all bg-card rounded-xl shadow-sm hover:shadow-md">
                  <div
                    className={`absolute left-0 top-0 bottom-0 w-[4px] transition-colors ${getStatusColorBarClass(enq.status)}`}
                  />
                  <CardContent className="p-5 pl-7 pr-14">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-3">
                      <div>
                        <h3 className="font-bold text-lg leading-tight text-foreground">{enq.customerName}</h3>
                        {(enq.customerEmail || enq.customerPhone) && (
                          <div className="flex items-center gap-4 mt-1">
                            {enq.customerEmail && (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground font-medium">
                                <Mail className="w-3 h-3" /> {enq.customerEmail}
                              </span>
                            )}
                            {enq.customerPhone && (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground font-medium">
                                <Phone className="w-3 h-3" /> {enq.customerPhone}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-sm text-muted-foreground font-semibold hidden sm:block">
                          {formatDate(enq.createdAt)}
                        </span>
                        <StatusBadge status={enq.status} />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-semibold text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Hammer className="w-3.5 h-3.5" />
                        <span className="text-foreground/80">{enq.projectType || "General Enquiry"}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5" />
                        <span className="text-foreground/80">{enq.location || "No location"}</span>
                      </div>
                      {enq.budget && (
                        <div className="flex items-center gap-1.5">
                          <PoundSterling className="w-3.5 h-3.5" />
                          <span className="text-foreground/80">{enq.budget}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        <span className="text-foreground/80 sm:hidden">{formatDate(enq.createdAt)}</span>
                      </div>
                      {photoCount > 0 && (
                        <div className="flex items-center gap-1.5">
                          <ImageIcon className="w-3.5 h-3.5" />
                          <span className="text-foreground/80">{photoCount} photo{photoCount > 1 ? "s" : ""}</span>
                        </div>
                      )}
                    </div>

                    {enq.description && (
                      <p className="text-sm text-muted-foreground line-clamp-1 border-t border-border/40 pt-3 mt-3 font-medium">
                        {enq.description}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </Link>

              {/* Delete button */}
              <div className="absolute top-3 right-3 z-10">
                {isConfirming ? (
                  <div className="flex items-center gap-1 bg-card border border-destructive/40 rounded-lg shadow-md px-2 py-1.5 animate-in fade-in-0 zoom-in-95 duration-150">
                    <span className="text-xs font-bold text-destructive whitespace-nowrap">Delete?</span>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        deleteEnquiry.mutate({ id: enq.id });
                      }}
                      disabled={deleteEnquiry.isPending}
                      className="text-xs font-bold bg-destructive text-destructive-foreground px-2 py-0.5 rounded-md hover:bg-destructive/90 transition-colors"
                    >
                      Yes
                    </button>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setConfirmDeleteId(null);
                      }}
                      className="text-xs font-bold text-muted-foreground hover:text-foreground px-1 transition-colors"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setConfirmDeleteId(enq.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity bg-background border border-border/60 rounded-md p-1.5 text-muted-foreground hover:text-destructive hover:border-destructive/40 shadow-sm"
                    title="Delete enquiry"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
