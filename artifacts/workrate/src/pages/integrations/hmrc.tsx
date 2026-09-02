/**
 * HMRC integration detail page.
 * Reuses the HMRC OAuth flow from finance.tsx (extracted logic, same API calls).
 */
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, RefreshCw, Unplug, Link2, Building2, ShieldCheck, AlertTriangle,
} from "lucide-react";
import {
  IntegrationPageHeader,
  StatusHeader,
  PageSection,
  FieldRow,
  type ConnectionStatus,
} from "./shared";

// ── Types (mirrored from finance.tsx) ─────────────────────────────────────────

type HmrcBusiness = {
  typeOfBusiness?: string;
  businessId?: string;
  tradingType?: string;
  tradingName?: string;
};

type HmrcObligation = {
  periodStartDate?: string;
  periodEndDate?: string;
  dueDate?: string;
  status?: string;
  receivedDate?: string;
};

type HmrcStatus = {
  status: "not_connected" | "connected" | "error" | "disconnected";
  sandboxConfigured: boolean;
  configurationMessage: string | null;
  scopes: string[];
  connectedAt: string | null;
  disconnectedAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastError: string | null;
  businesses: HmrcBusiness[];
  obligations: Array<{
    typeOfBusiness?: string;
    businessId?: string;
    obligationDetails?: HmrcObligation[];
  }>;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const hmrcDeviceStorageKey = "workrate.hmrc.device-id";

function hmrcBrowserContext() {
  let deviceId = window.localStorage.getItem(hmrcDeviceStorageKey);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    window.localStorage.setItem(hmrcDeviceStorageKey, deviceId);
  }
  const offsetMinutes = -new Date().getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteMinutes = Math.abs(offsetMinutes);
  const timezone = `UTC${sign}${String(Math.floor(absoluteMinutes / 60)).padStart(2, "0")}:${String(absoluteMinutes % 60).padStart(2, "0")}`;
  return {
    browserUserAgent: navigator.userAgent,
    deviceId,
    timezone,
    screens: [{
      width: window.screen.width,
      height: window.screen.height,
      colourDepth: window.screen.colorDepth,
      scalingFactor: window.devicePixelRatio || 1,
    }],
    windowSize: { width: window.innerWidth, height: window.innerHeight },
  };
}

