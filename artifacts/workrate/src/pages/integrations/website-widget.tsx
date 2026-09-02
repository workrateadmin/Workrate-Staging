import { useState } from "react";
import { useGetCompany, useListEnquiries, getListEnquiriesQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Copy, CheckCheck, ExternalLink, Globe, Send, ChevronDown, ChevronUp, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  IntegrationPageHeader,
  StatusHeader,
  PageSection,
  type ConnectionStatus,
} from "./shared";

const PLATFORM_INSTRUCTIONS: Record<string, { label: string; steps: string[] }> = {
  wordpress: {
    label: "WordPress",
    steps: [
      "In your WordPress admin, go to Appearance > Theme Editor (or use a plugin like Insert Headers and Footers).",
      "Open your theme's footer.php file and paste the snippet just before the closing </body> tag.",
      "Save changes and visit your site — the widget will appear on every page.",
      "If you use a page-builder plugin (Elementor, Divi), add a Custom HTML widget with the snippet instead.",
    ],
  },
  wix: {
    label: "Wix",
    steps: [
      "In your Wix dashboard, go to Settings > Custom Code (under Advanced).",
      "Click Add Custom Code, paste the snippet, and set placement to Body — end of body.",
      "Set it to load on All pages and click Apply.",
      "Publish your site — the widget goes live immediately.",
    ],
  },
  squarespace: {
    label: "Squarespace",
    steps: [
      "In your Squarespace dashboard, go to Settings > Advanced > Code Injection.",
      "Paste the snippet into the Footer section.",
      "Click Save — the widget will appear on every page of your site.",
    ],
  },
  shopify: {
    label: "Shopify",
    steps: [
      "In your Shopify admin, go to Online Store > Themes > Actions > Edit code.",
      "Open the theme.liquid file (under Layout).",
      "Paste the snippet just before the closing </body> tag.",
      "Click Save — the widget appears on your entire storefront.",
    ],
  },
  godaddy: {
    label: "GoDaddy Website Builder",
    steps: [
      "In GoDaddy Website Builder, go to Settings > Website > Analytics & Tracking.",
      "Paste the snippet into the Footer scripts box.",
      "Save and publish your site.",
    ],
  },
  other: {
    label: "Other / Custom",
    steps: [
      "Copy the snippet below.",
      "Open your website's HTML source and find the closing </body> tag.",
      "Paste the snippet immediately before </body> on every page where you want the widget.",
      "Upload/deploy your changes — the widget is live.",
    ],
  },
};

