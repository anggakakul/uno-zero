import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  Columns3,
  Info,
  RefreshCw,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { ActionEvent } from '../types/game';

interface ToastBannerProps {
  event: ActionEvent | null;
}

const STYLE_MAP: Record<ActionEvent['type'], { bg: string; icon: React.ReactNode }> = {
  skip: {
    bg: 'bg-rose-600/95 border-rose-300/60 text-white',
    icon: <Ban className="w-4 h-4 shrink-0" />,
  },
  reverse: {
    bg: 'bg-indigo-600/95 border-indigo-300/60 text-white',
    icon: <RefreshCw className="w-4 h-4 shrink-0" />,
  },
  draw2: {
    bg: 'bg-amber-500/95 border-amber-200/80 text-slate-950',
    icon: <Columns3 className="w-4 h-4 shrink-0" />,
  },
  double_draw2: {
    bg: 'bg-orange-500/95 border-amber-200 text-slate-950',
    icon: <Columns3 className="w-4 h-4 shrink-0" />,
  },
  column_match: {
    bg: 'bg-emerald-500/95 border-emerald-200 text-slate-950',
    icon: <CheckCircle2 className="w-4 h-4 shrink-0" />,
  },
  uno_call: {
    bg: 'bg-gradient-to-r from-amber-400 to-orange-500 border-amber-200 text-slate-950',
    icon: <Sparkles className="w-4 h-4 shrink-0" />,
  },
  uno_penalty: {
    bg: 'bg-red-600/95 border-red-300 text-white',
    icon: <AlertTriangle className="w-4 h-4 shrink-0" />,
  },
  round_end: {
    bg: 'bg-emerald-500/95 border-emerald-200 text-slate-950',
    icon: <Trophy className="w-4 h-4 shrink-0" />,
  },
  game_win: {
    bg: 'bg-amber-400/95 border-white text-slate-950',
    icon: <Trophy className="w-4 h-4 shrink-0" />,
  },
  timeout: {
    bg: 'bg-rose-700/95 border-rose-400 text-white',
    icon: <Clock className="w-4 h-4 shrink-0" />,
  },
  draw: {
    bg: 'bg-slate-800/95 border-slate-600 text-slate-100',
    icon: <Info className="w-4 h-4 shrink-0 text-amber-400" />,
  },
  swap: {
    bg: 'bg-slate-800/95 border-slate-600 text-slate-100',
    icon: <Info className="w-4 h-4 shrink-0 text-sky-400" />,
  },
  discard: {
    bg: 'bg-slate-800/95 border-slate-600 text-slate-100',
    icon: <Info className="w-4 h-4 shrink-0 text-rose-400" />,
  },
  flip: {
    bg: 'bg-slate-800/95 border-slate-600 text-slate-100',
    icon: <Info className="w-4 h-4 shrink-0 text-emerald-400" />,
  },
  reshuffle: {
    bg: 'bg-teal-700/95 border-teal-400/60 text-white',
    icon: <RefreshCw className="w-4 h-4 shrink-0" />,
  },
  info: {
    bg: 'bg-slate-800/95 border-slate-600 text-slate-100',
    icon: <Info className="w-4 h-4 shrink-0 text-slate-300" />,
  },
};

export const ToastBanner: React.FC<ToastBannerProps> = ({ event }) => {
  return (
    <AnimatePresence mode="wait">
      {event && (
        <motion.div
          key={event.id}
          initial={{ opacity: 0, y: -10, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.96 }}
          transition={{ duration: 0.2 }}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-2xl border shadow-lg text-xs sm:text-sm font-semibold ${STYLE_MAP[event.type].bg}`}
        >
          {STYLE_MAP[event.type].icon}
          <span className="leading-snug">{event.message}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
