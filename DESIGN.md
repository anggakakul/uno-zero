# DESIGN.md: UNO GAME HUB

> Reading this as: Tabletop digital card-game hub for casual & competitive Indonesian UNO players, in a tactile matte-felt arcade-table style, dial ENERGY 2 / RHYTHM 2 / MOTION 2.

**Dial:** `ENERGY 2 / RHYTHM 2 / MOTION 2`

---

## 1. Visual Soul & Benchmark (UNO ZERO Standard)

**UNO ZERO** (`src/pages/HomePage.tsx`, `src/pages/GamePage.tsx`) is the quality benchmark for this project. Its strength comes from feeling like a real, physical card table rather than a generic SaaS dashboard:

- **Surface & Lighting:** Matte emerald-navy felt (`#0c1f2e` center vignette fading into `#050b16` table edge) gives physical depth without distracting neon noise. Cards and active turns pop naturally against a calm, dark table.
- **Focal Point:** Every screen has exactly one dominant focal point. In gameplay, it is the active table arena (Draw/Discard piles + active player grid/hand). On the Hub landing page, it is the featured mode spotlight and mode catalog grid.
- **Identity Motif:** Tactile physical card geometry (`rounded-2xl` outer card frame, crisp inner border, tilted center oval, bold corner indices, and clean typographic hierarchy).
- **Typography:**
  - **Display (`Outfit`, 700-900, italic for titles/card emblems):** High-impact arcade-table legibility for game titles, card values, turn banners, and scoreboards.
  - **UI & Body (`Plus Jakarta Sans`, 400-700):** Clean, neutral Indonesian readability for rules, setup controls, and status indicators.
  - **Rules:** No decorative wide-tracked uppercase labels where normal sentence case reads faster. No monospace fonts except for literal room codes (`XXXX`) or numeric counters (`tabular-nums`).
- **Hub Shell Palette (2 core + 1 deliberate accent):**
  - Core Dark Surface: `#020617` (`slate-950`) & `#0f172a` (`slate-900`)
  - Core Felt Surface: `#0c1f2e` (emerald-navy felt)
  - Core Light Text: `#f1f5f9` (`slate-100`) & `#cbd5e1` (`slate-300`) for secondary text (never `slate-500` on `slate-900`, which fails AA at `3.75:1`)
  - Deliberate Hub Accent: Warm Amber `#fbbf24` (`amber-400`) used strictly for active filter states, active turn rings, and primary brand emphasis.
- **Anti-Slop Guardrails:**
  - **No ambient blur blobs (`blur-3xl` floating orbs):** Table depth comes from a single clean radial felt vignette, not stacked floating orbs.
  - **No multi-layer glassmorphism:** Limit `backdrop-blur` to at most 1 surface per screen (the sticky top bar or an active modal backdrop, never header + badge + hand dock + modal simultaneously).
  - **No decorative emoji in UI chrome:** Replace literal emojis in headers, badges, buttons, and status pills with crisp, consistent Lucide icons or clean text labels.
  - **No endless idle animations:** Never run `animate-pulse` or `animate-bounce` indefinitely on buttons or status badges. Motion must respond to a real game event (card played, FLIP transition, Mercy threshold hit, turn change) and respect `@media (prefers-reduced-motion: reduce)`.
  - **Strict CTA Contrast:** Every button must pass WCAG AA (`>= 4.5:1` normal text, `>= 3.0:1` large text). Use solid high-contrast surfaces or dark scrims rather than raw dark text over dark gradients (e.g., `slate-950` over `rose-700`/`slate-900`).

---

## 2. Distinct Visual Direction for All 11 Modes

Each mode inherits UNO ZERO's tactile card-table craft while owning a distinct table felt color, accent, card-back motif, and signature HUD mechanic so no two modes feel identical.

