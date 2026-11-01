// Tácticas al estilo Soccer Manager / FIFA Manager:
//   · posiciones libres en el campo (x, y) — la posición de cada hueco se deduce de dónde está;
//   · deslizadores (mentalidad, ritmo, amplitud, presión, línea defensiva, juego directo, dureza)
//     y opciones (trampa del fuera de juego, contraataque, perder tiempo);
//   · roles por jugador (pivote recuperador, delantero de área, extremo a pierna cambiada…).
// Los antiguos "estilos" son presets que rellenan esos valores. El simulador recibe unos
// modificadores calculados a partir de la táctica concreta, no de una tabla fija.
import { ATTRIBUTE_KEYS, GOALKEEPING, type AttrKey, type Attributes, type RegionProfile } from './attributes';
import type { Player } from './player';
import { FORMATIONS, TACTICAL_STYLES, clamp, type Formation, type Position, type TacticalStyle } from './types';

export interface StyleMods {
  possession: number;
  chanceRate: number;
  chanceQuality: number;
  counterThreat: number;
  defensiveSolidity: number;
  foulRate: number;
  fatigue: number;
  aerialShare: number;
  /** Probabilidad extra de pillar al rival en fuera de juego (y riesgo si falla). */
  offsideTrap: number;
  /** Vulnerabilidad a balones a la espalda (línea alta). */
  spaceBehind: number;
}

export interface TacticSliders {
  /** 0 ultradefensiva · 100 ultraofensiva */
  mentality: number;
  tempo: number;
  width: number;
  pressing: number;
  defensiveLine: number;
  /** 0 pase corto · 100 balones largos */
  directness: number;
  /** 0 entradas suaves · 100 agresivas */
  tackling: number;
  offsideTrap: boolean;
  counterAttack: boolean;
  timeWasting: boolean;
}

export const PLAYER_ROLES = [
  'default',
  'sweeperKeeper',
  'stayBack',
  'getForward',
  'ballWinner',
  'playmaker',
  'boxToBox',
  'cutInside',
  'stayWide',
  'targetMan',
  'poacher',
  'falseNine',
  'freeRole',
  // Táctica V3: roles detallados al estilo Soccer Manager / FIFA Manager.
  'ballPlayingKeeper',
  'stopper',
  'coverDefender',
  'ballPlayingDefender',
  'libero',
  'wingBack',
  'invertedWingBack',
  'anchor',
  'halfBack',
  'deepPlaymaker',
  'mezzala',
  'carrilero',
  'advancedPlaymaker',
  'shadowStriker',
  'insideForward',
  'winger',
  'advancedForward',
  'pressingForward',
  'completeForward',
  'trequartista',
] as const;
export type PlayerRole = (typeof PLAYER_ROLES)[number];

/** Roles con sentido en cada grupo de posición (la pizarra usa `rolesForPosition`, más fino). */
export const ROLES_BY_GROUP: Record<'GK' | 'DEF' | 'MID' | 'ATT', PlayerRole[]> = {
  GK: ['default', 'sweeperKeeper', 'ballPlayingKeeper'],
  DEF: ['default', 'stayBack', 'getForward', 'ballWinner', 'stopper', 'coverDefender', 'ballPlayingDefender', 'libero', 'wingBack', 'invertedWingBack'],
  MID: ['default', 'ballWinner', 'playmaker', 'boxToBox', 'getForward', 'stayBack', 'freeRole', 'anchor', 'halfBack', 'deepPlaymaker', 'mezzala', 'carrilero', 'advancedPlaymaker', 'shadowStriker'],
  ATT: ['default', 'cutInside', 'stayWide', 'targetMan', 'poacher', 'falseNine', 'freeRole', 'insideForward', 'winger', 'advancedForward', 'pressingForward', 'completeForward', 'trequartista', 'shadowStriker'],
};

/**
 * Carril de ataque de un jugador (por qué banda/canal juega cuando el equipo ataca).
 * `auto` = el carril de su posición en la pizarra; el resto fuerza el carril: así un extremo
 * zurdo puede atacar por dentro, o un lateral hacer de carrilero por el pasillo interior.
 */
export const PLAYER_CHANNELS = ['auto', 'left', 'halfLeft', 'center', 'halfRight', 'right'] as const;
export type PlayerChannel = (typeof PLAYER_CHANNELS)[number];

/** Riesgo de los pases de un jugador. */
export const PASSING_RISKS = ['safe', 'mixed', 'risky'] as const;
export type PassingRisk = (typeof PASSING_RISKS)[number];

/** Por qué lado dirige el equipo sus ataques. */
export const ATTACK_SIDES = ['balanced', 'left', 'center', 'right'] as const;
export type AttackSide = (typeof ATTACK_SIDES)[number];

/** Marcaje del equipo: por zonas, mixto u hombre a hombre. */
export const MARKING_STYLES = ['zonal', 'mixed', 'man'] as const;
export type MarkingStyle = (typeof MARKING_STYLES)[number];

/** Qué hace el equipo al perder o ganar el balón. */
export const TRANSITION_STYLES = ['regroup', 'balanced', 'counterPress'] as const;
export type TransitionStyle = (typeof TRANSITION_STYLES)[number];

/** Estrategia de córners y faltas (balón parado ofensivo). */
export const CORNER_STYLES = ['mixed', 'near', 'far', 'short'] as const;
export type CornerStyle = (typeof CORNER_STYLES)[number];
export const FREEKICK_STYLES = ['mixed', 'shoot', 'cross'] as const;
export type FreeKickStyle = (typeof FREEKICK_STYLES)[number];

/** Plan del equipo cuando va ganando / perdiendo (a partir del minuto 55). */
export const LEADING_PLANS = ['normal', 'control', 'protect'] as const;
export type LeadingPlan = (typeof LEADING_PLANS)[number];
export const TRAILING_PLANS = ['normal', 'press', 'allIn'] as const;
export type TrailingPlan = (typeof TRAILING_PLANS)[number];

/** Hueco de la pizarra. x: 0 izquierda · 100 derecha. y: 0 portería rival · 100 portería propia. */
export interface TacticSlot {
  x: number;
  y: number;
}

export interface Tactic {
  id: string;
  name: string;
  /** Preset de origen (si se creó desde uno). */
  preset: TacticalStyle | null;
  formation: string;
  slots: TacticSlot[];
  sliders: TacticSliders;
  roles: PlayerRole[];
  /** Salida de balón (estilo FC26 / Táctica V2). */
  buildUpStyle?: BuildUpStyle;
  /** Enfoque defensivo (estilo FC26 / Táctica V2). */
  defensiveApproach?: DefensiveApproach;
  /** 1-100: amplitud del bloque (0 replegado al centro · 100 muy abierto). */
  amplitude?: number;
  /** 1-100: profundidad del bloque (0 muy retrasado · 100 muy adelantado). */
  depth?: number;
  /** Enfoque individual (Ataque/Equilibrado/Defensa) por hueco. */
  focus?: PlayerFocus[];
  /** Instrucciones individuales por hueco. */
  instructions?: PlayerInstruction[][];
  /** Carril de ataque por hueco (Táctica V3). `auto` = el de su posición. */
  channels?: PlayerChannel[];
  /** Riesgo de pase por hueco (Táctica V3). */
  passing?: PassingRisk[];
  /** Lado preferido de los ataques del equipo. */
  attackSide?: AttackSide;
  /** Marcaje: zonal, mixto u hombre a hombre. */
  marking?: MarkingStyle;
  /** Transiciones: replegarse o presionar tras pérdida. */
  transition?: TransitionStyle;
  /** Córners ofensivos. */
  cornerStyle?: CornerStyle;
  /** Faltas ofensivas. */
  freeKickStyle?: FreeKickStyle;
  /** Qué hace el equipo cuando gana. */
  leadingPlan?: LeadingPlan;
  /** Qué hace el equipo cuando pierde. */
  trailingPlan?: TrailingPlan;
}

/** Salida de balón desde atrás (estilo FC26). */
export type BuildUpStyle = 'balanced' | 'short_pass' | 'long_ball' | 'counter';
/** Enfoque defensivo del bloque (estilo FC26). */
export type DefensiveApproach = 'low_block' | 'balanced' | 'high_block' | 'aggressive_press';
/** Mentalidad individual de un hueco: Ataque / Equilibrado / Defensa. */
export type PlayerFocus = 'attack' | 'balanced' | 'defend';

/** Instrucciones individuales elegibles por jugador (estilo FC26). */
export const PLAYER_INSTRUCTIONS = [
  'getForward',
  'stayBack',
  'manMark',
  'pressMore',
  'shootOnSight',
  'dribbleMore',
  'earlyCross',
  'stayWide',
  // Táctica V3.
  'holdPosition',
  'roam',
  'longBalls',
  'tackleHard',
] as const;
export type PlayerInstruction = (typeof PLAYER_INSTRUCTIONS)[number];

// ───────────────────────── Formaciones ─────────────────────────

