import React from 'react';
import { motion } from 'framer-motion';
import { Ban, RefreshCw } from 'lucide-react';
import { Card, CardColor } from '../types/game';

interface UnoCardProps {
  card?: Card;
  faceDown?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  playable?: boolean;
  dimmed?: boolean;
  highlighted?: boolean;
  badgeText?: string;
  onClick?: () => void;
  className?: string;
}

const COLOR_STYLES: Record<CardColor, { bg: string; badge: string }> = {
  red: {
    bg: 'bg-gradient-to-br from-rose-500 via-red-600 to-red-700',
    badge: 'bg-red-500',
  },
  yellow: {
    bg: 'bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-500',
    badge: 'bg-amber-400',
  },
  green: {
    bg: 'bg-gradient-to-br from-emerald-400 via-green-600 to-emerald-700',
    badge: 'bg-emerald-500',
  },
  blue: {
    bg: 'bg-gradient-to-br from-sky-400 via-blue-600 to-indigo-700',
    badge: 'bg-blue-500',
  },
};

const SIZE_CLASSES: Record<NonNullable<UnoCardProps['size']>, string> = {
  xs: 'w-12 h-[4.5rem] rounded-lg p-1',
  sm: 'w-16 h-24 rounded-xl p-1',
  md: 'w-22 h-32 sm:w-24 sm:h-36 rounded-2xl p-1.5',
  lg: 'w-26 h-38 sm:w-28 sm:h-42 rounded-2xl p-1.5',
};

const CENTER_FONT: Record<NonNullable<UnoCardProps['size']>, string> = {
  xs: 'text-xl',
  sm: 'text-3xl',
  md: 'text-5xl',
  lg: 'text-6xl',
};

const CORNER_FONT: Record<NonNullable<UnoCardProps['size']>, string> = {
  xs: 'text-[9px]',
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
};

function DrawTwoGraphic({
  size,
  double = false,
}: {
  size: NonNullable<UnoCardProps['size']>;
  double?: boolean;
}) {
  const scale = size === 'xs' ? 'scale-50' : size === 'sm' ? 'scale-70' : 'scale-95';
  if (double) {
    return (
      <div className={`relative flex items-center justify-center ${scale} w-14 h-14`}>
        <div className="w-5 h-7 rounded bg-white border border-slate-900/25 shadow -rotate-12 -translate-x-3 translate-y-2 absolute" />
        <div className="w-5 h-7 rounded bg-white border border-slate-900/25 shadow -rotate-6 -translate-x-1 translate-y-0.5 absolute" />
        <div className="w-5 h-7 rounded bg-white border border-slate-900/25 shadow rotate-6 translate-x-1.5 -translate-y-0.5 absolute" />
        <div className="w-5 h-7 rounded bg-white border border-slate-900/25 shadow rotate-12 translate-x-3.5 -translate-y-2 absolute" />
      </div>
    );
  }
  return (
    <div className={`relative flex items-center justify-center ${scale} w-12 h-12`}>
      <div className="w-6 h-9 rounded-md bg-white border-2 border-slate-900/20 shadow-md -rotate-12 -translate-x-1.5 translate-y-1" />
      <div className="w-6 h-9 rounded-md bg-white border-2 border-slate-900/25 shadow-lg rotate-6 translate-x-1.5 -translate-y-1 absolute" />
    </div>
  );
}

