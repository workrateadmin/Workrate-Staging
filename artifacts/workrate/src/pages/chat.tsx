import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGetChatSession, getGetChatSessionQueryKey } from "@workspace/api-client-react";
import { Send, Bot, User, Loader2, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function ChatDemo() {
  const [tradeType, setTradeType] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [messages, setMessages] = useState<Array<{role: string, content: string}>>([]);
  const [inputValue, setInputValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load initial history if we have a token
  const { data: session } = useGetChatSession(token as string, { 
    query: { enabled: !!token, queryKey: getGetChatSessionQueryKey(token as string) } 
  });

  useEffect(() => {
    if (session && session.messages && messages.length <= 1) {
      // If we just got the session and haven't loaded messages yet
      if (session.messages.length > 0) {
        setMessages(session.messages.map(m => ({ role: m.role, content: m.content })));
      }
    }
  }, [session]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function handleStartChat(type: string) {
    setIsStarting(true);
    setTradeType(type);
    try {
      // Direct call as per generated API client pattern for non-hook usage:
      // useStartChat isn't generated in our hook list properly if it's a raw fetch, 
      // but we can just hit the API. The prompt says useStartChat() hook.
      // Wait, let me check the api.ts ... I don't see useStartChat in the file I was given.
      // Ah, the prompt says "Available API hooks: useStartChat() / useGetChatSession(token)".
      // Let's do raw fetch for simplicity and robustness since it's a custom action.
      
      const res = await fetch("/api/chat/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tradeType: type })
      });
      if (!res.ok) throw new Error("Failed to start chat");
      const data = await res.json();
      setToken(data.token);
      setMessages([{ role: "assistant", content: `Hi! I'm the AI assistant for your chosen trade (${type}). How can we help you today? Please provide some details about the job you need doing.` }]);
    } catch (err) {
      console.error(err);
      alert("Failed to start chat session.");
    } finally {
      setIsStarting(false);
    }
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!inputValue.trim() || isStreaming || !token) return;

    const userMsg = inputValue.trim();
    setInputValue("");
    setMessages(prev => [...prev, { role: "customer", content: userMsg }]);
    setMessages(prev => [...prev, { role: "assistant", content: "" }]); // placeholder for stream
    setIsStreaming(true);

    try {
      const res = await fetch(`/api/chat/${token}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: userMsg })
      });

      if (!res.ok) throw new Error("Network response was not ok");
      if (!res.body) throw new Error("No readable stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          setMessages(prev => {
            const newMessages = [...prev];
            const last = newMessages[newMessages.length - 1];
            if (last.role === "assistant") {
              last.content += chunk;
            }
            return newMessages;
          });
        }
      }
    } catch (err) {
      console.error("Stream failed", err);
      setMessages(prev => {
        const newMessages = [...prev];
        const last = newMessages[newMessages.length - 1];
        if (last.role === "assistant" && !last.content) {
          last.content = "Sorry, there was an error connecting to the AI.";
        }
        return newMessages;
      });
    } finally {
      setIsStreaming(false);
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <Link href="/" className="absolute top-6 left-6 text-sm font-medium flex items-center gap-2 hover:text-primary transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>
        <div className="w-full max-w-md space-y-8 text-center animate-in fade-in zoom-in-95 duration-500">
          <div className="w-20 h-20 bg-primary/10 rounded-3xl mx-auto flex items-center justify-center shadow-inner">
            <Bot className="w-10 h-10 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight mb-3">WorkRate AI Chat</h1>
            <p className="text-muted-foreground text-lg">Select a trade to test the customer experience.</p>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4">
            {["Joinery", "Building", "Electrical", "Plumbing", "Kitchen Installation"].map(trade => (
              <Button 
                key={trade} 
                variant="outline" 
                className="h-16 text-lg font-medium border-2 hover:border-primary hover:bg-primary/5 hover-elevate transition-all"
                onClick={() => handleStartChat(trade)}
                disabled={isStarting}
              >
                {isStarting && tradeType === trade ? <Loader2 className="w-5 h-5 animate-spin mr-2"/> : null}
                {trade}
              </Button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-secondary/30 flex flex-col">
      <header className="bg-card border-b px-6 py-4 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
            <Bot className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="font-bold text-lg leading-tight">{tradeType} Assistant</h2>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500 block"></span> Online
            </p>
          </div>
        </div>
        <Button variant="ghost" onClick={() => setToken(null)} size="sm" className="font-medium text-muted-foreground">
          End Demo
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6" ref={scrollRef}>
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'customer' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2`}>
              <div className={`flex gap-3 max-w-[85%] ${msg.role === 'customer' ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-1 ${
                  msg.role === 'customer' ? 'bg-primary text-primary-foreground' : 'bg-card border shadow-sm text-foreground'
                }`}>
                  {msg.role === 'customer' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>
                <div className={`px-5 py-3.5 rounded-2xl shadow-sm text-[15px] leading-relaxed ${
                  msg.role === 'customer' 
                    ? 'bg-primary text-primary-foreground rounded-tr-sm' 
                    : 'bg-card border border-border rounded-tl-sm text-foreground'
                }`}>
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            </div>
          ))}
          {isStreaming && messages[messages.length - 1]?.role !== 'assistant' && (
            <div className="flex justify-start">
              <div className="bg-card border rounded-2xl px-5 py-4 shadow-sm flex gap-1">
                <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce"></span>
                <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '0.4s' }}></span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-card border-t p-4 sm:p-6">
        <form onSubmit={sendMessage} className="max-w-3xl mx-auto flex gap-3 relative">
          <Input 
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            placeholder="Type your message..."
            className="flex-1 h-14 pl-6 pr-14 text-base rounded-full shadow-sm bg-secondary/20 focus-visible:bg-background border-border/60 transition-colors"
            disabled={isStreaming}
          />
          <Button 
            type="submit" 
            disabled={isStreaming || !inputValue.trim()}
            className="absolute right-2 top-2 h-10 w-10 rounded-full p-0 shadow-sm"
          >
            <Send className="w-4 h-4 ml-0.5" />
          </Button>
        </form>
        <p className="text-center text-xs text-muted-foreground mt-3">
          This is an AI demo. Information provided is for demonstration purposes.
        </p>
      </div>
    </div>
  );
}
