"use client";

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
    Activity,
    Brain,
    Clock,
    Cpu,
    Sparkles,
    TrendingUp
} from 'lucide-react';
import { getUserProfile, UserProfile } from '@/lib/api';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

export default function ProfilePage() {
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const loadProfile = async () => {
            try {
                const res = await getUserProfile();
                setProfile(res.data);
            } catch (err) {
                console.error("Failed to load profile", err);
            } finally {
                setIsLoading(false);
            }
        };
        loadProfile();
    }, []);

    if (isLoading) {
        return (
            <div className="h-screen bg-[#050505] flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                    <div className="text-gray-500 text-sm font-medium animate-pulse">Syncing Neural Identity...</div>
                </div>
            </div>
        );
    }

    const barData = profile?.stats.top_topics.map(t => ({
        category: t.label,
        value: t.value,
    })) || [];

    return (
        <div className="min-h-screen bg-[#050505] text-white p-8 pb-24 overflow-x-hidden">
            {/* Background elements */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-blue-600/5 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-600/5 rounded-full blur-[120px]" />
            </div>

            <div className="max-w-6xl mx-auto relative z-10">
                {/* Header / Identity Section */}
                <div className="flex flex-col md:flex-row items-center gap-8 mb-12">
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="relative group"
                    >
                        <div className="w-32 h-32 md:w-40 md:h-40 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-blue-500/20 group-hover:rotate-3 transition-transform duration-500">
                            <Brain size={64} className="text-white drop-shadow-lg" />
                        </div>
                        <div className="absolute -bottom-2 -right-2 bg-black border border-white/10 p-2 rounded-xl shadow-xl flex items-center gap-2">
                            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">lvl 12 Neural</span>
                        </div>
                    </motion.div>

                    <div className="text-center md:text-left">
                        <motion.div
                            initial={{ x: -20, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            className="flex flex-col md:flex-row items-baseline gap-2 mb-2"
                        >
                            <h1 className="text-4xl md:text-5xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-white to-gray-400">
                                {profile?.username}
                            </h1>
                            <span className="px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded-full text-blue-400 text-xs font-black uppercase tracking-widest">
                                {profile?.persona_title}
                            </span>
                        </motion.div>

                        <motion.div
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.2 }}
                            className="max-w-xl"
                        >
                            <p className="text-gray-400 text-lg leading-relaxed italic border-l-2 border-white/10 pl-6 py-1">
                                "{profile?.bio}"
                            </p>
                        </motion.div>
                    </div>
                </div>

                {/* Grid Layout for Stats & Viz */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* Core Stats */}
                    <motion.div
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.3 }}
                        className="lg:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-4"
                    >
                        <StatCard icon={Cpu} label="Processed" value={profile?.stats.total_episodes} subtext="Episodes" />
                        <StatCard icon={Clock} label="Synthesized" value={profile?.stats.total_hours.toFixed(1)} subtext="Hours" />
                        <StatCard icon={TrendingUp} label="Velocity" value={profile?.stats.avg_episodes_per_week.toFixed(1)} subtext="Eps / week" />
                        <StatCard icon={Activity} label="Focus" value={`${profile?.stats.consistency_score.toFixed(0)}%`} subtext="Consistency" />
                    </motion.div>

                    {/* Podcast Type Distribution */}
                    <div className="bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-xl">
                        <div className="flex items-center gap-2 mb-6">
                            <Sparkles size={18} className="text-blue-400" />
                            <h3 className="text-sm font-bold uppercase tracking-widest text-gray-400">Podcast Type Distribution</h3>
                        </div>
                        <div className="h-[280px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={barData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff12" />
                                    <XAxis dataKey="category" tick={{ fill: '#9ca3af', fontSize: 10 }} />
                                    <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} allowDecimals={false} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#000', border: '1px solid #ffffff10', borderRadius: '12px', fontSize: '10px' }}
                                        itemStyle={{ color: '#fff' }}
                                        labelStyle={{ color: '#9ca3af' }}
                                    />
                                    <Bar
                                        dataKey="value"
                                        radius={[8, 8, 0, 0]}
                                        fill="#3b82f6"
                                        maxBarSize={42}
                                    />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Top Categories */}
                    <div className="lg:col-span-2 bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-xl">
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-2">
                                <Activity size={18} className="text-indigo-400" />
                                <h3 className="text-sm font-bold uppercase tracking-widest text-gray-400">Most Listened Categories</h3>
                            </div>
                            <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-tighter">Real Data</div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {(profile?.top_categories || []).map((cat, i) => (
                                <div key={cat} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 flex items-center justify-between">
                                    <div className="text-sm text-gray-200">{cat}</div>
                                    <div className="text-xs text-blue-400 font-bold">#{i + 1}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Next Step */}
                    <div className="bg-gradient-to-br from-blue-600/20 to-purple-600/20 border border-white/10 rounded-3xl p-6 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-10">
                            <Sparkles size={120} />
                        </div>
                        <div className="flex items-center gap-2 mb-4">
                            <Target size={18} className="text-white" />
                            <h3 className="text-sm font-black uppercase tracking-[0.2em] text-white">Next Synthesis Target</h3>
                        </div>

                        <p className="text-white/80 text-sm mb-2 leading-relaxed relative z-10">
                            You most listen to <strong>{profile?.top_categories?.[0] || 'general'}</strong> podcasts.
                        </p>
                        <p className="text-white/70 text-xs leading-relaxed">
                            Keep this profile focused by ingesting similar episodes to improve recommendation and quiz quality.
                        </p>
                    </div>

                </div>
            </div>
        </div>
    );
}

function StatCard({
    icon: Icon,
    label,
    value,
    subtext,
}: {
    icon: React.ComponentType<{ size?: number; className?: string }>;
    label: string;
    value: string | number | undefined;
    subtext: string;
}) {
    return (
        <div className="bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-xl group hover:border-white/20 transition-all duration-300">
            <div className="w-8 h-8 bg-white/5 rounded-xl flex items-center justify-center text-gray-400 group-hover:text-blue-400 transition-colors mb-4 border border-white/5">
                <Icon size={16} />
            </div>
            <div className="text-[10px] font-black tracking-widest text-gray-500 uppercase mb-1">{label}</div>
            <div className="text-2xl font-black tracking-tight text-white">{value}</div>
            <div className="text-[10px] font-bold text-gray-600">{subtext}</div>
        </div>
    );
}
