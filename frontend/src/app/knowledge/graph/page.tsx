"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useRouter } from "next/navigation";
import { Loader2, Search, Network, ArrowLeft } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import Link from "next/link";

interface GraphNode {
  id: number;
  label: string;
  type: "person" | "org" | "product" | "concept";
  mentions: number;
}

interface GraphLink {
  source: number;
  target: number;
  weight: number;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
  stats?: { total_nodes: number; total_links: number };
}

const TYPE_COLORS: Record<string, string> = {
  person: "#60a5fa",
  org: "#34d399",
  product: "#f59e0b",
  concept: "#a78bfa",
};

interface SimNode extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

export default function KnowledgeGraphPage() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [hovered, setHovered] = useState<SimNode | null>(null);
  const simRef = useRef<{ nodes: SimNode[]; links: GraphLink[] }>({ nodes: [], links: [] });
  const dragRef = useRef<SimNode | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["graph-full"],
    queryFn: () => api.get("/v1/graph/full").then((r) => r.data as GraphData),
    staleTime: 5 * 60 * 1000,
  });

  const searchLower = searchTerm.toLowerCase();

  // Seed the physics simulation whenever data changes
  useEffect(() => {
    if (!data?.nodes?.length) return;
    const W = containerRef.current?.clientWidth || 900;
    const H = containerRef.current?.clientHeight || 600;
    const maxMentions = Math.max(...data.nodes.map((n) => n.mentions || 1), 1);
    simRef.current = {
      nodes: data.nodes.map((n, i) => ({
        ...n,
        x: W / 2 + Math.cos((i / data.nodes.length) * Math.PI * 2) * (120 + Math.random() * 80),
        y: H / 2 + Math.sin((i / data.nodes.length) * Math.PI * 2) * (120 + Math.random() * 80),
        vx: 0,
        vy: 0,
        r: 6 + (n.mentions / maxMentions) * 18,
      })),
      links: data.links,
    };
  }, [data]);

  // Physics + render loop (lightweight force simulation, no deps)
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      canvas.width = container.clientWidth * dpr;
      canvas.height = container.clientHeight * dpr;
      canvas.style.width = `${container.clientWidth}px`;
      canvas.style.height = `${container.clientHeight}px`;
    };
    resize();
    window.addEventListener("resize", resize);

    const byId = () => {
      const m = new Map<number, SimNode>();
      simRef.current.nodes.forEach((n) => m.set(n.id, n));
      return m;
    };

    const tick = () => {
      const { nodes, links } = simRef.current;
      const W = container.clientWidth;
      const H = container.clientHeight;
      const idMap = byId();

      // Forces
      for (const a of nodes) {
        // center gravity
        a.vx += (W / 2 - a.x) * 0.0015;
        a.vy += (H / 2 - a.y) * 0.0015;
        // pairwise repulsion
        for (const b of nodes) {
          if (a === b) continue;
          let dx = a.x - b.x;
          let dy = a.y - b.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 1) d2 = 1;
          if (d2 < 40000) {
            const f = 900 / d2;
            const d = Math.sqrt(d2);
            a.vx += (dx / d) * f;
            a.vy += (dy / d) * f;
          }
        }
      }
      // spring links
      for (const l of links) {
        const s = idMap.get(l.source as unknown as number);
        const t = idMap.get(l.target as unknown as number);
        if (!s || !t) continue;
        const dx = t.x - s.x;
        const dy = t.y - s.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const desired = 120;
        const f = (d - desired) * 0.004 * Math.min(3, l.weight || 1);
        s.vx += (dx / d) * f;
        s.vy += (dy / d) * f;
        t.vx -= (dx / d) * f;
        t.vy -= (dy / d) * f;
      }
      // integrate
      for (const n of nodes) {
        if (dragRef.current === n) { n.vx = 0; n.vy = 0; continue; }
        n.vx *= 0.85;
        n.vy *= 0.85;
        n.x += n.vx;
        n.y += n.vy;
        n.x = Math.max(n.r + 4, Math.min(W - n.r - 4, n.x));
        n.y = Math.max(n.r + 4, Math.min(H - n.r - 4, n.y));
      }

      // ---- draw ----
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      // links
      for (const l of links) {
        const s = idMap.get(l.source as unknown as number);
        const t = idMap.get(l.target as unknown as number);
        if (!s || !t) continue;
        const active =
          hovered && (hovered.id === s.id || hovered.id === t.id);
        ctx.strokeStyle = active ? "rgba(62,91,255,0.55)" : "rgba(255,255,255,0.07)";
        ctx.lineWidth = active ? 1.6 : Math.min(2.5, 0.5 + (l.weight || 1) * 0.3);
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(t.x, t.y);
        ctx.stroke();
      }

      // nodes
      for (const n of nodes) {
        const dim = searchLower && !n.label.toLowerCase().includes(searchLower);
        const color = TYPE_COLORS[n.type] || "#94a3b8";
        const isHover = hovered?.id === n.id;

        ctx.globalAlpha = dim ? 0.15 : 1;
        // glow
        if (isHover || (!dim && searchLower && n.label.toLowerCase().includes(searchLower))) {
          ctx.shadowColor = color;
          ctx.shadowBlur = 24;
        } else {
          ctx.shadowBlur = 0;
        }
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // ring
        ctx.strokeStyle = "rgba(0,0,0,0.5)";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // label for bigger / hovered nodes
        if (n.r > 12 || isHover || (searchLower && !dim)) {
          ctx.fillStyle = isHover ? "#ffffff" : "rgba(255,255,255,0.75)";
          ctx.font = `${isHover ? "bold " : ""}11px Inter, system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText(n.label, n.x, n.y - n.r - 7);
        }
        ctx.globalAlpha = 1;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    // ---- pointer interaction ----
    const nodeAt = (mx: number, my: number) =>
      simRef.current.nodes.find((n) => {
        const dx = n.x - mx;
        const dy = n.y - my;
        return dx * dx + dy * dy <= (n.r + 4) * (n.r + 4);
      }) || null;

    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      if (dragRef.current) {
        dragRef.current.x = mx;
        dragRef.current.y = my;
        return;
      }
      const n = nodeAt(mx, my);
      setHovered(n);
      canvas.style.cursor = n ? "pointer" : "default";
    };
    const onDown = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      dragRef.current = nodeAt(e.clientX - rect.left, e.clientY - rect.top);
    };
    const onUp = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const n = nodeAt(e.clientX - rect.left, e.clientY - rect.top);
      if (dragRef.current && n && dragRef.current === n) {
        const moved = Math.hypot(e.movementX, e.movementY);
        if (moved < 3) router.push(`/search?q=${encodeURIComponent(n.label)}`);
      }
      dragRef.current = null;
    };

    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mousedown", onDown);
    canvas.addEventListener("mouseup", onUp);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mousedown", onDown);
      canvas.removeEventListener("mouseup", onUp);
    };
  }, [data, hovered, searchLower, router]);

  const topEntities = useMemo(
    () =>
      (data?.nodes || [])
        .filter((n) => !searchLower || n.label.toLowerCase().includes(searchLower))
        .sort((a, b) => b.mentions - a.mentions)
        .slice(0, 8),
    [data, searchLower]
  );

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="p-6 border-b border-white/5 bg-card/30 backdrop-blur-xl shrink-0">
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <Link
                href="/knowledge"
                className="p-2 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft size={18} />
              </Link>
              <div>
                <div className="flex items-center gap-2 text-primary mb-1">
                  <Network size={16} />
                  <span className="text-[10px] font-black uppercase tracking-widest">
                    Second Brain
                  </span>
                </div>
                <h1 className="text-2xl font-black font-heading tracking-tight">
                  Knowledge Graph
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="relative w-64">
                <Search size={16} className="absolute inset-y-0 left-3 m-auto text-muted-foreground" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Highlight entities..."
                  className="w-full h-10 pl-10 pr-4 bg-secondary/20 border border-white/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                />
              </div>
              <div className="text-xs text-muted-foreground font-mono whitespace-nowrap">
                <span className="text-foreground font-bold">{data?.stats?.total_nodes ?? 0}</span> entities ·{" "}
                <span className="text-foreground font-bold">{data?.stats?.total_links ?? 0}</span> links
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="flex gap-5 mt-4">
            {Object.entries(TYPE_COLORS).map(([type, color]) => (
              <div key={type} className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {type}
                </span>
              </div>
            ))}
            <span className="text-[10px] text-muted-foreground/50 ml-auto">
              drag to move · click a node to search it
            </span>
          </div>
        </header>

        {/* Graph canvas */}
        <div className="flex-1 relative" ref={containerRef}>
          {isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : !data?.nodes?.length ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 opacity-40 text-center px-8">
              <Network size={56} />
              <h2 className="text-lg font-bold font-heading">No entities yet</h2>
              <p className="text-sm max-w-xs">
                Process a podcast and your people, organizations and concepts will appear here as a living graph.
              </p>
            </div>
          ) : (
            <>
              <canvas ref={canvasRef} className="absolute inset-0" />
              {/* Top entities overlay */}
              <div className="absolute top-4 right-4 w-56 rounded-2xl bg-black/50 backdrop-blur-xl border border-white/10 p-4 space-y-2 pointer-events-none">
                <div className="text-[9px] font-black uppercase tracking-[0.25em] text-muted-foreground">
                  Most mentioned
                </div>
                {topEntities.map((n) => (
                  <div key={n.id} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: TYPE_COLORS[n.type] || "#94a3b8" }}
                      />
                      <span className="text-xs text-foreground truncate">{n.label}</span>
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground">{n.mentions}</span>
                  </div>
                ))}
              </div>
              {hovered && (
                <div className="absolute bottom-4 left-4 rounded-xl bg-black/60 backdrop-blur-xl border border-white/10 px-4 py-2.5">
                  <div className="text-sm font-bold text-foreground">{hovered.label}</div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    {hovered.type} · {hovered.mentions} mentions · click to search
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
