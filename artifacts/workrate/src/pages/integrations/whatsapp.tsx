import { useState } from "react";
import { useAuth } from "@clerk/react";
import {
  useListIntegrations,
  getListIntegrationsQueryKey,
  useDisconnectIntegration,
  type IntegrationStatus,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Copy, CheckCircle2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  IntegrationPageHeader,
  StatusHeader,
  PageSection,
  FieldRow,
  type ConnectionStatus,
} from "./shared";

const WEBHOOK_URL = "https://work-rate-manager.replit.app/api/webhooks/whatsapp";

const WA_ICON = (
  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-[#25D366]">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);

export default function WhatsAppPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { getToken } = useAuth();
  const [showConnectForm, setShowConnectForm] = useState(false);

  const { data: rawIntegrations = [], isLoading } = useListIntegrations({
    query: { queryKey: getListIntegrationsQueryKey() },
  });
  const integrations = rawIntegrations as IntegrationStatus[];
  const waIntegration = integrations.find((i) => i.provider === "whatsapp_business");

  const disconnect = useDisconnectIntegration({
    mutation: {
      onSuccess: () => {
        toast({ title: "WhatsApp disconnected" });
        qc.invalidateQueries({ queryKey: getListIntegrationsQueryKey() });
      },
      onError: () => toast({ title: "Could not disconnect", variant: "destructive" }),
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: getListIntegrationsQueryKey() });

  const isConnected = waIntegration?.status === "connected";
  const isError = waIntegration?.status === "error";

  const status: ConnectionStatus = isLoading
    ? "loading"
    : isConnected
    ? "connected"
    : isError
    ? "error"
    : "not_connected";
  const safeMetadata = (() => {
    if (!waIntegration?.metadata) return null;
    try {
      const parsed = JSON.parse(waIntegration.metadata) as { displayNumber?: string };
      return parsed.displayNumber ? `Business number: ${parsed.displayNumber}` : null;
    } catch {
      return null;
    }
  })();

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-16">
      <IntegrationPageHeader
        name="WhatsApp Business"
        icon={WA_ICON}
      />

      <div>
        <h1 className="text-2xl font-black tracking-tight">WhatsApp Business</h1>
        <p className="text-muted-foreground font-medium mt-1">
          Receive enquiries from WhatsApp directly into your WorkRate pipeline via the Meta Cloud API.
        </p>
      </div>

      <StatusHeader
        status={status}
        message={
          isConnected
            ? waIntegration?.connectedAt
              ? `Connected ${new Date(waIntegration.connectedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}.`
              : "Receiving WhatsApp messages."
            : isError
            ? safeMetadata ?? "Check your Meta App configuration."
            : "Connect your Meta WhatsApp Business account to receive enquiries."
        }
      />

      {/* Connected: metadata + management */}
      {isConnected && (
        <PageSection title="Connection details">
          <div className="space-y-4">
            {safeMetadata && (
              <div className="text-sm text-muted-foreground font-medium">{safeMetadata}</div>
            )}
            <div className="rounded-xl border border-border/60 bg-secondary/30 divide-y divide-border/40">
              <div className="px-4 py-3 flex items-center justify-between">
                <span className="text-sm font-bold">Status</span>
                <span className="text-sm font-medium text-emerald-700">Active — receiving messages</span>
              </div>
              {waIntegration?.connectedAt && (
                <div className="px-4 py-3 flex items-center justify-between">
                  <span className="text-sm font-bold">Connected</span>
                  <span className="text-sm font-medium text-muted-foreground">
                    {new Date(waIntegration.connectedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                  </span>
                </div>
              )}
              <div className="px-4 py-3 flex items-center justify-between">
                <span className="text-sm font-bold">Provider</span>
                <span className="text-sm font-medium text-muted-foreground">Meta Cloud API</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground font-medium">
              Saved access tokens are never returned to or displayed by this dashboard.
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="font-bold rounded-xl text-destructive hover:text-destructive"
                onClick={() => disconnect.mutate({ provider: "whatsapp_business" })}
                disabled={disconnect.isPending}
              >
                {disconnect.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <X className="w-3.5 h-3.5 mr-1.5" />}
                Disconnect
              </Button>
            </div>
          </div>
        </PageSection>
      )}

      {/* Connect form */}
      {!isConnected && (
        <PageSection
          title="Connect WhatsApp Business"
          description="You will need a Meta Developer App with WhatsApp configured, and a permanent system user access token."
        >
          {!showConnectForm ? (
            <Button className="font-bold rounded-xl" onClick={() => setShowConnectForm(true)}>
              Set up WhatsApp Business
            </Button>
          ) : (
            <WAConnectForm
              getToken={getToken}
              onSuccess={() => { setShowConnectForm(false); refresh(); }}
              onCancel={() => setShowConnectForm(false)}
            />
          )}
        </PageSection>
      )}

      {/* Webhook info */}
      <PageSection
        title="Webhook configuration"
        description="Register this URL in your Meta App dashboard to receive messages."
      >
        <div className="space-y-4">
          <WebhookUrlRow url={WEBHOOK_URL} />
          <div className="space-y-2 text-sm text-muted-foreground font-medium">
            <p>
              In your Meta App: WhatsApp &rarr; Configuration &rarr; Webhook. Click <strong className="text-foreground">Edit</strong>, paste the URL above, enter your verify token, click <strong className="text-foreground">Verify and Save</strong>, then subscribe to the <strong className="text-foreground">messages</strong> field.
            </p>
          </div>
        </div>
      </PageSection>

      {/* How it works */}
      <PageSection title="How it works">
        <ol className="space-y-3">
          {[
            "A customer sends a WhatsApp message to your business number.",
            "Meta forwards it to WorkRate via the webhook above.",
            "The AI reads and responds, gathering enquiry details.",
            "A new enquiry appears in your WorkRate pipeline automatically.",
          ].map((step, i) => (
            <li key={i} className="flex gap-3 text-sm text-muted-foreground font-medium">
              <span className="w-5 h-5 rounded-full bg-[#25D366]/15 text-[#25D366] flex items-center justify-center text-[11px] font-black shrink-0 mt-0.5">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </PageSection>
    </div>
  );
}

// ── Webhook URL row ───────────────────────────────────────────────────────────

function WebhookUrlRow({ url }: { url: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "Webhook URL copied" });
    });
  }

  return (
    <div className="flex items-center gap-2 bg-secondary/60 border border-border rounded-xl px-3 py-2.5">
      <code className="text-xs font-mono text-foreground flex-1 truncate">{url}</code>
      <button
        onClick={copy}
        className="shrink-0 text-muted-foreground hover:text-foreground transition-colors p-1"
        title="Copy"
      >
        {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

// ── Connect form (extracted from integrations.tsx WAConnectModal) ─────────────

function WAConnectForm({
  getToken,
  onSuccess,
  onCancel,
}: {
  getToken: () => Promise<string | null>;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [displayNumber, setDisplayNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const { toast } = useToast();

  async function submit() {
    if (!phoneNumberId.trim() || !accessToken.trim()) {
      toast({ title: "Phone Number ID and Access Token are required", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const token = await getToken();
      const basePath = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
      const res = await fetch(`${basePath}/api/integrations/whatsapp_business/connect`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          phoneNumberId: phoneNumberId.trim(),
          accessToken: accessToken.trim(),
          displayNumber: displayNumber.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error ?? `HTTP ${res.status}`);
      }
      setDone(true);
    } catch (err: any) {
      toast({ title: "Connection failed", description: err?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-emerald-800 text-sm">Connected successfully</p>
            <p className="text-xs text-emerald-700 mt-0.5 font-medium">
              Your credentials have been saved. Register the webhook URL shown in the section below in your Meta App dashboard.
            </p>
          </div>
        </div>
        <Button className="font-bold rounded-xl" onClick={onSuccess}>Done</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <FieldRow
        label="Phone Number ID"
        description="The numeric ID shown next to your phone number in Meta > WhatsApp > API Setup."
      >
        <Input
          placeholder="e.g. 123456789012345"
          value={phoneNumberId}
          onChange={(e) => setPhoneNumberId(e.target.value)}
          className="font-mono text-sm"
          autoComplete="off"
        />
      </FieldRow>

      <FieldRow
        label="Permanent Access Token"
        description="Generate a permanent token from System Users in Meta Business Settings — not the temporary test token."
      >
        <Input
          type="password"
          placeholder="EAAxxxxxxxxxxxxxxx…"
          value={accessToken}
          onChange={(e) => setAccessToken(e.target.value)}
          className="font-mono text-sm"
          autoComplete="new-password"
        />
      </FieldRow>

      <FieldRow
        label="Display number (optional)"
        description="Shown in the WorkRate dashboard for reference only — not used for sending."
      >
        <Input
          placeholder="+44 7700 900000"
          value={displayNumber}
          onChange={(e) => setDisplayNumber(e.target.value)}
          className="text-sm"
        />
      </FieldRow>

      <div className="flex gap-2 pt-1">
        <Button variant="outline" className="font-semibold rounded-xl" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button
          className="font-bold rounded-xl bg-[#25D366] hover:bg-[#20ba58] text-white"
          onClick={submit}
          disabled={loading}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          {loading ? "Connecting…" : "Connect WhatsApp"}
        </Button>
      </div>
    </div>
  );
}
