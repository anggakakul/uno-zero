import React from 'react';
import { motion } from 'framer-motion';
import { HubCardColor, PlayDirection } from '../types';

interface DirectionOrbitRingProps {
  direction: PlayDirection;
  activeColor: HubCardColor;
}

const COLOR_STROKE: Record<HubCardColor, { stroke: string; glow: string }> = {
  red: { stroke: '#f87171', glow: 'rgba(239, 68, 68, 0.36)' },
  yellow: { stroke: '#fbbf24', glow: 'rgba(251, 191, 36, 0.34)' },
  green: { stroke: '#34d399', glow: 'rgba(16, 185, 129, 0.36)' },
  blue: { stroke: '#60a5fa', glow: 'rgba(59, 130, 246, 0.38)' },
  pink: { stroke: '#f472b6', glow: 'rgba(236, 72, 153, 0.40)' },
  teal: { stroke: '#2dd4bf', glow: 'rgba(20, 184, 166, 0.38)' },
  orange: { stroke: '#fb923c', glow: 'rgba(249, 115, 22, 0.38)' },
  purple: { stroke: '#c084fc', glow: 'rgba(168, 85, 247, 0.40)' },
  wild: { stroke: '#fbbf24', glow: 'rgba(251, 191, 36, 0.28)' },
};

export function getActiveColorGlow(color: HubCardColor): string {
  return (COLOR_STROKE[color] ?? COLOR_STROKE.wild).glow;
}

export const DirectionOrbitRing: React.FC<DirectionOrbitRingProps> = ({
  direction,
  activeColor,
}) => {
  const palette = COLOR_STROKE[activeColor] ?? COLOR_STROKE.wild;
  const isClockwise = direction === 1;

  return (
    <div
      className="pointer-events-none absolute -inset-5 sm:-inset-6 flex items-center justify-center"
      aria-hidden="true"
    >
      <div
        className="absolute inset-2 rounded-full transition-all duration-500"
        style={{
          background: `radial-gradient(circle, ${palette.glow} 0%, transparent 70%)`,
        }}
      />
      <motion.svg
        key={direction}
        viewBox="0 0 180 180"
        className="w-full h-full opacity-75"
        animate={{ rotate: isClockwise ? 360 : -360 }}
        transition={{ repeat: Infinity, duration: 16, ease: 'linear' }}
      >
        <circle
          cx="90"
          cy="90"
          r="80"
          fill="none"
          stroke={palette.stroke}
          strokeWidth="2"
          strokeDasharray="16 14"
          strokeLinecap="round"
        />
        {isClockwise ? (
          <>
            <polygon points="90,4 99,11 90,18" fill={palette.stroke} />
            <polygon points="90,176 81,169 90,162" fill={palette.stroke} />
          </>
        ) : (
          <>
            <polygon points="90,4 81,11 90,18" fill={palette.stroke} />
            <polygon points="90,176 99,169 90,162" fill={palette.stroke} />
          </>
        )}
      </motion.svg>
    </div>
  );
};
