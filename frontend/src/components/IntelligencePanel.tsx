"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BookText, HelpCircle, ListOrdered, MessageSquare, Sparkles, Bookmark } from "lucide-react";
import { Episode, Summary, Chapter, QuizQuestion } from "@/lib/api";
import { cn } from "@/lib/utils";

import { TranscriptView } from "./TranscriptView";
import { getTranslation } from "@/lib/translations";
import { ChatInterface } from "./intelligence/ChatInterface";
import { QuizMode } from "./intelligence/QuizMode";
import { ChapterIndexView } from "./ChapterIndexView";

interface IntelligencePanelProps {
    episode: Episode;
    transcript: { segments?: Array<{ start: number; end: number; text: string }> } | null;
    summary: Summary | null;
    chapters: Chapter[];
    quizzes: QuizQuestion[];
    currentTime: number;
    onSeek: (time: number) => void;
}

function formatTime(seconds: number) {
    if (isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function IntelligencePanel({ episode, transcript, summary, chapters, quizzes, currentTime, onSeek }: IntelligencePanelProps) {
    const [activeTab, setActiveTab] = useState<"chapters" | "chat" | "quiz" | "transcript">("transcript");

    const addBookmark = () => {
        if (typeof window === "undefined") return;
        const segments = transcript?.segments || [];
        if (!Array.isArray(segments) || segments.length === 0) return;

        let closest = segments[0];
        for (const seg of segments) {
            if (currentTime >= seg.start && currentTime <= seg.end) {
                closest = seg;
                break;
            }
            const curDelta = Math.abs(seg.start - currentTime);
            const bestDelta = Math.abs(closest.start - currentTime);
            if (curDelta < bestDelta) closest = seg;
        }

        const key = `podai_marks_${episode.id}`;
        const payload = {
            time: currentTime,
            text: closest?.text || "",
            created_at: new Date().toISOString(),
        };

        try {
            const existing = JSON.parse(localStorage.getItem(key) || "[]");
            const next = Array.isArray(existing) ? [...existing, payload] : [payload];
            localStorage.setItem(key, JSON.stringify(next));
        } catch {
            localStorage.setItem(key, JSON.stringify([payload]));
        }
    };

    const lang = episode.preferred_lang || "en";
    const t = (key: string, params?: unknown) => getTranslation(lang, key, params);

    const tabs = [
        { id: "transcript", icon: BookText, label: t("live") },
        { id: "chapters", icon: ListOrdered, label: t("index") },
        { id: "chat", icon: MessageSquare, label: t("chat") },
        { id: "quiz", icon: HelpCircle, label: t("quiz") },
    ] as const;

    return (
        <aside className="w-[420px] flex flex-col border-l border-border bg-card/10 backdrop-blur-3xl shrink-0">
            <div className="flex border-b border-white/5 p-1 bg-secondary/10 m-4 rounded-2xl shadow-inner">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={cn(
                            "flex-1 flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all",
                            activeTab === tab.id
                                ? "bg-primary text-white shadow-xl shadow-primary/30"
                                : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                        )}
                    >
                        <tab.icon size={12} />
                        <span className="sr-only lg:not-sr-only text-[8px]">{tab.label}</span>
                    </button>
                ))}
            </div>

            <div className="flex-1 min-h-0 overflow-hidden">
                <AnimatePresence mode="wait">
                    {activeTab === "transcript" && (
                        <motion.div key="transcript" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full flex flex-col">
                            <div className="px-6 py-4 border-b border-border bg-secondary/5 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Sparkles size={14} className="text-primary" />
                                    <h3 className="text-[10px] font-black uppercase tracking-widest">{t("liveTranscript")}</h3>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={addBookmark}
                                        disabled={!transcript?.segments?.length}
                                        className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[10px] font-mono font-bold text-primary hover:bg-primary hover:text-white transition-all disabled:opacity-40"
                                    >
                                        <Bookmark size={10} />
                                        {t("bookmark")}
                                    </button>
                                    <span className="text-[10px] font-mono font-bold text-muted-foreground">{t("synced")}</span>
                                </div>
                            </div>
                            <div className="flex-1 overflow-hidden relative flex flex-col">
                                <TranscriptView
                                    segments={transcript?.segments || []}
                                    currentTime={currentTime}
                                    onSeek={onSeek}
                                    speakerMap={episode.speaker_map}
                                    isPanelMode={true}
                                    preferred_lang={episode.preferred_lang}
                                />
                            </div>
                        </motion.div>
                    )}

                    {activeTab === "chapters" && (
                        <motion.div key="chapters" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="p-6 overflow-y-auto max-h-[calc(100vh-200px)] custom-scrollbar">
                            {Array.isArray(chapters) && chapters.length > 0 ? (
                                <ChapterIndexView
                                    chapters={chapters}
                                    currentTime={currentTime}
                                    onSeek={onSeek}
                                />
                            ) : (
                                <div className="py-20 flex flex-col items-center justify-center gap-4 text-center opacity-40">
                                    <ListOrdered size={32} />
                                    <div className="space-y-1">
                                        <p className="text-xs font-bold uppercase tracking-widest">{t("indexing")}</p>
                                        <p className="text-[10px]">{t("processingIndex")}</p>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    )}

                    {activeTab === "chat" && (
                        <div className="p-6 h-full">
                            <ChatInterface episode={episode} summary={summary} onSeek={onSeek} t={t} lang={lang} />
                        </div>
                    )}

                    {activeTab === "quiz" && (
                        <div className="p-6 h-full">
                            {Array.isArray(quizzes) && quizzes.length > 0 ? (
                                <QuizMode quizzes={quizzes} onSeek={onSeek} t={t} />
                            ) : (
                                <div className="py-20 flex flex-col items-center justify-center gap-4 text-center opacity-40">
                                    <HelpCircle size={32} />
                                    <div className="space-y-1">
                                        <p className="text-xs font-bold uppercase tracking-widest">{t("staging")}</p>
                                        <p className="text-[10px]">{t("processingQuiz")}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </AnimatePresence>
            </div>
        </aside>
    );
}
