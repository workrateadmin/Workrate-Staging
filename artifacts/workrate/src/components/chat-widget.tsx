/**
 * WorkRate Chat Widget — shared component
 *
 * Used by:
 *   - The public landing page (embedded, triggered by "Get a Quote" button)
 *   - The /widget route (iframe-embeddable version for customer websites)
 *
 * Exposes an imperative handle so a parent can call .open() programmatically.
 */
import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import {
  Send, X, Loader2, Camera, MessageCircle,
  CheckCircle2, ChevronDown, ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────
export type ChatMessage = {
  role: string;
  content: string;
  imageUrl?: string;
};

export type WidgetStage = "closed" | "welcome" | "trade" | "chat";

export type ChatWidgetHandle = {
  open: () => void;
  close: () => void;
};

// ── Trade options ─────────────────────────────────────────────────────────────
export const TRADES = [
  { id: "Joinery",  label: "Joinery",       icon: "🪵", desc: "Wardrobes, media walls, kitchens & bespoke" },
  { id: "Building", label: "Building",      icon: "🧱", desc: "Extensions, conversions, structural" },
  { id: "Electrical", label: "Electrical",  icon: "⚡", desc: "Rewires, consumer units, EV chargers" },
  { id: "Plumbing", label: "Plumbing",      icon: "🔧", desc: "Boilers, bathrooms, heating" },
  { id: "General",  label: "Other project", icon: "🔨", desc: "Something else entirely" },
];

// ── SSE parser ────────────────────────────────────────────────────────────────
function parseSse(raw: string): { content?: string; done?: boolean }[] {
  return raw
    .split("\n")
    .filter((l) => l.startsWith("data: "))
    .map((l) => { try { return JSON.parse(l.slice(6)); } catch { return {}; } });
}

// ── Chat Widget ───────────────────────────────────────────────────────────────
const ChatWidget = forwardRef<ChatWidgetHandle, { onOpenChange?: (open: boolean) => void; embedded?: boolean }>(
  function ChatWidget({ onOpenChange, embedded = false }, ref) {
    // In embedded mode the launcher button is provided by widget.js outside the
    // iframe, so the widget starts open (welcome stage) and never goes "closed".
    const [stage, setStage] = useState<WidgetStage>(embedded ? "welcome" : "closed");
    const [tradeType, setTradeType] = useState<string | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [isStarting, setIsStarting] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputValue, setInputValue] = useState("");
    const [isStreaming, setIsStreaming] = useState(false);
    const [isComplete, setIsComplete] = useState(false);
    const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);
    const [pendingPhotoPreview, setPendingPhotoPreview] = useState<string | null>(null);
    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
    const [unread, setUnread] = useState(false);
    // ── Concept visual state ───────────────────────────────────────────────────
    const [conceptState, setConceptState] = useState<
      "idle" | "offered" | "generating" | "generated" | "awaiting_revision" | "done" | "failed"
    >("idle");
    const [conceptImageUrl, setConceptImageUrl] = useState<string | null>(null);
    const [conceptId, setConceptId] = useState<number | null>(null);
    const [conceptGenCount, setConceptGenCount] = useState(0);
    const [revisionInput, setRevisionInput] = useState("");

    const scrollRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Auto-scroll
    useEffect(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }, [messages]);

    // Unread dot when closed
    useEffect(() => {
      if (stage === "closed" && messages.length > 0) {
        const last = messages[messages.length - 1];
        if (last?.role === "assistant" && last.content) setUnread(true);
      }
    }, [messages, stage]);

    // Notify parent widget.js of unread messages when in embedded mode
    useEffect(() => {
      if (embedded && unread) {
        window.parent.postMessage({ type: "workrate:unread" }, "*");
      }
    }, [embedded, unread]);

    // Notify parent of open/close
    useEffect(() => {
      onOpenChange?.(stage !== "closed");
    }, [stage, onOpenChange]);

    const open = useCallback(() => {
      setUnread(false);
      setStage(token ? "chat" : "welcome");
    }, [token]);

    const close = useCallback(() => {
      if (embedded) {
        // Tell the parent page (widget.js) to hide the panel. The iframe itself
        // stays mounted so the next open is instant.
        window.parent.postMessage({ type: "workrate:close" }, "*");
      } else {
        setStage("closed");
      }
    }, [embedded]);

    // Expose open/close to parent via ref
    useImperativeHandle(ref, () => ({ open, close }), [open, close]);

    // ── Start chat ────────────────────────────────────────────────────────────
    async function startChat(type: string) {
      setIsStarting(true);
      setTradeType(type);
      // Read business_id injected by widget.js into the iframe URL
      const businessId = typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("business_id") ?? undefined
        : undefined;
      try {
        const res = await fetch("/api/chat/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tradeType: type, ...(businessId ? { businessId } : {}) }),
        });
        if (!res.ok) throw new Error("Failed");
        const data = await res.json();
        setToken(data.token);
        setStage("chat");
        const sessionRes = await fetch(`/api/chat/${data.token}`);
        if (sessionRes.ok) {
          const session = await sessionRes.json();
          if (session.messages?.length) {
            setMessages(session.messages.map((m: any) => ({ role: m.role, content: m.content })));
          }
        }
      } catch {
        setTradeType(null);
        setStage("trade");
      } finally {
        setIsStarting(false);
      }
    }

    // ── Send message ──────────────────────────────────────────────────────────
    const sendMessage = useCallback(async (e: React.FormEvent) => {
      e.preventDefault();
      if (isStreaming || !token || isComplete) return;
      if (pendingPhoto) { await uploadPhoto(); return; }
      if (!inputValue.trim()) return;

      const userMsg = inputValue.trim();
      setInputValue("");
      setMessages((prev) => [...prev, { role: "customer", content: userMsg }, { role: "assistant", content: "" }]);
      setIsStreaming(true);

      try {
        const res = await fetch(`/api/chat/${token}/message`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: userMsg }),
        });
        if (!res.ok || !res.body) throw new Error("Stream error");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let done = false;
        while (!done) {
          const { value, done: readerDone } = await reader.read();
          done = readerDone;
          if (value) {
            buffer += decoder.decode(value, { stream: true });
            const events = parseSse(buffer);
            const nl = buffer.lastIndexOf("\n");
            buffer = nl >= 0 ? buffer.slice(nl + 1) : buffer;
            for (const ev of events) {
              if (ev.completed) {
                setIsComplete(true);
              }
              if (ev.content) {
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last?.role === "assistant") last.content += ev.content;
                  return updated;
                });
              }
            }
          }
        }
      } catch {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant" && !last.content) {
            last.content = "Sorry, there was a connection issue. Please try again.";
          }
          return updated;
        });
      } finally {
        setIsStreaming(false);
        setTimeout(() => {
          setMessages((prev) => {
            const assistantMsgs = prev.filter((m) => m.role === "assistant");
            const last = assistantMsgs[assistantMsgs.length - 1];
            if (
              last?.content.toLowerCase().includes("been submitted") ||
              last?.content.toLowerCase().includes("team will be in touch") ||
              last?.content.toLowerCase().includes("enquiry has been submitted")
            ) {
              setIsComplete(true);
            }
            return prev;
          });
        }, 100);
      }
    }, [isStreaming, token, isComplete, pendingPhoto, inputValue]);

    // ── Photo upload ──────────────────────────────────────────────────────────
    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
      const file = e.target.files?.[0];
      if (!file) return;
      setPendingPhoto(file);
      setPendingPhotoPreview(URL.createObjectURL(file));
      e.target.value = "";
    }

    function cancelPhoto() {
      if (pendingPhotoPreview) URL.revokeObjectURL(pendingPhotoPreview);
      setPendingPhoto(null);
      setPendingPhotoPreview(null);
    }

    // ── Concept visual handlers ────────────────────────────────────────────────
    async function handleCreateConcept() {
      if (!token) return;
      setConceptState("generating");
      // 90 s client-side abort — matches server's 85 s AbortSignal so the server
      // always finishes first and can mark the record before we give up.
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90_000);
      try {
        const res = await fetch(`/api/chat/${token}/concept-visual/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
          signal: controller.signal,
        });
        const data = await res.json();
        if (!res.ok || data.status === "failed") throw new Error(data.error ?? "Generation failed");
        setConceptImageUrl(data.imageUrl);
        setConceptId(data.conceptId);
        setConceptGenCount(1);
        setConceptState("generated");
      } catch {
        // Enquiry is already safely saved. Generation failure is non-fatal.
        setConceptState("failed");
      } finally {
        clearTimeout(timeoutId);
      }
    }

    async function handleConceptFeedback(feedback: "selected" | "skipped") {
      if (token && conceptId !== null) {
        try {
          await fetch(`/api/chat/${token}/concept-visual/${conceptId}/feedback`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ feedback, isPreferred: feedback === "selected" }),
          });
        } catch { /* ignore — non-critical */ }
      }
      setConceptState("done");
    }

    async function submitRevision() {
      if (!token || !revisionInput.trim()) return;
      const notes = revisionInput.trim();
      setRevisionInput("");
      setConceptState("generating");
      if (conceptId !== null) {
        try {
          await fetch(`/api/chat/${token}/concept-visual/${conceptId}/feedback`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ feedback: "revision_requested", revisionText: notes }),
          });
        } catch { /* ignore */ }
      }
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90_000);
      try {
        const res = await fetch(`/api/chat/${token}/concept-visual/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ revisionNotes: notes }),
          signal: controller.signal,
        });
        const data = await res.json();
        if (!res.ok || data.status === "failed") throw new Error(data.error ?? "Generation failed");
        setConceptImageUrl(data.imageUrl);
        setConceptId(data.conceptId);
        setConceptGenCount((c) => c + 1);
        setConceptState("generated");
      } catch {
        setConceptState("failed");
      } finally {
        clearTimeout(timeoutId);
      }
    }

    async function uploadPhoto() {
      if (!pendingPhoto || !token) return;
      setIsUploadingPhoto(true);
      const localPreview = pendingPhotoPreview!;
      setMessages((prev) => [
        ...prev,
        { role: "customer", content: "📷 Photo attached", imageUrl: localPreview },
        { role: "assistant", content: "" },
      ]);
      setIsStreaming(true);
      setPendingPhoto(null);
      setPendingPhotoPreview(null);
      try {
        const fd = new FormData();
        fd.append("photo", pendingPhoto ?? new Blob());
        const res = await fetch(`/api/chat/${token}/upload`, { method: "POST", body: fd });
        if (!res.ok) throw new Error("Upload failed");
        const data = await res.json();
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant") {
            last.content = data.aiMessage ?? "Thanks for the photo! Could you tell me more?";
          }
          return updated;
        });
        if (data.completed) {
          setIsComplete(true);
        }
        if (data.conceptVisualOffer) {
          setConceptState("offered");
        }
      } catch {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant" && !last.content) {
            last.content = "Sorry, I couldn't process that photo. Please try again.";
          }
          return updated;
        });
      } finally {
        setIsStreaming(false);
        setIsUploadingPhoto(false);
      }
    }

    const selectedTrade = TRADES.find((t) => t.id === tradeType);
    const isOpen = stage !== "closed";

    return (
      // In embedded mode the entire component is the panel content — no fixed
      // positioning, no launcher button; it fills the iframe viewport.
      // In standalone mode it floats fixed over the page as before.
      <div className={embedded
        ? "w-full h-screen flex flex-col overflow-hidden bg-white"
        : "fixed bottom-5 right-5 z-[9999] flex flex-col items-end gap-3 pointer-events-none"
      }>

        {/* ── Chat panel ───────────────────────────────────────────────── */}
        <div
          className={cn(
            "bg-white flex flex-col overflow-hidden",
            embedded
              // Embedded: fills the entire iframe — no positioning, border, or shadow
              ? "w-full h-full flex-1"
              // Standalone: floating card with animation
              : cn(
                  "w-[370px] rounded-2xl shadow-2xl border border-white/20",
                  "transition-all duration-300 ease-out origin-bottom-right",
                  isOpen
                    ? "opacity-100 scale-100 translate-y-0 pointer-events-auto"
                    : "opacity-0 scale-95 translate-y-4 pointer-events-none",
                ),
          )}
          style={embedded ? undefined : { height: 580, maxHeight: "calc(100vh - 100px)" }}
        >
          {/* ── Panel header ──────────────────────────────────────────── */}
          <div
            className="flex items-center justify-between px-5 py-4 shrink-0"
            style={{ background: "linear-gradient(135deg, #1E293B 0%, #0F172A 100%)" }}
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center shadow-lg shrink-0">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-bold text-white leading-tight">WorkRate Assistant</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[11px] text-slate-400 font-medium">
                    {stage === "chat" && selectedTrade
                      ? `${selectedTrade.icon} ${selectedTrade.label} enquiry`
                      : "Online · Typically replies in minutes"}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={close}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors text-white/70 hover:text-white"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          {/* ── Welcome screen ────────────────────────────────────────── */}
          {stage === "welcome" && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div
                className="px-6 pt-8 pb-10 text-white text-center"
                style={{ background: "linear-gradient(160deg, #5eead4 0%, #2dd4bf 60%, #1E293B 100%)" }}
              >
                <div className="w-16 h-16 bg-white/15 backdrop-blur rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg border border-white/20">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                </div>
                <h2 className="text-xl font-black mb-2 tracking-tight">Hi there! 👋</h2>
                <p className="text-sm text-teal-100 font-medium leading-relaxed">
                  Tell us about your project and we'll help you get an accurate quote — fast.
                </p>
              </div>

              <div className="flex-1 bg-white px-5 py-6 flex flex-col gap-4">
                <button
                  onClick={() => setStage("trade")}
                  className="w-full flex items-center justify-between bg-primary hover:bg-primary/80 text-primary-foreground font-bold rounded-xl px-5 py-4 transition-all shadow-md hover:shadow-lg group"
                >
                  <div className="flex items-center gap-3">
                    <MessageCircle className="w-5 h-5" />
                    <span>Start a conversation</span>
                  </div>
                  <span className="text-white/70 group-hover:translate-x-0.5 transition-transform">→</span>
                </button>

                <div className="flex items-center gap-3 text-xs text-slate-400">
                  <div className="flex -space-x-2">
                    {["🪵","🧱","⚡"].map((e, i) => (
                      <div key={i} className="w-7 h-7 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-sm">{e}</div>
                    ))}
                  </div>
                  <span className="font-medium text-slate-500">Joinery, building, electrical & more</span>
                </div>

                <div className="mt-auto pt-4 border-t border-slate-100 text-center">
                  <p className="text-[11px] text-slate-400 font-medium">
                    Powered by{" "}
                    <span className="font-bold text-slate-500">WorkRate</span>
                    {" · "}Your details are used only to prepare your quote
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── Trade selector ─────────────────────────────────────────── */}
          {stage === "trade" && (
            <div className="flex-1 flex flex-col overflow-hidden bg-white">
              <div className="px-5 pt-5 pb-3 border-b border-slate-100">
                <p className="text-sm font-bold text-slate-800">What kind of work do you need?</p>
                <p className="text-xs text-slate-500 mt-1">Select the type that best fits your project</p>
              </div>
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5">
                {TRADES.map((trade) => (
                  <button
                    key={trade.id}
                    onClick={() => startChat(trade.id)}
                    disabled={isStarting}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-100 bg-white hover:border-primary/30 hover:bg-teal-50/50 transition-all text-left group disabled:opacity-60"
                  >
                    <span className="text-xl shrink-0">{trade.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800 group-hover:text-primary transition-colors">{trade.label}</p>
                      <p className="text-xs text-slate-500 truncate">{trade.desc}</p>
                    </div>
                    {isStarting && tradeType === trade.id
                      ? <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
                      : <span className="text-slate-300 group-hover:text-primary transition-colors text-sm">→</span>
                    }
                  </button>
                ))}
              </div>
              <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/80">
                <button onClick={() => setStage("welcome")} className="text-xs text-slate-400 hover:text-slate-600 transition-colors font-medium">
                  ← Back
                </button>
              </div>
            </div>
          )}

          {/* ── Chat messages ──────────────────────────────────────────── */}
          {stage === "chat" && (
            <>
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-slate-50/60">
                {messages.map((msg, i) => (
                  <div key={i} className={cn("flex gap-2", msg.role === "customer" ? "justify-end" : "justify-start")}>
                    {msg.role === "assistant" && (
                      <div className="w-7 h-7 bg-primary rounded-full flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                            d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                      </div>
                    )}
                    <div className={cn(
                      "max-w-[80%] rounded-2xl text-sm leading-relaxed overflow-hidden shadow-sm",
                      msg.role === "customer"
                        ? "bg-primary text-primary-foreground rounded-tr-sm"
                        : "bg-white border border-slate-100 rounded-tl-sm text-slate-800"
                    )}>
                      {msg.imageUrl && (
                        <img src={msg.imageUrl} alt="Upload" className="max-w-full max-h-40 object-cover" />
                      )}
                      {msg.content && (
                        <p className="px-3.5 py-2.5 whitespace-pre-wrap">{msg.content}</p>
                      )}
                      {!msg.content && msg.role === "assistant" && isStreaming && (
                        <div className="px-3.5 py-3 flex gap-1 items-center">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" />
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:0.15s]" />
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:0.3s]" />
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {/* ── AI Concept Visual flow ────────────────────────────────
                    The concept offer is shown as part of the completion flow.
                    The green "Enquiry submitted" card is held back while the
                    concept offer is active; it appears only after the customer
                    accepts, declines, or the flow resolves. This way the offer
                    feels like a natural next step, not an afterthought.
                ─────────────────────────────────────────────────────────── */}

                {/* Offer: before the customer has made a choice */}
                {isComplete && conceptState === "offered" && (
                  <div className="flex justify-center">
                    <div className="bg-violet-50 border border-violet-200 rounded-2xl px-5 py-5 text-center max-w-[290px] shadow-sm">
                      <div className="w-10 h-10 bg-violet-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <ImageIcon className="w-5 h-5 text-violet-600" />
                      </div>
                      <p className="font-bold text-violet-900 text-sm mb-1">One more thing…</p>
                      <p className="text-violet-700 text-xs mb-4 font-medium leading-relaxed">
                        Would you like me to create an AI concept image showing roughly how this could look in your space? It only takes about 30 seconds.
                      </p>
                      <div className="flex flex-col gap-2">
                        <button
                          onClick={handleCreateConcept}
                          className="w-full bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold rounded-xl py-2.5 transition-colors"
                        >
                          ✨ Create concept
                        </button>
                        <button
                          onClick={() => setConceptState("done")}
                          className="w-full bg-white hover:bg-violet-50 text-violet-600 border border-violet-200 text-sm font-semibold rounded-xl py-2 transition-colors"
                        >
                          No thanks
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Generating */}
                {isComplete && conceptState === "generating" && (
                  <div className="flex justify-center">
                    <div className="bg-violet-50 border border-violet-200 rounded-2xl px-5 py-6 text-center max-w-[290px]">
                      <Loader2 className="w-7 h-7 text-violet-500 mx-auto mb-3 animate-spin" />
                      <p className="font-bold text-violet-800 text-sm">Creating your AI concept visual</p>
                      <p className="text-violet-600 text-xs mt-1.5 font-medium leading-relaxed">
                        This usually takes around a minute — your enquiry is already safely saved.
                      </p>
                    </div>
                  </div>
                )}

                {/* Generated: show image + feedback */}
                {isComplete && conceptState === "generated" && conceptImageUrl && (
                  <div className="flex justify-center">
                    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden max-w-[290px] shadow-sm">
                      <div className="relative">
                        <img
                          src={conceptImageUrl}
                          alt="AI Concept Visual"
                          className="w-full object-cover"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                        />
                        <div className="absolute top-2 left-2 bg-violet-600 text-white text-[9px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider shadow">
                          AI Concept Visual
                        </div>
                      </div>
                      <div className="px-4 py-4">
                        <p className="text-slate-800 text-sm font-semibold leading-relaxed mb-1">
                          Here's an early concept based on what you've described. Is this roughly the look you had in mind?
                        </p>
                        <p className="text-[10px] text-slate-400 font-medium mb-4 leading-relaxed">
                          Concept image for visualisation only. Final design, dimensions and specification are subject to site survey and approval.
                        </p>
                        <div className="flex flex-col gap-2">
                          <button
                            onClick={() => handleConceptFeedback("selected")}
                            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold rounded-xl py-2.5 transition-colors"
                          >
                            ✓ Yes, I like this
                          </button>
                          {conceptGenCount < 2 && (
                            <button
                              onClick={() => setConceptState("awaiting_revision")}
                              className="w-full bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-sm font-semibold rounded-xl py-2 transition-colors"
                            >
                              I'd change something
                            </button>
                          )}
                          <button
                            onClick={() => handleConceptFeedback("skipped")}
                            className="w-full text-slate-400 hover:text-slate-600 text-xs font-medium py-1 transition-colors"
                          >
                            Skip visual
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Revision input */}
                {isComplete && conceptState === "awaiting_revision" && (
                  <div className="flex justify-center">
                    <div className="bg-white border border-slate-200 rounded-2xl px-4 py-4 max-w-[290px] shadow-sm">
                      <p className="text-slate-800 text-sm font-bold mb-1">What would you change?</p>
                      <p className="text-slate-500 text-xs mb-3 font-medium leading-relaxed">
                        One short instruction — e.g. "Make it darker" or "Add open shelving on the left"
                      </p>
                      <input
                        value={revisionInput}
                        onChange={(e) => setRevisionInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && revisionInput.trim()) submitRevision(); }}
                        placeholder="Describe your change…"
                        maxLength={200}
                        className="w-full px-3 py-2.5 text-sm rounded-xl bg-slate-100 border-none outline-none focus:ring-2 focus:ring-violet-300 mb-3"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={submitRevision}
                          disabled={!revisionInput.trim()}
                          className="flex-1 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-200 text-white disabled:text-slate-400 text-sm font-bold rounded-xl py-2.5 transition-colors"
                        >
                          Update concept
                        </button>
                        <button
                          onClick={() => { setConceptState("generated"); setRevisionInput(""); }}
                          className="px-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-500 text-sm rounded-xl transition-colors"
                        >
                          Back
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Generation failed — friendly non-fatal message */}
                {isComplete && conceptState === "failed" && (
                  <div className="flex justify-center">
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-center max-w-[290px]">
                      <p className="text-slate-600 text-xs font-medium leading-relaxed">
                        I couldn't create the concept visual this time, but your enquiry has been submitted successfully and we'll be in touch soon.
                      </p>
                    </div>
                  </div>
                )}

                {/* Concept saved confirmation (after customer interacted) */}
                {isComplete && conceptState === "done" && conceptImageUrl && (
                  <div className="flex justify-center">
                    <div className="bg-violet-50 border border-violet-200 rounded-2xl px-5 py-3 text-center max-w-[280px]">
                      <p className="text-violet-700 text-xs font-medium">Your concept visual has been saved with your enquiry.</p>
                    </div>
                  </div>
                )}

                {/* Green confirmation card — shown only once the concept offer is
                    resolved (idle = no offer made; done/failed = offer completed).
                    This prevents it appearing before the customer has seen the offer. */}
                {isComplete && (conceptState === "idle" || conceptState === "done" || conceptState === "failed") && (
                  <div className="flex justify-center">
                    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-4 text-center max-w-[280px]">
                      <CheckCircle2 className="w-7 h-7 text-emerald-500 mx-auto mb-2" />
                      <p className="font-bold text-emerald-800 text-sm">Enquiry submitted!</p>
                      <p className="text-emerald-700 text-xs mt-1 font-medium">We'll be in touch to discuss your quote.</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Input bar */}
              {!isComplete && (
                <div className="bg-white border-t border-slate-100 px-3 py-3 shrink-0">
                  {pendingPhotoPreview && (
                    <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2 mb-2 border border-slate-100">
                      <img src={pendingPhotoPreview} alt="" className="w-10 h-10 object-cover rounded-lg" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate text-slate-700">{pendingPhoto?.name}</p>
                        <p className="text-[10px] text-slate-500">Ready to send</p>
                      </div>
                      <button onClick={cancelPhoto} className="text-slate-400 hover:text-slate-600 p-1">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                  <form onSubmit={sendMessage} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isStreaming || isUploadingPhoto}
                      title="Attach a photo"
                      className="w-9 h-9 rounded-full bg-teal-50 hover:bg-teal-100 border border-teal-200 hover:border-teal-300 flex items-center justify-center transition-all disabled:opacity-40 shrink-0 group"
                    >
                      <Camera className="w-4 h-4 text-primary group-hover:scale-110 transition-transform" />
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                    <input
                      ref={inputRef}
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      placeholder={pendingPhoto ? "Add a caption (optional)…" : "Type your message…"}
                      disabled={isStreaming || isUploadingPhoto}
                      className="flex-1 h-10 px-4 rounded-full bg-slate-100 border-none outline-none text-sm text-slate-800 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-primary/30 transition-all"
                    />
                    <button
                      type="submit"
                      disabled={(isStreaming || isUploadingPhoto) || (!pendingPhoto && !inputValue.trim())}
                      className="w-9 h-9 rounded-full bg-primary hover:bg-primary/80 disabled:bg-slate-200 flex items-center justify-center transition-all shadow-sm shrink-0"
                    >
                      {isUploadingPhoto ? (
                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                      ) : (
                        <Send className="w-3.5 h-3.5 text-white ml-0.5" />
                      )}
                    </button>
                  </form>
                  <p className="text-center text-[10px] text-slate-400 mt-2 font-medium">
                    Powered by <span className="font-bold">WorkRate</span>
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Launcher bubble — hidden in embedded mode (widget.js owns it) ── */}
        {!embedded && <button
          onClick={isOpen ? close : open}
          className={cn(
            "relative w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all duration-300",
            "hover:scale-110 active:scale-95 pointer-events-auto",
            isOpen
              ? "bg-[#1E293B] hover:bg-[#0F172A]"
              : "bg-primary hover:bg-primary/80"
          )}
          style={{ boxShadow: isOpen ? "0 8px 30px rgba(0,0,0,0.3)" : "0 8px 30px rgba(13,148,136,0.45)" }}
        >
          {unread && !isOpen && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 border-2 border-white rounded-full animate-pulse" />
          )}
          <span className={cn("transition-all duration-300 absolute", isOpen ? "opacity-100 scale-100" : "opacity-0 scale-75")}>
            <ChevronDown className="w-6 h-6 text-white" />
          </span>
          <span className={cn("transition-all duration-300 absolute", isOpen ? "opacity-0 scale-75" : "opacity-100 scale-100")}>
            <MessageCircle className="w-6 h-6 text-white" />
          </span>
        </button>}
      </div>
    );
  }
);

export default ChatWidget;
