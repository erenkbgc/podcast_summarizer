"use client";

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

export function ChapterIndexView({ chapters, currentTime, onSeek }: ChapterIndexViewProps) {
  if (!Array.isArray(chapters) || chapters.length === 0) return null;

  // Determine which chapter is currently playing
  let activeIdx = -1;
  for (let i = chapters.length - 1; i >= 0; i--) {
    if (currentTime >= chapters[i].timestamp) {
      activeIdx = i;
      break;
    }
  }

  return (
    <div className="space-y-1">
      <div className="text-center mb-6">
        <h3 className="text-base font-black uppercase tracking-[0.3em] text-foreground font-heading">
          Contents
        </h3>
        <div className="mt-2 h-px w-16 mx-auto bg-border" />
      </div>

      <div className="space-y-0.5">
        {chapters.map((chapter, i) => {
          const isActive = i === activeIdx;
          const nextChapter = chapters[i + 1];
          const desc = chapter.summary || chapter.description;

          return (
            <button
              key={i}
              onClick={() => onSeek(chapter.timestamp)}
              className={cn(
                "w-full text-left group rounded-xl px-4 py-3 transition-all",
                isActive ? "bg-primary/10" : "hover:bg-secondary/40"
              )}
            >
              {/* Title row with dotted leader + timestamp (book TOC style) */}
              <div className="flex items-baseline gap-2">
                <span
                  className={cn(
                    "shrink-0 w-6 text-[11px] font-mono font-bold tabular-nums",
                    isActive ? "text-primary" : "text-muted-foreground/50"
                  )}
                >
                  {(i + 1).toString().padStart(2, "0")}
                </span>
                <span
                  className={cn(
                    "font-heading font-bold text-sm leading-tight",
                    isActive ? "text-primary" : "text-foreground group-hover:text-primary/80"
                  )}
                >
                  {chapter.title}
                </span>
                <span className="flex-1 border-b border-dotted border-border/60 relative top-[-3px] mx-1" />
                <span
                  className={cn(
                    "shrink-0 font-mono text-[11px] tabular-nums",
                    isActive ? "text-primary font-bold" : "text-muted-foreground"
                  )}
                >
                  {formatTime(chapter.timestamp)}
                </span>
              </div>

              {/* One-sentence description below the title */}
              {desc && (
                <p className="mt-1.5 ml-8 mr-12 text-xs leading-relaxed text-muted-foreground">
                  {desc}
                </p>
              )}

              {/* Subtle duration hint */}
              {nextChapter && (
                <span className="mt-1 ml-8 inline-block text-[9px] font-mono uppercase tracking-widest text-muted-foreground/40">
                  {formatTime(chapter.timestamp)} – {formatTime(nextChapter.timestamp)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
