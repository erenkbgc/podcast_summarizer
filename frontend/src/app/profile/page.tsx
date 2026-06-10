"use client";

import React, { useMemo } from "react";
import { motion } from "framer-motion";
import {
  Brain, Clock, Flame, Sparkles, TrendingUp, BookOpen, Network, Trophy,
  Zap, Headphones, Globe2, Moon, Target, Lock, Rocket,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import api, { getUserProfile, getEpisodes, getKnowledgeOverview } from "@/lib/api";
import { Sidebar } from "@/components/Sidebar";
import { cn } from "@/lib/utils";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, AreaChart, Area,
  Tooltip as ReTooltip, Cell,
} from "recharts";

const COLORS = ["#3E5BFF", "#a78bfa", "#34d399", "#f59e0b", "#ec4899", "#22d3ee", "#f97316", "#84cc16"];

const LEVEL_TITLES = [
  "Curious Spark", "Signal Hunter", "Pattern Seeker", "Insight Collector",
  "Knowledge Weaver", "Synthesis Engine", "Neural Architect", "Cognitive Voyager",
  "Mind Cartographer", "Neural Sage",
];

export default function NeuralProfilePage() {
  const { data: profile, isLoading } = useQuery({
    queryKey: ["user-profile"],
    queryFn: () => getUserProfile().then((r) => r.data),
  });
  const { data: episodes = [] } = useQuery({
    queryKey: ["episodes"],
    queryFn: () => getEpisodes().then((r) => r.data),
  });
  const { data: knowledge = [] } = useQuery({
    queryKey: ["knowledge-overview"],
    queryFn: () => getKnowledgeOverview().then((r) => r.data),
  });
  const { data: graph } = useQuery({
    queryKey: ["graph-full"],
    queryFn: () => api.get("/v1/graph/full").then((r) => r.data),
  });

  // ---- derived fun stats ----
  const completed = useMemo(() => (episodes as any[]).filter((e) => e.status === "completed"), [episodes]);
  const termCount = useMemo(() => (knowledge as any[]).reduce((acc, ep) => acc + (ep.glossary?.length || 0), 0), [knowledge]);
  const entityCount = graph?.nodes?.length || 0;
  const langs = useMemo(() => new Set((episodes as any[]).map((e) => (e.preferred_lang || "en").slice(0, 2))), [episodes]);

  const xp = completed.length * 120 + termCount * 8 + entityCount * 5;
  const level = Math.max(1, Math.floor(Math.sqrt(xp / 80)));
  const nextLevelXp = 80 * (level + 1) ** 2;
  const prevLevelXp = 80 * level ** 2;
  const levelProgress = Math.min(1, Math.max(0, (xp - prevLevelXp) / Math.max(1, nextLevelXp - prevLevelXp)));
  const levelTitle = LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)];

  // Weekly activity (last 8 weeks)
  const activityData = useMemo(() => {
    const weeks: number[] = Array(8).fill(0);
    const now = Date.now();
    for (const e of episodes as any[]) {
      const age = Math.floor((now - new Date(e.created_at).getTime()) / (7 * 86400000));
      if (age >= 0 && age < 8) weeks[age] += 1;
    }
    return weeks.map((v, i) => ({ w: i === 0 ? "now" : `${i}w ago`, v })).reverse();
  }, [episodes]);

  const topicData = (profile?.stats.top_topics || []).slice(0, 7).map((t) => ({ name: t.label, value: t.value }));

  const obsessions = useMemo(() => {
    const nodes = [...(graph?.nodes || [])].sort((a: any, b: any) => b.mentions - a.mentions).slice(0, 10);
    const max = Math.max(...nodes.map((n: any) => n.mentions), 1);
    return nodes.map((n: any) => ({ ...n, size: 13 + (n.mentions / max) * 15 }));
  }, [graph]);

  // Achievements
  const achievements = useMemo(() => {
    const hasNightOwl = (episodes as any[]).some((e) => {
      const h = new Date(e.created_at).getHours();
      return h >= 0 && h < 5;
    });
    const weekCounts: Record<number, number> = {};
    for (const e of episodes as any[]) {
      const wk = Math.floor(new Date(e.created_at).getTime() / (7 * 86400000));
      weekCounts[wk] = (weekCounts[wk] || 0) + 1;
    }
    const bingeWeek = Math.max(0, ...Object.values(weekCounts));
    return [
      { icon: Rocket, label: "First Synthesis", desc: "Process your first episode", done: completed.length >= 1 },
      { icon: Headphones, label: "Triple Play", desc: "3 episodes processed", done: completed.length >= 3 },
      { icon: Flame, label: "Binge Mind", desc: "3+ episodes in one week", done: bingeWeek >= 3 },
      { icon: BookOpen, label: "Lexicon Builder", desc: "Learn 20+ terms", done: termCount >= 20 },
      { icon: Network, label: "Brain Mapper", desc: "Map 10+ entities", done: entityCount >= 10 },
      { icon: Globe2, label: "Polyglot", desc: "Listen in 2+ languages", done: langs.size >= 2 },
      { icon: Moon, label: "Night Owl", desc: "Synthesize after midnight", done: hasNightOwl },
      { icon: Target, label: "Consistent Mind", desc: "Consistency score 50+", done: (profile?.stats.consistency_score || 0) >= 50 },
    ];
  }, [episodes, completed, termCount, entityCount, langs, profile]);

  const unlocked = achievements.filter((a) => a.done).length;

  if (isLoading) {
    return (
      <div className="flex h-screen bg-background">
        <Sidebar />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
            <div className="text-muted-foreground text-sm font-medium animate-pulse">Syncing Neural Identity…</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto custom-scrollbar relative">
        {/* ambient glow */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute top-[-15%] left-[15%] w-[45%] h-[45%] bg-primary/5 rounded-full blur-[140px]" />
          <div className="absolute bottom-[-10%] right-[5%] w-[40%] h-[40%] bg-purple-600/5 rounded-full blur-[140px]" />
        </div>

        <div className="relative max-w-5xl mx-auto px-8 py-12 space-y-12 pb-24">
          {/* ===== Identity Card ===== */}
          <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-[2rem] border border-border bg-card/60 backdrop-blur-xl p-8 flex flex-col md:flex-row items-center gap-8">
            {/* Level ring */}
            <div className="relative w-36 h-36 shrink-0">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 144 144">
                <circle cx="72" cy="72" r="62" fill="none" stroke="currentColor" strokeWidth="8" className="text-secondary" />
                <motion.circle cx="72" cy="72" r="62" fill="none" stroke="url(#lvlgrad)" strokeWidth="8"
                  strokeLinecap="round" strokeDasharray={389.6}
                  initial={{ strokeDashoffset: 389.6 }}
                  animate={{ strokeDashoffset: 389.6 * (1 - levelProgress) }}
                  transition={{ duration: 1.2, ease: "easeOut" }} />
                <defs>
                  <linearGradient id="lvlgrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#3E5BFF" /><stop offset="100%" stopColor="#a78bfa" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground">Level</span>
                <span className="text-4xl font-black font-heading bg-gradient-to-br from-primary to-purple-400 bg-clip-text text-transparent">{level}</span>
                <span className="text-[9px] font-mono text-muted-foreground">{xp} XP</span>
              </div>
            </div>

            <div className="flex-1 text-center md:text-left space-y-3">
              <div>
                <div className="flex items-center justify-center md:justify-start gap-2 text-primary mb-1">
                  <Brain size={15} />
                  <span className="text-[10px] font-black uppercase tracking-[0.3em]">Neural Profile</span>
                </div>
                <h1 className="text-3xl font-black font-heading tracking-tight">{profile?.username}</h1>
                <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20">
                  <Sparkles size={12} className="text-primary" />
                  <span className="text-xs font-bold text-primary">{levelTitle}</span>
                  {profile?.persona_title && <span className="text-xs text-muted-foreground">· {profile.persona_title}</span>}
                </div>
              </div>
              {profile?.bio && <p className="text-sm text-muted-foreground leading-relaxed max-w-xl italic">"{profile.bio}"</p>}
              <p className="text-[10px] font-mono text-muted-foreground/60">{Math.max(0, nextLevelXp - xp)} XP to level {level + 1}</p>
            </div>
          </motion.section>

          {/* ===== Stat tiles ===== */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: Headphones, label: "Episodes Synthesized", value: completed.length, color: "text-primary" },
              { icon: Clock, label: "Hours Absorbed", value: `${(profile?.stats.total_hours || 0).toFixed(1)}h`, color: "text-emerald-400" },
              { icon: BookOpen, label: "Terms Learned", value: termCount, color: "text-amber-400" },
              { icon: Network, label: "Entities Mapped", value: entityCount, color: "text-purple-400" },
            ].map((t, i) => (
              <motion.div key={t.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                className="p-5 rounded-3xl bg-card border border-border space-y-2">
                <t.icon size={18} className={t.color} />
                <div className="text-2xl font-black font-heading">{t.value}</div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{t.label}</div>
              </motion.div>
            ))}
          </section>

          {/* ===== Listening DNA + Activity ===== */}
          <section className="grid lg:grid-cols-2 gap-6">
            <div className="p-6 rounded-3xl bg-card border border-border space-y-4">
              <h3 className="text-sm font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                <TrendingUp size={14} className="text-primary" /> Listening DNA
              </h3>
              {topicData.length ? (
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topicData} layout="vertical" margin={{ left: 8, right: 24 }}>
                      <XAxis type="number" hide />
                      <YAxis type="category" dataKey="name" width={110} stroke="#888" fontSize={11} tickLine={false} axisLine={false} />
                      <ReTooltip contentStyle={{ background: "#09090b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 11 }} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                      <Bar dataKey="value" radius={[0, 6, 6, 0]} isAnimationActive={false}>
                        {topicData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-10 text-center">Process episodes to discover your DNA.</p>
              )}
            </div>

            <div className="p-6 rounded-3xl bg-card border border-border space-y-4">
              <h3 className="text-sm font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                <Zap size={14} className="text-amber-400" /> Activity Pulse
                <span className="ml-auto text-[10px] font-mono normal-case tracking-normal">last 8 weeks</span>
              </h3>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={activityData}>
                    <defs>
                      <linearGradient id="pulse" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.5} /><stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="w" stroke="#666" fontSize={10} />
                    <ReTooltip contentStyle={{ background: "#09090b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 11 }} />
                    <Area type="monotone" dataKey="v" stroke="#f59e0b" strokeWidth={2} fill="url(#pulse)" isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          {/* ===== Obsessions ===== */}
          {obsessions.length > 0 && (
            <section className="p-6 rounded-3xl bg-card border border-border space-y-4">
              <h3 className="text-sm font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                <Flame size={14} className="text-orange-400" /> Your Brain Keeps Coming Back To…
              </h3>
              <div className="flex flex-wrap gap-x-5 gap-y-3 items-center">
                {obsessions.map((o: any, i: number) => (
                  <span key={o.id} style={{ fontSize: o.size }} className="font-bold leading-none transition-colors hover:text-primary cursor-default"
                    title={`${o.mentions} mentions · ${o.type}`}>
                    <span style={{ color: COLORS[i % COLORS.length] }}>●</span> {o.label}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* ===== Achievements ===== */}
          <section className="space-y-4">
            <h3 className="text-sm font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
              <Trophy size={14} className="text-amber-400" /> Achievements
              <span className="ml-auto text-xs font-mono normal-case tracking-normal text-foreground">{unlocked}/{achievements.length}</span>
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {achievements.map((a, i) => (
                <motion.div key={a.label} initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.04 }}
                  className={cn(
                    "p-5 rounded-3xl border text-center space-y-2 transition-all",
                    a.done ? "bg-card border-amber-500/30 shadow-[0_0_24px_-8px_rgba(245,158,11,0.25)]" : "bg-card/40 border-border opacity-50"
                  )}>
                  <div className={cn("mx-auto w-11 h-11 rounded-2xl flex items-center justify-center",
                    a.done ? "bg-amber-500/15 text-amber-400" : "bg-secondary text-muted-foreground")}>
                    {a.done ? <a.icon size={20} /> : <Lock size={18} />}
                  </div>
                  <div className="text-xs font-black">{a.label}</div>
                  <div className="text-[10px] text-muted-foreground leading-snug">{a.desc}</div>
                </motion.div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
