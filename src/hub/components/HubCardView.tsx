import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeftRight,
  Ban,
  RefreshCw,
  Shuffle,
  Target,
  Users,
  Zap,
} from 'lucide-react';
import { getCardDisplayColor, getCardDisplayType, getCardDisplayValue } from '../engine/core';
import { getFlexColorNotches } from '../rulesets/unoFlex';
import { getLiarsColorSymbol } from '../rulesets/unoLiars';
import { getModeTheme } from '../themes/modeThemes';
import { HubCard, HubCardColor, VariantId } from '../types';
import { ColorblindSymbol, useColorblindMode } from '../utils/colorblind';

interface HubCardViewProps {
  card?: HubCard;
  variantId?: VariantId;
  faceDown?: boolean;
  flipSide?: 'light' | 'dark';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  playable?: boolean;
  dimmed?: boolean;
  selected?: boolean;
  armed?: boolean;
  onClick?: () => void;
  onSwipeUp?: () => void;
  className?: string;
}

const COLOR_GRADIENTS: Record<HubCardColor, string> = {
  red: 'bg-gradient-to-br from-rose-500 via-red-600 to-red-700',
  yellow: 'bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-500',
  green: 'bg-gradient-to-br from-emerald-400 via-green-600 to-emerald-700',
  blue: 'bg-gradient-to-br from-sky-400 via-blue-600 to-indigo-700',
  pink: 'bg-gradient-to-br from-fuchsia-400 via-pink-600 to-rose-700',
  teal: 'bg-gradient-to-br from-cyan-400 via-teal-600 to-emerald-800',
  orange: 'bg-gradient-to-br from-orange-400 via-orange-600 to-red-700',
  purple: 'bg-gradient-to-br from-violet-500 via-purple-700 to-indigo-900',
  wild: 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950',
};

const FLEX_DOT_BG: Record<HubCardColor, string> = {
  red: 'bg-red-500',
  yellow: 'bg-amber-400',
  green: 'bg-emerald-500',
  blue: 'bg-blue-500',
  pink: 'bg-pink-500',
  teal: 'bg-teal-500',
  orange: 'bg-orange-500',
  purple: 'bg-purple-600',
  wild: 'bg-gradient-to-r from-red-500 via-yellow-400 to-blue-500',
};

const SIZE_MAP = {
  xs: 'w-11 h-16 rounded-lg p-1',
  sm: 'w-16 h-24 rounded-xl p-1',
  md: 'w-20 h-30 sm:w-24 sm:h-36 rounded-2xl p-1.5',
  lg: 'w-26 h-38 sm:w-28 sm:h-42 rounded-2xl p-1.5',
};

