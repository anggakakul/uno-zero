import React from 'react';
import { Bot, WifiOff } from 'lucide-react';
import { Card, CardColor, Player } from '../types/game';
import { countFaceDownCards } from '../engine/rules';

interface OpponentMiniBoardProps {
  player: Player;
  isActive: boolean;
  isVulnerable: boolean;
  onInspect: () => void;
}

const MINI_BG: Record<CardColor, string> = {
  red: 'bg-red-600 border-rose-300/80 text-white',
  yellow: 'bg-amber-400 border-amber-200 text-slate-950',
  green: 'bg-emerald-600 border-emerald-300/80 text-white',
  blue: 'bg-blue-600 border-sky-300/80 text-white',
};

function MiniCardPill({ card, faceUp }: { card: Card | null; faceUp: boolean }) {
  if (!faceUp || !card) {
    return (
      <div
        className="w-5 h-7 sm:w-6 sm:h-8 rounded-[5px] bg-slate-950 border border-amber-400/70 flex items-center justify-center shadow-sm"
        title="Kartu tertutup"
      >
        <div className="w-3 h-4 rounded-full bg-gradient-to-br from-red-600 to-amber-500 -rotate-20" />
      </div>
    );
  }

  const label =
    card.type === 'number'
      ? String(card.value)
      : card.type === 'skip'
      ? '⊘'
      : card.type === 'reverse'
      ? '⇄'
      : card.type === 'draw2'
      ? '+2'
      : '×2';

  return (
    <div
      className={`w-5 h-7 sm:w-6 sm:h-8 rounded-[5px] border font-display font-black text-[10px] sm:text-[11px] flex items-center justify-center shadow-sm leading-none ${MINI_BG[card.color]}`}
      title={`${card.type} ${card.color}`}
    >
      {label}
    </div>
  );
}

/**
 * Compact live mini-grid for opponents (2–8 players) showing exact open/closed card status,
 * player name, temporary score badge, and glowing active-turn ring.
 */
export const OpponentMiniBoard: React.FC<OpponentMiniBoardProps> = ({
  player,
  isActive,
  isVulnerable,
  onInspect,
}) => {
  const faceDown = countFaceDownCards(player.columns);

  return (
    <button
      type="button"
      onClick={onInspect}
      className={`shrink-0 rounded-2xl px-2.5 py-2 border transition text-left flex flex-col gap-1.5 cursor-pointer ${
        isActive
          ? 'bg-emerald-950/80 border-amber-400 ring-2 ring-amber-400/60 shadow-[0_0_20px_rgba(251,191,36,0.28)]'
          : isVulnerable
          ? 'bg-rose-950/80 border-rose-500 ring-2 ring-rose-500/60 animate-pulse'
          : 'bg-slate-950/65 border-slate-700/70 hover:border-slate-500'
      }`}
    >
      {/* Header row: Name + Score badge */}
      <div className="flex items-center justify-between gap-2 w-full">
        <div className="flex items-center gap-1 min-w-0">
          {player.isAI && <Bot className="w-3 h-3 text-sky-400 shrink-0" />}
          <span className="text-[11px] sm:text-xs font-bold text-white truncate max-w-[78px]">
            {player.name}
          </span>
          {player.connected === false && <WifiOff className="w-3 h-3 text-rose-400 shrink-0" />}
        </div>
        <span className="px-1.5 py-0.5 rounded-md bg-slate-800/90 text-[10px] font-display font-black text-amber-300 shrink-0">
          {player.totalScore}p
        </span>
      </div>

      {/* Live Mini 2xN Grid */}
      <div className="flex items-center justify-center gap-1">
        {player.columns.length === 0 ? (
          <span className="text-[10px] font-bold text-emerald-300 px-2 py-1">0 Poin!</span>
        ) : (
          player.columns.map((col) => (
            <div key={col.id} className="flex flex-col gap-0.5">
              {col.top && <MiniCardPill card={col.top.card} faceUp={col.top.faceUp} />}
              {col.bottom && <MiniCardPill card={col.bottom.card} faceUp={col.bottom.faceUp} />}
            </div>
          ))
        )}
      </div>

      {/* Footer micro status */}
      <div className="flex items-center justify-between text-[9px] text-slate-400 font-semibold">
        <span>{faceDown} tutup</span>
        {faceDown === 1 && player.hasCalledUno && (
          <span className="px-1 rounded bg-emerald-500/25 text-emerald-300 font-black">UNO!</span>
        )}
      </div>
    </button>
  );
};
