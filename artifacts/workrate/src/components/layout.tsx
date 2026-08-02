import { Link, useLocation } from "wouter";
import { useClerk } from "@clerk/react";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Inbox, FileText, Settings, LogOut, Wrench, Menu } from "lucide-react";
import { useState } from "react";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Enquiries", href: "/enquiries", icon: Inbox },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar({ className }: { className?: string }) {
  const [location] = useLocation();
  const { signOut } = useClerk();

  return (
    <div className={cn("flex h-full w-64 flex-col bg-sidebar border-r border-sidebar-border text-sidebar-foreground", className)}>
      <div className="flex h-16 items-center px-6 border-b border-sidebar-border/20">
        <Link href="/dashboard" className="flex items-center gap-2 font-bold text-lg hover:text-primary transition-colors">
          <Wrench className="w-5 h-5 text-primary" />
          <span>WorkRate</span>
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto py-6 px-4 flex flex-col gap-1">
        {navigation.map((item) => {
          const isActive = location === item.href || location.startsWith(item.href + "/");
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "hover:bg-sidebar-accent/50 text-sidebar-foreground/80 hover:text-sidebar-foreground"
              )}
            >
              <item.icon className={cn("w-4 h-4", isActive ? "text-primary" : "text-sidebar-foreground/60")} />
              {item.name}
            </Link>
          );
        })}
      </div>

      <div className="p-4 border-t border-sidebar-border/20">
        <button
          onClick={() => signOut({ redirectUrl: "/" })}
          className="flex w-full items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors"
        >
          <LogOut className="w-4 h-4 text-sidebar-foreground/60" />
          Sign Out
        </button>
      </div>
    </div>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop Sidebar */}
      <Sidebar className="hidden md:flex fixed inset-y-0 left-0 z-50" />
      
      {/* Mobile Sidebar Backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      
      {/* Mobile Sidebar */}
      <Sidebar 
        className={cn(
          "fixed inset-y-0 left-0 z-50 transform transition-transform duration-200 ease-in-out md:hidden",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )} 
      />

      <div className="flex-1 flex flex-col md:pl-64 min-w-0">
        {/* Mobile Header */}
        <div className="md:hidden flex items-center justify-between h-16 px-4 border-b bg-card">
          <Link href="/dashboard" className="flex items-center gap-2 font-bold">
            <Wrench className="w-5 h-5 text-primary" />
            <span>WorkRate</span>
          </Link>
          <button onClick={() => setSidebarOpen(true)} className="p-2 -mr-2">
            <Menu className="w-6 h-6" />
          </button>
        </div>

        <main className="flex-1 py-8 px-4 sm:px-6 md:px-8 max-w-7xl mx-auto w-full">
          {children}
        </main>
      </div>
    </div>
  );
}