/** Coordenadas a mano de cada formación (sin solapes), en el orden de FORMATIONS. */
export const FORMATION_COORDS: Record<Formation, [number, number][]> = {
  '4-3-3': [[50, 93], [84, 72], [62, 77], [38, 77], [16, 72], [50, 60], [68, 46], [32, 46], [82, 24], [18, 24], [50, 14]],
  '4-4-2': [[50, 93], [84, 72], [62, 77], [38, 77], [16, 72], [84, 46], [60, 50], [40, 50], [16, 46], [62, 18], [38, 18]],
  '4-2-3-1': [[50, 93], [84, 72], [62, 77], [38, 77], [16, 72], [62, 58], [38, 58], [82, 34], [50, 34], [18, 34], [50, 14]],
  '4-1-2-1-2': [[50, 93], [84, 72], [62, 77], [38 , 77], [16, 72], [50, 60], [70, 47], [30, 47], [50, 33], [62, 17], [38, 17]],
  '4-3-2-1': [[50, 93], [84, 72], [62, 77], [38, 77], [16, 72], [70, 52], [50, 58], [30, 52], [64, 30], [36, 30], [50, 14]],
  '4-5-1': [[50, 93], [84, 72], [62, 77], [38, 77], [16, 72], [86, 44], [64, 52], [50, 38], [36, 52], [14, 44], [50, 15]],
  '3-5-2': [[50, 93], [72, 76], [50, 79], [28, 76], [88, 52], [50, 60], [66, 45], [34, 45], [12, 52], [62, 18], [38, 18]],
  '3-4-3': [[50, 93], [72, 76], [50, 79], [28, 76], [86, 50], [60, 52], [40, 52], [14, 50], [80, 22], [50, 15], [20, 22]],
  '3-4-1-2': [[50, 93], [72, 76], [50, 79], [28, 76], [86, 52], [60, 54], [40, 54], [14, 52], [50, 34], [62, 17], [38, 17]],
  '5-3-2': [[50, 93], [88, 64], [68, 77], [50, 80], [32, 77], [12, 64], [70, 48], [50, 56], [30, 48], [62, 19], [38, 19]],
  '5-4-1': [[50, 93], [88, 64], [68, 77], [50, 80], [32, 77], [12, 64], [80, 44], [60, 50], [40, 50], [20, 44], [50, 16]],
  '4-1-4-1': [[50, 93], [84, 72], [62, 77], [38, 77], [16, 72], [50, 61], [84, 42], [62, 46], [38, 46], [16, 42], [50, 15]],
  // Formaciones expandidas (Táctica V2).
  '3-4-2-1': [[50, 93], [68, 77], [50, 80], [32, 77], [88, 52], [62, 46], [38, 46], [12, 52], [64, 34], [36, 34], [50, 15]],
  '4-3-1-2': [[50, 93], [84, 72], [62, 77], [38, 77], [16, 72], [70, 50], [50, 60], [30, 50], [50, 26], [62, 17], [38, 17]],
  '4-4-1-1': [[50, 93], [84, 72], [62, 77], [38, 77], [16, 72], [86, 46], [62, 50], [38, 50], [14, 46], [50, 27], [50, 11]],
  '4-2-2-2': [[50, 93], [84, 72], [62, 77], [38, 77], [16, 72], [62, 58], [38, 58], [82, 40], [18, 40], [62, 13], [38, 13]],
};

export function formationSlots(f: Formation): TacticSlot[] {
  return FORMATION_COORDS[f].map(([x, y]) => ({ x, y }));
}

// ───────────────────────── Táctica V2: posiciones y rejilla ─────────────────────────

/**
 * Posiciones tácticas de la Táctica V2 (nomenclatura Soccer Manager / EA FC).
 * Nota: el plan maestro describe "26 posiciones" pero enumera estos 27 ids; se conservan
 * todos para no perder ninguna intención de diseño.
 */
export const TACTICAL_POSITIONS = [
  'POR',
  'LIB',
  'LI', 'DFC-I', 'DFC', 'DFC-D', 'LD',
  'CRI', 'CRD',
  'MCD-I', 'MCD', 'MCD-D',
  'MI', 'MC-I', 'MC', 'MC-D', 'MD',
  'MCO-I', 'MCO', 'MCO-D',
  'EI', 'ED',
  'SDI', 'DC', 'SDD', 'DC-I', 'DC-D',
] as const;
export type TacticalPosition = (typeof TACTICAL_POSITIONS)[number];

/** Posición base (las 10 de `POSITIONS`) con la que se valora cada posición táctica V2. */
export const TACTICAL_POSITION_BASE: Record<TacticalPosition, Position> = {
  POR: 'GK',
  LIB: 'CB',
  LI: 'LB',
  'DFC-I': 'CB',
  DFC: 'CB',
  'DFC-D': 'CB',
  LD: 'RB',
  CRI: 'LB',
  CRD: 'RB',
  'MCD-I': 'DM',
  MCD: 'DM',
  'MCD-D': 'DM',
  MI: 'LW',
  'MC-I': 'CM',
  MC: 'CM',
  'MC-D': 'CM',
  MD: 'RW',
  'MCO-I': 'AM',
  MCO: 'AM',
  'MCO-D': 'AM',
  EI: 'LW',
  ED: 'RW',
  SDI: 'ST',
  DC: 'ST',
  SDD: 'ST',
  'DC-I': 'ST',
  'DC-D': 'ST',
};

/** Rejilla lógica 5 carriles × 7 alturas. */
export const ZONE_LANES = 5;
export const ZONE_HEIGHTS = 7;

export interface Zone {
  /** Carril: 0 = banda izquierda … 4 = banda derecha. */
  lane: number;
  /** Altura: 0 = portería rival … 6 = portería propia. */
  height: number;
}

/** Coordenada fija de cada posición táctica en la rejilla 5×7. */
export const ZONE_GRID: Record<TacticalPosition, Zone> = {
  POR: { lane: 2, height: 6 },
  LIB: { lane: 1, height: 6 },
  LI: { lane: 0, height: 5 },
  'DFC-I': { lane: 1, height: 5 },
  DFC: { lane: 2, height: 5 },
  'DFC-D': { lane: 3, height: 5 },
  LD: { lane: 4, height: 5 },
  CRI: { lane: 0, height: 4 },
  CRD: { lane: 4, height: 4 },
  'MCD-I': { lane: 1, height: 4 },
  MCD: { lane: 2, height: 4 },
  'MCD-D': { lane: 3, height: 4 },
  MI: { lane: 0, height: 3 },
  'MC-I': { lane: 1, height: 3 },
  MC: { lane: 2, height: 3 },
  'MC-D': { lane: 3, height: 3 },
  MD: { lane: 4, height: 3 },
  'MCO-I': { lane: 1, height: 2 },
  MCO: { lane: 2, height: 2 },
  'MCO-D': { lane: 3, height: 2 },
  EI: { lane: 0, height: 1 },
  ED: { lane: 4, height: 1 },
  SDI: { lane: 1, height: 1 },
  SDD: { lane: 3, height: 1 },
  DC: { lane: 2, height: 0 },
  'DC-I': { lane: 1, height: 0 },
  'DC-D': { lane: 3, height: 0 },
};

/** Posición base (las 10 de `POSITIONS`) de una posición táctica V2. */
export function positionFromSlot(pos: TacticalPosition): Position;
/** Posición natural de un hueco según dónde esté en el campo. */
export function positionFromSlot(s: TacticSlot, isFirst?: boolean): Position;
export function positionFromSlot(arg: TacticalPosition | TacticSlot, isFirst = false): Position {
  if (typeof arg === 'string') return TACTICAL_POSITION_BASE[arg];
  const s = arg;
  if (isFirst || s.y >= 86) return 'GK';
  const wide = s.x <= 26 || s.x >= 74;
  const side = s.x < 50 ? 'L' : 'R';
  if (s.y >= 66) return wide ? (side === 'L' ? 'LB' : 'RB') : 'CB';
  if (s.y >= 55) return wide ? (side === 'L' ? 'LB' : 'RB') : 'DM';
  if (s.y >= 40) return wide ? (side === 'L' ? 'LW' : 'RW') : 'CM';
  if (s.y >= 26) return wide ? (side === 'L' ? 'LW' : 'RW') : 'AM';
  return wide ? (side === 'L' ? 'LW' : 'RW') : 'ST';
}

/** Coordenada fija en la rejilla 5×7 de una posición táctica V2. */
export function zoneFromSlot(pos: TacticalPosition): Zone {
  return ZONE_GRID[pos];
}

/**
 * Peso de cada zona de la rejilla V2 sobre las líneas de ataque, medio y defensa.
 * Un lateral moderno aporta a las tres líneas; un delantero casi sólo al ataque. Sustituye a
 * los promedios por grupo de posición: cada jugador "suma presencia" en cada línea.
 */
export interface LineWeights {
  att: number;
  mid: number;
  def: number;
}

