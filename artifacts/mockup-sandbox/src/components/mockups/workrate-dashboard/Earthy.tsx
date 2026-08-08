import {
  LayoutDashboard,
  Inbox,
  Briefcase,
  CalendarDays,
  PhoneCall,
  Settings,
  Plug,
  LogOut,
  Bell,
  Hammer,
  ChevronRight,
  TrendingUp,
  Wrench,
  MapPin,
  Clock,
  CheckCircle2,
} from "lucide-react";

// ─── Static data ─────────────────────────────────────────────────────────────

const PIPELINE_NAV = [
  { name: "Dashboard", icon: LayoutDashboard, active: true },
  { name: "Leads", icon: Inbox, badge: 3 },
  { name: "Jobs", icon: Briefcase },
  { name: "Schedule", icon: CalendarDays },
  { name: "AI Receptionist", icon: PhoneCall },
];

const BUSINESS_NAV = [
  { name: "Integrations", icon: Plug },
  { name: "Settings", icon: Settings },
];

const STAT_CARDS = [
  { label: "New Leads", value: 7, icon: Inbox, accent: "#b45309" },
  { label: "In Progress", value: 4, icon: Wrench, accent: "#6b7f3a" },
  { label: "Quoted", value: 5, icon: Briefcase, accent: "#8b5e3c" },
  { label: "Won Jobs", value: 12, icon: CheckCircle2, accent: "#5c6e3a" },
];

const RECENT_LEADS = [
  { id: 1, name: "John Smith", type: "Fitted Wardrobes", location: "Didsbury, Manchester", date: "Today, 2h ago", status: "new_enquiry", initials: "JS" },
  { id: 2, name: "Michael Byrne", type: "Commercial Fit-out", location: "Manchester City Centre", date: "Today, 5h ago", status: "survey_required", initials: "MB" },
  { id: 3, name: "Sarah Thornton", type: "Kitchen Installation", location: "Chorlton, Manchester", date: "Yesterday", status: "reviewing", initials: "ST" },
  { id: 4, name: "David Ashworth", type: "Staircase Renovation", location: "Sale, Manchester", date: "3 days ago", status: "quote_sent", initials: "DA" },
  { id: 5, name: "Emma Wilson", type: "Home Office", location: "Altrincham", date: "7 days ago", status: "won", initials: "EW" },
];

const UPCOMING = [
  { id: 1, job: "Hartley Kitchen", type: "survey", date: "Mon 14 Jul", location: "Chorlton" },
  { id: 2, job: "Byrne Fit-out", type: "start", date: "Wed 16 Jul", location: "City Centre" },
  { id: 3, job: "Wilson Office", type: "completion", date: "Fri 18 Jul", location: "Altrincham" },
];

const BREAKDOWN = [
  { label: "New", count: 7, pct: 47, color: "#c2832b" },
  { label: "Reviewing", count: 4, pct: 27, color: "#6b7f3a" },
  { label: "Quoted", count: 5, pct: 26, color: "#8b5e3c" },
];

const STATUS_MAP: Record<string, { label: string; bar: string; tag: string; tagText: string }> = {
  new_enquiry:     { label: "New",          bar: "#c2832b", tag: "#fdf3e3", tagText: "#7c4a10" },
  reviewing:       { label: "Reviewing",    bar: "#6b7f3a", tag: "#eef3e6", tagText: "#3c4e20" },
  survey_required: { label: "Survey Req.",  bar: "#c2832b", tag: "#fdf3e3", tagText: "#7c4a10" },
  quote_sent:      { label: "Quote Sent",   bar: "#8b5e3c", tag: "#f5ece5", tagText: "#5c3420" },
  won:             { label: "Won",          bar: "#4e6e2a", tag: "#e8f2df", tagText: "#2e4a14" },
  lost:            { label: "Lost",         bar: "#a05050", tag: "#fceaea", tagText: "#6b2020" },
};

