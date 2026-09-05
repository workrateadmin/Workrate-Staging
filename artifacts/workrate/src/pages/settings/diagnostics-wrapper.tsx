/**
 * /settings/advanced/diagnostics — canonical diagnostics page with breadcrumb.
 * /diagnostics redirects here for backwards compatibility.
 */
import DiagnosticsPage from "@/pages/diagnostics";
import { SettingsBreadcrumb } from "@/components/settings-breadcrumb";

export default function SettingsDiagnosticsWrapper() {
  return (
    <div>
      <div className="max-w-2xl mx-auto">
        <SettingsBreadcrumb items={[
          { label: "Settings", href: "/settings" },
          { label: "Advanced", href: "/settings/advanced" },
          { label: "Diagnostics" },
        ]} />
      </div>
      <DiagnosticsPage />
    </div>
  );
}
