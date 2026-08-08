import type { StructuredSummary } from "@/types/summary";
import { Sparkles, User, Hammer, MapPin, PoundSterling, FileText, Ruler, Package, ListChecks, AlertTriangle, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface SummaryCardProps {
  aiSummary: string;
  className?: string;
}

const SECTIONS = [
  { key: "measurements",          label: "Measurements",          icon: Ruler,          color: "text-teal-600",    bg: "bg-teal-50",    border: "border-teal-100" },
  { key: "materials",             label: "Materials",             icon: Package,         color: "text-violet-600",  bg: "bg-violet-50",  border: "border-violet-100" },
  { key: "customerRequirements",  label: "Customer Requirements", icon: ListChecks,      color: "text-amber-600",   bg: "bg-amber-50",   border: "border-amber-100" },
  { key: "potentialChallenges",   label: "Potential Challenges",  icon: AlertTriangle,   color: "text-red-600",     bg: "bg-red-50",     border: "border-red-100" },
  { key: "recommendedNextAction", label: "Recommended Next Action", icon: ArrowRight,    color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-100" },
] as const;

export function parseSummary(raw: string): StructuredSummary | null {
  try {
    return JSON.parse(raw) as StructuredSummary;
  } catch {
    return null;
  }
}

export function SummaryCard({ aiSummary, className }: SummaryCardProps) {
  const s = parseSummary(aiSummary);

  if (!s) {
    // Fallback: render as plain text
    return (
      <div className={cn("bg-primary/5 border border-primary/20 rounded-xl p-6", className)}>
        <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap text-foreground">{aiSummary}</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-5", className)}>
      {/* Header fields: Customer / Project / Location / Budget */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { icon: User,          label: "Customer", value: s.customer },
          { icon: Hammer,        label: "Project",  value: s.project },
          { icon: MapPin,        label: "Location", value: s.location },
          { icon: PoundSterling, label: "Budget",   value: s.budget },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="bg-secondary/50 rounded-xl p-4 border border-border/40 space-y-1">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              <Icon className="w-3 h-3" />
              {label}
            </div>
            <p className="text-sm font-semibold text-foreground leading-snug">{value || "—"}</p>
          </div>
        ))}
      </div>

      {/* Summary prose */}
      {s.summary && (
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-5 space-y-2">
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-primary uppercase tracking-widest">
            <FileText className="w-3 h-3" />
            Summary
          </div>
          <p className="text-sm font-medium text-foreground leading-relaxed">{s.summary}</p>
        </div>
      )}

      {/* Detail sections */}
      <div className="grid gap-3">
        {SECTIONS.map(({ key, label, icon: Icon, color, bg, border }) => {
          const value = s[key];
          if (!value || value === "Not specified") return null;
          return (
            <div key={key} className={cn("rounded-xl p-4 border space-y-1.5", bg, border)}>
              <div className={cn("flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest", color)}>
                <Icon className="w-3 h-3" />
                {label}
              </div>
              <p className="text-sm font-medium text-foreground leading-relaxed">{value}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SummaryCardSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="grid grid-cols-2 gap-3">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-16 rounded-xl bg-secondary/60" />)}
      </div>
      <div className="h-20 rounded-xl bg-secondary/60" />
      <div className="h-12 rounded-xl bg-secondary/60" />
      <div className="h-12 rounded-xl bg-secondary/60" />
    </div>
  );
}

export function SummarySparkles() {
  return (
    <div className="flex items-center gap-1.5">
      <Sparkles className="w-4 h-4 text-primary" />
      <span>AI Job Summary</span>
    </div>
  );
}
