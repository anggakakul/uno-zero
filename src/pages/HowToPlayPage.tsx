import React from 'react';
import {
  ArrowLeft,
  BookOpen,
  Bot,
  CheckCircle2,
  Globe,
  Grid2x2,
  ShieldAlert,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { UnoCard } from '../components/UnoCard';

interface HowToPlayPageProps {
  onBack: () => void;
}

export const HowToPlayPage: React.FC<HowToPlayPageProps> = ({ onBack }) => {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-6 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-sm font-semibold text-slate-200 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali
        </button>

        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-500/15 border border-sky-400/30 text-sky-300 text-xs font-bold">
            <BookOpen className="w-3.5 h-3.5" />
            Aturan Resmi Mattel UNO Zero • 112 Kartu • 9 Ronde
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-black text-white">
            Cara Bermain UNO ZERO
          </h1>
        </div>

        <section className="rounded-3xl bg-slate-900/90 border border-slate-800 p-5 space-y-2">
          <h2 className="font-display text-xl font-extrabold text-amber-300 flex items-center gap-2">
            <Trophy className="w-5 h-5" />
            1. Tujuan &amp; Deck 112 Kartu
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            UNO ZERO adalah game bergaya <strong>Golf</strong>. Tujuannya mengumpulkan{' '}
            <strong className="text-emerald-300">TOTAL SKOR TERENDAH</strong> setelah{' '}
            <strong>9 ronde</strong> (atau 3/5 ronde mode cepat). Deck berisi{' '}
            <strong>112 kartu</strong>: 84 kartu angka <strong>0–6</strong> (4 warna × 3 kartu) +
            28 kartu aksi (Skip, Reverse, Draw Two, Double Draw Two).
          </p>
        </section>

        <section className="rounded-3xl bg-slate-900/90 border border-slate-800 p-5 space-y-2">
          <h2 className="font-display text-xl font-extrabold text-white flex items-center gap-2">
            <Grid2x2 className="w-5 h-5 text-sky-400" />
            2. Setup Awal &amp; Mekanik Giliran
          </h2>
          <ul className="list-disc list-inside space-y-1.5 text-sm text-slate-300">
            <li>Setiap pemain menerima <strong>6 kartu tertutup</strong> dalam formasi <strong>grid 2×3</strong> dan wajib membuka <strong>1 kartu awal</strong>.</li>
            <li>Ambil 1 kartu dari <strong>Discard Pile</strong> → wajib tukar dengan 1 kartu di grid (terbuka/tertutup), kartu lama dibuang terbuka ke Discard Pile. <strong>Larangan:</strong> jika kartu teratas Discard Pile adalah <strong>Kartu Aksi</strong> (Skip, Reverse, Draw Two, Double Draw Two), kartu tersebut <strong>tidak dapat diambil</strong>—pemain wajib mengambil dari Draw Pile.</li>
            <li>Ambil 1 kartu dari <strong>Draw Pile</strong> → boleh tukar dengan 1 kartu di grid, <strong>atau</strong> langsung buang ke Discard Pile lalu wajib membuka 1 kartu tertutup.</li>
            <li>Jika Draw Pile habis, seluruh Discard Pile (kecuali kartu teratas) dikocok ulang otomatis.</li>
          </ul>
        </section>

        <section className="rounded-3xl bg-emerald-950/30 border border-emerald-500/40 p-5 space-y-2">
          <h2 className="font-display text-xl font-extrabold text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" />
            3. Eliminasi Kolom Vertikal (0 Poin)
          </h2>
          <p className="text-sm text-slate-200 leading-relaxed">
            Jika 2 kartu <strong>TERBUKA</strong> dalam satu kolom vertikal memiliki{' '}
            <strong>ANGKA sama</strong> atau <strong>WARNA sama</strong>, keduanya otomatis
            disingkirkan dari grid (skor <strong>0 poin</strong>) dan grid langsung dirapikan.
          </p>
        </section>

        <section className="rounded-3xl bg-slate-900/90 border border-slate-800 p-5 space-y-4">
          <h2 className="font-display text-xl font-extrabold text-white">
            4. Kartu Aksi (Hanya Aktif Saat Dibuang ke Discard Pile)
          </h2>
          <p className="text-xs text-amber-200/90">
            Penting: Memasukkan kartu aksi ke dalam grid TIDAK mengaktifkan efeknya. Efek hanya
            aktif jika kartu aksi berakhir di Discard Pile pada giliran tersebut!
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-950/60 border border-slate-800">
              <UnoCard card={{ id: 'h-rev', type: 'reverse', color: 'green' }} size="sm" />
              <div>
                <h3 className="font-display font-bold text-white">Reverse (10 poin)</h3>
                <p className="text-xs text-slate-400">Membalikkan arah urutan giliran.</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-950/60 border border-slate-800">
              <UnoCard card={{ id: 'h-skip', type: 'skip', color: 'red' }} size="sm" />
              <div>
                <h3 className="font-display font-bold text-white">Skip (11 poin)</h3>
                <p className="text-xs text-slate-400">Melewatkan giliran pemain berikutnya.</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-950/60 border border-slate-800">
              <UnoCard card={{ id: 'h-d2', type: 'draw2', color: 'blue' }} size="sm" />
              <div>
                <h3 className="font-display font-bold text-white">Draw Two (12 poin)</h3>
                <p className="text-xs text-slate-400">Lawan berikutnya tambah 2 kartu tertutup (1 kolom baru di kanan grid).</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-950/60 border border-slate-800">
              <UnoCard card={{ id: 'h-dd2', type: 'double_draw2', color: 'yellow' }} size="sm" />
              <div>
                <h3 className="font-display font-bold text-white">Double Draw Two (22 poin)</h3>
                <p className="text-xs text-slate-400">Beri +4 kartu (2 kolom) ke 1 lawan ATAU +2 kartu (1 kolom) ke 2 lawan berbeda.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl bg-slate-900/90 border border-slate-800 p-5 space-y-2.5">
          <h2 className="font-display text-xl font-extrabold text-amber-300 flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            5. Seruan &ldquo;UNO!&rdquo;, Akhir Ronde &amp; Skor
          </h2>
          <p className="text-sm text-slate-300">
            Saat menyisakan <strong>1 kartu tertutup</strong>, tekan <strong>SERUKAN UNO!</strong>.
            Jika lupa dan ditantang (<strong>TANTANG / CATCH!</strong>) sebelum giliran berikutnya,
            dapatkan penalti +2 kartu tertutup (1 kolom baru).
          </p>
          <div className="rounded-2xl bg-slate-950/70 border border-slate-800 p-3.5 text-xs sm:text-sm text-slate-300 space-y-1">
            <div>• <strong>Angka 0–6:</strong> Sesuai angka kartu (0 = 0 poin, 6 = 6 poin).</div>
            <div>• <strong>Kartu Aksi:</strong> Reverse = <strong>10 poin</strong>, Skip = <strong>11 poin</strong>, Draw Two = <strong>12 poin</strong>, Double Draw Two = <strong>22 poin</strong>.</div>
            <div>• <strong>Urutan Ronde Berikutnya:</strong> Pemain dengan skor <strong>terendah</strong> pada ronde berjalan otomatis memulai duluan di ronde berikutnya!</div>
          </div>
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-3xl bg-slate-900/90 border border-slate-800 p-5 space-y-2">
            <h3 className="font-display font-bold text-base text-white flex items-center gap-2">
              <Bot className="w-5 h-5 text-amber-400" />
              Mode Single-Player vs AI
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Lawan 1–7 Bot AI strategis yang memprioritaskan kartu rendah (0–2), eliminasi kolom,
              membuang kartu tinggi (5–6), dan bisa menangkap UNO dalam 3 detik!
            </p>
          </div>
          <div className="rounded-3xl bg-slate-900/90 border border-slate-800 p-5 space-y-2">
            <h3 className="font-display font-bold text-base text-white flex items-center gap-2">
              <Globe className="w-5 h-5 text-sky-400" />
              Mode Multiplayer Online
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Buat/gabung room dengan kode unik (2–8 pemain), anti-cheat server-side (kartu tertutup
              tidak bisa diintip lewat DevTools), dan timer otomatis 20 detik per giliran.
            </p>
          </div>
        </section>

        <div className="rounded-2xl bg-rose-950/30 border border-rose-500/30 p-4 flex items-center gap-2 text-xs text-rose-200">
          <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400" />
          <span>Pastikan server multiplayer (`npm run dev:server`) aktif saat bermain Online.</span>
        </div>
      </div>
    </div>
  );
};
