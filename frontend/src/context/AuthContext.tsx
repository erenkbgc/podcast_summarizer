"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface User {
    id: string;
    username: string;
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    refreshToken: string | null;
    login: (token: string, refreshToken: string, user: User) => void;
    logout: () => void;
    isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(() => {
        if (typeof window !== 'undefined') {
            const u = localStorage.getItem('podai_user');
            try { return u ? JSON.parse(u) : null; } catch { return null; }
        }
        return null;
    });
    const [token, setToken] = useState<string | null>(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('podai_token');
        }
        return null;
    });
    const [refreshToken, setRefreshToken] = useState<string | null>(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('podai_refresh_token');
        }
        return null;
    });
    const [isLoading] = useState(false);
    const router = useRouter();

    useEffect(() => {
        const handleAuthExpired = () => {
            setToken(null);
            setRefreshToken(null);
            setUser(null);
            localStorage.removeItem('podai_token');
            localStorage.removeItem('podai_refresh_token');
            localStorage.removeItem('podai_user');
            localStorage.removeItem('podai_user_id');
            router.push('/login');
        };

        window.addEventListener('podai:auth-expired', handleAuthExpired);
        return () => window.removeEventListener('podai:auth-expired', handleAuthExpired);
    }, [router]);

    const login = (newToken: string, newRefreshToken: string, newUser: User) => {
        setToken(newToken);
        setRefreshToken(newRefreshToken);
        setUser(newUser);
        localStorage.setItem('podai_token', newToken);
        localStorage.setItem('podai_refresh_token', newRefreshToken);
        localStorage.setItem('podai_user', JSON.stringify(newUser));
        // Also set the legacy ID for compatibility if needed
        localStorage.setItem('podai_user_id', newUser.id);
        router.push('/');
    };

    const logout = () => {
        setToken(null);
        setRefreshToken(null);
        setUser(null);
        localStorage.removeItem('podai_token');
        localStorage.removeItem('podai_refresh_token');
        localStorage.removeItem('podai_user');
        localStorage.removeItem('podai_user_id');
        router.push('/login');
    };

    return (
        <AuthContext.Provider value={{ user, token, refreshToken, login, logout, isLoading }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
