// Definición de atributos (escala 1–99) y su peso por posición.
import type { Position } from './types';

export const TECHNICAL = [
  'finishing',
  'passing',
  'dribbling',
  'firstTouch',
  'crossing',
  'tackling',
  'marking',
  'heading',
  'longShots',
  'setPieces',
] as const;
export const PHYSICAL = ['pace', 'acceleration', 'stamina', 'strength', 'agility', 'jumping', 'naturalFitness'] as const;
export const MENTAL = [
  'vision',
  'decisions',
  'positioning',
  'composure',
  'workRate',
  'teamwork',
  'aggression',
  'leadership',
] as const;
export const GOALKEEPING = ['reflexes', 'handling', 'oneOnOnes'] as const;

export const ATTRIBUTE_KEYS = [...TECHNICAL, ...PHYSICAL, ...MENTAL, ...GOALKEEPING] as const;
export type AttrKey = (typeof ATTRIBUTE_KEYS)[number];
export type Attributes = Record<AttrKey, number>;

export const HIDDEN_KEYS = [
  'consistency',
  'adaptability',
  'injuryProneness',
  'ambition',
  'professionalism',
  'bigMatches',
  'loyalty',
] as const;
export type HiddenKey = (typeof HIDDEN_KEYS)[number];
export type HiddenAttributes = Record<HiddenKey, number>;

// Las etiquetas de atributos están en los diccionarios de i18n (attr.*, attrShort.*, hidden.*).

type Weights = Partial<Record<AttrKey, number>>;

/** Peso relativo de cada atributo para calcular la media en una posición. */
export const POSITION_WEIGHTS: Record<Position, Weights> = {
  GK: { reflexes: 5, handling: 4, oneOnOnes: 4, positioning: 3, decisions: 2, composure: 2, jumping: 1.5, agility: 1.5, passing: 0.5, leadership: 1 },
  CB: { marking: 4, tackling: 4, heading: 3.5, positioning: 3.5, strength: 3, jumping: 2.5, decisions: 2, composure: 1.5, pace: 1.5, passing: 1, aggression: 1 },
  RB: { tackling: 3, marking: 2.5, pace: 3, acceleration: 2, stamina: 3, crossing: 2.5, positioning: 2.5, workRate: 2, dribbling: 1, passing: 1.5, teamwork: 1 },
  LB: { tackling: 3, marking: 2.5, pace: 3, acceleration: 2, stamina: 3, crossing: 2.5, positioning: 2.5, workRate: 2, dribbling: 1, passing: 1.5, teamwork: 1 },
  DM: { tackling: 3.5, marking: 2.5, positioning: 3.5, passing: 3, decisions: 3, stamina: 2, strength: 2, teamwork: 2, workRate: 2, composure: 1.5, vision: 1 },
  CM: { passing: 4, vision: 3, decisions: 3, firstTouch: 3, stamina: 2.5, teamwork: 2, workRate: 2, tackling: 1.5, dribbling: 1.5, composure: 2, longShots: 1 },
  AM: { passing: 3, vision: 4, dribbling: 3.5, firstTouch: 3.5, decisions: 2.5, composure: 2, finishing: 2, longShots: 2, agility: 1.5, acceleration: 1 },
  RW: { dribbling: 4, pace: 3.5, acceleration: 3, crossing: 3, firstTouch: 2.5, agility: 2.5, finishing: 2, passing: 1.5, decisions: 1, workRate: 1 },
  LW: { dribbling: 4, pace: 3.5, acceleration: 3, crossing: 3, firstTouch: 2.5, agility: 2.5, finishing: 2, passing: 1.5, decisions: 1, workRate: 1 },
  ST: { finishing: 5, composure: 3, firstTouch: 2.5, heading: 2.5, positioning: 3, pace: 2, acceleration: 2, strength: 2, dribbling: 1.5, decisions: 1.5, jumping: 1 },
};