export const ZONE_LINE_WEIGHT: Record<TacticalPosition, LineWeights> = {
  POR: { att: 0, mid: 0, def: 0 },
  LIB: { att: 0, mid: 0.2, def: 1.05 },
  LI: { att: 0.2, mid: 0.5, def: 0.7 },
  'DFC-I': { att: 0.05, mid: 0.25, def: 1 },
  DFC: { att: 0.05, mid: 0.25, def: 1 },
  'DFC-D': { att: 0.05, mid: 0.25, def: 1 },
  LD: { att: 0.2, mid: 0.5, def: 0.7 },
  CRI: { att: 0.45, mid: 0.55, def: 0.5 },
  CRD: { att: 0.45, mid: 0.55, def: 0.5 },
  'MCD-I': { att: 0.1, mid: 1, def: 0.55 },
  MCD: { att: 0.1, mid: 1, def: 0.55 },
  'MCD-D': { att: 0.1, mid: 1, def: 0.55 },
  MI: { att: 0.7, mid: 0.8, def: 0.15 },
  'MC-I': { att: 0.35, mid: 1, def: 0.25 },
  MC: { att: 0.35, mid: 1, def: 0.25 },
  'MC-D': { att: 0.35, mid: 1, def: 0.25 },
  MD: { att: 0.7, mid: 0.8, def: 0.15 },
  'MCO-I': { att: 0.7, mid: 0.85, def: 0.05 },
  MCO: { att: 0.7, mid: 0.85, def: 0.05 },
  'MCO-D': { att: 0.7, mid: 0.85, def: 0.05 },
  EI: { att: 1.05, mid: 0.35, def: 0.05 },
  ED: { att: 1.05, mid: 0.35, def: 0.05 },
  SDI: { att: 1.15, mid: 0.25, def: 0 },
  DC: { att: 1.15, mid: 0.25, def: 0 },
  SDD: { att: 1.15, mid: 0.25, def: 0 },
  'DC-I': { att: 1.15, mid: 0.25, def: 0 },
  'DC-D': { att: 1.15, mid: 0.25, def: 0 },
};

/** Posición V2 representativa de cada posición base (para jugadores sin hueco asignado). */
const BASE_TO_V2: Record<Position, TacticalPosition> = {
  GK: 'POR',
  RB: 'LD',
  CB: 'DFC',
  LB: 'LI',
  DM: 'MCD',
  CM: 'MC',
  AM: 'MCO',
  RW: 'ED',
  LW: 'EI',
  ST: 'DC',
};

/** Posición táctica V2 representativa de una posición base. */
export function tacticalPositionOf(pos: Position): TacticalPosition {
  return BASE_TO_V2[pos];
}

/**
 * Encaja (snap) las coordenadas libres (0-100) de un hueco en la rejilla 5×7.
 * La rejilla ocupa el 10 %–90 % del campo en ambos ejes; la conversión es la inversa exacta de
 * `zoneCenter`, de modo que ida y vuelta devuelven siempre la misma zona.
 */
export function zoneFromCoords(s: TacticSlot): Zone {
  return {
    lane: clamp(Math.round(((s.x - 10) / 80) * (ZONE_LANES - 1)), 0, ZONE_LANES - 1),
    height: clamp(Math.round(((s.y - 10) / 80) * (ZONE_HEIGHTS - 1)), 0, ZONE_HEIGHTS - 1),
  };
}

/** Centro (0-100) de una zona de la rejilla: inverso de `zoneFromCoords`. */
export function zoneCenter(z: Zone): TacticSlot {
  return { x: Math.round(10 + (z.lane / (ZONE_LANES - 1)) * 80), y: Math.round(10 + (z.height / (ZONE_HEIGHTS - 1)) * 80) };
}

/** Carril (0 izquierda … 4 derecha) en el que está una coordenada x del campo. */
export function laneOfX(x: number): number {
  return clamp(Math.round(((x - 10) / 80) * (ZONE_LANES - 1)), 0, ZONE_LANES - 1);
}

/** Carril de ataque efectivo de un hueco: el forzado por el usuario o, en `auto`, el de su x. */
export function channelLane(channel: PlayerChannel | undefined, x: number): number {
  switch (channel) {
    case 'left':
      return 0;
    case 'halfLeft':
      return 1;
    case 'center':
      return 2;
    case 'halfRight':
      return 3;
    case 'right':
      return 4;
    default:
      return laneOfX(x);
  }
}

/** Carril (en x 0-100) al que corresponde un canal; sirve para dibujar la flecha en la pizarra. */
export const CHANNEL_X: Record<Exclude<PlayerChannel, 'auto'>, number> = { left: 10, halfLeft: 30, center: 50, halfRight: 70, right: 90 };

/**
 * Posición táctica V2 cuyo hueco de rejilla queda más cerca de unas coordenadas libres.
 * El encaje se restringe a la familia de la posición base del hueco, de modo que un lateral
 * sólo puede resolverse como LI/CRI o LD/CRD, nunca como un mediocentro.
 */
export function tacticalPositionFromSlot(s: TacticSlot, isFirst = false): TacticalPosition {
  if (isFirst || s.y >= 86) return 'POR';
  const base = positionFromSlot(s);
  const z = zoneFromCoords(s);
  let best: TacticalPosition | undefined;
  let bestD = Infinity;
  for (const pos of TACTICAL_POSITIONS) {
    if (TACTICAL_POSITION_BASE[pos] !== base) continue;
    const g = ZONE_GRID[pos];
    const d = (g.lane - z.lane) ** 2 + (g.height - z.height) ** 2;
    if (d < bestD) {
      bestD = d;
      best = pos;
    }
  }
  return best ?? BASE_TO_V2[base];
}

/**
 * Posición táctica de cada hueco, resuelta *por filas*: los jugadores que comparten altura se
 * reparten de izquierda a derecha (DFC-I / DFC-D, MC-I / MC / MC-D, DC-I / DC-D…). Así dos
 * centrales ya no quedan los dos como «DFC», y un 3-5-2 tiene carrileros (CRI / CRD) y líbero.
 * El portero es siempre el hueco 0.
 */
export function tacticalPositionsOf(slots: TacticSlot[]): TacticalPosition[] {
  const out: TacticalPosition[] = new Array(slots.length).fill('MC');
  if (slots.length === 0) return out;
  out[0] = 'POR';
  const field = slots.map((s, i) => ({ i, x: s.x, y: s.y })).filter((c) => c.i > 0);
  const wideOf = (x: number) => x <= 26 || x >= 74;
  // Centrales de la zaga (no abiertos y por detrás de 66): deciden si hay línea de tres.
  const backs = field.filter((c) => !wideOf(c.x) && c.y >= 66).sort((a, b) => a.x - b.x);
  const threeAtBack = backs.length >= 3;
  const spread = (list: typeof field, names: Record<number, TacticalPosition[]>) => {
    const sorted = [...list].sort((a, b) => a.x - b.x);
    const set = names[Math.min(sorted.length, 4)] ?? names[1];
    sorted.forEach((c, k) => {
      out[c.i] = set[Math.min(k, set.length - 1)];
    });
  };
  const rowOf = (lo: number, hi: number) => field.filter((c) => !wideOf(c.x) && c.y >= lo && c.y < hi);
  // Con cinco atrás, los dos abiertos de la zaga son LI/LD (laterales) y los abiertos del medio CRI/CRD:
  // así ninguna etiqueta se repite (5-4-1: LI, DFC-I, LIB, DFC-D, LD + CRI, MC-I, MC-D, CRD).
  const wingBacksLow = field.some((c) => wideOf(c.x) && c.y >= 55 && c.y < 66);

  for (const c of field) {
    if (c.y >= 86) {
      out[c.i] = 'LIB';
      continue;
    }
    if (wideOf(c.x)) {
      const left = c.x < 50;
      if (c.y >= 66 || (threeAtBack && wingBacksLow && c.y >= 55)) out[c.i] = left ? 'LI' : 'LD';
      else if (c.y >= 55 || (threeAtBack && c.y >= 40)) out[c.i] = left ? 'CRI' : 'CRD';
      else if (c.y >= 40) out[c.i] = left ? 'MI' : 'MD';
      else out[c.i] = left ? 'EI' : 'ED';
    }
  }
  // Defensas centrales: con tres atrás, el más retrasado hace de líbero.
  {
    const set: Record<number, TacticalPosition[]> = { 1: ['DFC'], 2: ['DFC-I', 'DFC-D'], 3: ['DFC-I', 'DFC', 'DFC-D'], 4: ['DFC-I', 'DFC', 'DFC', 'DFC-D'] };
    const list = rowOf(66, 86);
    spread(list, set);
    if (list.length >= 3) {
      const sorted = [...list].sort((a, b) => a.x - b.x);
      const mid = sorted[Math.floor(sorted.length / 2)];
      const maxOther = Math.max(...sorted.filter((c) => c !== mid).map((c) => c.y));
      if (mid.y >= maxOther + 2) out[mid.i] = 'LIB';
    }
  }
  spread(rowOf(55, 66), { 1: ['MCD'], 2: ['MCD-I', 'MCD-D'], 3: ['MCD-I', 'MCD', 'MCD-D'], 4: ['MCD-I', 'MCD', 'MCD', 'MCD-D'] });
  spread(rowOf(40, 55), { 1: ['MC'], 2: ['MC-I', 'MC-D'], 3: ['MC-I', 'MC', 'MC-D'], 4: ['MC-I', 'MC', 'MC', 'MC-D'] });
  spread(rowOf(26, 40), { 1: ['MCO'], 2: ['MCO-I', 'MCO-D'], 3: ['MCO-I', 'MCO', 'MCO-D'], 4: ['MCO-I', 'MCO', 'MCO', 'MCO-D'] });
  // Delanteros: pareja a la misma altura = DC-I / DC-D; si uno está más retrasado es segundo delantero.
  {
    const list = rowOf(0, 26).sort((a, b) => a.x - b.x);
    if (list.length === 1) out[list[0].i] = 'DC';
    else if (list.length === 2) {
      const [a, b] = list;
      if (Math.abs(a.y - b.y) <= 5) {
        out[a.i] = 'DC-I';
        out[b.i] = 'DC-D';
      } else {
        const front = a.y < b.y ? a : b;
        const back = front === a ? b : a;
        out[front.i] = 'DC';
        out[back.i] = back.x < 50 ? 'SDI' : 'SDD';
      }
    } else if (list.length >= 3) {
      spread(list, { 3: ['DC-I', 'DC', 'DC-D'], 4: ['DC-I', 'DC', 'DC', 'DC-D'] });
    }
  }
  return out;
}

