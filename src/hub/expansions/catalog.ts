import { AddOnPackId } from '../types';

export interface AddOnPackInfo {
  id: AddOnPackId;
  name: string;
  shortTag: string;
  description: string;
  cardsAdded: string[];
  accent: string;
}

export const ADDON_PACKS_CATALOG: AddOnPackInfo[] = [
  {
    id: 'reverse-pack',
    name: 'Reverse Pack (16 Kartu)',
    shortTag: 'MANIPULASI ARAH',
    description:
      '16 kartu manipulasi arah dan giliran: 8× Reverse Draw 2, 4× Double Reverse (Boomerang: giliran ekstra), dan 4× Wild Reverse All-Skip.',
    cardsAdded: ['8× Reverse Draw 2', '4× Double Reverse', '4× Wild Reverse All-Skip'],
    accent: 'from-cyan-400 to-blue-600',
  },
  {
    id: 'stack-pack',
    name: 'Stack Pack (16 Kartu)',
    shortTag: 'TUMPUKAN PENALTI',
    description:
      'Aktifkan aturan stacking global untuk semua kartu Draw + 16 kartu khusus: 8× Stack +3, 4× Wild Stack Multiplier ×2, dan 4× Wild Stack Transfer!',
    cardsAdded: ['8× Stack +3', '4× Wild Stack ×2', '4× Wild Stack Transfer'],
    accent: 'from-rose-500 to-red-700',
  },
  {
    id: 'swap-pack',
    name: 'Swap Pack (16 Kartu)',
    shortTag: 'TUKAR KARTU',
    description:
      '16 kartu kekacauan pertukaran: 8× Targeted Swap (tukar tangan dengan pilihan), 4× Cascade Swap (rotasi semua), dan 4× Wild Blind Trade (tukar 2 kartu acak)!',
    cardsAdded: ['8× Targeted Swap', '4× Cascade Swap', '4× Wild Blind Trade'],
    accent: 'from-violet-500 to-purple-700',
  },
  {
    id: 'speed-pack',
    name: 'Speed Pack (16 Kartu)',
    shortTag: 'TEMPO CEPAT',
    description:
      '16 kartu kecepatan & refleks: 8× Speed Drop (buang +2 kartu angka warna sama), 4× Wild Reflex Race ("TAP CEPAT!" 3 detik), dan 4× Blitz Turn (timer 5 detik 1 putaran)!',
    cardsAdded: ['8× Speed Drop', '4× Wild Reflex Race', '4× Blitz Turn (5s)'],
    accent: 'from-amber-400 to-orange-600',
  },
  {
    id: 'defense-pack',
    name: 'Defense Pack (16 Kartu)',
    shortTag: 'PERISAI & PANTULAN',
    description:
      'Kartu reaktif di luar giliran! 8× Shield Block (batalkan aksi + ubah warna), 4× Mirror Deflect (pantulkan serangan balik ke penyerang), dan 4× Wild Fortress (kebal 1 putaran)!',
    cardsAdded: ['8× Shield Block', '4× Mirror Deflect', '4× Wild Fortress'],
    accent: 'from-emerald-400 to-teal-600',
  },
  {
    id: 'comeback-pack',
    name: 'Comeback Pack (16 Kartu)',
    shortTag: 'PEMBALIK KEADAAN',
    description:
      '16 kartu penyelamat underdog: 8× Underdog Relief (buang 2 kartu gratis jika di atas rata-rata), 4× Robin Hood Balance, dan 4× Wild Second Wind (buang 1 warna penuh jika ≥7 kartu)!',
    cardsAdded: ['8× Underdog Relief', '4× Robin Hood Balance', '4× Wild Second Wind'],
    accent: 'from-yellow-300 to-amber-500',
  },
  {
    id: 'frenemies-pack',
    name: 'Frenemies Pack (16 Kartu)',
    shortTag: 'ALIANSI & KHIANAT',
    description:
      '16 kartu politik meja: 8× Pact/Alliance (sekutu ikut buang kartu angka sama), 4× Betrayal/Backstab (putus aliansi +3 kartu!), dan 4× Wild Double Agent (ikat 2 lawan)!',
    cardsAdded: ['8× Pact/Alliance', '4× Betrayal (+3)', '4× Wild Double Agent'],
    accent: 'from-pink-500 to-rose-600',
  },
];
