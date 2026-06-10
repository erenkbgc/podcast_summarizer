"use client";

import {
    CheckCircle2,
    AlertCircle,
    Clock,
    Languages,
    DownloadCloud,
    Mic,
    Users,
    BrainCircuit,
    Layers,
    Zap,
    Search
} from "lucide-react";

import { cn } from "@/lib/utils";
import { getTranslation } from "@/lib/translations";

interface StatusBadgeProps {
    status: string;
    progress?: number;
    lang?: string;
}

export function StatusBadge({ status, progress, lang = "en" }: StatusBadgeProps) {
    const t = (key: string) => getTranslation(lang, key);
    const configs: Record<string, { icon: any, label: string, class: string }> = {
        completed: { icon: CheckCircle2, label: t("completeStatus"), class: 'bg-primary/10 text-primary border-primary/20' },
        failed: { icon: AlertCircle, label: "Failed", class: 'bg-destructive/10 text-destructive border-destructive/20' },
        pending: { icon: Clock, label: "Pending", class: 'bg-muted text-muted-foreground border-border' },
        downloading: { icon: DownloadCloud, label: t("download"), class: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
        transcribing: { icon: Mic, label: t("transcribe"), class: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
        translating: { icon: Languages, label: t("translating"), class: 'bg-pink-500/10 text-pink-400 border-pink-500/20' },
        summarizing: { icon: BrainCircuit, label: t("summarize"), class: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' },
        identifying_speakers: { icon: Users, label: t("speakers"), class: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
        extracting_chapters: { icon: Layers, label: t("chapters"), class: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' },
        generating_insights: { icon: Zap, label: t("insights"), class: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
        indexing: { icon: Search, label: t("index"), class: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
    };

    const config = configs[status] || configs.pending;
    const Icon = config.icon;

    return (
        <span className={cn(
            "flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-all shrink-0",
            config.class
        )}>
            {status === 'completed' ? <Icon size={10} /> : <div className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
            {config.label}

        </span>
    );
}
