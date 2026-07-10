"use client";

import { useState, useEffect, useRef } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { StatusBadge } from '@/components/StatusBadge';
import { ConfirmModal } from '@/components/ConfirmModal';
import {
    Plus,
    Search,
    PlayCircle,
    AlertCircle,
    Podcast,
    Trash2,
    X,
    ChevronDown,
    SortDesc,
} from 'lucide-react';

import api, { Episode, getEpisodes } from '@/lib/api';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';

const TAG_GROUP_COLORS: Record<string, string> = {
    finance: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    business: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    markets: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    motivation: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    health: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    wellness: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    tech: "bg-violet-500/15 text-violet-300 border-violet-500/30",
    ai: "bg-violet-500/15 text-violet-300 border-violet-500/30",
    product: "bg-violet-500/15 text-violet-300 border-violet-500/30",
    politics: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    culture: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    news: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    education: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    science: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
    default: "bg-slate-500/15 text-slate-300 border-slate-500/30",
};

const inferTagGroup = (label: string) => {
    const key = label.toLowerCase();
    if (key.includes("finan") || key.includes("market") || key.includes("busines") || key.includes("ekonomi") || key.includes("yatırım")) return "finance";
    if (key.includes("motiv") || key.includes("health") || key.includes("wellnes") || key.includes("sağlık") || key.includes("spor")) return "motivation";
    if (key.includes("ai") || key.includes("tech") || key.includes("product") || key.includes("teknoloji") || key.includes("yapay")) return "tech";
    if (key.includes("polit") || key.includes("news") || key.includes("haber") || key.includes("siyaset")) return "politics";
    if (key.includes("cultur") || key.includes("art") || key.includes("sanat") || key.includes("kültür")) return "culture";
    if (key.includes("educ") || key.includes("learn") || key.includes("eğitim") || key.includes("ders")) return "education";
    if (key.includes("science") || key.includes("research") || key.includes("bilim") || key.includes("araştırma")) return "science";
    return "default";
};

type SortOption = 'newest' | 'oldest' | 'title' | 'status';

