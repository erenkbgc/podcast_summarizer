"use client";

import { useRef, useEffect, useState } from "react";
import {
    Play,
    Pause,
    SkipBack,
    SkipForward,
    Volume2,
    Maximize2,
    ChevronUp
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import type WaveSurfer from "wavesurfer.js";

interface AudioPlayerProps {
    episodeTitle: string;
    showName: string;
    imageUrl?: string;
    audioUrl: string;
    episodeId?: string | number;
    chapters?: { timestamp: number; title?: string }[];
    currentTime: number;
    duration: number;
    isPlaying: boolean;
    onPlayPause: () => void;
    onSeek: (time: number) => void;
    onTimeUpdate: (time: number) => void;
    onDurationChange: (duration: number) => void;
}

export function PremiumAudioPlayer({
    episodeTitle,
    showName,
    imageUrl,
    audioUrl,
    episodeId,
    chapters = [],
    currentTime,
    duration,
    isPlaying,
    onPlayPause,
    onSeek,
    onTimeUpdate,
    onDurationChange
}: AudioPlayerProps) {
    const waveContainerRef = useRef<HTMLDivElement>(null);
    const wavesurfer = useRef<WaveSurfer | null>(null);
    const [volume, setVolume] = useState(0.8);
    const [playbackRate, setPlaybackRate] = useState(1);
    const [showSpeedMenu, setShowSpeedMenu] = useState(false);
    const [isWaveReady, setIsWaveReady] = useState(false);
    const [tooltipTime, setTooltipTime] = useState<number | null>(null);
    const [tooltipX, setTooltipX] = useState(0);
    const lastSyncTime = useRef(currentTime);
    const lastSaveTime = useRef(0);
    const [resumePosition, setResumePosition] = useState<number | null>(null);

    const storageKey = episodeId ? `podai_pos_${episodeId}` : null;

    // Keep latest callbacks in refs so the WaveSurfer instance is created
    // exactly once per audioUrl. Parent components recreate these handlers on
    // every render; putting them in the effect deps used to destroy and
    // re-create the player every second, breaking playback and transcript sync.
    const callbacksRef = useRef({ onTimeUpdate, onDurationChange, onSeek });
    useEffect(() => {
        callbacksRef.current = { onTimeUpdate, onDurationChange, onSeek };
    });

    // Handle waveform hover tooltip
    const handleWaveHover = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!waveContainerRef.current || duration <= 0) return;
        
        const rect = waveContainerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percentage = Math.max(0, Math.min(1, x / rect.width));
        const time = percentage * duration;
        
        setTooltipTime(time);
        setTooltipX(percentage * 100);
    };

    const handleWaveLeave = () => {
        setTooltipTime(null);
    };

    // Initialize WaveSurfer (lazy-loaded, once per audio source)
    useEffect(() => {
        if (!waveContainerRef.current) return;
        let cancelled = false;
        setIsWaveReady(false);
        lastSyncTime.current = 0;

        const initWaveSurfer = async () => {
            const WaveSurferModule = await import("wavesurfer.js");
            if (cancelled || !waveContainerRef.current) return;
            const WaveSurfer = WaveSurferModule.default;

            const ws = WaveSurfer.create({
                container: waveContainerRef.current,
                waveColor: "rgba(255, 255, 255, 0.1)",
                progressColor: "#3E5BFF",
                cursorColor: "#3E5BFF",
                barWidth: 2,
                barRadius: 3,
                height: 40,
                barGap: 3,
                url: audioUrl,
            });
            wavesurfer.current = ws;

            ws.on("timeupdate", (time) => {
                if (Math.abs(time - lastSyncTime.current) >= 0.4) {
                    callbacksRef.current.onTimeUpdate(time);
                    lastSyncTime.current = time;
                }
                // Save position to localStorage every 5s
                if (storageKey && time > 10) {
                    const now = Date.now();
                    if (now - lastSaveTime.current > 5000) {
                        lastSaveTime.current = now;
                        localStorage.setItem(storageKey, String(time));
                    }
                }
            });

            ws.on("ready", (dur) => {
                setIsWaveReady(true);
                callbacksRef.current.onDurationChange(dur);
                // Check for saved position
                if (storageKey) {
                    const saved = parseFloat(localStorage.getItem(storageKey) || "0");
                    if (saved > 10 && saved < dur - 5) {
                        setResumePosition(saved);
                    }
                }
            });

            ws.on("interaction", (newTime) => {
                callbacksRef.current.onSeek(newTime);
            });
        };

        initWaveSurfer();

        return () => {
            cancelled = true;
            wavesurfer.current?.destroy();
            wavesurfer.current = null;
        };
    }, [audioUrl]);

    // Sync isPlaying (only once the waveform is ready, so play() can't race init)
    useEffect(() => {
        if (!wavesurfer.current || !isWaveReady) return;
        if (isPlaying) {
            wavesurfer.current.play();
        } else {
            wavesurfer.current.pause();
        }
    }, [isPlaying, isWaveReady]);

    // Sync volume
    useEffect(() => {
        wavesurfer.current?.setVolume(volume);
    }, [volume]);

    // Sync playback rate
    useEffect(() => {
        if (wavesurfer.current) {
            wavesurfer.current.setPlaybackRate(playbackRate);
        }
    }, [playbackRate]);

    // Sync currentTime (External Seek)
    useEffect(() => {
        if (wavesurfer.current && Math.abs(wavesurfer.current.getCurrentTime() - currentTime) > 1) {
            wavesurfer.current.setTime(currentTime);
        }
    }, [currentTime]);

    const handleResume = () => {
        if (resumePosition !== null && wavesurfer.current && duration > 0) {
            wavesurfer.current.setTime(resumePosition);
            onSeek(resumePosition);
        }
        setResumePosition(null);
    };

    const handleDismissResume = () => {
        setResumePosition(null);
        if (storageKey) localStorage.removeItem(storageKey);
    };

    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

    return (
        <div className="shrink-0 border-t border-border bg-card/40 backdrop-blur-2xl print:hidden">
            <AnimatePresence>
                {resumePosition !== null && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="flex items-center justify-between px-6 py-2 bg-primary/10 border-b border-primary/20">
                            <span className="text-xs font-bold text-primary/90">
                                Resume from {formatTime(resumePosition)}?
                            </span>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={handleResume}
                                    className="px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-lg bg-primary text-black hover:bg-primary/80 transition-all"
                                >
                                    Resume
                                </button>
                                <button
                                    onClick={handleDismissResume}
                                    className="px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-lg border border-white/10 text-muted-foreground hover:text-white transition-all"
                                >
                                    Start over
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
            <div className="px-4 py-3">
            <motion.div
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="max-w-5xl mx-auto flex items-center gap-6"
            >
                {/* Episode Info */}
                <div className="flex items-center gap-4 w-72 shrink-0 overflow-hidden">
                    {imageUrl && (
                        <img src={imageUrl} alt="" className="w-14 h-14 rounded-xl object-cover shadow-2xl border border-white/10" />
                    )}
                    <div className="min-w-0">
                        <h4 className="text-sm font-black truncate text-white tracking-tight">{episodeTitle}</h4>
                        <p className="text-[10px] font-black uppercase tracking-widest text-primary/80 truncate mt-1">{showName}</p>
                    </div>
                </div>

                {/* Main Control Area */}
                <div className="flex-1 flex flex-col gap-2">
                    <div className="flex items-center justify-center gap-8 mb-1">
                        <button
                            onClick={() => onSeek(currentTime - 15)}
                            className="p-2 hover:bg-white/10 rounded-xl text-muted-foreground hover:text-white transition-all transform active:scale-90"
                        >
                            <SkipBack size={20} />
                        </button>
                        <button
                            onClick={onPlayPause}
                            className="w-14 h-14 bg-white text-black rounded-2xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-[0_0_30px_rgba(255,255,255,0.3)]"
                        >
                            {isPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} className="ml-1" fill="currentColor" />}
                        </button>
                        <button
                            onClick={() => onSeek(currentTime + 15)}
                            className="p-2 hover:bg-white/10 rounded-xl text-muted-foreground hover:text-white transition-all transform active:scale-90"
                        >
                            <SkipForward size={20} />
                        </button>
                    </div>

                    <div className="flex items-center gap-4">
                        <span className="text-[10px] font-mono font-black text-muted-foreground w-12 text-right opacity-50">
                            {formatTime(currentTime)}
                        </span>

                        <div className="flex-1 relative h-10 flex items-center">
                            <div 
                                ref={waveContainerRef} 
                                className="w-full relative"
                                onMouseMove={handleWaveHover}
                                onMouseLeave={handleWaveLeave}
                            />
                            
                            {/* Waveform Hover Tooltip */}
                            {tooltipTime !== null && (
                                <div
                                    className="absolute bottom-full mb-2 bg-black/95 border border-white/10 px-2 py-1 rounded-lg text-[9px] font-mono font-black text-primary pointer-events-none whitespace-nowrap z-50"
                                    style={{ left: `${tooltipX}%`, transform: 'translateX(-50%)' }}
                                >
                                    {formatTime(tooltipTime)}
                                </div>
                            )}
                            
                            {duration > 0 && chapters.length > 0 && (
                                <div className="absolute inset-x-0 top-0 h-full pointer-events-none">
                                    {chapters.map((ch, idx) => {
                                        const left = Math.min(100, Math.max(0, (ch.timestamp / duration) * 100));
                                        return (
                                            <button
                                                key={`${ch.timestamp}-${idx}`}
                                                onClick={() => onSeek(ch.timestamp)}
                                                className="absolute top-0 h-full w-1.5 bg-primary/40 hover:bg-primary transition-colors pointer-events-auto"
                                                style={{ left: `${left}%` }}
                                                title={ch.title ? `${ch.title} • ${formatTime(ch.timestamp)}` : formatTime(ch.timestamp)}
                                            />
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <span className="text-[10px] font-mono font-black text-muted-foreground w-12 opacity-50">
                            {formatTime(duration)}
                        </span>
                    </div>
                </div>

                {/* Extra Actions */}
                <div className="flex items-center gap-4 w-48 justify-end pr-2">
                    <div className="relative">
                        <button
                            onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                            className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg border border-white/10 bg-white/5 text-muted-foreground hover:text-white hover:bg-white/10 transition-all"
                        >
                            {playbackRate}x
                        </button>
                        {showSpeedMenu && (
                            <div className="absolute right-0 bottom-full mb-2 w-28 max-h-40 overflow-y-auto rounded-xl border border-white/10 bg-black/90 backdrop-blur-xl shadow-2xl z-50">
                                {[0.75, 1, 1.25, 1.5, 2].map((rate) => (
                                    <button
                                        key={rate}
                                        onClick={() => {
                                            setPlaybackRate(rate);
                                            setShowSpeedMenu(false);
                                        }}
                                        className={cn(
                                            "w-full text-left px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-all",
                                            playbackRate === rate
                                                ? "bg-white text-black"
                                                : "text-muted-foreground hover:text-white hover:bg-white/10"
                                        )}
                                    >
                                        {rate}x
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-3">
                        <Volume2 size={18} className="text-muted-foreground" />
                        <div className="w-20 h-1.5 bg-white/10 rounded-full cursor-pointer relative group">
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.01"
                                value={volume}
                                onChange={(e) => setVolume(parseFloat(e.target.value))}
                                className="absolute inset-0 w-full opacity-0 cursor-pointer z-10"
                            />
                            <div
                                className="absolute inset-y-0 left-0 bg-white/40 rounded-full group-hover:bg-primary transition-colors"
                                style={{ width: `${volume * 100}%` }}
                            />
                        </div>
                    </div>
                    <button className="p-2 hover:bg-white/10 rounded-xl text-muted-foreground hover:text-white transition-colors">
                        <Maximize2 size={18} />
                    </button>
                </div>
            </motion.div>
            </div>
        </div>
    );
}

function formatTime(seconds: number) {
    if (isNaN(seconds)) return "0:00";
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hrs > 0) {
        return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${mins}:${secs.toString().padStart(2, "0")}`;
}
