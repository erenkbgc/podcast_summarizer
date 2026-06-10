"use client";

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { globalSearch, SearchResult } from '@/lib/api';
import { Search, PlayCircle, Podcast, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Sidebar } from '@/components/Sidebar';


export default function SearchPage() {
    const [query, setQuery] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    const { data: results, isLoading } = useQuery({
        queryKey: ['global-search', searchTerm],
        queryFn: () => globalSearch(searchTerm).then(res => res.data),
        enabled: searchTerm.trim().length >= 2,

    });

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setSearchTerm(query);
    };

    const renderHighlightedText = (text: string, term: string) => {
        if (!term || term.trim().length < 2) return text;
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${escaped})`, 'gi');
        const parts = text.split(regex);
        return parts.map((part, idx) =>
            idx % 2 === 1 ? (
                <span key={idx} className="px-1 rounded bg-primary/20 text-primary font-semibold">
                    {part}
                </span>
            ) : (
                <span key={idx}>{part}</span>
            )
        );
    };

    return (
        <div className="flex h-screen bg-background overflow-hidden">
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0">

                {/* Search Header */}
                <header className="p-8 border-b border-white/5 bg-card/30 backdrop-blur-xl">
                    <div className="max-w-4xl mx-auto">
                        <h1 className="text-3xl font-black font-heading tracking-tight mb-6">Global Intelligence Search</h1>
                        <form onSubmit={handleSearch} className="relative group">
                            <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none text-muted-foreground group-focus-within:text-primary transition-colors">
                                <Search size={22} />
                            </div>
                            <input
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search concepts, quotes, or keywords across all podcasts..."
                                className="w-full h-16 pl-14 pr-6 bg-secondary/10 border border-white/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 text-lg font-medium transition-all"
                            />
                            <button
                                type="submit"
                                className="absolute right-3 inset-y-3 px-6 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
                            >
                                Search
                            </button>
                        </form>
                    </div>
                </header>

                {/* Results Area */}
                <main className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                    <div className="max-w-4xl mx-auto">
                        {!searchTerm ? (
                            <div className="flex flex-col items-center justify-center py-40 text-center space-y-4 opacity-40">
                                <div className="p-6 rounded-full bg-secondary/20">
                                    <Search size={64} />
                                </div>
                                <h2 className="text-xl font-bold font-heading">Start Searching</h2>
                                <p className="text-sm max-w-xs leading-relaxed">
                                    Enter a topic (e.g., "AI ethics", "Market trends") to find every moment it was discussed.
                                </p>
                            </div>
                        ) : isLoading ? (
                            <div className="space-y-4">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className="h-32 bg-secondary/10 rounded-2xl animate-pulse" />
                                ))}
                            </div>
                        ) : results && results.length > 0 ? (
                            <div className="space-y-6 pb-20">
                                <AnimatePresence mode="popLayout">
                                    {results.map((result, i) => (
                                        <motion.div
                                            key={`${result.episode_id}-${result.timestamp}-${i}`}
                                            initial={{ opacity: 0, scale: 0.95 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            className="glass-card group p-6 rounded-2xl border border-white/5 hover:border-primary/30 transition-all cursor-pointer relative overflow-hidden"
                                        >
                                            <div className="flex flex-col gap-3">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2 text-primary">
                                                        <Podcast size={14} />
                                                        <span className="text-xs font-black uppercase tracking-widest">{result.episode_title}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-secondary/30 text-muted-foreground font-mono text-[10px] font-bold">
                                                        <Clock size={10} />
                                                        {Math.floor(result.timestamp / 60)}:{(result.timestamp % 60).toFixed(0).padStart(2, '0')}
                                                    </div>
                                                </div>
                                                <p className="text-foreground leading-relaxed font-medium">
                                                    “{renderHighlightedText(result.text, searchTerm)}”
                                                </p>
                                                <Link
                                                    href={`/episode/${result.episode_id}?t=${result.timestamp}`}
                                                    className="mt-2 inline-flex items-center gap-2 text-sm text-primary font-bold hover:underline"
                                                >
                                                    <PlayCircle size={16} />
                                                    Jump to Moment
                                                </Link>
                                            </div>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-40 text-center space-y-4 opacity-40">
                                <h2 className="text-xl font-bold font-heading">No results found</h2>
                                <p className="text-sm">Try different keywords or check if any podcasts are indexed.</p>
                            </div>
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
}