export function slotPositions(t: Tactic): Position[] {
  return tacticalPositionsOf(t.slots).map((p) => TACTICAL_POSITION_BASE[p]);
}

/**
 * Etiqueta de la forma: el nombre exacto si los huecos coinciden con una formación conocida
 * (así "4-3-1-2" no se muestra como "4-3-3"), o el recuento de bandas si es una forma libre.
 */
export function describeFormation(slots: TacticSlot[]): string {
  for (const f of Object.keys(FORMATIONS) as Formation[]) {
    const coords = FORMATION_COORDS[f];
    if (coords.length === slots.length && coords.every(([x, y], i) => !!slots[i] && slots[i].x === x && slots[i].y === y)) return f;
  }
  const rows = { def: 0, mid: 0, att: 0 };
  slots.slice(1).forEach((s) => {
    if (s.y >= 62) rows.def++;
    else if (s.y >= 30) rows.mid++;
    else rows.att++;
  });
  return `${rows.def}-${rows.mid}-${rows.att}`;
}

// ───────────────────────── Táctica V3: roles detallados ─────────────────────────

/** Efecto de un rol individual: sustituye a las tablas sueltas del motor. */
export interface RoleDef {
  /** Se suma al aporte del hueco a cada línea (ataque / medio / defensa). */
  att: number;
  mid: number;
  def: number;
  /** Peso como rematador y como asistente (1 = neutro). */
  shot: number;
  assist: number;
  /** Intención ofensiva neta (−1 … +1) que se suma a la del enfoque. */
  intent: number;
  /** Desgaste extra relativo por minuto. */
  fatigue: number;
  /** Cuánto empuja a jugar hacia donde se mueve: hacia el centro o hacia la banda. */
  drift?: 'inside' | 'wide';
  /** Aportes (pequeños) al equipo por cada jugador con este rol. */
  team?: Partial<{ possession: number; chanceRate: number; chanceQuality: number; solidity: number; foul: number; fatigue: number; aerial: number }>;
  /** Atributos que definen el rol y su peso: de ahí sale el encaje 0-100. */
  attrs: Partial<Record<AttrKey, number>>;
}

const R = (def: Partial<RoleDef>): RoleDef => ({ att: 0, mid: 0, def: 0, shot: 1, assist: 1, intent: 0, fatigue: 0, attrs: {}, ...def });

export const ROLE_DEFS: Record<PlayerRole, RoleDef> = {
  default: R({}),
  // Portero
  sweeperKeeper: R({ team: { solidity: 0.015 }, attrs: { reflexes: 1, handling: 0.6, decisions: 1, positioning: 1, passing: 0.5 } }),
  ballPlayingKeeper: R({ assist: 1.3, team: { possession: 0.01 }, attrs: { passing: 1.5, vision: 1, composure: 1, handling: 0.6, firstTouch: 0.6 } }),
  // Defensas
  stayBack: R({ def: 0.08, att: -0.1, shot: 0.4, intent: -0.35, team: { solidity: 0.015 }, attrs: { positioning: 1, marking: 1, tackling: 1, decisions: 0.6 } }),
  getForward: R({ att: 0.15, mid: 0.05, def: -0.12, shot: 1.4, assist: 1.2, intent: 0.45, team: { chanceRate: 0.015 }, attrs: { pace: 1, stamina: 1, passing: 0.8, dribbling: 0.8, crossing: 0.6 } }),
  ballWinner: R({ def: 0.05, team: { solidity: 0.012, foul: 0.03 }, attrs: { tackling: 1.3, aggression: 1, workRate: 1, positioning: 0.8, strength: 0.5 } }),
  stopper: R({ def: 0.1, mid: -0.05, intent: -0.15, team: { aerial: 0.01, solidity: 0.008, foul: 0.02 }, attrs: { tackling: 1.2, strength: 1, heading: 1, aggression: 0.9, jumping: 0.8 } }),
  coverDefender: R({ def: 0.12, att: -0.05, intent: -0.25, team: { solidity: 0.012 }, attrs: { positioning: 1.3, marking: 1, decisions: 1, pace: 0.8, composure: 0.6 } }),
  ballPlayingDefender: R({ mid: 0.18, def: -0.03, assist: 1.3, team: { possession: 0.008 }, attrs: { passing: 1.3, vision: 1, composure: 1, firstTouch: 0.9, marking: 0.5 } }),
  libero: R({ def: 0.05, mid: 0.15, assist: 1.2, attrs: { positioning: 1.2, passing: 1, composure: 1, decisions: 1, vision: 0.8 } }),
  wingBack: R({ att: 0.25, mid: 0.15, def: -0.2, shot: 1.1, assist: 1.25, intent: 0.55, fatigue: 0.04, drift: 'wide', team: { chanceRate: 0.012 }, attrs: { pace: 1.2, stamina: 1.2, crossing: 1, dribbling: 0.8, workRate: 1 } }),
  invertedWingBack: R({ att: 0.05, mid: 0.3, def: -0.06, assist: 1.2, intent: 0.1, drift: 'inside', team: { possession: 0.008 }, attrs: { passing: 1.2, vision: 1, firstTouch: 1, positioning: 0.8, decisions: 0.8 } }),
  // Centrocampistas
  anchor: R({ def: 0.22, att: -0.1, intent: -0.45, team: { solidity: 0.015 }, attrs: { positioning: 1.3, tackling: 1, marking: 1, composure: 0.8, decisions: 0.8 } }),
  halfBack: R({ def: 0.28, mid: -0.05, att: -0.12, intent: -0.55, team: { solidity: 0.012 }, attrs: { positioning: 1.2, tackling: 1, passing: 0.9, composure: 0.9, marking: 0.8 } }),
  deepPlaymaker: R({ mid: 0.2, att: -0.05, shot: 0.7, assist: 1.6, team: { possession: 0.012 }, attrs: { passing: 1.4, vision: 1.2, firstTouch: 1, composure: 1, decisions: 0.9 } }),
  mezzala: R({ att: 0.2, def: -0.08, shot: 1.2, assist: 1.15, intent: 0.35, drift: 'inside', attrs: { passing: 1, dribbling: 1, longShots: 0.9, vision: 0.9, workRate: 0.8 } }),
  carrilero: R({ mid: 0.15, def: 0.05, fatigue: 0.03, drift: 'wide', team: { fatigue: 0.01 }, attrs: { workRate: 1.2, stamina: 1.2, passing: 0.9, teamwork: 1, positioning: 0.8 } }),
  playmaker: R({ assist: 1.8, team: { possession: 0.01, chanceQuality: 0.02 }, attrs: { passing: 1.3, vision: 1.3, firstTouch: 1, composure: 0.8, decisions: 0.8 } }),
  boxToBox: R({ shot: 1.2, team: { fatigue: 0.02 }, attrs: { stamina: 1.3, workRate: 1.2, passing: 0.8, tackling: 0.8, strength: 0.6 } }),
  freeRole: R({ shot: 1.2, assist: 1.4, attrs: { dribbling: 1, vision: 1, passing: 1, firstTouch: 1, agility: 0.8 } }),
  advancedPlaymaker: R({ att: 0.15, shot: 0.9, assist: 1.8, intent: 0.25, team: { possession: 0.008, chanceQuality: 0.015 }, attrs: { vision: 1.4, passing: 1.3, firstTouch: 1, dribbling: 0.9, decisions: 0.9 } }),
  shadowStriker: R({ att: 0.3, def: -0.05, shot: 1.55, intent: 0.5, attrs: { finishing: 1.2, positioning: 1.1, pace: 0.9, composure: 0.9, firstTouch: 0.8 } }),
  // Extremos y delanteros
  cutInside: R({ shot: 1.35, drift: 'inside', attrs: { dribbling: 1.1, finishing: 1, pace: 1, longShots: 0.8, composure: 0.6 } }),
  stayWide: R({ shot: 0.8, assist: 1.3, drift: 'wide', attrs: { crossing: 1.2, pace: 1, dribbling: 0.9, stamina: 0.7 } }),
  insideForward: R({ att: 0.1, shot: 1.45, intent: 0.3, drift: 'inside', attrs: { finishing: 1.1, dribbling: 1.1, pace: 1, longShots: 0.9, composure: 0.8 } }),
  winger: R({ att: 0.05, shot: 0.9, assist: 1.35, drift: 'wide', team: { aerial: 0.01 }, attrs: { crossing: 1.2, pace: 1.1, dribbling: 1, acceleration: 1, stamina: 0.7 } }),
  targetMan: R({ shot: 1.15, team: { aerial: 0.05 }, attrs: { heading: 1.3, strength: 1.2, jumping: 1, finishing: 0.9, teamwork: 0.5 } }),
  poacher: R({ shot: 1.5, team: { chanceQuality: 0.02 }, attrs: { finishing: 1.4, positioning: 1.2, composure: 1, pace: 0.8, firstTouch: 0.6 } }),
  falseNine: R({ shot: 0.8, assist: 1.4, team: { aerial: -0.04 }, attrs: { passing: 1.1, vision: 1.1, firstTouch: 1, dribbling: 1, composure: 0.8 } }),
  advancedForward: R({ att: 0.12, shot: 1.3, intent: 0.4, team: { chanceRate: 0.01 }, attrs: { pace: 1.2, finishing: 1.1, positioning: 1, acceleration: 1, composure: 0.8 } }),
  pressingForward: R({ def: 0.12, mid: 0.05, team: { solidity: 0.01, fatigue: 0.02, foul: 0.02 }, attrs: { workRate: 1.3, stamina: 1.2, aggression: 1, teamwork: 1, finishing: 0.7 } }),
  completeForward: R({ att: 0.05, mid: 0.1, shot: 1.15, assist: 1.2, attrs: { finishing: 1, passing: 0.9, heading: 0.8, dribbling: 0.9, strength: 0.8 } }),
  trequartista: R({ att: 0.1, def: -0.1, shot: 1.1, assist: 1.6, intent: 0.3, attrs: { dribbling: 1.2, vision: 1.2, passing: 1.1, firstTouch: 1, finishing: 0.7 } }),
};

