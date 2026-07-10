"use client";

import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { IntelligencePanel } from '@/components/IntelligencePanel';
import { PremiumAudioPlayer } from '@/components/PremiumAudioPlayer';
import { SummaryDashboard } from '@/components/summary/SummaryDashboard';
import api, { Episode, Transcript, Summary, Chapter, QuizQuestion, REQUEST_TIMEOUTS } from '@/lib/api';
import {
    ArrowLeft,
    Sparkles,
    Download,
    ChevronDown,
    Share2,
    Check,
} from 'lucide-react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';

import { usePodcastSocket } from '@/hooks/usePodcastSocket';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

export default function EpisodeWorkspace() {
    const { id } = useParams();
    const searchParams = useSearchParams();
    const { token, user } = useAuth();
    const router = useRouter();

    const [episode, setEpisode] = useState<Episode | null>(null);
    const [transcript, setTranscript] = useState<Transcript | null>(null);
    const [summary, setSummary] = useState<Summary | null>(null);
    const [chapters, setChapters] = useState<Chapter[]>([]);
    const [quizzes, setQuizzes] = useState<QuizQuestion[]>([]);

    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);

    const [error, setError] = useState<string | null>(null);
    const [showExport, setShowExport] = useState(false);
    const [persona, setPersona] = useState<'default' | 'investor' | 'skeptic'>('default');
    const [copied, setCopied] = useState(false);
    const pieceInFlight = useRef<Record<string, boolean>>({});
    // Guards the one-time "final" refetch after completion; without it, each
    // setState below re-runs the incremental-fetch effect and force-refetches forever.
    const didFinalRefetch = useRef(false);

    // Real-time updates
    const { status: wsStatus, progress: wsProgress, isConnected } = usePodcastSocket(id ? id as string : '');

    // Derived status (prefer WS if active, else DB)
    const currentStatus = (isConnected && wsStatus !== 'pending') ? wsStatus : episode?.status;
    const currentProgress = (isConnected && wsProgress > 0) ? wsProgress : episode?.progress;
    const hasTranscript = Array.isArray(transcript?.segments) && transcript.segments.length > 0;
    const hasQuiz = Array.isArray(quizzes) && quizzes.length > 0;

    useEffect(() => {
        if (!token && typeof window !== 'undefined' && !localStorage.getItem('podai_token')) {
            router.push('/login');
        }
    }, [token, router]);

    useEffect(() => {
        if (id && token) {
            fetchData();
        }
    }, [id, token]);

    useEffect(() => {
        if (!id || !token || isConnected || ['completed', 'failed'].includes(currentStatus || '')) {
            return;
        }

        const interval = setInterval(() => {
            fetchData();
        }, 5000);

        return () => clearInterval(interval);
    }, [id, token, isConnected, currentStatus]);

    // Re-fetch the summary once when persona changes
    useEffect(() => {
        didFinalRefetch.current = false;
    }, [persona]);

    // Incremental Data Fetching based on status
    useEffect(() => {
        if (!id || !token) return;

        const finalRefetch = currentStatus === 'completed' && !didFinalRefetch.current;
        if (finalRefetch) didFinalRefetch.current = true;

        const fetchPiece = async (key: string, url: string, setter: (data: any) => void) => {
            if (pieceInFlight.current[key]) return;
            pieceInFlight.current[key] = true;
            try {
                const res = await api.get(url, { timeout: REQUEST_TIMEOUTS.long });
                setter(res.data);
            } catch (e) {
                console.warn(`Failed to fetch ${url}`, e);
            } finally {
                pieceInFlight.current[key] = false;
            }
        };

        // 1. Transcript ready? (Once summarizing starts, transcript is in DB)
        // Status order: downloading -> transcribing -> identifying_speakers -> translating -> summarizing
        if ([
            'summarizing',
            'extracting_chapters',
            'generating_insights',
            'indexing',
            'completed'
        ].includes(currentStatus || '')) {
            // Re-fetch transcript once on completion to ensure we have the final version
            if (!hasTranscript || finalRefetch) {
                fetchPiece('transcript', `/v1/episodes/${id}/transcript`, (data) => {
                    if (Array.isArray(data?.segments) && data.segments.length > 0) {
                        setTranscript(data);
                    }
                });
            }
        }

        // 2. Summary & Action Items ready?
        // Usually ready after 'extracting_chapters' starts
        if (!summary && [
            'generating_insights',
            'indexing',
            'completed'
        ].includes(currentStatus || '')) {
            fetchPiece('summary', `/v1/episodes/${id}/summary${persona === 'default' ? '' : `?persona=${persona}`}`, (data) => {
                if (data) setSummary(data);
            });
        }

        // 3. Chapters ready?
        if (chapters.length === 0 && [
            'generating_insights',
            'indexing',
            'completed'
        ].includes(currentStatus || '')) {
            fetchPiece('chapters', `/v1/episodes/${id}/chapters`, (data) => {
                if (Array.isArray(data) && data.length > 0) {
                    setChapters(data);
                }
            });
        }

        // 4. Everything ready? Re-fetch once on completion to be sure.
        if (['indexing', 'completed'].includes(currentStatus || '')) {
            if (!summary || finalRefetch) fetchPiece('summary', `/v1/episodes/${id}/summary${persona === 'default' ? '' : `?persona=${persona}`}`, (data) => {
                if (data) setSummary(data);
            });
            if (!hasQuiz || finalRefetch) fetchPiece('quiz', `/v1/episodes/${id}/quiz`, (data) => {
                if (Array.isArray(data) && data.length > 0) {
                    setQuizzes(data);
                }
            });
            if (chapters.length === 0 || finalRefetch) fetchPiece('chapters', `/v1/episodes/${id}/chapters`, (data) => {
                if (Array.isArray(data) && data.length > 0) {
                    setChapters(data);
                }
            });
        }

    }, [currentStatus, id, token, hasTranscript, summary, chapters, hasQuiz, persona]);

    useEffect(() => {
        const t = searchParams.get('t');
        if (t) {
            const parsed = Number(t);
            if (!Number.isNaN(parsed)) {
                handleSeek(parsed);
            }
        }
    }, [searchParams]);

    const fetchData = async () => {
        try {
            setError(null);
            const epRes = await api.get(`/v1/episodes/${id}`, { timeout: REQUEST_TIMEOUTS.long });
            setEpisode(epRes.data);
        } catch (err: any) {
            console.error('Failed to load episode', err);
            if (err.response?.status === 404) {
                setError('Episode not found');
            } else {
                setError('Failed to load episode');
            }
        }
    };

    const handleSeek = (time: number) => {
        setCurrentTime(time);
        setIsPlaying(true);
    };

    useKeyboardShortcuts({
        onPlayPause: () => setIsPlaying(p => !p),
        onSkipBack: () => handleSeek(Math.max(0, currentTime - 15)),
        onSkipForward: () => handleSeek(currentTime + 15),
        enabled: !!episode,
    });

    const formatTime = (seconds: number) => {
        if (isNaN(seconds)) return "0:00";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, "0")}`;
    };

    const downloadFile = (filename: string, content: string, type: string) => {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    };

    const buildMarkdownExport = () => {
        const lines: string[] = [];
        lines.push(`# ${episode?.title || "Episode"}`);
        lines.push(`Show: ${episode?.show_name || "Unknown"}`);
        lines.push("");
        if (summary?.executive_brief) {
            lines.push("## Executive Brief");
            lines.push(summary.executive_brief);
            lines.push("");
        }
        if (summary?.global_summary) {
            lines.push("## Summary");
            lines.push(summary.global_summary);
            lines.push("");
        }
        if (Array.isArray(summary?.key_takeaways) && summary?.key_takeaways.length) {
            lines.push("## Key Takeaways");
            summary.key_takeaways.forEach((k) => lines.push(`- ${k}`));
            lines.push("");
        }
        if (Array.isArray(summary?.action_items) && summary?.action_items.length) {
            lines.push("## Action Items");
            summary.action_items.forEach((a) => lines.push(`- ${a}`));
            lines.push("");
        }
        if (Array.isArray(chapters) && chapters.length) {
            lines.push("## Chapters");
            chapters.forEach((c) => {
                const range = c.end_timestamp ? `${formatTime(c.timestamp)}-${formatTime(c.end_timestamp)}` : formatTime(c.timestamp);
                lines.push(`- [${range}] ${c.title}${c.summary ? ` — ${c.summary}` : ""}`);
            });
            lines.push("");
        }
        return lines.join("\n");
    };

    const buildTranscriptExport = () => {
        const segments = transcript?.segments || [];
        const lines: string[] = [];
        segments.forEach((s: any) => {
            const speaker = s.speaker ? `${s.speaker}: ` : "";
            lines.push(`[${formatTime(s.start)}] ${speaker}${s.text}`);
        });
        return lines.join("\n");
    };

    const buildJsonExport = () => {
        return JSON.stringify(
            {
                episode,
                summary,
                chapters,
                transcript
            },
            null,
            2
        );
    };

    if (error) return (
        <div className="h-screen bg-background flex flex-col items-center justify-center space-y-4">
            <h2 className="text-2xl font-bold font-heading">{error}</h2>
            <Link href="/" className="px-6 py-2 bg-primary text-white rounded-xl font-bold">
                Back to Library
            </Link>
        </div>
    );

    if (!episode) return <div className="h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>;


    return (
        <div className="flex h-screen bg-background text-foreground overflow-hidden">
            <Sidebar />

            <motion.main
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex-1 flex flex-col min-w-0 overflow-hidden relative"
            >
                {/* Workspace Header */}
                <header className="h-16 border-b border-border bg-card/30 backdrop-blur-md flex items-center justify-between px-8 z-10 shrink-0">
                    <div className="flex items-center gap-6">
                        <Link href="/library" className="p-2 hover:bg-secondary rounded-full transition-colors text-muted-foreground hover:text-foreground">
                            <ArrowLeft size={18} />
                        </Link>
                        <div className="flex flex-col">
                            <h1 className="font-heading font-bold text-sm tracking-tight truncate max-w-[400px]">
                                {episode.title}
                            </h1>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black uppercase tracking-widest text-primary">Intelligence Workspace</span>
                                <span className="w-1 h-1 rounded-full bg-border" />
                                <span className="text-[10px] font-medium text-muted-foreground">{episode.show_name}</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="hidden lg:flex items-center gap-1.5 bg-secondary/50 px-3 py-1.5 rounded-full border border-border">
                            <Sparkles size={14} className="text-primary" />
                            <span className="text-xs font-bold tracking-tight">AI Optimized</span>
                        </div>
                        {/* Share button */}
                        <button
                            onClick={() => {
                                const url = `${window.location.origin}/episode/${id}?t=${Math.floor(currentTime)}`;
                                navigator.clipboard.writeText(url).then(() => {
                                    setCopied(true);
                                    setTimeout(() => setCopied(false), 2000);
                                });
                            }}
                            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-secondary/30 text-xs font-bold hover:bg-secondary/60 transition-all"
                            title="Copy link with current timestamp"
                        >
                            {copied ? <Check size={14} className="text-green-400" /> : <Share2 size={14} />}
                            {copied ? 'Copied!' : 'Share'}
                        </button>
                        <div className="relative">
                            <button
                                onClick={() => setShowExport(!showExport)}
                                className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-secondary/30 text-xs font-bold hover:bg-secondary/60 transition-all"
                            >
                                <Download size={14} />
                                Export
                                <ChevronDown size={12} />
                            </button>
                            {showExport && (
                                <div className="absolute right-0 mt-2 w-52 rounded-xl border border-border bg-card shadow-2xl overflow-hidden z-50">
                                    <button
                                        onClick={() => {
                                            downloadFile(`summary-${episode.id}.md`, buildMarkdownExport(), "text/markdown");
                                            setShowExport(false);
                                        }}
                                        className="w-full text-left px-4 py-3 text-xs font-medium hover:bg-secondary/40"
                                    >
                                        Summary + Chapters (MD)
                                    </button>
                                    <button
                                        onClick={() => {
                                            downloadFile(`transcript-${episode.id}.txt`, buildTranscriptExport(), "text/plain");
                                            setShowExport(false);
                                        }}
                                        className="w-full text-left px-4 py-3 text-xs font-medium hover:bg-secondary/40"
                                    >
                                        Transcript (TXT)
                                    </button>
                                    <button
                                        onClick={() => {
                                            downloadFile(`episode-${episode.id}.json`, buildJsonExport(), "application/json");
                                            setShowExport(false);
                                        }}
                                        className="w-full text-left px-4 py-3 text-xs font-medium hover:bg-secondary/40"
                                    >
                                        Full Export (JSON)
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </header>

                <SummaryDashboard
                    summary={summary}
                    status={currentStatus || 'pending'}
                    progress={currentProgress || 0}
                    onSeek={handleSeek}
                    speakerMap={episode.speaker_map}
                    episodeId={episode.id}
                    currentTime={currentTime}
                />

                {summary && (
                    <PremiumAudioPlayer
                        episodeTitle={episode.title}
                        showName={episode.show_name}
                        imageUrl={episode.image_url}
                        audioUrl={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/v1/episodes/${id}/audio?token=${encodeURIComponent(token || '')}`}
                        episodeId={episode.id}
                        chapters={chapters}
                        currentTime={currentTime}
                        duration={duration}
                        isPlaying={isPlaying}
                        onPlayPause={() => setIsPlaying(!isPlaying)}
                        onSeek={handleSeek}
                        onTimeUpdate={setCurrentTime}
                        onDurationChange={setDuration}
                    />
                )}
            </motion.main>

            {/* Show Side Panel even if only transcript is ready (for incremental reading) */}
            {(summary || transcript) && (
                <IntelligencePanel
                    episode={episode}
                    transcript={transcript}
                    summary={summary}
                    chapters={chapters}
                    quizzes={quizzes}
                    currentTime={currentTime}
                    onSeek={handleSeek}
                />
            )}
        </div>
    );
}
