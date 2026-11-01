// Valoración de fichajes (estilo EA FC): antes de cerrar el trato («veredicto del ojeador») y después,
// con el rendimiento real del jugador en el club («qué tan bueno fue»).
import { overall, wageForQuality, type Player } from './player';
import type { GameState } from './state';
import { clubPlayers } from './state';
import { nearestPreset, styleFit } from './tactics';
import type { ScoutReport } from './scouting';
import { absDayOf, playerValue } from './transfers';
import { COUNTRY_BY_CODE } from './data/countries';
import { clamp, type Id } from './types';

export type SigningTag = 'upgrade' | 'depth' | 'bargain' | 'overpay' | 'prospect' | 'wageHeavy' | 'fits' | 'poorFit' | 'veteran';

export interface SigningVerdict {
  /** 0-100 */
  score: number;
  /** 1-5 */
  stars: number;
  tags: SigningTag[];
  /** Mejora de media sobre el titular actual de su posición (puede ser negativa). */
  upgrade: number;
}

/**
 * ¿Es buen fichaje para `buyerId`? Combina mejora sobre el once, precio frente a valor, potencial y
 * edad, salario frente al mercado y encaje con el estilo del equipo. Determinista y sin azar.
 */
export function signingVerdict(state: GameState, playerId: Id, buyerId: Id, price: { fee: number; wage?: number } = { fee: 0 }): SigningVerdict {
  return verdictFor(state, state.players[playerId], buyerId, price);
}

function verdictFor(state: GameState, p: Player | undefined, buyerId: Id, price: { fee: number; wage?: number }, valueOverride?: number): SigningVerdict {
  const buyer = state.clubs[buyerId];
  const tags: SigningTag[] = [];
  if (!p || !buyer) return { score: 50, stars: 3, tags, upgrade: 0 };
  const squad = clubPlayers(state, buyerId).filter((q) => !q.academy && q.id !== p.id && q.position === p.position);
  const top = squad.map((q) => overall(q)).sort((a, b) => b - a);
  const upgrade = overall(p) - (top[0] ?? 50);
  const value = Math.max(1, valueOverride ?? playerValue(state, p));
  const ratio = price.fee / value;
  const growth = Math.max(0, p.potential - overall(p));
  const youth = p.age <= 22 ? 1.2 : p.age <= 26 ? 0.8 : 0.2;
  const style = nearestPreset(buyer.tactic.tactic.sliders);
  const fit = styleFit(p, style);
  const country = COUNTRY_BY_CODE[buyer.countryCode];
  const fairWage = country ? wageForQuality(overall(p), country.econ, p.reputation, country.quality) : 0;
  const wage = price.wage ?? p.contract?.wage ?? 0;
  const wageRatio = fairWage > 0 ? wage / fairWage : 1;

  let score = 48 + upgrade * 2.4 + Math.min(14, growth * youth * 1.1) + (fit - 1) * 55;
  score += clamp((1 - ratio) * 14, -16, 12);
  score -= clamp((wageRatio - 1) * 12, 0, 14);
  if (squad.length === 0) score += 4; // cubre un hueco real
  score = Math.round(clamp(score, 0, 100));

  if (upgrade >= 3) tags.push('upgrade');
  else if (upgrade < 0 && top.length >= 2) tags.push('depth');
  if (price.fee > 0 && ratio <= 0.8) tags.push('bargain');
  if (ratio >= 1.35) tags.push('overpay');
  if (growth >= 8 && p.age <= 22) tags.push('prospect');
  if (wageRatio >= 1.35) tags.push('wageHeavy');
  if (fit >= 1.02) tags.push('fits');
  if (fit <= 0.94) tags.push('poorFit');
  if (p.age >= 32) tags.push('veteran');
  return { score, stars: clamp(1 + Math.round(score / 25), 1, 5), tags, upgrade };
}

// ───────────────────────── Veredicto a partir del informe del ojeador ─────────────────────────

export interface ReportVerdict extends SigningVerdict {
  /** Rango de la nota según el margen de error del informe. */
  lo: number;
  hi: number;
  margin: number;
  /** Día (temporada × 400 + día) del informe y su antigüedad en días. */
  reportAbs: number;
  daysOld: number;
}

/** Último informe del ojeador de `clubId` sobre un jugador (null si nunca se le ojeó). */
export function latestReportFor(state: GameState, playerId: Id, clubId: Id): ScoutReport | null {
  let latest: ScoutReport | null = null;
  for (const r of Object.values(state.scoutReports)) {
    if (r.playerId !== playerId) continue;
    if (state.scoutAssignments[r.assignmentId]?.clubId !== clubId) continue;
    if (!latest || r.season * 400 + r.day > latest.season * 400 + latest.day) latest = r;
  }
  return latest;
}

/**
 * Veredicto del fichaje usando SÓLO lo que el ojeador ha visto (atributos estimados con su margen de error,
 * potencial en rango y valor estimado). Sin informe devuelve `null`: hay que ojear primero.
 */
export function signingVerdictFromReport(state: GameState, playerId: Id, buyerId: Id, price: { fee: number; wage?: number } = { fee: 0 }): ReportVerdict | null {
  const p = state.players[playerId];
  if (!p) return null;
  // Un jugador propio se conoce al detalle.
  if (p.clubId === buyerId) return { ...verdictFor(state, p, buyerId, price), lo: 0, hi: 0, margin: 0, reportAbs: absDayOf(state), daysOld: 0 };
  const r = latestReportFor(state, playerId, buyerId);
  if (!r) return null;
  const shadow: Player = { ...p, attrs: r.estimatedAttrs, potential: Math.round((r.potentialRange[0] + r.potentialRange[1]) / 2) };
  const v = verdictFor(state, shadow, buyerId, price, r.estimatedValue);
  const spread = Math.min(30, Math.round(r.errorMargin * 1.4));
  const reportAbs = r.season * 400 + r.day;
  return { ...v, lo: clamp(v.score - spread, 0, 100), hi: clamp(v.score + spread, 0, 100), margin: r.errorMargin, reportAbs, daysOld: Math.max(0, absDayOf(state) - reportAbs) };
}

export interface SigningOutcome {
  /** 0-100 según su rendimiento real; null si aún no hay muestra. */
  score: number | null;
  stars: number;
  apps: number;
  avgRating: number;
}

/** Rendimiento real de un jugador ya fichado (necesita al menos 3 partidos). */
export function signingOutcome(p: Player): SigningOutcome {
  const apps = p.stats.apps;
  const avg = apps > 0 ? p.stats.ratingSum / apps : 0;
  if (apps < 3) return { score: null, stars: 3, apps, avgRating: avg };
  const contribution = (p.stats.goals * 6 + p.stats.assists * 4 + p.stats.cleanSheets * 2) / Math.max(1, apps);
  const score = Math.round(clamp(50 + (avg - 6.6) * 30 + contribution * 6 + Math.min(10, apps / 3), 0, 100));
  return { score, stars: clamp(1 + Math.round(score / 25), 1, 5), apps, avgRating: avg };
}