// Los roles *redistribuyen* la contribución de un hueco entre ataque, medio y defensa; no la aumentan.
// Sin esta normalización, cualquier rol era un regalo neto frente a «estándar».
for (const def of Object.values(ROLE_DEFS)) {
  const d = (def.att + def.mid + def.def) / 3;
  def.att -= d;
  def.mid -= d;
  def.def -= d;
}

/** Roles que tienen sentido en una posición táctica concreta (la pizarra ofrece sólo estos). */
export function rolesForPosition(pos: TacticalPosition): PlayerRole[] {
  const base = TACTICAL_POSITION_BASE[pos];
  switch (base) {
    case 'GK':
      return ['default', 'sweeperKeeper', 'ballPlayingKeeper'];
    case 'CB':
      return pos === 'LIB'
        ? ['default', 'libero', 'ballPlayingDefender', 'coverDefender', 'stayBack']
        : ['default', 'stayBack', 'stopper', 'coverDefender', 'ballPlayingDefender', 'ballWinner', 'getForward'];
    case 'LB':
    case 'RB':
      return pos === 'CRI' || pos === 'CRD'
        ? ['default', 'wingBack', 'carrilero', 'getForward', 'stayBack', 'invertedWingBack']
        : ['default', 'stayBack', 'getForward', 'wingBack', 'invertedWingBack', 'ballWinner'];
    case 'DM':
      return ['default', 'anchor', 'halfBack', 'ballWinner', 'deepPlaymaker', 'boxToBox', 'playmaker', 'carrilero'];
    case 'CM':
      return ['default', 'ballWinner', 'boxToBox', 'playmaker', 'deepPlaymaker', 'mezzala', 'carrilero', 'advancedPlaymaker', 'getForward', 'stayBack', 'anchor', 'halfBack', 'freeRole'];
    case 'AM':
      return ['default', 'playmaker', 'advancedPlaymaker', 'shadowStriker', 'trequartista', 'mezzala', 'getForward', 'freeRole'];
    case 'LW':
    case 'RW':
      if (pos === 'MI' || pos === 'MD') return ['default', 'winger', 'carrilero', 'cutInside', 'stayWide', 'insideForward', 'advancedPlaymaker', 'getForward', 'stayBack', 'freeRole'];
      return ['default', 'winger', 'insideForward', 'cutInside', 'stayWide', 'advancedPlaymaker', 'getForward', 'stayBack', 'freeRole'];
    case 'ST':
      return pos === 'SDI' || pos === 'SDD'
        ? ['default', 'shadowStriker', 'trequartista', 'falseNine', 'poacher', 'advancedForward', 'pressingForward']
        : ['default', 'targetMan', 'poacher', 'advancedForward', 'pressingForward', 'completeForward', 'falseNine', 'shadowStriker', 'cutInside', 'freeRole'];
  }
}

/** Idoneidad 0-100 de un jugador para un rol (media ponderada de sus atributos clave). */
export function roleFit(player: Player, role: PlayerRole): number {
  const attrs = ROLE_DEFS[role].attrs;
  let sum = 0;
  let w = 0;
  for (const k in attrs) {
    const key = k as AttrKey;
    const weight = attrs[key] ?? 0;
    sum += player.attrs[key] * weight;
    w += weight;
  }
  return w ? clamp(Math.round(sum / w), 1, 99) : 0;
}

/** Multiplicador (0.95–1.04) por lo bien que un jugador encaja con su rol. El rol por defecto no cambia nada. */
export function roleMultiplier(player: Player, role: PlayerRole): number {
  if (role === 'default') return 1;
  const fit = roleFit(player, role);
  // La familiaridad con el rol (sesiones tácticas y partidos) añade hasta +2 % y resta hasta −3 %.
  const fam = player.roleFamiliarity?.[role] ?? 50;
  return (1 + clamp(((fit - 68) / 40) * 0.16, -0.12, 0.07)) * (0.97 + 0.05 * (fam / 100));
}

/**
 * Cuánto de su efecto táctico entrega un rol según el encaje del jugador: con un encaje bajo el rol
 * casi no aporta lo que promete (0.3×) y con un encaje excelente rinde de más (1.25×).
 */
export function roleEffectScale(fit: number): number {
  return clamp(fit / 60, 0.3, 1.25);
}

/** Lo que un hueco aporta a cada línea y por qué carril ataca / defiende. */
export interface SlotShape {
  att: number;
  mid: number;
  def: number;
  /** Carril por el que amenaza al atacar (0 izquierda … 4 derecha). */
  threatLane: number;
  /** Carril que cubre al defender (el de su posición en la pizarra). */
  coverLane: number;
  /** Se reparte por todos los carriles (rol libre / "roam"). */
  roaming: boolean;
}

export function slotShape(pos: TacticalPosition, role: PlayerRole, channel: PlayerChannel | undefined, x: number, instructions: readonly PlayerInstruction[] = [], fit?: number): SlotShape {
  const w = ZONE_LINE_WEIGHT[pos];
  const r = ROLE_DEFS[role];
  // Un rol mal dominado entrega menos de lo que promete (y los roles ofensivos ya cuestan defensa).
  const s = fit === undefined || role === 'default' ? 1 : roleEffectScale(fit);
  return {
    att: Math.max(0, w.att + r.att * s),
    mid: Math.max(0, w.mid + r.mid * s),
    def: Math.max(0, w.def + r.def * (r.def < 0 ? 1 : s)),
    threatLane: channelLane(channel, x),
    coverLane: laneOfX(x),
    roaming: role === 'freeRole' || instructions.includes('roam'),
  };
}

/**
 * Perfil por carriles de un once: amenaza ofensiva y cobertura defensiva (0-100 relativos al
 * carril más fuerte). Sirve para ver "por qué bandas" ataca y se protege el equipo.
 */
