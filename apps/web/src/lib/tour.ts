// Estado del tutorial guiado. Vive en localStorage (por espectador), nunca en la partida.
import { create } from 'zustand';
import type { View } from '../store/game';

export interface TourStep {
  id: string;
  /** Vista a mostrar mientras dura el paso. */
  view: View;
  /** Valor de `data-tour` del elemento a resaltar (si falta, el paso se muestra centrado). */
  target?: string;
}

export const TOUR_STEPS: TourStep[] = [
  { id: 'welcome', view: 'hub' },
  { id: 'hub', view: 'hub', target: 'hub-match' },
  { id: 'continue', view: 'hub', target: 'continue' },
  { id: 'week', view: 'hub', target: 'hub-week' },
  { id: 'squad', view: 'squad', target: 'nav-squad' },
  { id: 'tactics', view: 'tactics', target: 'nav-tactics' },
  { id: 'training', view: 'training', target: 'nav-training' },
  { id: 'missions', view: 'objectives', target: 'nav-objectives' },
  { id: 'scouting', view: 'scouting', target: 'nav-scouting' },
  { id: 'transfers', view: 'transfers', target: 'nav-transfers' },
  { id: 'staff', view: 'staff', target: 'nav-staff' },
  { id: 'finances', view: 'finances', target: 'nav-finances' },
  { id: 'calendar', view: 'calendar', target: 'nav-calendar' },
  { id: 'matchday', view: 'hub', target: 'continue' },
  { id: 'inbox', view: 'inbox', target: 'nav-inbox' },
  { id: 'career', view: 'career', target: 'nav-career' },
  { id: 'done', view: 'hub' },
];

const KEY = 'pitchside.tour';

interface Saved {
  seen: boolean;
  step: number;
}

function load(): Saved {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Saved> | null;
    return { seen: !!o?.seen, step: Math.max(0, Math.min(TOUR_STEPS.length - 1, Number(o?.step) || 0)) };
  } catch {
    return { seen: false, step: 0 };
  }
}

function save(s: Saved): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* modo privado */
  }
}

interface TourStore extends Saved {
  active: boolean;
  start: () => void;
  next: () => void;
  prev: () => void;
  close: () => void;
  /** Reabre la oferta de tutorial (p. ej. al empezar otra carrera). */
  reset: () => void;
}

export const useTour = create<TourStore>((set, get) => ({
  ...load(),
  active: false,
  start: () => {
    save({ seen: true, step: 0 });
    set({ seen: true, step: 0, active: true });
  },
  next: () => {
    const step = get().step + 1;
    if (step >= TOUR_STEPS.length) {
      save({ seen: true, step: 0 });
      set({ active: false, step: 0, seen: true });
      return;
    }
    save({ seen: true, step });
    set({ step });
  },
  prev: () => {
    const step = Math.max(0, get().step - 1);
    save({ seen: true, step });
    set({ step });
  },
  close: () => {
    save({ seen: true, step: 0 });
    set({ active: false, seen: true, step: 0 });
  },
  reset: () => {
    save({ seen: false, step: 0 });
    set({ seen: false, active: false, step: 0 });
  },
}));
