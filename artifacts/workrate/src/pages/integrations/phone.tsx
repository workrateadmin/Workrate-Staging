/**
 * Phone / AI Receptionist integration page.
 * Adds the integration breadcrumb header then renders the full AI Receptionist
 * component. The Vapi technical mapping is already in that component's Setup
 * tab. /ai-receptionist remains as a backwards-compatible route in App.tsx.
 */
import { useGetAiReceptionistSettings, useGetVapiSettings } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Phone } from "lucide-react";
import AiReceptionist from "../ai-receptionist";
import { IntegrationPageHeader, StatusHeader, type ConnectionStatus } from "./shared";

export default function PhonePage() {
  const { data: settings, isLoading } = useGetAiReceptionistSettings();
  const { data: vapiSettings } = useGetVapiSettings();

  const isEnabled = settings?.enabled ?? false;
  const vapiConnected = vapiSettings?.connected ?? false;

  const status: ConnectionStatus = isLoading
    ? "loading"
    : isEnabled && vapiConnected
    ? "connected"
    : isEnabled
    ? "not_connected"
    : "not_connected";

  const statusMessage = isLoading
    ? undefined
    : isEnabled && vapiConnected
    ? "AI Receptionist is active and receiving calls via Vapi."
    : isEnabled
    ? "Receptionist is enabled but Vapi is not connected yet — complete the setup below."
    : "AI Receptionist is disabled. Enable it in the panel below.";

  return (
    <div className="pb-8">
      {/* Breadcrumb + status strip — always above the receptionist content */}
      <div className="max-w-4xl mx-auto">
        <IntegrationPageHeader
          name="Phone / AI Receptionist"
          icon={<Phone className="w-4 h-4 text-primary" />}
        />
        <div className="mb-2">
          <h1 className="text-2xl font-black tracking-tight">Phone — AI Receptionist</h1>
          <p className="text-muted-foreground font-medium mt-1 mb-4">
            Manage your AI phone receptionist. Calls are answered automatically and enquiries flow into your pipeline.
          </p>
        </div>
        {!isLoading && <StatusHeader status={status} message={statusMessage} />}
      </div>

      {/* Full AI Receptionist page content */}
      {isLoading ? (
        <div className="max-w-4xl mx-auto space-y-6">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 w-full rounded-2xl" />)}
        </div>
      ) : (
        <AiReceptionist />
      )}
    </div>
  );
}
