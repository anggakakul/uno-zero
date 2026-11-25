import { soundFX } from './sound';

let preloaded = false;

/**
 * Preloads core visual assets and primes the Web Audio context on first user gesture
 * while the player is in the lobby so gameplay starts without delay or flicker.
 */
export function preloadHubAssets(): void {
  if (preloaded || typeof window === 'undefined') return;
  preloaded = true;

  const img = new Image();
  img.src = '/icon.svg';

  const unlockAudio = () => {
    soundFX.warmup();
    window.removeEventListener('pointerdown', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
  };

  window.addEventListener('pointerdown', unlockAudio, { once: true, passive: true });
  window.addEventListener('keydown', unlockAudio, { once: true, passive: true });
}
