import { Link, useLocation } from "wouter";
import { useClerk, useUser } from "@clerk/react";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Users, Settings, LogOut, Menu, Bell, Hammer, Plug } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

const pipelineNav = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Leads", href: "/enquiries", icon: Users },
];

const businessNav = [
  { name: "Integrations", href: "/integrations", icon: Plug },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar({ className }: { className?: string }) {
  const [location] = useLocation();
  const { signOut } = useClerk();
  const { user } = useUser();

  const renderNavItem = (item: any) => {
    const isActive = location === item.href || location.startsWith(item.href + "/");
    return (
      <Link
        key={item.name}
        href={item.href}
        className={cn(
          "flex items-center gap-3 px-4 h-[44px] relative rounded-md text-sm font-semibold transition-colors mx-2 mb-1",
          isActive
            ? "bg-primary/10 text-sidebar-foreground border border-primary/20 shadow-sm"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
        )}
      >
        {isActive && (
          <div className="absolute left-0 top-[10%] bottom-[10%] w-[3px] bg-primary rounded-r-full" />
        )}
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

      <div className="flex-1 overflow-y-auto py-6 flex flex-col gap-8">
        <div className="flex flex-col">
          <div className="px-6 mb-3 text-xs font-bold tracking-widest text-sidebar-foreground/40 uppercase">Pipeline</div>
          {pipelineNav.map(renderNavItem)}
        </div>

        <div className="flex flex-col">
          <div className="px-6 mb-3 text-xs font-bold tracking-widest text-sidebar-foreground/40 uppercase">Business</div>
          {businessNav.map(renderNavItem)}
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

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [location] = useLocation();

  const getPageTitle = () => {
    if (location.startsWith("/dashboard")) return "Dashboard";
    if (location.startsWith("/enquiries") && location !== "/enquiries") return "Lead Details";
    if (location.startsWith("/enquiries")) return "Leads";
    if (location.startsWith("/integrations")) return "Integrations";
    if (location.startsWith("/settings")) return "Settings";
    if (location.startsWith("/quotes")) return "Quote Editor";
    return "";
  };

  return (
    <div className="min-h-[100dvh] bg-background flex">
      {/* Desktop Sidebar */}
      <Sidebar className="hidden md:flex fixed inset-y-0 left-0 z-50 shadow-xl" />
      
      {/* Mobile Sidebar Backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      
      {/* Mobile Sidebar */}
      <Sidebar 
        className={cn(
          "fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 ease-in-out md:hidden shadow-2xl",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )} 
      />

      <div className="flex-1 flex flex-col md:pl-[260px] min-w-0">
        {/* Desktop Header */}
        <header className="hidden md:flex h-[72px] items-center justify-between px-8 bg-background border-b border-border/60 sticky top-0 z-30">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{getPageTitle()}</h1>
          <div className="flex items-center gap-4">
            <button className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-full transition-colors relative">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full border-2 border-background" />
            </button>
            {location === "/enquiries" && (
              <Button size="sm" className="font-semibold shadow-sm hover-elevate rounded-full px-5">
                New Enquiry
              </Button>
            )}
          </div>
        </header>

        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between h-16 px-4 border-b border-border/60 bg-background sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="p-2 -ml-2 text-foreground hover:bg-secondary rounded-lg">
              <Menu className="w-6 h-6" />
            </button>
            <span className="font-bold text-lg">{getPageTitle()}</span>
          </div>
          <button className="p-2 text-muted-foreground hover:text-foreground relative">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full border-2 border-background" />
          </button>
        </header>

        <main className="flex-1 py-8 px-4 sm:px-6 md:px-8 max-w-7xl mx-auto w-full">
          {children}
        </main>
      </div>
    </div>
  );
}