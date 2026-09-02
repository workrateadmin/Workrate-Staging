import { IntegrationPageHeader, StatusHeader, ComingSoonSection, PageSection } from "./shared";

export default function FacebookPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-16">
      <IntegrationPageHeader
        name="Facebook Messenger"
        icon={
          <svg viewBox="0 0 24 24" className="w-4 h-4" style={{ fill: "#1877F2" }}>
            <path d="M12 2C6.48 2 2 6.26 2 11.5c0 2.9 1.28 5.5 3.32 7.3V23l4.01-2.21c1.07.3 2.2.46 3.37.46 5.52 0 10-4.26 10-9.5S17.52 2 12 2zm1.08 12.82l-2.55-2.72-4.97 2.72 5.47-5.81 2.61 2.72 4.91-2.72-5.47 5.81z"/>
          </svg>
        }
      />
      <div>
        <h1 className="text-2xl font-black tracking-tight">Facebook Messenger</h1>
        <p className="text-muted-foreground font-medium mt-1">
          Receive and respond to Facebook Messenger enquiries directly in WorkRate.
        </p>
      </div>
      <StatusHeader status="not_connected" label="Coming soon" message="This integration is not yet available." />
      <ComingSoonSection
        name="Facebook Messenger"
        description="When this integration launches, WorkRate will connect to the Facebook Messenger Platform API so enquiries from your Facebook page flow directly into your pipeline. No action is needed now."
      />
      <PageSection title="What to expect">
        <ul className="space-y-2 text-sm text-muted-foreground font-medium">
          {[
            "Inbound Messenger enquiries routed to your WorkRate pipeline",
            "AI-assisted first response based on your trade and service area",
            "Messages appear alongside WhatsApp and phone enquiries",
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