function hmrcStatusToConnection(status: HmrcStatus["status"] | undefined): ConnectionStatus {
  if (!status) return "loading";
  if (status === "connected") return "connected";
  if (status === "error") return "error";
  if (status === "disconnected") return "disconnected";
  return "not_connected";
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function HmrcPage() {
  const { toast } = useToast();
  const basePath = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  const apiBase = `${basePath}/api`;

  const [hmrcStatus, setHmrcStatus] = useState<HmrcStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [sandboxTaxpayerId, setSandboxTaxpayerId] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const request = async (path: string, init?: RequestInit) => {
    const response = await fetch(`${apiBase}${path}`, {
      credentials: "include",
      ...init,
      headers: init?.body instanceof FormData
        ? init?.headers
        : { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error((body as any).error ?? "Request failed");
    }
    if (response.status === 204) return null;
    return response.json();
  };

  async function loadStatus() {
    try {
      const s = await request("/finance/hmrc/status");
      setHmrcStatus(s);
    } catch (err: any) {
      toast({ title: "Could not load HMRC status", description: err.message, variant: "destructive" });
    } finally {
      setLoadingStatus(false);
    }
  }

  useEffect(() => { void loadStatus(); }, []);

  async function connect() {
    setSubmitting(true);
    const hmrcWindow = window.open("about:blank", "_blank");
    if (!hmrcWindow) {
      toast({
        title: "Could not open HMRC sandbox",
        description: "Allow pop-ups for WorkRate, then try connecting again.",
        variant: "destructive",
      });
      setSubmitting(false);
      return;
    }
    hmrcWindow.opener = null;
    try {
      const start = await request("/finance/hmrc/connect", {
        method: "POST",
        body: JSON.stringify({
          taxpayerId: sandboxTaxpayerId.trim().toUpperCase(),
          browserContext: hmrcBrowserContext(),
          returnPath: window.location.pathname,
        }),
      });
      hmrcWindow.location.replace(start.authorizationUrl);
      setDialogOpen(false);
    } catch (err: any) {
      hmrcWindow.close();
      toast({ title: "Could not start HMRC connection", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  async function sync() {
    setSubmitting(true);
    try {
      const next = await request("/finance/hmrc/sync", {
        method: "POST",
        body: JSON.stringify({ browserContext: hmrcBrowserContext() }),
      });
      setHmrcStatus(next);
      toast({ title: "HMRC sandbox refreshed", description: "Read-only business details and obligations retrieved." });
    } catch (err: any) {
      toast({ title: "HMRC sync failed", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  async function disconnect() {
    setSubmitting(true);
    try {
      await request("/finance/hmrc", { method: "DELETE" });
      setSandboxTaxpayerId("");
      toast({ title: "HMRC sandbox disconnected", description: "Local encrypted credentials were removed." });
      await loadStatus();
    } catch (err: any) {
      toast({ title: "Could not disconnect", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  const status = hmrcStatusToConnection(hmrcStatus?.status);

  const statusMessage = loadingStatus
    ? undefined
    : hmrcStatus?.status === "connected"
    ? `Connected. Last sync: ${hmrcStatus.lastSuccessfulSyncAt ? new Date(hmrcStatus.lastSuccessfulSyncAt).toLocaleString("en-GB") : "never"}.`
    : hmrcStatus?.status === "error"
    ? hmrcStatus.lastError ?? "Check your sandbox credentials."
    : hmrcStatus?.status === "disconnected"
    ? `Disconnected${hmrcStatus.disconnectedAt ? ` on ${new Date(hmrcStatus.disconnectedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}` : ""}.`
    : "Not connected to HMRC sandbox.";

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-16">
      <IntegrationPageHeader
        name="HMRC"
        icon={<ShieldCheck className="w-4 h-4 text-primary" />}
      />

      <div>
        <h1 className="text-2xl font-black tracking-tight">HMRC Sandbox</h1>
        <p className="text-muted-foreground font-medium mt-1">
          Connect to the HMRC sandbox to read business details and Making Tax Digital obligations. Read-only — no submissions.
        </p>
      </div>

      {loadingStatus ? (
        <Skeleton className="h-12 w-full rounded-xl" />
      ) : (
        <StatusHeader status={status} message={statusMessage} />
      )}

      {/* Important disclaimer */}
      <PageSection>
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-foreground">Connected does not mean MTD filing is enabled</p>
            <p className="text-sm text-muted-foreground font-medium mt-1 leading-relaxed">
              WorkRate reads business details and obligations from HMRC. It cannot submit, file, or send anything to HMRC. This connection does not create a Making Tax Digital filing obligation or submission. Always check values against original documents before using them in accounting or MTD software.
            </p>
          </div>
        </div>
      </PageSection>

      {/* Actions */}
      <PageSection title="HMRC sandbox connection">
        <div className="space-y-4">
          {loadingStatus ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-48 rounded-lg" />
              <Skeleton className="h-4 w-64 rounded" />
            </div>
          ) : (
            <>
              {hmrcStatus && !hmrcStatus.sandboxConfigured && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-950">
                  <p className="font-bold">Sandbox configuration needed</p>
                  <p className="mt-1 font-medium">
                    {hmrcStatus.configurationMessage ?? "The HMRC sandbox credentials have not been configured on the server."}
                  </p>
                </div>
              )}

              {hmrcStatus?.status === "error" && hmrcStatus.lastError && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
                  <p className="font-bold text-destructive">Connection error</p>
                  <p className="mt-1 text-muted-foreground">{hmrcStatus.lastError}</p>
                </div>
              )}

              {hmrcStatus?.status === "disconnected" && (
                <div className="rounded-xl border border-border/60 bg-secondary/40 px-4 py-3 text-sm">
                  <p className="font-bold">Previously connected</p>
                  <p className="mt-1 text-muted-foreground font-medium">
                    Connect again to retrieve current obligations.
                  </p>
                </div>
              )}

              {hmrcStatus?.status === "connected" && hmrcStatus.businesses.length > 0 && (
                <div className="grid sm:grid-cols-2 gap-3">
                  {hmrcStatus.businesses.map((biz, i) => (
                    <div key={`${biz.businessId ?? "biz"}-${i}`} className="rounded-xl border border-border/60 p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <Building2 className="w-4 h-4 text-primary" />
                        <p className="font-bold text-sm">
                          {biz.tradingName || biz.typeOfBusiness || "Registered business"}
                        </p>
                      </div>
                      {biz.typeOfBusiness && biz.tradingName && (
                        <p className="text-xs text-muted-foreground font-medium">{biz.typeOfBusiness}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {hmrcStatus?.status === "connected" || hmrcStatus?.status === "error" ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-lg gap-2 font-bold"
                      disabled={submitting}
                      onClick={sync}
                    >
                      {submitting
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <RefreshCw className="w-4 h-4" />}
                      Sync
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-lg gap-2 font-bold text-destructive hover:text-destructive"
                      disabled={submitting}
                      onClick={disconnect}
                    >
                      <Unplug className="w-4 h-4" /> Disconnect
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    className="rounded-lg gap-2 font-bold"
                    disabled={!hmrcStatus?.sandboxConfigured || submitting}
                    onClick={() => setDialogOpen(true)}
                  >
                    {submitting
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Link2 className="w-4 h-4" />}
                    Connect HMRC sandbox
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </PageSection>

      {/* What WorkRate reads */}
      <PageSection title="What WorkRate reads from HMRC">
        <ul className="space-y-2 text-sm text-muted-foreground font-medium">
          {[
            "Business details (trading name, type of business)",
            "Making Tax Digital obligation periods and due dates",
            "Obligation status (open / fulfilled)",
          ].map((item) => (
            <li key={item} className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
              {item}
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground font-medium mt-3">
          No financial data, tax filings, or sensitive taxpayer records are read or stored.
        </p>
      </PageSection>

      {/* Connect dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-black">Connect HMRC sandbox</DialogTitle>
            <DialogDescription>
              Use an HMRC sandbox test account only. Your taxpayer identifier is encrypted on the server and never shown again. Connected never means submitted or filed.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <FieldRow label="Sandbox NINO">
              <Input
                value={sandboxTaxpayerId}
                onChange={(e) => setSandboxTaxpayerId(e.target.value.toUpperCase())}
                placeholder="AA000003D"
                autoCapitalize="characters"
              />
            </FieldRow>
            <p className="text-xs text-muted-foreground font-medium">
              This starts a read-only OAuth connection. No finance records or tax updates will be created or filed.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="font-bold rounded-xl">Cancel</Button>
            <Button
              disabled={!sandboxTaxpayerId.trim() || submitting}
              onClick={connect}
              className="font-bold rounded-xl"
            >
              {submitting
                ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Opening HMRC…</>
                : "Continue to HMRC"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
