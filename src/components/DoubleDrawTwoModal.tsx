import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Columns3, Users, User } from 'lucide-react';
import { Player } from '../types/game';

interface DoubleDrawTwoModalProps {
  actorName: string;
  opponents: Player[];
  onConfirm: (targetIds: string[]) => void;
}

export const DoubleDrawTwoModal: React.FC<DoubleDrawTwoModalProps> = ({
  actorName,
  opponents,
  onConfirm,
}) => {
  const canSplit = opponents.length >= 2;
  const [mode, setMode] = useState<'single' | 'split'>('single');
  const [selected, setSelected] = useState<string[]>(
    opponents.length > 0 ? [opponents[0].id] : []
  );

  const toggleOpponent = (id: string) => {
    if (mode === 'single') {
      setSelected([id]);
      return;
    }
    setSelected((prev) => {
      if (prev.includes(id)) {
        return prev.filter((x) => x !== id);
      }
      if (prev.length >= 2) {
        return [prev[1], id];
      }
      return [...prev, id];
    });
  };

  const handleModeSwitch = (nextMode: 'single' | 'split') => {
    setMode(nextMode);
    if (nextMode === 'single') {
      setSelected(opponents[0] ? [opponents[0].id] : []);
    } else {
      setSelected(opponents.slice(0, 2).map((o) => o.id));
    }
  };

  const valid = mode === 'single' ? selected.length === 1 : selected.length === 2;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-md rounded-3xl bg-slate-900 border-2 border-amber-400/60 p-6 shadow-2xl space-y-5"
      >
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-400/15 text-amber-300 text-xs font-black uppercase">
            <Columns3 className="w-3.5 h-3.5" />
            Double Draw Two
          </div>
          <h3 className="font-display text-2xl font-black text-white">
            Pilih Target ({actorName})
          </h3>
          <p className="text-xs text-slate-400">
            Beri 4 kartu tertutup (2 kolom baru) ke 1 lawan, atau bagi 2 kartu tertutup (1 kolom baru) ke 2 lawan berbeda.
          </p>
        </div>

        {/* Mode toggle */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => handleModeSwitch('single')}
            className={`p-3 rounded-2xl border text-left text-xs cursor-pointer transition ${
              mode === 'single'
                ? 'bg-amber-400/20 border-amber-400 text-white'
                : 'bg-slate-950/60 border-slate-800 text-slate-400'
            }`}
          >
            <div className="font-bold flex items-center gap-1.5">
              <User className="w-4 h-4 text-amber-400" />1 Lawan (+4 Kartu)
            </div>
            <div className="text-[10px] opacity-80 mt-0.5">2 kolom baru tertutup</div>
          </button>

          <button
            type="button"
            disabled={!canSplit}
            onClick={() => handleModeSwitch('split')}
            className={`p-3 rounded-2xl border text-left text-xs transition ${
              !canSplit
                ? 'opacity-40 cursor-not-allowed bg-slate-950/40 border-slate-800 text-slate-500'
                : mode === 'split'
                ? 'bg-amber-400/20 border-amber-400 text-white cursor-pointer'
                : 'bg-slate-950/60 border-slate-800 text-slate-400 cursor-pointer'
            }`}
          >
            <div className="font-bold flex items-center gap-1.5">
              <Users className="w-4 h-4 text-sky-400" />2 Lawan (+2 Masing²)
            </div>
            <div className="text-[10px] opacity-80 mt-0.5">
              {canSplit ? '1 kolom baru per lawan' : 'Butuh minimal 3 pemain'}
            </div>
          </button>
        </div>

        {/* Opponent selector */}
        <div className="space-y-2 max-h-56 overflow-y-auto">
          {opponents.map((opp) => {
            const isSelected = selected.includes(opp.id);
            return (
              <button
                key={opp.id}
                type="button"
                onClick={() => toggleOpponent(opp.id)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border text-left transition cursor-pointer ${
                  isSelected
                    ? 'bg-rose-500/20 border-rose-400 text-white'
                    : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-600'
                }`}
              >
                <div>
                  <div className="font-display font-bold text-sm">{opp.name}</div>
                  <div className="text-[11px] text-slate-400">
                    Grid saat ini: 2×{opp.columns.length} • Total Skor: {opp.totalScore}
                  </div>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-lg text-xs font-black ${
                    isSelected ? 'bg-rose-500 text-white' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {isSelected ? (mode === 'single' ? '+4 Kartu' : '+2 Kartu') : 'Pilih'}
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          disabled={!valid}
          onClick={() => valid && onConfirm(selected)}
          className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-amber-400 to-rose-500 hover:from-amber-300 hover:to-rose-400 disabled:opacity-40 text-slate-950 font-display font-black text-base shadow-xl cursor-pointer transition"
        >
          TERAPKAN DOUBLE DRAW TWO
        </button>
      </motion.div>
    </div>
  );
};
