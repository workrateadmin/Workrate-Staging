import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  useListIntegrations,
  useGetAiReceptionistSettings,
  useGetVapiSettings,
  getListIntegrationsQueryKey,
  type IntegrationStatus,
} from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import {
  CheckCircle2, Circle, AlertCircle, Loader2,
  ExternalLink, Zap, ChevronRight, Lock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// ── Provider metadata ─────────────────────────────────────────────────────────

const PROVIDER_META: Record<string, {
  color: string;
  bgColor: string;
  mark: string;
  logo?: string;
  docsUrl?: string;
  comingSoon: boolean;
  settingsPath: string | null;
}> = {
  facebook_messenger: {
    color: "#1877F2",
    bgColor: "#EBF3FF",
    mark: "f",
    comingSoon: true,
    settingsPath: "/settings/integrations/facebook",
  },
  instagram: {
    color: "#E1306C",
    bgColor: "#FDF0F4",
    mark: "ig",
    comingSoon: true,
    settingsPath: "/settings/integrations/instagram",
  },
  whatsapp_business: {
    color: "#25D366",
    bgColor: "#EDFAF3",
    mark: "wa",
    comingSoon: true,
    settingsPath: "/settings/integrations/whatsapp",
  },
  email: {
    color: "#EA4335",
    bgColor: "#FEF0EF",
    mark: "@",
    comingSoon: true,
    settingsPath: "/settings/integrations/email",
  },
  xero: {
    color: "#13B5EA",
    bgColor: "#EBF9FF",
    mark: "x",
    docsUrl: "https://developer.xero.com",
    comingSoon: true,
    settingsPath: "/settings/integrations/xero",
  },
  quickbooks: {
    color: "#2CA01C",
    bgColor: "#EDFAEB",
    mark: "qb",
    docsUrl: "https://developer.intuit.com",
    comingSoon: true,
    settingsPath: "/settings/integrations/quickbooks",
  },
  stripe: {
    color: "#635BFF",
    bgColor: "#F1F0FF",
    mark: "s",
    docsUrl: "https://stripe.com/docs",
    comingSoon: false,
    settingsPath: "/settings/integrations/stripe",
  },
};

// Hard-coded entries for integrations that don't come from the API
const STATIC_META: Record<string, typeof PROVIDER_META[string]> = {
  website_widget: {
    color: "#0EA5E9",
    bgColor: "#F0F9FF",
    mark: "w",
    comingSoon: false,
    settingsPath: "/settings/integrations/website-widget",
  },
  phone_ai: {
    color: "#F97316",
    bgColor: "#FFF7ED",
    mark: "ph",
    comingSoon: false,
    settingsPath: "/settings/integrations/phone",
  },
  hmrc: {
    color: "#005EA5",
    bgColor: "#EAF4FB",
    mark: "hm",
    comingSoon: false,
    settingsPath: "/settings/integrations/hmrc",
  },
};

const CATEGORY_LABELS: Record<string, string> = {
  all: "All",
  messaging: "Messaging",
  email: "Email",
  accounting: "Accounting & Finance",
  payments: "Payments",
  website: "Website",
  phone: "Phone",
};

export default function IntegrationsPage() {
  const [activeCategory, setActiveCategory] = useState("all");
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
        .then((response) => response.ok ? response.json() : null)
        .then((status) => setHmrcConnected(status?.status === "connected"))
        .catch(() => setHmrcConnected(false)),
      fetch(`${basePath}/api/integrations/widget/status`, { credentials: "include" })
        .then((response) => response.ok ? response.json() : null)
        .then((status) => setWidgetConnected(status?.recentlySeen === true))
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
      name: "Phone — AI Receptionist",
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

  // Merge API integrations with static ones (deduplicated by provider)
  const apiProviders = new Set(apiIntegrations.map((i) => i.provider));
  const staticToAdd = staticIntegrations.filter((s) => !apiProviders.has(s.provider));
  const integrations: IntegrationStatus[] = [...apiIntegrations, ...staticToAdd];

  const categories: string[] = ["all", ...Array.from(new Set(integrations.map((i) => i.category)))];

  const filtered: IntegrationStatus[] = activeCategory === "all"
    ? integrations
    : integrations.filter((i) => i.category === activeCategory);

  const grouped: Record<string, IntegrationStatus[]> = {};
  if (activeCategory === "all") {
    for (const item of integrations) {
      if (!grouped[item.category]) grouped[item.category] = [];
      grouped[item.category].push(item);
    }
  }

  const connectedCount = integrations.filter((i) => i.status === "connected").length;

  return (
    <div className="space-y-8 pb-12">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Integrations</h1>
          <p className="text-muted-foreground font-medium mt-1">
            Connect WorkRate to the tools your business already uses.
          </p>
        </div>
        {connectedCount > 0 && (
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">
            <CheckCircle2 className="w-4 h-4" />
            {connectedCount} integration{connectedCount !== 1 ? "s" : ""} connected
          </div>
        )}
      </div>

      {/* Status banner */}
      <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-primary/5 px-6 py-5 flex items-start gap-4">
        <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center shrink-0">
          <Zap className="w-5 h-5 text-primary" />
        </div>
        <div>
          <p className="font-bold text-foreground">Connect your channels and tools</p>
          <p className="text-sm text-muted-foreground mt-0.5 font-medium max-w-xl">
            Each integration has a dedicated setup page. Click Set up or Manage on any card to configure it. Active connections are confirmed by real data, not just by saving credentials.
          </p>
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={cn(
              "px-4 py-2 rounded-full text-sm font-bold transition-all border",
              activeCategory === cat
                ? "bg-foreground text-background border-foreground shadow-sm"
                : "bg-card text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground"
            )}
          >
            {CATEGORY_LABELS[cat] ?? cat}
            {cat !== "all" && (
              <span className={cn(
                "ml-2 text-xs px-1.5 py-0.5 rounded-full font-bold",
                activeCategory === cat ? "bg-white/20 text-white/80" : "bg-secondary text-muted-foreground"
              )}>
                {integrations.filter((i) => i.category === cat).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Integration grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(7)].map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-2xl p-6 animate-pulse">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-secondary rounded-xl" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-secondary rounded w-2/3" />
                  <div className="h-3 bg-secondary rounded w-1/3" />
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <div className="h-3 bg-secondary rounded w-full" />
                <div className="h-3 bg-secondary rounded w-4/5" />
              </div>
            </div>
          ))}
        </div>
      ) : activeCategory === "all" ? (
        <div className="space-y-10">
          {Object.entries(grouped).map(([category, items]) => (
            <div key={category}>
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground">
                  {CATEGORY_LABELS[category] ?? category}
                </h2>
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs font-bold text-muted-foreground">{items.length}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.map((item) => (
                  <IntegrationCard key={item.provider} item={item} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((item) => (
            <IntegrationCard key={item.provider} item={item} />
          ))}
        </div>
      )}

      {/* Request an integration */}
      <div className="mt-8 rounded-2xl border border-dashed border-border bg-secondary/30 px-8 py-8 flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left">
        <div className="w-14 h-14 bg-background border border-border rounded-2xl flex items-center justify-center shrink-0 shadow-sm">
          <Zap className="w-6 h-6 text-muted-foreground" />
        </div>
        <div className="flex-1">
          <p className="font-bold text-foreground text-lg">Don't see your tool?</p>
          <p className="text-sm text-muted-foreground mt-1 font-medium">
            WorkRate's integration system is built to be extended. More connectors — Mailchimp, Sage, GoCardless, and others — can be added to the registry.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Integration card ──────────────────────────────────────────────────────────

function IntegrationCard({ item }: { item: IntegrationStatus }) {
  const [, navigate] = useLocation();
  const meta = PROVIDER_META[item.provider] ?? STATIC_META[item.provider];
  const isConnected = item.status === "connected";
  const isError = item.status === "error";
  const settingsPath = meta?.settingsPath ?? null;
  const isComingSoon = meta?.comingSoon ?? false;

  function handleAction() {
    if (settingsPath) navigate(settingsPath);
  }

  return (
    <div
      className={cn(
        "group relative bg-card border rounded-2xl p-6 flex flex-col gap-4 transition-all duration-200",
        isConnected
          ? "border-emerald-200 bg-emerald-50/30 shadow-sm"
          : "border-border hover:border-border/80 hover:shadow-sm"
      )}
    >
      {/* Connected accent */}
      {isConnected && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-t-2xl" />
      )}

      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        {/* Icon */}
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-black text-sm shrink-0 shadow-sm select-none"
          style={{
            backgroundColor: meta?.color ?? "#64748B",
            boxShadow: `0 2px 8px ${meta?.color ?? "#64748B"}30`,
          }}
        >
          <ProviderIcon provider={item.provider} />
        </div>

        {/* Status badge */}
        <div className="shrink-0">
          {isComingSoon ? (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-full">
              <Lock className="w-3 h-3" /> Coming soon
            </span>
          ) : isConnected ? (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-full">
              <CheckCircle2 className="w-3 h-3" /> Connected
            </span>
          ) : isError ? (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full">
              <AlertCircle className="w-3 h-3" /> Error
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-full">
              <Circle className="w-3 h-3" /> Not connected
            </span>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="flex-1 space-y-1.5">
        <h3 className="font-bold text-foreground text-[15px] leading-tight">{item.name}</h3>
        <Badge
          variant="secondary"
          className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
          style={{
            backgroundColor: `${meta?.color ?? "#64748B"}15`,
            color: meta?.color ?? "#64748B",
            border: `1px solid ${meta?.color ?? "#64748B"}25`,
          }}
        >
          {CATEGORY_LABELS[item.category] ?? item.category}
        </Badge>
        <p className="text-[13px] text-muted-foreground font-medium leading-relaxed pt-0.5">
          {item.description}
        </p>
      </div>

      {/* Status message from metadata */}
      {item.metadata && (
        <div className="text-xs text-muted-foreground font-medium bg-secondary/50 rounded-lg px-3 py-2 border border-border/40">
          {item.metadata}
        </div>
      )}

      {/* Connected-at info */}
      {isConnected && item.connectedAt && (
        <div className="text-xs text-emerald-700 font-medium bg-emerald-50 rounded-lg px-3 py-2 border border-emerald-100">
          Connected {new Date(item.connectedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
        </div>
      )}

      {/* Action button */}
      <div className="flex items-center gap-2 pt-1">
        {settingsPath ? (
          <Button
            size="sm"
            variant={isConnected ? "outline" : "default"}
            className="flex-1 font-bold rounded-xl h-9 text-xs"
            onClick={handleAction}
          >
            <ChevronRight className="w-3.5 h-3.5 mr-1" />
            {isComingSoon ? "View details" : isConnected ? "Manage" : "Set up"}
          </Button>
        ) : (
          <button
            disabled
            className="flex-1 flex items-center justify-center gap-2 h-9 rounded-xl border border-dashed border-border bg-secondary/50 text-xs font-bold text-muted-foreground cursor-not-allowed select-none"
          >
            <Lock className="w-3 h-3" />
            Coming soon
          </button>
        )}
        {meta?.docsUrl && (
          <a
            href={meta.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-9 h-9 rounded-xl border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors shrink-0"
            title="View documentation"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}

// ── Provider icon ─────────────────────────────────────────────────────────────

function ProviderIcon({ provider }: { provider: string }) {
  switch (provider) {
    case "facebook_messenger":
      return (
        <svg viewBox="0 0 24 24" className="w-6 h-6 fill-white">
          <path d="M12 2C6.48 2 2 6.26 2 11.5c0 2.9 1.28 5.5 3.32 7.3V23l4.01-2.21c1.07.3 2.2.46 3.37.46 5.52 0 10-4.26 10-9.5S17.52 2 12 2zm1.08 12.82l-2.55-2.72-4.97 2.72 5.47-5.81 2.61 2.72 4.91-2.72-5.47 5.81z"/>
        </svg>
      );
    case "instagram":
      return (
        <svg viewBox="0 0 24 24" className="w-6 h-6 fill-white">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
        </svg>
      );
    case "whatsapp_business":
      return (
        <svg viewBox="0 0 24 24" className="w-6 h-6 fill-white">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
      );
    case "email":
      return (
        <svg viewBox="0 0 24 24" className="w-6 h-6 fill-white">
          <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
        </svg>
      );
    case "xero":
      return (
        <svg viewBox="0 0 24 24" className="w-6 h-6 fill-white">
          <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 15.117l-1.77 1.77-2.124-2.124-2.124 2.124-1.77-1.77 2.124-2.124-2.124-2.124 1.77-1.77 2.124 2.124 2.124-2.124 1.77 1.77-2.124 2.124 2.124 2.124z"/>
        </svg>
      );
    case "quickbooks":
      return (
        <svg viewBox="0 0 24 24" className="w-6 h-6 fill-white">
          <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm-1.5 17.25a4.5 4.5 0 110-9 4.5 4.5 0 010 9zm0-7.5a3 3 0 100 6 3 3 0 000-6zm7.5 4.5h-1.5a4.5 4.5 0 00-4.5-4.5V8.25a6 6 0 016 6z"/>
        </svg>
      );
    case "stripe":
      return (
        <svg viewBox="0 0 24 24" className="w-6 h-6 fill-white">
          <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z"/>
        </svg>
      );
    case "website_widget":
      return (
        <svg viewBox="0 0 24 24" className="w-6 h-6 fill-white">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
        </svg>
      );
    case "phone_ai":
      return (
        <svg viewBox="0 0 24 24" className="w-6 h-6 fill-white">
          <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
        </svg>
      );
    default:
      return <span className="text-xs font-black">{provider.slice(0, 2).toUpperCase()}</span>;
  }
}
