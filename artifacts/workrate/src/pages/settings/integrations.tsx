/**
 * /settings/integrations — Communications & Integrations overview.
 * All UI primitives from @workspace/memphis-bold; no hardcoded palette classes.
 */
import { useEffect, useState } from "react";
import {
  useListIntegrations,
  useGetAiReceptionistSettings,
  useGetVapiSettings,
  getListIntegrationsQueryKey,
  type IntegrationStatus,
} from "@workspace/api-client-react";
import { Link } from "wouter";
import { cn } from "@workspace/memphis-bold/lib/utils";
import {
  CheckCircle2, Circle, AlertCircle, Lock, ChevronRight, Plug,
} from "lucide-react";
import { Card, CardContent } from "@workspace/memphis-bold/components/ui/card";
import { Button } from "@workspace/memphis-bold/components/ui/button";
import { Badge } from "@workspace/memphis-bold/components/ui/badge";
import { Skeleton } from "@workspace/memphis-bold/components/ui/skeleton";
import { SettingsBreadcrumb } from "@/components/settings-breadcrumb";

const PROVIDER_META: Record<string, {
  abbr: string;
  settingsPath: string | null;
  comingSoon: boolean;
}> = {
  facebook_messenger: { abbr: "FB",  settingsPath: "/settings/integrations/facebook",       comingSoon: true  },
  instagram:          { abbr: "IG",  settingsPath: "/settings/integrations/instagram",      comingSoon: true  },
  whatsapp_business:  { abbr: "WA",  settingsPath: "/settings/integrations/whatsapp",       comingSoon: true  },
  email:              { abbr: "@",   settingsPath: "/settings/integrations/email",           comingSoon: true  },
  xero:               { abbr: "XR",  settingsPath: "/settings/integrations/xero",           comingSoon: true  },
  quickbooks:         { abbr: "QB",  settingsPath: "/settings/integrations/quickbooks",     comingSoon: true  },
  stripe:             { abbr: "ST",  settingsPath: "/settings/integrations/stripe",         comingSoon: false },
  website_widget:     { abbr: "W",   settingsPath: "/settings/integrations/website-widget", comingSoon: false },
  phone_ai:           { abbr: "PH",  settingsPath: "/settings/integrations/phone",          comingSoon: false },
  hmrc:               { abbr: "HM",  settingsPath: "/settings/integrations/hmrc",           comingSoon: false },
};

const CATEGORY_LABELS: Record<string, string> = {
  messaging:  "Messaging",
  email:      "Email",
  accounting: "Accounting & Finance",
  payments:   "Payments",
  website:    "Website",
  phone:      "Phone",
};

function IntegrationStatusBadge({ status, comingSoon }: { status: string; comingSoon: boolean }) {
  if (comingSoon) {
    return (
      <Badge variant="outline" className="gap-1 text-muted-foreground">
        <Lock className="w-3 h-3" /> Coming soon
      </Badge>
    );
  }
  if (status === "connected") {
    return (
      <Badge variant="secondary" className="gap-1">
        <CheckCircle2 className="w-3 h-3" /> Connected
      </Badge>
    );
  }
  if (status === "error") {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertCircle className="w-3 h-3" /> Error
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <Circle className="w-3 h-3" /> Not connected
    </Badge>
  );
}

