import { Link, useLocation } from "wouter";
import { useClerk, useUser } from "@clerk/react";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Settings, LogOut, Menu, Bell, Hammer,
  Briefcase, CalendarDays, Search, Plus,
  ChevronDown, Inbox, FileText, WalletCards, Quote,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SetupBanner } from "@/components/setup-banner";

// ── ONLY everyday operational destinations in the top nav ────────────────────
const topNavItems = [
  { name: "Dashboard",  href: "/dashboard",  icon: LayoutDashboard },
  { name: "Enquiries",  href: "/enquiries",  icon: Inbox },
  { name: "Jobs",       href: "/jobs",       icon: Briefcase },
  { name: "Schedule",   href: "/schedule",   icon: CalendarDays },
  { name: "Quotes",     href: "/quotes",     icon: Quote },
  { name: "Invoices",   href: "/invoices",   icon: FileText },
  { name: "Finance",    href: "/finance",    icon: WalletCards },
];

// ── Drawer nav items — same operational list as top nav, plus Settings ───────
const drawerWorkItems = topNavItems;

/* ── Mobile drawer sidebar ─────────────────────────────────────────────────── */
export function Sidebar({ className, onClose }: { className?: string; onClose?: () => void }) {
  const [location] = useLocation();
  const { signOut } = useClerk();
  const { user } = useUser();

  const renderNavItem = (item: { name: string; href: string; icon: any }) => {
    const isActive = location === item.href ||
      (item.href !== "/settings" && location.startsWith(item.href + "/"));
    return (
      <Link
        key={item.name}
        href={item.href}
        onClick={onClose}
        className={cn(
          "flex items-center gap-3 px-4 h-[44px] relative rounded-md text-sm font-semibold transition-colors mx-2 mb-1",
          isActive
            ? "bg-primary/10 text-sidebar-foreground border border-primary/20 shadow-sm"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
        )}
      >
        {isActive && <div className="absolute left-0 top-[10%] bottom-[10%] w-[3px] bg-primary rounded-r-full" />}
        <item.icon className={cn("w-5 h-5", isActive ? "text-primary" : "text-sidebar-foreground/50")} />
        {item.name}
      </Link>
    );
  };

  return (
    <div className={cn("flex h-full w-[260px] flex-col bg-sidebar border-r border-sidebar-border text-sidebar-foreground", className)}>
      <div className="flex h-[72px] items-center px-6">
        <Link href="/dashboard" className="flex items-center gap-2.5 hover:opacity-90 transition-opacity">
          <div className="bg-primary text-primary-foreground p-1.5 rounded-lg shadow-sm">
            <Hammer className="w-5 h-5" />
          </div>
          <span className="font-bold text-xl tracking-tight">WorkRate</span>
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto py-6 flex flex-col gap-6">
        {/* Workflow */}
        <div className="flex flex-col">
          <div className="px-6 mb-3 text-xs font-bold tracking-widest text-sidebar-foreground/40 uppercase">Workflow</div>
          {drawerWorkItems.map(renderNavItem)}
        </div>

        {/* Settings */}
        <div className="flex flex-col">
          <div className="px-6 mb-3 text-xs font-bold tracking-widest text-sidebar-foreground/40 uppercase">Settings</div>
          {renderNavItem({ name: "Settings", href: "/settings", icon: Settings })}
        </div>
      </div>

      <div className="p-4 mt-auto">
        <div className="bg-sidebar-accent/50 rounded-xl p-2 flex items-center justify-between shadow-sm border border-sidebar-border">
          <div className="flex items-center gap-3 px-2 py-1 min-w-0">
            <div className="w-9 h-9 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary font-bold text-sm shrink-0">
              {user?.firstName?.charAt(0) || user?.primaryEmailAddress?.emailAddress?.charAt(0)?.toUpperCase() || "U"}
            </div>
            <div className="flex-col flex min-w-0">
              <span className="text-sm font-semibold truncate text-sidebar-foreground">{user?.fullName || "User"}</span>
              <span className="text-xs text-sidebar-foreground/60 truncate">{user?.primaryEmailAddress?.emailAddress}</span>
            </div>
          </div>
          <button
            onClick={() => signOut({ redirectUrl: "/" })}
            className="p-2 shrink-0 rounded-lg text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors mr-1"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Horizontal top navigation bar ───────────────────────────────────────── */
export function TopNav({ onMenuClick }: { onMenuClick: () => void }) {
  const [location] = useLocation();
  const { user } = useUser();
  const [, navigate] = useLocation();

  const isItemActive = (item: typeof topNavItems[number]) => {
    if (item.href === "/settings") return location === "/settings";
    return location === item.href || location.startsWith(item.href + "/");
  };

  return (
    <header className="h-[60px] bg-sidebar border-b border-sidebar-border flex items-center px-4 xl:px-6 sticky top-0 z-50 shrink-0">
      {/* Hamburger — visible below xl where the full nav is hidden */}
      <button
        onClick={onMenuClick}
        className="xl:hidden p-2 -ml-1 mr-2 text-sidebar-foreground/60 hover:text-sidebar-foreground rounded-lg hover:bg-sidebar-accent transition-colors"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Logo */}
      <Link href="/dashboard" className="flex items-center gap-2 mr-6 shrink-0 hover:opacity-90 transition-opacity">
        <div className="bg-primary text-primary-foreground p-1.5 rounded-lg shadow-sm">
          <Hammer className="w-[18px] h-[18px]" />
        </div>
        <span className="font-black text-[17px] text-sidebar-foreground tracking-tight leading-none">WorkRate</span>
      </Link>

      {/* Nav links — only shown at xl+ where all 7 items comfortably fit */}
      <nav className="hidden xl:flex items-center gap-0.5 flex-1 min-w-0">
        {topNavItems.map((item) => {
          const isActive = isItemActive(item);
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-[7px] h-9 px-3 rounded-lg text-[13px] font-semibold transition-colors relative shrink-0 whitespace-nowrap",
                isActive
                  ? "bg-primary/[0.14] text-sidebar-foreground"
                  : "text-sidebar-foreground/55 hover:text-sidebar-foreground hover:bg-sidebar-accent"
              )}
            >
              <item.icon className={cn("w-[15px] h-[15px] shrink-0", isActive ? "text-primary" : "text-sidebar-foreground/40")} />
              {item.name}
              {isActive && (
                <span className="absolute bottom-[-12px] left-3 right-3 h-[2px] bg-primary rounded-full" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Right side controls */}
      <div className="flex items-center gap-2 ml-auto shrink-0">
        {/* Search field — only shown at 2xl where there is space beside the nav */}
        <div className="hidden 2xl:flex items-center gap-2 bg-sidebar-accent/60 border border-sidebar-border rounded-lg h-[34px] px-3 w-[180px] cursor-text">
          <Search className="w-3.5 h-3.5 text-sidebar-foreground/40 shrink-0" />
          <span className="text-[12.5px] text-sidebar-foreground/35 font-normal select-none">Search…</span>
        </div>

        {/* New Enquiry */}
        <Link href="/enquiries">
          <Button size="sm" className="h-[34px] px-2.5 xl:px-3.5 text-[12.5px] font-bold gap-1.5 shadow-none rounded-lg">
            <Plus className="w-[14px] h-[14px]" />
            <span className="hidden sm:inline">New Enquiry</span>
          </Button>
        </Link>

        {/* Bell */}
        <button className="w-[34px] h-[34px] rounded-lg bg-sidebar-accent/60 flex items-center justify-center text-sidebar-foreground/55 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors relative">
          <Bell className="w-4 h-4" />
          <span className="absolute top-[7px] right-[7px] w-[7px] h-[7px] bg-primary rounded-full border-[1.5px] border-sidebar" />
        </button>

        {/* User avatar — clicking opens settings */}
        <button
          onClick={() => navigate("/settings")}
          className="flex items-center gap-2 pl-1 text-sidebar-foreground/70 hover:text-sidebar-foreground transition-colors"
          title="Settings"
        >
          <div className="w-[30px] h-[30px] rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-black shrink-0">
            {user?.firstName?.charAt(0) || user?.primaryEmailAddress?.emailAddress?.charAt(0)?.toUpperCase() || "U"}
          </div>
          <span className="hidden xl:block text-[12.5px] font-semibold max-w-[110px] truncate">
            {user?.fullName || user?.firstName || "Account"}
          </span>
          <ChevronDown className="hidden xl:block w-3 h-3 text-sidebar-foreground/40 shrink-0" />
        </button>
      </div>
    </header>
  );
}

/* ── Root app layout ──────────────────────────────────────────────────────── */
export function AppLayout({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <TopNav onMenuClick={() => setDrawerOpen(true)} />

      {/* Drawer backdrop — below xl only, coherent with hamburger visibility */}
      {drawerOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 xl:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Sidebar drawer — below xl only, coherent with hamburger visibility */}
      <Sidebar
        className={cn(
          "fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 ease-in-out xl:hidden shadow-2xl",
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        )}
        onClose={() => setDrawerOpen(false)}
      />

      {/* Post-onboarding setup checklist */}
      <SetupBanner />

      {/* Page content */}
      <main className="flex-1 py-8 px-4 sm:px-6 md:px-8 w-full">
        {children}
      </main>
    </div>
  );
}
