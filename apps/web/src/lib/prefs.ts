// Preferencias visuales por espectador (tema, campo, densidad…). Viven en localStorage, no en la partida:
// cambiarlas nunca toca el estado del juego. Se aplican como atributos `data-*` en <html>, y toda la
// interfaz se tiñe a través de variables CSS (ver themes.css).
import { create } from 'zustand';

export type ThemeId = 'classic' | 'fc' | 'pes';
export type PitchStyle = 'stripes' | 'plain' | 'night';
export type ChipStyle = 'card' | 'disc';
export type Density = 'comfortable' | 'compact';
export type Motion = 'on' | 'off';

export const THEMES: ThemeId[] = ['classic', 'fc', 'pes'];
export const PITCH_STYLES: PitchStyle[] = ['stripes', 'plain', 'night'];
export const CHIP_STYLES: ChipStyle[] = ['card', 'disc'];
export const DENSITIES: Density[] = ['comfortable', 'compact'];
export const MOTIONS: Motion[] = ['on', 'off'];

export interface PrefsData {
  theme: ThemeId;
  pitch: PitchStyle;
  chips: ChipStyle;
  density: Density;
  motion: Motion;
  /** Guías de carriles sobre el campo de la pizarra. */
  lanes: boolean;
}

const KEY = 'pitchside.prefs';

export const DEFAULT_PREFS: PrefsData = { theme: 'fc', pitch: 'stripes', chips: 'card', density: 'comfortable', motion: 'on', lanes: true };

function pick<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

function load(): PrefsData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const o = JSON.parse(raw) as Partial<Record<keyof PrefsData, unknown>>;
    return {
      theme: pick(o.theme, THEMES, DEFAULT_PREFS.theme),
      pitch: pick(o.pitch, PITCH_STYLES, DEFAULT_PREFS.pitch),
      chips: pick(o.chips, CHIP_STYLES, DEFAULT_PREFS.chips),
      density: pick(o.density, DENSITIES, DEFAULT_PREFS.density),
      motion: pick(o.motion, MOTIONS, DEFAULT_PREFS.motion),
      lanes: typeof o.lanes === 'boolean' ? o.lanes : DEFAULT_PREFS.lanes,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function apply(p: PrefsData): void {
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  el.dataset.theme = p.theme;
  el.dataset.pitch = p.pitch;
  el.dataset.chips = p.chips;
  el.dataset.density = p.density;
  el.dataset.motion = p.motion;
}

function persist(p: PrefsData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* modo privado: las preferencias sólo duran la sesión */
  }
}

interface PrefsStore extends PrefsData {
  set: (patch: Partial<PrefsData>) => void;
  reset: () => void;
}

const initial = load();
apply(initial);

export const usePrefs = create<PrefsStore>((set, get) => ({
  ...initial,
  set: (patch) => {
    const { set: _s, reset: _r, ...cur } = get();
    const next: PrefsData = { ...cur, ...patch };
    apply(next);
    persist(next);
    set(next);
  },
  reset: () => {
    apply(DEFAULT_PREFS);
    persist(DEFAULT_PREFS);
    set({ ...DEFAULT_PREFS });
  },
}));
