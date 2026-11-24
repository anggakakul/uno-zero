import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Bot,
  Check,
  CheckCircle2,
  Circle,
  Copy,
  Crown,
  Gamepad2,
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
import {
  buildHubInviteLink,
  loadGuestNickname,
  saveGuestNickname,
} from '../../services/session';
import { OnlinePlayerNotice } from '../../types/game';
import { VARIANT_CATALOG, getVariantMetadata } from '../catalog';
import { TEAM_NAMES } from '../rulesets/unoTeams';
import { HubOnlineRoomInfo, VariantId, VariantSettings } from '../types';

type HubVariantId = Exclude<VariantId, 'uno-zero'>;

interface HubOnlineLobbyPageProps {
  initialVariantId: HubVariantId;
  initialSettings?: VariantSettings;
  room: HubOnlineRoomInfo | null;
  myPlayerId: string | null;
  prefillCode?: string | null;
  error: string | null;
  loading: boolean;
  connectionStatus: 'connected' | 'reconnecting' | 'disconnected';
  notice: OnlinePlayerNotice | null;
  onCreateRoom: (
    playerName: string,
    variantId: HubVariantId,
    settings: VariantSettings,
    fillWithBots: boolean,
    targetPlayerCount: number
  ) => void;
  onJoinRoom: (code: string, playerName: string) => void;
  onToggleReady: () => void;
  onUpdateRoomSettings: (payload: {
    variantId?: HubVariantId;
    fillWithBots?: boolean;
    targetPlayerCount?: number;
  }) => void;
  onStartGame: () => void;
  onLeaveRoom: () => void;
  onBack: () => void;
}

const HUB_VARIANTS = VARIANT_CATALOG.filter(
  (v): v is typeof v & { id: HubVariantId } => v.id !== 'uno-zero'
);

