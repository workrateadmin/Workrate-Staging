import { Link, useLocation } from "wouter";
import { useClerk, useUser } from "@clerk/react";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Inbox, Settings, LogOut, Menu, Bell, Hammer } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

const pipelineNav = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Enquiries", href: "/enquiries", icon: Inbox },
];

const businessNav = [
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
          "flex items-center gap-3 px-3 h-[44px] relative rounded-r-md text-sm font-medium transition-colors",
          isActive
            ? "bg-primary/10 text-sidebar-foreground"
            : "hover:bg-white/5 text-sidebar-foreground/80 hover:text-sidebar-foreground"
        )}
      >
        {isActive && (
          <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary rounded-r-full" />
        )}
        <item.icon className={cn("w-5 h-5", isActive ? "text-primary" : "text-sidebar-foreground/60")} />
        {item.name}
      </Link>
    );
  };

  return (
    <div className={cn("flex h-full w-64 flex-col bg-sidebar border-r border-sidebar-border text-sidebar-foreground", className)}>
      <div className="flex h-16 items-center px-6 border-b border-white/10">
        <Link href="/dashboard" className="flex items-center gap-2 font-black tracking-tight text-xl hover:text-primary transition-colors">
          <div className="bg-primary text-primary-foreground p-1 rounded-md">
            <Hammer className="w-4 h-4" />
          </div>
          <span>WorkRate</span>
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto py-6 flex flex-col gap-6">
        <div className="px-3 flex flex-col gap-1">
          <div className="px-3 mb-2 text-xs font-bold tracking-wider text-sidebar-foreground/40 uppercase">Pipeline</div>
          {pipelineNav.map(renderNavItem)}
        </div>

        <div className="px-3 flex flex-col gap-1">
          <div className="px-3 mb-2 text-xs font-bold tracking-wider text-sidebar-foreground/40 uppercase">Business</div>
          {businessNav.map(renderNavItem)}
        </div>
      </div>

      <div className="p-4 border-t border-white/10 bg-black/20">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 px-2">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">
              {user?.firstName?.charAt(0) || user?.primaryEmailAddress?.emailAddress?.charAt(0)?.toUpperCase() || "U"}
            </div>
            <div className="flex-col flex min-w-0">
              <span className="text-sm font-semibold truncate">{user?.fullName || "User"}</span>
              <span className="text-xs text-sidebar-foreground/60 truncate">{user?.primaryEmailAddress?.emailAddress}</span>
            </div>
          </div>
          <button
            onClick={() => signOut({ redirectUrl: "/" })}
            className="flex w-full items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-sidebar-foreground/80 hover:bg-white/5 hover:text-sidebar-foreground transition-colors"
          >
            <LogOut className="w-4 h-4 text-sidebar-foreground/60" />
            Sign Out
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
    if (location.startsWith("/enquiries")) return "Enquiries";
    if (location.startsWith("/settings")) return "Settings";
    if (location.startsWith("/quotes")) return "Quote Editor";
    return "";
  };

  return (
    <div className="min-h-[100dvh] bg-background flex">
      {/* Desktop Sidebar */}
      <Sidebar className="hidden md:flex fixed inset-y-0 left-0 z-50" />
      
      {/* Mobile Sidebar Backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-sidebar/80 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      
      {/* Mobile Sidebar */}
      <Sidebar 
        className={cn(
          "fixed inset-y-0 left-0 z-50 transform transition-transform duration-200 ease-in-out md:hidden shadow-2xl",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )} 
      />

      <div className="flex-1 flex flex-col md:pl-64 min-w-0">
        {/* Desktop Header */}
        <header className="hidden md:flex h-16 items-center justify-between px-8 bg-background border-b border-border/50 sticky top-0 z-30">
          <h1 className="text-xl font-bold">{getPageTitle()}</h1>
          <div className="flex items-center gap-4">
            <button className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-full transition-colors">
              <Bell className="w-5 h-5" />
            </button>
            {location === "/enquiries" && (
              <Button size="sm" className="font-semibold shadow-sm hover-elevate">New Enquiry</Button>
            )}
          </div>
        </header>

        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between h-16 px-4 border-b border-border/50 bg-background sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="p-2 -ml-2 text-foreground">
              <Menu className="w-6 h-6" />
            </button>
            <span className="font-bold text-lg">{getPageTitle()}</span>
          </div>
          <button className="p-2 text-muted-foreground hover:text-foreground">
            <Bell className="w-5 h-5" />
          </button>
        </header>

        <main className="flex-1 py-8 px-4 sm:px-6 md:px-8 max-w-6xl mx-auto w-full">
          {children}
        </main>
      </div>
    </div>
  );
}
