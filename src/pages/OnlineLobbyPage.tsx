import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Circle,
  Copy,
  Crown,
  Flag,
  Globe,
  Link2,
  LogIn,
  Play,
  PlusCircle,
  ShieldCheck,
  Sparkles,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { OnlinePlayerNotice, OnlineRoomInfo } from '../types/game';
import {
  buildInviteLink,
  loadGuestNickname,
  saveGuestNickname,
} from '../services/session';

interface OnlineLobbyPageProps {
  room: OnlineRoomInfo | null;
  myPlayerId: string | null;
  prefillCode?: string | null;
  error: string | null;
  loading: boolean;
  connectionStatus?: 'connected' | 'reconnecting' | 'disconnected';
  notice?: OnlinePlayerNotice | null;
  onCreateRoom: (playerName: string, totalRounds: number) => void;
  onJoinRoom: (code: string, playerName: string) => void;
  onToggleReady?: () => void;
  onUpdateRounds: (rounds: number) => void;
  onStartOnlineGame: () => void;
  onLeaveRoom: () => void;
  onBack: () => void;
}

export const OnlineLobbyPage: React.FC<OnlineLobbyPageProps> = ({
  room,
  myPlayerId,
  prefillCode,
  error,
  loading,
  connectionStatus = 'connected',
  notice,
  onCreateRoom,
  onJoinRoom,
  onToggleReady,
  onUpdateRounds,
  onStartOnlineGame,
  onLeaveRoom,
  onBack,
}) => {
  const [playerName, setPlayerName] = useState(() => loadGuestNickname() || 'Pemain');
  const [joinCode, setJoinCode] = useState(() => prefillCode ?? '');
  const [initialRounds, setInitialRounds] = useState(9);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    if (prefillCode) {
      setJoinCode(prefillCode);
    }
  }, [prefillCode]);

  const handleNameChange = (val: string) => {
    setPlayerName(val);
    saveGuestNickname(val);
  };

  const isHost = Boolean(room && myPlayerId && room.hostId === myPlayerId);

  const handleCopyCode = () => {
    if (!room) return;
    navigator.clipboard?.writeText(room.code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 1800);
  };

  const handleCopyInviteLink = () => {
    if (!room) return;
    const link = buildInviteLink(room.code);
    navigator.clipboard?.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2200);
  };

  if (room) {
    const inviteUrl = buildInviteLink(room.code);
    const me = room.players.find((p) => p.id === myPlayerId);
    const connectedPlayers = room.players.filter((p) => p.connected);
    const allGuestsReady = connectedPlayers.every((p) => p.isHost || p.ready);
    const canStart = isHost && connectedPlayers.length >= 2 && allGuestsReady;

    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4">
        <div className="max-w-xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onLeaveRoom}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-sm font-semibold text-slate-200 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              Keluar Room
            </button>
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                connectionStatus === 'connected'
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : connectionStatus === 'reconnecting'
                  ? 'bg-amber-500/15 text-amber-300'
                  : 'bg-rose-500/15 text-rose-300'
              }`}
            >
              {connectionStatus === 'connected' ? (
                <Wifi className="w-3.5 h-3.5" />
              ) : (
                <WifiOff className="w-3.5 h-3.5" />
              )}
              {connectionStatus === 'connected'
                ? 'Terhubung Real-Time'
                : connectionStatus === 'reconnecting'
                ? 'Menyambung Ulang...'
                : 'Terputus'}
            </span>
          </div>

          {notice && (
            <div className="rounded-2xl bg-sky-500/15 border border-sky-400/40 px-4 py-2.5 text-xs font-bold text-sky-200">
              🔔 {notice.message}
            </div>
          )}

          {error && (
            <div className="rounded-2xl bg-rose-950/70 border border-rose-500/60 p-3.5 text-xs sm:text-sm text-rose-200 font-semibold">
              {error}
            </div>
          )}

          {/* Room Code & Shareable Invite Link */}
          <div className="rounded-3xl bg-gradient-to-br from-sky-500/15 via-slate-900 to-slate-900 border border-sky-400/40 p-6 text-center space-y-4">
            <span className="text-xs font-bold uppercase tracking-widest text-sky-300">
              Kode Room Online
            </span>
            <div className="flex items-center justify-center gap-3">
              <span className="font-display text-4xl sm:text-5xl font-black tracking-[0.2em] text-white">
                {room.code}
              </span>
              <button
                type="button"
                onClick={handleCopyCode}
                className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 cursor-pointer"
                title="Salin Kode Room"
              >
                {copiedCode ? <Check className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5" />}
              </button>
            </div>

            {/* Shareable Invite Link Button */}
            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={handleCopyInviteLink}
                className="w-full py-3 px-4 rounded-2xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-display font-black text-sm flex items-center justify-center gap-2 shadow-lg cursor-pointer transition active:scale-[0.98]"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-4 h-4" />
                    LINK UNDANGAN DISALIN!
                  </>
                ) : (
                  <>
                    <Link2 className="w-4 h-4" />
                    SALIN LINK UNDANGAN
                  </>
                )}
              </button>
              <p className="text-[11px] text-slate-400 break-all font-mono">{inviteUrl}</p>
            </div>
          </div>

          {/* Host Round Settings */}
          <div className="rounded-3xl bg-slate-900/90 border border-slate-800 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-display font-bold text-sm sm:text-base text-white flex items-center gap-2">
                <Flag className="w-4 h-4 text-emerald-400" />
                Target Ronde
              </span>
              <span className="font-display font-black text-emerald-300">
                {room.totalRounds} Ronde
              </span>
            </div>
            {isHost ? (
              <div className="flex gap-2">
                {[3, 5, 9].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => onUpdateRounds(r)}
                    className={`flex-1 py-2 rounded-xl font-display font-bold text-sm cursor-pointer transition ${
                      room.totalRounds === r
                        ? 'bg-emerald-400 text-slate-950'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                    }`}
                  >
                    {r === 9 ? '9 Ronde (Resmi)' : `${r} Ronde (Cepat)`}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400">
                Hanya Host yang dapat mengubah pengaturan ronde.
              </p>
            )}
          </div>

          {/* Players List */}
          <div className="rounded-3xl bg-slate-900/90 border border-slate-800 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-base text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-amber-400" />
                Pemain di Room ({room.players.length} / 8)
              </h2>
              <span className="text-xs text-slate-400">Minimal 2 pemain</span>
            </div>
            <div className="space-y-2">
              {room.players.map((p, idx) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between px-4 py-2.5 rounded-2xl bg-slate-950/60 border border-slate-800"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-lg bg-slate-800 font-display font-bold text-xs flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        p.connected ? 'bg-emerald-400' : 'bg-rose-500'
                      }`}
                      title={p.connected ? 'Online' : 'Terputus'}
                    />
                    <span className="font-bold text-sm text-white">
                      {p.name} {p.id === myPlayerId && <span className="text-sky-300">(Kamu)</span>}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {!p.connected && (
                      <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-bold">
                        Offline
                      </span>
                    )}
                    {p.isHost ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-400/15 text-amber-300 text-xs font-bold">
                        <Crown className="w-3 h-3" />
                        Host
                      </span>
                    ) : p.ready ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold">
                        <CheckCircle2 className="w-3 h-3" />
                        Siap
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 text-xs font-bold">
                        <Circle className="w-3 h-3" />
                        Belum Siap
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-slate-900/70 border border-slate-800 p-4 flex items-start gap-2.5 text-xs text-slate-300">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <span>
              <strong>Anti-Cheat, Auto-Reconnect &amp; Timer 20 Detik Aktif:</strong> Jika browser
              ter-refresh saat bermain, kamu otomatis terhubung kembali ke kursi dan grid kartumu!
            </span>
          </div>

          {isHost ? (
            <button
              type="button"
              disabled={!canStart}
              onClick={onStartOnlineGame}
              className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 hover:from-amber-300 hover:to-rose-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-display font-black text-lg flex items-center justify-center gap-2 shadow-2xl cursor-pointer transition"
            >
              <Play className="w-5 h-5 fill-slate-950" />
              {connectedPlayers.length < 2
                ? 'Menunggu Minimal 2 Pemain...'
                : !allGuestsReady
                ? 'Menunggu Semua Pemain SIAP...'
                : `MULAI PERMAINAN (${connectedPlayers.length} Pemain)`}
            </button>
          ) : (
            <button
              type="button"
              onClick={onToggleReady}
              className={`w-full py-4 px-6 rounded-2xl font-display font-black text-base sm:text-lg flex items-center justify-center gap-2 shadow-xl cursor-pointer transition ${
                me?.ready
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                  : 'bg-sky-500 hover:bg-sky-400 text-slate-950'
              }`}
            >
              <CheckCircle2 className="w-5 h-5" />
              {me?.ready ? 'SUDAH SIAP ✓ (Klik untuk Batal)' : 'TEKAN SIAP (READY)'}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4">
      <div className="max-w-xl mx-auto space-y-6">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-sm font-semibold text-slate-200 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Menu Utama
        </button>

        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-500/15 text-sky-300 text-xs font-bold">
            <Globe className="w-3.5 h-3.5" />
            Guest Play • Tanpa Registrasi • 2–8 Pemain
          </div>
          <h1 className="font-display text-3xl font-black text-white">Lobi Online UNO ZERO</h1>
          <p className="text-sm text-slate-400">
            Cukup masukkan Nickname, lalu buat room atau gabung lewat kode / link undangan.
          </p>
        </div>

        {/* Invite Link Welcome Banner */}
        {prefillCode && (
          <div className="rounded-2xl bg-emerald-500/15 border border-emerald-400/50 p-4 flex items-center gap-3 text-sm text-emerald-200">
            <Sparkles className="w-5 h-5 text-emerald-300 shrink-0" />
            <span>
              Kamu diundang ke Room <strong className="font-mono text-white">{prefillCode}</strong>!
              Masukkan nickname lalu klik <strong>GABUNG</strong>.
            </span>
          </div>
        )}

        {error && (
          <div className="rounded-2xl bg-rose-950/70 border border-rose-500/60 p-4 text-sm text-rose-200 font-semibold">
            {error}
          </div>
        )}

        {/* Guest Nickname */}
        <div className="rounded-3xl bg-slate-900/90 border border-slate-800 p-5 space-y-2">
          <label className="text-sm font-bold text-white">Nickname (Tersimpan Otomatis)</label>
          <input
            type="text"
            maxLength={18}
            value={playerName}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="Masukkan nama tampilan..."
            className="w-full px-4 py-3 rounded-2xl bg-slate-950 border border-slate-700 text-white font-semibold focus:border-amber-400"
          />
        </div>

        {/* Join Room (prioritized at top if opened via Invite Link!) */}
        <div
          className={`rounded-3xl bg-slate-900/90 border p-5 space-y-4 ${
            prefillCode ? 'border-emerald-400/60 ring-2 ring-emerald-400/20' : 'border-slate-800'
          }`}
        >
          <h2 className="font-display font-bold text-lg text-white flex items-center gap-2">
            <LogIn className="w-5 h-5 text-sky-400" />
            Gabung Room dengan Kode
          </h2>
          <div className="flex gap-2">
            <input
              type="text"
              maxLength={6}
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Contoh: K7M9P"
              className="flex-1 px-4 py-3 rounded-2xl bg-slate-950 border border-slate-700 text-white font-display font-black tracking-widest uppercase focus:border-sky-400"
            />
            <button
              type="button"
              disabled={loading || joinCode.trim().length < 4}
              onClick={() => {
                saveGuestNickname(playerName);
                onJoinRoom(joinCode, playerName);
              }}
              className="px-6 py-3 rounded-2xl bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-slate-950 font-display font-black text-sm cursor-pointer transition"
            >
              GABUNG
            </button>
          </div>
        </div>

        {/* Create Room */}
        <div className="rounded-3xl bg-slate-900/90 border border-slate-800 p-5 space-y-4">
          <h2 className="font-display font-bold text-lg text-white flex items-center gap-2">
            <PlusCircle className="w-5 h-5 text-amber-400" />
            Buat Room Baru
          </h2>
          <div className="flex gap-2">
            {[3, 5, 9].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setInitialRounds(r)}
                className={`flex-1 py-2 rounded-xl font-display font-bold text-xs sm:text-sm cursor-pointer ${
                  initialRounds === r
                    ? 'bg-emerald-400 text-slate-950'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                }`}
              >
                {r === 9 ? '9 Ronde (Resmi)' : `${r} Ronde`}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              saveGuestNickname(playerName);
              onCreateRoom(playerName, initialRounds);
            }}
            className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 hover:from-amber-300 hover:to-rose-400 disabled:opacity-50 text-slate-950 font-display font-black text-base cursor-pointer transition"
          >
            {loading ? 'Menghubungkan...' : 'BUAT ROOM SEKARANG'}
          </button>
        </div>
      </div>
    </div>
  );
};
