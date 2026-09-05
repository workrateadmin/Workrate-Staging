/**
 * /settings/billing — wraps existing BillingPage with breadcrumb navigation.
 */
import BillingPage from "@/pages/settings/billing";
import { SettingsBreadcrumb } from "@/components/settings-breadcrumb";

export default function SettingsBillingWrapper() {
  return (
    <div>
      <div className="max-w-4xl mx-auto">
        <SettingsBreadcrumb items={[
          { label: "Settings", href: "/settings" },
          { label: "Billing" },
        ]} />
      </div>
      <BillingPage />
    </div>
  );
}
