import React, { useState } from 'react';
import { MessageSquare, X } from 'lucide-react';

export interface QuickEmoteItem {
  id: string;
  label: string;
}

export const QUICK_EMOTES: QuickEmoteItem[] = [
  { id: 'gg', label: 'GG!' },
  { id: 'nice', label: 'Mantap!' },
  { id: 'oops', label: 'Waduh!' },
  { id: 'watch', label: 'Hati-hati' },
  { id: 'hurry', label: 'Cepat!' },
  { id: 'uno', label: 'UNO!' },
];

interface QuickEmoteBarProps {
  onSendEmote: (emoteId: string, label: string) => void;
}

export const QuickEmoteBar: React.FC<QuickEmoteBarProps> = ({ onSendEmote }) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative flex items-center">
      <button
        type="button"
        aria-expanded={open}
        aria-label="Kirim reaksi cepat"
        onClick={() => setOpen((v) => !v)}
        className={`min-h-9 px-3 py-1.5 rounded-lg border text-[11px] font-display font-bold inline-flex items-center gap-1.5 transition ${
          open
            ? 'bg-amber-400 text-slate-950 border-amber-300'
            : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700'
        }`}
      >
        {open ? <X className="w-3.5 h-3.5" /> : <MessageSquare className="w-3.5 h-3.5" />}
        Reaksi
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Daftar reaksi cepat"
          className="absolute bottom-full right-0 mb-2 z-30 flex items-center gap-1.5 p-1.5 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl"
        >
          {QUICK_EMOTES.map((em) => (
            <button
              key={em.id}
              type="button"
              role="menuitem"
              onClick={() => {
                onSendEmote(em.id, em.label);
                setOpen(false);
              }}
              className="min-h-9 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-amber-400 hover:text-slate-950 text-slate-100 font-display font-bold text-xs whitespace-nowrap transition"
            >
              {em.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
