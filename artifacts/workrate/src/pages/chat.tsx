import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGetChatSession, getGetChatSessionQueryKey } from "@workspace/api-client-react";
import {
  Send,
  Bot,
  User,
  Loader2,
  ArrowLeft,
  Paperclip,
  X,
  CheckCircle2,
  ImageIcon,
} from "lucide-react";
import { Link } from "wouter";

// ── Types ────────────────────────────────────────────────────────────────────
type ChatMessage = {
  role: string;
  content: string;
  imageUrl?: string; // local preview or uploaded URL
};

// ── Trade options ─────────────────────────────────────────────────────────────
const TRADES = [
  { id: "Joinery", label: "Joinery", icon: "🪵", desc: "Fitted wardrobes, staircases, bespoke furniture" },
  { id: "Building", label: "Building", icon: "🧱", desc: "Extensions, conversions, structural work" },
  { id: "Electrical", label: "Electrical", icon: "⚡", desc: "Rewires, consumer units, EV chargers" },
  { id: "Plumbing", label: "Plumbing", icon: "🔧", desc: "Boilers, bathrooms, heating systems" },
  { id: "Kitchen Installation", label: "Kitchen", icon: "🍳", desc: "Supply & fit kitchens, worktops, appliances" },
];

// ── SSE parser ────────────────────────────────────────────────────────────────
function parseSseChunk(raw: string): { content?: string; done?: boolean }[] {
  const results: { content?: string; done?: boolean }[] = [];
  const lines = raw.split("\n");
  for (const line of lines) {
    if (!line.startsWith("data: ")) continue;
    const jsonStr = line.slice(6).trim();
    if (!jsonStr) continue;
    try {
      results.push(JSON.parse(jsonStr));
    } catch {
      // incomplete chunk — ignore
    }
  }
  return results;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ChatPage() {
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

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load initial session if token is set
  const { data: session } = useGetChatSession(token as string, {
    query: { enabled: !!token, queryKey: getGetChatSessionQueryKey(token as string) },
  });

  useEffect(() => {
    if (session?.messages && messages.length <= 1) {
      if (session.messages.length > 0) {
        setMessages(session.messages.map((m) => ({ role: m.role, content: m.content })));
      }
    }
  }, [session]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // ── Start chat ──────────────────────────────────────────────────────────────
  async function handleStartChat(type: string) {
    setIsStarting(true);
    setTradeType(type);
    try {
      const res = await fetch("/api/chat/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tradeType: type }),
      });
      if (!res.ok) throw new Error("Failed to start chat");
      const data = await res.json();
      setToken(data.token);
    } catch (err) {
      console.error(err);
      alert("Failed to start chat session. Please try again.");
      setTradeType(null);
    } finally {
      setIsStarting(false);
    }
  }

  // ── Send text message ───────────────────────────────────────────────────────
  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (isStreaming || !token || isComplete) return;

    // If there's a pending photo, upload it first
    if (pendingPhoto) {
      await uploadPhoto();
      return;
    }

    if (!inputValue.trim()) return;

    const userMsg = inputValue.trim();
    setInputValue("");
    setMessages((prev) => [...prev, { role: "customer", content: userMsg }]);
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
    setIsStreaming(true);

    try {
      const res = await fetch(`/api/chat/${token}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: userMsg }),
      });

      if (!res.ok || !res.body) throw new Error("Stream failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let done = false;

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          buffer += decoder.decode(value, { stream: true });
          const events = parseSseChunk(buffer);
          // Keep only the incomplete last line in the buffer
          const lastNewline = buffer.lastIndexOf("\n");
          buffer = lastNewline >= 0 ? buffer.slice(lastNewline + 1) : buffer;

          for (const event of events) {
            if (event.content) {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === "assistant") {
                  last.content += event.content;
                }
                return updated;
              });
            }
            if (event.done) {
              setIsComplete(
                messages.some((m) => m.role === "assistant" && m.content.includes("enquiry has been submitted"))
              );
            }
          }
        }
      }
    } catch (err) {
      console.error("Stream failed", err);
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === "assistant" && !last.content) {
          last.content = "Sorry, there was a connection error. Please try again.";
        }
        return updated;
      });
    } finally {
      setIsStreaming(false);
      // Check if assistant's last message indicates completion
      setTimeout(() => {
        setMessages((prev) => {
          const assistantMsgs = prev.filter((m) => m.role === "assistant");
          const last = assistantMsgs[assistantMsgs.length - 1];
          if (last?.content.toLowerCase().includes("enquiry has been submitted") ||
              last?.content.toLowerCase().includes("been submitted") ||
              last?.content.toLowerCase().includes("team will be in touch")) {
            setIsComplete(true);
          }
          return prev;
        });
      }, 100);
    }
  }

  // ── Photo handling ──────────────────────────────────────────────────────────
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingPhoto(file);
    const url = URL.createObjectURL(file);
    setPendingPhotoPreview(url);
    // Clear the file input value so same file can be re-selected
    e.target.value = "";
  }

  function cancelPhoto() {
    if (pendingPhotoPreview) URL.revokeObjectURL(pendingPhotoPreview);
    setPendingPhoto(null);
    setPendingPhotoPreview(null);
  }

  async function uploadPhoto() {
    if (!pendingPhoto || !token) return;
    setIsUploadingPhoto(true);

    // Show the image immediately in chat as a customer message
    const localPreview = pendingPhotoPreview!;
    setMessages((prev) => [
      ...prev,
      { role: "customer", content: "📷 Photo attached", imageUrl: localPreview },
      { role: "assistant", content: "" },
    ]);
    setIsStreaming(true);

    // Clear pending state
    setPendingPhoto(null);
    setPendingPhotoPreview(null);

    try {
      const formData = new FormData();
      formData.append("photo", pendingPhoto ?? new Blob());

      const res = await fetch(`/api/chat/${token}/upload`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();

      // Replace the last empty assistant message with the AI response
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === "assistant") {
          last.content = data.aiMessage ?? "Thanks for the photo! Could you tell me a bit more about the work you're looking to have done?";
        }
        return updated;
      });
    } catch (err) {
      console.error("Photo upload failed", err);
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === "assistant" && !last.content) {
          last.content = "Sorry, I couldn't process that photo. Could you try again or describe what you'd like done?";
        }
        return updated;
      });
    } finally {
      setIsStreaming(false);
      setIsUploadingPhoto(false);
    }
  }

  // ── Trade selection screen ──────────────────────────────────────────────────
  if (!token) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <Link
          href="/"
          className="absolute top-6 left-6 text-sm font-medium flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>

        <div className="w-full max-w-lg space-y-8 animate-in fade-in zoom-in-95 duration-500">
          {/* Logo / branding */}
          <div className="text-center space-y-3">
            <div className="w-16 h-16 bg-primary/10 rounded-2xl mx-auto flex items-center justify-center">
              <Bot className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight">WorkRate Assistant</h1>
              <p className="text-muted-foreground mt-1">
                Tell us about your project and we'll help prepare an accurate quote.
              </p>
            </div>
          </div>

          {/* Trade picker */}
          <div className="space-y-3">
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider text-center">
              What kind of work do you need?
            </p>
            <div className="grid gap-2">
              {TRADES.map((trade) => (
                <button
                  key={trade.id}
                  onClick={() => handleStartChat(trade.id)}
                  disabled={isStarting}
                  className="w-full flex items-center gap-4 px-5 py-4 rounded-xl border-2 border-border bg-card hover:border-primary hover:bg-primary/5 transition-all text-left group disabled:opacity-60"
                >
                  <span className="text-2xl">{trade.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground group-hover:text-primary transition-colors">
                      {trade.label}
                    </p>
                    <p className="text-sm text-muted-foreground truncate">{trade.desc}</p>
                  </div>
                  {isStarting && tradeType === trade.id && (
                    <Loader2 className="w-4 h-4 animate-spin text-primary flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            Your information is used only to prepare your quote and will not be shared.
          </p>
        </div>
      </div>
    );
  }

  // ── Chat screen ─────────────────────────────────────────────────────────────
  const selectedTrade = TRADES.find((t) => t.id === tradeType);

  return (
    <div className="min-h-screen bg-secondary/20 flex flex-col">
      {/* Header */}
      <header className="bg-card border-b px-4 sm:px-6 py-3.5 flex items-center justify-between shadow-sm z-10 sticky top-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0">
            <Bot className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="font-bold text-base leading-tight">WorkRate Assistant</h2>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              {selectedTrade && <span>{selectedTrade.icon}</span>}
              <span>{selectedTrade?.label ?? tradeType} enquiry</span>
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block ml-0.5" />
              <span className="text-green-600 font-medium">Online</span>
            </p>
          </div>
        </div>
        <button
          onClick={() => { setToken(null); setTradeType(null); setMessages([]); setIsComplete(false); }}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg hover:bg-secondary"
        >
          Start over
        </button>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6" ref={scrollRef}>
        <div className="max-w-2xl mx-auto space-y-5">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "customer" ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-2 duration-300`}
            >
              <div className={`flex gap-2.5 max-w-[85%] sm:max-w-[75%] ${msg.role === "customer" ? "flex-row-reverse" : "flex-row"}`}>
                {/* Avatar */}
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-1 ${
                    msg.role === "customer"
                      ? "bg-primary text-primary-foreground"
                      : "bg-card border shadow-sm"
                  }`}
                >
                  {msg.role === "customer" ? (
                    <User className="w-3.5 h-3.5" />
                  ) : (
                    <Bot className="w-3.5 h-3.5 text-primary" />
                  )}
                </div>

                {/* Bubble */}
                <div
                  className={`rounded-2xl shadow-sm text-sm leading-relaxed overflow-hidden ${
                    msg.role === "customer"
                      ? "bg-primary text-primary-foreground rounded-tr-sm"
                      : "bg-card border border-border/60 rounded-tl-sm text-foreground"
                  }`}
                >
                  {/* Photo preview */}
                  {msg.imageUrl && (
                    <div className="relative">
                      <img
                        src={msg.imageUrl}
                        alt="Uploaded photo"
                        className="max-w-[240px] max-h-[200px] object-cover w-full"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    </div>
                  )}
                  {/* Text content */}
                  {msg.content && (
                    <p className="px-4 py-3 whitespace-pre-wrap">{msg.content}</p>
                  )}
                  {/* Streaming cursor */}
                  {!msg.content && msg.role === "assistant" && isStreaming && (
                    <div className="px-4 py-3 flex gap-1 items-center">
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce" />
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0.15s]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0.3s]" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Completion banner */}
          {isComplete && (
            <div className="flex justify-center animate-in fade-in duration-500">
              <div className="bg-green-50 border border-green-200 rounded-2xl px-6 py-4 text-center max-w-sm">
                <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
                <p className="font-semibold text-green-800 text-sm">Enquiry submitted</p>
                <p className="text-green-700 text-xs mt-1">
                  The team will review your details and be in touch shortly.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input area */}
      {!isComplete && (
        <div className="bg-card border-t px-4 py-4 sm:px-6">
          <div className="max-w-2xl mx-auto space-y-3">
            {/* Pending photo preview */}
            {pendingPhotoPreview && (
              <div className="flex items-center gap-3 bg-secondary/50 rounded-xl px-4 py-2.5 border border-border/60">
                <div className="relative flex-shrink-0">
                  <img
                    src={pendingPhotoPreview}
                    alt="Photo to send"
                    className="w-12 h-12 object-cover rounded-lg"
                  />
                  <div className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                    <ImageIcon className="w-2.5 h-2.5 text-primary-foreground" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{pendingPhoto?.name}</p>
                  <p className="text-xs text-muted-foreground">Ready to send</p>
                </div>
                <button
                  onClick={cancelPhoto}
                  className="p-1 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Input row */}
            <form onSubmit={sendMessage} className="flex gap-2 items-center">
              {/* Photo upload button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isStreaming || isUploadingPhoto}
                className="flex-shrink-0 w-10 h-10 rounded-full border-2 border-dashed border-border hover:border-primary hover:bg-primary/5 flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                title="Attach a photo"
              >
                <Paperclip className="w-4 h-4 text-muted-foreground" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />

              <div className="relative flex-1">
                <Input
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={pendingPhoto ? "Add a message with your photo (optional)…" : "Type your message…"}
                  className="h-11 pl-4 pr-4 rounded-full bg-secondary/30 border-border/60 focus-visible:bg-background text-sm transition-colors"
                  disabled={isStreaming || isUploadingPhoto}
                />
              </div>

              <Button
                type="submit"
                disabled={(isStreaming || isUploadingPhoto) || (!pendingPhoto && !inputValue.trim())}
                className="flex-shrink-0 h-10 w-10 rounded-full p-0 shadow-sm"
              >
                {isUploadingPhoto ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 ml-0.5" />
                )}
              </Button>
            </form>

            <p className="text-center text-xs text-muted-foreground">
              WorkRate Assistant · Your details are used only to prepare your quote
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