// ─── Colour palette ───────────────────────────────────────────────────────────
// Sidebar: deep forest green
// Background: warm parchment
// Cards: warm off-white
// Primary: amber-ochre
// Accents: earthy terracotta / olive

const C = {
  sidebar:         "#1e2d1a",  // deep forest green
  sidebarBorder:   "#29401f",
  sidebarText:     "#d4ddc8",
  sidebarMuted:    "#7a9468",
  sidebarActive:   "#c9d9bb",
  sidebarActiveBg: "rgba(160,200,100,0.13)",
  accent:          "#c2832b",  // amber-ochre
  accentLight:     "#fdf3e3",
  bg:              "#f5f0e8",  // warm parchment
  cardBg:          "#fdfaf4",  // warm off-white
  cardBorder:      "#e4d9c8",
  textPrimary:     "#1e2010",  // very dark olive-brown
  textSecondary:   "#6b6253",  // warm muted brown
  textMuted:       "#9a8e7e",
  divider:         "#e4d9c8",
  headerBg:        "#fdfaf4",
  pipelineBg:      "#f0e9da",  // slightly deeper parchment for pipeline value card
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function NavSection({ label, items }: { label: string; items: typeof PIPELINE_NAV }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ padding: "0 16px 8px", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.12em", color: C.sidebarMuted, textTransform: "uppercase" }}>
        {label}
      </div>
      {items.map((item) => (
        <div
          key={item.name}
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            height: 42,
            padding: "0 14px",
            margin: "0 8px 2px",
            borderRadius: 6,
            gap: 10,
            cursor: "pointer",
            background: item.active ? C.sidebarActiveBg : "transparent",
            border: item.active ? "1px solid rgba(160,200,100,0.18)" : "1px solid transparent",
          }}
        >
          {item.active && (
            <div style={{ position: "absolute", left: -8, top: "15%", bottom: "15%", width: 3, background: C.accent, borderRadius: "0 3px 3px 0" }} />
          )}
          <item.icon size={17} color={item.active ? C.sidebarActive : C.sidebarMuted} />
          <span style={{ fontSize: 13.5, fontWeight: item.active ? 700 : 500, color: item.active ? C.sidebarActive : C.sidebarText, flex: 1 }}>
            {item.name}
          </span>
          {"badge" in item && item.badge ? (
            <div style={{ background: C.accent, color: "white", borderRadius: 10, fontSize: 10, fontWeight: 800, padding: "1px 7px", minWidth: 18, textAlign: "center" }}>
              {item.badge}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function StatCard({ stat }: { stat: typeof STAT_CARDS[0] }) {
  const Icon = stat.icon;
  return (
    <div style={{
      background: C.cardBg,
      border: `1px solid ${C.cardBorder}`,
      borderRadius: 10,
      padding: "20px 22px",
      display: "flex",
      flexDirection: "column",
      gap: 14,
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Subtle grain texture via repeating gradient */}
      <div style={{
        position: "absolute", inset: 0, borderRadius: 10, pointerEvents: "none",
        background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.008) 2px, rgba(0,0,0,0.008) 4px)",
      }} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: C.textMuted }}>
          {stat.label}
        </span>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: `${stat.accent}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon size={16} color={stat.accent} />
        </div>
      </div>
      <div style={{ fontSize: 38, fontWeight: 900, color: C.textPrimary, letterSpacing: "-0.03em", lineHeight: 1 }}>
        {stat.value}
      </div>
    </div>
  );
}

function LeadRow({ lead }: { lead: typeof RECENT_LEADS[0] }) {
  const s = STATUS_MAP[lead.status] || STATUS_MAP.new_enquiry;
  return (
    <div style={{
      display: "flex", alignItems: "center",
      background: C.cardBg, border: `1px solid ${C.cardBorder}`, borderRadius: 8,
      padding: "12px 16px 12px 18px",
      position: "relative", overflow: "hidden", cursor: "pointer",
    }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: s.bar, borderRadius: "8px 0 0 8px" }} />
      {/* Avatar */}
      <div style={{ width: 36, height: 36, borderRadius: "50%", background: `${s.bar}22`, border: `1.5px solid ${s.bar}44`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, color: s.bar, flexShrink: 0, marginRight: 12 }}>
        {lead.initials}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: C.textPrimary, marginBottom: 3 }}>{lead.name}</div>
        <div style={{ fontSize: 12.5, color: C.textSecondary, display: "flex", alignItems: "center", gap: 6 }}>
          <span>{lead.type}</span>
          <span style={{ color: C.cardBorder }}>·</span>
          <MapPin size={11} color={C.textMuted} />
          <span>{lead.location}</span>
          <span style={{ color: C.cardBorder }}>·</span>
          <span style={{ color: C.textMuted }}>{lead.date}</span>
        </div>
      </div>
      <div style={{ background: s.tag, color: s.tagText, borderRadius: 5, fontSize: 10.5, fontWeight: 700, padding: "3px 9px", letterSpacing: "0.06em", textTransform: "uppercase", flexShrink: 0 }}>
        {s.label}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function Earthy() {
  return (
    <div style={{ width: 1920, height: 1080, display: "flex", fontFamily: "'Plus Jakarta Sans', sans-serif", background: C.bg, overflow: "hidden" }}>

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside style={{ width: 252, flexShrink: 0, display: "flex", flexDirection: "column", background: C.sidebar, borderRight: `1px solid ${C.sidebarBorder}` }}>

        {/* Logo */}
        <div style={{ height: 68, display: "flex", alignItems: "center", padding: "0 20px", borderBottom: `1px solid ${C.sidebarBorder}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ background: C.accent, borderRadius: 8, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 6px rgba(194,131,43,0.4)" }}>
              <Hammer size={17} color="white" />
            </div>
            <span style={{ fontWeight: 900, fontSize: 19, color: "white", letterSpacing: "-0.025em" }}>WorkRate</span>
          </div>
        </div>

        {/* Nav */}
        <div style={{ flex: 1, padding: "24px 4px 12px", overflowY: "auto" }}>
          <NavSection label="Pipeline" items={PIPELINE_NAV} />
          <NavSection label="Business" items={BUSINESS_NAV as typeof PIPELINE_NAV} />
        </div>

        {/* User footer */}
        <div style={{ padding: "12px 16px 16px", borderTop: `1px solid ${C.sidebarBorder}`, background: "rgba(0,0,0,0.18)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8 }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: C.accent, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, color: "white", flexShrink: 0 }}>H</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: C.sidebarActive, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Hartley Joinery</div>
              <div style={{ fontSize: 11.5, color: C.sidebarMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>info@hartleyjoinery.co.uk</div>
            </div>
            <LogOut size={15} color={C.sidebarMuted} style={{ flexShrink: 0, cursor: "pointer" }} />
          </div>
        </div>
      </aside>

      {/* ── Main area ───────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        {/* Header */}
        <header style={{
          height: 68, display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 36px", background: C.headerBg, borderBottom: `1px solid ${C.divider}`,
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 28, height: 3, background: C.accent, borderRadius: 2 }} />
            <h1 style={{ fontSize: 19, fontWeight: 800, color: C.textPrimary, letterSpacing: "-0.02em" }}>Dashboard</h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* Today date pill */}
            <div style={{ background: C.accentLight, border: `1px solid ${C.cardBorder}`, borderRadius: 6, padding: "5px 12px", fontSize: 12, fontWeight: 600, color: C.textSecondary, display: "flex", alignItems: "center", gap: 6 }}>
              <Clock size={13} color={C.accent} />
              Mon 14 July 2025
            </div>
            <div style={{ width: 36, height: 36, borderRadius: 8, border: `1px solid ${C.cardBorder}`, background: C.cardBg, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", position: "relative" }}>
              <Bell size={17} color={C.textSecondary} />
              <div style={{ position: "absolute", top: 8, right: 8, width: 7, height: 7, background: C.accent, borderRadius: "50%", border: "2px solid white" }} />
            </div>
          </div>
        </header>

        {/* Content */}
        <main style={{ flex: 1, padding: "28px 36px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 24 }}>

          {/* ── Stat cards ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
            {STAT_CARDS.map((stat) => <StatCard key={stat.label} stat={stat} />)}
          </div>

          {/* ── Body: two columns ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 20 }}>

            {/* Left: recent leads */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 10, borderBottom: `1.5px solid ${C.divider}` }}>
                <h2 style={{ fontSize: 15, fontWeight: 800, color: C.textPrimary, letterSpacing: "-0.01em" }}>Recent Leads</h2>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: C.accent, display: "flex", alignItems: "center", gap: 3, cursor: "pointer" }}>
                  View all <ChevronRight size={13} />
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {RECENT_LEADS.map((lead) => <LeadRow key={lead.id} lead={lead} />)}
              </div>
            </div>

            {/* Right: pipeline + upcoming */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

              {/* Pipeline value card */}
              <div style={{
                background: C.sidebar,
                border: `1px solid ${C.sidebarBorder}`,
                borderRadius: 10,
                padding: "20px 22px",
                position: "relative",
                overflow: "hidden",
              }}>
                {/* Decorative circle */}
                <div style={{ position: "absolute", right: -24, top: -24, width: 100, height: 100, borderRadius: "50%", background: "rgba(194,131,43,0.12)" }} />
                <div style={{ position: "absolute", right: 10, top: 10, opacity: 0.07 }}>
                  <TrendingUp size={64} color="white" />
                </div>
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: C.sidebarMuted, marginBottom: 10 }}>
                  Pipeline Value
                </div>
                <div style={{ fontSize: 36, fontWeight: 900, color: "white", letterSpacing: "-0.03em", marginBottom: 6 }}>£28,450</div>
                <div style={{ fontSize: 12, color: C.sidebarMuted, fontWeight: 500 }}>Total estimated across all open quotes.</div>
              </div>

              {/* Pipeline breakdown */}
              <div style={{ background: C.cardBg, border: `1px solid ${C.cardBorder}`, borderRadius: 10, padding: "18px 20px" }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: C.textMuted, marginBottom: 14 }}>
                  Pipeline Breakdown
                </div>
                {/* Segmented bar */}
                <div style={{ height: 10, borderRadius: 5, overflow: "hidden", display: "flex", marginBottom: 16, background: "#e8dfd0" }}>
                  {BREAKDOWN.map((b) => (
                    <div key={b.label} style={{ width: `${b.pct}%`, background: b.color, height: "100%" }} />
                  ))}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {BREAKDOWN.map((b) => (
                    <div key={b.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 10, height: 10, borderRadius: 3, background: b.color }} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: C.textSecondary }}>{b.label}</span>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 800, color: C.textPrimary }}>{b.count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Upcoming schedule */}
              <div style={{ background: C.cardBg, border: `1px solid ${C.cardBorder}`, borderRadius: 10, overflow: "hidden", flex: 1 }}>
                <div style={{ padding: "12px 18px", borderBottom: `1px solid ${C.divider}`, display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f0e9da" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary, display: "flex", alignItems: "center", gap: 6 }}>
                    <CalendarDays size={14} color={C.accent} />
                    Upcoming (7 days)
                  </span>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: C.accent, cursor: "pointer", display: "flex", alignItems: "center", gap: 2 }}>
                    Calendar <ChevronRight size={12} />
                  </span>
                </div>
                <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
                  {UPCOMING.map((ev) => {
                    const typeColor = ev.type === "survey" ? "#c2832b" : ev.type === "start" ? "#6b7f3a" : "#8b5e3c";
                    return (
                      <div key={ev.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 6, border: `1px solid ${C.cardBorder}`, cursor: "pointer" }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: typeColor, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, color: typeColor, marginBottom: 1 }}>{ev.type}</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ev.job}</div>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textAlign: "right", whiteSpace: "nowrap" }}>{ev.date}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default Earthy;
