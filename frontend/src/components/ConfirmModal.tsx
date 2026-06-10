"use client";

import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title?: string;
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: "destructive" | "primary";
}

export function ConfirmModal({
    isOpen,
    onClose,
    onConfirm,
    title = "Are you sure?",
    message = "This action cannot be undone.",
    confirmLabel = "Delete",
    cancelLabel = "Cancel",
    variant = "destructive"
}: ConfirmModalProps) {
    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                    />

                    {/* Modal Content */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        className="relative w-full max-w-md bg-[#0A0A0A] border border-white/10 rounded-[2rem] overflow-hidden shadow-2xl shadow-black/50"
                    >
                        {/* Header Glow */}
                        <div className={cn(
                            "absolute top-0 inset-x-0 h-1",
                            variant === "destructive" ? "bg-red-500" : "bg-primary"
                        )} />

                        <div className="p-8 space-y-6 text-center">
                            <div className={cn(
                                "w-16 h-16 rounded-3xl mx-auto flex items-center justify-center border",
                                variant === "destructive"
                                    ? "bg-red-500/10 border-red-500/20 text-red-500"
                                    : "bg-primary/10 border-primary/20 text-primary"
                            )}>
                                <AlertCircle size={32} />
                            </div>

                            <div className="space-y-2">
                                <h3 className="text-2xl font-black font-heading uppercase tracking-tight text-white">
                                    {title}
                                </h3>
                                <p className="text-muted-foreground text-sm font-medium px-4">
                                    {message}
                                </p>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-3 pt-4">
                                <button
                                    onClick={onClose}
                                    className="flex-1 px-6 py-4 rounded-2xl bg-white/5 border border-white/10 text-white font-bold hover:bg-white/10 transition-colors"
                                >
                                    {cancelLabel}
                                </button>
                                <button
                                    onClick={() => {
                                        onConfirm();
                                        onClose();
                                    }}
                                    className={cn(
                                        "flex-1 px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-sm transition-all shadow-xl",
                                        variant === "destructive"
                                            ? "bg-red-600 text-white hover:bg-red-500 shadow-red-900/20"
                                            : "bg-primary text-white hover:opacity-90 shadow-primary/20"
                                    )}
                                >
                                    {confirmLabel}
                                </button>
                            </div>
                        </div>

                        <button
                            onClick={onClose}
                            className="absolute top-4 right-4 p-2 text-muted-foreground hover:text-white transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
