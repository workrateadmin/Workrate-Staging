/**
 * /settings/integrations/ai-receptionist
 * Renders the existing AiReceptionist page component with breadcrumb context.
 */
import AiReceptionistPage from "@/pages/ai-receptionist";
import { SettingsBreadcrumb } from "@/components/settings-breadcrumb";

export default function SettingsAiReceptionistPage() {
  return (
    <div>
      <div className="max-w-5xl mx-auto">
        <SettingsBreadcrumb items={[
          { label: "Settings", href: "/settings" },
          { label: "Communications & Integrations", href: "/settings/integrations" },
          { label: "AI Receptionist" },
        ]} />
      </div>
      <AiReceptionistPage />
    </div>
  );
}
