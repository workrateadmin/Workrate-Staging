import {
  LayoutDashboard,
  Inbox,
  Settings,
  LogOut,
  Bell,
  Hammer,
  ChevronRight,
  TrendingUp,
  ArrowUpRight,
  MapPin,
  Briefcase,
  Calendar,
  Wrench,
} from "lucide-react";

const SIDEBAR_ITEMS = [
  { label: "PIPELINE", items: [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, active: true },
    { name: "Enquiries", href: "/enquiries", icon: Inbox, badge: 2 },
  ]},
  { label: "BUSINESS", items: [
    { name: "Settings", href: "/settings", icon: Settings },
  ]},
];

const RECENT_JOBS = [
  { id: 1, name: "John Smith", type: "Fitted Wardrobes", location: "Didsbury, Manchester", date: "Today, 2h ago", status: "new_enquiry", initials: "JS" },
  { id: 2, name: "Michael Byrne", type: "Commercial Fit-out", location: "Manchester City Centre", date: "Today, 5h ago", status: "survey_required", initials: "MB" },
  { id: 3, name: "Sarah Thornton", type: "Kitchen Installation", location: "Chorlton, Manchester", date: "Yesterday", status: "reviewing", initials: "ST" },
  { id: 4, name: "David Ashworth", type: "Staircase Renovation", location: "Sale, Manchester", date: "3 days ago", status: "quote_sent", initials: "DA" },
  { id: 5, name: "Emma Wilson", type: "Home Office", location: "Altrincham", date: "7 days ago", status: "won", initials: "EW" },
];

const STATUS_CONFIG: Record<string, { label: string; bar: string; badge: string; text: string }> = {
  new_enquiry:     { label: "New",            bar: "#3b82f6", badge: "#eff6ff", text: "#1e40af" },
  reviewing:       { label: "Reviewing",      bar: "#f59e0b", badge: "#fffbeb", text: "#92400e" },
  survey_required: { label: "Survey Req.",    bar: "#f59e0b", badge: "#fffbeb", text: "#92400e" },
  quote_sent:      { label: "Quote Sent",     bar: "#8b5cf6", badge: "#f5f3ff", text: "#5b21b6" },
  won:             { label: "Won",            bar: "#10b981", badge: "#ecfdf5", text: "#065f46" },
  lost:            { label: "Lost",           bar: "#ef4444", badge: "#fef2f2", text: "#991b1b" },
};

