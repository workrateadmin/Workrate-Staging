import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/memphis-bold/components/ui/card";
import { Skeleton } from "@workspace/memphis-bold/components/ui/skeleton";
import { Badge } from "@workspace/memphis-bold/components/ui/badge";
import {
  useGetHmrcSandboxGatewayStatus,
  getGetHmrcSandboxGatewayStatusQueryKey,
} from "@workspace/api-client-react";
import type { HmrcGatewayStatus } from "@workspace/api-client-react";
import {
  Activity,
  Server,
  Database,
  Building2,
  Clock,
  ShieldCheck,
  AlertTriangle,
  Globe,
  Wifi,
  WifiOff,
  ShieldAlert,
  ShieldX,
  Layers,
  Cpu,
  SquareCode,
  RadioTower,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";

// ── WorkRate system diagnostics ────────────────────────────────────────────

interface DiagnosticsData {
  environment: string;
  apiOrigin: string;
  clerkEnvironment: string;
  dbEnvironment: string;
  companyId: number | null;
  companyName: string | null;
  latestEnquiryAt: string | null;
}

function useDiagnostics() {
  return useQuery<DiagnosticsData>({
    queryKey: ["diagnostics"],
    queryFn: async () => {
      const res = await fetch("/api/diagnostics", { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return res.json();
    },
    staleTime: 30_000,
  });
}

type Row = {
  label: string;
  icon: React.ElementType;
  value: string | null | undefined;
  ok?: boolean;
  mono?: boolean;
};

// ── Gateway status helpers ─────────────────────────────────────────────────

function gatewayStatusVariant(
  status: HmrcGatewayStatus["gateway"],
): "default" | "outline" | "destructive" | "secondary" {
  return status === "connected" ? "default" : "destructive";
}

function fraudStatusVariant(
  status: HmrcGatewayStatus["fraudPrevention"],
): "default" | "outline" | "destructive" | "secondary" {
  if (status === "pass") return "default";
  if (status === "warning") return "secondary";
  return "destructive";
}

function hmrcConnectivityVariant(
  status: HmrcGatewayStatus["hmrcConnectivity"],
): "default" | "outline" | "destructive" | "secondary" {
  if (status === "connected") return "default";
  if (status === "unknown") return "outline";
  return "destructive";
}

function dynamicSubmissionVariant(
  status: HmrcGatewayStatus["dynamicSubmission"],
): "default" | "destructive" {
  return status === "available" ? "default" : "destructive";
}

// ── Row renderer ──────────────────────────────────────────────────────────

function DiagRow({ label, icon: Icon, value, ok, mono }: Row) {
  return (
    <div className="flex items-center justify-between px-6 py-3.5 gap-4 hover:bg-secondary/20 transition-colors">
      <div className="flex items-center gap-2.5 text-xs text-muted-foreground font-semibold uppercase tracking-wide min-w-[170px]">
        <Icon className="w-3.5 h-3.5 shrink-0" />
        {label}
      </div>
      <div className="flex items-center gap-2 min-w-0">
        {ok !== undefined && (
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${ok ? "bg-primary" : "bg-destructive"}`}
          />
        )}
        <span
          className={`text-sm font-medium text-foreground break-all text-right ${
            mono ? "font-mono text-xs" : ""
          }`}
        >
          {value ?? "—"}
        </span>
      </div>
    </div>
  );
}

// ── Gateway status section ─────────────────────────────────────────────────

function HmrcGatewaySection() {
  const { data, isLoading, error, refetch } = useGetHmrcSandboxGatewayStatus({
    query: { staleTime: 30_000, queryKey: getGetHmrcSandboxGatewayStatusQueryKey() },
  });

  return (
    <Card className="shadow-sm border-border/60 rounded-2xl overflow-hidden">
      <CardHeader className="bg-secondary/40 border-b border-border/60 px-6 py-5">
        <div className="flex items-center justify-between gap-4">
          <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
            <ShieldAlert className="w-4 h-4 text-primary" />
            HMRC / MTD Gateway Status
          </CardTitle>
          {data && (
            <Badge variant={gatewayStatusVariant(data.gateway)}>
              {data.gateway === "connected" ? "Gateway connected" : "Gateway unavailable"}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading && (
          <div className="divide-y divide-border/40">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between px-6 py-3.5 gap-4">
                <Skeleton className="h-3 w-36" />
                <Skeleton className="h-3 w-24" />
              </div>
            ))}
          </div>
        )}
        {error && (
          <div className="px-6 py-5 flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="text-sm font-bold text-destructive">Gateway status unavailable</p>
              <p className="text-xs text-muted-foreground mt-1">
                {error instanceof Error ? error.message : "Could not reach the gateway status endpoint."}
              </p>
              <button
                onClick={() => void refetch()}
                className="text-xs font-bold text-primary hover:underline mt-2"
              >
                Retry
              </button>
            </div>
          </div>
        )}
        {data && (
          <div className="divide-y divide-border/40">
            {/* Gateway */}
            <div className="flex items-center justify-between px-6 py-3.5 gap-4 hover:bg-secondary/20 transition-colors">
              <div className="flex items-center gap-2.5 text-xs text-muted-foreground font-semibold uppercase tracking-wide min-w-[170px]">
                <RadioTower className="w-3.5 h-3.5 shrink-0" />
                Gateway
              </div>
              <div className="flex items-center gap-2">
                {data.gateway === "connected"
                  ? <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" aria-hidden="true" />
                  : <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" aria-hidden="true" />}
                <span className="text-sm font-bold text-foreground capitalize">{data.gateway}</span>
              </div>
            </div>

            {/* Environment */}
            <div className="flex items-center justify-between px-6 py-3.5 gap-4 hover:bg-secondary/20 transition-colors">
              <div className="flex items-center gap-2.5 text-xs text-muted-foreground font-semibold uppercase tracking-wide min-w-[170px]">
                <Layers className="w-3.5 h-3.5 shrink-0" />
                Environment
              </div>
              <Badge variant="secondary" className="text-xs font-mono">
                {data.environment}
              </Badge>
            </div>

            {/* Public IP */}
            <div className="flex items-center justify-between px-6 py-3.5 gap-4 hover:bg-secondary/20 transition-colors">
              <div className="flex items-center gap-2.5 text-xs text-muted-foreground font-semibold uppercase tracking-wide min-w-[170px]">
                <Globe className="w-3.5 h-3.5 shrink-0" />
                Public IP
              </div>
              <span className="text-xs font-mono text-foreground font-medium">
                {data.publicIp ?? "—"}
              </span>
            </div>

            {/* Fraud prevention */}
            <div className="flex items-center justify-between px-6 py-3.5 gap-4 hover:bg-secondary/20 transition-colors">
              <div className="flex items-center gap-2.5 text-xs text-muted-foreground font-semibold uppercase tracking-wide min-w-[170px]">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                Fraud status
              </div>
              <Badge variant={fraudStatusVariant(data.fraudPrevention)} className="capitalize">
                {data.fraudPrevention}
              </Badge>
            </div>

            {/* Last validation */}
            <div className="flex items-center justify-between px-6 py-3.5 gap-4 hover:bg-secondary/20 transition-colors">
              <div className="flex items-center gap-2.5 text-xs text-muted-foreground font-semibold uppercase tracking-wide min-w-[170px]">
                <Clock className="w-3.5 h-3.5 shrink-0" />
                Last validation
              </div>
              <span className="text-sm font-medium text-foreground">
                {data.lastValidationAt
                  ? new Date(data.lastValidationAt).toLocaleString("en-GB", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })
                  : "Never"}
              </span>
            </div>

            {/* Missing headers */}
            <div className="flex items-center justify-between px-6 py-3.5 gap-4 hover:bg-secondary/20 transition-colors">
              <div className="flex items-center gap-2.5 text-xs text-muted-foreground font-semibold uppercase tracking-wide min-w-[170px]">
                <ShieldX className="w-3.5 h-3.5 shrink-0" />
                Missing headers
              </div>
              <span className="text-sm font-medium text-foreground">
                {data.missingHeaders.length === 0
                  ? <span className="text-primary font-bold">None</span>
                  : <span className="text-destructive font-bold font-mono text-xs">{data.missingHeaders.join(", ")}</span>}
              </span>
            </div>

            {/* HMRC connectivity */}
            <div className="flex items-center justify-between px-6 py-3.5 gap-4 hover:bg-secondary/20 transition-colors">
              <div className="flex items-center gap-2.5 text-xs text-muted-foreground font-semibold uppercase tracking-wide min-w-[170px]">
                {data.hmrcConnectivity === "connected"
                  ? <Wifi className="w-3.5 h-3.5 shrink-0" />
                  : <WifiOff className="w-3.5 h-3.5 shrink-0" />}
                HMRC connectivity
              </div>
              <Badge variant={hmrcConnectivityVariant(data.hmrcConnectivity)} className="capitalize">
                {data.hmrcConnectivity}
              </Badge>
            </div>

            {/* Dynamic submission */}
            <div className="flex items-center justify-between px-6 py-3.5 gap-4 hover:bg-secondary/20 transition-colors">
              <div className="flex items-center gap-2.5 text-xs text-muted-foreground font-semibold uppercase tracking-wide min-w-[170px]">
                <SquareCode className="w-3.5 h-3.5 shrink-0" />
                Dynamic submission
              </div>
              <Badge variant={dynamicSubmissionVariant(data.dynamicSubmission)} className="capitalize">
                {data.dynamicSubmission}
              </Badge>
            </div>

            {/* Version / Build */}
            {(data.version || data.buildId) && (
              <div className="flex items-center justify-between px-6 py-3.5 gap-4 hover:bg-secondary/20 transition-colors">
                <div className="flex items-center gap-2.5 text-xs text-muted-foreground font-semibold uppercase tracking-wide min-w-[170px]">
                  <Cpu className="w-3.5 h-3.5 shrink-0" />
                  Version / Build
                </div>
                <span className="text-xs font-mono text-foreground font-medium">
                  {[data.version, data.buildId].filter(Boolean).join(" / ")}
                </span>
              </div>
            )}

            {/* Gateway message (if any) */}
            {data.message && (
              <div className="px-6 py-3.5 flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
                <p className="text-xs text-muted-foreground font-medium">{data.message}</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function DiagnosticsPage() {
  const { data, isLoading, error } = useDiagnostics();

  // Omit widgetToken and raw user ID/key prefix from the displayed rows
  const rows: Row[] = data
    ? [
        {
          label: "API Environment",
          icon: Server,
          value: data.environment,
          ok: data.environment === "production",
        },
        {
          label: "API Origin",
          icon: Activity,
          value: data.apiOrigin,
          ok: data.apiOrigin?.includes("work-rate-manager"),
          mono: true,
        },
        {
          label: "Clerk Environment",
          icon: Server,
          value: data.clerkEnvironment,
          ok: data.clerkEnvironment === "production",
        },
        {
          label: "Database Environment",
          icon: Database,
          value: data.dbEnvironment,
          ok: data.dbEnvironment === "production",
        },
        {
          label: "Company ID",
          icon: Building2,
          value: data.companyId?.toString() ?? "—",
        },
        {
          label: "Company Name",
          icon: Building2,
          value: data.companyName ?? "—",
        },
        {
          label: "Latest Enquiry",
          icon: Clock,
          value: data.latestEnquiryAt
            ? new Date(data.latestEnquiryAt).toLocaleString("en-GB", {
                dateStyle: "medium",
                timeStyle: "short",
              })
            : "None yet",
        },
      ]
    : [];

  const allGreen =
    data?.environment === "production" &&
    data?.clerkEnvironment === "production" &&
    data?.dbEnvironment === "production" &&
    data?.apiOrigin?.includes("work-rate-manager");

  return (
    <div className="max-w-2xl mx-auto py-10 px-4 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight mb-1 text-foreground">
            System Diagnostics
          </h1>
          <p className="text-sm text-muted-foreground font-medium">
            Live environment status — no secrets exposed
          </p>
        </div>
        {data && (
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border ${
              allGreen
                ? "bg-primary/10 text-primary border-primary/30"
                : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/40 dark:bg-amber-950/20 dark:text-amber-400"
            }`}
          >
            {allGreen ? (
              <ShieldCheck className="w-3.5 h-3.5" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5" />
            )}
            {allGreen ? "All production" : "Attention needed"}
          </div>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
      )}

      {/* Error */}
      {error && (
        <Card className="border-destructive/40 bg-destructive/5 rounded-2xl">
          <CardContent className="p-4 text-sm text-destructive font-semibold">
            Failed to load:{" "}
            {error instanceof Error ? error.message : "Unknown error"}
          </CardContent>
        </Card>
      )}

      {/* System status table */}
      {data && (
        <Card className="shadow-sm border-border/60 rounded-2xl overflow-hidden">
          <CardHeader className="bg-secondary/40 border-b border-border/60 px-6 py-5">
            <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
              <Activity className="w-4 h-4 text-primary" />
              System Status
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 divide-y divide-border/40">
            {rows.map((row) => (
              <DiagRow key={row.label} {...row} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* HMRC / MTD Gateway Status */}
      <HmrcGatewaySection />

      {/* Footer note */}
      <p className="text-xs text-muted-foreground/60 font-medium text-center">
        WorkRateAppTesting shortcut is active in production. Enquiries created by it are
        flagged TEST and can be bulk-deleted via DELETE /api/enquiries/test-data.
      </p>
    </div>
  );
}
