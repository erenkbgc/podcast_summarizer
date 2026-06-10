"use client";

import { useState, useMemo } from "react";
import { Clock, ChevronDown, Play } from "lucide-react";
import { TopicTimeline, TopicTransitionItem } from "./summary/TopicTimeline";

interface Topic {
  start: number;
  end: number;
  topic: string;
}

interface TopicIndexViewProps {
  topics: Topic[];
  currentTime: number;
  onSeek: (time: number) => void;
  transcript?: any;
}

const COLORS = [
  "#3B82F6", "#EF4444", "#10B981", "#F59E0B", "#8B5CF6",
  "#EC4899", "#14B8A6", "#6366F1", "#F97316", "#06B6D4"
];

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function TopicIndexView({ topics, currentTime, onSeek, transcript }: TopicIndexViewProps) {
  const [expandedTopic, setExpandedTopic] = useState<number | null>(0);

  const topicItems: TopicTransitionItem[] = useMemo(
    () =>
      (topics || []).map((t, i) => ({
        start: t.start,
        end: t.end,
        topic: t.topic || `Topic ${i + 1}`,
        color: COLORS[i % COLORS.length],
      })),
    [topics]
  );

  if (!topicItems.length) return null;

  const currentTopicIndex = topicItems.findIndex(
    (t) => currentTime >= t.start && currentTime < t.end
  );

  return (
    <div className="space-y-6 p-6 bg-gradient-to-br from-slate-50 to-slate-100 rounded-lg">
      {/* Timeline Visualization */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Clock className="w-4 h-4" />
          Episode Timeline
        </h3>
        <TopicTimeline
          items={topicItems}
          onSeek={onSeek}
          formatTime={formatTime}
          colors={COLORS}
        />
      </div>

      {/* Topic List */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-700">Topics Discussed</h3>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {topicItems.map((item, idx) => {
            const isActive = idx === currentTopicIndex;
            return (
              <button
                key={idx}
                onClick={() => {
                  onSeek(item.start);
                  setExpandedTopic(idx);
                }}
                className={`w-full text-left p-3 rounded-lg transition-all ${
                  isActive
                    ? "bg-white shadow-md border-l-4"
                    : "bg-white/50 hover:bg-white border-l-4 border-l-transparent"
                }`}
                style={{ borderLeftColor: isActive ? item.color : "transparent" }}
              >
                <div className="flex items-start gap-3">
                  {isActive && <Play className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-500" />}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-slate-900 line-clamp-2">
                      {item.topic}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {formatTime(item.start)} - {formatTime(item.end)}
                      {item.end - item.start > 0 && (
                        <span className="ml-2">
                          ({Math.round(item.end - item.start)}s)
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
