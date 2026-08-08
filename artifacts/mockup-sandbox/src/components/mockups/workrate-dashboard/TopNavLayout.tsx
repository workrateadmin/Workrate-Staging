import {
  LayoutDashboard,
  Inbox,
  Settings,
  Bell,
  Hammer,
  ChevronRight,
  TrendingUp,
  ArrowUpRight,
  MapPin,
  Briefcase,
  Calendar,
  Wrench,
  Search,
  Plus,
  LogOut,
  ChevronDown,
  Circle,
} from "lucide-react";

const RECENT_JOBS = [
  { id: 1, name: "John Smith",      type: "Fitted Wardrobes",      location: "Didsbury, Manchester",     date: "Today, 2h ago",  status: "new_enquiry",     initials: "JS" },
  { id: 2, name: "Michael Byrne",   type: "Commercial Fit-out",    location: "Manchester City Centre",   date: "Today, 5h ago",  status: "survey_required", initials: "MB" },
  { id: 3, name: "Sarah Thornton",  type: "Kitchen Installation",  location: "Chorlton, Manchester",     date: "Yesterday",      status: "reviewing",       initials: "ST" },
  { id: 4, name: "David Ashworth",  type: "Staircase Renovation",  location: "Sale, Manchester",         date: "3 days ago",     status: "quote_sent",      initials: "DA" },
  { id: 5, name: "Emma Wilson",     type: "Home Office Build",     location: "Altrincham",               date: "7 days ago",     status: "won",             initials: "EW" },
];

const STATUS_CONFIG: Record<string, { label: string; bar: string; badge: string; text: string }> = {
  new_enquiry:     { label: "New",           bar: "#3b82f6", badge: "#dbeafe", text: "#1e40af" },
  reviewing:       { label: "Reviewing",     bar: "#f59e0b", badge: "#fef3c7", text: "#92400e" },
  survey_required: { label: "Survey Req.",   bar: "#f59e0b", badge: "#fef3c7", text: "#92400e" },
  quote_sent:      { label: "Quote Sent",    bar: "#8b5cf6", badge: "#ede9fe", text: "#5b21b6" },
  won:             { label: "Won",           bar: "#10b981", badge: "#d1fae5", text: "#065f46" },
  lost:            { label: "Lost",          bar: "#ef4444", badge: "#fee2e2", text: "#991b1b" },
};

const PIPELINE_STAGES = [
  { label: "New Enquiries",   count: 2,  value: "£8,200",   color: "#3b82f6", bg: "#eff6ff",  text: "#1e40af" },
  { label: "In Progress",     count: 2,  value: "£6,814",   color: "#f59e0b", bg: "#fffbeb",  text: "#92400e" },
  { label: "Quoted",          count: 1,  value: "£1,644",   color: "#8b5cf6", bg: "#f5f3ff",  text: "#5b21b6" },
  { label: "Won",             count: 1,  value: "£3,750",   color: "#10b981", bg: "#ecfdf5",  text: "#065f46" },
];

const UPCOMING = [
  { day: "Mon", date: "23", label: "Site Survey",    name: "Michael Byrne",   time: "9:00am",  color: "#f59e0b" },
  { day: "Wed", date: "25", label: "Quote Walkthrough", name: "John Smith",  time: "2:00pm",  color: "#3b82f6" },
  { day: "Fri", date: "27", label: "Job Start",      name: "Emma Wilson",     time: "8:00am",  color: "#10b981" },
];

