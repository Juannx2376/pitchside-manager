// Tipos y constantes compartidas por todos los motores.
import type { Msg } from './i18n';

export type Id = string;

export const POSITIONS = ['GK', 'RB', 'CB', 'LB', 'DM', 'CM', 'AM', 'RW', 'LW', 'ST'] as const;
export type Position = (typeof POSITIONS)[number];

export type PositionGroup = 'GK' | 'DEF' | 'MID' | 'ATT';

export const POSITION_GROUP: Record<Position, PositionGroup> = {
  GK: 'GK',
  RB: 'DEF',
  CB: 'DEF',
  LB: 'DEF',
  DM: 'MID',
  CM: 'MID',
  AM: 'MID',
  RW: 'ATT',
  LW: 'ATT',
  ST: 'ATT',
};

/** Posiciones "vecinas": jugar ahí cuesta poco rendimiento. */
export const ADJACENT_POSITIONS: Record<Position, Position[]> = {
  GK: [],
  RB: ['CB', 'RW'],
  CB: ['RB', 'LB', 'DM'],
  LB: ['CB', 'LW'],
  DM: ['CB', 'CM'],
  CM: ['DM', 'AM'],
  AM: ['CM', 'ST', 'RW', 'LW'],
  RW: ['LW', 'AM', 'RB', 'ST'],
  LW: ['RW', 'AM', 'LB', 'ST'],
  ST: ['AM', 'RW', 'LW'],
};

/** Presets tácticos (rellenan los deslizadores de la táctica; el usuario puede crear los suyos). */
export const TACTICAL_STYLES = ['TIKI_TAKA', 'COUNTER', 'GEGENPRESS', 'CATENACCIO', 'DIRECT', 'WING_PLAY', 'BALANCED'] as const;
export type TacticalStyle = (typeof TACTICAL_STYLES)[number];

export const FORMATIONS = {
  '4-3-3': ['GK', 'RB', 'CB', 'CB', 'LB', 'DM', 'CM', 'CM', 'RW', 'LW', 'ST'],
  '4-4-2': ['GK', 'RB', 'CB', 'CB', 'LB', 'RW', 'CM', 'CM', 'LW', 'ST', 'ST'],
  '4-2-3-1': ['GK', 'RB', 'CB', 'CB', 'LB', 'DM', 'DM', 'RW', 'AM', 'LW', 'ST'],
  '4-1-2-1-2': ['GK', 'RB', 'CB', 'CB', 'LB', 'DM', 'CM', 'CM', 'AM', 'ST', 'ST'],
  '4-3-2-1': ['GK', 'RB', 'CB', 'CB', 'LB', 'CM', 'DM', 'CM', 'AM', 'AM', 'ST'],
  '4-5-1': ['GK', 'RB', 'CB', 'CB', 'LB', 'RW', 'CM', 'AM', 'CM', 'LW', 'ST'],
  '3-5-2': ['GK', 'CB', 'CB', 'CB', 'RB', 'DM', 'CM', 'CM', 'LB', 'ST', 'ST'],
  '3-4-3': ['GK', 'CB', 'CB', 'CB', 'RB', 'CM', 'CM', 'LB', 'RW', 'ST', 'LW'],
  '3-4-1-2': ['GK', 'CB', 'CB', 'CB', 'RB', 'CM', 'CM', 'LB', 'AM', 'ST', 'ST'],
  '5-3-2': ['GK', 'RB', 'CB', 'CB', 'CB', 'LB', 'CM', 'DM', 'CM', 'ST', 'ST'],
  '5-4-1': ['GK', 'RB', 'CB', 'CB', 'CB', 'LB', 'RW', 'CM', 'CM', 'LW', 'ST'],
  '4-1-4-1': ['GK', 'RB', 'CB', 'CB', 'LB', 'DM', 'RW', 'CM', 'CM', 'LW', 'ST'],
  // Formaciones expandidas (Táctica V2).
  '3-4-2-1': ['GK', 'CB', 'CB', 'CB', 'RW', 'CM', 'CM', 'LW', 'AM', 'AM', 'ST'],
  '4-3-1-2': ['GK', 'RB', 'CB', 'CB', 'LB', 'CM', 'DM', 'CM', 'AM', 'ST', 'ST'],
  '4-4-1-1': ['GK', 'RB', 'CB', 'CB', 'LB', 'RW', 'CM', 'CM', 'LW', 'AM', 'ST'],
  '4-2-2-2': ['GK', 'RB', 'CB', 'CB', 'LB', 'DM', 'DM', 'RW', 'LW', 'ST', 'ST'],
} as const satisfies Record<string, readonly Position[]>;
export type Formation = keyof typeof FORMATIONS;
export const FORMATION_LIST = Object.keys(FORMATIONS) as Formation[];