export default function WebsiteWidgetPage() {
  const { data: company } = useGetCompany();
  const { data: enquiries = [] } = useListEnquiries(
    undefined,
    { query: { queryKey: getListEnquiriesQueryKey() } },
  );
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [platform, setPlatform] = useState("wordpress");
  const [instructionsOpen, setInstructionsOpen] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const basePath = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  const widgetJsUrl = `${origin}${basePath}/widget.js`;
  const widgetPreviewUrl = `${origin}${basePath}/widget`;
  const businessId = company?.widgetToken ?? "loading...";
  const isDevUrl =
    typeof window !== "undefined" &&
    window.location.hostname.endsWith(".replit.dev");

  const scriptSnippet =
    `<!-- WorkRate Chat Widget -->\n<script\n  src="${widgetJsUrl}"\n  data-business-id="${businessId}"\n  defer>\n</script>`;

  // Detect actual widget-origin enquiries to determine live status
  const widgetEnquiries = (enquiries as any[]).filter((e) => e.source === "widget" || e.channel === "widget");
  const isLive = widgetEnquiries.length > 0;
  const status: ConnectionStatus = isLive ? "connected" : "not_connected";

  function copySnippet() {
    navigator.clipboard.writeText(scriptSnippet).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "Snippet copied to clipboard" });
    });
  }

  const platformMeta = PLATFORM_INSTRUCTIONS[platform] ?? PLATFORM_INSTRUCTIONS.other;

  const designerMailto = `mailto:?subject=WorkRate%20chat%20widget%20installation&body=Hi%2C%0A%0APlease%20add%20the%20following%20code%20snippet%20to%20every%20page%20of%20our%20website%2C%20just%20before%20the%20closing%20%3C%2Fbody%3E%20tag%3A%0A%0A${encodeURIComponent(scriptSnippet)}%0A%0AThanks`;

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-16">
      <IntegrationPageHeader
        name="Website Widget"
        icon={<Globe className="w-4 h-4 text-primary" />}
      />

      <div>
        <h1 className="text-2xl font-black tracking-tight">Website Chat Widget</h1>
        <p className="text-muted-foreground font-medium mt-1">
          Embed the WorkRate assistant on your website. Enquiries land directly in your pipeline.
        </p>
      </div>

      <StatusHeader
        status={status}
        label={isLive ? "Connected — widget enquiries detected" : "Setup required — no widget enquiries yet"}
        message={
          isLive
            ? `${widgetEnquiries.length} enquir${widgetEnquiries.length === 1 ? "y" : "ies"} received via the website widget.`
            : "Install the snippet below and submit a test enquiry to confirm it is working."
        }
      />

      {/* Platform selector */}
      <PageSection
        title="Your website platform"
        description="Select your platform to see tailored installation steps."
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {Object.entries(PLATFORM_INSTRUCTIONS).map(([key, meta]) => (
            <button
              key={key}
              onClick={() => { setPlatform(key); setInstructionsOpen(true); }}
              className={cn(
                "px-3 py-2.5 rounded-xl border text-sm font-bold transition-all text-left",
                platform === key
                  ? "bg-foreground text-background border-foreground"
                  : "bg-card text-foreground border-border hover:border-foreground/30"
              )}
            >
              {meta.label}
            </button>
          ))}
        </div>
      </PageSection>

      {/* Snippet section */}
      <PageSection
        title="Embed snippet"
        description="Copy this code and paste it into your website's HTML, before the closing </body> tag."
      >
        <div className="space-y-4">
          {isDevUrl && (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-300 rounded-xl px-4 py-3">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-black text-amber-900">Development preview — do not copy this snippet</p>
                <p className="text-xs text-amber-800 mt-1 font-medium leading-relaxed">
                  This snippet uses a development URL. Open Settings from your published WorkRate app to get the correct production snippet.
                </p>
              </div>
            </div>
          )}

          <div className="relative bg-[#0F172A] rounded-xl overflow-hidden border border-border/40">
            <pre className="text-[11px] leading-relaxed text-slate-300 p-5 overflow-x-auto font-mono whitespace-pre">
              <span className="text-slate-500">{`<!-- WorkRate Chat Widget -->`}</span>{"\n"}
              <span className="text-sky-400">{`<script`}</span>{"\n"}
              {"  "}<span className="text-green-400">src</span><span className="text-slate-400">=</span><span className="text-amber-300">{`"${widgetJsUrl}"`}</span>{"\n"}
              {"  "}<span className="text-green-400">data-business-id</span><span className="text-slate-400">=</span><span className="text-amber-300">{`"${businessId}"`}</span>{"\n"}
              {"  "}<span className="text-green-400">defer</span><span className="text-sky-400">{`>`}</span>{"\n"}
              <span className="text-sky-400">{`</script>`}</span>
            </pre>
          </div>

          <div className="flex flex-wrap gap-2">
            {isDevUrl ? (
              <button
                disabled
                className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground/50 px-3 py-2 rounded-lg bg-secondary/60 cursor-not-allowed border border-border/40"
              >
                <Copy className="w-3.5 h-3.5" /> Copy snippet
              </button>
            ) : (
              <Button size="sm" variant="outline" className="font-bold rounded-xl" onClick={copySnippet}>
                {copied ? <CheckCheck className="w-3.5 h-3.5 mr-1.5" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
                {copied ? "Copied!" : "Copy snippet"}
              </Button>
            )}
            <Button size="sm" variant="outline" className="font-bold rounded-xl" asChild>
              <a href={widgetPreviewUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Test widget
              </a>
            </Button>
            <Button size="sm" variant="outline" className="font-bold rounded-xl" asChild>
              <a href={designerMailto}>
                <Send className="w-3.5 h-3.5 mr-1.5" /> Send to web designer
              </a>
            </Button>
          </div>
        </div>
      </PageSection>

      {/* Platform instructions */}
      <PageSection title={`Installation — ${platformMeta.label}`}>
        <button
          onClick={() => setInstructionsOpen(!instructionsOpen)}
          className="flex items-center justify-between w-full text-sm font-bold text-foreground"
        >
          <span>Step-by-step instructions</span>
          {instructionsOpen
            ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
            : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>
        {instructionsOpen && (
          <ol className="mt-4 space-y-3">
            {platformMeta.steps.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm text-muted-foreground font-medium">
                <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[11px] font-black shrink-0 mt-0.5">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        )}
      </PageSection>

      {/* How to confirm it's working */}
      <PageSection title="How to confirm the widget is working">
        <div className="space-y-3 text-sm text-muted-foreground font-medium">
          <p>
            After installing the snippet, visit your website and submit a test enquiry using the chat widget. The widget
            status above will update to <strong className="text-foreground">Connected</strong> once a real enquiry is
            received from your website.
          </p>
          <p className="text-xs">
            The status is based on real enquiry data — it is not set by simply copying the snippet.
          </p>
        </div>
      </PageSection>
    </div>
  );
}
