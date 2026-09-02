import { Instagram } from "lucide-react";
import { IntegrationPageHeader, StatusHeader, ComingSoonSection, PageSection } from "./shared";

export default function InstagramPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-16">
      <IntegrationPageHeader
        name="Instagram"
        icon={
          <svg viewBox="0 0 24 24" className="w-4 h-4" style={{ fill: "#E1306C" }}>
            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
          </svg>
        }
      />
      <div>
        <h1 className="text-2xl font-black tracking-tight">Instagram Direct Messages</h1>
        <p className="text-muted-foreground font-medium mt-1">
          Receive and respond to Instagram DM enquiries directly in WorkRate.
        </p>
      </div>
      <StatusHeader status="not_connected" label="Coming soon" message="This integration is not yet available." />
      <ComingSoonSection
        name="Instagram"
        description="When this integration launches, WorkRate will connect to the Instagram Messaging API so that DMs from potential customers flow directly into your pipeline and receive an AI response. No action is needed now."
      />
      <PageSection title="What to expect">
        <ul className="space-y-2 text-sm text-muted-foreground font-medium">
          {[
            "Inbound Instagram DMs routed to your WorkRate pipeline",
            "AI-assisted responses using your WorkRate Brain settings",
            "Same enquiry workflow as WhatsApp and phone enquiries",
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