export type Confederation = 'UEFA' | 'CONMEBOL' | 'CONCACAF' | 'CAF' | 'AFC' | 'OFC';

export type Foot = 'R' | 'L' | 'B';

export interface Contract {
  /** Salario semanal en EUR. */
  wage: number;
  signedSeason: number;
  /** Última temporada (inclusive) cubierta por el contrato. */
  expiresSeason: number;
  releaseClause: number | null;
  goalBonus: number;
  cleanSheetBonus: number;
  signingBonus: number;
  /** Prima por aparición (EUR). V2 — opcional para partidas/imports antiguos. */
  appearanceBonus?: number;
  /** Prima de fidelidad (EUR). V2. */
  loyaltyBonus?: number;
  /** Cláusula de rescisión para clubes del mismo país (EUR). V2. */
  releaseClauseDomestic?: number;
  /** Cláusula de rescisión para clubes extranjeros (EUR). V2. */
  releaseClauseForeign?: number;
  /** Subida salarial automática (%) al ascender o clasificarse para competición continental. */
  autoRaisePct?: number;
  /** Bajada salarial automática (%) tras un descenso. */
  autoCutPct?: number;
  /** Rol pactado en el equipo. */
  role?: 'key' | 'first' | 'rotation' | 'backup' | 'youth';
}

export interface SellOnClause {
  clubId: Id;
  percent: number;
}

export type NewsCategory =
  | 'match'
  | 'transfer'
  | 'finance'
  | 'press'
  | 'leak'
  | 'board'
  | 'scouting'
  | 'injury'
  | 'youth'
  | 'fpf'
  | 'general'
  | 'award'
  | 'staff'
  | 'career';

export interface NewsItem {
  id: Id;
  season: number;
  day: number;
  category: NewsCategory;
  title: Msg;
  body: Msg;
  clubIds: Id[];
  playerId?: Id;
  importance: 1 | 2 | 3;
  read: boolean;
}

export const SEASON_LENGTH_DAYS = 365;
/** Día 0 = 1 de julio. */
export const CALENDAR = {
  leagueStartDay: 38,
  leagueEndDay: 320,
  seasonEndDay: 336,
  summerWindow: [0, 62] as [number, number],
  winterWindow: [184, 214] as [number, number],
} as const;

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function round(v: number, decimals = 0): number {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}

export function avg(values: number[]): number {
  if (values.length === 0) return 0;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

export function sum(values: number[]): number {
  let s = 0;
  for (const v of values) s += v;
  return s;
}

export const MONTH_LENGTHS = [31, 31, 30, 31, 30, 31, 31, 28, 31, 30, 31, 30];
/** Mes natural (1-12) de cada mes de la temporada (0 = julio). */
export const SEASON_MONTHS = [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6];

/** Fecha real (Date UTC) correspondiente a (temporada, día). */
export function gameDate(season: number, day: number): Date {
  return new Date(Date.UTC(season, 6, 1) + day * 86_400_000);
}

export function monthOfDay(day: number): number {
  let d = day;
  let m = 0;
  while (m < 11 && d >= MONTH_LENGTHS[m]) {
    d -= MONTH_LENGTHS[m];
    m++;
  }
  return m;
}

/** Primer día (índice de temporada) del mes de temporada m (0 = julio). */
export function monthStartDay(m: number): number {
  let acc = 0;
  for (let i = 0; i < m; i++) acc += MONTH_LENGTHS[i];
  return acc;
}

export function isFirstDayOfMonth(day: number): boolean {
  let acc = 0;
  for (const len of MONTH_LENGTHS) {
    if (day === acc) return true;
    acc += len;
  }
  return false;
}

export function formatMoney(eur: number): string {
  const sign = eur < 0 ? '-' : '';
  const a = Math.abs(eur);
  if (a >= 1e9) return `${sign}€${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sign}€${(a / 1e6).toFixed(a >= 1e8 ? 0 : 1)}M`;
  if (a >= 1e3) return `${sign}€${(a / 1e3).toFixed(a >= 1e5 ? 0 : 1)}K`;
  return `${sign}€${Math.round(a)}`;
}
