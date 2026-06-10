"use client";

import { cn } from "@/lib/utils";

export function SummaryHeader({
    title,
    page,
    setPage,
    page1,
    page2,
    page3,
}: {
    title: string;
    page: 1 | 2 | 3;
    setPage: (page: 1 | 2 | 3) => void;
    page1: string;
    page2: string;
    page3: string;
}) {
    return (
        <div className="sticky top-0 z-50 flex items-center justify-center py-4 bg-gradient-to-b from-background via-background to-transparent">
            <div className="flex items-center gap-4 bg-secondary/80 backdrop-blur-xl px-6 py-3 rounded-full border border-white/10 shadow-2xl">
                <div className="text-[10px] font-black uppercase tracking-widest text-primary mr-4 hidden md:block">{title}</div>

                <div className="flex items-center gap-2">
                    {[1, 2, 3].map((p) => (
                        <button
                            key={p}
                            onClick={() => setPage(p as 1 | 2 | 3)}
                            className={cn(
                                "px-4 py-2 rounded-xl text-xs font-bold transition-all",
                                page === p ? "bg-primary text-white shadow-lg shadow-primary/40 scale-105" : "text-muted-foreground hover:text-white hover:bg-white/5"
                            )}
                        >
                            {p === 1 ? page1 : p === 2 ? page2 : page3}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
