"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    Library,
    Search,
    Settings,
    PlusCircle,
    BookOpen,
    Activity,
    ChevronLeft,
    ChevronRight,
    LogOut,
    Zap,
    History,
    User,
    MessageSquare,
    GraduationCap
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { motion } from "framer-motion";

export function Sidebar() {
    const pathname = usePathname();
    const [collapsed, setCollapsed] = useState(false);
    const { user, logout } = useAuth();

    const navItems = [
        { name: "Synthesize", icon: Zap, href: "/" },
        { name: "Library", icon: Library, href: "/library" },
        { name: "Ask Library", icon: MessageSquare, href: "/ask" },
        { name: "Global Search", icon: Search, href: "/search" },
        { name: "Knowledge Vault", icon: BookOpen, href: "/knowledge" },
        { name: "Study Deck", icon: GraduationCap, href: "/study" },
        { name: "Thinking History", icon: Activity, href: "/activity" },
    ];

    return (
        <aside
            className={cn(
                "h-screen flex flex-col border-r border-white/5 bg-[#0a0a0a] transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] z-50 relative",
                collapsed ? "w-[80px]" : "w-[260px]"
            )}
        >
            {/* Collapse Toggle */}
            <button
                onClick={() => setCollapsed(!collapsed)}
                className="absolute -right-3 top-20 w-6 h-6 bg-[#111] border border-white/10 rounded-full flex items-center justify-center text-gray-500 hover:text-white transition-all shadow-xl z-50 hover:scale-110"
            >
                {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
            </button>

            {/* Logo Section - Giant Zoom */}
            <div className={cn(
                "flex items-center justify-center transition-all duration-500 overflow-hidden shrink-0",
                collapsed ? "h-20" : "h-48"
            )}>
                <img
                    src="/logo.png"
                    alt="Logo"
                    className={cn(
                        "object-contain transition-all duration-500",
                        collapsed ? "w-12 h-12" : "w-64 h-auto scale-150 drop-shadow-[0_0_20px_rgba(59,130,246,0.2)]"
                    )}
                />
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-4 space-y-2 mt-4">
                {navItems.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                "flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 group relative",
                                isActive
                                    ? "text-white"
                                    : "text-gray-500 hover:text-gray-200 hover:bg-white/[0.03]"
                            )}
                        >
                            {isActive && (
                                <motion.div
                                    layoutId="nav-glow"
                                    className="absolute inset-0 bg-white/5 border border-white/10 rounded-2xl z-0"
                                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                />
                            )}
                            <item.icon size={20} className={cn(
                                "shrink-0 relative z-10 transition-transform duration-300 group-hover:scale-110",
                                isActive ? "text-blue-400" : ""
                            )} />
                            {!collapsed && (
                                <span className="text-sm font-semibold relative z-10 tracking-tight">{item.name}</span>
                            )}
                        </Link>
                    );
                })}
            </nav>

            {/* User Section */}
            <div className="p-6 mt-auto space-y-4">
                <Link
                    href="/profile"
                    className={cn(
                        "w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 group relative",
                        pathname === "/profile"
                            ? "text-white bg-blue-600/10 border border-blue-600/20"
                            : "text-gray-500 hover:text-gray-200 hover:bg-white/[0.03]"
                    )}
                >
                    <User size={20} className={cn(
                        "shrink-0 transition-transform duration-300 group-hover:scale-110",
                        pathname === "/profile" ? "text-blue-400" : ""
                    )} />
                    {!collapsed && (
                        <div className="flex flex-col">
                            <span className="text-xs font-black uppercase tracking-widest text-gray-400 group-hover:text-blue-400 transition-colors">Neural Profile</span>
                            {user && <span className="text-[10px] text-gray-600 truncate">{user.username}</span>}
                        </div>
                    )}
                </Link>

                <div className="pt-4 border-t border-white/5">

                    <button
                        onClick={logout}
                        className={cn(
                            "w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-gray-500 hover:text-red-400 hover:bg-red-400/5 transition-all group",
                            collapsed ? "justify-center" : ""
                        )}
                    >
                        <LogOut size={20} className="shrink-0 transition-transform group-hover:-translate-x-1" />
                        {!collapsed && <span className="text-sm font-bold">Sign Out</span>}
                    </button>
                </div>
            </div>
        </aside>
    );
}
