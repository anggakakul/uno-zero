import { AddOnPackId, DigitalToolId } from '../types';

export interface AddOnPackInfo {
  id: AddOnPackId;
  name: string;
  shortTag: string;
  description: string;
  cardsAdded: string[];
  accent: string;
}

export interface DigitalToolInfo {
  id: DigitalToolId;
  name: string;
  shortTag: string;
  description: string;
  mechanicSummary: string;
  accent: string;
}

export const ADDON_PACKS_CATALOG: AddOnPackInfo[] = [
  {
    id: 'reverse-pack',
    name: 'Reverse Pack (16 Kartu)',
    shortTag: 'MANIPULASI ARAH',
    description:
      '16 kartu manipulasi arah & giliran: 8× Reverse Draw 2, 4× Double Reverse (Boomerang — giliran ekstra!), dan 4× Wild Reverse All-Skip!',
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

export const DIGITAL_TOOLS_CATALOG: DigitalToolInfo[] = [
  {
    id: 'uno-spin',
    name: 'UNO Spin Wheel',
    shortTag: 'RODA PUTAR ACAK',
    description:
      'Menambahkan kartu SPIN & animasi Roda Putar di tengah meja yang memicu efek acak (Buang 1 Warna, Tukar Tangan, Perang Angka Tertinggi, dll.).',
    mechanicSummary: 'Mainkan kartu SPIN → Roda berputar otomatis dan menjalankan efek meja!',
    accent: 'from-fuchsia-500 to-indigo-600',
  },
  {
    id: 'uno-tippo',
    name: 'UNO Tippo Seesaw',
    shortTag: 'BOBOT 1–4 • BATAS 5–8',
    description:
      'Papan jungkat-jungkit dengan 2 tumpukan (Kiri & Kanan). Bobot: Angka 0–4 = 1, Angka 5–9 = 2, Aksi = 3, Wild = 4. Jika selisih > batas kritis (5–8), papan jatuh (+3 kartu)!',
    mechanicSummary: 'Jaga selisih |Kiri - Kanan| ≤ batas kritis agar papan tidak jatuh!',
    accent: 'from-amber-400 to-red-500',
  },
  {
    id: 'uno-jackpot',
    name: 'UNO Wild Jackpot',
    shortTag: 'MESIN SLOT 3-REEL',
    description:
      'Mesin slot mini 3-reel di meja yang berputar otomatis saat kartu Jackpot dimainkan untuk menentukan hadiah (buang kartu) atau hukuman acak!',
    mechanicSummary: '3 simbol kembar = JACKPOT (buang 2 kartu gratis)!',
    accent: 'from-yellow-400 to-orange-500',
  },
  {
    id: 'uno-power-grab',
    name: 'UNO Power Grab',
    shortTag: 'TOKEN KEBAL AKSI',
    description:
      'Token Power di tengah meja yang dapat direbut dengan kartu Power Grab. Pemegang status Power KEBAL terhadap semua kartu aksi lawan!',
    mechanicSummary: 'Rebut Token Power → Kebal dari Skip, Draw, dan serangan lawan!',
    accent: 'from-emerald-400 to-cyan-500',
  },
  {
    id: 'uno-roboto-flash',
    name: 'UNO Roboto & Flash',
    shortTag: 'ROBOT + REFLEKS',
    description:
      'Asisten virtual Roboto memberi aturan dadakan di tengah giliran + lampu indikator Flash menuntut refleks cepat menekan tombol aksi!',
    mechanicSummary: 'Tekan tombol FLASH REFLEX saat lampu menyala atau kena penalti +2 kartu!',
    accent: 'from-sky-400 to-violet-600',
  },
  {
    id: 'uno-blast',
    name: 'UNO Blast / No Mercy Attack!',
    shortTag: 'PELUNCUR VIRTUAL',
    description:
      'Mengganti Draw Pile biasa dengan Peluncur Kartu Virtual yang menembakkan 0 hingga banyak kartu sekaligus (dengan opsi No Mercy Extreme!).',
    mechanicSummary: 'Tekan tombol BLAST saat ambil kartu; siap-siap ledakan kartu acak!',
    accent: 'from-orange-500 to-rose-700',
  },
];
