"use client";

import { Summary } from "@/lib/api";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { Users, PieChart, Info, Quote, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";

import { getTranslation } from "@/lib/translations";

interface ExecutiveSummaryProps {
    summary: Summary;
    lang?: string;
}

export function ExecutiveSummary({ summary, lang = "en" }: ExecutiveSummaryProps) {
    if (!summary) return null;
    const t = (key: string, params?: any) => getTranslation(lang, key, params);

    return (
        <div className="space-y-12 pb-12 animate-in fade-in duration-700">

            {/* 0. Key Insights (Quick Scan) */}
            {summary.key_takeaways && summary.key_takeaways.length > 0 && (
                <section className="space-y-4">
                    {summary.key_takeaways.map((insight, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.1 }}
                            className="p-4 rounded-2xl bg-primary/5 border border-primary/10 relative group hover:bg-primary/10 transition-all"
                        >
                            <div className="absolute top-4 left-[-4px] w-1 h-4 bg-primary rounded-full shadow-[0_0_8px_rgba(var(--primary),0.5)]" />
                            <p className="text-xs font-bold leading-relaxed text-foreground/90 pl-2">
                                {insight}
                            </p>
                        </motion.div>
                    ))}
                </section>
            )}

            {/* 1. Quantitative Overview Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">

                {/* Speaker Contributions */}
                {summary.speaker_contribution && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-6 rounded-3xl bg-card border border-border shadow-sm space-y-4"
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <Users size={16} className="text-primary" />
                            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">{t("voiceDistribution")}</h3>
                        </div>
                        <div className="space-y-4">
                            {Object.entries(summary.speaker_contribution).map(([name, percent]) => (
                                <div key={name} className="space-y-1.5">
                                    <div className="flex justify-between items-end px-0.5">
                                        <span className="text-sm font-semibold">{name}</span>
                                        <span className="text-xs font-mono text-muted-foreground">{percent}%</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${percent}%` }}
                                            transition={{ duration: 1, ease: "easeOut" }}
                                            className="h-full bg-primary rounded-full shadow-[0_0_8px_rgba(var(--primary),0.4)]"
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}

                {/* Topic Distribution */}
                {summary.topics && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="p-6 rounded-3xl bg-card border border-border shadow-sm space-y-4"
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <PieChart size={16} className="text-primary" />
                            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">{t("thematicCoverage")}</h3>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {summary.topics.map((topic, i) => (
                                <div
                                    key={i}
                                    className="px-4 py-2 rounded-2xl bg-secondary/50 border border-border/50 flex items-center gap-3 transition-colors hover:border-primary/30"
                                >
                                    <span className="text-sm font-medium">{topic.label}</span>
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-primary/10 text-primary">
                                        {topic.value}%
                                    </span>
                                </div>
                            ))}
                        </div>
                        <div className="pt-4 flex items-start gap-2 px-1">
                            <Info size={12} className="text-muted-foreground mt-0.5 shrink-0" />
                            <p className="text-[10px] text-muted-foreground italic leading-relaxed">
                                {t("thematicDisclaimer")}
                            </p>
                        </div>
                    </motion.div>
                )}
            </div>

            {/* 2. Insight Attribution */}
            {summary.insight_attribution && summary.insight_attribution.length > 0 && (
                <section className="space-y-6">
                    <div className="flex items-center gap-3 px-1">
                        <Quote size={18} className="text-primary fill-primary/10" />
                        <h2 className="text-xl font-heading font-bold tracking-tight">{t("intelligenceAttribution")}</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {summary.insight_attribution.map((attr, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, x: -10 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.05 }}
                                className="p-5 rounded-2xl bg-gradient-to-br from-card to-secondary/30 border border-border hover:border-primary/20 transition-all group"
                            >
                                <p className="text-sm leading-relaxed font-medium mb-3 line-clamp-2">
                                    "{attr.insight}"
                                </p>
                                <div className="flex items-center gap-2">
                                    <div className="w-5 h-5 rounded-md bg-zinc-800 flex items-center justify-center text-[10px] font-black text-primary">
                                        {attr.speaker.charAt(0)}
                                    </div>
                                    <span className="text-[11px] font-bold text-muted-foreground group-hover:text-foreground transition-colors uppercase tracking-wider">
                                        {attr.speaker}
                                    </span>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </section>
            )}

        </div>
    );
}
