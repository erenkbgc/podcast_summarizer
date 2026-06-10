"use client";

import { BookOpen, CheckCircle2, Quote, AlertCircle, Clock, Sparkles } from "lucide-react";
import { Summary } from "@/lib/api";

interface SimpleSummaryViewProps {
  summary: Summary | null;
  status?: string;
  progress?: number;
  onSeek: (time: number) => void;
  transcriptSegments?: any[];
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function SimpleSummaryView({ summary, status, progress, onSeek }: SimpleSummaryViewProps) {
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
            <div
              className="bg-primary h-full rounded-full transition-all duration-500"
              style={{ width: `${(progress || 0) * 100}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground/60 uppercase tracking-widest font-bold">
            {Math.round((progress || 0) * 100)}% · {status}
          </p>
        </div>
      </div>
    );
  }

  const s = summary as any;
  // Insights live in insight_attribution (rich: text + timestamp) or key_takeaways
  // (plain strings); key_insights is a legacy field that may be empty.
  const attribution = (s.insight_attribution || []) as any[];
  const insights: any[] =
    attribution.length > 0
      ? attribution.map((a) => ({ text: a.insight, timestamp: a.start }))
      : ((s.key_insights || s.key_takeaways || []) as any[]);
  const actions = (s.action_items || []) as any[];
  const quotes = (s.key_quotes || []) as any[];

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="max-w-3xl mx-auto px-8 py-12 space-y-14">
        {/* Executive Brief */}
        {summary.executive_brief && (
          <section className="space-y-3">
            <span className="text-[10px] font-black uppercase tracking-[0.25em] text-primary">
              Key Takeaway
            </span>
            <p className="text-2xl leading-relaxed font-medium text-foreground font-heading">
              {summary.executive_brief}
            </p>
          </section>
        )}

        {/* Key Insights */}
        {insights.length > 0 && (
          <section className="space-y-5">
            <h3 className="text-sm font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-primary" />
              Key Insights
            </h3>
            <div className="space-y-3">
              {insights.slice(0, 6).map((insight, i) => {
                const text = typeof insight === "string" ? insight : insight.text;
                const why = typeof insight === "object" ? insight.why_matters : null;
                const ts = typeof insight === "object" ? insight.timestamp : null;
                return (
                  <div
                    key={i}
                    className="p-5 bg-card rounded-2xl border border-border hover:border-primary/40 transition-colors group"
                  >
                    <div className="flex gap-3">
                      <span className="shrink-0 mt-0.5 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                        {i + 1}
                      </span>
                      <div className="flex-1">
                        <p className="text-foreground leading-relaxed">{text}</p>
                        {why && (
                          <p className="text-sm text-muted-foreground mt-2 pl-3 border-l-2 border-primary/30">
                            {why}
                          </p>
                        )}
                        {typeof ts === "number" && ts > 0 && (
                          <button
                            onClick={() => onSeek(ts)}
                            className="mt-2 text-xs text-primary/70 hover:text-primary flex items-center gap-1 font-mono opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Clock className="w-3 h-3" />
                            {formatTime(ts)}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Action Items */}
        {actions.length > 0 && (
          <section className="space-y-5">
            <h3 className="text-sm font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              Action Items
            </h3>
            <div className="space-y-2">
              {actions.slice(0, 6).map((item, i) => (
                <div
                  key={i}
                  className="flex gap-3 p-4 bg-card rounded-xl border border-border"
                >
                  <div className="mt-1 w-4 h-4 rounded-md border-2 border-emerald-500/50 shrink-0" />
                  <span className="text-foreground flex-1 leading-relaxed">
                    {typeof item === "string" ? item : item.text}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Key Quotes */}
        {quotes.length > 0 && (
          <section className="space-y-5">
            <h3 className="text-sm font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
              <Quote className="w-4 h-4 text-purple-400" />
              Memorable Quotes
            </h3>
            <div className="space-y-3">
              {quotes.slice(0, 4).map((quote, i) => {
                const text = quote.text || quote;
                const ts = quote.timestamp;
                return (
                  <div
                    key={i}
                    className="p-5 bg-card rounded-2xl border border-border relative overflow-hidden"
                  >
                    <div className="absolute top-3 left-4 text-4xl leading-none text-purple-400/30 font-serif">
                      &ldquo;
                    </div>
                    <p className="italic text-foreground leading-relaxed pl-8">{text}</p>
                    <div className="flex items-center justify-between mt-3 pl-8">
                      {quote.speaker && (
                        <span className="text-xs text-muted-foreground">— {quote.speaker}</span>
                      )}
                      {typeof ts === "number" && ts > 0 && (
                        <button
                          onClick={() => onSeek(ts)}
                          className="ml-auto text-xs text-primary hover:text-primary/80 flex items-center gap-1 font-mono font-bold"
                        >
                          <Clock className="w-3 h-3" />
                          {formatTime(ts)}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Fallback global summary */}
        {!insights.length && !actions.length && summary.global_summary && (
          <section className="space-y-3">
            <p className="text-foreground leading-relaxed whitespace-pre-wrap">
              {summary.global_summary}
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