export function Refined() {
  return (
    <div style={{ width: 1920, height: 1080, display: "flex", fontFamily: "'Plus Jakarta Sans', sans-serif", background: "hsl(40 20% 98%)" }}>

      {/* ─── Sidebar ─────────────────────────────────────────────────── */}
      <aside style={{ width: 256, flexShrink: 0, display: "flex", flexDirection: "column", background: "hsl(222 47% 8%)", borderRight: "1px solid rgba(255,255,255,0.06)" }}>

        {/* Logo */}
        <div style={{ height: 64, display: "flex", alignItems: "center", padding: "0 24px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ background: "hsl(24 95% 53%)", borderRadius: 8, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Hammer size={16} color="white" />
            </div>
            <span style={{ fontWeight: 900, fontSize: 18, color: "white", letterSpacing: "-0.02em" }}>WorkRate</span>
          </div>
        </div>

        {/* Nav */}
        <div style={{ flex: 1, padding: "20px 12px", display: "flex", flexDirection: "column", gap: 24 }}>
          {SIDEBAR_ITEMS.map((section) => (
            <div key={section.label}>
              <div style={{ padding: "0 12px 8px", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "rgba(210,220,240,0.35)", textTransform: "uppercase" }}>{section.label}</div>
              {section.items.map((item) => (
                <div key={item.name} style={{ position: "relative", display: "flex", alignItems: "center", height: 44, padding: "0 12px", borderRadius: "0 6px 6px 0", gap: 10, cursor: "pointer", background: item.active ? "rgba(255,110,30,0.12)" : "transparent", marginBottom: 2 }}>
                  {item.active && <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: "hsl(24 95% 53%)", borderRadius: "0 3px 3px 0" }} />}
                  <item.icon size={18} color={item.active ? "hsl(24 95% 53%)" : "rgba(210,220,240,0.55)"} />
                  <span style={{ fontSize: 13.5, fontWeight: item.active ? 700 : 500, color: item.active ? "white" : "rgba(210,220,240,0.7)", flex: 1 }}>{item.name}</span>
                  {"badge" in item && item.badge ? (
                    <div style={{ background: "hsl(24 95% 53%)", color: "white", borderRadius: 10, fontSize: 10, fontWeight: 800, padding: "1px 6px", minWidth: 18, textAlign: "center" }}>{item.badge}</div>
                  ) : null}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* User */}
        <div style={{ padding: 16, borderTop: "1px solid rgba(255,255,255,0.07)", background: "rgba(0,0,0,0.2)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 4px 12px" }}>
            <div style={{ width: 34, height: 34, borderRadius: "50%", background: "hsl(24 95% 53%)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, color: "white", flexShrink: 0 }}>H</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "white", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Hartley Joinery</div>
              <div style={{ fontSize: 11, color: "rgba(210,220,240,0.5)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>info@hartleyjoinery.co.uk</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 6, cursor: "pointer" }}>
            <LogOut size={14} color="rgba(210,220,240,0.45)" />
            <span style={{ fontSize: 12.5, color: "rgba(210,220,240,0.5)", fontWeight: 500 }}>Sign Out</span>
          </div>
        </div>
      </aside>

      {/* ─── Main ────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        {/* Top bar */}
        <header style={{ height: 64, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 40px", background: "hsl(40 20% 98%)", borderBottom: "1px solid hsl(35 15% 88%)", flexShrink: 0 }}>
          <h1 style={{ fontSize: 18, fontWeight: 800, color: "hsl(224 47% 11%)", letterSpacing: "-0.02em" }}>Dashboard</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <Bell size={18} color="hsl(30 8% 55%)" />
            </div>
          </div>
        </header>

        {/* Content */}
        <main style={{ flex: 1, padding: "36px 40px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 28 }}>

          {/* Stat cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
            {[
              { label: "New Enquiries",   value: 2, delta: "+2 this week", barColor: "#3b82f6", bgColor: "#eff6ff" },
              { label: "In Progress",     value: 2, delta: "1 survey needed", barColor: "#f59e0b", bgColor: "#fffbeb" },
              { label: "Quotes Sent",     value: 1, delta: "£1,644 pending", barColor: "#8b5cf6", bgColor: "#f5f3ff" },
              { label: "Jobs Won",        value: 1, delta: "+£3,750 value", barColor: "#10b981", bgColor: "#ecfdf5" },
            ].map((s, i) => (
              <div key={i} style={{ background: "white", borderRadius: 10, border: "1px solid hsl(35 15% 88%)", borderLeft: `3px solid ${s.barColor}`, padding: "20px 22px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "hsl(30 8% 52%)", letterSpacing: "0.06em", textTransform: "uppercase" }}>{s.label}</div>
                <div style={{ fontSize: 42, fontWeight: 900, color: "hsl(224 47% 11%)", lineHeight: 1, letterSpacing: "-0.03em" }}>{s.value}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ background: s.bgColor, color: s.barColor, borderRadius: 4, fontSize: 10.5, fontWeight: 700, padding: "2px 6px" }}>{s.delta}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Two columns */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 24, flex: 1 }}>

            {/* Recent jobs */}
            <div style={{ background: "white", borderRadius: 12, border: "1px solid hsl(35 15% 88%)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px 16px", borderBottom: "1px solid hsl(35 15% 91%)" }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: "hsl(224 47% 11%)", letterSpacing: "-0.01em" }}>Recent Jobs</span>
                <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12.5, fontWeight: 700, color: "hsl(24 95% 53%)", cursor: "pointer" }}>
                  View pipeline <ChevronRight size={14} />
                </div>
              </div>

              <div style={{ flex: 1 }}>
                {RECENT_JOBS.map((job, i) => {
                  const cfg = STATUS_CONFIG[job.status];
                  return (
                    <div key={job.id} style={{ display: "flex", alignItems: "center", padding: "14px 24px", borderBottom: i < RECENT_JOBS.length - 1 ? "1px solid hsl(35 15% 93%)" : "none", gap: 14, cursor: "pointer", transition: "background 0.15s" }}>
                      {/* Status bar */}
                      <div style={{ width: 3, height: 40, borderRadius: 2, background: cfg.bar, flexShrink: 0 }} />
                      {/* Avatar */}
                      <div style={{ width: 38, height: 38, borderRadius: "50%", background: `${cfg.bar}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12.5, fontWeight: 800, color: cfg.bar, flexShrink: 0 }}>{job.initials}</div>
                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 14, fontWeight: 800, color: "hsl(224 47% 11%)" }}>{job.name}</span>
                          <span style={{ background: cfg.badge, color: cfg.text, borderRadius: 4, fontSize: 10, fontWeight: 800, padding: "2px 7px", textTransform: "uppercase", letterSpacing: "0.04em" }}>{cfg.label}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "hsl(30 8% 52%)", fontWeight: 500 }}>
                            <Briefcase size={11} color="hsl(30 8% 62%)" />{job.type}
                          </span>
                          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "hsl(30 8% 52%)", fontWeight: 500 }}>
                            <MapPin size={11} color="hsl(30 8% 62%)" />{job.location}
                          </span>
                        </div>
                      </div>
                      {/* Date + arrow */}
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11.5, color: "hsl(30 8% 60%)", fontWeight: 500 }}>
                          <Calendar size={11} color="hsl(30 8% 65%)" />{job.date}
                        </span>
                        <ChevronRight size={15} color="hsl(35 15% 78%)" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right column */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

              {/* Pipeline value */}
              <div style={{ background: "hsl(222 47% 8%)", borderRadius: 12, padding: "24px", color: "white" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(210,220,240,0.5)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Total Pipeline Value</div>
                <div style={{ fontSize: 38, fontWeight: 900, letterSpacing: "-0.04em", lineHeight: 1, marginBottom: 8 }}>£18,764</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(16,185,129,0.2)", color: "#34d399", borderRadius: 4, padding: "3px 8px", fontSize: 11, fontWeight: 700 }}>
                    <ArrowUpRight size={11} /> +12% this month
                  </div>
                </div>
                {/* Mini breakdown */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", borderRadius: 4, overflow: "hidden", height: 6, gap: 1 }}>
                    <div style={{ background: "#3b82f6", flex: 2 }} />
                    <div style={{ background: "#f59e0b", flex: 2 }} />
                    <div style={{ background: "#8b5cf6", flex: 1 }} />
                    <div style={{ background: "#10b981", flex: 1 }} />
                  </div>
                </div>
                {[
                  { label: "New", count: 2, color: "#3b82f6" },
                  { label: "In Progress", count: 2, color: "#f59e0b" },
                  { label: "Quote Sent", count: 1, color: "#8b5cf6" },
                  { label: "Won", count: 1, color: "#10b981" },
                ].map((r) => (
                  <div key={r.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 0" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: r.color }} />
                      <span style={{ fontSize: 12.5, fontWeight: 500, color: "rgba(210,220,240,0.7)" }}>{r.label}</span>
                    </div>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: "rgba(210,220,240,0.9)" }}>{r.count}</span>
                  </div>
                ))}
              </div>

              {/* Quick access */}
              <div style={{ background: "white", borderRadius: 12, border: "1px solid hsl(35 15% 88%)", padding: "20px 20px 16px" }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "hsl(224 47% 11%)", marginBottom: 14, letterSpacing: "-0.01em" }}>Quick Actions</div>
                {[
                  { icon: TrendingUp,  label: "View full pipeline",   sub: "5 total enquiries" },
                  { icon: Wrench,      label: "Update company rates",  sub: "£45/hr · 25% markup" },
                ].map((a, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: i === 0 ? "1px solid hsl(35 15% 93%)" : "none", cursor: "pointer" }}>
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: "hsl(35 20% 95%)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <a.icon size={16} color="hsl(24 95% 53%)" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "hsl(224 47% 11%)" }}>{a.label}</div>
                      <div style={{ fontSize: 11.5, color: "hsl(30 8% 58%)", marginTop: 1 }}>{a.sub}</div>
                    </div>
                    <ChevronRight size={14} color="hsl(35 15% 72%)" />
                  </div>
                ))}
              </div>

            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
