/**
 * Public landing page — two audiences, two clear journeys.
 *
 * "Sign Up Here"  → business owners → /sign-up
 * "Trade Log In"      → existing businesses → /sign-in
 * "Try WorkRate AI"   → customers → opens the AI chat widget (no login)
 *
 * All navigation uses useLocation() + navigate() — never <Link><button>
 */
import { useRef } from "react";
import { useLocation } from "wouter";
import {
  ArrowRight, Star, CheckCircle2, MessageCircle, LayoutDashboard,
  FileText, Phone, Bot, ClipboardList, Receipt, Calendar,
  Ruler, Wrench, Truck, ChevronRight, Hammer,
} from "lucide-react";
import ChatWidget, { type ChatWidgetHandle } from "@/components/chat-widget";
import heroSite from "@/assets/hero-site.jpg";

// ── Static mockup data (never connected to real DB) ──────────────────────────
const MOCK_ENQUIRIES = [
  { name: "Emma T.",  job: "Fitted wardrobes · SW12", time: "2h ago",  dot: "bg-teal-400"   },
  { name: "James R.", job: "Kitchen refit · N1",       time: "4h ago",  dot: "bg-violet-400" },
  { name: "Sarah M.", job: "Media wall · E3",          time: "6h ago",  dot: "bg-emerald-400"},
];

const WORKFLOW_STEPS = [
  { Icon: Phone,        color: "bg-teal-500",    label: "Customer gets in touch",       desc: "Via your link, website, or QR code on the van. Anytime, day or night." },
  { Icon: Bot,          color: "bg-violet-500",  label: "AI asks the right questions",  desc: "Dimensions, photos, budget, timescale — collected automatically." },
  { Icon: ClipboardList,color: "bg-amber-500",   label: "Brief lands in your dashboard",desc: "A full job card with everything you need to decide whether to quote." },
  { Icon: FileText,     color: "bg-teal-600",    label: "Quote sent in minutes",        desc: "Use the collected data to send a professional quote — not an afternoon's work." },
  { Icon: Receipt,      color: "bg-emerald-500", label: "Job won, invoice raised",      desc: "Track every job from deposit to final payment in one place." },
];

