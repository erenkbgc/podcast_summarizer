"use client";

import { motion } from "framer-motion";
import { Sparkles, Zap, TrendingUp, Info } from "lucide-react";
import ReactMarkdown from "react-markdown";

interface BriefingHeroProps {
    brief: string | undefined;
    density: string | undefined;
    lang?: string;
}

import { getTranslation } from "@/lib/translations";

export function BriefingHero({ brief, density, lang = "en" }: BriefingHeroProps) {
    if (!brief) return null;
    const t = (key: string, params?: any) => getTranslation(lang, key, params);

    return (
        <motion.section
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="px-12 pt-12 pb-6 max-w-5xl mx-auto w-full"
        >
            <div className="relative group overflow-hidden rounded-[40px] border border-white/5 bg-gradient-to-br from-card/80 to-secondary/30 backdrop-blur-xl shadow-2xl p-10 md:p-12">

                {/* Background Decorative Element */}
                <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[100px] opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />

                <div className="relative z-10 flex flex-col md:flex-row gap-10 items-start">

                    <div className="flex-1 space-y-8">
                        <div className="flex items-center gap-6">
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">
                                <Sparkles size={14} className="text-primary" />
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">{t("executiveBrief")}</span>
                            </div>

                            {density && (
                                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-800/50 border border-white/5">
                                    <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">{t("density")}: {density}</span>
                                </div>
                            )}
                        </div>

                        <div className="prose prose-invert prose-p:text-xl prose-p:font-medium prose-p:leading-relaxed prose-p:tracking-tight prose-p:text-foreground/90 max-w-none">
                            <ReactMarkdown>
                                {brief}
                            </ReactMarkdown>
                        </div>

                        <div className="flex items-center gap-6 pt-4 border-t border-white/5">
                            <div className="flex items-center gap-2 text-muted-foreground/50">
                                <Zap size={14} />
                                <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{t("mentalSnapshot")}</span>
                            </div>
                            <div className="flex items-center gap-2 text-muted-foreground/50">
                                <TrendingUp size={14} />
                                <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{t("perspectiveShift")}</span>
                            </div>
                        </div>
                    </div>

                    <div className="hidden lg:flex w-24 h-24 rounded-3xl bg-primary/5 border border-primary/10 items-center justify-center shrink-0">
                        <Info size={32} className="text-primary/40" />
                    </div>

                </div>

            </div>
        </motion.section>
    );
}
