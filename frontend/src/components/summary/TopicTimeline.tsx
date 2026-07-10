"use client";

export type TopicTransitionItem = {
    start: number;
    end: number;
    topic: string;
    color?: string;
};

export function TopicTimeline({
    items,
    onSeek,
    formatTime,
    colors,
    currentTime,
}: {
    items: TopicTransitionItem[];
    onSeek: (time: number) => void;
    formatTime: (n: number) => string;
    colors: string[];
    currentTime?: number;
}) {
    if (!Array.isArray(items) || items.length === 0) return null;
    const total = items[items.length - 1]?.end || 0;

    const activeIdx =
        currentTime !== undefined
            ? items.findLastIndex((t) => currentTime >= t.start && currentTime < t.end)
            : -1;

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <div className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">Topic Flow</div>
                <p className="text-[8px] text-muted-foreground/50 leading-relaxed">
                    Topics identified throughout the episode. Each colored segment represents a topic. Click to jump.
                </p>
            </div>

            {/* Bar */}
            <div className="relative">
                <div className="flex h-5 w-full rounded-full overflow-hidden bg-secondary/20">
                    {items.map((t, i) => {
                        const duration = t.end - t.start;
                        const width = total > 0 ? (duration / total) * 100 : 0;
                        const isActive = i === activeIdx;

                        const durationSeconds = Math.round(duration);
                        const durationMins = Math.floor(durationSeconds / 60);
                        const durationSecs = durationSeconds % 60;
                        const durationStr =
                            durationMins > 0 ? `${durationMins}m ${durationSecs}s` : `${durationSecs}s`;

                        // Truncate label to fit inside bar
                        const label = t.topic.length > 12 ? t.topic.slice(0, 10) + "…" : t.topic;

                        return (
                            <div
                                key={i}
                                className="h-full relative group cursor-pointer transition-all duration-300 flex items-center justify-center overflow-hidden"
                                style={{
                                    width: `${width}%`,
                                    backgroundColor: t.color || colors[i % colors.length],
                                    filter: isActive ? "brightness(1.3)" : undefined,
                                    transform: isActive ? "scaleY(1.15)" : undefined,
                                    transformOrigin: "center",
                                    transition: "filter 0.3s, transform 0.3s",
                                }}
                                onClick={() => onSeek(t.start)}
                            >
                                {/* Label inside bar (only if wide enough) */}
                                {width > 10 && (
                                    <span className="text-[7px] font-bold text-white/90 truncate px-1 select-none pointer-events-none">
                                        {label}
                                    </span>
                                )}

                                {/* Active playhead marker */}
                                {isActive && (
                                    <div className="absolute right-0 top-0 bottom-0 w-0.5 bg-white/90 shadow-[0_0_4px_white]" />
                                )}

                                {/* Tooltip */}
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 bg-black/95 border border-white/10 p-3 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 space-y-1">
                                    <div className="text-[9px] font-black text-primary uppercase">{t.topic}</div>
                                    <div className="text-[8px] text-muted-foreground space-y-0.5">
                                        <div>Duration: {durationStr}</div>
                                        <div>
                                            {formatTime(t.start)} – {formatTime(t.end)}
                                        </div>
                                    </div>
                                    <div className="text-[7px] text-muted-foreground/70 pt-1 border-t border-white/10">
                                        Click to jump to topic start
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                {items.map((t, i) => {
                    const isActive = i === activeIdx;
                    return (
                        <button
                            key={i}
                            onClick={() => onSeek(t.start)}
                            className="flex items-center gap-1.5 group"
                            title={`Jump to: ${t.topic} (${formatTime(t.start)})`}
                        >
                            <span
                                className="w-2 h-2 rounded-full shrink-0 transition-transform group-hover:scale-125"
                                style={{
                                    backgroundColor: t.color || colors[i % colors.length],
                                    boxShadow: isActive ? `0 0 6px ${t.color || colors[i % colors.length]}` : undefined,
                                }}
                            />
                            <span
                                className={`text-[8px] font-medium truncate max-w-[80px] ${
                                    isActive ? "text-foreground font-bold" : "text-muted-foreground/70 group-hover:text-muted-foreground"
                                }`}
                            >
                                {t.topic}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
