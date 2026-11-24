import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Ban, CheckCircle2, Columns3, RefreshCw, Sparkles } from 'lucide-react';
import { ActionEvent } from '../types/game';

interface ActionOverlayBannerProps {
  event: ActionEvent | null;
}

const HIGHLIGHT_TYPES = new Set<ActionEvent['type']>([
  'skip',
  'reverse',
  'draw2',
  'double_draw2',
  'column_match',
  'uno_call',
  'uno_penalty',
]);

export const ActionOverlayBanner: React.FC<ActionOverlayBannerProps> = ({ event }) => {
  const [visibleEvent, setVisibleEvent] = useState<ActionEvent | null>(null);

  useEffect(() => {
    if (!event || !HIGHLIGHT_TYPES.has(event.type)) return;
    setVisibleEvent(event);
    const t = setTimeout(() => setVisibleEvent(null), 1450);
    return () => clearTimeout(t);
  }, [event?.id]);

  const getVisual = (type: ActionEvent['type']) => {
    switch (type) {
      case 'skip':
        return {
          title: 'SKIP!',
          bg: 'from-rose-600 to-red-700 border-rose-300',
          icon: <Ban className="w-9 h-9 text-white" strokeWidth={2.75} />,
        };
      case 'reverse':
        return {
          title: 'REVERSE!',
          bg: 'from-indigo-600 to-violet-700 border-indigo-300',
          icon: (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 0.7, ease: 'easeInOut' }}
            >
              <RefreshCw className="w-9 h-9 text-white" strokeWidth={2.75} />
            </motion.div>
          ),
        };
      case 'draw2':
        return {
          title: 'DRAW TWO! (+1 KOLOM)',
          bg: 'from-amber-400 to-orange-500 border-amber-200 text-slate-950',
          icon: <Columns3 className="w-9 h-9 text-slate-950" strokeWidth={2.5} />,
        };
      case 'double_draw2':
        return {
          title: 'DOUBLE DRAW TWO!',
          bg: 'from-orange-500 to-rose-600 border-amber-200',
          icon: <Columns3 className="w-9 h-9 text-white" strokeWidth={2.5} />,
        };
      case 'column_match':
        return {
          title: 'KOLOM TERELIMINASI!',
          bg: 'from-emerald-400 to-teal-500 border-emerald-200 text-slate-950',
          icon: <CheckCircle2 className="w-9 h-9 text-slate-950" strokeWidth={2.75} />,
        };
      case 'uno_call':
        return {
          title: 'UNO!',
          bg: 'from-amber-300 via-orange-400 to-rose-500 border-white text-slate-950',
          icon: <Sparkles className="w-9 h-9 text-slate-950" strokeWidth={2.75} />,
        };
      case 'uno_penalty':
        return {
          title: 'TERTANGKAP! (+2 KARTU)',
          bg: 'from-red-600 to-rose-700 border-rose-300',
          icon: <AlertTriangle className="w-9 h-9 text-white" strokeWidth={2.75} />,
        };
      default:
        return null;
    }
  };

  return (
    <AnimatePresence>
      {visibleEvent && (() => {
        const visual = getVisual(visibleEvent.type);
        if (!visual) return null;
        return (
          <motion.div
            key={visibleEvent.id}
            initial={{ opacity: 0, scale: 0.65, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: -16 }}
            transition={{ type: 'spring', stiffness: 320, damping: 22 }}
            className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center px-4"
          >
            <div
              className={`max-w-sm w-full rounded-3xl bg-gradient-to-br border-2 px-6 py-4 shadow-[0_20px_60px_rgba(0,0,0,0.65)] flex flex-col items-center text-center gap-1.5 ${visual.bg}`}
            >
              {visual.icon}
              <h3 className="font-display font-black text-2xl tracking-tight leading-none">
                {visual.title}
              </h3>
              <p className="text-xs sm:text-sm font-semibold opacity-90 leading-snug">
                {visibleEvent.message}
              </p>
            </div>
          </motion.div>
        );
      })()}
    </AnimatePresence>
  );
};
