import React from 'react';
import { WifiOff } from 'lucide-react';

interface ConnectionStatusBannerProps {
  status: 'connected' | 'reconnecting' | 'disconnected';
}

export const ConnectionStatusBanner: React.FC<ConnectionStatusBannerProps> = ({ status }) => {
  if (status === 'connected') return null;

  const isReconnecting = status === 'reconnecting';

  return (
    <div
      role="status"
      aria-live="polite"
      className={`w-full px-4 py-2 text-center text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 border-b ${
        isReconnecting
          ? 'bg-amber-950/95 border-amber-400/50 text-amber-200'
          : 'bg-rose-950/95 border-rose-500/50 text-rose-200'
      }`}
    >
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>
        {isReconnecting
          ? 'Menyambung ulang ke meja... Permainanmu tetap aman.'
          : 'Koneksi terputus sementara. Mencoba menyambung kembali tanpa mengeluarkanmu dari meja...'}
      </span>
    </div>
  );
};
