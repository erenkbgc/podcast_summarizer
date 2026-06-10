"use client";

import { useState } from "react";
import { BookOpen, CheckCircle2, Quote2, AlertCircle, Clock } from "lucide-react";
import { Summary } from "@/lib/api";

interface SimpleSummaryViewProps {
  summary: Summary | null;
  status?: string;
  progress?: number;
  onSeek: (time: number) => void;
  transcriptSegments?: any[];
}

export function SimpleSummaryView({ summary, status, progress, onSeek, transcriptSegments }: SimpleSummaryViewProps) {
  const [expandedQuote, setExpandedQuote] = useState<number | null>(null);

  if (!summary) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center space-y-4 max-w-md">
          <AlertCircle className="w-12 h-12 mx-auto text-slate-400" />
          <p className="text-slate-600 font-medium">Episode still processing...</p>
          <div className="w-full bg-slate-200 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${(progress || 0) * 100}%` }}
            />
          </div>
          <p className="text-xs text-slate-500">{Math.round((progress || 0) * 100)}% complete</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gradient-to-br from-slate-50 to-white">
      <div className="max-w-3xl mx-auto px-8 py-12 space-y-12">
        {/* Executive Brief */}
        {summary.executive_brief && (
          <section className="space-y-3">
            <h2 className="text-2xl font-bold text-slate-900">Key Takeaway</h2>
            <p className="text-lg leading-relaxed text-slate-700">
              {summary.executive_brief}
            </p>
          </section>
        )}

        {/* Key Insights */}
        {summary.key_insights && summary.key_insights.length > 0 && (
          <section className="space-y-4">
            <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-blue-600" />
              Key Insights ({summary.key_insights.length})
            </h3>
            <div className="space-y-3">
              {summary.key_insights.slice(0, 5).map((insight: any, i: number) => (
                <div key={i} className="p-4 bg-white rounded-lg border border-slate-200 hover:border-blue-300 transition-colors">
                  <p className="text-slate-800 font-medium leading-relaxed">
                    {typeof insight === 'string' ? insight : insight.text}
                  </p>
                  {insight.why_matters && (
                    <p className="text-sm text-slate-600 mt-2 italic">
                      💡 {insight.why_matters}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Action Items */}
        {summary.action_items && summary.action_items.length > 0 && (
          <section className="space-y-4">
            <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              Action Items ({summary.action_items.length})
            </h3>
            <div className="space-y-2">
              {summary.action_items.slice(0, 5).map((item: any, i: number) => (
                <div key={i} className="flex gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                  <input type="checkbox" className="mt-0.5 cursor-pointer" />
                  <span className="text-slate-800 flex-1">
                    {typeof item === 'string' ? item : item.text}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Key Quotes */}
        {summary.key_quotes && summary.key_quotes.length > 0 && (
          <section className="space-y-4">
            <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Quote2 className="w-5 h-5 text-purple-600" />
              Memorable Quotes
            </h3>
            <div className="space-y-3">
              {summary.key_quotes.slice(0, 4).map((quote: any, i: number) => (
                <button
                  key={i}
                  onClick={() => {
                    if (quote.timestamp) onSeek(quote.timestamp);
                    setExpandedQuote(expandedQuote === i ? null : i);
                  }}
                  className="w-full text-left p-4 bg-purple-50 rounded-lg border border-purple-200 hover:border-purple-400 transition-all group"
                >
                  <div className="flex gap-3 items-start">
                    <div className="text-2xl leading-none text-purple-400 mt-1">❝</div>
                    <div className="flex-1">
                      <p className="italic text-slate-800 leading-relaxed">
                        "{quote.text || quote}"
                      </p>
                      {quote.speaker && (
                        <p className="text-xs text-slate-600 mt-2">— {quote.speaker}</p>
                      )}
                      {quote.timestamp && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSeek(quote.timestamp);
                          }}
                          className="text-xs text-blue-600 hover:text-blue-800 mt-2 flex items-center gap-1"
                        >
                          <Clock className="w-3 h-3" />
                          Jump to {Math.floor(quote.timestamp / 60)}:{String(Math.floor(quote.timestamp % 60)).padStart(2, '0')}
                        </button>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
