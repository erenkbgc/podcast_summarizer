"use client";

export function InsightCard({ index, text }: { index: number; text: string }) {
    return (
        <div className="flex gap-3 p-4 rounded-2xl bg-secondary/10 border border-white/5">
            <div className="w-5 h-5 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-[9px] font-black text-primary">{index + 1}</span>
            </div>
            <p className="text-[13px] leading-relaxed text-foreground/85">{text}</p>
        </div>
    );
}
