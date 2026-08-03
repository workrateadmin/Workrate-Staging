/**
 * Customer-facing public landing page
 *
 * No login required. Customers click "Get a Quote" to open the
 * WorkRate AI Assistant and submit their enquiry.
 *
 * A discreet "Business Login" link is available for trade business owners.
 */
import { useRef } from "react";
import { Link } from "wouter";
import { ArrowRight, Clock, Camera, Star, CheckCircle2, ShieldCheck, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import ChatWidget, { type ChatWidgetHandle } from "@/components/chat-widget";

export default function LandingPage() {
  const widgetRef = useRef<ChatWidgetHandle>(null);

  return (
    <div className="flex flex-col min-h-[100dvh] bg-white">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="px-6 md:px-10 py-4 flex items-center justify-between border-b border-slate-100 sticky top-0 z-40 bg-white/90 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-[#2563EB] rounded-lg flex items-center justify-center">
            <svg className="w-4.5 h-4.5 text-white w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <span className="font-black text-xl tracking-tight text-slate-900">WorkRate</span>
        </div>
        <Link href="/sign-in">
          <button className="text-sm font-semibold text-slate-500 hover:text-slate-900 transition-colors px-4 py-2 rounded-lg hover:bg-slate-50">
            Business login →
          </button>
        </Link>
      </header>

      <main className="flex-1">

        {/* ── Hero ────────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden">
          {/* Background gradient */}
          <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-[#1e3a8a]" />
          {/* Subtle grid texture */}
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage: `linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)`,
              backgroundSize: "50px 50px",
            }}
          />
          {/* Glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-blue-500/20 rounded-full blur-[120px]" />

          <div className="relative z-10 max-w-5xl mx-auto px-6 py-24 md:py-36 text-center">
            {/* Trust badge */}
            <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 text-white/80 text-xs font-bold tracking-widest uppercase px-4 py-2 rounded-full mb-10">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              AI-Powered · Fast Quotes · No Waiting
            </div>

            <h1 className="text-5xl md:text-7xl font-black tracking-tighter text-white mb-6 leading-[1.05]">
              Get a fast, accurate<br />
              <span className="text-[#60A5FA]">quote in minutes.</span>
            </h1>
            <p className="text-lg md:text-xl text-slate-300 mb-12 max-w-2xl mx-auto leading-relaxed font-medium">
              Chat with our AI assistant, describe your project, upload photos — and receive a professional quote from our team. No forms. No waiting on hold.
            </p>

            <button
              onClick={() => widgetRef.current?.open()}
              className="group inline-flex items-center gap-3 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-lg font-black px-10 py-5 rounded-2xl shadow-[0_8px_40px_rgba(37,99,235,0.5)] hover:shadow-[0_12px_50px_rgba(37,99,235,0.6)] transition-all hover:-translate-y-0.5 active:translate-y-0"
            >
              <MessageCircle className="w-6 h-6" />
              Get a Quote
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>

            <div className="mt-8 flex flex-wrap justify-center gap-6 text-sm font-semibold text-slate-400">
              <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Free, no obligation</span>
              <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Takes 2–3 minutes</span>
              <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Upload photos of the job</span>
            </div>
          </div>
        </section>

        {/* ── Social proof strip ──────────────────────────────────────────── */}
        <section className="border-y border-slate-100 bg-slate-50 py-8">
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

        {/* ── How it works ────────────────────────────────────────────────── */}
        <section className="py-24 md:py-32 max-w-5xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-black tracking-tight text-slate-900 mb-4">
              How it works
            </h2>
            <p className="text-lg text-slate-500 font-medium max-w-xl mx-auto">
              Three simple steps from enquiry to quote.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 relative">
            {/* Connector line (desktop) */}
            <div className="hidden md:block absolute top-10 left-[calc(16.67%+1rem)] right-[calc(16.67%+1rem)] h-px bg-slate-200" />

            {[
              {
                step: "1",
                icon: MessageCircle,
                color: "bg-blue-50 text-blue-600",
                ring: "ring-blue-100",
                title: "Chat with our AI",
                desc: "Describe your project — what you need, where you are, your timeline. Our AI asks the right questions.",
              },
              {
                step: "2",
                icon: Camera,
                color: "bg-violet-50 text-violet-600",
                ring: "ring-violet-100",
                title: "Share photos",
                desc: "Upload photos of the space or job site. Our AI analyses dimensions, materials, and complexity.",
              },
              {
                step: "3",
                icon: Clock,
                color: "bg-emerald-50 text-emerald-600",
                ring: "ring-emerald-100",
                title: "Receive your quote",
                desc: "We review your enquiry and send a detailed, itemised quote — usually the same day.",
              },
            ].map(({ step, icon: Icon, color, ring, title, desc }) => (
              <div key={step} className="flex flex-col items-center text-center relative z-10">
                <div className={`w-20 h-20 rounded-2xl ${color} ring-8 ${ring} flex items-center justify-center mb-6 shadow-sm`}>
                  <Icon className="w-9 h-9" />
                </div>
                <div className="absolute top-7 right-0 left-0 flex justify-center">
                  <span className="w-6 h-6 rounded-full bg-slate-900 text-white text-xs font-black flex items-center justify-center -mt-3">
                    {step}
                  </span>
                </div>
                <h3 className="text-xl font-black text-slate-900 mb-2">{title}</h3>
                <p className="text-slate-500 font-medium leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Feature highlights ──────────────────────────────────────────── */}
        <section className="bg-slate-50 py-24 md:py-32">
          <div className="max-w-5xl mx-auto px-6">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-black tracking-tight text-slate-900 mb-4">
                Why customers love it
              </h2>
              <p className="text-lg text-slate-500 font-medium max-w-xl mx-auto">
                No phone tag. No back-and-forth emails. Just fast, professional service.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {[
                {
                  emoji: "⚡",
                  title: "Instant responses",
                  desc: "Our AI assistant is available 24/7. Ask about your project any time, day or night.",
                },
                {
                  emoji: "📸",
                  title: "Upload photos",
                  desc: "Show us exactly what you need done. Our AI reads the space and provides more accurate quotes.",
                },
                {
                  emoji: "💬",
                  title: "Natural conversation",
                  desc: "No confusing forms. Just chat naturally — like texting a friend who happens to know trades.",
                },
                {
                  emoji: "🔒",
                  title: "Your details are safe",
                  desc: "We only use your information to prepare your quote. We never share it with third parties.",
                },
                {
                  emoji: "📋",
                  title: "Detailed quotes",
                  desc: "Every quote includes a breakdown of materials, labour, and timeline — no hidden surprises.",
                },
                {
                  emoji: "🏆",
                  title: "Trusted tradespeople",
                  desc: "Fully insured, qualified professionals with years of experience across the UK.",
                },
              ].map(({ emoji, title, desc }) => (
                <div key={title} className="bg-white rounded-2xl p-7 border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                  <div className="text-3xl mb-4">{emoji}</div>
                  <h3 className="text-lg font-black text-slate-900 mb-2">{title}</h3>
                  <p className="text-slate-500 text-sm leading-relaxed font-medium">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Bottom CTA ──────────────────────────────────────────────────── */}
        <section className="py-24 md:py-32">
          <div className="max-w-3xl mx-auto px-6 text-center">
            <div className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-bold px-4 py-2 rounded-full mb-8">
              <ShieldCheck className="w-4 h-4" />
              Free enquiry · No obligation to proceed
            </div>
            <h2 className="text-4xl md:text-6xl font-black tracking-tighter text-slate-900 mb-6">
              Ready to get<br />your quote?
            </h2>
            <p className="text-lg text-slate-500 font-medium mb-10">
              It takes just a few minutes. Our AI will guide you through everything we need to give you an accurate price.
            </p>
            <button
              onClick={() => widgetRef.current?.open()}
              className="group inline-flex items-center gap-3 bg-slate-900 hover:bg-slate-800 text-white text-lg font-black px-10 py-5 rounded-2xl shadow-xl hover:shadow-2xl transition-all hover:-translate-y-0.5 active:translate-y-0"
            >
              <MessageCircle className="w-6 h-6" />
              Start your free enquiry
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </section>
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
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
          <Link href="/sign-in">
            <span className="text-sm text-slate-400 hover:text-slate-700 font-semibold transition-colors cursor-pointer">
              Are you a trades business? Log in to your dashboard →
            </span>
          </Link>
        </div>
      </footer>

      {/* ── Embedded chat widget ─────────────────────────────────────────────── */}
      <ChatWidget ref={widgetRef} />
    </div>
  );
}