| # | Mode | Category | Table Felt & Surface | Core Accent | Card Back Motif | Signature HUD & Visual Cue | Mode Dial |
|---|---|---|---|---|---|---|---|
| 01 | **UNO CLASSIC** | Classic UNO | Deep crimson-slate parlor felt (`#2b0d12` -> `#070b14`) | Classic Red `#ef4444` + Gold `#fbbf24` | Classic crimson oval with crisp gold rim (`UNO`) | Active Add-On Packs strip in HUD (only rendered when packs are enabled) | E2 / R2 / M2 |
| 02 | **UNO FLIP!** | Action UNO | Dual-state surface: Crisp Daylight Sky felt (`#0c2a3e`) on Light Side; Deep Ultraviolet-Magenta felt (`#240a36`) on Dark Side | Light: Sky `#38bdf8`; Dark: Fuchsia `#e879f9` + Teal `#2dd4bf` | Dual-sided flip badge (`LIGHT` / `DARK`) with 3D flip transition on FLIP card | Full-table polarity shift (table felt, header border, card palette) + brief 900ms flip transition banner | E3 / R2 / M3 |
| 03 | **UNO ALL WILD** | Action UNO | Deep indigo velvet (`#16133a` -> `#080818`) so prismatic cards stay legible | Prismatic Magenta `#ec4899` + Cyan `#22d3ee` | Diagonal prism foil band with bold `WILD` emblem | Extreme-action callout strip (`Forced Swap`, `Skip Two`, `Targeted +2`) triggered on play | E3 / R2 / M2 |
| 04 | **UNO SHOW 'EM NO MERCY** | Action UNO | Charcoal-blood arena felt (`#23090d` -> `#050204`) | Crimson `#dc2626` + Warning Amber `#f59e0b` | Heavy dark-steel frame with crimson warning stripe (`MERCY`) | **Mercy Meter** (`X/25` progress bar) per player turning warning orange at 18+ and danger red at 22+, plus Stacking Penalty counter | E3 / R3 / M2 |
| 05 | **UNO FLEX** | Strategy UNO | Deep emerald-teal felt (`#07252d` -> `#020c12`) | Emerald `#10b981` (Ready) / Rose `#f43f5e` (Spent) | Split dual-color diagonal back (`FLEX`) | Tactile 2-sided **Power Card** toggle (Green Ready vs. Red Spent) + global reset indicator | E2 / R2 / M2 |
| 06 | **UNO ZERO** | Strategy UNO | Signature emerald-navy matte felt (`#0c1f2e` -> `#050b16`) | Warm Amber `#fbbf24` | Classic dark-navy frame with tilted red-gold UNO ZERO oval | 2x3 tactical face-down/face-up grid with column-elimination highlight & 9-round scorepad | E2 / R2 / M2 |
| 07 | **UNO TEAMS** | Team UNO | Balanced navy-cobalt table (`#0d1c33` -> `#050a14`) | Team A Sky `#38bdf8` vs. Team B Rose `#fb7185` (Team C Emerald `#34d399`) | Interlocking dual-tone team band (`TEAMS`) | Partner-link pairing strip across opposing seats + explicit Pass Symbol prompt banner | E2 / R2 / M2 |
| 08 | **UNO PARTY!** | Party & Social | Festive plum-velvet table (`#210d2e` -> `#090512`) | Festival Amber `#fbbf24` + Rose `#f43f5e` | Confetti-free geometric diamond back (`PARTY`) | Compact high-capacity seat ring (up to 16 players), Speed Jump-In trigger, & Point Taken indicator | E3 / R3 / M2 |
| 09 | **LIAR'S UNO** | Party & Social | Noir violet-charcoal felt (`#180e29` -> `#06040d`) | Noir Violet `#a78bfa` + Caution Gold `#facc15` | Minimalist masked-suit dark violet back (`LIAR`) | Face-down claim spotlight showing declared color/card + clear `Jujur` / `Tuduh Bohong` challenge bar | E2 / R3 / M2 |
| 10 | **DOS MODE** | Spinoff | Deep ocean-cyan felt (`#082436` -> `#040d1c`) | Cyan `#06b6d4` + Emerald `#10b981` | Twin-slot geometric back (`DOS 2`) | Dual Center Row piles with interactive single/double-match sum helper (`A + B = Target`) & `DOS!` button at 2 cards | E2 / R2 / M2 |
| 11 | **ONO 99** | Spinoff | Heated obsidian-ember felt (`#26100a` -> `#0a0404`) | Ember Orange `#f97316` -> Danger Red `#ef4444` (at 85+) | Numeric hazard frame (`99`) | Large tabular **Running Total Gauge** (`0-99`) as central focal point, shifting color as total approaches 99 | E3 / R2 / M2 |

---

## 3. Layout, Rhythm & Component Standards

### Hub Home (`HubHomePage.tsx`)
- **Break Card Uniformity (R-14):** Avoid 11 completely identical cards in a flat grid. Give the flagship mode (`01 UNO CLASSIC`) or active resume state a clear visual anchor, and ensure each mode card banner uses a high-contrast dark bottom scrim so text always exceeds `4.5:1`.
- **Consistent Indonesian CTAs (R-15):** Use clear, natural Indonesian labels across the entire app:
  - Primary card CTA: `Mainkan` (or `Lanjutkan` when a save exists).
  - Guide button: `Panduan` (with `aria-label="Panduan <Nama Mode>"` when icon-only).
  - Avoid mixing English and Indonesian (`AVAILABLE`, `PLAY NOW`, `CONTINUE`, `Settings`, `About`) in Indonesian screens.
- **No Unnecessary Status Clutter:** Remove the redundant `AVAILABLE` green pill from every card (all 11 listed modes are playable). Use that slot only for a meaningful live state such as `Tersimpan` when a local save exists.

### Accessibility & Interaction Standards (Hard Gate R-25, R-32, R-39)
- **Viewport:** `<meta name="viewport" content="width=device-width, initial-scale=1.0" />` (never `maximum-scale=1.0` or `user-scalable=no`).
- **Focus Ring:** Never apply `focus:outline-none` without a visible high-contrast `focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950`.
- **Keyboard & Modals:** Every modal (`Color Picker`, `Target Picker`, `Pass Card`, `Scorepad`, `Log`) must declare `role="dialog" aria-modal="true"`, trap or return focus cleanly, and close on `Escape` when dismissible.
- **Accessible Names:** Every icon-only button (`Back`, `Guide`, `Mute`, `Delete Save`, `Close`) must have an explicit Indonesian `aria-label`. Every form input must have an associated `<label htmlFor="...">` or `aria-label`.
- **Tap Targets (R-03):** All interactive buttons, filter pills, and header controls must meet a minimum `44px x 44px` hit area (`min-h-11 min-w-11` or equivalent padding) with at least `8px` gap between adjacent controls on mobile.
- **Reduced Motion:** Include a global `@media (prefers-reduced-motion: reduce)` rule in `src/index.css` and disable non-essential transitions/pulses when preferred.

### Copywriting Voice (`antislop-copywriting`)
- **Language:** Consistent, natural Indonesian across UI, cards, setup, and Panduan. Keep official Mattel card names (`Skip`, `Reverse`, `Draw Two`, `Wild`, `Flip`, `Mercy Rule`) only as proper nouns.
- **Punctuation:** Zero em dashes (`U+2014`) anywhere in `<title>`, UI copy, descriptions, or Panduan. Use commas, colons, periods, or parentheses instead.
- **Tone:** Direct, crisp, and game-table friendly. Avoid hype exclamation chains and ALL-CAPS shouting inside paragraphs (e.g., avoid `WAJIB`, `SEMUA`, `LANGSUNG TERSINGKIR!`).
