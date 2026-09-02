import { IntegrationPageHeader, StatusHeader, ComingSoonSection, PageSection } from "./shared";

export default function StripePage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-16">
      <IntegrationPageHeader
        name="Stripe"
        icon={
          <svg viewBox="0 0 24 24" className="w-4 h-4" style={{ fill: "#635BFF" }}>
            <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z"/>
          </svg>
        }
      />
      <div>
        <h1 className="text-2xl font-black tracking-tight">Stripe</h1>
        <p className="text-muted-foreground font-medium mt-1">
          Accept card payments for deposits and invoices through Stripe.
        </p>
      </div>
      <StatusHeader status="not_connected" label="Coming soon" message="This integration is not yet available." />
      <ComingSoonSection
        name="Stripe"
        description="When this integration launches, WorkRate will connect to your Stripe account so customers can pay deposits and invoices online by card. Payment status will update automatically in WorkRate. No action is needed now."
      />
      <PageSection title="What to expect">
        <ul className="space-y-2 text-sm text-muted-foreground font-medium">
          {[
            "Online card payments for deposit requests and invoices",
            "Automatic payment status sync — no manual marking needed",
            "Stripe's PCI-compliant checkout — no card data touches WorkRate",
            "Payment links embedded in proposal and invoice emails",
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
