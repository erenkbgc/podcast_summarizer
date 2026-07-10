"use client";

import { useEffect, useRef } from "react";
import { Chapter } from "@/lib/api";
import { cn } from "@/lib/utils";

interface ChapterIndexViewProps {
  chapters: Chapter[];
  currentTime: number;
  onSeek: (time: number) => void;
}

function formatTime(seconds: number): string {
  if (isNaN(seconds)) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds) || seconds <= 0) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function ChapterIndexView({ chapters, currentTime, onSeek }: ChapterIndexViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement | null>(null);

  if (!Array.isArray(chapters) || chapters.length === 0) return null;

  // Determine which chapter is currently playing
  let activeIdx = -1;
  for (let i = chapters.length - 1; i >= 0; i--) {
    const endTime = chapters[i].end_timestamp ?? chapters[i + 1]?.timestamp;
    if (currentTime >= chapters[i].timestamp && (endTime === undefined || currentTime < endTime)) {
      activeIdx = i;
      break;
    }
  }

  // Auto-scroll to active chapter
  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [activeIdx]);

  return (
    <div className="space-y-1">
      <div className="text-center mb-6">
        <h3 className="text-base font-black uppercase tracking-[0.3em] text-foreground font-heading">
          Contents
        </h3>
        <div className="mt-2 h-px w-16 mx-auto bg-border" />
      </div>

      <div className="space-y-0.5" ref={containerRef}>
        {chapters.map((chapter, i) => {
          const isActive = i === activeIdx;
          const nextChapter = chapters[i + 1];
          const endTime = chapter.end_timestamp ?? nextChapter?.timestamp;
          const chapterDuration = endTime !== undefined ? endTime - chapter.timestamp : undefined;
          const desc = chapter.summary || chapter.description;

          // Progress through this chapter (0–1)
          const chapterProgress =
            isActive && chapterDuration && chapterDuration > 0
              ? Math.min(1, (currentTime - chapter.timestamp) / chapterDuration)
              : 0;

          return (
            <button
              key={i}
              ref={isActive ? activeRef : null}
              onClick={() => onSeek(chapter.timestamp)}
              className={cn(
                "w-full text-left group rounded-xl px-4 py-3 transition-all",
                isActive
                  ? "bg-primary/10 border border-primary/20"
                  : "hover:bg-secondary/40 border border-transparent"
              )}
            >
              {/* Chapter number, title, timestamps */}
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span
                      className={cn(
                        "shrink-0 text-[10px] font-mono font-bold tabular-nums",
                        isActive ? "text-primary" : "text-muted-foreground/60"
                      )}
                    >
                      {(i + 1).toString().padStart(2, "0")}
                    </span>
                    <span
                      className={cn(
                        "font-heading font-bold text-sm leading-tight flex-1",
                        isActive ? "text-primary" : "text-foreground group-hover:text-primary/80"
                      )}
                    >
                      {chapter.title}
                    </span>
                  </div>
                </div>

                {/* Duration badge */}
                {chapterDuration !== undefined && chapterDuration > 0 && (
                  <span
                    className={cn(
                      "shrink-0 text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded-md",
                      isActive
                        ? "bg-primary/20 text-primary"
                        : "bg-secondary/50 text-muted-foreground/70"
                    )}
                  >
                    {formatDuration(chapterDuration)}
                  </span>
                )}
              </div>

              {/* Timestamp range */}
              <div className="ml-8 mb-1">
                <span className={cn("text-[10px] font-mono font-semibold", isActive ? "text-primary/70" : "text-muted-foreground/60")}>
                  {formatTime(chapter.timestamp)}
                  {endTime !== undefined && ` → ${formatTime(endTime)}`}
                </span>
              </div>

              {/* Progress bar for active chapter */}
              {isActive && chapterDuration !== undefined && chapterDuration > 0 && (
                <div className="ml-8 mt-2 h-0.5 bg-primary/20 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-500"
                    style={{ width: `${chapterProgress * 100}%` }}
                  />
                </div>
              )}

              {/* One-sentence description */}
              {desc && (
                <p className="mt-2 ml-8 text-xs leading-relaxed text-muted-foreground line-clamp-2">
                  {desc}
                </p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
