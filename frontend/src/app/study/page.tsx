"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getKnowledgeOverview } from "@/lib/api";
import { Sidebar } from "@/components/Sidebar";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { GraduationCap, Check, X, Zap, Brain, ChevronRight, Trophy } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface Card {
  id: string;
  front: string;
  back: string;
  episodeId: number;
  episodeTitle: string;
  kind: "term" | "takeaway";
}

interface SrsState { ease: number; interval: number; due: number; reps: number; }
type SrsMap = Record<string, SrsState>;

const SRS_KEY = "podai_srs_v1";
const DAY = 86400000;

function loadSrs(): SrsMap {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(SRS_KEY) || "{}"); } catch { return {}; }
}
function saveSrs(m: SrsMap) {
  try { localStorage.setItem(SRS_KEY, JSON.stringify(m)); } catch {}
}

// SM-2-lite: grade 0=Again, 1=Good, 2=Easy
function schedule(prev: SrsState | undefined, grade: number): SrsState {
  let ease = prev?.ease ?? 2.5;
  let interval = prev?.interval ?? 0;
  const reps = (prev?.reps ?? 0) + 1;
  if (grade === 0) { interval = 0; ease = Math.max(1.3, ease - 0.2); }
  else if (grade === 1) { interval = interval === 0 ? 1 : Math.round(interval * ease); }
  else { ease += 0.15; interval = interval === 0 ? 2 : Math.round(interval * ease * 1.3); }
  return { ease, interval, due: Date.now() + interval * DAY, reps };
}