export function laneProfile(t: Tactic, ovr: number[]): { threat: number[]; cover: number[] } {
  const positions = tacticalPositionsOf(t.slots);
  const threat = new Array<number>(ZONE_LANES).fill(0);
  const cover = new Array<number>(ZONE_LANES).fill(0);
  positions.forEach((pos, i) => {
    if (i === 0) return;
    const e = ovr[i] ?? 0;
    if (e <= 0) return;
    const shape = slotShape(pos, t.roles[i] ?? 'default', t.channels?.[i], t.slots[i].x, t.instructions?.[i] ?? []);
    if (shape.roaming) {
      for (let l = 0; l < ZONE_LANES; l++) {
        threat[l] += (e * shape.att) / ZONE_LANES;
        cover[l] += (e * shape.def) / ZONE_LANES;
      }
    } else {
      threat[shape.threatLane] += e * shape.att;
      cover[shape.coverLane] += e * shape.def;
    }
  });
  const norm = (a: number[]) => {
    const m = Math.max(1, ...a);
    return a.map((v) => Math.round((v / m) * 100));
  };
  return { threat: norm(threat), cover: norm(cover) };
}

/**
 * Sugerencia del ayudante: el mejor rol para cada hueco según las cualidades del jugador y el
 * estilo del equipo. Un rol sólo se propone si el jugador lo domina (≥ 58); si no, `default`.
 */
export function suggestRoles(t: Tactic, players: (Player | null | undefined)[]): PlayerRole[] {
  const positions = tacticalPositionsOf(t.slots);
  const style = nearestPreset(t.sliders);
  return positions.map((pos, i) => {
    const p = players[i];
    if (!p) return 'default';
    let best: PlayerRole = 'default';
    let bestScore = 57;
    for (const role of rolesForPosition(pos)) {
      if (role === 'default') continue;
      const score = roleFit(p, role) + (STYLE_ROLE_BONUS[style]?.includes(role) ? 6 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = role;
      }
    }
    return best;
  });
}

const STYLE_ROLE_BONUS: Partial<Record<TacticalStyle, PlayerRole[]>> = {
  TIKI_TAKA: ['playmaker', 'deepPlaymaker', 'ballPlayingDefender', 'invertedWingBack', 'ballPlayingKeeper', 'falseNine', 'mezzala'],
  COUNTER: ['advancedForward', 'winger', 'insideForward', 'anchor', 'stayBack', 'coverDefender'],
  GEGENPRESS: ['pressingForward', 'boxToBox', 'ballWinner', 'carrilero', 'wingBack'],
  CATENACCIO: ['stopper', 'coverDefender', 'anchor', 'halfBack', 'stayBack', 'carrilero'],
  DIRECT: ['targetMan', 'stopper', 'poacher', 'winger', 'advancedForward'],
  WING_PLAY: ['winger', 'wingBack', 'targetMan', 'stayWide', 'poacher'],
};

// ───────────────────────── Presets ─────────────────────────

export interface PresetDef {
  id: TacticalStyle;
  sliders: TacticSliders;
  formations: Formation[];
  /** Atributos que el preset exige (para el encaje de los jugadores). */
  demands: Partial<Record<AttrKey, number>>;
  culture: RegionProfile[];
}

const S = (mentality: number, tempo: number, width: number, pressing: number, defensiveLine: number, directness: number, tackling: number, offsideTrap: boolean, counterAttack: boolean): TacticSliders => ({
  mentality,
  tempo,
  width,
  pressing,
  defensiveLine,
  directness,
  tackling,
  offsideTrap,
  counterAttack,
  timeWasting: false,
});

export const PRESETS: Record<TacticalStyle, PresetDef> = {
  TIKI_TAKA: {
    id: 'TIKI_TAKA',
    sliders: S(62, 35, 45, 72, 72, 12, 40, true, false),
    formations: ['4-3-3', '3-4-3', '4-1-4-1'],
    demands: { passing: 5, firstTouch: 5, vision: 4, decisions: 4, composure: 4, teamwork: 3, agility: 2, dribbling: 2, strength: -2, heading: -2 },
    culture: ['iberian', 'lowlands', 'brazil'],
  },
  COUNTER: {
    id: 'COUNTER',
    sliders: S(38, 75, 50, 40, 32, 72, 55, false, true),
    formations: ['4-4-2', '4-2-3-1', '5-3-2'],
    demands: { pace: 5, acceleration: 5, finishing: 3, positioning: 3, workRate: 3, decisions: 2, stamina: 2, dribbling: 2 },
    culture: ['latin_south', 'andean', 'west_africa', 'french', 'caribbean'],
  },
  GEGENPRESS: {
    id: 'GEGENPRESS',
    sliders: S(70, 82, 55, 95, 76, 45, 70, true, true),
    formations: ['4-3-3', '4-2-3-1', '3-4-3'],
    demands: { stamina: 5, workRate: 5, acceleration: 3, aggression: 3, teamwork: 3, tackling: 2, decisions: 2, pace: 2, naturalFitness: 2 },
    culture: ['central', 'british', 'east_asia', 'north_america'],
  },
  CATENACCIO: {
    id: 'CATENACCIO',
    sliders: S(18, 35, 35, 30, 18, 60, 68, false, true),
    formations: ['5-3-2', '5-4-1', '4-1-4-1'],
    demands: { marking: 5, tackling: 5, positioning: 5, strength: 3, heading: 3, decisions: 2, teamwork: 2, composure: 2 },
    culture: ['italian', 'latin_south', 'middle_east', 'balkan'],
  },
  DIRECT: {
    id: 'DIRECT',
    sliders: S(56, 70, 60, 50, 50, 95, 66, false, false),
    formations: ['4-4-2', '4-1-4-1', '5-3-2'],
    demands: { strength: 5, heading: 5, jumping: 4, aggression: 3, stamina: 2, longShots: 2, crossing: 2, firstTouch: -1, dribbling: -1 },
    culture: ['british', 'nordic', 'oceania', 'eastern'],
  },
  WING_PLAY: {
    id: 'WING_PLAY',
    sliders: S(60, 62, 92, 55, 55, 55, 50, false, false),
    formations: ['4-4-2', '4-3-3', '3-5-2'],
    demands: { crossing: 5, dribbling: 4, pace: 4, acceleration: 3, heading: 3, stamina: 2, agility: 2 },
    culture: ['brazil', 'andean', 'french', 'turkic', 'central_america'],
  },
  BALANCED: {
    id: 'BALANCED',
    sliders: S(50, 50, 50, 50, 50, 50, 50, false, false),
    formations: ['4-4-2', '4-2-3-1', '4-3-3'],
    demands: { passing: 2, tackling: 2, decisions: 2, positioning: 2, stamina: 2, workRate: 2 },
    culture: [],
  },
};

const SLIDER_KEYS = ['mentality', 'tempo', 'width', 'pressing', 'defensiveLine', 'directness', 'tackling'] as const;

