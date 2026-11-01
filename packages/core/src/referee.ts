// Árbitros con personalidad: rigor, permisividad, resistencia a la presión local y precisión.
// Cada decisión crítica se toma sobre una "percepción" ruidosa de la verdad de la jugada,
// lo que produce errores humanos y arbitrajes polémicos.
import type { CountryDef } from './data/countries';
import { generatePersonName } from './data/names';
import type { Rng } from './rng';
import { clamp, type Id } from './types';

export interface Referee {
  id: Id;
  firstName: string;
  lastName: string;
  nationality: string;
  /** 0-100: tendencia a sacar tarjetas. */
  rigor: number;
  /** 0-100: tolerancia al contacto (deja seguir el juego). */
  permissiveness: number;
  /** 0-100: inmunidad a la presión del público local. */
  homePressureResistance: number;
  /** 0-100: exactitud de percepción. */
  accuracy: number;
  reputation: number;
  stats: { matches: number; yellows: number; reds: number; penalties: number; errors: number; controversies: number };
}

export function refereeName(r: Referee): string {
  return `${r.firstName} ${r.lastName}`;
}

export function generateReferee(rng: Rng, id: Id, country: CountryDef): Referee {
  const levelBias = (country.quality - 55) * 0.6;
  const accuracy = Math.round(clamp(rng.gauss(62 + levelBias, 12), 15, 98));
  return {
    id,
    ...generatePersonName(rng, country.nameRegion),
    nationality: country.code,
    rigor: Math.round(clamp(rng.gauss(50, 18), 5, 95)),
    permissiveness: Math.round(clamp(rng.gauss(50, 18), 5, 95)),
    homePressureResistance: Math.round(clamp(rng.gauss(55 + levelBias * 0.5, 16), 5, 98)),
    accuracy,
    reputation: Math.round(clamp(accuracy * 0.8 + rng.gauss(0, 8), 1, 99)),
    stats: { matches: 0, yellows: 0, reds: 0, penalties: 0, errors: 0, controversies: 0 },
  };
}

export type CardDecision = 'none' | 'yellow' | 'red';

export interface FoulContext {
  /** Gravedad real de la acción 0-1 (0 = contacto limpio, 1 = agresión). */
  severity: number;
  inBox: boolean;
  /** true si quien comete la acción es el equipo visitante. */
  offenderIsAway: boolean;
  /** 0-1: presión ambiental (aforo, rivalidad, momento). */
  crowdPressure: number;
  /** 0-1: tensión del partido (minuto, marcador ajustado). */
  tension: number;
  offenderHasYellow: boolean;
}

export interface FoulDecision {
  foulCalled: boolean;
  penalty: boolean;
  card: CardDecision;
  /** Lo que correspondía en realidad. */
  truth: { foul: boolean; card: CardDecision };
  correct: boolean;
  /** 0-1: cuánto ruido mediático genera la decisión. */
  controversy: number;
}

const FOUL_T = 0.3;
const YELLOW_T = 0.62;
const RED_T = 0.9;

function truthCard(severity: number): CardDecision {
  if (severity >= RED_T) return 'red';
  if (severity >= YELLOW_T) return 'yellow';
  return 'none';
}

/**
 * Percepción = verdad + ruido (precisión) − permisividad + sesgo localista (si no resiste la presión).
 * El sesgo empuja a pitar contra el visitante y a perdonar al local.
 */
function perceive(ref: Referee, rng: Rng, ctx: { severity: number; offenderIsAway: boolean; crowdPressure: number; tension: number }): number {
  const noiseSd = 0.03 + ((100 - ref.accuracy) / 100) * 0.22 * (0.8 + ctx.tension * 0.4);
  const permissiveShift = -(ref.permissiveness - 50) / 420;
  const homeBias = (1 - ref.homePressureResistance / 100) * ctx.crowdPressure * 0.14;
  const bias = ctx.offenderIsAway ? homeBias : -homeBias;
  return ctx.severity + rng.gauss(0, noiseSd) + permissiveShift + bias;
}

