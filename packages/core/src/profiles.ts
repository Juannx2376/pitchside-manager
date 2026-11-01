// Perfiles de crecimiento (estilo FC 27) y GRL dinámico (forma, moral, preparación).
// Los perfiles se asignan de forma determinista por jugador y sólo modulan el ritmo de desarrollo y declive.
import { hashString } from './rng';
import type { Player } from './player';
import { overall } from './player';
import { clamp } from './types';

export const GROWTH_PROFILES = ['earlyBloomer', 'lateBloomer', 'steady', 'explosive', 'shortPeak', 'longevity'] as const;
export type GrowthProfile = (typeof GROWTH_PROFILES)[number];

/** Pesos relativos de cada perfil en la población. */
const WEIGHTS: Record<GrowthProfile, number> = { earlyBloomer: 18, lateBloomer: 17, steady: 30, explosive: 10, shortPeak: 10, longevity: 15 };

export function growthProfileOf(p: Pick<Player, 'id' | 'growthProfile'>): GrowthProfile {
  if (p.growthProfile) return p.growthProfile;
  const total = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  let roll = hashString(`${p.id}:profile`) % total;
  for (const k of GROWTH_PROFILES) {
    roll -= WEIGHTS[k];
    if (roll < 0) return k;
  }
  return 'steady';
}

export interface ProfileMods {
  /** Multiplicador de crecimiento para <21 años, 21-24 y 24-28. */
  young: number;
  mid: number;
  late: number;
  /** Edad hasta la que sigue creciendo (28 por defecto). */
  growUntil: number;
  /** Edad a la que empieza el declive y su multiplicador. */
  declineFrom: number;
  declineMult: number;
}

export const PROFILE_MODS: Record<GrowthProfile, ProfileMods> = {
  earlyBloomer: { young: 1.45, mid: 0.8, late: 0.3, growUntil: 25, declineFrom: 30, declineMult: 1 },
  lateBloomer: { young: 0.6, mid: 1.2, late: 1.6, growUntil: 30, declineFrom: 32, declineMult: 0.9 },
  steady: { young: 1, mid: 1, late: 1, growUntil: 28, declineFrom: 30, declineMult: 1 },
  explosive: { young: 1.9, mid: 0.9, late: 0.3, growUntil: 24, declineFrom: 30, declineMult: 1 },
  shortPeak: { young: 1.2, mid: 1.1, late: 0.8, growUntil: 26, declineFrom: 28, declineMult: 1.5 },
  longevity: { young: 0.9, mid: 0.95, late: 1.1, growUntil: 29, declineFrom: 33, declineMult: 0.6 },
};

export function profileMods(p: Pick<Player, 'id' | 'growthProfile'>): ProfileMods {
  return PROFILE_MODS[growthProfileOf(p)];
}

// ───────────────────────── GRL dinámico ─────────────────────────

export interface OvrBreakdown {
  base: number;
  form: number;
  morale: number;
  readiness: number;
  total: number;
}

/**
 * Valoración "de hoy": la media base modulada por forma, moral y preparación (forma física/lesión). Usa los
 * mismos factores que el motor de partidos, así que lo que se ve es lo que rinde en el campo.
 */
export function ovrBreakdown(p: Player): OvrBreakdown {
  const base = overall(p);
  const moraleF = 0.93 + (0.14 * p.morale) / 100;
  const formF = 0.96 + (0.08 * p.form) / 100;
  const fitF = 0.85 + (0.15 * p.fitness) / 100;
  const injuryF = p.injury ? 0.9 : 1;
  const form = base * (formF - 1);
  const morale = base * (moraleF - 1);
  const readiness = base * (fitF * injuryF - 1);
  const total = clamp(Math.round(base + form + morale + readiness), 1, 99);
  return { base, form: Math.round(form * 10) / 10, morale: Math.round(morale * 10) / 10, readiness: Math.round(readiness * 10) / 10, total };
}

export function dynamicOvr(p: Player): number {
  return ovrBreakdown(p).total;
}