export default function StudyPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [srs, setSrs] = useState<SrsMap>({});
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [doneCount, setDoneCount] = useState(0);

  useEffect(() => { if (!authLoading && !user) router.push("/login"); }, [user, authLoading, router]);
  useEffect(() => { setSrs(loadSrs()); }, []);

  const { data: overview } = useQuery({
    queryKey: ["knowledge-overview"],
    queryFn: () => getKnowledgeOverview().then((r) => r.data),
    enabled: !!user,
  });

  const allCards: Card[] = useMemo(() => {
    if (!overview) return [];
    const cards: Card[] = [];
    for (const ep of overview) {
      (ep.glossary || []).forEach((g, i) =>
        cards.push({ id: `t:${ep.episode_id}:${i}:${g.term}`, front: g.term, back: g.definition, episodeId: ep.episode_id, episodeTitle: ep.title, kind: "term" })
      );
      (ep.key_takeaways || []).forEach((tk, i) =>
        cards.push({ id: `k:${ep.episode_id}:${i}`, front: `Key takeaway from “${ep.title}”?`, back: tk, episodeId: ep.episode_id, episodeTitle: ep.title, kind: "takeaway" })
      );
    }
    return cards;
  }, [overview]);

  // Due queue: cards whose due <= now (new cards have no state => due immediately)
  const dueCards = useMemo(() => {
    const now = Date.now();
    return allCards.filter((c) => (srs[c.id]?.due ?? 0) <= now);
  }, [allCards, srs]);

  const grade = (g: number) => {
    const card = dueCards[idx];
    if (!card) return;
    const next = { ...srs, [card.id]: schedule(srs[card.id], g) };
    setSrs(next);
    saveSrs(next);
    setFlipped(false);
    setDoneCount((d) => d + 1);
    if (idx + 1 >= dueCards.length) setIdx(0); else setIdx((i) => i + 1);
  };

  if (authLoading || !user) return null;

  const card = dueCards[idx];
  const totalCards = allCards.length;
  const masteredCount = allCards.filter((c) => (srs[c.id]?.reps ?? 0) > 0 && (srs[c.id]?.interval ?? 0) >= 4).length;

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-border bg-card/30 backdrop-blur-md flex items-center justify-between px-8 shrink-0">
          <div className="flex items-center gap-3">
            <GraduationCap size={18} className="text-primary" />
            <div>
              <h1 className="font-heading font-bold text-sm tracking-tight">Study Deck</h1>
              <p className="text-[10px] font-medium text-muted-foreground">Spaced-repetition flashcards from your episodes</p>
            </div>
          </div>
          <div className="flex items-center gap-5 text-xs">
            <div className="flex items-center gap-1.5 text-muted-foreground"><Brain size={13} /> {totalCards} cards</div>
            <div className="flex items-center gap-1.5 text-amber-400"><Zap size={13} /> {dueCards.length} due</div>
            <div className="flex items-center gap-1.5 text-emerald-400"><Trophy size={13} /> {masteredCount} mastered</div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto flex items-center justify-center p-8">
          {totalCards === 0 ? (
            <div className="text-center space-y-4 opacity-60">
              <GraduationCap size={56} className="mx-auto" />
              <h2 className="text-xl font-bold font-heading">No cards yet</h2>
              <p className="text-sm max-w-xs">Process episodes (and generate knowledge) to build your study deck.</p>
              <Link href="/" className="inline-block text-primary text-sm hover:underline">Add a podcast →</Link>
            </div>
          ) : !card ? (
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center space-y-4">
              <div className="inline-flex w-20 h-20 rounded-3xl bg-emerald-500/10 items-center justify-center"><Check className="w-10 h-10 text-emerald-400" /></div>
              <h2 className="text-2xl font-black font-heading">All caught up! 🎉</h2>
              <p className="text-muted-foreground text-sm">You reviewed {doneCount} card{doneCount === 1 ? "" : "s"} this session. Come back later for more.</p>
            </motion.div>
          ) : (
            <div className="w-full max-w-2xl space-y-6">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
                <span>{idx + 1} / {dueCards.length} due</span>
                <Link href={`/episode/${card.episodeId}`} className="hover:text-primary truncate max-w-[260px]">{card.episodeTitle}</Link>
              </div>

              <AnimatePresence mode="wait">
                <motion.button
                  key={card.id}
                  initial={{ rotateY: 90, opacity: 0 }}
                  animate={{ rotateY: 0, opacity: 1 }}
                  exit={{ rotateY: -90, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  onClick={() => setFlipped((f) => !f)}
                  className="w-full min-h-[280px] rounded-3xl border border-border bg-card p-10 flex flex-col items-center justify-center text-center gap-4 hover:border-primary/40 transition-colors"
                >
                  <span className={`text-[9px] font-black uppercase tracking-[0.25em] ${card.kind === "term" ? "text-primary" : "text-amber-400"}`}>
                    {flipped ? "Answer" : card.kind === "term" ? "Term" : "Recall"}
                  </span>
                  <p className={`font-heading ${flipped ? "text-lg font-medium leading-relaxed text-foreground/90" : "text-2xl font-bold"}`}>
                    {flipped ? card.back : card.front}
                  </p>
                  {!flipped && <span className="text-[11px] text-muted-foreground mt-2">click to reveal</span>}
                </motion.button>
              </AnimatePresence>

              {flipped ? (
                <div className="grid grid-cols-3 gap-3">
                  <button onClick={() => grade(0)} className="py-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 font-bold text-sm hover:bg-rose-500/20 transition-all flex items-center justify-center gap-2"><X size={15} /> Again</button>
                  <button onClick={() => grade(1)} className="py-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 font-bold text-sm hover:bg-amber-500/20 transition-all flex items-center justify-center gap-2"><Check size={15} /> Good</button>
                  <button onClick={() => grade(2)} className="py-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-bold text-sm hover:bg-emerald-500/20 transition-all flex items-center justify-center gap-2"><Zap size={15} /> Easy</button>
                </div>
              ) : (
                <button onClick={() => setFlipped(true)} className="w-full py-3 rounded-2xl bg-primary text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-primary/90 transition-all">
                  Reveal Answer <ChevronRight size={16} />
                </button>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
