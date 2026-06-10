"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowRightCircle, BookOpen, BookText, BookmarkPlus, CheckCircle2, ChevronDown, Globe, HelpCircle, MessageSquare, Play, Search, Send, Sparkles, Zap } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import api, { Episode, REQUEST_TIMEOUTS, Summary } from "@/lib/api";
import { cn } from "@/lib/utils";

type ChatSource = { timestamp: number; text: string };
type ChatAction = {
    type: "seek" | "save_insight" | "create_note" | "search" | "compare_episodes";
    label: string;
    metadata: Record<string, unknown>;
};
type ChatMessageItem = {
    role: "user" | "assistant";
    content: string;
    sources?: ChatSource[];
    actions?: ChatAction[];
    reasoning_trace?: { step: string; summary: string; confidence?: number }[];
};
type ChatMode =
    | "assistant"
    | "teacher"
    | "debate"
    | "fact_checker"
    | "socratic"
    | "devil_advocate"
    | "researcher"
    | "storyteller"
    | "casual";

type ChatSuggestion = {
    text: string;
    context: string;
    icon: string;
};

const CHAT_MODES: Record<ChatMode, { icon: React.ReactNode; label: string; description: string }> = {
    assistant: { icon: <Sparkles size={14} />, label: "Assistant", description: "Direct answers & insights" },
    teacher: { icon: <BookOpen size={14} />, label: "Teacher", description: "Step-by-step explanation" },
    debate: { icon: <ArrowRightCircle size={14} />, label: "Debate", description: "Argue both sides" },
    fact_checker: { icon: <CheckCircle2 size={14} />, label: "Fact Checker", description: "Citation-heavy verification" },
    socratic: { icon: <HelpCircle size={14} />, label: "Socratic", description: "Learn through questions" },
    devil_advocate: { icon: <Zap size={14} />, label: "Devil's Advocate", description: "Challenge perspectives" },
    researcher: { icon: <Search size={14} />, label: "Researcher", description: "Deep investigation" },
    storyteller: { icon: <BookText size={14} />, label: "Storyteller", description: "Narrative-focused explanation" },
    casual: { icon: <MessageSquare size={14} />, label: "Casual", description: "Conversational and informal" },
};

const FEATURED_MODES: ChatMode[] = ["assistant", "teacher", "debate", "fact_checker"];
const ADVANCED_MODES: ChatMode[] = ["researcher", "socratic", "devil_advocate", "storyteller", "casual"];