export default function LibraryPage() {
    const { user, isLoading: authLoading } = useAuth();
    const router = useRouter();
    const queryClient = useQueryClient();

    const deletingIds = useRef<Set<number>>(new Set());
    const [confirmDelete, setConfirmDelete] = useState<{ isOpen: boolean; id: number | null }>({
        isOpen: false,
        id: null
    });
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTag, setActiveTag] = useState<string | null>(null);
    const [sortBy, setSortBy] = useState<SortOption>('newest');
    const [showSort, setShowSort] = useState(false);
    const searchRef = useRef<HTMLInputElement>(null);

    const { data: episodes = [], isLoading: dataLoading, isError, error, refetch } = useQuery({
        queryKey: ['episodes'],
        queryFn: async () => {
            const response = await getEpisodes();
            return response.data;
        },
        enabled: !!user,
        retry: 1,
    });

    // Effective loading state: wait for auth OR data (but only on first load)
    const isLoading = dataLoading && episodes.length === 0;

    // Collect all unique tags from loaded episodes
    const allTags = Array.from(
        new Set(episodes.flatMap((e: Episode) => (e.podcast_tags || []).map((t: any) => t.label)))
    ) as string[];

    // Client-side filter + sort
    const filteredEpisodes = episodes
        .filter((ep: Episode) => {
            const q = searchQuery.toLowerCase();
            const matchText = !q || ep.title.toLowerCase().includes(q) || (ep.show_name || '').toLowerCase().includes(q);
            const matchTag = !activeTag || (ep.podcast_tags || []).some((t: any) => t.label === activeTag);
            return matchText && matchTag;
        })
        .sort((a: Episode, b: Episode) => {
            if (sortBy === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            if (sortBy === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
            if (sortBy === 'title') return a.title.localeCompare(b.title);
            if (sortBy === 'status') return (a.status || '').localeCompare(b.status || '');
            return 0;
        });

    const hasFilters = searchQuery || activeTag;

    // Cmd+K focuses search
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                searchRef.current?.focus();
            }
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, []);

    const handleDelete = async (id: number) => {
        deletingIds.current.add(id);
        // Optimistic UI update via cache or local filter (local filter here for simplicity with existing architecture)
        queryClient.setQueryData(['episodes'], (old: Episode[] | undefined) =>
            old ? old.filter(e => e.id !== id) : []
        );

        try {
            await api.delete(`/v1/episodes/${id}`);
            queryClient.invalidateQueries({ queryKey: ['episodes'] });
        } catch (error) {
            console.error('Failed to delete', error);
            queryClient.invalidateQueries({ queryKey: ['episodes'] });
        } finally {
            deletingIds.current.delete(id);
        }
    };

    useEffect(() => {
        if (!authLoading && !user) {
            router.push('/login');
        }
    }, [user, authLoading]);

    if (authLoading || !user) return null;

    return (
        <div className="flex h-screen bg-background overflow-hidden">
            <Sidebar />

            <main className="flex-1 flex flex-col overflow-hidden">
                <header className="border-b border-border bg-card/50 backdrop-blur-md px-8 py-3 shrink-0 z-10 space-y-3">
                    <div className="flex items-center justify-between h-10">
                        <h2 className="text-xl font-bold">Workspace Library</h2>
                        <div className="flex items-center gap-3">
                            {/* Sort */}
                            <div className="relative">
                                <button
                                    onClick={() => setShowSort(v => !v)}
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-secondary/30 text-xs font-bold hover:bg-secondary/60 transition-all"
                                >
                                    <SortDesc size={14} />
                                    {sortBy === 'newest' ? 'Newest' : sortBy === 'oldest' ? 'Oldest' : sortBy === 'title' ? 'A–Z' : 'Status'}
                                    <ChevronDown size={12} />
                                </button>
                                {showSort && (
                                    <div className="absolute right-0 mt-1 w-36 rounded-xl border border-border bg-card shadow-2xl overflow-hidden z-50">
                                        {(['newest', 'oldest', 'title', 'status'] as SortOption[]).map(opt => (
                                            <button
                                                key={opt}
                                                onClick={() => { setSortBy(opt); setShowSort(false); }}
                                                className={cn("w-full text-left px-4 py-2.5 text-xs font-medium hover:bg-secondary/40 capitalize", sortBy === opt && "text-primary font-bold")}
                                            >
                                                {opt === 'newest' ? 'Newest first' : opt === 'oldest' ? 'Oldest first' : opt === 'title' ? 'Title A–Z' : 'By status'}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <Link href="/" className="bg-primary text-white px-4 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2">
                                <Plus size={16} /> New
                            </Link>
                        </div>
                    </div>

                    {/* Search row */}
                    <div className="flex items-center gap-3">
                        <div className="relative flex-1 max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <input
                                ref={searchRef}
                                type="text"
                                placeholder="Search library... (Cmd+K)"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full bg-secondary/30 border border-white/5 rounded-full py-1.5 pl-9 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground transition-all"
                            />
                            {searchQuery && (
                                <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white">
                                    <X size={12} />
                                </button>
                            )}
                        </div>

                        {/* Tag filter pills */}
                        <div className="flex items-center gap-1.5 overflow-x-auto">
                            {allTags.slice(0, 8).map(tag => (
                                <button
                                    key={tag}
                                    onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                                    className={cn(
                                        "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border whitespace-nowrap transition-all",
                                        activeTag === tag
                                            ? "bg-primary text-black border-primary"
                                            : "bg-secondary/30 text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
                                    )}
                                >
                                    {tag}
                                </button>
                            ))}
                        </div>

                        {/* Result count + clear */}
                        {hasFilters && (
                            <div className="flex items-center gap-2 shrink-0 ml-auto">
                                <span className="text-xs text-muted-foreground">{filteredEpisodes.length} result{filteredEpisodes.length !== 1 ? 's' : ''}</span>
                                <button
                                    onClick={() => { setSearchQuery(''); setActiveTag(null); }}
                                    className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground hover:text-foreground"
                                >
                                    <X size={10} /> Clear
                                </button>
                            </div>
                        )}
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
                    <div className="max-w-7xl mx-auto space-y-12">
                        <section className="space-y-8">
                            {isLoading ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                    {[...Array(12)].map((_, i) => (
                                        <div key={i} className="h-64 bg-card/50 animate-pulse rounded-2xl border border-border" />
                                    ))}
                                </div>
                            ) : isError ? (
                                <div className="flex flex-col items-center justify-center py-32 text-center">
                                    <div className="bg-destructive/10 p-6 rounded-full mb-6">
                                        <AlertCircle className="w-10 h-10 text-destructive/80" />
                                    </div>
                                    <h3 className="text-xl font-bold">Library yüklenemedi</h3>
                                    <p className="text-sm text-muted-foreground mt-2 max-w-xl">
                                        {(error as Error)?.message || "API bağlantısı zaman aşımına uğradı veya erişilemedi."}
                                    </p>
                                    <button
                                        onClick={() => refetch()}
                                        className="mt-6 px-4 py-2 rounded-lg bg-primary text-white text-sm font-bold"
                                    >
                                        Yeniden Dene
                                    </button>
                                </div>
                            ) : episodes.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-40 text-center">
                                    <div className="bg-primary/10 p-8 rounded-full mb-8">
                                        <Podcast className="w-16 h-16 text-primary/60" />
                                    </div>
                                    <h3 className="text-2xl font-bold">Library Empty</h3>
                                    <Link href="/" className="text-primary mt-4 hover:underline">Start your first ingest</Link>
                                </div>
                            ) : filteredEpisodes.length === 0 && hasFilters ? (
                                <div className="flex flex-col items-center justify-center py-32 text-center">
                                    <Search className="w-12 h-12 text-muted-foreground/30 mb-4" />
                                    <h3 className="text-lg font-bold">No results</h3>
                                    <p className="text-sm text-muted-foreground mt-2">Try a different search or clear filters.</p>
                                    <button onClick={() => { setSearchQuery(''); setActiveTag(null); }} className="mt-4 px-4 py-2 rounded-lg bg-secondary text-sm font-bold">Clear filters</button>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                    {filteredEpisodes.map((episode: Episode) => (
                                        <EpisodeCard
                                            key={episode.id}
                                            episode={episode}
                                            onDelete={(id) => setConfirmDelete({ isOpen: true, id })}
                                            onTagClick={(tag) => setActiveTag(activeTag === tag ? null : tag)}
                                            activeTag={activeTag}
                                        />
                                    ))}
                                </div>
                            )}
                        </section>
                    </div>
                </div>
                <ConfirmModal
                    isOpen={confirmDelete.isOpen}
                    onClose={() => setConfirmDelete({ isOpen: false, id: null })}
                    onConfirm={() => confirmDelete.id && handleDelete(confirmDelete.id)}
                    title="Delete Intelligence?"
                    message="This will permanently remove the audio file, transcript, and all AI-generated insights for this episode."
                    confirmLabel="Vaporize"
                />
            </main>
        </div>
    );
}

const PROCESSING_STAGES: Record<string, string> = {
    downloading: 'Downloading…',
    transcribing: 'Transcribing…',
    identifying_speakers: 'Identifying speakers…',
    translating: 'Translating…',
    summarizing: 'Summarizing…',
    extracting_chapters: 'Extracting chapters…',
    generating_insights: 'Generating insights…',
    indexing: 'Indexing…',
};

function EpisodeCard({ episode, onDelete, onTagClick, activeTag }: {
    episode: Episode;
    onDelete: (id: number) => void;
    onTagClick?: (tag: string) => void;
    activeTag?: string | null;
}) {
    const [showMenu, setShowMenu] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setShowMenu(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="group bg-card rounded-2xl p-6 relative flex flex-col h-full border border-border/50 hover:border-primary/50 transition-all shadow-sm"
        >
            <Link href={`/episode/${episode.id}`} className="absolute inset-0 z-10" />

            <div className="flex justify-between items-start mb-6">
                <div className="relative">
                    {episode.image_url ? (
                        <img src={episode.image_url} alt={episode.title} className="w-14 h-14 rounded-xl object-cover shadow-lg" />
                    ) : (
                        <div className="w-14 h-14 bg-primary/10 rounded-xl flex items-center justify-center">
                            <PlayCircle className="w-7 h-7 text-primary" />
                        </div>
                    )}
                </div>
                <StatusBadge status={episode.status} lang={episode.preferred_lang} />
            </div>

            <div className="space-y-3 mb-6">
                <div className="space-y-1">
                    <h3 className="font-bold text-lg line-clamp-2 leading-tight">{episode.title}</h3>
                    <div className="text-muted-foreground text-[10px] font-black uppercase tracking-widest">{episode.show_name}</div>
                </div>

                {/* Tags */}
                {episode.podcast_tags && episode.podcast_tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                        {episode.podcast_tags.slice(0, 3).map((tag: any, idx: number) => {
                            const group = tag.group || inferTagGroup(tag.label);
                            const colorClass = TAG_GROUP_COLORS[group] || TAG_GROUP_COLORS.default;
                            const isActive = activeTag === tag.label;
                            return (
                                <button
                                    key={idx}
                                    onClick={(e) => { e.preventDefault(); onTagClick?.(tag.label); }}
                                    className={cn(
                                        "px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border z-20 relative transition-all",
                                        isActive ? "ring-1 ring-primary scale-105" : "",
                                        colorClass
                                    )}
                                >
                                    {tag.label}
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* In-progress stage + progress bar */}
                {episode.status && PROCESSING_STAGES[episode.status] && (
                    <div className="pt-1 space-y-1">
                        <div className="text-[9px] font-bold uppercase tracking-wider text-primary/80">
                            {PROCESSING_STAGES[episode.status]}
                        </div>
                        <div className="h-1 bg-secondary/40 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-primary rounded-full transition-all duration-500"
                                style={{ width: `${Math.max(5, (episode.progress || 0) * 100)}%` }}
                            />
                        </div>
                    </div>
                )}
            </div>

            <div className="mt-auto pt-4 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
                <span>{new Date(episode.created_at).toLocaleDateString()}</span>
                <button
                    onClick={(e) => { e.preventDefault(); onDelete(episode.id); }}
                    className="text-muted-foreground hover:text-destructive z-20"
                >
                    <Trash2 size={14} />
                </button>
            </div>
        </motion.div>
    );
}
