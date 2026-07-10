"use client";

import React from "react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis,
  Tooltip as ReTooltip, ResponsiveContainer,
} from "recharts";

const TOOLTIP_STYLE = {
  background: "#09090b",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 12,
  fontSize: 11,
} as const;

export function SpeakerPie({ data, colors }: { data: { name: string; value: number }[]; colors: string[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" innerRadius={56} outerRadius={80} paddingAngle={4} dataKey="value" isAnimationActive={false}>
          {data.map((e, i) => <Cell key={i} fill={colors[i % colors.length]} stroke="none" />)}
        </Pie>
        <ReTooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ color: "#fff" }} formatter={(v: any) => `${Number(v).toFixed(0)}%`} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function DensityArea({ data, onSeek, formatTime }: { data: { t: number; v: number }[]; onSeek: (t: number) => void; formatTime: (s: number) => string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} onClick={(e: any) => e?.activePayload && onSeek(e.activePayload[0].payload.t)}>
        <defs><linearGradient id="dens" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3E5BFF" stopOpacity={0.5} /><stop offset="100%" stopColor="#3E5BFF" stopOpacity={0} /></linearGradient></defs>
        <XAxis dataKey="t" tickFormatter={formatTime} stroke="#666" fontSize={10} />
        <YAxis hide />
        <ReTooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(l: any) => formatTime(l)} />
        <Area type="monotone" dataKey="v" stroke="#3E5BFF" strokeWidth={2} fill="url(#dens)" isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function InsightBars({ data, onSeek, formatTime }: { data: { t: number; v: number }[]; onSeek: (t: number) => void; formatTime: (s: number) => string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} onClick={(e: any) => e?.activePayload && onSeek(e.activePayload[0].payload.t)}>
        <XAxis dataKey="t" tickFormatter={formatTime} stroke="#666" fontSize={10} />
        <YAxis hide />
        <ReTooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(l: any) => formatTime(l)} />
        <Bar dataKey="v" fill="#f59e0b" radius={[3, 3, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
