"use client";

import React, { useState } from "react";
import {
  BookOpen,
  Zap,
  CheckCircle2,
  Quote2,
  TrendingUp,
  Users,
  Clock,
  Share2,
  Bookmark,
  ChevronDown,
  Sparkles,
  BarChart3,
  ArrowRight,
  MessageCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Summary } from "@/lib/api";

type SummaryMode = "tldr" | "standard" | "deep";
type PersonaType = "default" | "executive" | "learner" | "builder" | "storyteller" | "analyst";

interface ImprovedSummaryViewProps {
  summary: Summary | null;
  onSeek: (time: number) => void;
  onPersonaChange?: (persona: PersonaType) => void;
}

const PERSONAS: Record<PersonaType, { label: string; icon: React.ReactNode; description: string }> = {
  default: { label: "Balanced", icon: <BookOpen className="w-4 h-4" />, description: "Overview of everything" },
  executive: { label: "Executive", icon: <TrendingUp className="w-4 h-4" />, description: "Focus: impact & decisions" },
  learner: { label: "Learner", icon: <Sparkles className="w-4 h-4" />, description: "Focus: concepts & frameworks" },
  builder: { label: "Builder", icon: <CheckCircle2 className="w-4 h-4" />, description: "Focus: actionable steps" },
  storyteller: { label: "Storyteller", icon: <MessageCircle className="w-4 h-4" />, description: "Focus: narrative & drama" },
  analyst: { label: "Analyst", icon: <BarChart3 className="w-4 h-4" />, description: "Focus: data & sources" },
};

const MODES: Record<SummaryMode, { label: string; readTime: string; description: string }> = {
  tldr: { label: "TL;DR", readTime: "2 min", description: "Essentials only" },
  standard: { label: "Standard", readTime: "5 min", description: "Balanced view" },
  deep: { label: "Deep Dive", readTime: "15 min", description: "Everything" },
};

interface InsightCard {
  text: string;
  confidence?: "HIGH" | "MEDIUM" | "LOW";
  why_matters?: string;
}

interface ActionCard {
  text: string;
  timeframe?: string;
  owner?: string;
}

