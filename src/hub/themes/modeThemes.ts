import { VariantId } from '../types';

export interface ModeThemeConfig {
  tableClass: string;
  headerBgClass: string;
  headerBorderClass: string;
  accentTextClass: string;
  signatureTag: string;
  cardBackOuter: string;
  cardBackOval: string;
  cardBackLabel: string;
}

const DEFAULT_THEME: ModeThemeConfig = {
  tableClass: 'theme-classic',
  headerBgClass: 'bg-slate-950/85',
  headerBorderClass: 'border-amber-400/25',
  accentTextClass: 'text-amber-300',
  signatureTag: 'CLASSIC 108',
  cardBackOuter: 'from-red-600 via-amber-500 to-red-700 border-amber-200/70',
  cardBackOval: 'from-red-600 via-amber-500 to-rose-600',
  cardBackLabel: 'UNO',
};

export function getModeTheme(
  variantId: VariantId,
  flipSide: 'light' | 'dark' = 'light'
): ModeThemeConfig {
  switch (variantId) {
    case 'uno-classic':
      return DEFAULT_THEME;

    case 'uno-zero':
      return {
        tableClass: 'table-felt',
        headerBgClass: 'bg-slate-950/90',
        headerBorderClass: 'border-amber-400/30',
        accentTextClass: 'text-amber-300',
        signatureTag: 'GOLF 2×3',
        cardBackOuter: 'from-amber-500 via-orange-600 to-rose-600 border-amber-200/75',
        cardBackOval: 'from-red-600 via-amber-500 to-rose-600',
        cardBackLabel: 'ZERO',
      };

    case 'uno-flip':
      return flipSide === 'dark'
        ? {
            tableClass: 'theme-flip-dark',
            headerBgClass: 'bg-purple-950/90',
            headerBorderClass: 'border-fuchsia-400/45',
            accentTextClass: 'text-fuchsia-300',
            signatureTag: 'DARK SIDE',
            cardBackOuter: 'from-fuchsia-600 via-purple-700 to-teal-500 border-fuchsia-300/70',
            cardBackOval: 'from-fuchsia-600 via-purple-700 to-teal-500',
            cardBackLabel: 'FLIP DARK',
          }
        : {
            tableClass: 'theme-flip-light',
            headerBgClass: 'bg-sky-950/90',
            headerBorderClass: 'border-sky-300/40',
            accentTextClass: 'text-sky-200',
            signatureTag: 'LIGHT SIDE',
            cardBackOuter: 'from-sky-400 via-amber-300 to-rose-400 border-white/80',
            cardBackOval: 'from-sky-500 via-amber-400 to-rose-500',
            cardBackLabel: 'FLIP LIGHT',
          };

    case 'uno-all-wild':
      return {
        tableClass: 'theme-all-wild',
        headerBgClass: 'bg-indigo-950/90',
        headerBorderClass: 'border-pink-400/40',
        accentTextClass: 'text-pink-300',
        signatureTag: '100% WILD',
        cardBackOuter: 'from-pink-500 via-amber-400 to-cyan-400 border-white/80',
        cardBackOval: 'from-fuchsia-600 via-amber-400 to-cyan-500',
        cardBackLabel: 'WILD',
      };

    case 'uno-no-mercy':
      return {
        tableClass: 'theme-no-mercy',
        headerBgClass: 'bg-rose-950/90',
        headerBorderClass: 'border-rose-500/50',
        accentTextClass: 'text-rose-300',
        signatureTag: 'MERCY 25',
        cardBackOuter: 'from-red-700 via-rose-900 to-slate-950 border-rose-400/75',
        cardBackOval: 'from-red-700 via-rose-600 to-orange-600',
        cardBackLabel: 'MERCY',
      };

    case 'uno-flex':
      return {
        tableClass: 'theme-flex',
        headerBgClass: 'bg-emerald-950/90',
        headerBorderClass: 'border-emerald-400/40',
        accentTextClass: 'text-emerald-300',
        signatureTag: 'POWER FLEX',
        cardBackOuter: 'from-emerald-500 via-teal-500 to-lime-400 border-emerald-200/75',
        cardBackOval: 'from-emerald-500 via-cyan-500 to-lime-500',
        cardBackLabel: 'FLEX',
      };

    case 'uno-teams':
      return {
        tableClass: 'theme-teams',
        headerBgClass: 'bg-slate-950/90',
        headerBorderClass: 'border-sky-400/40',
        accentTextClass: 'text-sky-300',
        signatureTag: 'CO-OP TEAMS',
        cardBackOuter: 'from-sky-500 via-indigo-600 to-rose-500 border-sky-200/75',
        cardBackOval: 'from-sky-500 via-indigo-500 to-rose-500',
        cardBackLabel: 'TEAMS',
      };

    case 'uno-party':
      return {
        tableClass: 'theme-party',
        headerBgClass: 'bg-fuchsia-950/90',
        headerBorderClass: 'border-amber-400/45',
        accentTextClass: 'text-amber-300',
        signatureTag: 'PARTY MODE',
        cardBackOuter: 'from-pink-500 via-rose-500 to-amber-400 border-amber-200/80',
        cardBackOval: 'from-rose-500 via-fuchsia-500 to-amber-400',
        cardBackLabel: 'PARTY',
      };

    case 'uno-liars':
      return {
        tableClass: 'theme-liars',
        headerBgClass: 'bg-violet-950/90',
        headerBorderClass: 'border-violet-400/45',
        accentTextClass: 'text-violet-300',
        signatureTag: 'BLUFF ARENA',
        cardBackOuter: 'from-violet-700 via-purple-800 to-slate-950 border-violet-300/70',
        cardBackOval: 'from-violet-600 via-purple-700 to-fuchsia-600',
        cardBackLabel: 'LIAR',
      };

    case 'dos-mode':
      return {
        tableClass: 'theme-dos',
        headerBgClass: 'bg-cyan-950/90',
        headerBorderClass: 'border-cyan-400/45',
        accentTextClass: 'text-cyan-300',
        signatureTag: 'CENTER ROW',
        cardBackOuter: 'from-blue-600 via-cyan-500 to-emerald-500 border-cyan-200/80',
        cardBackOval: 'from-blue-600 via-cyan-500 to-emerald-500',
        cardBackLabel: 'DOS 2',
      };

    case 'ono-99':
      return {
        tableClass: 'theme-ono99',
        headerBgClass: 'bg-orange-950/90',
        headerBorderClass: 'border-orange-400/45',
        accentTextClass: 'text-orange-300',
        signatureTag: 'BATAS 99',
        cardBackOuter: 'from-orange-500 via-amber-500 to-rose-600 border-amber-200/80',
        cardBackOval: 'from-orange-600 via-amber-500 to-rose-600',
        cardBackLabel: 'ONO 99',
      };

    default:
      return DEFAULT_THEME;
  }
}
