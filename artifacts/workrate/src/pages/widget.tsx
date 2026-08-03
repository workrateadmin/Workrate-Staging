/**
 * WorkRate Chat Widget — iframe-embeddable page
 *
 * Standalone public page — no auth, no app chrome.
 * Designed to be embedded on customer websites via an <iframe> snippet.
 *
 * When opened directly (not in an iframe) it renders a faint demo background
 * so the tradesperson can preview their widget in context.
 */
import ChatWidget from "@/components/chat-widget";

export default function WidgetPage() {
  const isEmbedded = typeof window !== "undefined" && window !== window.top;

  return (
    <div className="w-full h-full min-h-screen relative">
      {/* Demo background — only shown when opened directly, not inside an iframe */}
      {!isEmbedded && (
        <div
          className="absolute inset-0 pointer-events-none select-none"
          style={{
            backgroundImage: `
              linear-gradient(rgba(148,163,184,0.07) 1px, transparent 1px),
              linear-gradient(90deg, rgba(148,163,184,0.07) 1px, transparent 1px)
            `,
            backgroundSize: "40px 40px",
            backgroundColor: "#F8FAFC",
          }}
        >
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 text-slate-300">
            <div className="text-center space-y-2">
              <p className="text-4xl font-black tracking-tight text-slate-200">Your website</p>
              <p className="text-sm font-semibold text-slate-300">The WorkRate widget appears in the bottom-right corner</p>
            </div>
            <div className="flex gap-6 opacity-30">
              {["About", "Services", "Portfolio", "Contact"].map((item) => (
                <span key={item} className="text-sm font-semibold text-slate-400">{item}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      <ChatWidget />
    </div>
  );
}
