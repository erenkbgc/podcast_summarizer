"use client";

import { useQuery } from '@tanstack/react-query';
import { getKnowledgeOverview, getUniversalGlossary, GlossaryItem, KnowledgeEpisodeOverview } from '@/lib/api';
import { BookOpen, Search, Info, MessageSquareQuote, Sparkles, Quote } from 'lucide-react';
import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sidebar } from '@/components/Sidebar';


export default function KnowledgePage() {
    const [search, setSearch] = useState('');
    const [rebuildToken, setRebuildToken] = useState(0);
    const [activeTab, setActiveTab] = useState<'glossary' | 'takeaways' | 'quotes'>('glossary');
    const { data: glossary, isLoading } = useQuery({
        queryKey: ['universal-glossary', rebuildToken],
        queryFn: () => getUniversalGlossary(rebuildToken > 0).then(res => res.data)
    });

    const { data: overview, isLoading: overviewLoading } = useQuery({
        queryKey: ['knowledge-overview'],
        queryFn: () => getKnowledgeOverview().then(res => res.data)
    });

    const filtered = glossary?.filter(item =>
        item.term.toLowerCase().includes(search.toLowerCase()) ||
        item.definition.toLowerCase().includes(search.toLowerCase())
    );

    const filteredOverview = useMemo(() => {
        if (!overview) return [];
        const term = search.toLowerCase();
        return overview.map((ep) => {
            if (!term) return ep;
            const glossary = ep.glossary.filter(item =>
                item.term.toLowerCase().includes(term) ||
                item.definition.toLowerCase().includes(term)
            );
            const key_takeaways = ep.key_takeaways.filter(t => t.toLowerCase().includes(term));
            const key_quotes = ep.key_quotes.filter(q => q.text.toLowerCase().includes(term));
            return { ...ep, glossary, key_takeaways, key_quotes };
        }).filter(ep =>
            ep.glossary.length || ep.key_takeaways.length || ep.key_quotes.length
        );
    }, [overview, search]);

    return (
        <div className="flex h-screen bg-background overflow-hidden">
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0">

                {/* Header */}
                <header className="p-8 border-b border-white/5 bg-card/30 backdrop-blur-xl">
                    <div className="max-w-6xl mx-auto flex items-end justify-between gap-8">
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-primary">
                                <BookOpen size={20} />
                                <span className="text-xs font-black uppercase tracking-widest">Digital Repository</span>
                            </div>
                            <h1 className="text-4xl font-black font-heading tracking-tight">Universal Knowledge Base</h1>
                            <p className="text-muted-foreground text-sm max-w-lg">
                                A centralized hub for every technical term, niche concept, and strategic insight identified across your library.
                            </p>
                        </div>
                        <div className="relative w-72">
                            <Search size={18} className="absolute inset-y-0 left-4 m-auto text-muted-foreground" />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Filter concepts..."
                                className="w-full h-11 pl-12 pr-4 bg-secondary/20 border border-white/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 text-sm transition-all"
                            />
                        </div>
                        <button
                            onClick={() => setRebuildToken(Date.now())}
                            className="h-11 px-4 rounded-xl bg-primary text-white text-xs font-bold tracking-widest uppercase shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all"
                        >
                            {isLoading ? "Generating..." : "Generate Knowledge"}
                        </button>
                    </div>
                </header>

                {/* Grid Area */}
                <main className="flex-1 overflow-y-auto p-12 custom-scrollbar">
                    <div className="max-w-6xl mx-auto">
                        <div className="flex items-center gap-3 mb-8">
                            {([
                                { id: 'glossary', label: 'Glossary', icon: BookOpen },
                                { id: 'takeaways', label: 'Key Takeaways', icon: Sparkles },
                                { id: 'quotes', label: 'Key Quotes', icon: Quote },
                            ] as const).map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest border transition-all ${activeTab === tab.id ? 'bg-primary text-white border-primary' : 'text-muted-foreground border-white/10 hover:text-white hover:bg-secondary/30'}`}
                                >
                                    <tab.icon size={12} className="inline-block mr-2" />
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {isLoading ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {[1, 2, 3, 4, 5, 6].map(i => (
                                    <div key={i} className="h-48 bg-secondary/10 rounded-2xl animate-pulse" />
                                ))}
                            </div>
                        ) : activeTab === 'glossary' && !overviewLoading && filteredOverview.length > 0 ? (
                            <div className="space-y-8 pb-20">
                                {filteredOverview.map((ep) => (
                                    <div key={ep.episode_id} className="rounded-3xl border border-white/5 bg-secondary/5 p-6">
                                        <div className="flex items-start justify-between gap-4">
                                            <div>
                                                <div className="text-xs font-black uppercase tracking-widest text-muted-foreground">Episode</div>
                                                <div className="mt-2 text-lg font-black">{ep.title}</div>
                                                {ep.show_name && (
                                                    <div className="text-xs text-muted-foreground">{ep.show_name}</div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                            <AnimatePresence>
                                                {ep.glossary.map((item, i) => (
                                                    <motion.div
                                                        key={item.id}
                                                        initial={{ opacity: 0, y: 20 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        transition={{ delay: i * 0.03 }}
                                                        className="glass-card group p-6 rounded-2xl border border-white/5 hover:border-primary/20 transition-all flex flex-col justify-between"
                                                    >
                                                        <div className="space-y-3">
                                                            <div className="flex items-start justify-between">
                                                                <h3 className="text-base font-black font-heading tracking-tight group-hover:text-primary transition-colors">{item.term}</h3>
                                                                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                                                                    <Info size={14} />
                                                                </div>
                                                            </div>
                                                            <p className="text-sm text-foreground/80 leading-relaxed italic">
                                                                {item.definition}
                                                            </p>
                                                        </div>
                                                        <div className="mt-6 pt-4 border-t border-white/5">
                                                            <div className="flex items-start gap-3">
                                                                <MessageSquareQuote size={14} className="text-muted-foreground shrink-0 mt-1" />
                                                                <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-3">
                                                                    "{item.context_sentence}"
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                ))}
                                            </AnimatePresence>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : activeTab !== 'glossary' && !overviewLoading && filteredOverview.length > 0 ? (
                            <div className="space-y-8 pb-20">
                                {filteredOverview.map((ep) => (
                                    <div key={ep.episode_id} className="rounded-3xl border border-white/5 bg-secondary/5 p-6">
                                        <div className="flex items-start justify-between gap-4">
                                            <div>
                                                <div className="text-xs font-black uppercase tracking-widest text-muted-foreground">Episode</div>
                                                <div className="mt-2 text-lg font-black">{ep.title}</div>
                                                {ep.show_name && (
                                                    <div className="text-xs text-muted-foreground">{ep.show_name}</div>
                                                )}
                                            </div>
                                        </div>

                                        {activeTab === 'takeaways' && (
                                            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                                                {ep.key_takeaways.map((t, idx) => (
                                                    <div key={`${ep.episode_id}-t-${idx}`} className="p-4 rounded-2xl bg-white/5 border border-white/5 text-sm">
                                                        {t}
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {activeTab === 'quotes' && (
                                            <div className="mt-4 space-y-3">
                                                {ep.key_quotes.map((q, idx) => (
                                                    <div key={`${ep.episode_id}-q-${idx}`} className="p-4 rounded-2xl bg-white/5 border border-white/5 text-sm">
                                                        <div className="text-xs font-mono text-primary">{Math.floor(q.timestamp / 60)}:{String(Math.floor(q.timestamp % 60)).padStart(2, '0')}</div>
                                                        <div className="mt-1 text-foreground/90">"{q.text}"</div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="py-40 text-center space-y-4 opacity-40">
                                <BookOpen size={64} className="mx-auto mb-4" />
                                <h2 className="text-xl font-bold font-heading">Knowledge Base is Empty</h2>
                                <p className="max-w-xs mx-auto text-sm">Ingest more podcasts to build your personalized technical repository.</p>
                            </div>
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
}
