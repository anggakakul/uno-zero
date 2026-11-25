import React from 'react';

interface AvatarTurnTimerRingProps {
  name: string;
  isCurrent: boolean;
  secondsLeft: number | null;
  maxSeconds?: number;
  eliminated?: boolean;
}

export const AvatarTurnTimerRing: React.FC<AvatarTurnTimerRingProps> = ({
  name,
  isCurrent,
  secondsLeft,
  maxSeconds = 30,
  eliminated = false,
}) => {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || '?';

  const radius = 15;
  const circumference = 2 * Math.PI * radius;
  const hasTimer = isCurrent && secondsLeft !== null && maxSeconds > 0;
  const progress = hasTimer ? Math.max(0, Math.min(1, secondsLeft / maxSeconds)) : isCurrent ? 1 : 0;
  const dashOffset = circumference * (1 - progress);

  const ringStroke = !isCurrent
    ? 'transparent'
    : hasTimer && secondsLeft <= 6
    ? '#f43f5e'
    : hasTimer && secondsLeft <= 12
    ? '#fbbf24'
    : '#34d399';

  return (
    <div className="relative w-9 h-9 shrink-0 flex items-center justify-center">
      <svg
        width="36"
        height="36"
        viewBox="0 0 36 36"
        className="absolute inset-0 -rotate-90"
        aria-hidden="true"
      >
        <circle
          cx="18"
          cy="18"
          r={radius}
          fill="none"
          stroke="rgba(148, 163, 184, 0.22)"
          strokeWidth="2.5"
        />
        {isCurrent && (
          <circle
            cx="18"
            cy="18"
            r={radius}
            fill="none"
            stroke={ringStroke}
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            className="transition-[stroke-dashoffset,stroke] duration-300"
          />
        )}
      </svg>
      <span
        className={`w-7 h-7 rounded-full flex items-center justify-center font-display font-black text-[11px] ${
          eliminated
            ? 'bg-rose-950 text-rose-300'
            : isCurrent
            ? 'bg-amber-400 text-slate-950'
            : 'bg-slate-800 text-slate-200'
        }`}
      >
        {initials}
      </span>
    </div>
  );
};
