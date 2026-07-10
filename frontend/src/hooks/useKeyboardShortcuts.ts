"use client";

import { useEffect } from "react";

interface KeyboardShortcutsOptions {
    onPlayPause?: () => void;
    onSkipBack?: () => void;
    onSkipForward?: () => void;
    enabled?: boolean;
}

export function useKeyboardShortcuts({ onPlayPause, onSkipBack, onSkipForward, enabled = true }: KeyboardShortcutsOptions) {
    useEffect(() => {
        if (!enabled) return;

        const handler = (e: KeyboardEvent) => {
            // Skip if focus is in an input/textarea/contenteditable
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

            switch (e.key) {
                case ' ':
                    e.preventDefault();
                    onPlayPause?.();
                    break;
                case 'ArrowLeft':
                case 'j':
                    e.preventDefault();
                    onSkipBack?.();
                    break;
                case 'ArrowRight':
                case 'l':
                    e.preventDefault();
                    onSkipForward?.();
                    break;
            }
        };

        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onPlayPause, onSkipBack, onSkipForward, enabled]);
}
