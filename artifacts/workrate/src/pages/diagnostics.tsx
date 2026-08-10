import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Activity,
  Server,
  Database,
  Key,
  User,
  Building2,
  Zap,
  Clock,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";

interface DiagnosticsData {
  environment: string;
  apiOrigin: string;
  clerkEnvironment: string;
  clerkPublishableKeyPrefix: string;
  dbEnvironment: string;
  userId: string;
  companyId: number | null;
  companyName: string | null;
  widgetToken: string | null;
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

export default function DiagnosticsPage() {
  const { data, isLoading, error } = useDiagnostics();

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
          icon: Key,
          value: data.clerkEnvironment,
          ok: data.clerkEnvironment === "production",
        },
        {
          label: "Clerk Key Prefix",
          icon: Key,
          value: data.clerkPublishableKeyPrefix,
          ok: data.clerkPublishableKeyPrefix?.startsWith("pk_live_"),
          mono: true,
        },
        {
          label: "Database Environment",
          icon: Database,
          value: data.dbEnvironment,
          ok: data.dbEnvironment === "production",
        },
        {
          label: "Logged-in User ID",
          icon: User,
          value: data.userId,
          mono: true,
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
          label: "Widget Token",
          icon: Zap,
          value: data.widgetToken ?? "—",
          mono: true,
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
    <div className="max-w-2xl mx-auto py-10 px-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black tracking-tight mb-1 text-foreground">
            Production Diagnostics
          </h1>
          <p className="text-sm text-muted-foreground font-medium">
            Live environment status · no secrets exposed
          </p>
        </div>
        {data && (
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border ${
              allGreen
                ? "bg-green-50 text-green-700 border-green-200"
                : "bg-orange-50 text-orange-700 border-orange-200"
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
        <div className="text-sm text-muted-foreground animate-pulse font-medium">
          Loading diagnostics…
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

      {/* Data table */}
      {data && (
        <Card className="shadow-sm border-border/60 rounded-2xl overflow-hidden">
          <CardHeader className="bg-secondary/40 border-b border-border/60 px-6 py-5">
            <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
              <Activity className="w-4 h-4 text-primary" />
              System Status
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 divide-y divide-border/40">
            {rows.map(({ label, icon: Icon, value, ok, mono }) => (
              <div
                key={label}
                className="flex items-center justify-between px-6 py-3.5 gap-4 hover:bg-secondary/20 transition-colors"
              >
                <div className="flex items-center gap-2.5 text-xs text-muted-foreground font-semibold uppercase tracking-wide min-w-[170px]">
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  {label}
                </div>
                <div className="flex items-center gap-2 min-w-0">
                  {ok !== undefined && (
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        ok ? "bg-green-500" : "bg-orange-400"
                      }`}
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
            ))}
          </CardContent>
        </Card>
      )}

      {/* Footer note */}
      <p className="mt-6 text-xs text-muted-foreground/60 font-medium text-center">
        WorkRateAppTesting shortcut is active in production. Enquiries created by it are
        flagged TEST and can be bulk-deleted via DELETE /api/enquiries/test-data.
      </p>
    </div>
  );
}
