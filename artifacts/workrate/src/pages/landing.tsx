/**
 * Public landing page — two audiences, two clear journeys.
 *
 * "Get Started"    → business owners → /sign-up → dashboard
 * "Try WorkRate AI" → customers → opens the AI chat widget (no login)
 */
import { useRef } from "react";
import { Link } from "wouter";
import {
  ArrowRight, Clock, Camera, Star, CheckCircle2,
  ShieldCheck, MessageCircle, LayoutDashboard,
  Zap, FileText, Users,
} from "lucide-react";
import ChatWidget, { type ChatWidgetHandle } from "@/components/chat-widget";

export default function LandingPage() {
  const widgetRef = useRef<ChatWidgetHandle>(null);

  return (
    <div className="flex flex-col min-h-[100dvh] bg-white">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="px-6 md:px-10 py-4 flex items-center justify-between border-b border-slate-100 sticky top-0 z-40 bg-white/90 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-[#2563EB] rounded-lg flex items-center justify-center">
            <svg className="w-[18px] h-[18px] text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <span className="font-black text-xl tracking-tight text-slate-900">WorkRate</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/sign-in">
            <button className="text-sm font-semibold text-slate-500 hover:text-slate-900 transition-colors px-4 py-2 rounded-lg hover:bg-slate-50 hidden sm:block">
              Sign in
            </button>
          </Link>
          <Link href="/sign-up">
            <button className="text-sm font-bold text-white bg-[#2563EB] hover:bg-[#1D4ED8] transition-colors px-4 py-2 rounded-lg shadow-sm">
              Get Started
            </button>
          </Link>
        </div>
      </header>

      <main className="flex-1">

        {/* ── Hero ──────────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-[#1e3a8a]" />
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage: `linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)`,
              backgroundSize: "50px 50px",
            }}
          />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-blue-500/20 rounded-full blur-[120px]" />

          <div className="relative z-10 max-w-5xl mx-auto px-6 py-24 md:py-36 text-center">
            <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 text-white/80 text-xs font-bold tracking-widest uppercase px-4 py-2 rounded-full mb-10">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              AI-Powered · Fast Quotes · No Waiting
            </div>

            <h1 className="text-5xl md:text-7xl font-black tracking-tighter text-white mb-6 leading-[1.05]">
              The smarter way to<br />
              <span className="text-[#60A5FA]">win trade business.</span>
            </h1>
            <p className="text-lg md:text-xl text-slate-300 mb-12 max-w-2xl mx-auto leading-relaxed font-medium">
              WorkRate's AI assistant captures customer enquiries, collects every detail you need to quote, and feeds it straight into your business dashboard.
            </p>

            {/* ── Two CTAs ────────────────────────────────────────────────── */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">

              {/* Primary — business owner */}
              <Link href="/sign-up">
                <button className="group w-full sm:w-auto inline-flex items-center justify-center gap-3 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-lg font-black px-10 py-5 rounded-2xl shadow-[0_8px_40px_rgba(37,99,235,0.5)] hover:shadow-[0_12px_50px_rgba(37,99,235,0.6)] transition-all hover:-translate-y-0.5 active:translate-y-0">
                  <LayoutDashboard className="w-5 h-5" />
                  Get Started
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
              </Link>

              {/* Secondary — customer demo */}
              <button
                onClick={() => widgetRef.current?.open()}
                className="group w-full sm:w-auto inline-flex items-center justify-center gap-3 bg-white/10 hover:bg-white/15 border border-white/25 hover:border-white/40 text-white text-lg font-black px-10 py-5 rounded-2xl backdrop-blur-sm transition-all hover:-translate-y-0.5 active:translate-y-0"
              >
                <MessageCircle className="w-5 h-5 text-blue-300" />
                Try WorkRate AI
              </button>
            </div>

            <div className="mt-8 flex flex-wrap justify-center gap-x-8 gap-y-3 text-sm font-semibold text-slate-400">
              <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Free 14-day trial</span>
              <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> No credit card required</span>
              <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Set up in minutes</span>
            </div>
          </div>
        </section>

        {/* ── Two journeys explained ─────────────────────────────────────────── */}
        <section className="py-20 max-w-5xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-6">

            {/* Business owner card */}
            <div className="relative bg-slate-900 rounded-3xl p-8 overflow-hidden">
              <div className="absolute top-0 right-0 w-40 h-40 bg-blue-600/20 rounded-full blur-3xl" />
              <div className="relative z-10">
                <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center mb-6">
                  <LayoutDashboard className="w-6 h-6 text-white" />
                </div>
                <p className="text-xs font-black text-blue-400 tracking-widest uppercase mb-3">For Trade Businesses</p>
                <h3 className="text-2xl font-black text-white mb-3 tracking-tight">Run your pipeline from one place</h3>
                <p className="text-slate-400 font-medium leading-relaxed mb-6">
                  Log in to your dashboard to manage enquiries, generate quotes, track leads, and configure your AI assistant.
                </p>
                <ul className="space-y-2 mb-8">
                  {["View all customer enquiries", "Generate professional quotes", "Manage your WorkRate Brain", "See uploaded photos & details"].map((item) => (
                    <li key={item} className="flex items-center gap-2 text-sm text-slate-300 font-medium">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
                <Link href="/sign-up">
                  <button className="group w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-black py-3.5 px-6 rounded-xl transition-all">
                    Get Started Free
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </button>
                </Link>
              </div>
            </div>

            {/* Customer card */}
            <div className="relative bg-slate-50 rounded-3xl p-8 overflow-hidden border border-slate-100">
              <div className="absolute top-0 right-0 w-40 h-40 bg-blue-100 rounded-full blur-3xl" />
              <div className="relative z-10">
                <div className="w-12 h-12 bg-blue-50 border border-blue-100 rounded-2xl flex items-center justify-center mb-6">
                  <MessageCircle className="w-6 h-6 text-blue-600" />
                </div>
                <p className="text-xs font-black text-blue-600 tracking-widest uppercase mb-3">For Customers</p>
                <h3 className="text-2xl font-black text-slate-900 mb-3 tracking-tight">Get a quote without the hassle</h3>
                <p className="text-slate-500 font-medium leading-relaxed mb-6">
                  Chat with our AI assistant, describe your project, upload photos — no account needed. Your enquiry goes straight to the business.
                </p>
                <ul className="space-y-2 mb-8">
                  {["No account or login required", "Chat naturally about your project", "Upload photos of the job", "Receive a professional quote"].map((item) => (
                    <li key={item} className="flex items-center gap-2 text-sm text-slate-600 font-medium">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => widgetRef.current?.open()}
                  className="group w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-black py-3.5 px-6 rounded-xl transition-all"
                >
                  <MessageCircle className="w-4 h-4" />
                  Try WorkRate AI
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ── How it works ──────────────────────────────────────────────────── */}
        <section className="bg-slate-50 py-24 md:py-32">
          <div className="max-w-5xl mx-auto px-6">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-black tracking-tight text-slate-900 mb-4">
                How it works
              </h2>
              <p className="text-lg text-slate-500 font-medium max-w-xl mx-auto">
                From customer chat to qualified lead — automatically.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8 relative">
              <div className="hidden md:block absolute top-10 left-[calc(16.67%+1rem)] right-[calc(16.67%+1rem)] h-px bg-slate-200" />
              {[
                { step: "1", Icon: MessageCircle, color: "bg-blue-100 text-blue-600", ring: "ring-blue-50", title: "Customer chats", desc: "They describe the job to your AI assistant — no forms, no phone tag. The AI asks all the right questions." },
                { step: "2", Icon: Camera, color: "bg-violet-100 text-violet-600", ring: "ring-violet-50", title: "Photos & details collected", desc: "The AI prompts for photos, measurements, budget, and timescale — everything you need to price the job." },
                { step: "3", Icon: LayoutDashboard, color: "bg-emerald-100 text-emerald-600", ring: "ring-emerald-50", title: "Lead appears in dashboard", desc: "The moment they submit, a structured lead appears in your WorkRate dashboard, ready to quote." },
              ].map(({ step, Icon, color, ring, title, desc }) => (
                <div key={step} className="flex flex-col items-center text-center relative z-10">
                  <div className={`w-20 h-20 rounded-2xl ${color} ring-8 ${ring} flex items-center justify-center mb-6 shadow-sm relative`}>
                    <Icon className="w-9 h-9" />
                    <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-slate-900 text-white text-xs font-black flex items-center justify-center">
                      {step}
                    </span>
                  </div>
                  <h3 className="text-xl font-black text-slate-900 mb-2">{title}</h3>
                  <p className="text-slate-500 font-medium leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Feature highlights ────────────────────────────────────────────── */}
        <section className="py-24 md:py-32 max-w-5xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-black tracking-tight text-slate-900 mb-4">
              Everything you need
            </h2>
            <p className="text-lg text-slate-500 font-medium max-w-xl mx-auto">
              WorkRate handles the admin so you can focus on the work.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { Icon: Zap, color: "bg-amber-50 text-amber-600", title: "AI Enquiry Capture", desc: "Embed on your site or share the link. The AI captures name, contact, project type, location, measurements, budget, timescale, and photos." },
              { Icon: FileText, color: "bg-blue-50 text-blue-600", title: "Smart Quote Generation", desc: "Turn a conversational job description into a line-item estimate with materials and labour — in seconds." },
              { Icon: LayoutDashboard, color: "bg-violet-50 text-violet-600", title: "Lead Pipeline", desc: "Track every enquiry from new lead to won job. Never lose track of a quote or miss a follow-up again." },
              { Icon: Camera, color: "bg-emerald-50 text-emerald-600", title: "Photo Collection", desc: "Customers upload photos during the chat. The AI analyses dimensions and features to give you richer context." },
              { Icon: Users, color: "bg-rose-50 text-rose-600", title: "Customer Records", desc: "Every enquiry builds a contact record with full chat history, attachments, and AI-generated summaries." },
              { Icon: ShieldCheck, color: "bg-slate-100 text-slate-600", title: "WorkRate Brain", desc: "Train the AI on your business — pricing rates, materials, trade preferences — so every quote reflects your style." },
            ].map(({ Icon, color, title, desc }) => (
              <div key={title} className="bg-white rounded-2xl p-7 border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                <div className={`w-11 h-11 rounded-xl ${color} flex items-center justify-center mb-4`}>
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-black text-slate-900 mb-2">{title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed font-medium">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Social proof ──────────────────────────────────────────────────── */}
        <section className="border-y border-slate-100 bg-slate-50 py-10">
          <div className="max-w-5xl mx-auto px-6 flex flex-wrap justify-center md:justify-between items-center gap-6">
            {[
              { name: "Hartley Joinery", label: "Bespoke joinery & fitted furniture" },
              { name: "TrueFlow Plumbing", label: "Bathrooms, boilers & heating" },
              { name: "Apex Electrical", label: "Rewires, EV chargers & more" },
              { name: "City Builders", label: "Extensions & conversions" },
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
        </section>

        {/* ── Final dual CTA ────────────────────────────────────────────────── */}
        <section className="py-24 md:py-32">
          <div className="max-w-3xl mx-auto px-6 text-center">
            <h2 className="text-4xl md:text-6xl font-black tracking-tighter text-slate-900 mb-6">
              Ready to get started?
            </h2>
            <p className="text-lg text-slate-500 font-medium mb-10 max-w-lg mx-auto">
              Trade businesses: set up your dashboard and start capturing leads today. Customers: try the AI and get a quote in minutes.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/sign-up">
                <button className="group w-full sm:w-auto inline-flex items-center justify-center gap-3 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-lg font-black px-10 py-5 rounded-2xl shadow-xl hover:shadow-2xl transition-all hover:-translate-y-0.5">
                  <LayoutDashboard className="w-5 h-5" />
                  Get Started Free
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
              </Link>
              <button
                onClick={() => widgetRef.current?.open()}
                className="group w-full sm:w-auto inline-flex items-center justify-center gap-3 border-2 border-slate-200 hover:border-slate-300 text-slate-700 hover:text-slate-900 text-lg font-black px-10 py-5 rounded-2xl transition-all hover:-translate-y-0.5"
              >
                <MessageCircle className="w-5 h-5 text-blue-500" />
                Try WorkRate AI
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ────────────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-100 py-8">
        <div className="max-w-5xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-[#2563EB] rounded-md flex items-center justify-center">
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
            <Link href="/sign-in">
              <span className="hover:text-slate-700 font-semibold transition-colors cursor-pointer">Business login</span>
            </Link>
            <Link href="/sign-up">
              <span className="hover:text-slate-700 font-semibold transition-colors cursor-pointer">Get started</span>
            </Link>
          </div>
        </div>
      </footer>

      {/* ── Embedded chat widget ──────────────────────────────────────────────── */}
      <ChatWidget ref={widgetRef} />
    </div>
  );
}
