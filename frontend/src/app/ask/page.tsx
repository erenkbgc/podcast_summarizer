"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { Sparkles, Send, Library, Clock, ArrowUpRight, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

interface Source {
  episode_id: number;
  episode_title: string;
  timestamp: number;
  text: string;
}
interface Msg {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
}

function fmt(t: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const SUGGESTIONS = [
  "What are the recurring themes across everything I've listened to?",
  "Summarize what I learned about AI this month.",
  "Which episodes discussed economics or markets?",
  "What predictions were made across my library?",
];

export default function AskLibraryPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [user, authLoading, router]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    setInput("");
    setBusy(true);
    setMessages((prev) => [...prev, { role: "user", content: question }, { role: "assistant", content: "" }]);

    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("podai_token") : null;
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/v1/ask/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: question }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6);
          if (payload === "[DONE]") continue;
          try {
            const ev = JSON.parse(payload);
            setMessages((prev) => {
              const msgs = [...prev];
              const last = msgs[msgs.length - 1];
              if (ev.type === "sources") last.sources = ev.data;
              else if (ev.type === "delta") last.content += ev.text;
              else if (ev.type === "error") last.content += "\n\n⚠️ Something went wrong.";
              return msgs;
            });
          } catch {}
        }
      }
    } catch {
      setMessages((prev) => {
        const msgs = [...prev];
        msgs[msgs.length - 1].content = "⚠️ Couldn't reach the library. Try again.";
        return msgs;
      });
    } finally {
      setBusy(false);
    }
  };

  if (authLoading || !user) return null;

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-border bg-card/30 backdrop-blur-md flex items-center gap-3 px-8 shrink-0">
          <Library size={18} className="text-primary" />
          <div>
            <h1 className="font-heading font-bold text-sm tracking-tight">Ask Your Library</h1>
            <p className="text-[10px] font-medium text-muted-foreground">Chat across every episode you've processed</p>
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
            {messages.length === 0 && (
              <div className="text-center py-16 space-y-8">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-primary/10">
                  <Sparkles className="w-8 h-8 text-primary" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-black font-heading">Ask anything across your library</h2>
                  <p className="text-muted-foreground text-sm">Answers are grounded in your episodes and cite where they came from.</p>
                </div>
                <div className="grid sm:grid-cols-2 gap-3 max-w-xl mx-auto">
                  {SUGGESTIONS.map((sug) => (
                    <button key={sug} onClick={() => ask(sug)} className="text-left p-4 rounded-2xl bg-card border border-border hover:border-primary/40 transition-all text-sm text-foreground/90">
                      {sug}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div className={m.role === "user"
                  ? "max-w-[80%] rounded-2xl rounded-tr-sm bg-primary text-white px-4 py-3"
                  : "max-w-[85%] space-y-3"}>
                  {m.role === "assistant" && !m.content && busy && i === messages.length - 1 && (
                    <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 size={14} className="animate-spin" /> Searching your library…</div>
                  )}
                  {m.content && (
                    <div className={m.role === "assistant" ? "rounded-2xl rounded-tl-sm bg-card border border-border px-4 py-3 whitespace-pre-wrap leading-relaxed" : "whitespace-pre-wrap leading-relaxed"}>
                      {m.content}
                    </div>
                  )}
                  {m.sources && m.sources.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {m.sources.map((s, j) => (
                        <Link key={j} href={`/episode/${s.episode_id}?t=${Math.floor(s.timestamp)}`}
                          className="group inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-secondary/40 border border-border hover:border-primary/40 transition-all text-[11px]">
                          <span className="font-bold text-foreground/80 truncate max-w-[160px]">{s.episode_title}</span>
                          <span className="font-mono text-primary flex items-center gap-0.5"><Clock size={9} />{fmt(s.timestamp)}</span>
                          <ArrowUpRight size={11} className="text-muted-foreground group-hover:text-primary" />
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="shrink-0 border-t border-border bg-card/30 backdrop-blur-md p-4">
          <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="max-w-3xl mx-auto flex items-center gap-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask across your whole library…"
              className="flex-1 h-12 px-4 rounded-2xl bg-secondary/30 border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 text-sm"
            />
            <button type="submit" disabled={busy || !input.trim()}
              className="w-12 h-12 rounded-2xl bg-primary text-white flex items-center justify-center disabled:opacity-30 hover:bg-primary/90 transition-all">
              {busy ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
