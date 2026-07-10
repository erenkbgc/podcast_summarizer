"use client";

import React, { useMemo, useState } from "react";
import {
  BookOpen, CheckCircle2, Quote, Sparkles, Clock, BarChart3, Layers,
  FileText, Users, Flame, Share2, Download, ShieldCheck, ShieldAlert,
  Lightbulb, AlertTriangle, TrendingUp, HelpCircle, Zap, Link2,
} from "lucide-react";
import dynamic from "next/dynamic";
import { Summary } from "@/lib/api";
import { cn } from "@/lib/utils";
import { TopicTimeline } from "./TopicTimeline";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  summary: Summary | null;
  status?: string;
  progress?: number;
  onSeek: (time: number) => void;
  speakerMap?: Record<string, string>;
  episodeId?: number | string;
  currentTime?: number;
}

const SPEAKER_COLORS = ["#3E5BFF", "#34d399", "#f59e0b", "#a78bfa", "#ec4899", "#22d3ee", "#f97316"];

// recharts (~400KB) is only needed on the Analytics tab — load it lazily so it
// stays out of the main episode bundle.
const chartLoading = () => <div className="w-full h-full animate-pulse rounded-xl bg-secondary/40" />;
const SpeakerPie = dynamic(() => import("./SummaryCharts").then((m) => m.SpeakerPie), { ssr: false, loading: chartLoading });
const DensityArea = dynamic(() => import("./SummaryCharts").then((m) => m.DensityArea), { ssr: false, loading: chartLoading });
const InsightBars = dynamic(() => import("./SummaryCharts").then((m) => m.InsightBars), { ssr: false, loading: chartLoading });