export function ImprovedSummaryView({ summary, onSeek, onPersonaChange }: ImprovedSummaryViewProps) {
  const [mode, setMode] = useState<SummaryMode>("standard");
  const [persona, setPersona] = useState<PersonaType>("default");
  const [expandedInsight, setExpandedInsight] = useState<number | null>(null);
  const [savedInsights, setSavedInsights] = useState<Set<number>>(new Set());

  if (!summary) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-gray-500">No summary available</p>
      </div>
    );
  }

  const handleSaveInsight = (idx: number) => {
    const newSaved = new Set(savedInsights);
    if (newSaved.has(idx)) newSaved.delete(idx);
    else newSaved.add(idx);
    setSavedInsights(newSaved);
  };

  const handlePersonaChange = (newPersona: PersonaType) => {
    setPersona(newPersona);
    onPersonaChange?.(newPersona);
  };

  // Filter data based on mode (tldr = 3 items, standard = all, deep = all)
  const maxInsights = mode === "tldr" ? 3 : mode === "standard" ? 8 : 12;
  const maxActions = mode === "tldr" ? 2 : mode === "standard" ? 8 : 12;

  const insights: InsightCard[] = summary.key_insights?.slice(0, maxInsights) || [];
  const actions: ActionCard[] = summary.action_items?.slice(0, maxActions) || [];
  const quotes = summary.key_quotes?.slice(0, mode === "tldr" ? 2 : 6) || [];

  return (
    <div className="h-screen overflow-y-auto bg-gradient-to-br from-gray-50 to-white">
      {/* Controls Bar */}
      <div className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-4 space-y-4">
          {/* Mode Selector */}
          <div className="flex gap-3">
            {Object.entries(MODES).map(([key, { label, readTime, description }]) => (
              <button
                key={key}
                onClick={() => setMode(key as SummaryMode)}
                className={cn(
                  "px-4 py-2 rounded-lg transition-all text-sm font-medium border",
                  mode === key
                    ? "bg-blue-500 text-white border-blue-600 shadow-md"
                    : "bg-gray-100 text-gray-700 border-gray-200 hover:border-gray-300"
                )}
              >
                <div className="font-semibold">{label}</div>
                <div className="text-xs opacity-75">{readTime} read</div>
              </button>
            ))}
          </div>

          {/* Persona Selector */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            {Object.entries(PERSONAS).map(([key, { label, icon }]) => (
              <button
                key={key}
                onClick={() => handlePersonaChange(key as PersonaType)}
                title={PERSONAS[key as PersonaType].description}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg whitespace-nowrap text-sm transition-all border",
                  persona === key
                    ? "bg-blue-50 border-blue-300 text-blue-700"
                    : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                )}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8 pb-20">
        {/* Hero Section */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-8 border border-blue-100">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-3">{summary.executive_brief}</h1>
              <p className="text-sm text-gray-600">
                {mode === "tldr" ? "Quick overview" : "Full context"} • {MODES[mode].readTime} read
              </p>
            </div>
            <div className={cn("px-3 py-1 rounded-full text-xs font-semibold", {
              "bg-red-100 text-red-700": summary.insight_density === "High",
              "bg-yellow-100 text-yellow-700": summary.insight_density === "Medium",
              "bg-green-100 text-green-700": summary.insight_density === "Light",
            })}>
              {summary.insight_density} Density
            </div>
          </div>
        </div>

        {/* Key Insights */}
        {insights.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Zap className="w-5 h-5 text-blue-500" />
              Key Insights
            </h2>
            <div className="grid gap-3">
              {insights.map((insight, idx) => (
                <div
                  key={idx}
                  className="bg-white rounded-lg border border-gray-200 hover:border-blue-300 transition-all p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-gray-800 font-medium flex-1">{insight.text}</p>
                    <button
                      onClick={() => handleSaveInsight(idx)}
                      className={cn(
                        "p-2 rounded-lg transition-colors",
                        savedInsights.has(idx)
                          ? "bg-yellow-100 text-yellow-600"
                          : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                      )}
                    >
                      <Bookmark className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Expandable Details */}
                  <button
                    onClick={() => setExpandedInsight(expandedInsight === idx ? null : idx)}
                    className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    {expandedInsight === idx ? "Hide" : "Show"} details
                    <ChevronDown className={cn("w-4 h-4 transition-transform", expandedInsight === idx && "rotate-180")} />
                  </button>

                  {expandedInsight === idx && (
                    <div className="pt-2 border-t border-gray-100 space-y-2">
                      {insight.confidence && (
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-gray-600">Confidence:</span>
                          <span className={cn("font-semibold", {
                            "text-green-600": insight.confidence === "HIGH",
                            "text-yellow-600": insight.confidence === "MEDIUM",
                            "text-gray-600": insight.confidence === "LOW",
                          })}>
                            {insight.confidence}
                          </span>
                        </div>
                      )}
                      {insight.why_matters && (
                        <p className="text-sm text-gray-700">
                          <span className="font-semibold text-gray-800">Why it matters:</span> {insight.why_matters}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Items */}
        {actions.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              Action Items
            </h2>
            <div className="grid gap-3">
              {actions.map((action, idx) => (
                <div key={idx} className="bg-white rounded-lg border border-gray-200 p-4 flex items-start gap-3">
                  <div className="mt-1 w-5 h-5 rounded-full border-2 border-green-500 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-gray-800 font-medium">{action.text}</p>
                    {(action.timeframe || action.owner) && (
                      <p className="text-sm text-gray-600 mt-2">
                        {action.timeframe && <span>⏱️ {action.timeframe}</span>}
                        {action.owner && <span className="ml-3">👤 {action.owner}</span>}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quotes */}
        {quotes.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Quote2 className="w-5 h-5 text-purple-500" />
              Key Quotes
            </h2>
            <div className="grid gap-3">
              {quotes.map((quote, idx) => (
                <div
                  key={idx}
                  className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border border-purple-200 p-4 space-y-2"
                >
                  <p className="text-gray-800 italic">"{quote.text || quote}"</p>
                  {typeof quote === "object" && "timestamp" in quote && (
                    <button
                      onClick={() => onSeek(quote.timestamp)}
                      className="text-sm text-purple-600 hover:text-purple-700 font-medium flex items-center gap-1"
                    >
                      <Clock className="w-4 h-4" />
                      Listen at {Math.floor(quote.timestamp / 60)}:{String(Math.floor(quote.timestamp % 60)).padStart(2, "0")}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Topics */}
        {summary.topics && summary.topics.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-orange-500" />
              Topics Covered
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {summary.topics.map((topic, idx) => (
                <div key={idx} className="bg-white rounded-lg border border-gray-200 p-4">
                  <p className="text-sm font-medium text-gray-800">{topic.label}</p>
                  <p className="text-xs text-gray-600 mt-1">{topic.value}% of episode</p>
                  <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-orange-400 to-orange-600"
                      style={{ width: `${topic.value}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
