import { useUser, useClerk } from "@clerk/react";
import { useGetCompany } from "@workspace/api-client-react";
import { Card, CardContent } from "@workspace/memphis-bold/components/ui/card";
import { Button } from "@workspace/memphis-bold/components/ui/button";
import { Skeleton } from "@workspace/memphis-bold/components/ui/skeleton";
import { SettingsBreadcrumb } from "@/components/settings-breadcrumb";
import {
  User, ShieldCheck, Mail, Building2,
  Users, Download, Lock, AlertTriangle, ChevronRight,
} from "lucide-react";

export default function AccountSettingsPage() {
  const { user, isLoaded } = useUser();
  const { openUserProfile } = useClerk();
  const { data: company, isLoading: companyLoading } = useGetCompany();

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-16 animate-in fade-in-0 duration-500">
      <SettingsBreadcrumb items={[
        { label: "Settings", href: "/settings" },
        { label: "Account & Security" },
      ]} />

      <div className="border-b border-border pb-8">
        <h1 className="text-3xl font-black tracking-tight mb-2">Account & Security</h1>
        <p className="text-muted-foreground font-medium">Manage your account, authentication and privacy settings.</p>
      </div>

      {/* Account details */}
      <Card className="overflow-hidden">
        <div className="px-6 py-5 border-b border-border bg-secondary/30 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-bold">Account Details</h2>
            <p className="text-xs text-muted-foreground font-medium">Your personal account information</p>
          </div>
        </div>
        <CardContent className="p-6">
          {!isLoaded ? (
            <div className="space-y-3">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3 py-3 border-b border-border/40">
                <User className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-muted-foreground font-semibold uppercase tracking-widest mb-0.5">Full Name</div>
                  <div className="font-semibold text-sm">{user?.fullName || "—"}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 py-3 border-b border-border/40">
                <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-muted-foreground font-semibold uppercase tracking-widest mb-0.5">Email</div>
                  <div className="font-semibold text-sm truncate">{user?.primaryEmailAddress?.emailAddress || "—"}</div>
                </div>
              </div>
              {companyLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : company && (
                <div className="flex items-center gap-3 py-3 border-b border-border/40">
                  <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground font-semibold uppercase tracking-widest mb-0.5">Company</div>
                    <div className="font-semibold text-sm">{company.name || "—"}</div>
                  </div>
                </div>
              )}
              <Button
                variant="outline"
                className="font-semibold gap-2"
                onClick={() => openUserProfile()}
              >
                <User className="w-4 h-4" />
                Edit Account Details
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Authentication & Security */}
      <Card className="overflow-hidden">
        <div className="px-6 py-5 border-b border-border bg-secondary/30 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <ShieldCheck className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-bold">Authentication & Security</h2>
            <p className="text-xs text-muted-foreground font-medium">Password, two-factor and session management</p>
          </div>
        </div>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-start gap-3 p-4 rounded-xl bg-secondary/40 border border-border">
            <Lock className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Password & Two-Factor Authentication</p>
              <p className="text-xs text-muted-foreground mt-0.5">Manage via your account profile.</p>
            </div>
            <Button size="sm" variant="outline" className="font-semibold gap-1.5 shrink-0" onClick={() => openUserProfile()}>
              Manage
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
          <div className="flex items-start gap-3 p-4 rounded-xl bg-secondary/40 border border-border">
            <ShieldCheck className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Connected Accounts & Sessions</p>
              <p className="text-xs text-muted-foreground mt-0.5">View active sessions and connected providers.</p>
            </div>
            <Button size="sm" variant="outline" className="font-semibold gap-1.5 shrink-0" onClick={() => openUserProfile()}>
              View
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Team / Users — prepared space */}
      <Card className="overflow-hidden">
        <div className="px-6 py-5 border-b border-border bg-secondary/30 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
            <Users className="w-4 h-4 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-base font-bold">Team & Users</h2>
            <p className="text-xs text-muted-foreground font-medium">Invite team members and manage access</p>
          </div>
        </div>
        <CardContent className="p-6">
          <div className="text-center py-6 border border-dashed border-border rounded-xl bg-secondary/20">
            <Users className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="font-semibold text-sm text-foreground">Team management coming soon</p>
            <p className="text-xs text-muted-foreground mt-1">Invite team members, set roles and control access to your WorkRate account.</p>
          </div>
        </CardContent>
      </Card>

      {/* Data & Privacy */}
      <Card className="overflow-hidden">
        <div className="px-6 py-5 border-b border-border bg-secondary/30 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Download className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-bold">Data & Privacy</h2>
            <p className="text-xs text-muted-foreground font-medium">Export your data and manage privacy controls</p>
          </div>
        </div>
        <CardContent className="p-6">
          <div className="flex items-start gap-3 p-4 rounded-xl bg-secondary/40 border border-border">
            <Download className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Export Your Data</p>
              <p className="text-xs text-muted-foreground mt-0.5">Download a copy of your enquiries, jobs and invoices.</p>
            </div>
            <Button size="sm" variant="outline" className="font-semibold shrink-0" disabled>
              Coming soon
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card className="overflow-hidden border-destructive/30">
        <div className="px-6 py-5 border-b border-destructive/20 bg-destructive/5 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="w-4 h-4 text-destructive" />
          </div>
          <div>
            <h2 className="text-base font-bold text-destructive">Danger Zone</h2>
            <p className="text-xs text-muted-foreground font-medium">Irreversible account actions</p>
          </div>
        </div>
        <CardContent className="p-6">
          <div className="flex items-start gap-3 p-4 rounded-xl border border-destructive/20 bg-destructive/5">
            <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-destructive">Delete Account</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Permanently delete your WorkRate account and all associated data. This action cannot be undone. Contact support to proceed.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
