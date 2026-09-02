/**
 * Shared primitives for /settings/integrations/* detail pages.
 * No design-system imports — uses the same local UI kit as the rest of the app.
 */
import { Link } from "wouter";
import { ChevronLeft, CheckCircle2, AlertCircle, Circle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Back header ───────────────────────────────────────────────────────────────

export function IntegrationPageHeader({
  name,
  icon,
}: {
  name: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 mb-8">
      <Link
        href="/integrations"
        className="inline-flex items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        Integrations
      </Link>
      <span className="text-muted-foreground/40 font-light select-none">/</span>
      <div className="flex items-center gap-2">
        {icon}
        <span className="font-black text-foreground text-sm">{name}</span>
      </div>
    </div>
  );
}

// ── Status header strip ───────────────────────────────────────────────────────

export type ConnectionStatus = "connected" | "error" | "not_connected" | "disconnected" | "loading";

export function StatusHeader({
  status,
  label,
  message,
}: {
  status: ConnectionStatus;
  label?: string;
  message?: string | null;
}) {
  const config = {
    connected: {
      bg: "bg-emerald-50 border-emerald-200",
      icon: <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />,
      text: "text-emerald-800",
      badge: "Connected",
      badgeCls: "bg-emerald-100 text-emerald-700 border-emerald-200",
    },
    error: {
      bg: "bg-red-50 border-red-200",
      icon: <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />,
      text: "text-red-800",
      badge: "Error",
      badgeCls: "bg-red-100 text-red-700 border-red-200",
    },
    disconnected: {
      bg: "bg-secondary/60 border-border",
      icon: <Circle className="w-4 h-4 text-muted-foreground shrink-0" />,
      text: "text-muted-foreground",
      badge: "Disconnected",
      badgeCls: "bg-secondary text-muted-foreground border-border",
    },
    not_connected: {
      bg: "bg-secondary/60 border-border",
      icon: <Circle className="w-4 h-4 text-muted-foreground shrink-0" />,
      text: "text-muted-foreground",
      badge: "Not connected",
      badgeCls: "bg-secondary text-muted-foreground border-border",
    },
    loading: {
      bg: "bg-secondary/60 border-border",
      icon: <Loader2 className="w-4 h-4 text-muted-foreground shrink-0 animate-spin" />,
      text: "text-muted-foreground",
      badge: "Loading…",
      badgeCls: "bg-secondary text-muted-foreground border-border",
    },
  }[status];

  return (
    <div className={cn("flex items-start gap-3 rounded-xl border px-4 py-3 mb-6", config.bg)}>
      {config.icon}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn("text-xs font-bold uppercase tracking-widest border px-2 py-0.5 rounded-full", config.badgeCls)}>
            {label ?? config.badge}
          </span>
          {message && (
            <span className={cn("text-xs font-medium", config.text)}>{message}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Section card shell ────────────────────────────────────────────────────────

export function PageSection({
  title,
  description,
  children,
  className,
}: {
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("bg-card border border-border/60 rounded-2xl overflow-hidden shadow-sm", className)}>
      {(title || description) && (
        <div className="px-6 py-4 border-b border-border/60 bg-secondary/30">
          {title && <h2 className="font-bold text-base">{title}</h2>}
          {description && <p className="text-xs text-muted-foreground font-medium mt-0.5">{description}</p>}
        </div>
      )}
      <div className="p-6">{children}</div>
    </div>
  );
}

// ── Coming-soon placeholder ───────────────────────────────────────────────────

export function ComingSoonSection({ name, description }: { name: string; description?: string }) {
  return (
    <PageSection title="Integration status">
      <div className="flex items-start gap-4 py-2">
        <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center shrink-0">
          <Circle className="w-5 h-5 text-muted-foreground" />
        </div>
        <div>
          <p className="font-bold text-foreground">{name} — Coming soon</p>
          <p className="text-sm text-muted-foreground font-medium mt-1 leading-relaxed max-w-lg">
            {description ??
              `The ${name} integration is being built. When it's ready you'll be able to connect and manage it from this page. No action is needed now.`}
          </p>
          <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold bg-secondary text-muted-foreground border border-border px-3 py-1.5 rounded-full select-none">
            In development
          </div>
        </div>
      </div>
    </PageSection>
  );
}

// ── Field row ─────────────────────────────────────────────────────────────────

export function FieldRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-bold">{label}</label>
      {description && <p className="text-xs text-muted-foreground font-medium">{description}</p>}
      {children}
    </div>
  );
}