export default function LandingPage() {
  const widgetRef = useRef<ChatWidgetHandle>(null);
  const [, navigate] = useLocation();

  return (
    <div className="flex flex-col min-h-[100dvh] bg-white">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="h-[60px] px-6 md:px-10 flex items-center justify-between sticky top-0 z-40 bg-sidebar border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <div className="bg-primary text-primary-foreground p-1.5 rounded-lg shadow-sm">
            <Hammer className="w-[18px] h-[18px]" />
          </div>
          <span className="font-black text-[17px] text-sidebar-foreground tracking-tight leading-none">WorkRate</span>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => navigate("/sign-in")}
            className="text-[13px] font-semibold text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors px-3.5 py-2 rounded-lg hover:bg-sidebar-accent hidden sm:block"
          >
            Sign in
          </button>
          <button
            onClick={() => navigate("/sign-in")}
            className="text-[13px] font-bold text-primary-foreground bg-primary hover:opacity-90 transition-opacity px-3.5 py-2 rounded-lg shadow-sm"
          >
            Trade Log In
          </button>
        </div>
      </header>

      <main className="flex-1">

        {/* ── Hero ──────────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden">
          {/* Building site photo */}
          <div
            className="absolute inset-0 bg-cover bg-center bg-no-repeat"
            style={{ backgroundImage: `url(${heroSite})` }}
          />
          {/* Dark overlay — keeps text readable, adds brand tint */}
          <div className="absolute inset-0 bg-gradient-to-br from-slate-950/75 via-slate-900/65 to-[#134e4a]/55" />
          {/* Teal glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-teal-500/10 rounded-full blur-[120px]" />

          <div className="relative z-10 max-w-6xl mx-auto px-6 py-20 md:py-28">
            <div className="grid lg:grid-cols-[1fr_400px] gap-12 lg:gap-16 items-center">

              {/* ── Left: headline + CTAs ───────────────────────────────────── */}
              <div className="text-center lg:text-left">

                {/* Trade badge */}
                <div className="inline-flex items-center gap-2 bg-white/15 border border-white/30 text-white text-xs font-extrabold tracking-widest uppercase px-4 py-2 rounded-full mb-8 drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]">
                  <Ruler className="w-3.5 h-3.5 text-amber-400" />
                  For The Construction Industry
                </div>

                <h1 className="text-5xl md:text-6xl font-black tracking-tighter text-white mb-6 leading-[1.05]">
                  Never miss an enquiry.<br />
                  <span className="text-teal-300">Never chase a quote.</span>
                </h1>

                <p className="text-lg md:text-xl text-white/90 mb-10 max-w-xl mx-auto lg:mx-0 leading-relaxed font-medium">
                  WorkRate captures customer enquiries 24/7, qualifies every job with the right questions, and puts a complete brief in your dashboard — ready to quote.
                </p>

                {/* CTAs */}
                <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4">
                  <button
                    onClick={() => navigate("/sign-up")}
                    className="group w-full sm:w-auto inline-flex items-center justify-center gap-3 bg-primary hover:bg-primary/80 text-primary-foreground text-lg font-black px-10 py-5 rounded-2xl shadow-[0_8px_40px_rgba(94,234,212,0.35)] hover:shadow-[0_12px_50px_rgba(94,234,212,0.45)] transition-all hover:-translate-y-0.5 active:translate-y-0"
                  >
                    <LayoutDashboard className="w-5 h-5" />
                    Sign Up Here
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </button>
                  <button
                    onClick={() => widgetRef.current?.open()}
                    className="group w-full sm:w-auto inline-flex items-center justify-center gap-3 bg-white/10 hover:bg-white/15 border border-white/25 hover:border-white/40 text-white text-lg font-black px-10 py-5 rounded-2xl backdrop-blur-sm transition-all hover:-translate-y-0.5 active:translate-y-0"
                  >
                    <MessageCircle className="w-5 h-5 text-teal-300" />
                    Try WorkRate AI
                  </button>
                </div>

                {/* Trust badges */}
                <div className="mt-7 flex flex-wrap justify-center lg:justify-start gap-x-7 gap-y-2 text-sm font-semibold text-slate-400">
                  <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Free 14-day trial</span>
                  <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> No credit card required</span>
                  <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Live in under 10 minutes</span>
                </div>
              </div>

              {/* ── Right: Today's Office mockup ────────────────────────────── */}
              <div className="w-full max-w-sm mx-auto lg:mx-0">
                <div className="bg-white rounded-2xl shadow-[0_25px_60px_rgba(0,0,0,0.35)] overflow-hidden ring-1 ring-white/10">

                  {/* Window bar */}
                  <div className="bg-slate-900 px-4 py-3 flex items-center gap-2 border-b border-white/5">
                    <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-rose-500/70" />
                      <div className="w-3 h-3 rounded-full bg-amber-400/70" />
                      <div className="w-3 h-3 rounded-full bg-emerald-500/70" />
                    </div>
                    <span className="text-xs text-slate-400 font-medium ml-2 tracking-tight">WorkRate · Dashboard</span>
                    <div className="ml-auto w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  </div>

                  <div className="p-5">
                    {/* Morning greeting */}
                    <div className="flex items-center gap-3 mb-4 pb-4 border-b border-slate-100">
                      <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center text-xl shrink-0">☀️</div>
                      <div>
                        <p className="text-sm font-black text-slate-900">Good morning</p>
                        <p className="text-xs text-slate-400 font-medium">Here's what landed overnight · Mon 4 Aug</p>
                      </div>
                    </div>

                    {/* Stats row */}
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      <div className="bg-teal-50 rounded-xl p-3 text-center">
                        <p className="text-2xl font-black text-teal-600 leading-none mb-1">3</p>
                        <p className="text-[10px] text-teal-500 font-bold uppercase tracking-wide leading-tight">New<br/>enquiries</p>
                      </div>
                      <div className="bg-amber-50 rounded-xl p-3 text-center">
                        <p className="text-2xl font-black text-amber-600 leading-none mb-1">2</p>
                        <p className="text-[10px] text-amber-500 font-bold uppercase tracking-wide leading-tight">Quotes<br/>ready</p>
                      </div>
                      <div className="bg-emerald-50 rounded-xl p-3 text-center">
                        <p className="text-2xl font-black text-emerald-600 leading-none mb-1">1</p>
                        <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-wide leading-tight">Job this<br/>week</p>
                      </div>
                    </div>

                    {/* Enquiry rows */}
                    <div className="mb-4 rounded-xl border border-slate-100 overflow-hidden">
                      {MOCK_ENQUIRIES.map((e, i) => (
                        <div
                          key={e.name}
                          className={`flex items-center justify-between px-3 py-2.5 ${i < MOCK_ENQUIRIES.length - 1 ? "border-b border-slate-50" : ""}`}
                        >
                          <div className="flex items-center gap-2.5">
                            <div className={`w-2 h-2 rounded-full shrink-0 ${e.dot}`} />
                            <div>
                              <p className="text-xs font-bold text-slate-800 leading-tight">{e.name}</p>
                              <p className="text-[10px] text-slate-400 font-medium">{e.job}</p>
                            </div>
                          </div>
                          <span className="text-[10px] text-slate-400 font-medium shrink-0 ml-2">{e.time}</span>
                        </div>
                      ))}
                    </div>

                    {/* Card CTA */}
                    <div className="flex items-center justify-between px-4 py-2.5 bg-primary rounded-xl">
                      <span className="text-xs font-bold text-white">Open Dashboard</span>
                      <ChevronRight className="w-3.5 h-3.5 text-teal-200" />
                    </div>
                  </div>
                </div>

                <p className="text-center text-xs text-slate-500/70 mt-3 font-medium">
                  What you see every morning ↑
                </p>
              </div>

            </div>
          </div>
        </section>

        {/* ── Workflow strip ─────────────────────────────────────────────────── */}
        <section className="bg-slate-950 border-t border-white/5 py-20">
          <div className="max-w-5xl mx-auto px-6">
            <div className="text-center mb-14">
              <h2 className="text-3xl md:text-4xl font-black text-white tracking-tight mb-3">
                From first message to paid job — automatically
              </h2>
              <p className="text-slate-400 font-medium text-lg">
                WorkRate runs the whole pipeline. You focus on the work.
              </p>
            </div>

            <div className="relative">
              {/* Connecting line — desktop only */}
              <div className="hidden md:block absolute top-9 left-[10%] right-[10%] h-px bg-gradient-to-r from-transparent via-slate-700 to-transparent" />

              <div className="grid grid-cols-1 sm:grid-cols-5 gap-8 sm:gap-4">
                {WORKFLOW_STEPS.map(({ Icon, color, label, desc }, i) => (
                  <div key={i} className="flex sm:flex-col items-start sm:items-center sm:text-center gap-4 sm:gap-0 relative z-10">
                    {/* Step number + icon */}
                    <div className="shrink-0">
                      <div className={`w-[72px] h-[72px] ${color} rounded-2xl flex items-center justify-center shadow-lg shadow-black/30 relative sm:mx-auto sm:mb-4`}>
                        <Icon className="w-8 h-8 text-white" />
                        <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-slate-950 border border-slate-700 text-white text-[10px] font-black flex items-center justify-center">
                          {i + 1}
                        </span>
                      </div>
                    </div>

                    {/* Label + desc */}
                    <div>
                      <h3 className="text-white font-black text-sm mb-1.5 leading-snug">{label}</h3>
                      <p className="text-slate-400 text-xs leading-relaxed font-medium">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Problems solved ────────────────────────────────────────────────── */}
        <section className="py-24 md:py-32 max-w-5xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-black tracking-tight text-slate-900 mb-4">
              The admin you hate,{" "}
              <span className="text-primary">handled.</span>
            </h2>
            <p className="text-lg text-slate-500 font-medium max-w-xl mx-auto">
              Three problems every trade business runs into. WorkRate fixes all of them.
            </p>
          </div>

          <div className="space-y-6">

            {/* Problem 1: Late night enquiries */}
            <div className="grid md:grid-cols-2 gap-6 items-center bg-slate-50 rounded-3xl p-8 md:p-10">
              <div>
                <div className="w-12 h-12 bg-teal-100 rounded-2xl flex items-center justify-center mb-5">
                  <Phone className="w-6 h-6 text-teal-600" />
                </div>
                <p className="text-xs font-black text-slate-400 tracking-widest uppercase mb-2">AI Enquiry Capture</p>
                <h3 className="text-2xl font-black text-slate-900 mb-3 leading-tight">
                  "It's 9pm. There's a new kitchen enquiry and you're on the sofa."
                </h3>
                <p className="text-slate-500 font-medium leading-relaxed">
                  WorkRate's AI answers it instantly — asks about dimensions, budget, timescale, and photos. Sends a confirmation. You wake up to a complete brief, not a missed opportunity.
                </p>
              </div>
              <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
                <div className="flex items-center gap-3 mb-4 pb-4 border-b border-slate-50">
                  <div className="w-9 h-9 bg-teal-600 rounded-xl flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-xs font-black text-slate-900">WorkRate AI replied</p>
                    <p className="text-[11px] text-slate-400 font-medium">9:14 pm · Kitchen enquiry</p>
                  </div>
                  <span className="ml-auto text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full shrink-0">Live</span>
                </div>
                <p className="text-sm text-slate-600 bg-slate-50 rounded-xl p-3.5 font-medium leading-relaxed text-left">
                  "Hi Emma — thanks for getting in touch! To put together an accurate quote, could you tell me the rough dimensions of your kitchen and what style of units you're thinking?"
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-[11px] font-bold text-emerald-600">Replied in 12 seconds · No missed calls</span>
                </div>
              </div>
            </div>

            {/* Problem 2: Slow quoting */}
            <div className="grid md:grid-cols-2 gap-6 items-center bg-slate-50 rounded-3xl p-8 md:p-10">
              <div className="md:order-2">
                <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center mb-5">
                  <Wrench className="w-6 h-6 text-amber-600" />
                </div>
                <p className="text-xs font-black text-slate-400 tracking-widest uppercase mb-2">Smart Quoting</p>
                <h3 className="text-2xl font-black text-slate-900 mb-3 leading-tight">
                  "Two hours on a quote. They went with someone else."
                </h3>
                <p className="text-slate-500 font-medium leading-relaxed">
                  Because WorkRate already collected the dimensions, photos, materials preference, and budget during the chat — quoting takes minutes, not your whole evening.
                </p>
              </div>
              <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm md:order-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Enquiry Brief · Collected by AI</p>
                <div className="space-y-0">
                  {[
                    { label: "Job",       value: "Fitted wardrobes × 2 bays" },
                    { label: "Location",  value: "SW12 · 3-bed house" },
                    { label: "Width",     value: "3.6 m across full alcove wall" },
                    { label: "Height",    value: "2.4 m, level ceiling" },
                    { label: "Style",     value: "Shaker, hinged, painted MDF" },
                    { label: "Budget",    value: "£4,000 – 6,000" },
                    { label: "Timescale", value: "Within 3 months" },
                  ].map(({ label, value }, i, arr) => (
                    <div key={label} className={`flex justify-between py-2 ${i < arr.length - 1 ? "border-b border-slate-50" : ""}`}>
                      <span className="text-xs text-slate-400 font-medium">{label}</span>
                      <span className="text-xs text-slate-800 font-bold text-right ml-4">{value}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-teal-500" />
                  <span className="text-[11px] font-bold text-teal-600">Collected by AI · 0 phone calls</span>
                </div>
              </div>
            </div>

            {/* Problem 3: Lost pipeline */}
            <div className="grid md:grid-cols-2 gap-6 items-center bg-slate-50 rounded-3xl p-8 md:p-10">
              <div>
                <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center mb-5">
                  <Calendar className="w-6 h-6 text-emerald-600" />
                </div>
                <p className="text-xs font-black text-slate-400 tracking-widest uppercase mb-2">Pipeline & Follow-ups</p>
                <h3 className="text-2xl font-black text-slate-900 mb-3 leading-tight">
                  "Whatever happened to that extension job from three weeks ago?"
                </h3>
                <p className="text-slate-500 font-medium leading-relaxed">
                  Every enquiry, quote, and job tracked in one place. See what's new, what needs a follow-up, and what's won — at a glance. Nothing falls through the cracks.
                </p>
              </div>
              <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Your Pipeline</p>
                <div className="space-y-0">
                  {[
                    { name: "Emma T. · Wardrobes",    status: "Quote ready",     tag: "bg-amber-100 text-amber-700"   },
                    { name: "James R. · Kitchen",     status: "Photos needed",   tag: "bg-teal-100 text-teal-700"     },
                    { name: "Mark H. · Extension",    status: "Deposit paid ✓",  tag: "bg-emerald-100 text-emerald-700"},
                    { name: "Sarah M. · Media wall",  status: "New enquiry",     tag: "bg-violet-100 text-violet-700" },
                  ].map(({ name, status, tag }, i, arr) => (
                    <div key={name} className={`flex items-center justify-between py-2.5 ${i < arr.length - 1 ? "border-b border-slate-50" : ""}`}>
                      <span className="text-xs font-bold text-slate-800">{name}</span>
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 ml-3 ${tag}`}>{status}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </section>

        {/* ── Social proof strip ─────────────────────────────────────────────── */}
        <section className="border-y border-slate-100 bg-slate-50 py-10">
          <div className="max-w-5xl mx-auto px-6">
            <p className="text-center text-xs font-black text-slate-400 uppercase tracking-widest mb-6">
              Trusted by trade businesses across the UK
            </p>
            <div className="flex flex-wrap justify-center md:justify-between items-center gap-6">
              {[
                { name: "Hartley Joinery",    label: "Bespoke joinery & fitted furniture" },
                { name: "TrueFlow Plumbing",  label: "Bathrooms, boilers & heating" },
                { name: "Apex Electrical",    label: "Rewires, EV chargers & more" },
                { name: "City Builders",      label: "Extensions & conversions" },
              ].map((co, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="flex gap-0.5">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <Star key={j} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-700">{co.name}</p>
                    <p className="text-xs text-slate-400">{co.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Trade icons strip ──────────────────────────────────────────────── */}
        <section className="py-16 max-w-4xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { Icon: Ruler,    label: "Joinery",    desc: "Wardrobes, media walls, kitchens" },
              { Icon: Wrench,   label: "Building",   desc: "Extensions, loft conversions" },
              { Icon: Truck,    label: "Plumbing",   desc: "Boilers, bathrooms, heating" },
              { Icon: Calendar, label: "Electrical", desc: "Rewires, EV chargers, solar" },
            ].map(({ Icon, label, desc }) => (
              <div key={label} className="flex flex-col items-center text-center p-6 rounded-2xl border border-slate-100 hover:border-slate-200 hover:shadow-sm transition-all">
                <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mb-3">
                  <Icon className="w-6 h-6 text-slate-600" />
                </div>
                <p className="text-sm font-black text-slate-900 mb-1">{label}</p>
                <p className="text-xs text-slate-400 font-medium leading-snug">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Final CTA ──────────────────────────────────────────────────────── */}
        <section className="py-24 md:py-32 bg-slate-950">
          <div className="max-w-3xl mx-auto px-6 text-center">
            <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">Get started today</p>
            <h2 className="text-4xl md:text-6xl font-black tracking-tighter text-white mb-6">
              Set up in under<br />10 minutes.
            </h2>
            <p className="text-lg text-slate-400 font-medium mb-10 max-w-lg mx-auto leading-relaxed">
              Connect WorkRate to your business today. Your first enquiry could come in tonight — while you're still on the tools.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={() => navigate("/sign-up")}
                className="group w-full sm:w-auto inline-flex items-center justify-center gap-3 bg-primary hover:bg-primary/80 text-primary-foreground text-lg font-black px-10 py-5 rounded-2xl shadow-xl hover:shadow-2xl transition-all hover:-translate-y-0.5"
              >
                <LayoutDashboard className="w-5 h-5" />
                Sign Up Here
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
              <button
                onClick={() => widgetRef.current?.open()}
                className="group w-full sm:w-auto inline-flex items-center justify-center gap-3 border-2 border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white text-lg font-black px-10 py-5 rounded-2xl transition-all hover:-translate-y-0.5"
              >
                <MessageCircle className="w-5 h-5 text-teal-400" />
                Try WorkRate AI
              </button>
            </div>
            <p className="mt-6 text-sm text-slate-600 font-semibold">
              Free 14-day trial · No credit card required
            </p>
          </div>
        </section>

      </main>

      {/* ── Footer ────────────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-100 py-8 bg-white">
        <div className="max-w-5xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-primary rounded-md flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <span className="text-sm font-black text-slate-700">WorkRate</span>
            <span className="text-slate-300 text-sm">·</span>
            <span className="text-sm text-slate-400">&copy; {new Date().getFullYear()}</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-slate-400">
            <button onClick={() => navigate("/sign-in")} className="hover:text-slate-700 font-semibold transition-colors">
              Business login
            </button>
            <button onClick={() => navigate("/sign-up")} className="hover:text-slate-700 font-semibold transition-colors">
              Get started
            </button>
          </div>
        </div>
      </footer>

      {/* ── Embedded chat widget ──────────────────────────────────────────────── */}
      <ChatWidget ref={widgetRef} />
    </div>
  );
}
