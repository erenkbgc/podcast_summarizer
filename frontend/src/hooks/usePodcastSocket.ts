import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';

interface WebSocketMessage {
    episode_id: number;
    user_id: string;
    status: string;
    progress: number;
}

const WS_CLOSE_CODES = {
    AUTH_INVALID: 4001,
    FORBIDDEN: 4003,
    NORMAL: 4000,
} as const;

const MAX_RETRIES = 10;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30_000;

export function usePodcastSocket(episodeId: string | number) {
    const { token, user } = useAuth();
    const [status, setStatus] = useState<string>('pending');
    const [progress, setProgress] = useState<number>(0);
    const [isConnected, setIsConnected] = useState(false);
    const [connectionError, setConnectionError] = useState<string | null>(null);

    const socketRef = useRef<WebSocket | null>(null);
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const retryCountRef = useRef(0);

    const connectRef = useRef<() => void>(() => {});

    const getWsUrl = useCallback(() => {
        const base = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000/ws/status';
        return base.replace(/([^:]\/)\/+/g, '$1');
    }, []);

    const connect = useCallback(() => {
        const accessToken = token || (typeof window !== 'undefined' ? localStorage.getItem('podai_token') : null);
        if (!episodeId || !user?.id || !accessToken) return;

        if (socketRef.current && socketRef.current.readyState !== WebSocket.CLOSED) return;

        const params = new URLSearchParams({ token: accessToken, user_id: user.id });
        const url = `${getWsUrl()}/${episodeId}?${params.toString()}`;

        try {
            const ws = new WebSocket(url);

            ws.onopen = () => {
                setIsConnected(true);
                setConnectionError(null);
                retryCountRef.current = 0;
            };

            ws.onmessage = (event) => {
                try {
                    const data: WebSocketMessage = JSON.parse(event.data);
                    if (String(data.episode_id) === String(episodeId)) {
                        setStatus(data.status);
                        if (typeof data.progress === 'number') {
                            setProgress(data.progress);
                        }
                    }
                } catch {
                    // malformed message — ignore
                }
            };

            ws.onclose = (event) => {
                setIsConnected(false);

                const isAuthError = (
                    event.code === WS_CLOSE_CODES.AUTH_INVALID ||
                    event.code === WS_CLOSE_CODES.FORBIDDEN ||
                    event.code === WS_CLOSE_CODES.NORMAL
                );

                if (isAuthError) {
                    setConnectionError('Authentication error. Please log in again.');
                    return;
                }

                const attempt = retryCountRef.current;
                if (attempt >= MAX_RETRIES) {
                    setConnectionError('Unable to connect after multiple attempts. Please refresh.');
                    return;
                }

                const delay = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
                retryCountRef.current += 1;

                reconnectTimerRef.current = setTimeout(() => {
                    if (socketRef.current?.readyState === WebSocket.CLOSED) {
                        connectRef.current();
                    }
                }, delay);
            };

            ws.onerror = () => {
                // Errors are handled by onclose which always fires afterward
            };

            socketRef.current = ws;
        } catch (err) {
            console.error('[PodAI] Failed to create WebSocket:', err);
        }
    }, [episodeId, token, user, getWsUrl]);

    // Keep connectRef up to date with the latest connect function
    useEffect(() => {
        connectRef.current = connect;
    }, [connect]);

    useEffect(() => {
        retryCountRef.current = 0;
        connect();
        return () => {
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
            socketRef.current?.close();
        };
    }, [connect]);

    return { status, progress, isConnected, connectionError };
}