export const UnoCard: React.FC<UnoCardProps> = ({
  card,
  faceDown = false,
  size = 'md',
  playable = false,
  dimmed = false,
  highlighted = false,
  badgeText,
  onClick,
  className = '',
}) => {
  const interactive = Boolean(onClick && (playable || faceDown));

  if (faceDown || !card) {
    return (
      <motion.button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        whileHover={onClick ? { y: -4, scale: 1.04 } : undefined}
        whileTap={onClick ? { scale: 0.96 } : undefined}
        className={`relative select-none ${SIZE_CLASSES[size]} bg-gradient-to-br from-amber-400 via-orange-400 to-amber-500 shadow-xl border border-amber-200/60 flex items-center justify-center ${
          onClick ? 'cursor-pointer' : 'cursor-default'
        } ${highlighted ? 'ring-4 ring-amber-300 shadow-amber-400/50' : ''} ${
          dimmed ? 'opacity-50' : ''
        } ${className}`}
        aria-label="Kartu tertutup UNO ZERO"
      >
        <div className="w-full h-full rounded-[inherit] bg-slate-950 flex items-center justify-center overflow-hidden relative border border-white/10">
          <div className="w-[88%] h-[68%] rounded-[50%] bg-gradient-to-br from-red-600 via-orange-500 to-amber-500 -rotate-24 flex flex-col items-center justify-center shadow-inner border-2 border-white/80">
            <span
              className={`font-display font-black italic tracking-tight text-white card-text-shadow leading-none ${
                size === 'xs'
                  ? 'text-[9px]'
                  : size === 'sm'
                  ? 'text-xs'
                  : size === 'md'
                  ? 'text-base sm:text-lg'
                  : 'text-xl'
              }`}
            >
              UNO
            </span>
            <span
              className={`font-display font-black italic tracking-tight text-amber-200 card-text-shadow leading-none ${
                size === 'xs'
                  ? 'text-[8px]'
                  : size === 'sm'
                  ? 'text-[10px]'
                  : size === 'md'
                  ? 'text-sm sm:text-base'
                  : 'text-lg'
              }`}
            >
              ZERO
            </span>
          </div>
        </div>
        {badgeText && (
          <span className="absolute -top-2 -right-2 z-20 px-1.5 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[9px] font-black shadow-md">
            {badgeText}
          </span>
        )}
      </motion.button>
    );
  }

  const colorStyle = COLOR_STYLES[card.color];

  const cornerText =
    card.type === 'number'
      ? String(card.value)
      : card.type === 'skip'
      ? '⊘'
      : card.type === 'reverse'
      ? '⇄'
      : card.type === 'draw2'
      ? '+2'
      : '+2×2';

  const needsUnderline = card.type === 'number' && (card.value === 6 || card.value === 9);

  return (
    <motion.button
      type="button"
      onClick={interactive ? onClick : undefined}
      disabled={!interactive}
      whileHover={interactive ? { y: -6, scale: 1.04 } : undefined}
      whileTap={interactive ? { scale: 0.96 } : undefined}
      className={`relative select-none ${SIZE_CLASSES[size]} bg-white shadow-xl transition-all duration-150 ${
        interactive
          ? `cursor-pointer ring-3 ${
              highlighted
                ? 'ring-amber-300 shadow-amber-400/50'
                : 'ring-white/90 hover:ring-amber-300'
            } shadow-2xl`
          : 'cursor-default'
      } ${dimmed ? 'opacity-50 saturate-75 brightness-90' : ''} ${className}`}
      aria-label={`Kartu ${card.type} ${card.color} ${card.value ?? ''}`}
    >
      <div
        className={`relative w-full h-full rounded-[inherit] overflow-hidden flex items-center justify-center ${colorStyle.bg}`}
      >
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-black/20 via-transparent to-white/25" />

        <div className="pointer-events-none absolute w-[88%] h-[70%] rounded-[50%] -rotate-24 border-2 bg-white/18 border-white/70" />

        {/* Top-left corner */}
        <div
          className={`absolute top-1 left-1.5 font-display font-black italic leading-none text-white card-corner-shadow ${CORNER_FONT[size]}`}
        >
          {cornerText}
        </div>

        {/* Bottom-right inverted corner */}
        <div
          className={`absolute bottom-1 right-1.5 font-display font-black italic leading-none text-white card-corner-shadow rotate-180 ${CORNER_FONT[size]}`}
        >
          {cornerText}
        </div>

        {/* Center symbol */}
        <div className="relative z-10 flex flex-col items-center justify-center">
          {card.type === 'number' && (
            <div className="flex flex-col items-center">
              <span
                className={`font-display font-black italic text-white card-text-shadow leading-none ${CENTER_FONT[size]}`}
              >
                {card.value}
              </span>
              {needsUnderline && (
                <span className="mt-0.5 block w-5 h-1 rounded-full bg-white shadow" />
              )}
            </div>
          )}

          {card.type === 'skip' && (
            <div className="flex flex-col items-center gap-0.5">
              <Ban
                className={`text-white drop-shadow-[0_3px_4px_rgba(0,0,0,0.4)] ${
                  size === 'xs' ? 'w-5 h-5' : size === 'sm' ? 'w-6 h-6' : 'w-10 h-10'
                }`}
                strokeWidth={2.75}
              />
              {size !== 'xs' && size !== 'sm' && (
                <span className="text-[9px] font-display font-extrabold tracking-widest uppercase text-white card-corner-shadow">
                  SKIP
                </span>
              )}
            </div>
          )}

          {card.type === 'reverse' && (
            <div className="flex flex-col items-center gap-0.5">
              <RefreshCw
                className={`text-white drop-shadow-[0_3px_4px_rgba(0,0,0,0.4)] ${
                  size === 'xs' ? 'w-5 h-5' : size === 'sm' ? 'w-6 h-6' : 'w-10 h-10'
                }`}
                strokeWidth={2.75}
              />
              {size !== 'xs' && size !== 'sm' && (
                <span className="text-[9px] font-display font-extrabold tracking-widest uppercase text-white card-corner-shadow">
                  REVERSE
                </span>
              )}
            </div>
          )}

          {card.type === 'draw2' && (
            <div className="flex flex-col items-center">
              <DrawTwoGraphic size={size} />
              {size !== 'xs' && size !== 'sm' && (
                <span className="text-[9px] font-display font-black tracking-wider uppercase text-white card-corner-shadow">
                  DRAW 2
                </span>
              )}
            </div>
          )}

          {card.type === 'double_draw2' && (
            <div className="flex flex-col items-center">
              <DrawTwoGraphic size={size} double />
              {size !== 'xs' && size !== 'sm' && (
                <span className="text-[8px] font-display font-black tracking-tight uppercase text-white card-corner-shadow leading-tight text-center">
                  DOUBLE +2
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {badgeText && (
        <span className="absolute -top-2 -right-2 z-20 px-1.5 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[9px] font-black shadow-md">
          {badgeText}
        </span>
      )}
    </motion.button>
  );
};