export function weightedAttrAvg(attrs: Attributes, weights: Weights): number {
  let s = 0;
  let w = 0;
  for (const k in weights) {
    const key = k as AttrKey;
    const wt = weights[key] ?? 0;
    s += attrs[key] * wt;
    w += wt;
  }
  return w === 0 ? 0 : s / w;
}

/** Sesgos de atributos por perfil regional; los usan la generación de jugadores y el scouting. */
export type RegionProfile =
  | 'iberian'
  | 'british'
  | 'central'
  | 'italian'
  | 'french'
  | 'lowlands'
  | 'nordic'
  | 'eastern'
  | 'balkan'
  | 'turkic'
  | 'latin_south'
  | 'brazil'
  | 'andean'
  | 'central_america'
  | 'caribbean'
  | 'north_america'
  | 'west_africa'
  | 'north_africa'
  | 'east_south_africa'
  | 'middle_east'
  | 'central_asia'
  | 'east_asia'
  | 'southeast_asia'
  | 'south_asia'
  | 'oceania';

export const REGION_PROFILES: Record<RegionProfile, Weights> = {
  iberian: { passing: 5, firstTouch: 5, dribbling: 3, vision: 4, decisions: 2, strength: -3, heading: -2 },
  british: { strength: 4, heading: 5, workRate: 5, stamina: 3, aggression: 3, firstTouch: -3, vision: -2 },
  central: { positioning: 4, decisions: 3, stamina: 4, strength: 3, workRate: 3, teamwork: 3, dribbling: -1 },
  italian: { marking: 5, tackling: 4, positioning: 5, decisions: 3, composure: 2, pace: -2 },
  french: { pace: 4, strength: 3, dribbling: 3, agility: 3, acceleration: 2 },
  lowlands: { passing: 4, vision: 3, firstTouch: 3, positioning: 2, teamwork: 2 },
  nordic: { strength: 5, heading: 5, jumping: 3, workRate: 4, teamwork: 3, dribbling: -3, agility: -2 },
  eastern: { stamina: 3, strength: 3, longShots: 3, workRate: 2, dribbling: -1 },
  balkan: { firstTouch: 3, longShots: 4, vision: 3, heading: 2, workRate: -2, composure: -1 },
  turkic: { dribbling: 2, longShots: 2, aggression: 4, composure: -2 },
  latin_south: { dribbling: 4, firstTouch: 3, aggression: 5, composure: 3, tackling: 3, leadership: 2 },
  brazil: { dribbling: 7, firstTouch: 5, agility: 5, setPieces: 3, acceleration: 2, positioning: -2, marking: -3 },
  andean: { pace: 5, dribbling: 5, agility: 4, acceleration: 4, strength: -2, positioning: -2, decisions: -2 },
  central_america: { pace: 3, agility: 3, dribbling: 2, strength: -2 },
  caribbean: { pace: 6, acceleration: 5, strength: 2, decisions: -4, firstTouch: -2 },
  north_america: { stamina: 5, pace: 3, workRate: 4, teamwork: 3, firstTouch: -2, vision: -2 },
  west_africa: { pace: 6, strength: 6, stamina: 4, jumping: 3, decisions: -3, positioning: -2 },
  north_africa: { dribbling: 5, firstTouch: 4, agility: 3, strength: -1 },
  east_south_africa: { pace: 4, agility: 3, stamina: 3, decisions: -2 },
  middle_east: { dribbling: 2, pace: 2, workRate: -3, stamina: -2 },
  central_asia: { strength: 2, stamina: 2, workRate: 2, vision: -2 },
  east_asia: { stamina: 6, workRate: 6, teamwork: 5, acceleration: 3, strength: -5, heading: -4, composure: -1 },
  southeast_asia: { agility: 5, acceleration: 4, stamina: 2, strength: -6, heading: -5, jumping: -3 },
  south_asia: { stamina: 2, strength: -3, firstTouch: -3 },
  oceania: { strength: 4, heading: 3, workRate: 3, firstTouch: -3, dribbling: -3 },
};