function getCornerBadge(type: string, value?: number): string {
  if (type === 'number') return String(value ?? 0);
  const map: Record<string, string> = {
    skip: '⊘',
    skip_everyone: '⊘⊘',
    skip_two: '⊘2',
    wild_skip: '⊘',
    wild_skip_two: '⊘2',
    reverse: '⇄',
    wild_reverse: '⇄',
    flex_reverse: '⚡⇄',
    flex_skip: '⚡⊘',
    flex_draw2: '⚡+2',
    draw1: '+1',
    draw2: '+2',
    draw4: '+4',
    draw5: '+5',
    draw6: '+6',
    draw10: '+10',
    discard_all: 'ALL',
    flip: 'FLP',
    wild: 'W',
    wild_draw2: 'W+2',
    wild_draw4: 'W+4',
    wild_draw6: 'W+6',
    wild_draw10: 'W+10',
    wild_draw_color: 'W🎨',
    wild_reverse_draw4: '⇄+4',
    wild_color_roulette: '🎰',
    wild_forced_swap: '🔀',
    wild_target_draw2: '🎯+2',
    wild_all_draw: 'ALL+',
    wild_all_flip: '⚡FLP',
    wild_team_play: '🤝',
    wild_team_draw4: '🤝+4',
    point_taken: '👉',
    drawn_together: '🔗',
    wild_pile_up: '📚',
    wild_liars_challenge: '🎭W',
    reverse_draw2: '⇄+2',
    double_reverse: '🪃',
    reverse_skip: '⇄⊘',
    wild_reverse_all_skip: 'W⇄⊘',
    stack_plus2: 'S+2',
    stack_plus3: 'S+3',
    stack_plus4: 'S+4',
    wild_stack_x2: '×2',
    wild_stack_transfer: '🎯S',
    swap_target: '🔀',
    swap_rotate_all: '🌪️',
    swap_random: '🎲',
    wild_blind_trade: '🎲2',
    speed_burst: '⚡S',
    speed_drop: '⚡+2',
    wild_reflex_race: '🏁',
    blitz_turn: '⏱️5s',
    shield_deflect: '🛡️',
    shield_block: '🛡️',
    mirror_deflect: '🪞',
    wild_fortress: '🏰',
    comeback_boost: '🚀',
    underdog_relief: '🚀',
    robin_hood_balance: '🏹',
    wild_second_wind: '🌬️',
    frenemy_alliance: '🤝',
    frenemy_betrayal: '🗡️',
    wild_double_agent: '🕵️',
    wild_dos: 'DOS',
    wild_number: '#',
    ono_minus10: '-10',
    ono_hold: '0',
    ono_play2: 'P2',
    ono_99_dead: '99',
  };
  return map[type] ?? '★';
}

function getLabelText(type: string): string {
  const labels: Record<string, string> = {
    skip: 'SKIP',
    skip_everyone: 'SKIP ALL',
    skip_two: 'SKIP 2',
    wild_skip: 'W-SKIP',
    wild_skip_two: 'SKIP 2',
    reverse: 'REVERSE',
    wild_reverse: 'W-REV',
    flex_skip: 'FLEX SKIP',
    flex_reverse: 'FLEX REV',
    flex_draw2: 'FLEX +2',
    draw1: 'DRAW 1',
    draw2: 'DRAW 2',
    draw4: 'DRAW 4',
    draw5: 'DRAW 5',
    discard_all: 'DISCARD ALL',
    flip: 'FLIP!',
    wild: 'WILD',
    wild_draw2: 'WILD +2',
    wild_draw4: 'WILD +4',
    wild_draw6: 'WILD +6',
    wild_draw10: 'WILD +10',
    wild_draw_color: 'DRAW CLR',
    wild_reverse_draw4: 'REV +4',
    wild_color_roulette: 'ROULETTE',
    wild_forced_swap: 'SWAP',
    wild_target_draw2: 'TARGET +2',
    wild_all_draw: 'ALL DRAW',
    wild_all_flip: 'ALL FLIP',
    wild_team_play: 'TEAM PLAY',
    wild_team_draw4: 'TEAM +4',
    point_taken: 'POINT',
    drawn_together: 'LINKED',
    wild_pile_up: 'PILE UP',
    wild_liars_challenge: "LIAR'S",
    reverse_draw2: 'REV +2',
    double_reverse: 'BOOMERANG',
    reverse_skip: 'REV SKIP',
    wild_reverse_all_skip: 'REV ALL',
    stack_plus2: 'STACK +2',
    stack_plus3: 'STACK +3',
    stack_plus4: 'STACK +4',
    wild_stack_x2: 'STACK ×2',
    wild_stack_transfer: 'TRANSFER',
    swap_target: 'SWAP',
    swap_rotate_all: 'CASCADE',
    swap_random: 'RND SWAP',
    wild_blind_trade: 'BLIND 2',
    speed_burst: 'SPEED!',
    speed_drop: 'SPEED DROP',
    wild_reflex_race: 'TAP CEPAT!',
    blitz_turn: 'BLITZ 5s',
    shield_deflect: 'SHIELD',
    shield_block: 'SHIELD',
    mirror_deflect: 'MIRROR',
    wild_fortress: 'FORTRESS',
    comeback_boost: 'COMEBACK',
    underdog_relief: 'UNDERDOG',
    robin_hood_balance: 'ROBIN HOOD',
    wild_second_wind: '2ND WIND',
    frenemy_alliance: 'PACT',
    frenemy_betrayal: 'BACKSTAB',
    wild_double_agent: 'DBL AGENT',
    wild_dos: 'WILD DOS',
    wild_number: 'WILD #',
    ono_minus10: 'MINUS 10',
    ono_hold: 'HOLD 0',
    ono_play2: 'PLAY 2',
    ono_99_dead: 'DEAD 99',
  };
  return labels[type] ?? '';
}

