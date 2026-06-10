"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Cpu,
  ArrowRight,
  Link as LinkIcon,
  Globe,
  MessageSquare,
  Zap,
  History,
  Sparkles,
  Settings,
  ChevronDown,
  Activity
} from 'lucide-react';
import { Sidebar } from '@/components/Sidebar';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import { useRouter } from 'next/navigation';

export default function NeuralIngestHome() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [language, setLanguage] = useState('en');
  const [summaryType, setSummaryType] = useState('default');
  const [isIngesting, setIsIngesting] = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  const handleIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    setIsIngesting(true);
    try {
      const res = await api.post('/v1/episodes/ingest', {
        url,
        preferred_lang: language,
        summary_type: summaryType
      });
      router.push(`/episode/${res.data.id}`);
    } catch (error) {
      console.error('Ingestion failed', error);
    } finally {
      setIsIngesting(false);
    }
  };

  if (authLoading || !user) {
    return (
      <div className="h-screen bg-[#050505] flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full"
        />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#050505] text-white overflow-hidden">
      <Sidebar />

      <main className="flex-1 relative flex flex-col items-center justify-center px-4 overflow-hidden">
        {/* Background Glows */}
        <div className="absolute top-1/4 left-1/4 w-[30%] h-[30%] bg-blue-600/5 rounded-full blur-[100px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[30%] h-[30%] bg-purple-600/5 rounded-full blur-[100px]" />

        <div className="w-full max-w-3xl z-10 space-y-12">
          {/* Header Section */}
          <div className="text-center space-y-4">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-blue-400 text-xs font-medium"
            >
              <Sparkles size={14} />
              <span>Powered by Neural Analysis engine v2.0</span>
            </motion.div>
            <motion.h1
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="text-5xl md:text-7xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-white to-gray-400"
            >
              Neural Ingest.
            </motion.h1>
            <motion.p
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-gray-400 text-lg md:text-xl max-w-xl mx-auto"
            >
              Paste a podcast link to synthesize intelligence, extract insights, and generate custom summaries.
            </motion.p>
          </div>

          {/* Main Action Hub */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="bg-white/5 backdrop-blur-2xl border border-white/10 p-2 rounded-[2.5rem] shadow-2xl relative"
          >
            <form onSubmit={handleIngest} className="flex flex-col md:flex-row items-center gap-2">
              <div className="flex-1 relative w-full px-4">
                <LinkIcon className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="Spotify, Apple Podcast, or RSS Link..."
                  className="w-full bg-transparent py-6 pl-12 pr-4 text-lg text-white placeholder-gray-600 focus:outline-none"
                />
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                disabled={!url || isIngesting}
                className="w-full md:w-auto bg-white text-black px-10 py-5 rounded-[2rem] font-bold text-lg flex items-center justify-center gap-2 hover:bg-gray-200 transition-all disabled:opacity-30 disabled:hover:bg-white"
              >
                {isIngesting ? (
                  <div className="w-6 h-6 border-3 border-black/20 border-t-black rounded-full animate-spin" />
                ) : (
                  <>Summarize <ArrowRight size={20} /></>
                )}
              </motion.button>
            </form>
          </motion.div>

          {/* Advanced Configuration */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="flex flex-col items-center gap-6"
          >
            <button
              onClick={() => setShowOptions(!showOptions)}
              className="flex items-center gap-2 text-gray-500 hover:text-white transition-colors text-sm font-medium"
            >
              <Settings size={16} />
              <span>Advanced Synthesis Options</span>
              <ChevronDown size={16} className={`transition-transform duration-300 ${showOptions ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {showOptions && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden flex flex-wrap justify-center gap-4 py-2"
                >
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest px-2">Output Language</label>
                    <div className="flex bg-white/5 border border-white/10 rounded-2xl p-1">
                      {[
                        { id: 'en', label: 'English', icon: '/flag_icons/english.webp' },
                        { id: 'tr', label: 'Turkish', icon: '/flag_icons/turkish.png' },
                        { id: 'de', label: 'German', icon: '/flag_icons/german.webp' },
                        { id: 'es', label: 'Spanish', icon: '/flag_icons/spanish.webp' }
                      ].map(lang => (
                        <button
                          key={lang.id}
                          onClick={() => setLanguage(lang.id)}
                          className={`px-4 py-2 rounded-xl text-sm transition-all flex items-center gap-2 ${language === lang.id ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white'}`}
                        >
                          <img src={lang.icon} alt={lang.label} className="w-5 h-4 object-cover rounded-sm" /> {lang.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest px-2">Intelligence Persona</label>
                    <div className="flex bg-white/5 border border-white/10 rounded-2xl p-1">
                      {[
                        { id: 'default', label: 'Standard', icon: <MessageSquare size={14} /> },
                        { id: 'technical', label: 'Technical', icon: <Cpu size={14} /> },
                        { id: 'executive', label: 'Executive', icon: <Zap size={14} /> }
                      ].map(type => (
                        <button
                          key={type.id}
                          onClick={() => setSummaryType(type.id)}
                          className={`px-4 py-2 rounded-xl text-sm transition-all flex items-center gap-2 ${summaryType === type.id ? 'bg-white/10 text-blue-400' : 'text-gray-500 hover:text-white'}`}
                        >
                          {type.icon} {type.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>

        {/* Status Ticker (optional footer style) */}
        <div className="absolute bottom-8 left-0 right-0 flex justify-center overflow-hidden grayscale opacity-20 pointer-events-none">
          <div className="flex items-center gap-12 text-[10px] font-black uppercase tracking-[0.4em] whitespace-nowrap animate-pulse">
            <span className="flex items-center gap-2"><Globe size={12} /> Global Discovery</span>
            <span className="flex items-center gap-2"><Activity size={12} /> Real-time Synthesis</span>
            <span className="flex items-center gap-2"><Cpu size={12} /> Neural Processing</span>
          </div>
        </div>
      </main>
    </div>
  );
}
