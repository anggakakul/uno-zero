import React, { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Bot, Dices, Flame, Scale, Shield, Sparkles, Zap } from 'lucide-react';
import { ALL_POWER_RELICS } from '../expansions/digitalTools';
import { HubGameState } from '../types';

interface DigitalToolWidgetsProps {
  state: HubGameState;
  tippoSide: 'left' | 'right';
  onChangeTippoSide: (side: 'left' | 'right') => void;
  onPressFlashReflex: () => void;
  onTriggerOvercharge?: (level: 1 | 2 | 3) => void;
}

export const DigitalToolWidgets: React.FC<DigitalToolWidgetsProps> = ({
  state,
  tippoSide,
  onChangeTippoSide,
  onPressFlashReflex,
  onTriggerOvercharge,
}) => {
  const [chargeLevel, setChargeLevel] = useState<0 | 1 | 2 | 3>(0);
  const chargeTimerRef = useRef<number | null>(null);
  const activeTools = state.settings.activeTools ?? [];
  const toolState = state.toolState;
  if (activeTools.length === 0 || !toolState) return null;

  const startCharge = () => {
    setChargeLevel(1);
    chargeTimerRef.current = window.setInterval(() => {
      setChargeLevel((prev) => (prev < 3 ? ((prev + 1) as 1 | 2 | 3) : 3));
    }, 550);
  };

  const releaseCharge = () => {
    if (chargeTimerRef.current) {
      window.clearInterval(chargeTimerRef.current);
      chargeTimerRef.current = null;
    }
    if (chargeLevel > 0 && onTriggerOvercharge) {
      onTriggerOvercharge(chargeLevel as 1 | 2 | 3);
    }
    setChargeLevel(0);
  };

  const powerHolder = toolState.powerHolderId
    ? state.players.find((p) => p.id === toolState.powerHolderId)
    : null;

  const tiltDeg = Math.max(
    -18,
    Math.min(18, (toolState.tippoRightWeight - toolState.tippoLeftWeight) * 1.5)
  );

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-wrap items-center justify-center gap-2.5 px-2">
      {/* UNO SPIN WHEEL WIDGET */}
      {activeTools.includes('uno-spin') && (
        <div className="px-3.5 py-2 rounded-2xl bg-fuchsia-950/75 border border-fuchsia-400/40 flex items-center gap-2.5 shadow-lg">
          <motion.div
            key={toolState.lastSpin?.timestamp ?? 'idle'}
            animate={{ rotate: toolState.lastSpin ? 360 : 0 }}
            transition={{ duration: 0.7 }}
            className="w-8 h-8 rounded-full bg-gradient-to-tr from-fuchsia-500 via-amber-400 to-cyan-400 flex items-center justify-center text-slate-950 font-black text-sm shadow"
          >
            🎡
          </motion.div>
          <div className="text-left">
            <div className="text-[10px] font-display font-black uppercase text-fuchsia-300">
              UNO SPIN WHEEL
            </div>
            <div className="text-[11px] font-bold text-white">
              {toolState.lastSpin ? toolState.lastSpin.label : 'Mainkan kartu SPIN!'}
            </div>
          </div>
        </div>
      )}

      {/* UNO TIPPO SEESAW BALANCE BOARD */}
      {activeTools.includes('uno-tippo') && (
        <div className="px-3.5 py-2 rounded-2xl bg-amber-950/75 border border-amber-400/40 flex items-center gap-3 shadow-lg">
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-1 text-[10px] font-display font-black text-amber-300">
              <Scale className="w-3.5 h-3.5" /> TIPPO
            </div>
            <motion.div
              animate={{ rotate: tiltDeg }}
              className="w-20 h-1.5 rounded-full bg-gradient-to-r from-sky-400 via-amber-300 to-rose-400 my-1.5"
            />
            <div className="text-[9px] text-amber-100 font-bold">
              L:{toolState.tippoLeftWeight} | R:{toolState.tippoRightWeight}
            </div>
          </div>
          <div className="flex gap-1">
            {(['left', 'right'] as const).map((side) => (
              <button
                key={side}
                type="button"
                onClick={() => onChangeTippoSide(side)}
                className={`px-2 py-1 rounded-lg text-[10px] font-black cursor-pointer transition ${
                  tippoSide === side
                    ? 'bg-amber-400 text-slate-950'
                    : 'bg-slate-900/80 text-slate-300 hover:bg-slate-800'
                }`}
              >
                {side === 'left' ? 'KIRI' : 'KANAN'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* UNO WILD JACKPOT 3-REEL SLOT */}
      {activeTools.includes('uno-jackpot') && (
        <div className="px-3.5 py-2 rounded-2xl bg-orange-950/75 border border-yellow-400/45 flex items-center gap-2.5 shadow-lg">
          <Dices className="w-5 h-5 text-yellow-300" />
          <div className="flex items-center gap-1">
            {(toolState.lastJackpot?.reels ?? ['🍒', '⭐', '💎']).map((sym, i) => (
              <motion.span
                key={`${toolState.lastJackpot?.timestamp ?? 0}-${i}`}
                initial={{ y: -8, opacity: 0.4 }}
                animate={{ y: 0, opacity: 1 }}
                className="w-7 h-7 rounded-lg bg-slate-950 border border-yellow-400/40 flex items-center justify-center text-sm"
              >
                {sym}
              </motion.span>
            ))}
          </div>
          <div className="text-[10px] font-bold text-yellow-200 max-w-[120px] leading-tight">
            {toolState.lastJackpot?.outcome ?? 'Slot Jackpot Siap'}
          </div>
        </div>
      )}

      {/* UNO POWER GRAB 4-RELIC HUD (U • N • O • !) */}
      {activeTools.includes('uno-power-grab') && (
        <div className="px-3.5 py-2 rounded-2xl bg-emerald-950/75 border border-emerald-400/45 flex items-center gap-2.5 shadow-lg">
          <Shield className="w-4 h-4 text-emerald-300 shrink-0" />
          <div className="text-left space-y-1">
            <div className="text-[10px] font-display font-black text-emerald-300 uppercase">
              RELIC POWER GRAB (4 = INSTANT WIN)
            </div>
            <div className="flex items-center gap-1">
              {ALL_POWER_RELICS.map((key) => {
                const holderId = toolState.powerRelics?.[key];
                const holder = holderId ? state.players.find((p) => p.id === holderId) : null;
                return (
                  <span
                    key={key}
                    title={holder ? `Dipegang: ${holder.name}` : 'Belum direbut'}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-display font-black border ${
                      holder
                        ? 'bg-emerald-400 text-slate-950 border-white'
                        : 'bg-slate-900 text-slate-500 border-slate-700'
                    }`}
                  >
                    {key}
                  </span>
                );
              })}
              {powerHolder && (
                <span className="text-[10px] font-bold text-emerald-200 ml-1">
                  {powerHolder.name}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* UNO ROBOTO & FLASH */}
      {activeTools.includes('uno-roboto-flash') && (
        <div className="flex items-center gap-2">
          {toolState.robotoRule && (
            <div className="px-3 py-2 rounded-2xl bg-sky-950/80 border border-sky-400/45 flex items-center gap-2 shadow-lg max-w-xs">
              <Bot className="w-4 h-4 text-sky-300 shrink-0" />
              <div className="text-[10px] text-sky-100 leading-tight">
                <strong className="text-sky-300">ROBOTO → {toolState.robotoRule.targetName}:</strong>{' '}
                {toolState.robotoRule.ruleText}
              </div>
            </div>
          )}

          {toolState.flashActive && (
            <button
              type="button"
              onClick={onPressFlashReflex}
              className="px-4 py-2 rounded-2xl bg-gradient-to-r from-yellow-300 via-amber-400 to-rose-500 text-slate-950 font-display font-black text-xs shadow-xl animate-bounce flex items-center gap-1.5 cursor-pointer"
            >
              <Zap className="w-4 h-4 fill-current" />
              TEKAN FLASH REFLEX! ({toolState.flashActive.secondsLeft}s)
            </button>
          )}
        </div>
      )}

      {/* UNO BLAST / HOLD-TO-CHARGE OVERCHARGE LAUNCHER */}
      {activeTools.includes('uno-blast') && (
        <button
          type="button"
          onPointerDown={startCharge}
          onPointerUp={releaseCharge}
          onPointerLeave={() => chargeLevel > 0 && releaseCharge()}
          className={`px-3.5 py-2 rounded-2xl border flex items-center gap-2 text-[11px] font-display font-black cursor-pointer select-none transition ${
            chargeLevel === 3
              ? 'bg-rose-600 border-amber-300 text-white animate-pulse scale-105'
              : chargeLevel > 0
              ? 'bg-orange-500 border-white text-slate-950'
              : 'bg-rose-950/75 border-rose-400/45 text-rose-200 hover:bg-rose-900'
          }`}
        >
          <Flame className="w-4 h-4 text-amber-300" />
          <span>
            {chargeLevel === 0
              ? state.settings.blastExtreme
                ? 'TAHAN: OVERCHARGE BLAST'
                : 'TAHAN: BLAST LAUNCHER'
              : chargeLevel === 3
              ? '🔥 LV.3 OVERLOAD! (+8 / RISIKO)'
              : `⚡ CHARGING LV.${chargeLevel} (+${chargeLevel * 2})`}
          </span>
        </button>
      )}

      {/* ACTIVE HOUSE RULES / ALLIANCES BADGES */}
      {state.activeHouseRules && state.activeHouseRules.length > 0 && (
        <div className="px-3 py-1.5 rounded-2xl bg-indigo-950/80 border border-indigo-400/40 text-[10px] text-indigo-200 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-amber-300" />
          <span>Aturan Aktif: {state.activeHouseRules[state.activeHouseRules.length - 1]}</span>
        </div>
      )}
    </div>
  );
};