export const HubCardView: React.FC<HubCardViewProps> = ({
  card,
  variantId = 'uno-classic',
  faceDown = false,
  flipSide = 'light',
  size = 'md',
  playable = false,
  dimmed = false,
  selected = false,
  armed = false,
  onClick,
  onSwipeUp,
  className = '',
}) => {
  const [colorblindMode] = useColorblindMode();
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const swipedUpRef = useRef(false);

  if (faceDown || !card) {
    const theme = getModeTheme(variantId, flipSide);
    return (
      <motion.button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        whileHover={onClick ? { y: -4, scale: 1.04 } : undefined}
        whileTap={onClick ? { scale: 0.96 } : undefined}
        className={`relative select-none ${SIZE_MAP[size]} bg-gradient-to-br ${theme.cardBackOuter} shadow-xl border flex items-center justify-center ${
          onClick ? 'cursor-pointer' : 'cursor-default'
        } ${className}`}
      >
        <div className="w-full h-full rounded-[inherit] bg-slate-950 flex items-center justify-center overflow-hidden relative border border-white/10">
          <div
            className={`w-[88%] h-[68%] rounded-[50%] bg-gradient-to-br ${theme.cardBackOval} -rotate-24 flex flex-col items-center justify-center shadow-inner border-2 border-white/80`}
          >
            <span
              className={`font-display font-black italic text-white card-text-shadow leading-none text-center px-1 ${
                size === 'xs'
                  ? 'text-[7px]'
                  : size === 'sm'
                  ? 'text-[10px]'
                  : 'text-sm sm:text-base'
              }`}
            >
              {theme.cardBackLabel}
            </span>
          </div>
        </div>
      </motion.button>
    );
  }

  const color = getCardDisplayColor(card, flipSide);
  const type = getCardDisplayType(card, flipSide);
  const value = getCardDisplayValue(card, flipSide);
  const corner = getCornerBadge(type, value);
  const label = getLabelText(type);
  const isWild = color === 'wild' || type.startsWith('wild');
  const interactive = Boolean(onClick && playable);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!interactive || !onSwipeUp || e.touches.length !== 1) return;
    swipedUpRef.current = false;
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!interactive || !onSwipeUp || !touchStartRef.current || e.changedTouches.length === 0) return;
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
    touchStartRef.current = null;
    if (dy < -36 && Math.abs(dx) < 56) {
      swipedUpRef.current = true;
      onSwipeUp();
    }
  };

  const handleClick = () => {
    if (!interactive) return;
    if (swipedUpRef.current) {
      swipedUpRef.current = false;
      return;
    }
    onClick?.();
  };

  return (
    <motion.button
      type="button"
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      disabled={!interactive}
      whileHover={interactive ? { y: armed ? -16 : -10, scale: 1.05 } : undefined}
      whileTap={interactive ? { scale: 0.96 } : undefined}
      className={`relative select-none ${SIZE_MAP[size]} ${
        flipSide === 'dark' ? 'bg-slate-900' : 'bg-white'
      } shadow-xl transition-[transform,opacity] duration-150 will-change-transform ${
        interactive
          ? armed
            ? 'cursor-pointer -translate-y-4 scale-[1.04] ring-4 ring-emerald-400 shadow-2xl shadow-emerald-400/35 z-20'
            : 'cursor-pointer -translate-y-2 ring-3 ring-amber-300 hover:ring-white shadow-lg shadow-amber-400/25'
          : 'cursor-default'
      } ${selected && !armed ? 'ring-4 ring-emerald-400 -translate-y-3' : ''} ${
        dimmed ? 'opacity-40 saturate-50 brightness-75' : ''
      } ${className}`}
    >
      {armed && (
        <span className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 z-30 whitespace-nowrap px-2 py-0.5 rounded-md bg-emerald-400 text-slate-950 font-display font-black text-[10px] shadow">
          Tap / Geser ↑
        </span>
      )}
      <div
        className={`relative w-full h-full rounded-[inherit] overflow-hidden flex items-center justify-center ${COLOR_GRADIENTS[color]}`}
      >
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-black/25 via-transparent to-white/25" />

        {/* Rainbow quad-oval for Wild cards */}
        {isWild ? (
          <div className="pointer-events-none absolute w-[86%] h-[68%] rounded-[50%] -rotate-24 overflow-hidden border-2 border-white/80 grid grid-cols-2 grid-rows-2 opacity-90">
            <div className={flipSide === 'dark' ? 'bg-pink-500' : 'bg-red-500'} />
            <div className={flipSide === 'dark' ? 'bg-teal-500' : 'bg-blue-500'} />
            <div className={flipSide === 'dark' ? 'bg-orange-500' : 'bg-amber-400'} />
            <div className={flipSide === 'dark' ? 'bg-purple-600' : 'bg-emerald-500'} />
          </div>
        ) : (
          <div className="pointer-events-none absolute w-[88%] h-[70%] rounded-[50%] -rotate-24 border-2 bg-white/18 border-white/70" />
        )}

        {/* Top-left corner */}
        <div
          className={`absolute top-1 left-1.5 font-display font-black italic leading-none text-white card-corner-shadow ${
            size === 'xs' ? 'text-[8px]' : size === 'sm' ? 'text-[11px]' : 'text-xs sm:text-sm'
          }`}
        >
          {corner}
        </div>

        {/* Bottom-right corner */}
        <div
          className={`absolute bottom-1 right-1.5 font-display font-black italic leading-none text-white card-corner-shadow rotate-180 ${
            size === 'xs' ? 'text-[8px]' : size === 'sm' ? 'text-[11px]' : 'text-xs sm:text-sm'
          }`}
        >
          {corner}
        </div>

        {colorblindMode && size !== 'xs' && (
          <div
            className="pointer-events-none absolute bottom-1 left-1.5 z-10 p-0.5 rounded bg-slate-950/75 text-white shadow"
            aria-hidden="true"
          >
            <ColorblindSymbol color={color} size={size === 'sm' ? 9 : 11} />
          </div>
        )}

        {/* Flex secondary color diagonal corner wedge (distinct 2-color UNO Flex visual) */}
        {card.flexColor && (
          <div
            title={`Flex Color: ${card.flexColor}`}
            className={`absolute top-0 right-0 w-7 h-7 sm:w-8 sm:h-8 rounded-bl-2xl border-l-2 border-b-2 border-white/90 shadow-lg flex items-center justify-center ${FLEX_DOT_BG[card.flexColor]}`}
          >
            <span className="text-[7px] font-black text-white drop-shadow">FLX</span>
          </div>
        )}

        {/* Power Flip icon for UNO Flex */}
        {card.hasPowerFlip && (
          <div className="absolute bottom-1 left-1 px-1 rounded bg-slate-950/80 text-[8px] font-black text-emerald-300 border border-emerald-400/50">
            ⚡
          </div>
        )}

        {/* Color-blindness triangular notches (Yellow=1, Green=2, Blue=3, Red=4) */}
        {size !== 'xs' && getFlexColorNotches(color) > 0 && (
          <div
            title={`Aksesibilitas Warna: ${getFlexColorNotches(color)} takik`}
            aria-label={`${getFlexColorNotches(color)} takik segitiga`}
            className="pointer-events-none absolute top-0.5 left-1/2 -translate-x-1/2 flex items-center gap-0.5 text-[7px] leading-none text-white/90 drop-shadow"
          >
            {'▲'.repeat(getFlexColorNotches(color))}
          </div>
        )}

        {/* Pass Symbol for UNO Teams */}
        {card.hasPassSymbol && (
          <div className="absolute top-1 right-1 px-1 rounded bg-sky-500/90 text-[8px] font-black text-white shadow">
            ↔
          </div>
        )}

        {/* Liar's UNO: Face-Down Liar's Card Badge & Color-Blind Graphic Symbol */}
        {card.isLiarsCard && (
          <div
            title="Liar's Card (Dimainkan Tertutup)"
            className="absolute top-1 right-1 px-1 py-0.5 rounded bg-slate-950/85 border border-fuchsia-400/70 text-[7px] font-black text-fuchsia-200 shadow"
          >
            🎭 LIAR
          </div>
        )}
        {card.isLiarsCard !== undefined && getLiarsColorSymbol(color) && (
          <div
            title={`Simbol Warna: ${color}`}
            className="absolute bottom-1 left-1.5 text-[10px] font-black text-white/95 drop-shadow"
          >
            {getLiarsColorSymbol(color)}
          </div>
        )}

        {/* Center content */}
        <div className="relative z-10 flex flex-col items-center justify-center px-1 text-center">
          {type === 'number' ? (
            <span
              className={`font-display font-black italic text-white card-text-shadow leading-none ${
                size === 'xs'
                  ? 'text-lg'
                  : size === 'sm'
                  ? 'text-3xl'
                  : size === 'md'
                  ? 'text-4xl sm:text-5xl'
                  : 'text-6xl'
              }`}
            >
              {value}
            </span>
          ) : (
            <div className="flex flex-col items-center gap-0.5">
              {type.includes('skip') && <Ban className="w-6 h-6 sm:w-8 sm:h-8 text-white drop-shadow" strokeWidth={2.8} />}
              {type.includes('reverse') && <RefreshCw className="w-6 h-6 sm:w-8 sm:h-8 text-white drop-shadow" strokeWidth={2.8} />}
              {type === 'flip' || type === 'wild_all_flip' ? (
                <ArrowLeftRight className="w-6 h-6 sm:w-8 sm:h-8 text-white drop-shadow" strokeWidth={2.8} />
              ) : null}
              {type === 'wild_forced_swap' && <Shuffle className="w-6 h-6 sm:w-8 sm:h-8 text-white drop-shadow" />}
              {type === 'wild_target_draw2' && <Target className="w-6 h-6 sm:w-8 sm:h-8 text-white drop-shadow" />}
              {type.includes('team') && <Users className="w-6 h-6 sm:w-8 sm:h-8 text-white drop-shadow" />}
              {type === 'flex_draw2' && <Zap className="w-6 h-6 sm:w-8 sm:h-8 text-amber-200 drop-shadow" />}
              {(type === 'draw1' ||
                type === 'draw2' ||
                type === 'draw4' ||
                type === 'draw5' ||
                type === 'wild_draw2' ||
                type === 'wild_draw4' ||
                type === 'wild_draw6' ||
                type === 'wild_draw10' ||
                type === 'wild' ||
                type === 'wild_draw_color' ||
                type === 'wild_color_roulette' ||
                type === 'wild_all_draw' ||
                type === 'discard_all') && (
                <span
                  className={`font-display font-black italic text-white card-text-shadow leading-none ${
                    size === 'sm' ? 'text-lg' : 'text-xl sm:text-2xl'
                  }`}
                >
                  {corner}
                </span>
              )}
              {size !== 'xs' && label && (
                <span className="text-[8px] sm:text-[9px] font-display font-black tracking-wider uppercase text-white card-corner-shadow leading-tight bg-black/25 px-1.5 py-0.5 rounded-full">
                  {label}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.button>
  );
};
