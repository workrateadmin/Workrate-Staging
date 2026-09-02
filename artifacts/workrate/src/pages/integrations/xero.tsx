import { IntegrationPageHeader, StatusHeader, ComingSoonSection, PageSection } from "./shared";

export default function XeroPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-16">
      <IntegrationPageHeader
        name="Xero"
        icon={
          <svg viewBox="0 0 24 24" className="w-4 h-4" style={{ fill: "#13B5EA" }}>
            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 15.117l-1.77 1.77-2.124-2.124-2.124 2.124-1.77-1.77 2.124-2.124-2.124-2.124 1.77-1.77 2.124 2.124 2.124-2.124 1.77 1.77-2.124 2.124 2.124 2.124z"/>
          </svg>
        }
      />
      <div>
        <h1 className="text-2xl font-black tracking-tight">Xero</h1>
        <p className="text-muted-foreground font-medium mt-1">
          Sync invoices and payments with your Xero account.
        </p>
      </div>
      <StatusHeader status="not_connected" label="Coming soon" message="This integration is not yet available." />
      <ComingSoonSection
        name="Xero"
        description="When this integration launches, WorkRate will sync accepted invoices and recorded payments to your Xero account automatically, reducing manual bookkeeping. No action is needed now."
      />
      <PageSection title="What to expect">
        <ul className="space-y-2 text-sm text-muted-foreground font-medium">
          {[
            "Automatic sync of accepted WorkRate invoices to Xero",
            "Payment status updates reflected in both systems",
            "Customer contact sync to Xero contacts",
            "No manual data entry required",
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
