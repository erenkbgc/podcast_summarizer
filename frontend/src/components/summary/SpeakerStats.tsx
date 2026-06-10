"use client";

import { Users } from "lucide-react";
import { Cell, Pie, PieChart as RePieChart, ResponsiveContainer, Tooltip as ReTooltip } from "recharts";

export function SpeakerStats({
    speakerEntries,
    speakerColors,
    t,
}: {
    speakerEntries: [string, number][];
    speakerColors: string[];
    t: (key: string, params?: unknown) => string;
}) {
    if (speakerEntries.length === 0) return null;

    return (
        <div className="p-8 rounded-[32px] bg-secondary/5 border border-white/5 space-y-6">
            <div className="flex items-center gap-3">
                <Users size={18} className="text-primary" />
                <h3 className="text-xs font-black uppercase tracking-widest">{t("voiceDistribution")}</h3>
                {speakerEntries[0][1] >= 60 && (
                    <span className="ml-auto text-[9px] uppercase tracking-widest text-primary/70 border border-primary/20 px-2 py-0.5 rounded-full">
                        Dominant Speaker
                    </span>
                )}
            </div>
            <div className="h-64 relative">
                <ResponsiveContainer width="100%" height="100%">
                    <RePieChart>
                        <Pie
                            data={speakerEntries.map(([name, value], i) => ({ name, value, color: speakerColors[i % speakerColors.length] }))}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                        >
                            {speakerEntries.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={speakerColors[index % speakerColors.length]} stroke="none" />
                            ))}
                        </Pie>
                        <ReTooltip
                            contentStyle={{ backgroundColor: "#09090b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", fontSize: "10px" }}
                            itemStyle={{ color: "#fff" }}
                        />
                    </RePieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-[10px] font-black text-muted-foreground uppercase">{t("speakers")}</span>
                    <span className="text-lg font-black text-foreground">{speakerEntries.length}</span>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
                {speakerEntries.map(([name, pct], i) => (
                    <div key={name} className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: speakerColors[i % speakerColors.length] }} />
                        <span className="text-[10px] font-bold truncate max-w-[80px]">{name}</span>
                        <span className="text-[10px] text-muted-foreground ml-auto">{pct.toFixed(0)}%</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