export default function SettingsIntegrationsPage() {
  const [hmrcConnected, setHmrcConnected] = useState(false);
  const [widgetConnected, setWidgetConnected] = useState(false);
  const { data: rawIntegrations = [], isLoading } = useListIntegrations({
    query: { queryKey: getListIntegrationsQueryKey() },
  });
  const apiIntegrations = rawIntegrations as IntegrationStatus[];
  const { data: receptionist } = useGetAiReceptionistSettings();
  const { data: vapi } = useGetVapiSettings();

  useEffect(() => {
    const basePath = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
    void Promise.all([
      fetch(`${basePath}/api/finance/hmrc/status`, { credentials: "include" })
        .then((r) => r.ok ? r.json() : null)
        .then((s) => setHmrcConnected(s?.status === "connected"))
        .catch(() => setHmrcConnected(false)),
      fetch(`${basePath}/api/integrations/widget/status`, { credentials: "include" })
        .then((r) => r.ok ? r.json() : null)
        .then((s) => setWidgetConnected(s?.recentlySeen === true))
        .catch(() => setWidgetConnected(false)),
    ]);
  }, []);

  const staticIntegrations: IntegrationStatus[] = [
    {
      provider: "website_widget",
      name: "Website Widget",
      description: "Embed the WorkRate chat widget on your website to capture enquiries directly.",
      status: widgetConnected ? "connected" : "not_connected",
      category: "website",
      connectedAt: null,
      metadata: widgetConnected ? "Widget enquiries detected" : "Install the snippet, then submit a test enquiry",
    },
    {
      provider: "phone_ai",
      name: "AI Receptionist",
      description: "Answer inbound calls automatically with your AI receptionist.",
      status: receptionist?.enabled && vapi?.connected ? "connected" : "not_connected",
      category: "phone",
      connectedAt: null,
      metadata: receptionist?.enabled && !vapi?.connected ? "Enabled; Vapi setup still required" : null,
    },
    {
      provider: "hmrc",
      name: "HMRC",
      description: "Read business details and MTD obligations from the HMRC sandbox.",
      status: hmrcConnected ? "connected" : "not_connected",
      category: "accounting",
      connectedAt: null,
      metadata: "Sandbox, read-only",
    },
  ];

  const apiProviders = new Set(apiIntegrations.map((i) => i.provider));
  const staticToAdd = staticIntegrations.filter((s) => !apiProviders.has(s.provider));
  const integrations: IntegrationStatus[] = [...apiIntegrations, ...staticToAdd];

  // Group by category
  const grouped: Record<string, IntegrationStatus[]> = {};
  for (const item of integrations) {
    if (!grouped[item.category]) grouped[item.category] = [];
    grouped[item.category].push(item);
  }

  const connectedCount = integrations.filter((i) => i.status === "connected").length;

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-16 animate-in fade-in-0 duration-500">
      <SettingsBreadcrumb items={[
        { label: "Settings", href: "/settings" },
        { label: "Communications & Integrations" },
      ]} />

      <div className="border-b border-border pb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight mb-2">Communications & Integrations</h1>
          <p className="text-muted-foreground font-medium">Connect WorkRate to the channels and tools your business uses.</p>
        </div>
        {connectedCount > 0 && (
          <Badge variant="secondary" className="gap-2 px-4 py-2 text-sm font-semibold shrink-0">
            <CheckCircle2 className="w-4 h-4" />
            {connectedCount} connected
          </Badge>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : (
        <div className="space-y-10">
          {Object.entries(grouped).map(([category, items]) => (
            <div key={category}>
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                  {CATEGORY_LABELS[category] ?? category}
                </h2>
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs font-bold text-muted-foreground">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map((item) => {
                  const meta = PROVIDER_META[item.provider];
                  const settingsPath = meta?.settingsPath ?? null;
                  const comingSoon = meta?.comingSoon ?? false;
                  const isConnected = item.status === "connected";

                  return (
                    <Card
                      key={item.provider}
                      className={cn(
                        "transition-all",
                        isConnected ? "border-primary/20 bg-primary/[0.03]" : ""
                      )}
                    >
                      <CardContent className="p-5 flex items-center gap-4 min-w-0">
                        {/* Icon — semantic bg-secondary with foreground abbr text; no per-brand hex */}
                        <div className="w-10 h-10 rounded-xl bg-secondary border border-border flex items-center justify-center shrink-0">
                          <span className="text-foreground font-black text-xs">{meta?.abbr ?? item.provider.slice(0, 2).toUpperCase()}</span>
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <span className="font-bold text-sm text-foreground">{item.name}</span>
                            <IntegrationStatusBadge status={item.status} comingSoon={comingSoon} />
                          </div>
                          <p className="text-xs text-muted-foreground font-medium leading-relaxed">{item.description}</p>
                          {item.metadata && (
                            <p className="text-xs text-muted-foreground/70 font-medium mt-0.5 truncate">{item.metadata}</p>
                          )}
                        </div>

                        {/* Action */}
                        <div className="shrink-0">
                          {settingsPath ? (
                            <Link href={settingsPath}>
                              <Button size="sm" variant={isConnected ? "outline" : "default"} className="font-bold gap-1">
                                {comingSoon ? "View" : isConnected ? "Manage" : "Set up"}
                                <ChevronRight className="w-3 h-3" />
                              </Button>
                            </Link>
                          ) : (
                            <span className="text-xs text-muted-foreground font-semibold">Coming soon</span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Request an integration */}
      <div className="rounded-xl border border-dashed border-border bg-secondary/30 px-8 py-6 flex items-center gap-4">
        <div className="w-10 h-10 bg-background border border-border rounded-xl flex items-center justify-center shrink-0">
          <Plug className="w-5 h-5 text-muted-foreground" />
        </div>
        <div>
          <p className="font-bold text-foreground text-sm">Don't see your tool?</p>
          <p className="text-xs text-muted-foreground mt-0.5 font-medium">
            More connectors — Mailchimp, Sage, GoCardless — can be added to the registry.
          </p>
        </div>
      </div>
    </div>
  );
}