export function TopNavLayout() {
  return (
    <div
      style={{
        width: 1920,
        height: 1080,
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        background: "hsl(220 20% 96%)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* ── Top Navigation Bar ─────────────────────────────────────────── */}
      <nav
        style={{
          height: 60,
          background: "hsl(222 47% 8%)",
          display: "flex",
          alignItems: "center",
          padding: "0 40px",
          gap: 0,
          flexShrink: 0,
        }}
      >
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginRight: 48 }}>
          <div
            style={{
              background: "hsl(24 95% 53%)",
              borderRadius: 8,
              width: 30,
              height: 30,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Hammer size={15} color="white" />
          </div>
          <span style={{ fontWeight: 900, fontSize: 17, color: "white", letterSpacing: "-0.02em" }}>
            WorkRate
          </span>
        </div>

        {/* Nav links */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, flex: 1 }}>
          {[
            { label: "Dashboard", icon: LayoutDashboard, active: true },
            { label: "Enquiries", icon: Inbox, badge: 2 },
            { label: "Settings",  icon: Settings },
          ].map((item) => (
            <div
              key={item.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                height: 36,
                padding: "0 14px",
                borderRadius: 8,
                cursor: "pointer",
                background: ("active" in item && item.active) ? "rgba(255,110,30,0.14)" : "transparent",
                position: "relative",
              }}
            >
              <item.icon
                size={15}
                color={("active" in item && item.active) ? "hsl(24 95% 53%)" : "rgba(210,220,240,0.55)"}
              />
              <span
                style={{
                  fontSize: 13,
                  fontWeight: ("active" in item && item.active) ? 700 : 500,
                  color: ("active" in item && item.active) ? "white" : "rgba(210,220,240,0.65)",
                }}
              >
                {item.label}
              </span>
              {"badge" in item && item.badge ? (
                <span
                  style={{
                    background: "hsl(24 95% 53%)",
                    color: "white",
                    borderRadius: 10,
                    fontSize: 10,
                    fontWeight: 800,
                    padding: "1px 6px",
                  }}
                >
                  {item.badge}
                </span>
              ) : null}
              {("active" in item && item.active) && (
                <div
                  style={{
                    position: "absolute",
                    bottom: -12,
                    left: 14,
                    right: 14,
                    height: 2,
                    background: "hsl(24 95% 53%)",
                    borderRadius: 2,
                  }}
                />
              )}
            </div>
          ))}
        </div>

        {/* Right side */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Search */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              height: 34,
              padding: "0 12px",
              width: 220,
            }}
          >
            <Search size={13} color="rgba(210,220,240,0.45)" />
            <span style={{ fontSize: 12.5, color: "rgba(210,220,240,0.35)", fontWeight: 400 }}>
              Search jobs, customers…
            </span>
          </div>

          {/* New enquiry button */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "hsl(24 95% 53%)",
              borderRadius: 8,
              height: 34,
              padding: "0 14px",
              cursor: "pointer",
            }}
          >
            <Plus size={14} color="white" />
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "white" }}>New Enquiry</span>
          </div>

          {/* Bell */}
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(255,255,255,0.06)",
              cursor: "pointer",
              position: "relative",
            }}
          >
            <Bell size={16} color="rgba(210,220,240,0.6)" />
            <div
              style={{
                position: "absolute",
                top: 7,
                right: 7,
                width: 7,
                height: 7,
                background: "hsl(24 95% 53%)",
                borderRadius: "50%",
                border: "1.5px solid hsl(222 47% 8%)",
              }}
            />
          </div>

          {/* Avatar + name */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "0 4px 0 8px",
              cursor: "pointer",
            }}
          >
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: "50%",
                background: "hsl(24 95% 53%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 800,
                fontSize: 12,
                color: "white",
              }}
            >
              H
            </div>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "rgba(210,220,240,0.8)" }}>
              Hartley Joinery
            </span>
            <ChevronDown size={13} color="rgba(210,220,240,0.4)" />
          </div>
        </div>
      </nav>

      {/* ── Page Header + Metric Strip ────────────────────────────────── */}
      <div
        style={{
          background: "hsl(222 47% 8%)",
          padding: "28px 40px 0",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <div
              style={{ fontSize: 11, fontWeight: 700, color: "rgba(210,220,240,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}
            >
              Overview
            </div>
            <h1
              style={{ fontSize: 26, fontWeight: 900, color: "white", letterSpacing: "-0.03em", lineHeight: 1 }}
            >
              Dashboard
            </h1>
          </div>
          <div style={{ fontSize: 12, color: "rgba(210,220,240,0.4)", fontWeight: 500 }}>
            Last updated: just now
          </div>
        </div>

        {/* Pipeline metric cards — horizontal strip embedded in dark header */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1 }}>
          {PIPELINE_STAGES.map((s, i) => (
            <div
              key={s.label}
              style={{
                background: i === 0 ? "rgba(59,130,246,0.12)" : i === 1 ? "rgba(245,158,11,0.10)" : i === 2 ? "rgba(139,92,246,0.10)" : "rgba(16,185,129,0.10)",
                borderTop: `3px solid ${s.color}`,
                padding: "18px 24px 20px",
                borderRadius: i === 0 ? "10px 0 0 0" : i === 3 ? "0 10px 0 0" : 0,
                position: "relative",
                cursor: "pointer",
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(210,220,240,0.5)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>
                {s.label}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                <div style={{ fontSize: 44, fontWeight: 900, color: "white", lineHeight: 1, letterSpacing: "-0.04em" }}>
                  {s.count}
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: s.color, letterSpacing: "-0.02em" }}>
                  {s.value}
                </div>
              </div>
              {/* Subtle indicator dot */}
              <Circle size={6} style={{ position: "absolute", top: 14, right: 16 }} color={s.color} fill={s.color} />
            </div>
          ))}
        </div>
      </div>

      {/* ── Main Content: 3-Column Grid ──────────────────────────────────── */}
      <main
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "1fr 1fr 320px",
          gap: 0,
          overflow: "hidden",
          minHeight: 0,
        }}
      >

        {/* ── Col 1: Recent Leads ───────────────────────── */}
        <div
          style={{
            background: "white",
            borderRight: "1px solid hsl(220 15% 91%)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Section header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "20px 28px 16px",
              borderBottom: "1px solid hsl(220 15% 93%)",
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 800, color: "hsl(224 47% 11%)", letterSpacing: "-0.01em" }}>
              Recent Leads
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700, color: "hsl(24 95% 53%)", cursor: "pointer" }}>
              View all <ChevronRight size={13} />
            </div>
          </div>

          {/* Job rows */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {RECENT_JOBS.map((job, i) => {
              const cfg = STATUS_CONFIG[job.status];
              return (
                <div
                  key={job.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "16px 28px",
                    borderBottom: i < RECENT_JOBS.length - 1 ? "1px solid hsl(220 15% 95%)" : "none",
                    gap: 14,
                    cursor: "pointer",
                  }}
                >
                  {/* Status accent */}
                  <div style={{ width: 3, height: 44, borderRadius: 2, background: cfg.bar, flexShrink: 0 }} />

                  {/* Avatar */}
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: "50%",
                      background: `${cfg.bar}20`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 13,
                      fontWeight: 800,
                      color: cfg.bar,
                      flexShrink: 0,
                    }}
                  >
                    {job.initials}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                      <span style={{ fontSize: 14, fontWeight: 800, color: "hsl(224 47% 11%)" }}>{job.name}</span>
                      <span
                        style={{
                          background: cfg.badge,
                          color: cfg.text,
                          borderRadius: 4,
                          fontSize: 9.5,
                          fontWeight: 800,
                          padding: "2px 7px",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}
                      >
                        {cfg.label}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "hsl(30 8% 52%)" }}>
                        <Briefcase size={11} color="hsl(30 8% 65%)" />
                        {job.type}
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "hsl(30 8% 52%)" }}>
                        <MapPin size={11} color="hsl(30 8% 65%)" />
                        {job.location}
                      </span>
                    </div>
                  </div>

                  {/* Date */}
                  <div style={{ flexShrink: 0, textAlign: "right" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11.5, color: "hsl(30 8% 60%)" }}>
                      <Calendar size={11} color="hsl(30 8% 68%)" />
                      {job.date}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Col 2: Pipeline Value + Quick Actions ─────── */}
        <div
          style={{
            borderRight: "1px solid hsl(220 15% 91%)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            background: "hsl(220 20% 96%)",
          }}
        >
          {/* Pipeline Value Card */}
          <div
            style={{
              margin: 24,
              marginBottom: 16,
              background: "hsl(222 47% 8%)",
              borderRadius: 14,
              padding: "28px 28px 24px",
              color: "white",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* Decorative large icon */}
            <div
              style={{
                position: "absolute",
                right: -16,
                bottom: -16,
                opacity: 0.05,
              }}
            >
              <TrendingUp size={140} color="white" />
            </div>

            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "rgba(210,220,240,0.45)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                marginBottom: 10,
              }}
            >
              Total Pipeline Value
            </div>
            <div
              style={{
                fontSize: 52,
                fontWeight: 900,
                letterSpacing: "-0.05em",
                lineHeight: 1,
                marginBottom: 10,
              }}
            >
              £18,764
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 22 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  background: "rgba(16,185,129,0.18)",
                  color: "#34d399",
                  borderRadius: 6,
                  padding: "4px 10px",
                  fontSize: 11.5,
                  fontWeight: 700,
                }}
              >
                <ArrowUpRight size={12} /> +12% this month
              </div>
            </div>

            {/* Segmented bar */}
            <div style={{ display: "flex", borderRadius: 4, overflow: "hidden", height: 5, marginBottom: 16, gap: 1 }}>
              <div style={{ background: "#3b82f6", flex: 2 }} />
              <div style={{ background: "#f59e0b", flex: 2 }} />
              <div style={{ background: "#8b5cf6", flex: 1 }} />
              <div style={{ background: "#10b981", flex: 1 }} />
            </div>

            {/* Stage legend */}
            {[
              { label: "New Enquiries",  count: 2, val: "£8,200",  color: "#3b82f6" },
              { label: "In Progress",    count: 2, val: "£6,814",  color: "#f59e0b" },
              { label: "Quote Sent",     count: 1, val: "£1,644",  color: "#8b5cf6" },
              { label: "Won",            count: 1, val: "£3,750",  color: "#10b981" },
            ].map((r) => (
              <div
                key={r.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "5px 0",
                  borderBottom: "1px solid rgba(255,255,255,0.05)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: r.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12.5, fontWeight: 500, color: "rgba(210,220,240,0.7)" }}>
                    {r.label}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 12, color: "rgba(210,220,240,0.45)" }}>{r.count} jobs</span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: "rgba(210,220,240,0.9)" }}>{r.val}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Quick Actions */}
          <div
            style={{
              margin: "0 24px 24px",
              background: "white",
              borderRadius: 14,
              border: "1px solid hsl(220 15% 91%)",
              padding: "20px 22px 16px",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 800, color: "hsl(224 47% 11%)", marginBottom: 14, letterSpacing: "-0.01em" }}>
              Quick Actions
            </div>
            {[
              { icon: TrendingUp, label: "View full pipeline",    sub: "5 total enquiries" },
              { icon: Wrench,     label: "Update company rates",   sub: "£45/hr · 25% markup" },
            ].map((a, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 0",
                  borderBottom: i === 0 ? "1px solid hsl(220 15% 93%)" : "none",
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 9,
                    background: "hsl(35 30% 95%)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <a.icon size={16} color="hsl(24 95% 53%)" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "hsl(224 47% 11%)" }}>{a.label}</div>
                  <div style={{ fontSize: 11.5, color: "hsl(30 8% 58%)", marginTop: 1 }}>{a.sub}</div>
                </div>
                <ChevronRight size={14} color="hsl(220 15% 72%)" />
              </div>
            ))}
          </div>
        </div>

        {/* ── Col 3: Upcoming Schedule ──────────────────── */}
        <div
          style={{
            background: "white",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "20px 24px 16px",
              borderBottom: "1px solid hsl(220 15% 93%)",
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: "hsl(224 47% 11%)", letterSpacing: "-0.01em" }}>
                Upcoming
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700, color: "hsl(24 95% 53%)", cursor: "pointer" }}>
                Schedule <ChevronRight size={13} />
              </div>
            </div>
          </div>

          {/* Calendar mini-strip */}
          <div style={{ padding: "16px 24px 0", flexShrink: 0 }}>
            <div style={{ display: "flex", gap: 6 }}>
              {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <div style={{ fontSize: 10, fontWeight: 700, color: "hsl(30 8% 58%)", letterSpacing: "0.04em" }}>{d}</div>
                  <div
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      fontWeight: i === 0 ? 900 : 600,
                      background: i === 0 ? "hsl(24 95% 53%)" : "transparent",
                      color: i === 0 ? "white" : "hsl(224 47% 11%)",
                    }}
                  >
                    {22 + i}
                  </div>
                  {/* Dot indicator for events */}
                  {(i === 0 || i === 2 || i === 4) && (
                    <div
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: "50%",
                        background: i === 0 ? "hsl(24 95% 53%)" : "hsl(220 15% 75%)",
                      }}
                    />
                  )}
                  {!(i === 0 || i === 2 || i === 4) && <div style={{ width: 5, height: 5 }} />}
                </div>
              ))}
            </div>
          </div>

          {/* Event list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 0" }}>
            {UPCOMING.map((ev, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 14,
                  padding: "12px 24px",
                  cursor: "pointer",
                  borderBottom: i < UPCOMING.length - 1 ? "1px solid hsl(220 15% 95%)" : "none",
                }}
              >
                {/* Date block */}
                <div
                  style={{
                    width: 44,
                    height: 52,
                    borderRadius: 10,
                    background: `${ev.color}14`,
                    border: `1px solid ${ev.color}30`,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <div style={{ fontSize: 9.5, fontWeight: 700, color: ev.color, textTransform: "uppercase", letterSpacing: "0.06em" }}>{ev.day}</div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: ev.color, lineHeight: 1, letterSpacing: "-0.02em" }}>{ev.date}</div>
                </div>

                {/* Details */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "hsl(224 47% 11%)", marginBottom: 4 }}>{ev.label}</div>
                  <div style={{ fontSize: 12, color: "hsl(30 8% 52%)", marginBottom: 4 }}>{ev.name}</div>
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      background: `${ev.color}12`,
                      color: ev.color,
                      borderRadius: 4,
                      padding: "2px 7px",
                      fontSize: 10.5,
                      fontWeight: 700,
                    }}
                  >
                    <Calendar size={9} /> {ev.time}
                  </div>
                </div>
              </div>
            ))}

            {/* Placeholder upcoming items */}
            <div
              style={{
                margin: "12px 24px 0",
                background: "hsl(220 20% 97%)",
                borderRadius: 10,
                border: "1px dashed hsl(220 15% 86%)",
                padding: "18px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Calendar size={20} color="hsl(220 15% 72%)" />
              <div style={{ fontSize: 12, fontWeight: 700, color: "hsl(224 47% 18%)" }}>Add a site visit</div>
              <div style={{ fontSize: 11.5, color: "hsl(30 8% 60%)", textAlign: "center" }}>
                Block time for Michael's survey
              </div>
            </div>
          </div>

          {/* Bottom: user account strip */}
          <div
            style={{
              padding: "14px 20px",
              borderTop: "1px solid hsl(220 15% 93%)",
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "hsl(220 20% 97%)",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: "hsl(24 95% 53%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 800,
                fontSize: 12,
                color: "white",
                flexShrink: 0,
              }}
            >
              H
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "hsl(224 47% 11%)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                Hartley Joinery
              </div>
              <div style={{ fontSize: 11, color: "hsl(30 8% 55%)" }}>info@hartleyjoinery.co.uk</div>
            </div>
            <LogOut size={14} color="hsl(30 8% 62%)" style={{ cursor: "pointer", flexShrink: 0 }} />
          </div>
        </div>
      </main>
    </div>
  );
}