export function ChatInterface({ episode, summary, onSeek, t, lang }: { episode: Episode; summary: Summary | null; onSeek: (time: number) => void; t: (key: string, params?: unknown) => string; lang: string }) {
    const storageKey = `podai_chat_${episode.id}`;
    const [messages, setMessages] = useState<ChatMessageItem[]>(() => {
        if (typeof window !== "undefined") {
            const saved = localStorage.getItem(storageKey);
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
                } catch {
                    // ignore parse error
                }
            }
        }
        return [{ role: "assistant", content: t("welcome", { title: episode.title }) }];
    });
    const [input, setInput] = useState("");
    const [isTyping, setIsTyping] = useState(false);
    const [chatMode, setChatMode] = useState<ChatMode>("assistant");
    const [suggestions, setSuggestions] = useState<ChatSuggestion[]>([]);
    const [relatedChats, setRelatedChats] = useState<Array<{ id: string | number; topic: string }>>([]);
    const [showModeSelector, setShowModeSelector] = useState(false);
    const endRef = useRef<HTMLDivElement>(null);

    void summary;

    useEffect(() => {
        const loadSuggestions = async () => {
            try {
                const resp = await api.get(`/v1/episodes/${episode.id}/chat/suggestions`, {
                    timeout: REQUEST_TIMEOUTS.chat,
                });
                setSuggestions(resp.data || []);
            } catch (err) {
                console.error("Failed to load suggestions", err);
            }
        };
        loadSuggestions();
    }, [episode.id]);

    useEffect(() => {
        const loadRelated = async () => {
            try {
                const resp = await api.get(`/v1/episodes/${episode.id}/chat/related`, {
                    timeout: REQUEST_TIMEOUTS.chat,
                });
                setRelatedChats(resp.data || []);
            } catch (err) {
                console.error("Failed to load related conversations", err);
            }
        };
        loadRelated();
    }, [episode.id]);

    useEffect(() => {
        localStorage.setItem(storageKey, JSON.stringify(messages));
        endRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, storageKey]);

    const handleSendMessage = async (text: string) => {
        if (!text.trim() || isTyping) return;

        const userMsg = text;
        const newMessages = [...messages, { role: "user" as const, content: userMsg }];
        setMessages(newMessages);
        setIsTyping(true);

        try {
            // Try streaming first; fall back to non-streaming if not supported
            const useStreaming = true;
            if (useStreaming) {
                await streamChatMessage(userMsg);
            } else {
                const resp = await api.post(`/v1/episodes/${episode.id}/chat`, {
                    message: userMsg,
                    mode: chatMode,
                    history: messages.slice(1).map((m) => ({ role: m.role, content: m.content })),
                    context_snapshot: {
                        episode_id: episode.id,
                        currentTimestamp: 0,
                    },
                    lang,
                });
                const sources = Array.isArray(resp.data?.sources) ? resp.data.sources : [];
                const actions = Array.isArray(resp.data?.actions) ? resp.data.actions : [];
                setMessages((prev) => [
                    ...prev,
                    {
                        role: "assistant",
                        content: resp.data.response,
                        sources,
                        actions,
                        reasoning_trace: Array.isArray(resp.data?.reasoning_trace) ? resp.data.reasoning_trace : [],
                    },
                ]);
            }
        } catch (err) {
            console.error("Chat error:", err);
            setMessages((prev) => [...prev, { role: "assistant", content: "I encountered an error. Please try again." }]);
        } finally {
            setIsTyping(false);
        }
    };

    const streamChatMessage = async (userMsg: string) => {
        try {
            const token = typeof window !== "undefined" ? localStorage.getItem("podai_token") : null;
            if (!token) throw new Error("Not authenticated");

            const response = await fetch(
                `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/v1/episodes/${episode.id}/chat/stream`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        message: userMsg,
                        mode: chatMode,
                        context_snapshot: {
                            episode_id: episode.id,
                            currentTimestamp: 0,
                        },
                        lang,
                    }),
                }
            );

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            if (!response.body) throw new Error("No response body");

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let fullResponse = "";

            // Add empty assistant message placeholder
            setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        const dataStr = line.slice(6);
                        if (dataStr === "[DONE]") {
                            // Streaming complete
                            break;
                        }
                        try {
                            const data = JSON.parse(dataStr);
                            if (data.delta) {
                                fullResponse += data.delta;
                                // Update the last message with accumulated content
                                setMessages((prev) => {
                                    const updated = [...prev];
                                    if (updated[updated.length - 1].role === "assistant") {
                                        updated[updated.length - 1].content = fullResponse;
                                    }
                                    return updated;
                                });
                            } else if (data.error) {
                                throw new Error(data.error);
                            }
                        } catch (parseErr) {
                            console.warn("Failed to parse SSE message:", parseErr);
                        }
                    }
                }
            }

            // Save to localStorage
            localStorage.setItem(storageKey, JSON.stringify(messages));
        } catch (err) {
            console.error("Stream error:", err);
            throw err;
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        handleSendMessage(input);
        setInput("");
    };

    const handleAction = (action: ChatAction) => {
        switch (action.type) {
            case "seek":
                onSeek(action.metadata.timestamp);
                break;
            case "save_insight":
            case "search":
            default:
                break;
        }
    };

    return (
        <div className="h-full flex flex-col pt-4">
            <div className="mb-3 space-y-2">
                <div className="flex items-center justify-between px-1">
                    <div className="text-[9px] font-bold uppercase tracking-widest text-primary/70">Mode</div>
                    <button
                        type="button"
                        onClick={() => setShowModeSelector((v) => !v)}
                        className="inline-flex items-center gap-1 text-[9px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
                    >
                        Advanced
                        <ChevronDown size={11} className={cn("transition-transform", showModeSelector && "rotate-180")} />
                    </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    {FEATURED_MODES.map((mode) => (
                        <button
                            key={mode}
                            type="button"
                            onClick={() => setChatMode(mode)}
                            className={cn(
                                "rounded-xl border px-2.5 py-2 text-left transition-all",
                                chatMode === mode
                                    ? "border-primary/60 bg-primary/10 text-primary"
                                    : "border-border/40 bg-secondary/20 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                            )}
                        >
                            <div className="flex items-center gap-2 text-[10px] font-bold">
                                {CHAT_MODES[mode].icon}
                                {CHAT_MODES[mode].label}
                            </div>
                            <div className="mt-1 text-[9px] opacity-80 line-clamp-1">{CHAT_MODES[mode].description}</div>
                        </button>
                    ))}
                </div>

                {showModeSelector && (
                    <div className="grid grid-cols-1 gap-1 rounded-xl border border-border/40 bg-secondary/10 p-2">
                        {ADVANCED_MODES.map((mode) => (
                            <button
                                key={mode}
                                type="button"
                                onClick={() => setChatMode(mode)}
                                className={cn(
                                    "flex items-center justify-between rounded-lg px-2 py-1.5 text-left text-[10px] transition-colors",
                                    chatMode === mode ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                                )}
                            >
                                <span className="inline-flex items-center gap-1.5">
                                    {CHAT_MODES[mode].icon}
                                    {CHAT_MODES[mode].label}
                                </span>
                                <span className="text-[9px] opacity-70">{CHAT_MODES[mode].description}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {relatedChats.length > 0 && (
                <div className="mb-3 px-1">
                    <div className="text-[9px] font-bold uppercase tracking-widest text-primary/60 mb-2">{t("related")}</div>
                    <div className="space-y-1">
                        {relatedChats.slice(0, 2).map((chat) => (
                            <div key={chat.id} className="text-[10px] p-2 rounded bg-secondary/20 border border-border/30 text-muted-foreground line-clamp-2">
                                {chat.topic}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="flex-1 space-y-4 overflow-x-hidden custom-scrollbar overflow-y-auto px-1 pb-6">
                {messages.map((m, i) => (
                    <div key={i} className={cn("flex gap-3", m.role === "user" ? "flex-row-reverse" : "flex-row")}>
                        <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0", m.role === "user" ? "bg-primary text-white" : "bg-zinc-800 text-primary border border-primary/20")}>
                            {m.role === "user" ? "U" : "AI"}
                        </div>
                        <div className="flex-1 space-y-2">
                            <div className={cn("p-4 rounded-2xl text-sm leading-relaxed break-words", m.role === "user" ? "bg-primary/10 text-foreground border border-primary/20 max-w-[85%]" : "bg-card border border-border shadow-sm")}>
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                            </div>

                            {m.actions && m.actions.length > 0 && (
                                <div className="flex flex-wrap gap-2 px-1">
                                    {[...m.actions]
                                        .sort((a, b) => (a.metadata.timestamp || 0) - (b.metadata.timestamp || 0))
                                        .slice(0, 5)
                                        .map((action, idx) => (
                                            <button
                                                key={idx}
                                                onClick={() => handleAction(action)}
                                                className="text-[9px] px-2.5 py-1.5 rounded-lg bg-primary/10 border border-primary/30 text-primary hover:bg-primary hover:text-white transition-all flex items-center gap-1.5 font-semibold"
                                            >
                                                {action.type === "seek" && <Play size={10} />}
                                                {action.type === "save_insight" && <BookmarkPlus size={10} />}
                                                {action.type === "search" && <Search size={10} />}
                                                {action.label}
                                            </button>
                                        ))}
                                </div>
                            )}

                            {m.reasoning_trace && m.reasoning_trace.length > 0 && (
                                <details className="px-1">
                                    <summary className="cursor-pointer text-[10px] font-semibold text-primary/80 hover:text-primary">Why this answer?</summary>
                                    <div className="mt-2 space-y-1 rounded-xl border border-border/40 bg-secondary/20 p-2.5">
                                        {m.reasoning_trace.slice(0, 4).map((r, idx) => (
                                            <div key={idx} className="text-[10px] text-muted-foreground">
                                                <span className="font-bold text-foreground/90">{r.step}</span>: {r.summary}
                                                {typeof r.confidence === "number" && <span className="ml-1 text-primary/80">({Math.round(r.confidence * 100)}%)</span>}
                                            </div>
                                        ))}
                                    </div>
                                </details>
                            )}
                        </div>
                    </div>
                ))}

                {isTyping && (
                    <div className="flex gap-3">
                        <div className="w-7 h-7 rounded-lg bg-zinc-800 flex items-center justify-center animate-pulse">
                            <Globe size={12} className="text-primary" />
                        </div>
                        <div className="bg-card border border-border p-4 rounded-2xl flex gap-1 shadow-sm">
                            <span className="w-1 h-1 bg-primary rounded-full animate-bounce" />
                            <span className="w-1 h-1 bg-primary rounded-full animate-bounce [animation-delay:0.2s]" />
                            <span className="w-1 h-1 bg-primary rounded-full animate-bounce [animation-delay:0.4s]" />
                        </div>
                    </div>
                )}
                <div ref={endRef} />
            </div>

            <div className="mt-auto border-t border-border bg-card/30 p-4 -mx-6 -mb-6">
                {messages.length === 1 && suggestions.length > 0 && !isTyping && (
                    <div className="mb-4 space-y-2">
                        <div className="flex items-center gap-1.5 px-1 mb-2">
                            <Sparkles size={10} className="text-primary" />
                            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/70">{t("smartQuestions")}</span>
                        </div>
                        <div className="flex flex-col gap-2">
                            {suggestions.map((s, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => handleSendMessage(s.text)}
                                    className="text-left py-2 px-3 rounded-xl bg-secondary/40 border border-border/50 hover:border-primary/40 hover:bg-secondary transition-all text-[11px] font-medium text-foreground/80 hover:text-foreground group flex items-center justify-between"
                                >
                                    <span>
                                        <span className="mr-2">{s.icon}</span>
                                        {s.text}
                                    </span>
                                    <ArrowRight size={10} className="text-primary opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="relative">
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                if (input.trim()) {
                                    handleSendMessage(input);
                                    setInput("");
                                }
                            }
                        }}
                        rows={1}
                        placeholder={t("placeholderChat")}
                        className="w-full bg-secondary/30 border border-border rounded-2xl px-5 py-4 pr-14 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all resize-none max-h-40"
                    />
                    <button
                        type="submit"
                        disabled={!input.trim() || isTyping}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-primary text-white rounded-xl shadow-lg shadow-primary/30 hover:bg-primary/90 disabled:opacity-50 transition-all"
                    >
                        <Send size={16} />
                    </button>
                </form>
            </div>
        </div>
    );
}
