import { useListJobs, useUpdateJob } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Briefcase,
  MapPin,
  Hammer,
  CalendarDays,
  ChevronRight,
  PoundSterling,
  ClipboardList,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

// ── Status config ─────────────────────────────────────────────────────────────
export const JOB_STATUSES = [
  "Survey Required",
  "Survey Booked",
  "Installation Scheduled",
  "In Progress",
  "Completed",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

const STATUS_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  "Survey Required":        { bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200" },
  "Survey Booked":          { bg: "bg-blue-50",    text: "text-blue-700",    border: "border-blue-200" },
  "Installation Scheduled": { bg: "bg-cyan-50",    text: "text-cyan-700",    border: "border-cyan-200" },
  "In Progress":            { bg: "bg-indigo-50",  text: "text-indigo-700",  border: "border-indigo-200" },
  "Completed":              { bg: "bg-green-50",   text: "text-green-700",   border: "border-green-200" },
};

export function JobStatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? { bg: "bg-gray-50", text: "text-gray-600", border: "border-gray-200" };
  return (
    <span className={cn("px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-widest border shadow-sm", s.bg, s.text, s.border)}>
      {status}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Jobs() {
  const { data: jobs, isLoading } = useListJobs();

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-5xl mx-auto">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  const activeJobs = jobs?.filter((j) => j.status !== "Completed") ?? [];
  const completedJobs = jobs?.filter((j) => j.status === "Completed") ?? [];

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in-0 duration-300">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground font-semibold">
            {jobs?.length ?? 0} total · {activeJobs.length} in progress
          </p>
        </div>
      </div>

      {(!jobs || jobs.length === 0) && (
        <div className="text-center py-20 bg-card rounded-2xl border border-border/60 shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Briefcase className="w-7 h-7 text-primary" />
          </div>
          <p className="text-xl font-black tracking-tight mb-2">No jobs yet</p>
          <p className="text-sm text-muted-foreground font-medium max-w-xs mx-auto">
            Convert an accepted quote into a job from the Leads page.
          </p>
          <Link href="/enquiries">
            <Button className="mt-6 font-bold rounded-xl hover-elevate">Go to Leads</Button>
          </Link>
        </div>
      )}

      {activeJobs.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground px-1">
            Active Jobs ({activeJobs.length})
          </h2>

          <div className="space-y-3">
            {activeJobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        </section>
      )}

      {completedJobs.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground px-1">
            Completed Jobs ({completedJobs.length})
          </h2>
          <div className="space-y-3 opacity-70">
            {completedJobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ── Job card ──────────────────────────────────────────────────────────────────
function JobCard({ job }: { job: any }) {
  return (
    <Link href={`/jobs/${job.id}`}>
      <div className="bg-card border border-border/60 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-primary/20 transition-all cursor-pointer group">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <h3 className="font-black text-lg tracking-tight text-foreground truncate">
                {job.customerName}
              </h3>
              <JobStatusBadge status={job.status} />
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-semibold text-muted-foreground">
              {job.projectType && (
                <span className="flex items-center gap-1.5">
                  <Hammer className="w-3.5 h-3.5" />
                  {job.projectType}
                </span>
              )}
              {job.location && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" />
                  {job.location}
                </span>
              )}
              {job.installDate && (
                <span className="flex items-center gap-1.5">
                  <CalendarDays className="w-3.5 h-3.5" />
                  Install: {job.installDate}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <div className="text-right">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-0.5">Value</p>
              <p className="text-lg font-black text-primary">{formatCurrency(job.totalWithVat)}</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
        </div>

        {/* Ref */}
        <div className="mt-3 pt-3 border-t border-border/40 flex items-center gap-4 text-xs text-muted-foreground font-semibold">
          <span className="flex items-center gap-1"><ClipboardList className="w-3.5 h-3.5" /> Job #{job.id}</span>
          <span>Created {formatDate(job.createdAt)}</span>
          {job.assignedTeam && <span className="flex items-center gap-1">👷 {job.assignedTeam}</span>}
        </div>
      </div>
    </Link>
  );
}
