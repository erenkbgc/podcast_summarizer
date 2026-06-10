"use client";

import { motion } from "framer-motion";
import { Clock, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState, useMemo } from "react";
import { AnimatePresence } from "framer-motion";

interface Segment {
    start: number;
    end: number;
    text: string;
    speaker?: string;
}

interface TranscriptViewProps {
    segments: Segment[];
    currentTime: number;
    onSeek: (time: number) => void;
    speakerMap?: Record<string, string>;
    status?: string;
    progress?: number;
    isPanelMode?: boolean;
    preferred_lang?: string;
}

export function TranscriptView({ segments, currentTime, onSeek, speakerMap, status, progress, isPanelMode, preferred_lang }: TranscriptViewProps) {

    const resolveSpeakerName = (speakerId?: string) => {
        if (!speakerId) return "Unknown Speaker";
        const raw = speakerId.trim();
        const lower = raw.toLowerCase();
        if (lower.includes("unknown")) return "Unknown Speaker";
        if (!speakerMap) return `Speaker ${raw.slice(-2)}`;
        if (speakerMap[raw]) return speakerMap[raw];
        const compact = raw.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
        const found = Object.entries(speakerMap).find(([k]) => k.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() === compact);
        if (found?.[1]) return found[1];
        const idx = raw.match(/\d+/)?.[0];
        if (idx) {
            const byIndex = Object.entries(speakerMap).find(([k]) => {
                const keyIdx = k.match(/\d+/)?.[0];
                return keyIdx === idx;
            });
            if (byIndex?.[1]) return byIndex[1];
        }
        return `Speaker ${raw.slice(-2)}`;
    };

    const scrollRef = useRef<HTMLDivElement>(null);
    const [autoScroll, setAutoScroll] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const lastActiveIndexRef = useRef<number>(-1);

    // 1. Filter segments by search query
    const filteredSegments = useMemo(() => {
        if (!searchQuery.trim()) return segments;
        const q = searchQuery.toLowerCase();
        return segments.filter(s => s.text.toLowerCase().includes(q));
    }, [segments, searchQuery]);

    // 2. Group consecutive segments by the same speaker
    const groupedSegments = useMemo(() => {
        if (!filteredSegments || filteredSegments.length === 0) return [];
        const groups: { speaker?: string; start: number; end: number; items: Segment[] }[] = [];
        let currentGroup = {
            speaker: filteredSegments[0].speaker,
            start: filteredSegments[0].start,
            end: filteredSegments[0].end,
            items: [filteredSegments[0]]
        };
        for (let i = 1; i < filteredSegments.length; i++) {
            const seg = filteredSegments[i];
            if (seg.speaker === currentGroup.speaker) {
                currentGroup.items.push(seg);
                currentGroup.end = seg.end;
            } else {
                groups.push(currentGroup);
                currentGroup = {
                    speaker: seg.speaker,
                    start: seg.start,
                    end: seg.end,
                    items: [seg]
                };
            }
        }
        groups.push(currentGroup);
        return groups;
    }, [filteredSegments]);

    const activeIndex = segments.findIndex(s => currentTime >= s.start && currentTime <= s.end);

    const handleScroll = () => {
        setAutoScroll(false);
        if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = setTimeout(() => {
            setAutoScroll(true);
        }, 3000);
    };

    // Auto-scroll logic targeting the specific active sentence inside groups
    useEffect(() => {
        if (autoScroll && activeIndex !== -1 && activeIndex !== lastActiveIndexRef.current && scrollRef.current && !searchQuery) {
            lastActiveIndexRef.current = activeIndex;
            const container = scrollRef.current;
            const activeEl = container.querySelector(`[data-segment-idx="${activeIndex}"]`) as HTMLElement;
            if (activeEl) {
                const focalPoint = container.clientHeight * 0.4;
                const scrollOffset = activeEl.offsetTop - focalPoint;
                container.scrollTo({ top: Math.max(0, scrollOffset), behavior: "smooth" });
            }
        }
    }, [activeIndex, autoScroll, searchQuery]);

    const getSteps = (lang: string) => [
        { id: 'downloading', label: lang === 'tr' ? 'İndiriliyor' : 'Downloading', sub: lang === 'tr' ? 'Kaynak dosyalar alınıyor...' : 'Fetching source files...' },
        { id: 'transcribing', label: lang === 'tr' ? 'Döküm' : 'Transcription', sub: lang === 'tr' ? 'Ses metne dönüştürülüyor...' : 'Converting audio to text...' },
        { id: 'identifying_speakers', label: lang === 'tr' ? 'Konuşmacılar' : 'Speakers', sub: lang === 'tr' ? 'Sesler analiz ediliyor...' : 'Analyzing voices...' },
        { id: 'translating', label: lang === 'tr' ? 'Tercüme' : 'Translation', sub: lang === 'tr' ? 'Metin hedef dile çevriliyor...' : 'Translating content to target language...' },
        { id: 'summarizing', label: lang === 'tr' ? 'Özetleme' : 'Summarizing', sub: lang === 'tr' ? 'Ana fikirler çıkarılıyor...' : 'Extracting core ideas...' },
        { id: 'extracting_chapters', label: lang === 'tr' ? 'Dizin' : 'Indexing', sub: lang === 'tr' ? 'Bölümler oluşturuluyor...' : 'Creating chapters...' },
        { id: 'generating_insights', label: lang === 'tr' ? 'Zeka' : 'Intelligence', sub: lang === 'tr' ? 'Bilgi katmanları işleniyor...' : 'Processing logic layers...' },
        { id: 'indexing', label: lang === 'tr' ? 'Bellek' : 'Memory', sub: lang === 'tr' ? 'Anlamsal arama için indeksleniyor...' : 'Indexing for semantic search...' }
    ];

    if (!segments || !Array.isArray(segments) || segments.length === 0) {
        const lang = preferred_lang?.startsWith('tr') ? 'tr' : 'en';
        const steps = getSteps(lang);
        const currentStepIndex = steps.findIndex(s => s.id === status);
        const currentStep = steps[currentStepIndex > -1 ? currentStepIndex : 0];

        return (
            <div className="flex-1 flex flex-col items-center justify-center gap-12 p-8 bg-background/50 overflow-hidden text-center">
                {/* Loader State unchanged */}
                <div className="relative">
                    <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 10, ease: "linear" }} className="w-32 h-32 rounded-full border border-primary/20 border-t-primary shadow-[0_0_30px_rgba(var(--primary),0.1)]" />
                    <div className="absolute inset-0 flex items-center justify-center"><Sparkles size={32} className="text-primary animate-pulse" /></div>
                </div>
                <div className="w-full max-w-xs space-y-8">
                    <div className="relative h-20">
                        <AnimatePresence mode="wait">
                            <motion.div key={status} initial={{ opacity: 0, y: 10, filter: "blur(8px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -10, filter: "blur(8px)" }} transition={{ duration: 0.5, ease: "easeOut" }} className="absolute inset-0 text-center space-y-2">
                                <h3 className="text-xl font-black font-heading uppercase tracking-tighter bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-transparent">{currentStep.label}</h3>
                                <p className="text-muted-foreground text-[10px] font-medium uppercase tracking-[0.2em]">{currentStep.sub}</p>
                            </motion.div>
                        </AnimatePresence>
                    </div>
                    <div className="space-y-4">
                        <div className="flex justify-between items-center gap-1">
                            {steps.map((s, i) => (
                                <div key={s.id} className="flex-1 h-1 relative rounded-full overflow-hidden bg-secondary/30">
                                    <motion.div initial={false} animate={{ width: i < currentStepIndex ? "100%" : i === currentStepIndex ? `${Math.max(10, (progress || 0) * 100)}%` : "0%" }} className={cn("h-full transition-colors", i <= currentStepIndex ? "bg-primary shadow-[0_0_8px_rgba(var(--primary),0.5)]" : "bg-transparent")} />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Helper for highlight
    const renderHighlightedText = (text: string) => {
        if (!searchQuery) return text;
        const parts = text.split(new RegExp(`(${searchQuery})`, 'gi'));
        return parts.map((part, i) => 
            part.toLowerCase() === searchQuery.toLowerCase() 
                ? <span key={i} className="bg-yellow-500/30 text-yellow-200 rounded-sm px-0.5">{part}</span>
                : part
        );
    };

    return (
        <div className="flex-1 flex flex-col h-full bg-background/50 relative overflow-hidden">
            {/* Sticky Header / Search Toolbar */}
            <div className="absolute top-0 left-0 right-0 z-20 px-6 py-4 bg-background/80 backdrop-blur-xl border-b border-white/5 flex items-center justify-between">
                <div className="relative w-64 sm:w-80">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                    <input 
                        type="text" 
                        placeholder={preferred_lang?.startsWith('tr') ? "Dökümde ara..." : "Search transcript..."}
                        value={searchQuery}
                        onChange={(e) => { setSearchQuery(e.target.value); setAutoScroll(false); }}
                        className="w-full bg-secondary/30 border border-white/5 rounded-full py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground transition-all"
                    />
                </div>
                <button 
                    onClick={() => { setSearchQuery(""); setAutoScroll(true); }} 
                    className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary bg-primary/10 px-4 py-2 rounded-full hover:bg-primary/20 transition-colors shadow-[0_0_15px_rgba(var(--primary),0.1)]"
                >
                    <Clock className="w-3 h-3" />
                    {preferred_lang?.startsWith('tr') ? "Sese Senkronize Ol" : "Sync to Audio"}
                </button>
            </div>

            {/* Transcript Groups */}
            <div
                ref={scrollRef}
                onScroll={handleScroll}
                className={cn(
                    "flex-1 overflow-y-auto custom-scrollbar pt-24 pb-32",
                    isPanelMode ? "px-6" : "px-12"
                )}
            >
                <div className={cn("mx-auto", isPanelMode ? "max-w-full" : "max-w-4xl")}>
                    {groupedSegments.map((group, gIdx) => {
                        const isGroupActive = currentTime >= group.start && currentTime <= group.end && !searchQuery;
                        
                        return (
                            <motion.div 
                                key={`group-${gIdx}-${group.start}`}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: Math.min(gIdx * 0.05, 0.5) }}
                                className={cn(
                                    "mb-8 relative transition-all duration-500",
                                    isGroupActive ? "opacity-100" : (searchQuery ? "opacity-100" : "opacity-60 hover:opacity-100")
                                )}
                            >
                                {/* Speaker Header */}
                                {group.speaker && (
                                    <div className="flex items-center gap-3 mb-3 sticky top-20 z-10 w-max bg-background/90 backdrop-blur-md pr-4 py-1 rounded-full">
                                        <div className={cn(
                                            "w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white uppercase shadow-lg",
                                            "bg-gradient-to-br",
                                            group.speaker.toLowerCase().includes("unknown") ? "from-slate-500 to-slate-700" :
                                                group.speaker.includes("00") ? "from-purple-500 to-blue-500" :
                                                group.speaker.includes("01") ? "from-pink-500 to-orange-500" :
                                                "from-emerald-500 to-cyan-500"
                                        )}>
                                            {group.speaker.toLowerCase().includes("unknown") ? "?" : group.speaker.slice(-2)}
                                        </div>
                                        <span className="text-sm font-bold tracking-wide text-foreground/90">
                                            {resolveSpeakerName(group.speaker)}
                                        </span>
                                    </div>
                                )}

                                {/* Sentences inside Group */}
                                <div className="pl-11 space-y-3">
                                    {group.items.map((segment) => {
                                        const globalIdx = segments.findIndex(s => s.start === segment.start);
                                        const isSentenceActive = currentTime >= segment.start && currentTime <= segment.end && !searchQuery;
                                        
                                        return (
                                            <div 
                                                key={`seg-${segment.start}`}
                                                data-segment-idx={globalIdx}
                                                onClick={() => onSeek(segment.start)}
                                                className={cn(
                                                    "group/sentence relative cursor-pointer p-3 -ml-3 rounded-xl transition-all duration-300",
                                                    isSentenceActive ? "bg-primary/10 shadow-[0_0_20px_rgba(var(--primary),0.1)] border border-primary/20" : "hover:bg-secondary/40 border border-transparent"
                                                )}
                                            >
                                                {/* Timestamp Side-marker */}
                                                <div className={cn(
                                                    "absolute -left-16 top-3.5 flex items-center gap-2 transition-all duration-300",
                                                    isSentenceActive ? "opacity-100 translate-x-2" : "opacity-0 group-hover/sentence:opacity-50 -translate-x-2"
                                                )}>
                                                    <span className="font-mono text-[10px] font-bold text-primary tracking-tighter">
                                                        {formatTime(segment.start)}
                                                    </span>
                                                </div>

                                                <p className={cn(
                                                    "leading-relaxed transition-colors duration-300",
                                                    isPanelMode ? "text-base" : "text-lg",
                                                    isSentenceActive ? "text-foreground font-medium" : "text-muted-foreground group-hover/sentence:text-foreground/90"
                                                )}>
                                                    {renderHighlightedText(segment.text)}
                                                </p>
                                            </div>
                                        );
                                    })}
                                </div>
                            </motion.div>
                        );
                    })}
                    {searchQuery && groupedSegments.length === 0 && (
                        <div className="text-center py-20 text-muted-foreground/50">
                            <p className="text-lg mb-2">No matches found for "{searchQuery}"</p>
                            <p className="text-sm">Try a different keyword.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function formatTime(seconds: number) {
    if (isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
}
