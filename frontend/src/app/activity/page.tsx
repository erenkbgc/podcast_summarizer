"use client";

import { useQuery } from '@tanstack/react-query';
import { getRecentActivity, ActivityMessage } from '@/lib/api';
import { Activity, Clock, CheckCircle2, AlertCircle, Loader2, Calendar } from 'lucide-react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { StatusBadge } from '@/components/StatusBadge';
import { Sidebar } from '@/components/Sidebar';

export default function ActivityPage() {
    const { data: activity, isLoading } = useQuery({
        queryKey: ['recent-activity'],
        queryFn: () => getRecentActivity().then(res => res.data),
        refetchInterval: 5000, // Poll for live updates
    });

    const getIcon = (status: string) => {
        switch (status) {
            case 'completed': return <CheckCircle2 className="text-emerald-500" size={18} />;
            case 'failed': return <AlertCircle className="text-rose-500" size={18} />;
            default: return <Loader2 className="text-primary animate-spin" size={18} />;
        }
    };

    return (
        <div className="flex h-screen bg-background overflow-hidden">
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0">

                {/* Header */}
                <header className="p-8 border-b border-white/5 bg-card/30 backdrop-blur-xl">
                    <div className="max-w-4xl mx-auto flex items-center justify-between">
                        <div>
                            <div className="flex items-center gap-2 text-primary mb-1">
                                <Activity size={18} />
                                <span className="text-xs font-black uppercase tracking-widest">System Monitor</span>
                            </div>
                            <h1 className="text-3xl font-black font-heading tracking-tight">Recent Activity</h1>
                        </div>
                    </div>
                </header>

                {/* Timeline Area */}
                <main className="flex-1 overflow-y-auto p-12 custom-scrollbar">
                    <div className="max-w-4xl mx-auto">
                        {isLoading ? (
                            <div className="space-y-4">
                                {[1, 2, 3, 4].map(i => (
                                    <div key={i} className="h-20 bg-secondary/10 rounded-2xl animate-pulse" />
                                ))}
                            </div>
                        ) : activity && activity.length > 0 ? (
                            <div className="relative space-y-4 pb-20">
                                {/* Vertical Line */}
                                <div className="absolute left-[27px] top-6 bottom-20 w-px bg-white/5" />

                                {activity.map((item, i) => (
                                    <motion.div
                                        key={item.id}
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: i * 0.05 }}
                                        className="relative flex items-center gap-6 group"
                                    >
                                        {/* Timeline Node */}
                                        <div className="relative z-10 w-14 h-14 rounded-2xl bg-secondary/30 border border-white/5 flex items-center justify-center shrink-0 group-hover:border-primary/30 transition-all">
                                            {getIcon(item.status)}
                                        </div>

                                        {/* Content Card */}
                                        <div className="flex-1 p-6 rounded-2xl bg-secondary/10 border border-white/5 hover:bg-secondary/20 transition-all flex items-center justify-between">
                                            <div className="space-y-1">
                                                <h3 className="font-bold text-foreground leading-tight">{item.title}</h3>
                                                <div className="flex items-center gap-3 text-[11px] text-muted-foreground font-medium">
                                                    <div className="flex items-center gap-1">
                                                        <Calendar size={10} />
                                                        {format(new Date(item.updated_at), 'MMM d, HH:mm')}
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <Clock size={10} />
                                                        Job ID: {item.id}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-4">
                                                <div className="hidden sm:block">
                                                    <StatusBadge status={item.status} progress={item.progress} />
                                                </div>
                                                {item.status === 'processing' && (
                                                    <div className="w-24 h-1.5 bg-secondary rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-primary transition-all duration-500"
                                                            style={{ width: `${item.progress * 100}%` }}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        ) : (
                            <div className="py-40 text-center space-y-4 opacity-40">
                                <Activity size={64} className="mx-auto mb-4" />
                                <h2 className="text-xl font-bold font-heading">No Activity Recorded</h2>
                                <p className="max-w-xs mx-auto text-sm">Ingest a podcast to see the processing timeline in action.</p>
                            </div>
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
}