export const HubOnlineLobbyPage: React.FC<HubOnlineLobbyPageProps> = ({
  initialVariantId,
  initialSettings,
  room,
  myPlayerId,
  prefillCode,
  error,
  loading,
  connectionStatus,
  notice,
  onCreateRoom,
  onJoinRoom,
  onToggleReady,
  onUpdateRoomSettings,
  onStartGame,
  onLeaveRoom,
  onBack,
}) => {
  const [playerName, setPlayerName] = useState(() => loadGuestNickname() || 'Pemain');
  const [joinCode, setJoinCode] = useState(() => prefillCode ?? '');
  const [createVariantId, setCreateVariantId] = useState<HubVariantId>(initialVariantId);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    if (prefillCode) setJoinCode(prefillCode);
  }, [prefillCode]);

  const handleNameChange = (val: string) => {
    setPlayerName(val);
    saveGuestNickname(val);
  };

  const handleCopyCode = () => {
    if (!room) return;
    navigator.clipboard?.writeText(room.code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 1800);
  };

  const handleCopyInviteLink = () => {
    if (!room) return;
    navigator.clipboard?.writeText(buildHubInviteLink(room.code));
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2200);
  };

  if (room) {
    const meta = getVariantMetadata(room.variantId);
    const isHost = Boolean(myPlayerId && room.hostId === myPlayerId);
    const me = room.players.find((p) => p.id === myPlayerId);
    const connectedPlayers = room.players.filter((p) => p.connected);
    const allGuestsReady = connectedPlayers.every((p) => p.isHost || p.ready);
    const meetsMinPlayers =
      connectedPlayers.length >= 2 &&
      (room.fillWithBots ||
        (connectedPlayers.length >= meta.minPlayers &&
          (!meta.isTeamGame || connectedPlayers.length % 2 === 0)));
    const canStart = isHost && meetsMinPlayers && allGuestsReady;

    const validCounts = meta.isTeamGame
      ? [4, 6, 8]
      : Array.from(
          { length: Math.min(meta.maxPlayers, 10) - meta.minPlayers + 1 },
          (_, i) => meta.minPlayers + i
        );

    const inviteUrl = buildHubInviteLink(room.code);

    let startHint = `MULAI ${meta.name} (${
      room.fillWithBots ? Math.max(connectedPlayers.length, room.targetPlayerCount) : connectedPlayers.length
    } Pemain)`;
    if (connectedPlayers.length < 2) {
      startHint = 'Menunggu Minimal 2 Pemain Online...';
    } else if (!allGuestsReady) {
      startHint = 'Menunggu Semua Pemain Menekan SIAP (Ready)...';
    } else if (!meetsMinPlayers) {
      startHint = meta.isTeamGame
        ? `Butuh ${meta.minPlayers}/6/8 Pemain Genap (atau aktifkan Bot AI)`
        : `Butuh Minimal ${meta.minPlayers} Pemain (atau aktifkan Bot AI)`;
    }

    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4">
        <div className="max-w-2xl mx-auto space-y-5">
          {/* Top Bar */}
          <div className="flex items-center justify-between gap-2">
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
                  ? 'bg-amber-500/15 text-amber-300 animate-pulse'
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
              Kode Room Online • {meta.name}
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
                {copiedCode ? (
                  <Check className="w-5 h-5 text-emerald-400" />
                ) : (
                  <Copy className="w-5 h-5" />
                )}
              </button>
            </div>
            <div className="space-y-1.5">
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

          {/* Mode & Bot Fill Settings */}
          <div className="rounded-3xl bg-slate-900/90 border border-slate-800 p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <span className="font-display font-bold text-sm sm:text-base text-white flex items-center gap-2">
                <Gamepad2 className="w-4 h-4 text-amber-400" />
                Mode Permainan UNO
              </span>
              <span className="text-xs font-bold text-slate-400">
                {meta.minPlayers}–{meta.maxPlayers} Pemain
              </span>
            </div>

            {isHost ? (
              <select
                value={room.variantId}
                onChange={(e) =>
                  onUpdateRoomSettings({ variantId: e.target.value as HubVariantId })
                }
                className="w-full px-4 py-3 rounded-2xl bg-slate-950 border border-slate-700 text-white font-display font-bold text-sm focus:border-amber-400 focus:outline-none"
              >
                {HUB_VARIANTS.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.number}. {v.name} ({v.minPlayers}–{v.maxPlayers} pemain)
                  </option>
                ))}
              </select>
            ) : (
              <div
                className={`rounded-2xl p-4 bg-gradient-to-r ${meta.accentGradient} text-slate-950`}
              >
                <div className="font-display font-black text-lg text-white">{meta.name}</div>
                <div className="text-xs font-semibold text-white/90">{meta.tagline}</div>
              </div>
            )}

            {/* Fill With Bots Option */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-800">
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <Bot className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  Isi kursi kosong dengan Bot AI
                  {meta.minPlayers > 2 && (
                    <span className="text-amber-300 font-bold">
                      {' '}
                      (Direkomendasikan untuk {meta.name})
                    </span>
                  )}
                </span>
              </div>
              {isHost ? (
                <button
                  type="button"
                  onClick={() => onUpdateRoomSettings({ fillWithBots: !room.fillWithBots })}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-display font-black cursor-pointer transition ${
                    room.fillWithBots
                      ? 'bg-amber-400 text-slate-950'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {room.fillWithBots ? 'BOT AI: AKTIF' : 'BOT AI: NONAKTIF'}
                </button>
              ) : (
                <span className="text-xs font-bold text-slate-400">
                  {room.fillWithBots ? `Bot AI Aktif (Target ${room.targetPlayerCount})` : 'Khusus Pemain Online'}
                </span>
              )}
            </div>

            {isHost && room.fillWithBots && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-slate-400 font-semibold">Target total kursi:</span>
                {validCounts.map((cnt) => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() => onUpdateRoomSettings({ targetPlayerCount: cnt })}
                    className={`px-3 py-1 rounded-lg text-xs font-display font-black cursor-pointer ${
                      room.targetPlayerCount === cnt
                        ? 'bg-emerald-400 text-slate-950'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {cnt}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Players List */}
          <div className="rounded-3xl bg-slate-900/90 border border-slate-800 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-base text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-amber-400" />
                Pemain di Room ({room.players.length} / {meta.maxPlayers})
              </h2>
              <span className="text-xs text-slate-400">
                Minimal {room.fillWithBots ? 2 : meta.minPlayers} pemain
              </span>
            </div>
            <div className="space-y-2">
              {room.players.map((p, idx) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between px-4 py-2.5 rounded-2xl bg-slate-950/60 border border-slate-800 gap-2"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-7 h-7 rounded-lg bg-slate-800 font-display font-bold text-xs flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <span
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                        p.connected ? 'bg-emerald-400' : 'bg-rose-500 animate-pulse'
                      }`}
                      title={p.connected ? 'Online' : 'Terputus'}
                    />
                    <span className="font-bold text-sm text-white truncate">
                      {p.name}{' '}
                      {p.id === myPlayerId && <span className="text-sky-300">(Kamu)</span>}
                    </span>
                    {p.teamId !== undefined && (
                      <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 text-[10px] font-bold">
                        {TEAM_NAMES[p.teamId]}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
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
              <strong>Server-Authoritative &amp; Anti-Cheat Aktif:</strong> Kartu tersembunyi lawan
              tidak pernah dikirim ke perangkat lain. Jika koneksi terputus atau browser refresh,
              sesi permainanmu otomatis dipulihkan!
            </span>
          </div>

          {isHost ? (
            <button
              type="button"
              disabled={!canStart}
              onClick={onStartGame}
              className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 hover:from-amber-300 hover:to-rose-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-display font-black text-base sm:text-lg flex items-center justify-center gap-2 shadow-2xl cursor-pointer transition"
            >
              <Play className="w-5 h-5 fill-slate-950" />
              {startHint}
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

  // Entry screen: Join or Create Hub Online Room
  const createMeta = getVariantMetadata(createVariantId);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4">
      <div className="max-w-xl mx-auto space-y-6">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-sm font-semibold text-slate-200 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali ke UNO Hub
        </button>

        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-500/15 text-sky-300 text-xs font-bold">
            <Globe className="w-3.5 h-3.5" />
            Online Multiplayer • Server-Authoritative • Semua 19 Mode Hub
          </div>
          <h1 className="font-display text-3xl font-black text-white">Lobi Online UNO Hub</h1>
          <p className="text-sm text-slate-400">
            Buat room untuk mode UNO pilihanmu atau gabung room teman menggunakan kode / link.
          </p>
        </div>

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
          <label className="text-sm font-bold text-white">Nickname</label>
          <input
            type="text"
            maxLength={20}
            value={playerName}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="Masukkan nama tampilan..."
            className="w-full px-4 py-3 rounded-2xl bg-slate-950 border border-slate-700 text-white font-semibold focus:border-amber-400 focus:outline-none"
          />
        </div>

        {/* Join Room */}
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
              className="flex-1 px-4 py-3 rounded-2xl bg-slate-950 border border-slate-700 text-white font-display font-black tracking-widest uppercase focus:border-sky-400 focus:outline-none"
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
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-400">Pilih Mode UNO</label>
            <select
              value={createVariantId}
              onChange={(e) => setCreateVariantId(e.target.value as HubVariantId)}
              className="w-full px-4 py-3 rounded-2xl bg-slate-950 border border-slate-700 text-white font-display font-bold text-sm focus:border-amber-400 focus:outline-none"
            >
              {HUB_VARIANTS.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.number}. {v.name} ({v.minPlayers}–{v.maxPlayers} pemain)
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-400">{createMeta.tagline}</p>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              saveGuestNickname(playerName);
              const settingsToUse =
                createVariantId === initialVariantId && initialSettings
                  ? initialSettings
                  : createMeta.defaultSettings;
              onCreateRoom(
                playerName,
                createVariantId,
                settingsToUse,
                createMeta.minPlayers > 2,
                createMeta.minPlayers
              );
            }}
            className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 hover:from-amber-300 hover:to-rose-400 disabled:opacity-50 text-slate-950 font-display font-black text-base cursor-pointer transition"
          >
            {loading ? 'Menghubungkan...' : `BUAT ROOM ${createMeta.name}`}
          </button>
        </div>
      </div>
    </div>
  );
};
