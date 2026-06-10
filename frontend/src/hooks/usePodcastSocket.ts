import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';

interface WebSocketMessage {
    episode_id: number;
    user_id: string;
    status: string;
    progress: number;
}

export function usePodcastSocket(episodeId: string | number) {
    const { user } = useAuth();
    const [status, setStatus] = useState<string>('pending');
    const [progress, setProgress] = useState<number>(0);
    const [isConnected, setIsConnected] = useState(false);

    // Determine WS URL
    // Default to localhost:8000 if not set, but respect protocol (ws/wss)
    const getWsUrl = () => {
        const baseUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000/ws/status';
        // Ensure not double slash except protocol
        return baseUrl.replace(/([^:]\/)\/+/g, "$1");
    };

    const socketRef = useRef<WebSocket | null>(null);

    const connect = useCallback(() => {
        if (!episodeId || !user?.id) return;

        const url = `${getWsUrl()}/${episodeId}?user_id=${user.id}`;
        console.log(`[PodAI] Connecting WS to: ${url}`);

        try {
            const ws = new WebSocket(url);

            ws.onopen = () => {
                console.log(`[PodAI] WS Connected (${episodeId})`);
                setIsConnected(true);
            };

            ws.onmessage = (event) => {
                try {
                    const data: WebSocketMessage = JSON.parse(event.data);
                    // Only update if it's for this episode (though backend filters too)
                    if (String(data.episode_id) === String(episodeId)) {
                        console.log(`[PodAI] WS Update: ${data.status} ${data.progress}%`);
                        setStatus(data.status);
                        // Don't update progress if it's undefined or null
                        if (typeof data.progress === 'number') {
                            setProgress(data.progress);
                        }
                    }
                } catch (e) {
                    console.error('[PodAI] Failed to parse WS message:', e);
                }
            };

            ws.onclose = (event) => {
                console.log(`[PodAI] WS Disconnected (${episodeId}). Code: ${event.code}, Reason: ${event.reason || 'No reason'}, WasClean: ${event.wasClean}`);
                setIsConnected(false);

                // Auto-reconnect if connection was established before (not initial failure)
                if (event.code !== 4001 && event.code !== 4003 && event.code !== 4000) {
                    // Don't reconnect on auth/permission errors
                    setTimeout(() => {
                        if (socketRef.current?.readyState === WebSocket.CLOSED) {
                            console.log(`[PodAI] Attempting reconnect for ${episodeId}...`);
                            connect();
                        }
                    }, 3000); // Reconnect after 3 seconds
                }
            };

            ws.onerror = (error) => {
                // Only log error if we never connected (readyState is CONNECTING)
                if (ws.readyState === WebSocket.CONNECTING) {
                    console.error('[PodAI] WS Connection Failed:', error);
                }
                // Ignore errors after connection is established (they'll be handled by onclose)
            };

            socketRef.current = ws;
        } catch (err) {
            console.error('[PodAI] Failed to create WebSocket:', err);
        }
    }, [episodeId, user]);

    useEffect(() => {
        connect();
        return () => {
            if (socketRef.current) {
                socketRef.current.close();
            }
        };
    }, [connect]);

    return { status, progress, isConnected };
}
