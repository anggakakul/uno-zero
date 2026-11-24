const SESSION_ID_KEY = 'uno_zero_guest_session_id_v1';
const NICKNAME_KEY = 'uno_zero_guest_nickname_v1';
const ACTIVE_ROOM_KEY = 'uno_zero_active_room_v1';

export function getOrCreateSessionId(): string {
  try {
    let id = localStorage.getItem(SESSION_ID_KEY);
    if (!id) {
      id = `guest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
      localStorage.setItem(SESSION_ID_KEY, id);
    }
    return id;
  } catch {
    return `guest-${Date.now().toString(36)}`;
  }
}

export function loadGuestNickname(): string {
  try {
    return localStorage.getItem(NICKNAME_KEY) || '';
  } catch {
    return '';
  }
}

export function saveGuestNickname(name: string): void {
  try {
    localStorage.setItem(NICKNAME_KEY, name.trim());
  } catch {
    // Ignore storage error
  }
}

export function loadActiveRoomCode(): string | null {
  try {
    return localStorage.getItem(ACTIVE_ROOM_KEY);
  } catch {
    return null;
  }
}

export function saveActiveRoomCode(code: string | null): void {
  try {
    if (code) {
      localStorage.setItem(ACTIVE_ROOM_KEY, code.toUpperCase());
    } else {
      localStorage.removeItem(ACTIVE_ROOM_KEY);
    }
  } catch {
    // Ignore storage error
  }
}

export function getRoomCodeFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('room');
  if (!raw) return null;
  const clean = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return clean.length >= 4 && clean.length <= 6 ? clean : null;
}

export function setRoomCodeInUrl(code: string | null): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (code) {
    url.searchParams.set('room', code.toUpperCase());
  } else {
    url.searchParams.delete('room');
  }
  window.history.replaceState({}, '', url.toString());
}

export function buildInviteLink(roomCode: string): string {
  if (typeof window === 'undefined') return `/?room=${roomCode}`;
  return `${window.location.origin}/?room=${roomCode.toUpperCase()}`;
}
