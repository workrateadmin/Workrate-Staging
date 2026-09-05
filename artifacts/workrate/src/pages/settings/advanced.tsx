import { Link } from "wouter";
import { Card, CardContent } from "@workspace/memphis-bold/components/ui/card";
import { Button } from "@workspace/memphis-bold/components/ui/button";
import { SettingsBreadcrumb } from "@/components/settings-breadcrumb";
import { Activity, ChevronRight, Server, Wrench, Bug, Info } from "lucide-react";

export default function AdvancedSettingsPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-16 animate-in fade-in-0 duration-500">
      <SettingsBreadcrumb items={[
        { label: "Settings", href: "/settings" },
        { label: "Advanced" },
      ]} />

      <div className="border-b border-border pb-8">
        <h1 className="text-3xl font-black tracking-tight mb-2">Advanced</h1>
        <p className="text-muted-foreground font-medium">Diagnostics, developer tools and troubleshooting for technical users.</p>
      </div>

      {/* Info notice */}
      <div className="flex items-start gap-3 rounded-xl border border-border bg-secondary/30 px-5 py-4">
        <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-sm text-muted-foreground font-medium">
          The tools on this page are intended for troubleshooting and technical investigation. They do not affect your business data or operations.
        </p>
      </div>

      {/* Diagnostics */}
      <Card className="overflow-hidden">
        <div className="px-6 py-5 border-b border-border bg-secondary/30 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Activity className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-bold">Diagnostics</h2>
            <p className="text-xs text-muted-foreground font-medium">Live environment status and connection information</p>
          </div>
        </div>
        <CardContent className="p-6 space-y-3">
          <p className="text-sm text-muted-foreground font-medium">
            View API environment, database, Clerk and system status. No secrets are exposed.
          </p>
          <Link href="/settings/advanced/diagnostics">
            <Button variant="outline" className="font-semibold gap-2">
              <Activity className="w-4 h-4" />
              Open Diagnostics
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
            </Button>
          </Link>
        </CardContent>
      </Card>

      {/* System information */}
      <Card className="overflow-hidden">
        <div className="px-6 py-5 border-b border-border bg-secondary/30 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Server className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-bold">System Information</h2>
            <p className="text-xs text-muted-foreground font-medium">Technical details about this installation</p>
          </div>
        </div>
        <CardContent className="p-6">
          <div className="divide-y divide-border/40">
            {[
              { label: "App Version", value: import.meta.env.VITE_APP_VERSION ?? "Development" },
              { label: "Environment", value: import.meta.env.MODE ?? "development" },
              { label: "API Base", value: import.meta.env.BASE_URL?.replace(/\/$/, "") || "/" },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between py-3">
                <span className="text-xs text-muted-foreground font-semibold uppercase tracking-widest">{label}</span>
                <span className="text-xs font-mono font-semibold text-foreground">{value}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Troubleshooting */}
      <Card className="overflow-hidden">
        <div className="px-6 py-5 border-b border-border bg-secondary/30 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Bug className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-bold">Troubleshooting</h2>
            <p className="text-xs text-muted-foreground font-medium">Steps to resolve common issues</p>
          </div>
        </div>
        <CardContent className="p-6 space-y-4">
          {[
            {
              title: "Widget not receiving enquiries",
              steps: [
                "Check the embed code is on the correct page.",
                "Submit a test enquiry from your website.",
                "Open Diagnostics to confirm the widget token is set.",
              ],
            },
            {
              title: "AI Receptionist not answering",
              steps: [
                "Check AI Receptionist is enabled in Communications & Integrations.",
                "Verify Vapi is connected on the AI Receptionist settings page.",
                "Check business hours configuration.",
              ],
            },
            {
              title: "Integration showing as disconnected",
              steps: [
                "Visit the integration's dedicated settings page.",
                "Re-authenticate if the connection has expired.",
                "Check the Diagnostics page for any system issues.",
              ],
            },
          ].map((item) => (
            <div key={item.title} className="p-4 rounded-xl bg-secondary/40 border border-border">
              <p className="text-sm font-bold mb-2">{item.title}</p>
              <ol className="space-y-1">
                {item.steps.map((step, i) => (
                  <li key={i} className="text-xs text-muted-foreground font-medium flex gap-2">
                    <span className="text-primary font-bold shrink-0">{i + 1}.</span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          ))}
          <div className="pt-2">
            <Link href="/settings/advanced/diagnostics">
              <Button variant="outline" size="sm" className="font-semibold gap-2">
                <Wrench className="w-3.5 h-3.5" />
                Run Diagnostics
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
