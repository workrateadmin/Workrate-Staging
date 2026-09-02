import { Mail } from "lucide-react";
import { IntegrationPageHeader, StatusHeader, ComingSoonSection, PageSection } from "./shared";

export default function EmailIntegrationPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-16">
      <IntegrationPageHeader
        name="Email"
        icon={<Mail className="w-4 h-4" style={{ color: "#EA4335" }} />}
      />
      <div>
        <h1 className="text-2xl font-black tracking-tight">Email</h1>
        <p className="text-muted-foreground font-medium mt-1">
          Receive and triage email enquiries directly inside WorkRate.
        </p>
      </div>
      <StatusHeader status="not_connected" label="Coming soon" message="This integration is not yet available." />
      <ComingSoonSection
        name="Email"
        description="When this integration launches, WorkRate will connect to an inbound email address so enquiries sent by customers are automatically parsed and added to your pipeline. No action is needed now."
      />
      <PageSection title="What to expect">
        <ul className="space-y-2 text-sm text-muted-foreground font-medium">
          {[
            "Dedicated inbound email address for your WorkRate account",
            "Automatic parsing of project type, contact details, and urgency",
            "AI-assisted response using your business settings",
            "Enquiries appear alongside phone, WhatsApp, and widget leads",
          ].map((item) => (
            <li key={item} className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      </PageSection>
    </div>
  );
}
