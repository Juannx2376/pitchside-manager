// Repetición 2D de una jugada destacada: genera fotogramas con las 22 posiciones y el balón.
// Es puro y determinista (semilla = minuto + tipo + jugador), así que la misma jugada se ve siempre igual.
import type { Highlight } from './highlights';
import { Rng, hashString } from './rng';
import type { TacticSlot } from './tactics';

/** Coordenadas del campo vertical: u = lateral 0-100 (izq→der), v = profundidad 0 (portería local) – 100 (visitante). */
export interface Pt {
  u: number;
  v: number;
}

export type ReplayKind = 'build' | 'pass' | 'shot' | 'goal' | 'save' | 'miss' | 'other';

export interface ReplayFrame {
  /** Milisegundos desde el inicio de la repetición. */
  t: number;
  ball: Pt;
  home: Pt[];
  away: Pt[];
  kind: ReplayKind;
  /** Jugador más cercano al balón (el que conduce / remata). */
  carrier: { side: 'home' | 'away'; idx: number };
}

export const REPLAY_STEP_MS = 650;

const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);

/** Posición de reposo de un hueco de la pizarra en el campo vertical. */
export function restingPoint(slot: TacticSlot, side: 'home' | 'away'): Pt {
  const depth = 4 + (100 - slot.y) * 0.72; // 0 = propia portería
  return side === 'home' ? { u: slot.x, v: depth } : { u: 100 - slot.x, v: 100 - depth };
}

function arrange(slots: TacticSlot[], side: 'home' | 'away', ball: Pt, attacking: boolean): Pt[] {
  const shift = (ball.v - 50) * (attacking ? 0.34 : 0.28);
  return slots.map((s, i) => {
    const rest = restingPoint(s, side);
    if (i === 0) return { u: clamp(rest.u + (ball.u - 50) * 0.1, 30, 70), v: rest.v + (side === 'home' ? Math.max(0, shift) * 0.2 : Math.min(0, shift) * 0.2) };
    let v = rest.v + shift;
    let u = rest.u;
    // Los más cercanos al balón se acercan más.
    const du = ball.u - u;
    const dv = ball.v - v;
    const dist = Math.hypot(du, dv);
    const pull = clamp(0.32 - dist / 160, 0, 0.32);
    u += du * pull;
    v += dv * pull;
    return { u: clamp(u, 3, 97), v: clamp(v, 5, 95) };
  });
}

function nearest(home: Pt[], away: Pt[], ball: Pt, side: 'home' | 'away'): { side: 'home' | 'away'; idx: number } {
  const list = side === 'home' ? home : away;
  let best = 1;
  let bd = Infinity;
  for (let i = 1; i < list.length; i++) {
    const d = Math.hypot(list[i].u - ball.u, list[i].v - ball.v);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return { side, idx: best };
}

/** Construye la repetición de un highlight con las pizarras de ambos equipos (once en orden de huecos). */
export function buildReplay(h: Pick<Highlight, 'minute' | 'type' | 'x' | 'y' | 'playerId'>, homeSlots: TacticSlot[], awaySlots: TacticSlot[]): ReplayFrame[] {
  const rng = new Rng(hashString(`${h.minute}:${h.type}:${h.playerId ?? ''}:${Math.round(h.x)}:${Math.round(h.y)}`));
  const attack: 'home' | 'away' = h.x >= 50 ? 'home' : 'away';
  const target: Pt = { u: clamp(h.y, 8, 92), v: clamp(h.x, 6, 94) };
  const startV = attack === 'home' ? rng.float(22, 38) : rng.float(62, 78);
  const start: Pt = { u: rng.float(25, 75), v: startV };
  const points: { p: Pt; kind: ReplayKind }[] = [{ p: start, kind: 'build' }];
  const passes = rng.int(3, 5);
  for (let i = 1; i <= passes; i++) {
    const k = i / (passes + 1);
    const wobble = rng.float(-16, 16) * (1 - k * 0.5);
    points.push({ p: { u: clamp(start.u + (target.u - start.u) * k + wobble, 6, 94), v: start.v + (target.v - start.v) * k }, kind: 'pass' });
  }
  points.push({ p: target, kind: 'shot' });
  const goalV = attack === 'home' ? 99 : 1;
  if (h.type === 'goal' || h.type === 'penalty_awarded') {
    points.push({ p: { u: clamp(50 + rng.float(-7, 7), 40, 60), v: goalV }, kind: 'goal' });
  } else if (h.type === 'save' || h.type === 'penalty_missed') {
    const side = rng.chance(0.5) ? 1 : -1;
    points.push({ p: { u: clamp(50 + side * rng.float(14, 24), 20, 80), v: goalV + (attack === 'home' ? -6 : 6) }, kind: 'save' });
  } else if (h.type === 'miss' || h.type === 'chance') {
    const side = rng.chance(0.5) ? 1 : -1;
    points.push({ p: { u: clamp(50 + side * rng.float(14, 22), 12, 88), v: clamp(goalV + (attack === 'home' ? 3 : -3), 1, 99) }, kind: 'miss' });
  } else {
    points.length = 1;
    points[0] = { p: target, kind: 'other' };
  }

  const frames: ReplayFrame[] = [];
  points.forEach((pt, i) => {
    const attackingHome = attack === 'home';
    const home = arrange(homeSlots, 'home', pt.p, attackingHome);
    const away = arrange(awaySlots, 'away', pt.p, !attackingHome);
    frames.push({ t: i * REPLAY_STEP_MS, ball: pt.p, home, away, kind: pt.kind, carrier: nearest(home, away, pt.p, attack) });
  });
  return frames;
}

export function replayDuration(frames: ReplayFrame[]): number {
  return frames.length ? frames[frames.length - 1].t + REPLAY_STEP_MS : 0;
}