/** Preset más parecido a unos deslizadores (para familiaridad y encaje de atributos). */
export function nearestPreset(s: TacticSliders): TacticalStyle {
  let best: TacticalStyle = 'BALANCED';
  let bestD = Infinity;
  for (const id of TACTICAL_STYLES) {
    const p = PRESETS[id].sliders;
    let d = 0;
    for (const k of SLIDER_KEYS) d += (s[k] - p[k]) ** 2;
    d += (s.counterAttack !== p.counterAttack ? 300 : 0) + (s.offsideTrap !== p.offsideTrap ? 150 : 0);
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  return best;
}

export function makeTactic(id: string, name: string, preset: TacticalStyle, formation?: Formation): Tactic {
  const f = formation ?? PRESETS[preset].formations[0];
  const slots = formationSlots(f);
  return {
    id,
    name,
    preset,
    formation: f,
    slots,
    sliders: { ...PRESETS[preset].sliders },
    roles: new Array(11).fill('default') as PlayerRole[],
    buildUpStyle: 'balanced',
    defensiveApproach: 'balanced',
    amplitude: PRESETS[preset].sliders.width,
    depth: 50,
    focus: slots.map((): PlayerFocus => 'balanced'),
    instructions: slots.map((): PlayerInstruction[] => []),
    channels: slots.map((): PlayerChannel => 'auto'),
    passing: slots.map((): PassingRisk => 'mixed'),
    attackSide: 'balanced',
    marking: PRESET_PLAN[preset].marking,
    transition: PRESET_PLAN[preset].transition,
    cornerStyle: 'mixed',
    freeKickStyle: 'mixed',
    leadingPlan: 'normal',
    trailingPlan: 'normal',
  };
}

/** Marcaje y transición típicos de cada preset. */
const PRESET_PLAN: Record<TacticalStyle, { marking: MarkingStyle; transition: TransitionStyle }> = {
  TIKI_TAKA: { marking: 'zonal', transition: 'counterPress' },
  COUNTER: { marking: 'mixed', transition: 'regroup' },
  GEGENPRESS: { marking: 'mixed', transition: 'counterPress' },
  CATENACCIO: { marking: 'man', transition: 'regroup' },
  DIRECT: { marking: 'mixed', transition: 'balanced' },
  WING_PLAY: { marking: 'zonal', transition: 'balanced' },
  BALANCED: { marking: 'zonal', transition: 'balanced' },
};

export function cloneTactic(t: Tactic, id = t.id, name = t.name): Tactic {
  return {
    ...t,
    id,
    name,
    slots: t.slots.map((s) => ({ ...s })),
    sliders: { ...t.sliders },
    roles: [...t.roles],
    focus: t.focus ? [...t.focus] : undefined,
    instructions: t.instructions ? t.instructions.map((a) => [...a]) : undefined,
    channels: t.channels ? [...t.channels] : undefined,
    passing: t.passing ? [...t.passing] : undefined,
  };
}

/** Completa con valores por defecto los campos V3 que falten (partidas y tácticas antiguas). */
export function ensureTacticV3(t: Tactic): Tactic {
  const n = t.slots.length;
  if (!t.channels || t.channels.length !== n) t.channels = t.slots.map((): PlayerChannel => 'auto');
  if (!t.passing || t.passing.length !== n) t.passing = t.slots.map((): PassingRisk => 'mixed');
  if (!t.roles || t.roles.length !== n) t.roles = new Array<PlayerRole>(n).fill('default');
  if (!t.focus || t.focus.length !== n) t.focus = t.slots.map((): PlayerFocus => 'balanced');
  if (!t.instructions || t.instructions.length !== n) t.instructions = t.slots.map((): PlayerInstruction[] => []);
  const plan = PRESET_PLAN[nearestPreset(t.sliders)];
  t.attackSide ??= 'balanced';
  t.marking ??= plan.marking;
  t.transition ??= plan.transition;
  t.cornerStyle ??= 'mixed';
  t.freeKickStyle ??= 'mixed';
  t.leadingPlan ??= 'normal';
  t.trailingPlan ??= 'normal';
  return t;
}

// ───────────────────────── Plantillas tácticas (estilo SM26) ─────────────────────────

export interface TacticTemplate {
  id: string;
  preset: TacticalStyle;
  formation: Formation;
  attackSide?: AttackSide;
  /** Rol por posición táctica (los huecos que no figuren quedan en `default`). */
  roles: Partial<Record<TacticalPosition, PlayerRole>>;
  /** Carril de ataque por posición táctica. */
  channels?: Partial<Record<TacticalPosition, PlayerChannel>>;
  instructions?: Partial<Record<TacticalPosition, PlayerInstruction[]>>;
  focus?: Partial<Record<TacticalPosition, PlayerFocus>>;
  sliders?: Partial<TacticSliders>;
  buildUpStyle?: BuildUpStyle;
  defensiveApproach?: DefensiveApproach;
  cornerStyle?: CornerStyle;
  freeKickStyle?: FreeKickStyle;
  marking?: MarkingStyle;
  transition?: TransitionStyle;
}

export const TACTIC_TEMPLATES: TacticTemplate[] = [
  {
    id: 'highPress',
    preset: 'GEGENPRESS',
    formation: '4-3-3',
    roles: { 'MC-I': 'boxToBox', 'MC-D': 'ballWinner', MCD: 'anchor', EI: 'insideForward', ED: 'insideForward', DC: 'pressingForward', LI: 'wingBack', LD: 'wingBack' },
    instructions: { 'MC-I': ['pressMore'], 'MC-D': ['pressMore'], DC: ['pressMore'], EI: ['pressMore'], ED: ['pressMore'] },
    buildUpStyle: 'short_pass',
    defensiveApproach: 'aggressive_press',
    cornerStyle: 'far',
  },
  {
    id: 'possession',
    preset: 'TIKI_TAKA',
    formation: '4-2-3-1',
    roles: { 'MCD-I': 'deepPlaymaker', 'MCD-D': 'anchor', MCO: 'advancedPlaymaker', EI: 'insideForward', ED: 'insideForward', DC: 'falseNine', LD: 'invertedWingBack', LI: 'wingBack', 'DFC-I': 'ballPlayingDefender', 'DFC-D': 'ballPlayingDefender', POR: 'ballPlayingKeeper' },
    buildUpStyle: 'short_pass',
    defensiveApproach: 'high_block',
    cornerStyle: 'short',
    freeKickStyle: 'cross',
  },
  {
    id: 'counter',
    preset: 'COUNTER',
    formation: '4-4-2',
    roles: { MI: 'winger', MD: 'winger', 'MC-I': 'anchor', 'MC-D': 'deepPlaymaker', 'DC-I': 'advancedForward', 'DC-D': 'poacher', 'DFC-I': 'coverDefender', 'DFC-D': 'stopper' },
    channels: { MI: 'left', MD: 'right' },
    buildUpStyle: 'counter',
    defensiveApproach: 'low_block',
    cornerStyle: 'near',
  },
  {
    id: 'wingPlay',
    preset: 'WING_PLAY',
    formation: '4-4-2',
    roles: { LI: 'wingBack', LD: 'wingBack', MI: 'winger', MD: 'winger', 'DC-I': 'targetMan', 'DC-D': 'poacher', 'MC-I': 'carrilero', 'MC-D': 'boxToBox' },
    instructions: { MI: ['earlyCross'], MD: ['earlyCross'], LI: ['getForward'], LD: ['getForward'] },
    buildUpStyle: 'balanced',
    defensiveApproach: 'balanced',
    cornerStyle: 'near',
  },
  {
    id: 'diamond',
    preset: 'BALANCED',
    formation: '4-3-1-2',
    roles: { MCD: 'anchor', 'MC-I': 'mezzala', 'MC-D': 'mezzala', MCO: 'advancedPlaymaker', 'DC-I': 'poacher', 'DC-D': 'advancedForward', LI: 'wingBack', LD: 'wingBack' },
    instructions: { LI: ['getForward'], LD: ['getForward'] },
    sliders: { width: 40 },
    buildUpStyle: 'short_pass',
  },
  {
    id: 'parkBus',
    preset: 'CATENACCIO',
    formation: '5-4-1',
    roles: { LIB: 'libero', 'DFC-I': 'stopper', 'DFC-D': 'stopper', LI: 'stayBack', LD: 'stayBack', 'MC-I': 'halfBack', 'MC-D': 'ballWinner', CRI: 'carrilero', CRD: 'carrilero', DC: 'targetMan' },
    focus: { DC: 'attack', 'DFC-I': 'defend', 'DFC-D': 'defend', LIB: 'defend', LI: 'defend', LD: 'defend' },
    buildUpStyle: 'long_ball',
    defensiveApproach: 'low_block',
    cornerStyle: 'near',
  },
  {
    id: 'threeAtBack',
    preset: 'BALANCED',
    formation: '3-5-2',
    roles: { LIB: 'libero', 'DFC-I': 'stopper', 'DFC-D': 'coverDefender', CRI: 'wingBack', CRD: 'wingBack', MCD: 'anchor', 'MC-I': 'boxToBox', 'MC-D': 'mezzala', 'DC-I': 'targetMan', 'DC-D': 'poacher' },
    instructions: { CRI: ['getForward'], CRD: ['getForward'] },
    buildUpStyle: 'balanced',
    defensiveApproach: 'balanced',
  },
  {
    id: 'directLong',
    preset: 'DIRECT',
    formation: '4-4-2',
    roles: { 'DC-I': 'targetMan', 'DC-D': 'advancedForward', MI: 'winger', MD: 'winger', 'MC-I': 'ballWinner', 'MC-D': 'boxToBox', 'DFC-I': 'stopper', 'DFC-D': 'stopper' },
    instructions: { 'MC-I': ['longBalls'], 'MC-D': ['longBalls'], MI: ['earlyCross'], MD: ['earlyCross'] },
    buildUpStyle: 'long_ball',
    defensiveApproach: 'balanced',
    cornerStyle: 'near',
    freeKickStyle: 'cross',
  },
];

/** Construye una táctica nueva a partir de una plantilla (conserva id; el nombre es el id de la plantilla). */
export function applyTemplate(base: Tactic, tpl: TacticTemplate): Tactic {
  const t = makeTactic(base.id, tpl.id, tpl.preset, tpl.formation);
  t.sliders = { ...t.sliders, ...(tpl.sliders ?? {}) };
  const positions = tacticalPositionsOf(t.slots);
  positions.forEach((pos, i) => {
    t.roles[i] = tpl.roles[pos] ?? 'default';
    if (tpl.channels?.[pos]) t.channels![i] = tpl.channels[pos] as PlayerChannel;
    if (tpl.instructions?.[pos]) t.instructions![i] = [...(tpl.instructions[pos] as PlayerInstruction[])];
    if (tpl.focus?.[pos]) t.focus![i] = tpl.focus[pos] as PlayerFocus;
  });
  if (tpl.attackSide) t.attackSide = tpl.attackSide;
  if (tpl.buildUpStyle) t.buildUpStyle = tpl.buildUpStyle;
  if (tpl.defensiveApproach) t.defensiveApproach = tpl.defensiveApproach;
  if (tpl.cornerStyle) t.cornerStyle = tpl.cornerStyle;
  if (tpl.freeKickStyle) t.freeKickStyle = tpl.freeKickStyle;
  if (tpl.marking) t.marking = tpl.marking;
  if (tpl.transition) t.transition = tpl.transition;
  t.amplitude = t.sliders.width;
  return t;
}

// ───────────────────────── Modificadores del simulador ─────────────────────────

/** Convierte una táctica concreta en modificadores para el motor de partidos. */
export function tacticMods(t: Tactic): StyleMods {
  const s = t.sliders;
  const m = s.mentality / 100;
  const tempo = s.tempo / 100;
  const width = s.width / 100;
  const press = s.pressing / 100;
  const line = s.defensiveLine / 100;
  const dir = s.directness / 100;
  const tackle = s.tackling / 100;
  // Aportes de los roles (cada rol define los suyos en ROLE_DEFS.team) y del plan de equipo V3.
  const sum = { possession: 0, chanceRate: 0, chanceQuality: 0, solidity: 0, foul: 0, fatigue: 0, aerial: 0 };
  for (const role of t.roles) {
    const tm = ROLE_DEFS[role]?.team;
    if (!tm) continue;
    for (const k of Object.keys(sum) as (keyof typeof sum)[]) sum[k] += tm[k] ?? 0;
  }
  // Los aportes de roles son pequeños y se suman entre once jugadores: sin amortiguar eran un regalo neto.
  for (const k of Object.keys(sum) as (keyof typeof sum)[]) sum[k] *= 0.4;
  const marking = t.marking ?? 'zonal';
  const transition = t.transition ?? 'balanced';
  const bu = t.buildUpStyle ?? 'balanced';
  const dfn = t.defensiveApproach ?? 'balanced';
  return {
    possession: clamp(
      (0.5 - dir) * 0.15 + (m - 0.5) * 0.06 + (press - 0.5) * 0.05 + sum.possession - (s.counterAttack ? 0.03 : 0) + (transition === 'counterPress' ? 0.006 : 0) + (bu === 'short_pass' ? 0.008 : bu === 'long_ball' ? -0.008 : 0),
      -0.18,
      0.18,
    ),
    chanceRate: clamp(0.82 + m * 0.3 + tempo * 0.12 + (width - 0.5) * 0.08 + sum.chanceRate - (s.timeWasting ? 0.08 : 0), 0.7, 1.3),
    chanceQuality: clamp(1.22 - dir * 0.3 - tempo * 0.08 + sum.chanceQuality, 0.85, 1.25),
    counterThreat: clamp(0.75 + (s.counterAttack ? 0.6 : 0) + (1 - m) * 0.35 + tempo * 0.15 + (transition === 'regroup' ? 0.04 : 0) + (bu === 'counter' ? 0.05 : 0), 0.6, 1.8),
    defensiveSolidity: clamp(
      0.82 + (1 - m) * 0.4 + sum.solidity - (1 - line) * 0.02 + (transition === 'regroup' ? 0.02 : transition === 'counterPress' ? -0.012 : 0) + (dfn === 'low_block' ? 0.015 : dfn === 'aggressive_press' ? -0.01 : 0) + (marking === 'zonal' ? 0.01 : 0),
      0.8,
      1.35,
    ),
    foulRate: clamp(0.75 + tackle * 0.45 + press * 0.2 + sum.foul + (marking === 'man' ? 0.05 : marking === 'mixed' ? 0.02 : 0), 0.7, 1.5),
    fatigue: clamp(0.78 + press * 0.45 + tempo * 0.2 + sum.fatigue + (transition === 'counterPress' ? 0.03 : 0) + (marking === 'man' ? 0.02 : 0), 0.75, 1.5),
    aerialShare: clamp(0.05 + dir * 0.25 + width * 0.15 + sum.aerial + (bu === 'long_ball' ? 0.03 : 0), 0.04, 0.5),
    offsideTrap: s.offsideTrap ? 0.06 + line * 0.06 : 0,
    spaceBehind: clamp((line - 0.5) * 0.6 + (s.offsideTrap ? 0.05 : 0), -0.25, 0.35),
  };
}

// ───────────────────────── Encaje de jugadores ─────────────────────────

const OUTFIELD_KEYS = ATTRIBUTE_KEYS.filter((k) => !(GOALKEEPING as readonly string[]).includes(k));

/** Encaje del perfil de atributos con lo que exige un preset (0-100). */
export function styleAttributeFit(attrs: Attributes, style: TacticalStyle): number {
  const demands = PRESETS[style].demands;
  let general = 0;
  for (const k of OUTFIELD_KEYS) general += attrs[k];
  general /= OUTFIELD_KEYS.length;
  let pos = 0;
  let posW = 0;
  let neg = 0;
  let negW = 0;
  for (const k in demands) {
    const key = k as AttrKey;
    const w = demands[key] ?? 0;
    if (w > 0) {
      pos += attrs[key] * w;
      posW += w;
    } else {
      neg += attrs[key] * -w;
      negW += -w;
    }
  }
  const posAvg = posW ? pos / posW : general;
  const negAvg = negW ? neg / negW : general;
  const delta = posAvg - general - (negAvg - general) * 0.35;
  return clamp(50 + delta * 3, 0, 100);
}

/**
 * Multiplicador de rendimiento 0.60–1.10 de un jugador dentro de un estilo:
 * familiaridad (experiencia jugando así) + encaje de atributos, suavizado por la adaptabilidad oculta.
 */
export function styleFit(player: Player, style: TacticalStyle): number {
  if (player.position === 'GK') {
    const fam = player.styleFamiliarity[style] ?? 50;
    const feet = style === 'TIKI_TAKA' ? (player.attrs.passing - 50) / 100 : 0;
    return clamp(0.92 + fam / 1000 + feet * 0.15, 0.82, 1.06);
  }
  const familiarity = player.styleFamiliarity[style] ?? 40;
  const fit = styleAttributeFit(player.attrs, style);
  const adapt = player.hidden.adaptability / 100;
  const combined = familiarity * (0.45 + 0.1 * adapt) + fit * (0.55 - 0.1 * adapt);
  const raw = 0.6 + (combined / 100) * 0.5;
  const collapse = familiarity < 30 && fit < 35 ? 0.06 : 0;
  return clamp(raw - collapse, 0.6, 1.1);
}

/** Encaje con una táctica concreta (usa su preset más cercano). */
export function tacticFit(player: Player, t: Tactic): number {
  return styleFit(player, nearestPreset(t.sliders));
}

export function teamStyleCohesion(players: Player[], style: TacticalStyle): number {
  if (players.length === 0) return 0;
  let s = 0;
  for (const p of players) s += styleFit(p, style);
  return s / players.length;
}

export function bestStyleForSquad(players: Player[]): TacticalStyle {
  let best: TacticalStyle = 'BALANCED';
  let bestScore = -Infinity;
  for (const id of TACTICAL_STYLES) {
    let s = 0;
    for (const p of players) if (p.position !== 'GK') s += styleAttributeFit(p.attrs, id);
    if (s > bestScore) {
      bestScore = s;
      best = id;
    }
  }
  return best;
}

export function culturalFamiliarity(profile: RegionProfile, style: TacticalStyle): number {
  return PRESETS[style].culture.includes(profile) ? 22 : 0;
}

/** Ventaja de un preset frente a otro (se suma a la tasa de ocasiones). */
export const STYLE_MATCHUP: Record<TacticalStyle, Partial<Record<TacticalStyle, number>>> = {
  TIKI_TAKA: { CATENACCIO: -0.06, DIRECT: 0.05, GEGENPRESS: -0.04, COUNTER: -0.03 },
  COUNTER: { TIKI_TAKA: 0.06, GEGENPRESS: 0.04, CATENACCIO: -0.05 },
  GEGENPRESS: { TIKI_TAKA: 0.05, DIRECT: -0.04, COUNTER: -0.04, CATENACCIO: 0.02 },
  CATENACCIO: { TIKI_TAKA: 0.04, WING_PLAY: -0.04, DIRECT: -0.03 },
  DIRECT: { GEGENPRESS: 0.05, CATENACCIO: 0.04, TIKI_TAKA: -0.03 },
  WING_PLAY: { CATENACCIO: 0.05, COUNTER: -0.03 },
  BALANCED: {},
};

/** Formación más parecida a unos huecos libres (para etiquetas y la IA). */
export function closestFormation(slots: TacticSlot[]): Formation {
  let best: Formation = '4-4-2';
  let bestD = Infinity;
  for (const f of Object.keys(FORMATIONS) as Formation[]) {
    const coords = FORMATION_COORDS[f];
    let d = 0;
    const used = new Set<number>();
    for (const s of slots) {
      let md = Infinity;
      let mi = -1;
      coords.forEach(([x, y], i) => {
        if (used.has(i)) return;
        const dd = (x - s.x) ** 2 + (y - s.y) ** 2;
        if (dd < md) {
          md = dd;
          mi = i;
        }
      });
      used.add(mi);
      d += md;
    }
    if (d < bestD) {
      bestD = d;
      best = f;
    }
  }
  return best;
}
