"use client";

import React from 'react';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion } from 'framer-motion';
import { Summary } from '@/lib/api';
import {
    ListChecks,
    Sparkles,
    Zap,
    PlayCircle,
    FileText,
    CheckCircle2,
    Users,
    BarChart3,
    Activity,
    DownloadCloud,
    Mic,
    Layers,
    Search,
    Brain,
    BrainCircuit,
    Languages
} from 'lucide-react';
import {
    ResponsiveContainer, Tooltip as ReTooltip,
    BarChart as ReBarChart, Bar, Cell, XAxis, YAxis, Area,
    ComposedChart as ReComposedChart, Scatter
} from 'recharts';
import { cn } from '@/lib/utils';
import { BriefingHero } from './BriefingHero';
import { getTranslation } from '@/lib/translations';
import { SummaryHeader } from './summary/SummaryHeader';
import { InsightCard } from './summary/InsightCard';
import { TopicTimeline } from './summary/TopicTimeline';
import { SpeakerStats } from './summary/SpeakerStats';

function formatTime(seconds: number) {
    if (isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
}

interface SummaryViewProps {
    summary: Summary | null;
    status?: string;
    progress?: number;
    onSeek: (time: number) => void;
    persona?: 'default' | 'investor' | 'skeptic';
    onPersonaChange?: (persona: 'default' | 'investor' | 'skeptic') => void;
    transcriptSegments?: { start: number; end: number; text: string }[];
    summaryType: string;
    lang?: string;
}

export function SummaryView({ summary, status, progress, onSeek, persona = 'default', onPersonaChange, transcriptSegments = [], summaryType = 'default', lang = "en" }: SummaryViewProps) {
    const t = (key: string, params?: any) => getTranslation(lang, key, params);

    const steps = [
        { key: "downloading", label: t("download"), icon: DownloadCloud, start: 0, end: 0.1 },
        { key: "transcribing", label: t("transcribe"), icon: Mic, start: 0.1, end: 0.3 },
        { key: "identifying_speakers", label: t("speakers"), icon: Users, start: 0.3, end: 0.35 },
        { key: "translating", label: t("translating"), icon: Languages, start: 0.35, end: 0.45 },
        { key: "summarizing", label: t("summarize"), icon: BrainCircuit, start: 0.45, end: 0.65 },
        { key: "extracting_chapters", label: t("chapters"), icon: Layers, start: 0.65, end: 0.8 },
        { key: "generating_insights", label: t("insights"), icon: Zap, start: 0.8, end: 0.9 },
        { key: "indexing", label: t("index"), icon: Search, start: 0.9, end: 1.0 },
        { key: "completed", label: t("completeStatus"), icon: CheckCircle2, start: 1.0, end: 1.0 },
    ];

    const activeIndex = (() => {
        const idx = steps.findIndex((s) => s.key === status);
        if (idx !== -1) return idx;

        if (typeof progress === "number" && !Number.isNaN(progress)) {
            const found = steps.findIndex(s => progress >= s.start && progress < s.end);
            return found === -1 ? (progress >= 1 ? steps.length - 1 : 0) : found;
        }
        return 0;
    })();

    const currentStep = steps[activeIndex];

    // Calculate local step progress
    const stepProgress = (() => {
        if (status === 'completed') return 100;
        const p = progress || 0;
        const range = currentStep.end - currentStep.start;
        if (range <= 0) return 100;
        return Math.min(100, Math.max(0, ((p - currentStep.start) / range) * 100));
    })();

    if (!summary) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-12">
                <div className="relative">
                    <div className="w-24 h-24 rounded-full border-4 border-primary/10 border-t-primary animate-spin" />
                    <Sparkles size={40} className="absolute inset-0 m-auto text-primary animate-pulse" />
                </div>
                <div className="mt-8 text-center space-y-4 max-w-sm w-full">
                    <h2 className="text-2xl font-bold font-heading flex items-center justify-center gap-2">
                        {currentStep.label}...
                        <span className="text-primary tabular-nums">{Math.round(stepProgress)}%</span>
                    </h2>

                    {/* Step-specific Metrics */}
                    <div className="flex items-center justify-center gap-4 text-[10px] font-mono text-muted-foreground/40 uppercase tracking-widest h-4">
                        {status === 'downloading' && (
                            <>
                                <span className="flex items-center gap-1 animate-pulse"><Activity size={10} /> {(1.2 + Math.random() * 0.5).toFixed(1)} MB/s</span>
                                <span className="w-1 h-1 rounded-full bg-border" />
                                <span>{Math.round(stepProgress * 1.5)}MB / UNKNOWN</span>
                            </>
                        )}
                        {status === 'summarizing' && (
                            <>
                                <span className="flex items-center gap-1"><BrainCircuit size={10} /> {t("contextWindow")}: 32k</span>
                                <span className="w-1 h-1 rounded-full bg-border" />
                                <span className="animate-pulse">Reasoning...</span>
                            </>
                        )}
                    </div>

                    <p className="text-muted-foreground/60 text-xs italic">
                        {t("neuralAnalysisRunning")}
                    </p>

                    {/* Enhanced Progress Bar */}
                    <div className="w-full h-2 bg-secondary/20 rounded-full mt-6 overflow-hidden border border-white/5 p-[1px] relative">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.max(2, stepProgress)}%` }}
                            transition={{ type: "spring", stiffness: 30, damping: 15 }}
                            className="h-full bg-primary rounded-full relative"
                        >
                            {/* Inner Shimmer */}
                            <motion.div
                                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent w-full h-full"
                                animate={{ x: ['-100%', '100%'] }}
                                transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                            />
                            {/* External Glow Head */}
                            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-primary blur-md rounded-full" />
                        </motion.div>
                    </div>
                </div>
                <div className="mt-12 w-full max-w-4xl relative">
                    {/* Progress Connector Line - Now behind and more subtle */}
                    <div className="absolute top-5 left-10 right-10 h-[1px] bg-white/5 z-0" />
                    <motion.div
                        className="absolute top-5 left-10 h-[1px] bg-primary/30 z-0"
                        initial={{ width: 0 }}
                        animate={{ width: `${(activeIndex / (steps.length - 1)) * 100}%` }}
                        transition={{ duration: 1.5, ease: "easeInOut" }}
                    />
                    <div className="flex items-center justify-between px-4 pb-2 relative z-10">
                        {steps.map((step, i) => {
                            const isCompleted = i < activeIndex;
                            const isActive = i === activeIndex;
                            const Icon = step.icon;

                            return (
                                <div key={step.key} className="flex flex-col items-center gap-3 relative">
                                    <div className={cn(
                                        "w-10 h-10 rounded-2xl border flex items-center justify-center transition-all duration-500 bg-background", // bg-background hides the line
                                        isCompleted && "bg-primary/20 border-primary text-primary shadow-[0_0_15px_rgba(62,91,255,0.1)]",
                                        isActive && "bg-primary border-primary text-white shadow-[0_0_20px_rgba(62,91,255,0.4)] animate-pulse scale-110",
                                        !isCompleted && !isActive && "bg-secondary/30 border-white/5 text-muted-foreground/40"
                                    )}>
                                        <Icon size={18} className={cn(isActive && "animate-bounce")} />
                                    </div>
                                    <span className={cn(
                                        "text-[8px] font-black uppercase tracking-tighter transition-colors text-center w-16",
                                        isCompleted && "text-primary/70",
                                        isActive && "text-foreground",
                                        !isCompleted && !isActive && "text-muted-foreground/20"
                                    )}>
                                        {step.label}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                    <div className="mt-3 h-px w-full bg-border" />
                </div>
            </div>
        );
    }

    const TimestampLink = ({ children }: { children: React.ReactNode }) => {
        const text = String(children);
        const match = text.match(/\[(\d+)?(?::)?(\d+)?(?:\.)?(\d+)?\]/);
        if (match) {
            let totalSeconds = 0;
            const fullMatch = match[0].replace(/[\[\]]/g, '');
            if (fullMatch.includes(':')) {
                const parts = fullMatch.split(':');
                if (parts.length === 2) totalSeconds = parseInt(parts[0]) * 60 + parseFloat(parts[1]);
                else if (parts.length === 3) totalSeconds = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
            } else totalSeconds = parseFloat(fullMatch);

            const formatDisplayTime = (secs: number) => {
                const h = Math.floor(secs / 3600);
                const m = Math.floor((secs % 3600) / 60);
                const s = Math.floor(secs % 60);
                if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
                return `${m}:${s.toString().padStart(2, '0')}`;
            };

            return (
                <button
                    onClick={() => onSeek(totalSeconds)}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono text-[11px] font-bold hover:bg-primary hover:text-white transition-all mx-0.5 align-middle border border-primary/20"
                >
                    <PlayCircle size={10} />
                    {formatDisplayTime(totalSeconds)}
                </button>
            );
        }
        return <span>{children}</span>;
    };

    const [page, setPage] = React.useState<1 | 2 | 3>(1);
    const isDefaultSynthesis = summaryType.toLowerCase() === "default";

    // Persona Labels Config
    const personaConfig = React.useMemo(() => {
        const type = summaryType.toLowerCase();
        
        let config = {
            title: t("podcastIntelligenceSynthesis"),
            theme: "from-primary/10 to-transparent",
            page1: t("reportOverview"),
            page2: t("neuralSignals"),
            page3: t("knowledgeMap")
        };

        if (type === 'executive') {
            config = {
                title: t("executiveIntelligenceReport"),
                theme: "from-amber-500/10 to-transparent",
                page1: t("strategicOutlook"),
                page2: t("signalIntelligence"),
                page3: t("riskDecision")
            };
        } else if (type === 'technical') {
            config = {
                title: t("technicalArchitectureBrief"),
                theme: "from-blue-500/10 to-transparent",
                page1: t("systemDeepDive"),
                page2: t("engineeringSignals"),
                page3: t("implementationRoadmap")
            };
        }

        // Apply persona-specific titles to Page 3 if applicable
        if (persona === 'investor') {
            config.page3 = "Strategic Analysis";
        } else if (persona === 'skeptic') {
            config.page3 = "Critical Review";
        }

        return config;
    }, [summaryType, persona, t]);

    type ClaimCheck = NonNullable<Summary['claim_checks']>[number];
    const [selectedClaim, setSelectedClaim] = React.useState<ClaimCheck | null>(null);
    const peakDensity = summary?.timeline_density && summary.timeline_density.length > 0
        ? summary.timeline_density.reduce((max, p) => (p.value > max.value ? p : max), summary.timeline_density[0])
        : null;
    const avgDensity = summary?.timeline_density && summary.timeline_density.length > 0
        ? Math.round((summary.timeline_density.reduce((sum, p) => sum + p.value, 0) / summary.timeline_density.length) * 100)
        : null;
    const evidenceCount = Array.isArray(summary?.insight_attribution) ? summary!.insight_attribution!.length : 0;
    const topicCount = summary?.topic_transitions ? summary.topic_transitions.length : 0;
    const insightPeaks = summary?.insight_timeline && summary.insight_timeline.length > 0
        ? (() => {
            const maxVal = Math.max(...summary.insight_timeline.map(p => (p.intensity || p.insight_count || 0)), 1);
            return summary.insight_timeline.filter(p => (p.intensity || p.insight_count || 0) > maxVal * 0.7).length;
        })()
        : 0;
    const densityPeakIndex = summary?.timeline_density && summary.timeline_density.length > 0
        ? summary.timeline_density.findIndex(p => p.time === peakDensity?.time)
        : -1;
    const actionCount = summary?.action_items?.length || 0;
    const takeawayCount = summary?.key_takeaways?.length || 0;
    const questionCount = summary?.suggested_questions?.length || 0;
    const speakerEntriesRaw = summary?.speaker_contribution ? Object.entries(summary.speaker_contribution) : [];
    const speakerTotalRaw = speakerEntriesRaw.reduce((sum, [, v]) => sum + (typeof v === "number" ? v : 0), 0);
    const speakerScale = speakerTotalRaw > 0 && speakerTotalRaw <= 1.01 ? 100 : 1;
    const speakerEntries = speakerEntriesRaw.map(([name, v]) => [name, (typeof v === "number" ? v : 0) * speakerScale] as [string, number]);
    const speakerTotal = speakerEntries.reduce((sum, [, v]) => sum + v, 0);
    const speakerColors = ["#3E5BFF", "#22C55E", "#F97316", "#E11D48", "#A855F7", "#14B8A6"];
    const speakerStops = speakerEntries.length > 0
        ? speakerEntries.map(([name, value], idx) => {
            const pct = speakerTotal ? (value / speakerTotal) * 100 : 0;
            return `${speakerColors[idx % speakerColors.length]} ${pct.toFixed(2)}%`;
        }).join(", ")
        : "#1f2937 100%";

    const topicsRaw = summary?.topics || [];
    const topicsTotalRaw = topicsRaw.reduce((sum, t) => sum + (typeof t.value === "number" ? t.value : 0), 0);
    const topicsScale = topicsTotalRaw > 0 && topicsTotalRaw <= 1.01 ? 100 : 1;
    const topicsScaled = topicsRaw.map(t => ({ ...t, value: (typeof t.value === "number" ? t.value : 0) * topicsScale }));

    const keyMoments = (() => {
        const usedTimes = new Set(
            (summary?.key_quotes || []).map((q) => Math.round((q.timestamp || 0)))
        );
        const candidates = transcriptSegments
            .filter((s) => (s.text || "").length >= 80)
            .map((s) => ({ timestamp: s.start, text: s.text }))
            .sort((a, b) => b.text.length - a.text.length);

        const picked: { timestamp: number; text: string }[] = [];
        const seenText = new Set<string>();
        for (const c of candidates) {
            const tKey = Math.round(c.timestamp);
            const textKey = c.text.slice(0, 120).toLowerCase();
            if (usedTimes.has(tKey) || seenText.has(textKey)) continue;
            seenText.add(textKey);
            picked.push(c);
            if (picked.length >= 4) break;
        }
        return picked;
    })();

    return (
        <div className="flex-1 overflow-y-auto custom-scrollbar relative">

            <SummaryHeader
                title={personaConfig.title}
                page={page}
                setPage={setPage}
                page1={personaConfig.page1}
                page2={personaConfig.page2}
                page3={personaConfig.page3}
            />

            {/* Pagination Content Switcher */}
            <div className="max-w-4xl mx-auto px-12 pb-40 space-y-16">

                {page === 1 && (
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className="space-y-10"
                    >
                        {/* TIER 1: Executive Briefing (Full Width) */}
                        <div className="w-full">
                            <BriefingHero brief={summary.executive_brief} density={summary.insight_density} lang={lang} />
                        </div>

                        {/* BENTO GRID LAYOUT */}
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                            
                            {/* LEFT COLUMN: Main Report & Quotes (8 cols) */}
                            <div className="lg:col-span-8 space-y-10">
                                
                                {/* Full Intelligence Summary */}
                                {summary.global_summary && (
                                    <section className="space-y-5">
                                        <div className="flex items-center gap-3 px-2">
                                            <div className="relative">
                                                <div className="absolute inset-0 bg-primary/20 blur-md rounded-full" />
                                                <FileText size={20} className="text-primary relative z-10" />
                                            </div>
                                            <h3 className="text-xl font-black font-heading tracking-tighter uppercase">{t("reportOverview")}</h3>
                                        </div>
                                        <div className="glass-card p-8 md:p-10 rounded-[32px] border border-white/10 bg-card/60 backdrop-blur-2xl shadow-2xl shadow-black/40 relative overflow-hidden">
                                            {/* Decorative glow */}
                                            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 blur-[100px] rounded-full pointer-events-none" />
                                            
                                            <div className="prose prose-invert prose-primary max-w-none relative z-10 prose-headings:font-heading prose-headings:font-black prose-headings:tracking-tighter prose-headings:uppercase prose-p:text-foreground/90 prose-p:leading-relaxed prose-p:text-[15px] prose-strong:text-primary prose-strong:font-bold prose-li:text-[14.5px] prose-li:leading-relaxed">
                                                <ReactMarkdown
                                                    remarkPlugins={[remarkGfm]}
                                                    components={{
                                                        h2: ({ children }) => <h2 className="text-lg text-primary mt-8 mb-4 flex items-center gap-3">
                                                            <div className="w-1.5 h-5 bg-primary rounded-full shadow-[0_0_10px_rgba(var(--primary),0.5)]" />
                                                            {children}
                                                        </h2>,
                                                        h3: ({ children }) => <h3 className="text-base text-foreground/90 mt-6 mb-3 font-black tracking-tight uppercase">{children}</h3>,
                                                        p: ({ children }) => {
                                                            const processContent = (node: any): any => {
                                                                if (typeof node === 'string') {
                                                                    const parts = node.split(/([\d.:]+)/g);
                                                                    return parts.map((part, i) => (part.match(/\[[\d.:]+\]/) ? <TimestampLink key={i}>{part}</TimestampLink> : part));
                                                                }
                                                                if (Array.isArray(node)) return node.map(processContent);
                                                                if (node.props && node.props.children) return { ...node, props: { ...node.props, children: processContent(node.props.children) } };
                                                                return node;
                                                            };
                                                            return <p className="mb-4">{processContent(children)}</p>;
                                                        },
                                                        li: ({ children }) => {
                                                            const processContent = (node: any): any => {
                                                                if (typeof node === 'string') {
                                                                    const parts = node.split(/([\d.:]+)/g);
                                                                    return parts.map((part, k) => (part.match(/\[[\d.:]+\]/) ? <TimestampLink key={k}>{part}</TimestampLink> : part));
                                                                }
                                                                if (Array.isArray(node)) return node.map(processContent);
                                                                return node;
                                                            };
                                                            return <li className="mb-2 list-none border-l-2 border-primary/30 pl-4 relative before:absolute before:left-[-1px] before:top-2 before:w-0.5 before:h-0.5 before:bg-primary before:rounded-full">{processContent(children)}</li>;
                                                        }
                                                    }}
                                                >
                                                    {summary.global_summary}
                                                </ReactMarkdown>
                                            </div>
                                        </div>
                                    </section>
                                )}

                                {/* Key Quotes */}
                                {Array.isArray(summary.key_quotes) && summary.key_quotes.length > 0 && (
                                    <section className="space-y-5">
                                        <div className="flex items-center gap-3 px-2">
                                            <div className="relative">
                                                <div className="absolute inset-0 bg-primary/20 blur-md rounded-full" />
                                                <Zap size={20} className="text-primary relative z-10" />
                                            </div>
                                            <h3 className="text-xl font-black font-heading tracking-tighter uppercase">{t("keyQuotes")}</h3>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            {summary.key_quotes.slice(0, 4).map((q, i) => (
                                                <button
                                                    key={`${q.timestamp}-${i}`}
                                                    onClick={() => onSeek(q.timestamp)}
                                                    className="text-left p-6 rounded-[24px] bg-card/40 backdrop-blur-md border border-white/10 hover:border-primary/40 hover:bg-primary/5 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/10 transition-all duration-300 group relative overflow-hidden flex flex-col h-full"
                                                >
                                                    {/* Large decorative quote mark */}
                                                    <div className="absolute -top-4 -left-2 text-8xl font-serif font-black text-white/[0.03] group-hover:text-primary/[0.05] transition-colors pointer-events-none select-none leading-none">
                                                        "
                                                    </div>
                                                    
                                                    <div className="flex items-center gap-2 mb-3 relative z-10">
                                                        <PlayCircle size={14} className="text-primary/60 group-hover:text-primary transition-colors" />
                                                        <span className="text-[11px] font-mono font-bold text-primary/80 tracking-widest">{formatTime(q.timestamp)}</span>
                                                    </div>
                                                    <p className="text-[14px] font-medium leading-relaxed text-foreground/90 italic relative z-10 flex-grow">
                                                        "{q.text}"
                                                    </p>
                                                    {(q as any).context && (
                                                        <p className="mt-4 text-[11.5px] text-muted-foreground/80 relative z-10 font-medium border-t border-white/5 pt-3">{(q as any).context}</p>
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    </section>
                                )}
                            </div>

                            {/* RIGHT COLUMN: Sidebar (4 cols) */}
                            <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-6">
                                
                                {/* Persona Controls */}
                                <section className="glass-card p-1.5 rounded-full bg-card/60 backdrop-blur-xl border border-white/10 shadow-lg flex items-center justify-between">
                                    <div className="pl-4 pr-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground hidden sm:block">{t("personaLens")}</div>
                                    <div className="flex items-center gap-1 w-full sm:w-auto justify-end">
                                        {(['default', 'investor', 'skeptic'] as const).map((p) => (
                                            <button
                                                key={p}
                                                onClick={() => onPersonaChange?.(p)}
                                                className={cn(
                                                    "px-4 py-2 text-[11px] font-black uppercase tracking-widest rounded-full transition-all flex-1 sm:flex-none text-center",
                                                    persona === p 
                                                        ? "bg-primary text-white shadow-[0_0_15px_rgba(var(--primary),0.4)] scale-105 z-10" 
                                                        : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                                                )}
                                            >
                                                {p === 'default' ? t("default") : p === 'investor' ? t("investor") : t("skeptic")}
                                            </button>
                                        ))}
                                    </div>
                                </section>

                                {/* Persona Summary */}
                                {(() => {
                                    const personaText = persona !== 'default'
                                        ? ((summary as any)?.persona_summaries?.[persona] || '')
                                        : ((summary as any)?.persona_summaries?.['default'] || '');
                                    if (!personaText) return null;
                                    return (
                                        <section className="p-6 rounded-[24px] bg-primary/10 border border-primary/20 shadow-lg shadow-primary/5 relative overflow-hidden">
                                            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/20 blur-[50px] rounded-full pointer-events-none" />
                                            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-primary mb-3 relative z-10">
                                                <Users size={14} />
                                                {persona === 'investor' ? t('investor') : persona === 'skeptic' ? t('skeptic') : t('default')} {t('personaLens')}
                                            </div>
                                            <div className="text-[13.5px] leading-relaxed text-foreground/90 whitespace-pre-line relative z-10 font-medium">
                                                {personaText}
                                            </div>
                                        </section>
                                    );
                                })()}

                                {/* Key Insights */}
                                {Array.isArray((summary as any).key_insights) && (summary as any).key_insights.length > 0 && (
                                    <section className="glass-card p-6 md:p-8 rounded-[32px] bg-card/60 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/40">
                                        <div className="flex items-center gap-3 mb-6">
                                            <div className="relative">
                                                <div className="absolute inset-0 bg-primary/20 blur-md rounded-full" />
                                                <BrainCircuit size={18} className="text-primary relative z-10" />
                                            </div>
                                            <h3 className="text-base font-black font-heading tracking-tighter uppercase">{t("insights")}</h3>
                                        </div>
                                        <div className="space-y-4">
                                            {((summary as any).key_insights as string[]).slice(0, 5).map((insight, i) => (
                                                <div key={i} className="group">
                                                    <InsightCard index={i} text={insight} />
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                )}

                                {/* Action Items */}
                                {Array.isArray(summary.action_items) && summary.action_items.length > 0 && (
                                    <section className="glass-card p-6 md:p-8 rounded-[32px] bg-card/60 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/40">
                                        <div className="flex items-center gap-3 mb-6">
                                            <div className="relative">
                                                <div className="absolute inset-0 bg-primary/20 blur-md rounded-full" />
                                                <ListChecks size={18} className="text-primary relative z-10" />
                                            </div>
                                            <h3 className="text-base font-black font-heading tracking-tighter uppercase">{t("actionPlan")}</h3>
                                        </div>
                                        <div className="space-y-3">
                                            {(Array.isArray(summary.action_items_structured) && summary.action_items_structured.length > 0
                                                ? summary.action_items_structured
                                                : summary.action_items.map(text => ({ text, priority: 'medium', owner: '', timeline: '' }))
                                            ).map((item: any, i: number) => (
                                                <div key={i} className="flex gap-4 p-4 rounded-2xl bg-secondary/20 border border-white/5 hover:border-primary/20 hover:bg-primary/5 transition-all group">
                                                    <div className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black ${
                                                        item.priority === 'high' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                                                        item.priority === 'medium' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                                                        'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                                    }`}>{i + 1}</div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-[13.5px] font-medium leading-relaxed text-foreground/90">{typeof item === 'string' ? item : item.text}</p>
                                                        {item.timeline && <p className="mt-1 text-[10px] text-muted-foreground/60 font-mono">{item.timeline}</p>}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                )}
                            </div>
                        </div>
                    </motion.div>
                )}


                {page === 2 && (
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-8 py-8"
                    >
                        <div className="flex items-center gap-3">
                            <Activity size={24} className="text-primary" />
                            <h3 className="text-2xl font-black font-heading tracking-tighter uppercase">{t("deepNeuralSignalAnalysis")}</h3>
                        </div>

                        {/* Signal Snapshot */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="p-5 rounded-2xl bg-secondary/10 border border-white/5">
                                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{t("peakIntensity")}</div>
                                <div className="mt-2 text-xl font-black text-foreground">
                                    {peakDensity ? formatTime(peakDensity.time) : "N/A"}
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                    {avgDensity !== null ? t("avgDensityPct", { pct: avgDensity }) : t("noDensityData")}
                                </div>
                            </div>
                            <div className="p-5 rounded-2xl bg-secondary/10 border border-white/5">
                                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{t("evidenceSignals")}</div>
                                <div className="mt-2 text-xl font-black text-foreground">
                                    {evidenceCount || "N/A"}
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                    {evidenceCount ? t("insightsWithAnchors") : t("noGroundedInsights")}
                                </div>
                            </div>
                            <div className="p-5 rounded-2xl bg-secondary/10 border border-white/5">
                                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{t("topicBlocks")}</div>
                                <div className="mt-2 text-xl font-black text-foreground">
                                    {topicCount || "N/A"}
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                    {insightPeaks ? `${insightPeaks} insight peaks` : t("noDataAvailable")}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* 1. Voice Analytics */}
                            {summary.speaker_contribution &&
                                Object.keys(summary.speaker_contribution).length > 0 &&
                                !(Object.keys(summary.speaker_contribution).length === 1 && summary.speaker_contribution["Unknown"] === 100) && (
                                    <SpeakerStats speakerEntries={speakerEntries} speakerColors={speakerColors} t={t} />
                                )}

                            {/* 2. Thematic Mapping */}
                            {topicsScaled && topicsScaled.length > 0 && (
                                <div className="p-8 rounded-[32px] bg-secondary/5 border border-white/5 space-y-6">
                                    <div className="flex items-center gap-3">
                                        <BarChart3 size={18} className="text-primary" />
                                        <h3 className="text-xs font-black uppercase tracking-widest">{t("thematicMapping")}</h3>
                                    </div>
                                    <div className="h-64">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <ReBarChart data={topicsScaled} layout="vertical" margin={{ left: -20 }}>
                                                <XAxis type="number" hide />
                                                <YAxis
                                                    dataKey="label"
                                                    type="category"
                                                    width={80}
                                                    tick={{ fontSize: 9, fontWeight: 700, fill: 'rgba(255,255,255,0.4)' }}
                                                    axisLine={false}
                                                    tickLine={false}
                                                />
                                                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                                    {topicsScaled.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill="#3E5BFF" fillOpacity={0.4 + (entry.value / 100) * 0.6} />
                                                    ))}
                                                </Bar>
                                                <ReTooltip
                                                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                                    contentStyle={{ backgroundColor: '#09090b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', fontSize: '10px' }}
                                                />
                                            </ReBarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            )}

                            {/* 3. Timeline Density & Insights */}
                            {summary.timeline_density && summary.timeline_density.length > 0 && (
                                <div className="md:col-span-2 p-8 rounded-[32px] bg-secondary/5 border border-white/5 space-y-8 relative overflow-hidden">
                                    <div className="flex items-center gap-3 relative z-10">
                                        <Activity size={18} className="text-primary" />
                                        <h3 className="text-xs font-black uppercase tracking-widest">{t("timelineDensity")}</h3>
                                        {peakDensity && (
                                            <span className="text-[9px] text-muted-foreground italic ml-auto">
                                                Intelligence Peak at {formatTime(peakDensity.time)}
                                            </span>
                                        )}
                                    </div>

                                    <div className="h-64 mt-4">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <ReComposedChart data={summary.timeline_density && summary.timeline_density.length > 0 ? summary.timeline_density : Array.from({length: 20}).map((_, i) => ({ time: i*60, value: Math.random() * 0.5 + 0.1 }))}>
                                                <defs>
                                                    <linearGradient id="densityGradient" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#3E5BFF" stopOpacity={0.8} />
                                                        <stop offset="95%" stopColor="#3E5BFF" stopOpacity={0} />
                                                    </linearGradient>
                                                </defs>
                                                <XAxis
                                                    dataKey="time"
                                                    tickFormatter={(t) => `${Math.floor(t / 60)}m`}
                                                    tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.3)' }}
                                                    axisLine={false}
                                                    tickLine={false}
                                                />
                                                <YAxis hide domain={[0, 1.1]} />
                                                <Area
                                                    type="monotone"
                                                    dataKey="value"
                                                    stroke="#3E5BFF"
                                                    strokeWidth={2}
                                                    fillOpacity={1}
                                                    fill="url(#densityGradient)"
                                                />
                                                {/* Markers for LLM Insight Points if they exist */}
                                                {Array.isArray(summary.insight_timeline) && summary.insight_timeline.length > 0 && (
                                                    <Scatter
                                                        data={summary.insight_timeline}
                                                        fill="#F97316"
                                                        name="Insight"
                                                        onClick={(data) => data && onSeek(data.time)}
                                                        className="cursor-pointer"
                                                    />
                                                )}
                                                <ReTooltip
                                                    content={({ active, payload }) => {
                                                        if (active && payload && payload.length) {
                                                            const data = payload[0].payload;
                                                            return (
                                                                <div className="bg-black/90 border border-white/10 p-3 rounded-xl shadow-2xl backdrop-blur-md">
                                                                    <div className="text-[10px] font-black text-primary uppercase mb-1">{formatTime(data.time)}</div>
                                                                    <div className="text-[11px] font-bold text-foreground">
                                                                        {data.label || (data.value ? `Intensity: ${Math.round(data.value * 100)}%` : 'Data Node')}
                                                                    </div>
                                                                </div>
                                                            );
                                                        }
                                                        return null;
                                                    }}
                                                />
                                            </ReComposedChart>
                                        </ResponsiveContainer>
                                    </div>

                                    {/* Topic Transitions Timeline */}
                                    {Array.isArray(summary.topic_transitions) && summary.topic_transitions.length > 0 && (
                                        <TopicTimeline
                                            items={summary.topic_transitions}
                                            onSeek={onSeek}
                                            formatTime={formatTime}
                                            colors={speakerColors}
                                        />
                                    )}
                                </div>
                            )}

                            {/* 4. Evidence-backed Insights */}
                            {Array.isArray(summary.insight_attribution) && summary.insight_attribution.length > 0 && (
                                <div className="md:col-span-2 p-8 rounded-[32px] bg-secondary/5 border border-white/5 space-y-6">
                                    <div className="flex items-center gap-3">
                                        <Sparkles size={18} className="text-primary" />
                                        <h3 className="text-xs font-black uppercase tracking-widest">Evidence-backed Insights</h3>
                                    </div>
                                    <div className="space-y-3">
                                        {summary.insight_attribution.slice(0, 8).map((item, i) => {
                                            const row = item as unknown as Record<string, unknown>;
                                            const start = Number(row.start || 0);
                                            const evidenceText = String(row.evidence_text || "");
                                            const speaker = String(row.speaker || "Unknown");
                                            const confidence = Number(row.confidence || 0);
                                            return (
                                                <button
                                                    key={`${start}-${i}`}
                                                    onClick={() => onSeek(start)}
                                                    className="w-full text-left rounded-2xl border border-white/10 bg-secondary/20 p-4 hover:border-primary/30 hover:bg-primary/5 transition-all"
                                                >
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <span className="text-[10px] font-mono font-bold text-primary">{formatTime(start)}</span>
                                                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{speaker}</span>
                                                        {confidence > 0 && (
                                                            <span className="ml-auto text-[10px] text-muted-foreground">
                                                                confidence {Math.round(confidence * 100)}%
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-sm font-semibold text-foreground/90 leading-relaxed">
                                                        {String(row.insight || "")}
                                                    </div>
                                                    <div className="mt-2 text-xs text-muted-foreground line-clamp-2">
                                                        {evidenceText}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
                {page === 3 && (
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="space-y-12 py-8"
                    >
                        {/* KPI Cards Re-Layout */}
                        <div className="flex items-center gap-3">
                            <ListChecks size={24} className="text-primary" />
                            <h3 className="text-2xl font-black font-heading tracking-tighter uppercase">{personaConfig.page3}</h3>
                        </div>

                        {isDefaultSynthesis ? (
                            <section className="space-y-8">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="p-6 rounded-3xl bg-secondary/10 border border-white/5 space-y-4">
                                        <div className="text-[10px] font-black uppercase tracking-widest text-primary/80">{t("thematicMapping")}</div>
                                        <div className="space-y-2">
                                            {(summary.topic_transitions || []).slice(0, 6).map((segment, i) => (
                                                <button
                                                    key={`${segment.start}-${i}`}
                                                    onClick={() => onSeek(segment.start)}
                                                    className="w-full flex items-center gap-3 rounded-2xl border border-white/5 px-3 py-2 hover:border-primary/30 hover:bg-primary/5 transition-all"
                                                >
                                                    <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: segment.color || "#3E5BFF" }} />
                                                    <span className="text-xs font-semibold text-foreground/90 truncate">{segment.topic}</span>
                                                    <span className="ml-auto text-[10px] font-mono text-muted-foreground">{formatTime(segment.start)}</span>
                                                </button>
                                            ))}
                                            {(summary.topic_transitions || []).length === 0 && (topicsScaled || []).slice(0, 6).map((topic, i) => (
                                                <div key={`${topic.label}-${i}`} className="flex items-center gap-3 rounded-2xl border border-white/5 px-3 py-2">
                                                    <div className="w-2.5 h-2.5 rounded-sm bg-primary/70" />
                                                    <span className="text-xs font-semibold text-foreground/90 truncate">{topic.label}</span>
                                                    <span className="ml-auto text-[10px] font-mono text-muted-foreground">{Math.round(topic.value)}%</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="p-6 rounded-3xl bg-secondary/10 border border-white/5 space-y-4">
                                        <div className="text-[10px] font-black uppercase tracking-widest text-primary/80">{t("smartQuestions")}</div>
                                        <div className="space-y-2">
                                            {(summary.suggested_questions || []).slice(0, 6).map((q, i) => (
                                                <div key={i} className="rounded-2xl border border-dashed border-white/10 px-3 py-2 text-sm text-foreground/80">
                                                    {q}
                                                </div>
                                            ))}
                                            {(summary.suggested_questions || []).length === 0 && (
                                                <div className="rounded-2xl border border-dashed border-white/10 px-3 py-2 text-sm text-muted-foreground">
                                                    {t("assessmentUnavailableDesc")}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </section>
                        ) : (
                            <section className="space-y-6">
                                <div className="glass-card p-8 rounded-[32px] bg-card/40 backdrop-blur-xl border border-white/10">
                                    <div className="flex items-center gap-3 mb-6">
                                        <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
                                            <Brain size={20} className="text-primary" />
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-black uppercase tracking-widest text-primary/80">
                                                {persona === 'investor' ? 'Market & Investment Analysis' : 'Critical & Skeptical Analysis'}
                                            </h4>
                                            <p className="text-[10px] text-muted-foreground uppercase tracking-tight">Lens-specific knowledge map</p>
                                        </div>
                                    </div>
                                    <div className="text-[15px] font-medium leading-relaxed text-foreground/80 whitespace-pre-wrap">
                                        {(summary as any)?.persona_summaries?.[persona] || (summary as any)?.persona_summaries?.['default'] || "Analysis pending for this lens."}
                                    </div>
                                </div>
                            </section>
                        )}

                        {isDefaultSynthesis ? (
                            <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {keyMoments.slice(0, 4).map((m, i) => (
                                    <button
                                        key={`${m.timestamp}-${i}`}
                                        onClick={() => onSeek(m.timestamp)}
                                        className="p-6 text-left rounded-3xl bg-secondary/5 border border-dashed border-white/10 hover:border-primary/30 hover:bg-primary/5 transition-all"
                                    >
                                        <div className="text-[10px] font-mono font-bold text-primary/80 mb-2">{formatTime(m.timestamp)}</div>
                                        <div className="text-sm text-foreground/80 leading-relaxed line-clamp-4">{m.text}</div>
                                    </button>
                                ))}
                            </section>
                        ) : (
                            <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {(summary.suggested_questions || []).map((q, i) => (
                                    <div key={i} className="p-6 rounded-3xl bg-secondary/5 border border-dashed border-white/10 text-sm text-foreground/80 leading-relaxed italic">
                                        <Sparkles size={14} className="text-primary/40 mb-2" />
                                        {q}
                                    </div>
                                ))}
                            </section>
                        )}
                    </motion.div>
                )}
            </div>


            {selectedClaim && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm px-6">
                    <div className="w-full max-w-2xl rounded-3xl bg-background border border-white/10 shadow-2xl p-6">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <div className="text-xs font-black uppercase tracking-widest text-muted-foreground">Claim</div>
                                <div className="mt-2 text-sm text-foreground/90">{selectedClaim?.claim}</div>
                            </div>
                            <button
                                onClick={() => setSelectedClaim(null)}
                                className="px-3 py-1.5 rounded-full text-xs font-bold bg-secondary/50 hover:bg-secondary/80"
                            >
                                Close
                            </button>
                        </div>
                        <div className="mt-4 space-y-3">
                            {(selectedClaim?.sources || []).length === 0 && (
                                <div className="text-xs text-muted-foreground">
                                    No sources available for this claim.
                                </div>
                            )}
                            {(selectedClaim?.sources || []).map((s, i) => (
                                <div key={`${s.link}-${i}`} className="p-3 rounded-2xl bg-secondary/30 border border-white/5">
                                    <div className="text-sm font-semibold">{s.title || "Source"}</div>
                                    {s.snippet && <div className="text-xs text-muted-foreground mt-1">{s.snippet}</div>}
                                    {s.link && (
                                        <a
                                            href={s.link}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-xs text-primary mt-2 inline-block"
                                        >
                                            Open source
                                        </a>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
