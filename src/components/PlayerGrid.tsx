import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Eye, EyeOff, Sparkles } from 'lucide-react';
import { GridColumn, SlotPosition } from '../types/game';
import { UnoCard } from './UnoCard';

interface PlayerGridProps {
  columns: GridColumn[];
  eliminatedCount?: number;
  cardSize?: 'xs' | 'sm' | 'md';
  interactionMode: 'none' | 'flip_face_down' | 'swap_any';
  onSelectSlot?: (columnIndex: number, position: SlotPosition) => void;
}

/**
 * Dynamic compacted 2xN grid with:
 * - True 3D Flip (rotateY 180deg) when cards reveal
 * - Smooth slide & swap transitions
 * - Golden-emerald flash burst when a vertical column is eliminated
 * - Auto-scaling responsive card sizes so 2x4 or 2x5 fits mobile portrait & landscape without clipping/scrolling
 */
export const PlayerGrid: React.FC<PlayerGridProps> = ({
  columns,
  eliminatedCount = 0,
  cardSize = 'md',
  interactionMode,
  onSelectSlot,
}) => {
  const prevElimRef = useRef(eliminatedCount);
  const [flashMatch, setFlashMatch] = useState(false);

  useEffect(() => {
    if (eliminatedCount > prevElimRef.current) {
      setFlashMatch(true);
      const t = setTimeout(() => setFlashMatch(false), 900);
      prevElimRef.current = eliminatedCount;
      return () => clearTimeout(t);
    }
    prevElimRef.current = eliminatedCount;
  }, [eliminatedCount]);

  // Responsive auto-sizing: if grid widens to 4 or 5+ columns on mobile, scale down cleanly so it fits without scroll!
  const colCount = columns.length;
  const effectiveSize: 'xs' | 'sm' | 'md' =
    cardSize === 'xs'
      ? 'xs'
      : colCount >= 5
      ? 'xs'
      : colCount === 4 && cardSize === 'md'
      ? 'sm'
      : cardSize;

  const renderSlot = (col: GridColumn, colIdx: number, pos: SlotPosition) => {
    const slot = col[pos];
    if (!slot) return null;

    const canClick =
      interactionMode === 'swap_any' ||
      (interactionMode === 'flip_face_down' && !slot.faceUp);

    const badge =
      interactionMode === 'flip_face_down' && !slot.faceUp
        ? 'BUKA'
        : interactionMode === 'swap_any'
        ? 'TUKAR'
        : undefined;

    const isRevealed = Boolean(slot.faceUp && slot.card);

    return (
      <div
        key={`${col.id}-${pos}`}
        className="relative flex flex-col items-center perspective-1000"
      >
        {/* 3D Flip & Swap Container */}
        <motion.div
          key={slot.card?.id ?? `hidden-${col.id}-${pos}`}
          initial={{ y: -12, opacity: 0.75, scale: 0.94 }}
          animate={{
            y: 0,
            opacity: 1,
            scale: 1,
            rotateY: isRevealed ? 0 : 180,
          }}
          transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          className="preserve-3d relative"
        >
          {/* Front Face (Revealed Card) */}
          <div className="backface-hidden">
            {isRevealed && slot.card ? (
              <UnoCard
                card={slot.card}
                size={effectiveSize}
                playable={canClick}
                highlighted={canClick}
                dimmed={interactionMode === 'flip_face_down' && slot.faceUp}
                badgeText={badge}
                onClick={canClick && onSelectSlot ? () => onSelectSlot(colIdx, pos) : undefined}
              />
            ) : (
              /* Invisible placeholder to maintain exact dimensions when face-down */
              <div className="opacity-0 pointer-events-none">
                <UnoCard faceDown size={effectiveSize} />
              </div>
            )}
          </div>

          {/* Back Face (Face-Down Card, rotated 180deg) */}
          <div className="backface-hidden rotate-y-180 absolute inset-0">
            <UnoCard
              faceDown
              size={effectiveSize}
              playable={canClick}
              highlighted={canClick}
              badgeText={badge}
              onClick={canClick && onSelectSlot ? () => onSelectSlot(colIdx, pos) : undefined}
            />
          </div>
        </motion.div>

        {effectiveSize !== 'xs' && (
          <span
            className={`mt-1 inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider ${
              slot.faceUp ? 'text-emerald-300' : 'text-slate-400'
            }`}
          >
            {slot.faceUp ? (
              <>
                <Eye className="w-2.5 h-2.5" />
                Terbuka
              </>
            ) : (
              <>
                <EyeOff className="w-2.5 h-2.5" />
                Tertutup
              </>
            )}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="relative flex flex-col items-center gap-2 w-full">
      {/* Column Match Sparkle Flash Overlay */}
      <AnimatePresence>
        {flashMatch && (
          <motion.div
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1.08 }}
            exit={{ opacity: 0, scale: 1.3 }}
            transition={{ duration: 0.45 }}
            className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center"
          >
            <div className="px-5 py-2.5 rounded-full bg-gradient-to-r from-emerald-400 via-teal-300 to-amber-300 text-slate-950 font-display font-black text-sm sm:text-base shadow-[0_0_40px_rgba(52,211,153,0.85)] flex items-center gap-2">
              <Sparkles className="w-5 h-5" />
              KOLOM COCOK! 0 POIN!
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {eliminatedCount > 0 && (
        <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/40 text-emerald-300 text-[11px] font-bold">
          <CheckCircle2 className="w-3.5 h-3.5" />
          {eliminatedCount} Kolom Tereliminasi (0 Poin)
        </div>
      )}

      {columns.length === 0 ? (
        <div className="py-5 px-7 rounded-2xl border-2 border-dashed border-emerald-400/50 bg-emerald-500/10 text-emerald-300 font-display font-black text-sm flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5" />
          Seluruh Grid Tereliminasi — 0 Poin!
        </div>
      ) : (
        <div className="flex items-center justify-center gap-1.5 sm:gap-3 py-1 px-1 w-full flex-nowrap">
          <AnimatePresence mode="popLayout">
            {columns.map((col, colIdx) => (
              <motion.div
                key={col.id}
                layout
                initial={{ opacity: 0, scale: 0.8, x: 24 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.4, y: -24 }}
                transition={{ type: 'spring', stiffness: 280, damping: 22 }}
                className="flex flex-col items-center gap-1.5 sm:gap-2 p-1 sm:p-1.5 rounded-2xl bg-slate-950/45 border border-emerald-400/15 shadow-inner"
              >
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                  K{colIdx + 1}
                </span>
                {renderSlot(col, colIdx, 'top')}
                {renderSlot(col, colIdx, 'bottom')}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};
