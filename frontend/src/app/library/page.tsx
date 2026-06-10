"use client";

import { useState, useEffect, useRef } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { StatusBadge } from '@/components/StatusBadge';
import { ConfirmModal } from '@/components/ConfirmModal';
import {
    Plus,
    Search,
    Filter,
    PlayCircle,
    Clock,
    CheckCircle2,
    AlertCircle,
    Podcast,
    MoreVertical,
    BookOpen,
    Activity,
    Trash2,
    PlusCircle
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

export default function LibraryPage() {
    const { user, isLoading: authLoading } = useAuth();
    const router = useRouter();
    const queryClient = useQueryClient();

    const deletingIds = useRef<Set<number>>(new Set());
    const [confirmDelete, setConfirmDelete] = useState<{ isOpen: boolean; id: number | null }>({
        isOpen: false,
        id: null
    });

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
                <header className="h-16 border-b border-border bg-card/50 backdrop-blur-md flex items-center justify-between px-8 shrink-0 z-10">
                    <div className="flex items-center gap-4 flex-1 max-w-xl">
                        <h2 className="text-xl font-bold">Workspace Library</h2>
                    </div>
                    <div className="flex items-center gap-3">
                        <Link href="/" className="bg-primary text-white px-4 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2">
                            <Plus size={16} /> New
                        </Link>
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
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                    {episodes.map((episode) => (
                                        <EpisodeCard
                                            key={episode.id}
                                            episode={episode}
                                            onDelete={(id) => setConfirmDelete({ isOpen: true, id })}
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

// Reusing EpisodeCard 
function EpisodeCard({ episode, onDelete }: { episode: Episode; onDelete: (id: number) => void }) {
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
                            return (
                                <span
                                    key={idx}
                                    className={cn(
                                        "px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border",
                                        colorClass
                                    )}
                                >
                                    {tag.label}
                                </span>
                            );
                        })}
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
