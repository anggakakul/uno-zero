import React, { useEffect, useState } from 'react';
import { HubCardColor } from '../types';
import { loadHubPreferences, saveHubPreferences } from '../storage';

export interface ColorblindShapeMeta {
  id: 'circle' | 'triangle' | 'square' | 'diamond' | 'star' | 'hexagon' | 'plus' | 'ring' | 'quad';
  label: string;
}

const COLORBLIND_SHAPES: Record<HubCardColor, ColorblindShapeMeta> = {
  red: { id: 'circle', label: 'Merah (Lingkaran)' },
  yellow: { id: 'triangle', label: 'Kuning (Segitiga)' },
  green: { id: 'square', label: 'Hijau (Persegi)' },
  blue: { id: 'diamond', label: 'Biru (Belah Ketupat)' },
  pink: { id: 'star', label: 'Pink (Bintang)' },
  teal: { id: 'hexagon', label: 'Teal (Heksagon)' },
  orange: { id: 'plus', label: 'Oranye (Plus)' },
  purple: { id: 'ring', label: 'Ungu (Cincin)' },
  wild: { id: 'quad', label: 'Wild (4 Titik)' },
};

export function getColorblindShapeMeta(color: HubCardColor): ColorblindShapeMeta {
  return COLORBLIND_SHAPES[color] ?? COLORBLIND_SHAPES.wild;
}

export function useColorblindMode(): [boolean, (enabled: boolean) => void] {
  const [enabled, setEnabled] = useState<boolean>(() => Boolean(loadHubPreferences().colorblindMode));

  useEffect(() => {
    const sync = () => setEnabled(Boolean(loadHubPreferences().colorblindMode));
    window.addEventListener('uno-hub-prefs-changed', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('uno-hub-prefs-changed', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const update = (next: boolean) => {
    setEnabled(next);
    const prefs = loadHubPreferences();
    saveHubPreferences({ ...prefs, colorblindMode: next });
  };

  return [enabled, update];
}

interface ColorblindSymbolProps {
  color: HubCardColor;
  size?: number;
  className?: string;
}

export const ColorblindSymbol: React.FC<ColorblindSymbolProps> = ({
  color,
  size = 12,
  className = '',
}) => {
  const meta = getColorblindShapeMeta(color);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-label={meta.label}
      className={className}
    >
      {meta.id === 'circle' && <circle cx="8" cy="8" r="6" />}
      {meta.id === 'triangle' && <polygon points="8,1.5 14.5,13.5 1.5,13.5" />}
      {meta.id === 'square' && <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" />}
      {meta.id === 'diamond' && <polygon points="8,1 15,8 8,15 1,8" />}
      {meta.id === 'star' && (
        <polygon points="8,1 10.2,5.8 15,8 10.2,10.2 8,15 5.8,10.2 1,8 5.8,5.8" />
      )}
      {meta.id === 'hexagon' && (
        <polygon points="8,1.5 13.8,4.8 13.8,11.2 8,14.5 2.2,11.2 2.2,4.8" />
      )}
      {meta.id === 'plus' && (
        <path d="M6.2 1.5h3.6v4.7h4.7v3.6H9.8v4.7H6.2V9.8H1.5V6.2h4.7V1.5z" />
      )}
      {meta.id === 'ring' && (
        <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="2.8" />
      )}
      {meta.id === 'quad' && (
        <>
          <circle cx="4.5" cy="4.5" r="2.4" />
          <circle cx="11.5" cy="4.5" r="2.4" />
          <circle cx="4.5" cy="11.5" r="2.4" />
          <circle cx="11.5" cy="11.5" r="2.4" />
        </>
      )}
    </svg>
  );
};
