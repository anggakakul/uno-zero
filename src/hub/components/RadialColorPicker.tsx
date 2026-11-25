import React from 'react';
import { motion } from 'framer-motion';
import { getColorLabel } from '../engine/core';
import { HubCardColor } from '../types';
import { ColorblindSymbol, useColorblindMode } from '../utils/colorblind';

interface RadialColorPickerProps {
  colors: HubCardColor[];
  onSelect: (color: HubCardColor) => void;
}

const QUADRANT_STYLE: Record<HubCardColor, { bg: string; text: string }> = {
  red: { bg: 'bg-red-600 hover:bg-red-500', text: 'text-white' },
  yellow: { bg: 'bg-amber-400 hover:bg-amber-300', text: 'text-slate-950' },
  green: { bg: 'bg-emerald-600 hover:bg-emerald-500', text: 'text-white' },
  blue: { bg: 'bg-blue-600 hover:bg-blue-500', text: 'text-white' },
  pink: { bg: 'bg-pink-600 hover:bg-pink-500', text: 'text-white' },
  teal: { bg: 'bg-teal-600 hover:bg-teal-500', text: 'text-white' },
  orange: { bg: 'bg-orange-500 hover:bg-orange-400', text: 'text-slate-950' },
  purple: { bg: 'bg-purple-600 hover:bg-purple-500', text: 'text-white' },
  wild: { bg: 'bg-slate-700 hover:bg-slate-600', text: 'text-white' },
};

const QUADRANT_RADIUS = [
  'rounded-tl-full pr-4 pb-4 items-end justify-end',
  'rounded-tr-full pl-4 pb-4 items-end justify-start',
  'rounded-bl-full pr-4 pt-4 items-start justify-end',
  'rounded-br-full pl-4 pt-4 items-start justify-start',
];

export const RadialColorPicker: React.FC<RadialColorPickerProps> = ({
  colors,
  onSelect,
}) => {
  const [colorblindMode] = useColorblindMode();
  const quadColors = colors.slice(0, 4);

  return (
    <div className="flex flex-col items-center py-2">
      <div className="relative w-60 h-60 sm:w-64 sm:h-64 rounded-full p-1.5 bg-slate-950 border-2 border-slate-700 shadow-2xl">
        <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-1.5 rounded-full overflow-hidden">
          {quadColors.map((col, idx) => {
            const style = QUADRANT_STYLE[col] ?? QUADRANT_STYLE.wild;
            return (
              <motion.button
                key={col}
                type="button"
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => onSelect(col)}
                aria-label={`Pilih warna ${getColorLabel(col)}`}
                className={`flex flex-col gap-1 font-display font-black text-sm transition ${style.bg} ${style.text} ${QUADRANT_RADIUS[idx]}`}
              >
                <span className="inline-flex items-center gap-1">
                  {colorblindMode && <ColorblindSymbol color={col} size={13} />}
                  <span>{getColorLabel(col)}</span>
                </span>
              </motion.button>
            );
          })}
        </div>

        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-slate-950 border-2 border-amber-400/70 flex items-center justify-center shadow-lg">
            <span className="font-display font-black italic text-xs text-amber-300 tracking-wide">
              WILD
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
