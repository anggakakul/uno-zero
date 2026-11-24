import React from 'react';
import { motion } from 'framer-motion';
import {
  BookOpen,
  Bot,
  Globe,
  Info,
  RotateCcw,
  Settings,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react';
import { UnoCard } from '../components/UnoCard';
import { Card } from '../types/game';

interface HomePageProps {
  hasSavedGame: boolean;
  onPlayAI: () => void;
  onPlayOnline: () => void;
  onPlayLocal: () => void;
  onResumeGame: () => void;
  onLeaderboard: () => void;
  onHowToPlay: () => void;
  onSettings: () => void;
  onAbout: () => void;
}

const SHOWCASE_CARDS: Card[] = [
  { id: 's1', type: 'number', color: 'red', value: 0 },
  { id: 's2', type: 'draw2', color: 'blue' },
  { id: 's3', type: 'double_draw2', color: 'yellow' },
  { id: 's4', type: 'reverse', color: 'green' },
  { id: 's5', type: 'skip', color: 'red' },
];

export const HomePage: React.FC<HomePageProps> = ({
  hasSavedGame,
  onPlayAI,
  onPlayOnline,
  onPlayLocal,
  onResumeGame,
  onLeaderboard,
  onHowToPlay,
  onSettings,
  onAbout,
}) => {
  return (
    <div className="min-h-screen table-felt flex flex-col items-center justify-center px-4 py-10 relative overflow-hidden">
      <div className="pointer-events-none absolute -top-32 -left-24 w-80 h-80 rounded-full bg-red-600/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-24 w-80 h-80 rounded-full bg-emerald-500/20 blur-3xl" />
      <div className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full bg-amber-500/10 blur-3xl" />

      <div className="relative z-10 w-full max-w-lg flex flex-col items-center text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="flex items-center justify-center -space-x-6 sm:-space-x-5 mb-7 pt-2"
        >
          {SHOWCASE_CARDS.map((card, i) => {
            const angles = [-18, -9, 0, 9, 18];
            const yOffsets = [16, 4, -6, 4, 16];
            return (
              <motion.div
                key={card.id}
                initial={{ rotate: 0, y: 30, opacity: 0 }}
                animate={{ rotate: angles[i], y: yOffsets[i], opacity: 1 }}
                transition={{ delay: i * 0.06, type: 'spring', stiffness: 180 }}
                style={{ zIndex: i === 2 ? 10 : i }}
              >
                <UnoCard card={card} size="sm" />
              </motion.div>
            );
          })}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15 }}
          className="space-y-2 mb-7"
        >
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/15 border border-amber-400/35 text-amber-300 text-xs font-bold tracking-wider uppercase">
            <Sparkles className="w-3.5 h-3.5" />
            Golf 2×3 • 112 Kartu (0–6) • 9 Ronde
          </div>
          <h1 className="font-display text-5xl sm:text-6xl font-black italic tracking-tight text-white drop-shadow-[0_6px_20px_rgba(0,0,0,0.6)]">
            UNO{' '}
            <span className="bg-gradient-to-r from-amber-300 via-orange-400 to-rose-500 bg-clip-text text-transparent">
              ZERO
            </span>
          </h1>
          <p className="text-slate-300 text-sm sm:text-base max-w-sm mx-auto">
            Main lawan <strong>Bot AI Cerdas</strong>, <strong>Multiplayer Online</strong>, atau
            bersama teman di satu perangkat!
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="w-full space-y-2.5"
        >
          <button
            type="button"
            onClick={onPlayAI}
            className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 hover:from-amber-300 hover:to-rose-400 text-slate-950 font-display font-black text-lg tracking-wide shadow-2xl shadow-orange-500/30 flex items-center justify-center gap-2.5 cursor-pointer transition active:scale-[0.98]"
          >
            <Bot className="w-6 h-6" />
            SINGLE-PLAYER (VS AI BOT)
          </button>

          <button
            type="button"
            onClick={onPlayOnline}
            className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-display font-black text-base tracking-wide shadow-xl shadow-sky-600/25 flex items-center justify-center gap-2.5 cursor-pointer transition active:scale-[0.98]"
          >
            <Globe className="w-5 h-5" />
            MULTIPLAYER ONLINE (ROOM 2–8 PEMAIN)
          </button>

          <button
            type="button"
            onClick={onPlayLocal}
            className="w-full py-3.5 px-6 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-slate-100 font-display font-bold text-base flex items-center justify-center gap-2 cursor-pointer transition active:scale-[0.98]"
          >
            <Users className="w-5 h-5 text-emerald-400" />
            MAIN LOKAL (2–8 PEMAIN)
          </button>

          {hasSavedGame && (
            <button
              type="button"
              onClick={onResumeGame}
              className="w-full py-3 px-6 rounded-2xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-200 font-display font-bold text-sm flex items-center justify-center gap-2 cursor-pointer transition"
            >
              <RotateCcw className="w-4 h-4" />
              LANJUTKAN PERMAINAN TERSIMPAN
            </button>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
            <button
              type="button"
              onClick={onLeaderboard}
              className="py-3 px-3 rounded-2xl bg-amber-400/15 hover:bg-amber-400/25 border border-amber-400/40 text-amber-200 font-display font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 cursor-pointer transition"
            >
              <Trophy className="w-4 h-4 text-amber-400" />
              Leaderboard
            </button>
            <button
              type="button"
              onClick={onHowToPlay}
              className="py-3 px-3 rounded-2xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700/80 text-slate-100 font-display font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 cursor-pointer transition"
            >
              <BookOpen className="w-4 h-4 text-sky-400" />
              Panduan
            </button>
            <button
              type="button"
              onClick={onSettings}
              className="py-3 px-3 rounded-2xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700/80 text-slate-100 font-display font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 cursor-pointer transition"
            >
              <Settings className="w-4 h-4 text-amber-400" />
              Settings
            </button>
            <button
              type="button"
              onClick={onAbout}
              className="py-3 px-3 rounded-2xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700/80 text-slate-100 font-display font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 cursor-pointer transition"
            >
              <Info className="w-4 h-4 text-emerald-400" />
              About
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
};
