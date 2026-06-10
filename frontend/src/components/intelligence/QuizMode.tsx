"use client";

import { useState } from "react";
import { AlertCircle, ArrowRightCircle, CheckCircle2, Play, Sparkles, XCircle, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { QuizQuestion } from "@/lib/api";
import { cn } from "@/lib/utils";

function formatTime(seconds: number) {
    if (isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function QuizMode({ quizzes, onSeek, t }: { quizzes: QuizQuestion[]; onSeek: (time: number) => void; t: (key: string, params?: unknown) => string }) {
    const [currentIdx, setCurrentIdx] = useState(0);
    const [selectedOpt, setSelectedOpt] = useState<number | null>(null);
    const [isAnswered, setIsAnswered] = useState(false);
    const [score, setScore] = useState(0);
    const [showResults, setShowResults] = useState(false);

    const limitedQuizzes = Array.isArray(quizzes) ? quizzes.slice(0, 10) : [];
    const q = limitedQuizzes[currentIdx];
    const normalizedOptions = (() => {
        if (!q) return [];
        const rawOptions = q.options as unknown;
        if (Array.isArray(rawOptions)) return rawOptions as string[];
        if (typeof rawOptions === "string") {
            try {
                const parsed = JSON.parse(rawOptions);
                if (Array.isArray(parsed)) return parsed as string[];
            } catch {
                return rawOptions
                    .split("|")
                    .map((s) => s.trim())
                    .filter(Boolean);
            }
        }
        return [];
    })();

    if (!q && !showResults) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-center gap-4 animate-in fade-in slide-in-from-bottom-4">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                    <AlertCircle className="text-primary/60" />
                </div>
                <div className="space-y-1">
                    <p className="text-xs font-bold uppercase tracking-widest">{t("unavailable")}</p>
                    <p className="text-[10px] text-muted-foreground">{t("assessmentUnavailableDesc")}</p>
                </div>
            </div>
        );
    }

    if (showResults) {
        const scoreOutOf100 = Math.round((score / limitedQuizzes.length) * 100);

        let scoreColor = "text-red-500";
        let ringColor = "text-red-500";
        if (scoreOutOf100 >= 70) {
            scoreColor = "text-green-500";
            ringColor = "text-green-500";
        } else if (scoreOutOf100 >= 40) {
            scoreColor = "text-yellow-500";
            ringColor = "text-yellow-500";
        }

        return (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col h-full py-4">
                <div className="flex flex-col items-center justify-center py-10 text-center gap-6 flex-1">
                    <div className="relative w-48 h-48 flex items-center justify-center">
                        <svg className="w-full h-full -rotate-90">
                            <circle cx="96" cy="96" r="80" fill="transparent" stroke="currentColor" strokeWidth="12" className="text-secondary/20" />
                            <motion.circle
                                cx="96"
                                cy="96"
                                r="80"
                                fill="transparent"
                                stroke="currentColor"
                                strokeWidth="12"
                                strokeDasharray={502.6}
                                initial={{ strokeDashoffset: 502.6 }}
                                animate={{ strokeDashoffset: 502.6 - (502.6 * (scoreOutOf100 / 100)) }}
                                transition={{ duration: 1.5, ease: "easeOut" }}
                                strokeLinecap="round"
                                className={cn(ringColor)}
                            />
                        </svg>
                        <div className="absolute flex flex-col items-center">
                            <motion.span
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.5 }}
                                className={cn("text-6xl font-black tracking-tighter", scoreColor)}
                            >
                                {scoreOutOf100}%
                            </motion.span>
                            <span className="text-[10px] text-muted-foreground font-black uppercase tracking-widest mt-1">{t("iq")}</span>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <h3 className="text-2xl font-black font-heading uppercase tracking-tighter">{t("complete")}</h3>
                        <p className="text-muted-foreground text-sm max-w-[280px] mx-auto">
                            {t("synchronized").replace("{score}", score.toString()).replace("{total}", limitedQuizzes.length.toString())}
                        </p>
                    </div>

                    <div className="flex gap-3 w-full mt-4">
                        <button
                            onClick={() => {
                                setCurrentIdx(0);
                                setScore(0);
                                setSelectedOpt(null);
                                setIsAnswered(false);
                                setShowResults(false);
                            }}
                            className="flex-1 px-6 py-4 rounded-2xl font-bold uppercase tracking-widest text-[10px] transition-all hover:scale-[1.02] active:scale-95 bg-secondary border border-white/5 hover:bg-secondary/80"
                        >
                            {t("retry")}
                        </button>
                    </div>
                </div>
            </motion.div>
        );
    }

    const handleConfirm = () => {
        if (selectedOpt === null) return;
        const isCorrect = normalizedOptions[selectedOpt] === q.correct_answer || selectedOpt === Number(q.correct_answer);
        if (isCorrect) setScore((prev) => prev + 1);
        setIsAnswered(true);
    };

    const handleNext = () => {
        if (currentIdx < limitedQuizzes.length - 1) {
            setCurrentIdx((prev) => prev + 1);
            setSelectedOpt(null);
            setIsAnswered(false);
        } else {
            setShowResults(true);
        }
    };

    return (
        <div className="space-y-8 flex flex-col h-full pb-4">
            <div className="space-y-6">
                <div className="space-y-2">
                    <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest text-primary/60">
                        <span className="flex items-center gap-2">
                            <Zap size={10} className="text-primary" /> {t("syncingInsight", { n: currentIdx + 1 })}
                        </span>
                        <span>{Math.round(((currentIdx + 1) / limitedQuizzes.length) * 100)}%</span>
                    </div>
                    <div className="h-1 w-full bg-secondary/30 rounded-full overflow-hidden">
                        <motion.div className="h-full bg-primary" initial={{ width: 0 }} animate={{ width: `${((currentIdx + 1) / limitedQuizzes.length) * 100}%` }} transition={{ duration: 0.5 }} />
                    </div>
                </div>

                <div className="space-y-4">
                    <h4 className="text-xl font-bold leading-tight font-heading tracking-tight text-foreground">{q.question}</h4>
                    {q.source_start !== undefined && (
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => onSeek(q.source_start!)}
                                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/20 bg-primary/10 text-[10px] font-black uppercase tracking-widest text-primary hover:bg-primary hover:text-white transition-all group"
                            >
                                <Play size={10} className="fill-current" />
                                {t("evidence").replace("{time}", q.source_start !== undefined && q.source_end !== undefined ? `[${formatTime(q.source_start)} - ${formatTime(q.source_end)}]` : `[${formatTime(q.source_start)}]`)}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <div className="space-y-3">
                {normalizedOptions.length > 0 &&
                    normalizedOptions.map((opt, i) => {
                        const isCorrect = opt === q.correct_answer;
                        const isSelected = selectedOpt === i;

                        let variantClass = "bg-secondary/20 border-border/50 hover:bg-secondary/40";
                        if (isAnswered) {
                            const optionCorrect = opt === q.correct_answer || i === Number(q.correct_answer);
                            if (optionCorrect) variantClass = "bg-green-500/20 border-green-500/50 text-green-400 ring-1 ring-green-500/20";
                            else if (isSelected) variantClass = "bg-red-500/20 border-red-500/50 text-red-400 ring-1 ring-red-500/20";
                            else variantClass = "opacity-40 grayscale";
                        } else if (isSelected) {
                            variantClass = "bg-primary border-primary text-white shadow-xl shadow-primary/40";
                        }

                        return (
                            <button key={i} disabled={isAnswered} onClick={() => setSelectedOpt(i)} className={cn("w-full text-left p-4 rounded-xl border transition-all flex items-center justify-between group relative overflow-hidden", variantClass)}>
                                <span className="text-sm font-medium relative z-10">{opt}</span>
                                <div className="shrink-0 relative z-10">
                                    {isAnswered && isCorrect && <CheckCircle2 size={16} className="text-green-400" />}
                                    {isAnswered && isSelected && !isCorrect && <XCircle size={16} className="text-red-400" />}
                                    {!isAnswered && <div className={cn("w-4 h-4 rounded-full border-2 transition-all", isSelected ? "border-white bg-white" : "border-border/50 group-hover:border-primary/50")} />}
                                </div>
                                {isAnswered && isCorrect && (
                                    <motion.div
                                        initial={{ x: "-100%" }}
                                        animate={{ x: "100%" }}
                                        transition={{ duration: 1, repeat: Infinity }}
                                        className="absolute inset-0 bg-gradient-to-r from-transparent via-green-500/10 to-transparent pointer-events-none"
                                    />
                                )}
                            </button>
                        );
                    })}
                {normalizedOptions.length === 0 && <div className="text-xs text-muted-foreground">{t("quizOptionsUnavailable")}</div>}
            </div>

            {isAnswered && (q.explanation || q.source_text) && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-5 rounded-2xl bg-primary/5 border border-primary/10">
                    <div className="flex items-center gap-2 mb-2">
                        <Sparkles size={14} className="text-primary" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-primary">{t("intelligenceNode")}</span>
                    </div>
                    {q.explanation && <p className="text-xs text-muted-foreground leading-relaxed italic">{q.explanation}</p>}
                    {q.source_text && <p className="mt-2 text-xs text-foreground/90 leading-relaxed">“{q.source_text}”</p>}
                </motion.div>
            )}

            {!isAnswered ? (
                <button
                    disabled={selectedOpt === null}
                    className="w-full py-4 bg-primary text-white rounded-2xl font-bold uppercase tracking-widest text-[10px] shadow-xl shadow-primary/20 disabled:opacity-30 transition-all hover:scale-[1.02] active:scale-95"
                    onClick={handleConfirm}
                >
                    {t("confirm")}
                </button>
            ) : (
                <button
                    className="w-full py-4 bg-foreground text-background rounded-2xl font-bold uppercase tracking-widest text-[10px] shadow-xl transition-all hover:scale-[1.02] flex items-center justify-center gap-2"
                    onClick={handleNext}
                >
                    {t("next")} <ArrowRightCircle size={14} />
                </button>
            )}
        </div>
    );
}