function formatTime(seconds: number): string {
  if (isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type TabId = "overview" | "analytics" | "deepdive" | "notes";

const SectionTitle = ({ icon: Icon, children, color = "text-primary" }: any) => (
  <h3 className="text-sm font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
    <Icon className={cn("w-4 h-4", color)} /> {children}
  </h3>
);

export function SummaryDashboard({ summary, status, progress, onSeek, speakerMap, episodeId, currentTime }: Props) {
  const [tab, setTab] = useState<TabId>("overview");
  const [persona, setPersona] = useState<string>("");
  const [copied, setCopied] = useState<number | null>(null);
  const [insightsExpanded, setInsightsExpanded] = useState(false);
  const [actionsExpanded, setActionsExpanded] = useState(false);
  const [quotesExpanded, setQuotesExpanded] = useState(false);
  const [globalSummaryExpanded, setGlobalSummaryExpanded] = useState(false);

  const s = (summary || {}) as any;

  // ---- derived data (memoized) ----
  const insights: any[] = useMemo(() => {
    const attr = (s.insight_attribution || []) as any[];
    return attr.length
      ? attr.map((a) => ({ text: a.insight, why: a.why_matters, timestamp: a.start }))
      : ((s.key_insights || s.key_takeaways || []) as any[]).map((t: any) =>
          typeof t === "string" ? { text: t } : t
        );
  }, [s.insight_attribution, s.key_insights, s.key_takeaways]);

  const actions = (s.action_items_structured?.length ? s.action_items_structured : s.action_items) || [];
  const quotes = (s.key_quotes || []) as any[];
  const highlights = useMemo(
    () => ([...(s.high_value_moments || [])] as any[]).sort((a, b) => (b.intensity || 0) - (a.intensity || 0)),
    [s.high_value_moments]
  );

  const speakerData = useMemo(() => {
    const sc = s.speaker_contribution || {};
    return Object.entries(sc)
      .map(([k, v]) => ({ name: speakerMap?.[k] || k, value: Number(v) || 0 }))
      .sort((a, b) => b.value - a.value);
  }, [s.speaker_contribution, speakerMap]);

  const densityData = useMemo(
    () => (s.timeline_density || []).map((d: any) => ({ t: d.time, v: d.value })),
    [s.timeline_density]
  );
  const insightTl = useMemo(
    () => (s.insight_timeline || []).map((d: any) => ({ t: d.time, v: d.insight_count ?? d.intensity ?? 0 })),
    [s.insight_timeline]
  );
  const topics = (s.topic_transitions || []) as any[];
  const wordCloud = useMemo(() => {
    const w = (s.word_cloud_data || []) as any[];
    const max = Math.max(...w.map((x) => x.value || 0), 1);
    return w.slice(0, 40).map((x) => ({ text: x.text, size: 11 + (x.value / max) * 26 }));
  }, [s.word_cloud_data]);

  const cat = s.categorized_insights || {};
  const perspectives = s.perspective_summaries || {};
  const perspectiveKeys = Object.keys(perspectives).filter((k) => perspectives[k]);
  const flow = s.conversation_flow || {};
  const layers = s.summary_layers || {};
  const notes = (s.structured_notes || []) as any[];
  const claims = (s.claim_checks || []) as any[];

  // ---- loading state ----
  if (!summary) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center space-y-5 max-w-md px-8">
          <div className="relative w-16 h-16 mx-auto">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
            <Sparkles className="absolute inset-0 m-auto w-6 h-6 text-primary" />
          </div>
          <p className="text-muted-foreground font-medium">Episode is being processed…</p>
          <div className="w-full bg-secondary rounded-full h-1.5 overflow-hidden">
            <div className="bg-primary h-full rounded-full transition-all duration-500" style={{ width: `${(progress || 0) * 100}%` }} />
          </div>
          <p className="text-xs text-muted-foreground/60 uppercase tracking-widest font-bold">
            {Math.round((progress || 0) * 100)}% · {status}
          </p>
        </div>
      </div>
    );
  }

  // ---- tab availability ----
  const hasAnalytics = speakerData.length || densityData.length || insightTl.length || topics.length || wordCloud.length;
  const hasDeepDive =
    Object.values(cat).some((v: any) => v?.length) || perspectiveKeys.length || Object.keys(flow).length ||
    (s.topics || []).length || (s.suggested_questions || []).length;
  const hasNotes = Object.keys(layers).length || notes.length || claims.length || !!s.global_summary;

  const tabs: { id: TabId; label: string; icon: any; show: boolean }[] = [
    { id: "overview", label: "Overview", icon: BookOpen, show: true },
    { id: "analytics", label: "Analytics", icon: BarChart3, show: !!hasAnalytics },
    { id: "deepdive", label: "Deep Dive", icon: Layers, show: !!hasDeepDive },
    { id: "notes", label: "Notes & Facts", icon: FileText, show: !!hasNotes },
  ];

  const copyClip = (ts: number, idx: number) => {
    const url = `${window.location.origin}/episode/${episodeId}?t=${Math.floor(ts)}`;
    if (navigator.share) {
      navigator.share({ title: "Podcast moment", url }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(url);
      setCopied(idx);
      setTimeout(() => setCopied(null), 1500);
    }
  };



  return (
    <div className="flex-1 overflow-y-auto bg-background" id="summary-print-root">
      {/* Tab bar */}
      <div className="sticky top-0 z-20 bg-background/85 backdrop-blur-xl border-b border-border print:hidden">
        <div className="max-w-4xl mx-auto px-8 flex items-center gap-1">
          {tabs.filter((t) => t.show).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-4 text-xs font-bold uppercase tracking-widest border-b-2 transition-all",
                tab === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <t.icon size={14} /> {t.label}
            </button>
          ))}
          <button
            onClick={() => window.print()}
            className="ml-auto flex items-center gap-2 px-3 py-1.5 my-2 rounded-lg border border-border text-xs font-bold text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all"
          >
            <Download size={13} /> PDF
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-8 py-10 pb-16 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 15, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -15, filter: "blur(4px)" }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="space-y-12"
          >
        {/* ============ OVERVIEW ============ */}
        {tab === "overview" && (
          <>
            {summary.executive_brief && (
              <section className="space-y-3">
                <span className="text-[10px] font-black uppercase tracking-[0.25em] text-primary">Key Takeaway</span>
                <p className="text-2xl leading-relaxed font-medium text-foreground font-heading">{summary.executive_brief}</p>
                {summary.global_summary && summary.global_summary !== summary.executive_brief && (
                  <div>
                    {globalSummaryExpanded ? (
                      <p className="text-muted-foreground leading-relaxed text-sm mt-2">{summary.global_summary}</p>
                    ) : null}
                    <button
                      onClick={() => setGlobalSummaryExpanded(v => !v)}
                      className="text-xs font-bold text-primary/60 hover:text-primary transition-colors mt-1"
                    >
                      {globalSummaryExpanded ? "Show less" : "Read full summary →"}
                    </button>
                  </div>
                )}
              </section>
            )}

            {highlights.length > 0 && (
              <section className="space-y-4">
                <SectionTitle icon={Flame} color="text-orange-400">Highlights</SectionTitle>
                <div className="grid sm:grid-cols-2 gap-3">
                  {highlights.slice(0, 6).map((h, i) => (
                    <div key={i} className="group p-4 rounded-2xl bg-card border border-border hover:border-orange-400/40 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[9px] font-black uppercase tracking-widest text-orange-400/80">{h.type || "moment"}</span>
                        <div className="flex items-center gap-2">
                          <button onClick={() => onSeek(h.timestamp)} className="text-[10px] font-mono text-primary flex items-center gap-1">
                            <Clock size={10} /> {formatTime(h.timestamp)}
                          </button>
                          <button onClick={() => copyClip(h.timestamp, i)} title="Share moment" className="text-muted-foreground hover:text-primary">
                            {copied === i ? <span className="text-[9px] text-emerald-400">copied</span> : <Share2 size={12} />}
                          </button>
                        </div>
                      </div>
                      <p className="text-sm text-foreground/90 leading-snug">{h.reason || h.text}</p>
                      {typeof h.intensity === "number" && (
                        <div className="mt-2 h-1 bg-secondary rounded-full overflow-hidden">
                          <div className="h-full bg-orange-400/70" style={{ width: `${Math.min(100, (h.intensity || 0) * 100)}%` }} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {insights.length > 0 && (
              <section className="space-y-5">
                <SectionTitle icon={BookOpen}>Key Insights</SectionTitle>
                <div className="space-y-3">
                  {(insightsExpanded ? insights : insights.slice(0, 3)).map((insight, i) => (
                    <div key={i} className="p-5 bg-card rounded-2xl border border-border hover:border-primary/40 transition-colors group">
                      <div className="flex gap-3">
                        <span className="shrink-0 mt-0.5 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">{i + 1}</span>
                        <div className="flex-1">
                          <p className="text-foreground leading-relaxed">{insight.text}</p>
                          {insight.why && <p className="text-sm text-muted-foreground mt-2 pl-3 border-l-2 border-primary/30">{insight.why}</p>}
                          {typeof insight.timestamp === "number" && insight.timestamp > 0 && (
                            <button onClick={() => onSeek(insight.timestamp)} className="mt-2 text-xs text-primary/70 hover:text-primary flex items-center gap-1 font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                              <Clock className="w-3 h-3" /> {formatTime(insight.timestamp)}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {insights.length > 3 && (
                  <button onClick={() => setInsightsExpanded(v => !v)} className="text-xs font-bold text-primary/70 hover:text-primary transition-colors flex items-center gap-1">
                    {insightsExpanded ? `Show less` : `Show ${insights.length - 3} more insights`}
                  </button>
                )}
              </section>
            )}

            {actions.length > 0 && (
              <section className="space-y-5">
                <SectionTitle icon={CheckCircle2} color="text-emerald-500">Action Items</SectionTitle>
                <div className="space-y-2">
                  {(actionsExpanded ? actions : actions.slice(0, 3)).map((item: any, i: number) => {
                    const text = typeof item === "string" ? item : item.text;
                    const priority = typeof item === "object" ? item.priority : null;
                    return (
                      <div key={i} className="flex gap-3 p-4 bg-card rounded-xl border border-border items-start">
                        <div className="mt-1 w-4 h-4 rounded-md border-2 border-emerald-500/50 shrink-0" />
                        <span className="text-foreground flex-1 leading-relaxed">{text}</span>
                        {priority && (
                          <span className={cn("text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border shrink-0",
                            priority === "high" ? "text-rose-300 border-rose-500/30 bg-rose-500/10" :
                            priority === "low" ? "text-slate-300 border-slate-500/30 bg-slate-500/10" :
                            "text-amber-300 border-amber-500/30 bg-amber-500/10")}>{priority}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
                {actions.length > 3 && (
                  <button onClick={() => setActionsExpanded(v => !v)} className="text-xs font-bold text-emerald-500/70 hover:text-emerald-400 transition-colors flex items-center gap-1">
                    {actionsExpanded ? `Show less` : `Show ${actions.length - 3} more actions`}
                  </button>
                )}
              </section>
            )}

            {quotes.length > 0 && (
              <section className="space-y-5">
                <SectionTitle icon={Quote} color="text-purple-400">Memorable Quotes</SectionTitle>
                <div className="space-y-3">
                  {(quotesExpanded ? quotes : quotes.slice(0, 2)).map((quote: any, i: number) => (
                    <div key={i} className="p-5 bg-card rounded-2xl border border-border relative overflow-hidden">
                      <div className="absolute top-3 left-4 text-4xl leading-none text-purple-400/30 font-serif">&ldquo;</div>
                      <p className="italic text-foreground leading-relaxed pl-8">{quote.text || quote}</p>
                      <div className="flex items-center justify-between mt-3 pl-8">
                        {quote.speaker && <span className="text-xs text-muted-foreground">— {speakerMap?.[quote.speaker] || quote.speaker}</span>}
                        {typeof quote.timestamp === "number" && quote.timestamp > 0 && (
                          <button onClick={() => onSeek(quote.timestamp)} className="ml-auto text-xs text-primary hover:text-primary/80 flex items-center gap-1 font-mono font-bold">
                            <Clock className="w-3 h-3" /> {formatTime(quote.timestamp)}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {quotes.length > 2 && (
                  <button onClick={() => setQuotesExpanded(v => !v)} className="text-xs font-bold text-purple-400/70 hover:text-purple-400 transition-colors flex items-center gap-1">
                    {quotesExpanded ? `Show less` : `Show ${quotes.length - 2} more quotes`}
                  </button>
                )}
              </section>
            )}

            {!insights.length && !actions.length && summary.global_summary && (
              <section><p className="text-foreground leading-relaxed whitespace-pre-wrap">{summary.global_summary}</p></section>
            )}
          </>
        )}

        {/* ============ ANALYTICS ============ */}
        {tab === "analytics" && (
          <div className="space-y-10">
            {speakerData.length > 0 && (
              <section className="space-y-4">
                <SectionTitle icon={Users}>Voice Distribution</SectionTitle>
                <div className="grid md:grid-cols-2 gap-6 items-center p-6 rounded-3xl bg-card border border-border">
                  <div className="h-56 relative">
                    <SpeakerPie data={speakerData} colors={SPEAKER_COLORS} />
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-[10px] font-black text-muted-foreground uppercase">Speakers</span>
                      <span className="text-lg font-black text-foreground">{speakerData.length}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {speakerData.map((d, i) => (
                      <div key={d.name} className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: SPEAKER_COLORS[i % SPEAKER_COLORS.length] }} />
                        <span className="text-sm font-medium truncate">{d.name}</span>
                        <span className="text-sm text-muted-foreground ml-auto font-mono">{d.value.toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {densityData.length > 0 && (
              <section className="space-y-4">
                <SectionTitle icon={TrendingUp}>Conversation Density</SectionTitle>
                <div className="p-6 rounded-3xl bg-card border border-border h-56">
                  <DensityArea data={densityData} onSeek={onSeek} formatTime={formatTime} />
                </div>
                <p className="text-[11px] text-muted-foreground">Click the chart to jump to that point in the episode.</p>
              </section>
            )}

            {insightTl.length > 0 && (
              <section className="space-y-4">
                <SectionTitle icon={Zap} color="text-amber-400">Insight Intensity</SectionTitle>
                <div className="p-6 rounded-3xl bg-card border border-border h-48">
                  <InsightBars data={insightTl} onSeek={onSeek} formatTime={formatTime} />
                </div>
              </section>
            )}

            {topics.length > 0 && (
              <section className="space-y-4">
                <SectionTitle icon={Layers} color="text-cyan-400">Topic Flow</SectionTitle>
                <TopicTimeline
                  items={topics}
                  onSeek={onSeek}
                  formatTime={formatTime}
                  colors={SPEAKER_COLORS}
                  currentTime={currentTime}
                />
              </section>
            )}

            {wordCloud.length > 0 && (
              <section className="space-y-4">
                <SectionTitle icon={Sparkles}>Key Terms</SectionTitle>
                <div className="p-6 rounded-3xl bg-card border border-border flex flex-wrap gap-x-4 gap-y-2 items-center justify-center">
                  {wordCloud.map((w, i) => (
                    <span key={i} style={{ fontSize: w.size }} className="font-bold text-foreground/80 hover:text-primary transition-colors leading-tight">{w.text}</span>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {/* ============ DEEP DIVE ============ */}
        {tab === "deepdive" && (
          <div className="space-y-10">
            {(() => {
              const groups: { key: string; label: string; icon: any; color: string }[] = [
                { key: "core_concepts", label: "Core Concepts", icon: Lightbulb, color: "text-primary" },
                { key: "surprising_facts", label: "Surprising Facts", icon: Sparkles, color: "text-amber-400" },
                { key: "contradictions_discovered", label: "Contradictions", icon: AlertTriangle, color: "text-rose-400" },
                { key: "predictions_made", label: "Predictions", icon: TrendingUp, color: "text-emerald-400" },
                { key: "actionable_tips", label: "Actionable Tips", icon: CheckCircle2, color: "text-emerald-400" },
                { key: "questions_raised", label: "Open Questions", icon: HelpCircle, color: "text-cyan-400" },
              ];
              return groups.filter((g) => cat[g.key]?.length).map((g) => (
                <section key={g.key} className="space-y-3">
                  <SectionTitle icon={g.icon} color={g.color}>{g.label}</SectionTitle>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {cat[g.key].map((item: string, i: number) => (
                      <div key={i} className="p-4 rounded-2xl bg-card border border-border text-sm text-foreground/90 leading-snug">{item}</div>
                    ))}
                  </div>
                </section>
              ));
            })()}

            {perspectiveKeys.length > 0 && (
              <section className="space-y-4">
                <SectionTitle icon={Users} color="text-violet-400">Perspectives</SectionTitle>
                <div className="flex flex-wrap gap-2">
                  {perspectiveKeys.map((k) => (
                    <button key={k} onClick={() => setPersona(persona === k ? "" : k)}
                      className={cn("px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest border transition-all",
                        (persona || perspectiveKeys[0]) === k ? "bg-primary text-white border-primary" : "text-muted-foreground border-border hover:text-foreground")}>
                      {k.replace(/_/g, " ")}
                    </button>
                  ))}
                </div>
                <div className="p-6 rounded-2xl bg-card border border-border text-foreground/90 leading-relaxed">
                  {perspectives[persona || perspectiveKeys[0]]}
                </div>
              </section>
            )}

            {(flow.power_dynamics || flow.qa_patterns?.length || flow.debate_structures?.length) && (
              <section className="space-y-3">
                <SectionTitle icon={Layers} color="text-cyan-400">Conversation Flow</SectionTitle>
                <div className="p-6 rounded-2xl bg-card border border-border space-y-3 text-sm text-foreground/90">
                  {flow.power_dynamics && <p><span className="text-muted-foreground font-bold uppercase text-[10px] tracking-widest">Dynamics: </span>{flow.power_dynamics}</p>}
                  {flow.qa_patterns?.length > 0 && <div><span className="text-muted-foreground font-bold uppercase text-[10px] tracking-widest">Q&A patterns</span><ul className="list-disc ml-5 mt-1 space-y-1">{flow.qa_patterns.map((p: string, i: number) => <li key={i}>{p}</li>)}</ul></div>}
                  {flow.debate_structures?.length > 0 && <div><span className="text-muted-foreground font-bold uppercase text-[10px] tracking-widest">Debate</span><ul className="list-disc ml-5 mt-1 space-y-1">{flow.debate_structures.map((p: string, i: number) => <li key={i}>{p}</li>)}</ul></div>}
                </div>
              </section>
            )}

            {(s.topics || []).length > 0 && (
              <section className="space-y-3">
                <SectionTitle icon={BarChart3}>Thematic Weights</SectionTitle>
                <div className="p-6 rounded-2xl bg-card border border-border space-y-3">
                  {(() => {
                    const tps = (s.topics || []) as any[];
                    const maxV = Math.max(...tps.map((t) => Number(t.value) || 0), 1);
                    return tps.slice(0, 8).map((t: any, i: number) => (
                      <div key={i} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium text-foreground">{t.label}</span>
                          <span className="text-muted-foreground font-mono text-xs">{t.value}</span>
                        </div>
                        <div className="h-2 bg-secondary rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${(Number(t.value) / maxV) * 100}%`, background: SPEAKER_COLORS[i % SPEAKER_COLORS.length] }} />
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </section>
            )}

            {(s.suggested_questions || []).length > 0 && (
              <section className="space-y-3">
                <SectionTitle icon={HelpCircle} color="text-cyan-400">Questions to Explore</SectionTitle>
                <div className="grid sm:grid-cols-2 gap-3">
                  {(s.suggested_questions as string[]).slice(0, 6).map((q, i) => (
                    <div key={i} className="p-4 rounded-2xl bg-card border border-border text-sm text-foreground/90 leading-snug italic">“{q}”</div>
                  ))}
                </div>
              </section>
            )}

            {!hasDeepDive && (
              <p className="text-sm text-muted-foreground text-center py-12">Deep-dive analysis wasn't generated for this episode.</p>
            )}
          </div>
        )}

        {/* ============ NOTES & FACTS ============ */}
        {tab === "notes" && (
          <div className="space-y-10">
            {(() => {
              // LLM layers sometimes carry markdown headers or get cut mid-sentence.
              const clean = (t: any) => {
                let x = String(t || "").replace(/^#{1,4}\s*/gm, "").trim();
                if (x && !/[.!?…”"']$/.test(x)) x += "…";
                return x;
              };
              const tldr = clean(layers.level_1_tldr) || String(s.executive_brief || "");
              const exec = clean(layers.level_2_exec);
              const lvl4 = (layers.level_4_notes || []) as any[];
              if (!tldr && !exec && !layers.level_3_outline?.length && !lvl4.length) return null;
              return (
                <section className="space-y-3">
                  <SectionTitle icon={Layers}>Layered Summary</SectionTitle>
                  {tldr && <div className="p-4 rounded-2xl bg-primary/5 border border-primary/20"><span className="text-[10px] font-black uppercase tracking-widest text-primary">TL;DR</span><p className="mt-1 text-foreground">{tldr}</p></div>}
                  {exec && <div className="p-4 rounded-2xl bg-card border border-border"><span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Executive</span><p className="mt-1 text-foreground/90 text-sm leading-relaxed">{exec}</p></div>}
                  {layers.level_3_outline?.length > 0 && (
                    <div className="space-y-2">
                      {layers.level_3_outline.map((o: any, i: number) => (
                        <details key={i} className="p-4 rounded-2xl bg-card border border-border group">
                          <summary className="cursor-pointer font-bold text-foreground list-none flex items-center justify-between">{clean(o.title)}<span className="text-muted-foreground text-xs group-open:rotate-180 transition-transform">▾</span></summary>
                          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{clean(o.summary)}</p>
                        </details>
                      ))}
                    </div>
                  )}
                  {lvl4.length > 0 && (
                    <div className="space-y-3">
                      {lvl4.map((n: any, i: number) => (
                        <div key={i} className="p-4 rounded-2xl bg-card border border-border">
                          {n.section && <h4 className="font-bold text-foreground mb-1.5 text-sm">{clean(n.section)}</h4>}
                          <ul className="list-disc ml-5 space-y-1 text-sm text-foreground/85">{(n.notes || []).map((x: string, j: number) => <li key={j}>{clean(x)}</li>)}</ul>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              );
            })()}

            {notes.length > 0 && (
              <section className="space-y-3">
                <SectionTitle icon={FileText}>Structured Notes</SectionTitle>
                <div className="space-y-4">
                  {notes.map((n: any, i: number) => (
                    <div key={i} className="p-5 rounded-2xl bg-card border border-border">
                      {n.section && <h4 className="font-black text-foreground mb-2">{n.section}</h4>}
                      <ul className="list-disc ml-5 space-y-1 text-sm text-foreground/90">{(n.notes || []).map((x: string, j: number) => <li key={j}>{x}</li>)}</ul>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {!notes.length && s.global_summary && (
              <section className="space-y-3">
                <SectionTitle icon={FileText}>Full Notes</SectionTitle>
                <div className="p-6 rounded-2xl bg-card border border-border text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
                  {String(s.global_summary).replace(/^#{1,4}\s*/gm, "")}
                </div>
              </section>
            )}

            {claims.length > 0 && (
              <section className="space-y-3">
                <SectionTitle icon={ShieldCheck} color="text-emerald-400">Fact-check</SectionTitle>
                <div className="space-y-3">
                  {claims.map((c: any, i: number) => {
                    const ok = String(c.status || "").toLowerCase().includes("support") || String(c.status || "").toLowerCase() === "true";
                    return (
                      <div key={i} className="p-5 rounded-2xl bg-card border border-border">
                        <div className="flex items-start gap-3">
                          {ok ? <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" /> : <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />}
                          <div className="flex-1">
                            <p className="text-foreground">{c.claim}</p>
                            <div className="flex items-center gap-2 mt-1.5">
                              <span className={cn("text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border", ok ? "text-emerald-300 border-emerald-500/30 bg-emerald-500/10" : "text-amber-300 border-amber-500/30 bg-amber-500/10")}>{c.status}</span>
                              {typeof c.confidence === "number" && <span className="text-[10px] text-muted-foreground font-mono">{Math.round(c.confidence * 100)}% conf</span>}
                            </div>
                            {c.reason && <p className="text-xs text-muted-foreground mt-2">{c.reason}</p>}
                            {c.sources?.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {c.sources.slice(0, 3).map((src: any, j: number) => (
                                  <a key={j} href={src.link} target="_blank" rel="noreferrer" className="text-[10px] text-primary hover:underline flex items-center gap-1"><Link2 size={9} />{src.title || "source"}</a>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
