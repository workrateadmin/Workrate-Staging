import { IntegrationPageHeader, StatusHeader, ComingSoonSection, PageSection } from "./shared";

export default function QuickBooksPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-16">
      <IntegrationPageHeader
        name="QuickBooks"
        icon={
          <svg viewBox="0 0 24 24" className="w-4 h-4" style={{ fill: "#2CA01C" }}>
            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm-1.5 17.25a4.5 4.5 0 110-9 4.5 4.5 0 010 9zm0-7.5a3 3 0 100 6 3 3 0 000-6zm7.5 4.5h-1.5a4.5 4.5 0 00-4.5-4.5V8.25a6 6 0 016 6z"/>
          </svg>
        }
      />
      <div>
        <h1 className="text-2xl font-black tracking-tight">QuickBooks</h1>
        <p className="text-muted-foreground font-medium mt-1">
          Sync invoices and payments with your QuickBooks account.
        </p>
      </div>
      <StatusHeader status="not_connected" label="Coming soon" message="This integration is not yet available." />
      <ComingSoonSection
        name="QuickBooks"
        description="When this integration launches, WorkRate will sync accepted invoices and recorded payments to your QuickBooks account automatically. No action is needed now."
      />
      <PageSection title="What to expect">
        <ul className="space-y-2 text-sm text-muted-foreground font-medium">
          {[
            "Automatic sync of accepted WorkRate invoices to QuickBooks Online",
            "Payment status updates reflected in both systems",
            "Customer records sync to QuickBooks contacts",
            "No manual re-keying required",
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
