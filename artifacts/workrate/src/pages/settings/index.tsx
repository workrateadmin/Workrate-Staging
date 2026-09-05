import { Link } from "wouter";
import {
  Building2, Plug, CreditCard, ShieldCheck, Wrench,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent } from "@workspace/memphis-bold/components/ui/card";

const CATEGORIES = [
  {
    href: "/settings/business",
    icon: Building2,
    title: "Business",
    description: "Business details, branding, trade type, rates, quote and invoice defaults.",
  },
  {
    href: "/settings/integrations",
    icon: Plug,
    title: "Communications & Integrations",
    description: "Website widget, AI Receptionist, messaging channels, accounting and payment connections.",
  },
  {
    href: "/settings/billing",
    icon: CreditCard,
    title: "Billing",
    description: "Subscription plan, add-ons, usage limits, AI top-ups and payment method.",
  },
  {
    href: "/settings/account",
    icon: ShieldCheck,
    title: "Account & Security",
    description: "Account details, authentication, team access, data export and privacy controls.",
  },
  {
    href: "/settings/advanced",
    icon: Wrench,
    title: "Advanced",
    description: "Diagnostics, connection information, developer tools and troubleshooting.",
  },
];

export default function SettingsLanding() {
  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-16 animate-in fade-in-0 duration-500">
      {/* Page header */}
      <div className="border-b border-border pb-8">
        <h1 className="text-3xl font-black tracking-tight mb-2">Settings</h1>
        <p className="text-muted-foreground font-medium">
          Configure your business, integrations, billing and account preferences.
        </p>
      </div>

      {/* Category cards */}
      <div className="space-y-3">
        {CATEGORIES.map((cat) => (
          <Link key={cat.href} href={cat.href}>
            <Card className="hover:shadow-md transition-all duration-200 cursor-pointer group">
              <CardContent className="p-6 flex items-center gap-5 min-w-0">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <cat.icon className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="font-bold text-base text-foreground mb-0.5">{cat.title}</h2>
                  <p className="text-sm text-muted-foreground font-medium leading-relaxed">{cat.description}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground/40 shrink-0 group-hover:text-muted-foreground transition-colors" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