export function judgeFoul(ref: Referee, rng: Rng, ctx: FoulContext): FoulDecision {
  const perceived = perceive(ref, rng, ctx);
  const rigorShift = (ref.rigor - 50) / 450;
  const truthFoul = ctx.severity >= FOUL_T;
  const truthC = truthFoul ? truthCard(ctx.severity) : 'none';
  const foulCalled = perceived >= FOUL_T;
  let card: CardDecision = 'none';
  if (foulCalled) {
    if (perceived >= RED_T - rigorShift) card = 'red';
    else if (perceived >= YELLOW_T - rigorShift) card = 'yellow';
  }
  // Doble amarilla: los árbitros suelen dudar más en sacar la segunda.
  if (card === 'yellow' && ctx.offenderHasYellow && perceived < YELLOW_T + 0.05 - rigorShift && rng.chance(0.35)) card = 'none';
  const penalty = foulCalled && ctx.inBox;
  const correct = foulCalled === truthFoul && card === truthC;
  let controversy = 0;
  if (!correct) {
    const stakes = (ctx.inBox ? 0.55 : 0.1) + (card === 'red' || truthC === 'red' ? 0.45 : 0) + ctx.tension * 0.2;
    controversy = clamp(stakes * Math.min(1, Math.abs(perceived - ctx.severity) * 4 + 0.3), 0, 1);
  }
  ref.stats.errors += correct ? 0 : 1;
  if (card === 'yellow') ref.stats.yellows++;
  if (card === 'red') ref.stats.reds++;
  if (penalty) ref.stats.penalties++;
  if (controversy > 0.5) ref.stats.controversies++;
  return { foulCalled, penalty, card, truth: { foul: truthFoul, card: truthC }, correct, controversy };
}

export interface OffsideDecision {
  flagged: boolean;
  actuallyOffside: boolean;
  correct: boolean;
  controversy: number;
  marginCm: number;
}

/** Fuera de juego milimétrico: margen real en cm (positivo = adelantado). */
export function judgeOffside(
  ref: Referee,
  rng: Rng,
  ctx: { marginCm: number; attackerIsHome: boolean; crowdPressure: number; tension: number },
): OffsideDecision {
  const sd = 6 + ((100 - ref.accuracy) / 100) * 38;
  const homeBias = (1 - ref.homePressureResistance / 100) * ctx.crowdPressure * 12;
  // Con presión local, el asistente "ve" al atacante local menos adelantado.
  const perceived = ctx.marginCm + rng.gauss(0, sd) + (ctx.attackerIsHome ? -homeBias : homeBias);
  const flagged = perceived > 0;
  const actuallyOffside = ctx.marginCm > 0;
  const correct = flagged === actuallyOffside;
  const controversy = correct ? 0 : clamp(0.4 + ctx.tension * 0.3 + (Math.abs(ctx.marginCm) > 25 ? 0.3 : 0), 0, 1);
  if (!correct) ref.stats.errors++;
  if (controversy > 0.5) ref.stats.controversies++;
  return { flagged, actuallyOffside, correct, controversy, marginCm: ctx.marginCm };
}

/** Penalti por simulación: una caída sin contacto que el árbitro puede comprar. */
export function judgeDive(ref: Referee, rng: Rng, ctx: { diveQuality: number; attackerIsHome: boolean; crowdPressure: number }): FoulDecision {
  const severity = clamp(0.12 + ctx.diveQuality * 0.18, 0, 0.29);
  return judgeFoul(ref, rng, {
    severity,
    inBox: true,
    offenderIsAway: ctx.attackerIsHome,
    crowdPressure: ctx.crowdPressure,
    tension: 0.6,
    offenderHasYellow: false,
  });
}

/** Asigna árbitro para un partido: los mejores para partidos de mayor importancia. */
export function assignReferee(refs: Referee[], importance: number, rng: Rng): Referee | null {
  if (refs.length === 0) return null;
  return rng.weightedPick(refs, (r) => Math.pow(r.reputation / 50, importance * 3) + 0.1);
}
