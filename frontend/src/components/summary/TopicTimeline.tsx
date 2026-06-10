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
}: {
    items: TopicTransitionItem[];
    onSeek: (time: number) => void;
    formatTime: (n: number) => string;
    colors: string[];
}) {
    if (!Array.isArray(items) || items.length === 0) return null;
    const total = items[items.length - 1]?.end || 0;

    return (
        <div className="space-y-4">
            <div className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">Topic Blocks</div>
            <div className="flex h-3 w-full rounded-full overflow-hidden bg-secondary/20">
                {items.map((t, i) => {
                    const duration = t.end - t.start;
                    const width = total > 0 ? (duration / total) * 100 : 0;
                    return (
                        <div
                            key={i}
                            className="h-full relative group transition-all hover:brightness-125 cursor-pointer"
                            style={{ width: `${width}%`, backgroundColor: t.color || colors[i % colors.length] }}
                            onClick={() => onSeek(t.start)}
                        >
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 bg-black/95 border border-white/10 p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                                <div className="text-[9px] font-black text-primary uppercase">{t.topic}</div>
                                <div className="text-[8px] text-muted-foreground">
                                    {formatTime(t.start)} - {formatTime(t.end)}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
