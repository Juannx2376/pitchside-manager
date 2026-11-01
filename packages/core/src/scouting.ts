// Red de ojeadores geográfica: el conocimiento del país determina el margen de error y el tiempo
// del informe; la región sesga el tipo de perfiles que aparecen.
import { ATTRIBUTE_KEYS, HIDDEN_KEYS, POSITION_WEIGHTS, type AttrKey, type Attributes, type HiddenKey, type RegionProfile } from './attributes';
import { COUNTRIES, COUNTRY_BY_CODE, type CountryDef } from './data/countries';
import { generatePersonName } from './data/names';
import { msg, type Msg } from './i18n';
import { perkEffects } from './perks';
import { generatePlayer, marketValue, overall, overallAt, wageForQuality, type Player } from './player';
import type { Rng } from './rng';
import { addNews, clubPlayers, newId, type GameState } from './state';
import { tacticFit } from './tactics';
import { playerExpectations } from './transfers';
import { POSITION_GROUP, clamp, type Id, type Position, type PositionGroup } from './types';

export interface Scout {
  id: Id;
  firstName: string;
  lastName: string;
  nationality: string;
  judgeAbility: number;
  judgePotential: number;
  /** Conocimiento por país (código FIFA → 0-100). */
  countryKnowledge: Record<string, number>;
  wage: number;
  clubId: Id | null;
}

export interface ScoutAssignment {
  id: Id;
  scoutId: Id;
  clubId: Id;
  countryCode: string;
  position: Position;
  maxAge: number | null;
  season: number;
  startDay: number;
  durationDays: number;
  daysElapsed: number;
  done: boolean;
  errorMargin: number;
  /** 'search' = buscar perfiles en un país · 'player' = análisis individual de un jugador. */
  kind: 'search' | 'player';
  targetPlayerId?: Id;
}

/** Análisis profundo de un jugador concreto (pestaña "Analizar" en fichajes). */
export interface PlayerAnalysis {
  /** Rasgos ocultos estimados en escala 1-5. */
  hidden: Record<HiddenKey, number>;
  bestPositions: Position[];
  /** Rendimiento estimado en tu táctica actual (%). */
  tacticFit: number;
  /** Tu mejor jugador en esa posición y su media. */
  comparisonId: Id | null;
  comparisonOverall: number;
  /** Lo máximo que recomienda pagar. */
  maxFee: number;
  maxWage: number;
  verdict: 'sign' | 'consider' | 'avoid';
  strengths: AttrKey[];
  weaknesses: AttrKey[];
}

export interface ScoutReport {
  id: Id;
  assignmentId: Id;
  scoutId: Id;
  playerId: Id;
  season: number;
  day: number;
  countryCode: string;
  position: Position;
  errorMargin: number;
  estimatedAttrs: Attributes;
  estimatedOverall: number;
  potentialRange: [number, number];
  estimatedValue: number;
  recommendation: 'A' | 'B' | 'C' | 'D';
  notes: Msg;
  analysis?: PlayerAnalysis;
}

export const BASE_REPORT_DAYS = 14;

export function knowledgeOf(scout: Scout, countryCode: string): number {
  return clamp(scout.countryKnowledge[countryCode] ?? 0, 0, 100);
}

/** Margen ± en atributos: 100% de conocimiento → ±1, 0% → ±15 (modulado por Juzgar Habilidad). */
export function errorMarginFor(scout: Scout, countryCode: string): number {
  const k = knowledgeOf(scout, countryCode) / 100;
  const base = 1 + 14 * (1 - k);
  const judge = 1.15 - (0.3 * scout.judgeAbility) / 100;
  return Math.max(1, Math.round(base * judge));
}

export function potentialMarginFor(scout: Scout, countryCode: string): number {
  const k = knowledgeOf(scout, countryCode) / 100;
  const base = 1 + 14 * (1 - k);
  return Math.max(1, Math.round(base * (1.25 - (0.4 * scout.judgePotential) / 100)));
}

/** Días hasta el informe: con 0% de conocimiento tarda el triple. */
export function reportDurationFor(scout: Scout, countryCode: string): number {
  const k = knowledgeOf(scout, countryCode) / 100;
  return Math.round(BASE_REPORT_DAYS * (1 + 2 * (1 - k)));
}

export function generateScout(rng: Rng, id: Id, home: CountryDef, quality: number): Scout {
  const knowledge: Record<string, number> = { [home.code]: 100 };
  for (const c of COUNTRIES) {
    if (c.code === home.code) continue;
    if (c.confederation === home.confederation && rng.chance(0.45)) knowledge[c.code] = Math.round(clamp(rng.gauss(45, 18), 5, 90));
    else if (c.quality >= 64 && rng.chance(0.25)) knowledge[c.code] = Math.round(clamp(rng.gauss(30, 15), 5, 80));
  }
  return {
    id,
    ...generatePersonName(rng, home.nameRegion),
    nationality: home.code,
    judgeAbility: Math.round(clamp(rng.gauss(quality, 12), 10, 99)),
    judgePotential: Math.round(clamp(rng.gauss(quality, 12), 10, 99)),
    countryKnowledge: knowledge,
    wage: Math.round(900 * home.econ * (0.5 + quality / 60) + 120),
    clubId: null,
  };
}

/** Arquetipo que la región tiende a producir por grupo de posición (para el ranking de candidatos). */
const REGIONAL_SEARCH_BIAS: Partial<Record<RegionProfile, Partial<Record<PositionGroup, Partial<Record<AttrKey, number>>>>>> = {
  brazil: { ATT: { dribbling: 3, agility: 2, firstTouch: 2 }, MID: { dribbling: 2, firstTouch: 2, vision: 1 } },
  andean: { ATT: { pace: 3, dribbling: 3, acceleration: 2 }, MID: { dribbling: 2, agility: 1 } },
  latin_south: { ATT: { dribbling: 2, composure: 2 }, MID: { tackling: 2, aggression: 2, firstTouch: 1 }, DEF: { aggression: 2, tackling: 2 } },
  central: { MID: { positioning: 3, stamina: 3, strength: 2, decisions: 2 }, DEF: { positioning: 2, strength: 2 } },
  italian: { DEF: { marking: 3, positioning: 3 }, MID: { positioning: 2, decisions: 2 } },
  iberian: { MID: { passing: 3, vision: 3, firstTouch: 2 }, ATT: { firstTouch: 2, dribbling: 1 } },
  british: { DEF: { heading: 3, strength: 2 }, ATT: { heading: 2, strength: 2 }, MID: { workRate: 3, stamina: 2 } },
  nordic: { DEF: { heading: 3, strength: 3 }, ATT: { heading: 2, strength: 2 } },
  west_africa: { ATT: { pace: 3, strength: 2 }, MID: { stamina: 2, strength: 3 }, DEF: { pace: 2, strength: 2 } },
  north_africa: { ATT: { dribbling: 3, firstTouch: 2 }, MID: { firstTouch: 2, dribbling: 2 } },
  east_asia: { MID: { stamina: 3, workRate: 3, teamwork: 2 }, ATT: { acceleration: 2, workRate: 2 } },
  caribbean: { ATT: { pace: 4, acceleration: 3 } },
};

function regionalScore(p: Player, profile: RegionProfile, pos: Position): number {
  const bias = REGIONAL_SEARCH_BIAS[profile]?.[POSITION_GROUP[pos]];
  if (!bias) return 0;
  let s = 0;
  let w = 0;
  for (const k in bias) {
    const key = k as AttrKey;
    s += p.attrs[key] * (bias[key] ?? 0);
    w += bias[key] ?? 0;
  }
  return w ? (s / w - overall(p)) * 0.6 : 0;
}

/**
 * Pool de jugadores de un país NO cargado (ligas locales no simuladas en detalle).
 * Se genera bajo demanda la primera vez que se ojea el país.
 */
export function ensureScoutingPool(state: GameState, countryCode: string, rng: Rng): Id[] {
  const rt = state.countries[countryCode];
  if (rt.loaded) return [];
  if (rt.poolPlayerIds.length > 0) return rt.poolPlayerIds;
  const country = COUNTRY_BY_CODE[countryCode];
  const positions: Position[] = ['GK', 'RB', 'CB', 'CB', 'LB', 'DM', 'CM', 'CM', 'AM', 'RW', 'LW', 'ST', 'ST'];
  const count = 70;
  for (let i = 0; i < count; i++) {
    const position = positions[i % positions.length];
    const quality = clamp(rng.gauss(country.quality - 3, 7), 25, 90);
    const p = generatePlayer(rng, { id: newId(state, 'p'), country, position, quality, season: state.season });
    // Contrato con un club local no simulado: el traspaso se negocia con ese club "fantasma".
    p.contract = {
      wage: wageForQuality(overall(p), country.econ, p.reputation, country.quality),
      signedSeason: state.season,
      expiresSeason: state.season + rng.int(0, 3),
      releaseClause: null,
      goalBonus: 0,
      cleanSheetBonus: 0,
      signingBonus: 0,
    };
    state.players[p.id] = p;
    rt.poolPlayerIds.push(p.id);
  }
  return rt.poolPlayerIds;
}

function candidatesIn(state: GameState, countryCode: string, position: Position, maxAge: number | null, excludeClubId: Id): Player[] {
  const out: Player[] = [];
  const rt = state.countries[countryCode];
  const ids = new Set<Id>(rt.poolPlayerIds);
  for (const lid of rt.leagueIds) for (const cid of state.leagues[lid].clubIds) for (const pid of state.clubs[cid].playerIds) ids.add(pid);
  for (const id of ids) {
    const p = state.players[id];
    if (!p || p.retired || p.clubId === excludeClubId) continue;
    if (p.position !== position && !p.secondaryPositions.includes(position)) continue;
    if (maxAge !== null && p.age > maxAge) continue;
    out.push(p);
  }
  return out;
}

export function startAssignment(
  state: GameState,
  rng: Rng,
  opts: { scoutId: Id; clubId: Id; countryCode: string; position: Position; maxAge: number | null },
): ScoutAssignment {
  const scout = state.scouts[opts.scoutId];
  if (!scout) throw new Error('scout.missing');
  const busy = Object.values(state.scoutAssignments).some((a) => a.scoutId === scout.id && !a.done);
  if (busy) throw new Error('scout.busy');
  ensureScoutingPool(state, opts.countryCode, rng);
  const a: ScoutAssignment = {
    id: newId(state, 'sa'),
    scoutId: scout.id,
    clubId: opts.clubId,
    countryCode: opts.countryCode,
    position: opts.position,
    maxAge: opts.maxAge,
    season: state.season,
    startDay: state.day,
    durationDays: reportDurationFor(scout, opts.countryCode),
    daysElapsed: 0,
    done: false,
    errorMargin: errorMarginFor(scout, opts.countryCode),
    kind: 'search',
  };
  state.scoutAssignments[a.id] = a;
  return a;
}

/**
 * Análisis individual: el ojeador sigue a un jugador concreto. Tarda la mitad que una búsqueda
 * en ese país (mínimo 3 días) y el informe incluye rasgos ocultos, encaje táctico y precio máximo.
 */
export function startPlayerAnalysis(state: GameState, opts: { scoutId: Id; clubId: Id; playerId: Id }): ScoutAssignment {
  const scout = state.scouts[opts.scoutId];
  const p = state.players[opts.playerId];
  if (!scout || !p) throw new Error('scout.missing');
  if (Object.values(state.scoutAssignments).some((a) => a.scoutId === scout.id && !a.done)) throw new Error('scout.busy');
  const country = p.clubId ? state.clubs[p.clubId].countryCode : p.nationality;
  const a: ScoutAssignment = {
    id: newId(state, 'sa'),
    scoutId: scout.id,
    clubId: opts.clubId,
    countryCode: country,
    position: p.position,
    maxAge: null,
    season: state.season,
    startDay: state.day,
    durationDays: Math.max(2, Math.round(reportDurationFor(scout, country) / 2) - perkEffects(state).scoutDays),
    daysElapsed: 0,
    done: false,
    // Seguir a un solo jugador afina el informe: margen reducido a la mitad.
    errorMargin: Math.max(1, Math.round(errorMarginFor(scout, country) / 2)),
    kind: 'player',
    targetPlayerId: p.id,
  };
  state.scoutAssignments[a.id] = a;
  return a;
}

function hiddenLevel(v: number, margin: number, rng: Rng): number {
  return Math.round(clamp((v + rng.int(-margin * 2, margin * 2)) / 20 + 0.5, 1, 5));
}

function analyse(state: GameState, rng: Rng, a: ScoutAssignment, p: Player, est: Attributes, estOverall: number, estValue: number): PlayerAnalysis {
  const buyer = state.clubs[a.clubId];
  const hidden = {} as Record<HiddenKey, number>;
  for (const k of HIDDEN_KEYS) hidden[k] = hiddenLevel(p.hidden[k], a.errorMargin, rng);
  const positions = (['GK', 'RB', 'CB', 'LB', 'DM', 'CM', 'AM', 'RW', 'LW', 'ST'] as Position[])
    .map((pos) => ({ pos, v: overallAt({ ...p, attrs: est }, pos) }))
    .sort((x, y) => y.v - x.v)
    .slice(0, 3)
    .map((x) => x.pos);
  const fit = buyer ? Math.round(tacticFit(p, buyer.tactic.tactic) * 100) : 90;
  const mine = buyer ? clubPlayers(state, buyer.id).filter((x) => x.position === p.position).sort((x, y) => overall(y) - overall(x))[0] : undefined;
  const ex = buyer ? playerExpectations(state, p, buyer) : null;
  const upgrade = estOverall - (mine ? overall(mine) : 40);
  const ageBonus = p.age <= 23 ? 1.3 : p.age >= 31 ? 0.6 : 1;
  const worth = Math.round(estValue * clamp(1 + upgrade / 20, 0.6, 1.6) * ageBonus);
  // The advice is for this club: never more than it can spend, and "avoid" when the deal is out of reach.
  const budget = buyer ? buyer.finances.transferBudget : Infinity;
  const wageRoom = buyer ? Math.max(0, buyer.finances.wageBudget - clubPlayers(state, buyer.id).reduce((s, x) => s + (x.contract?.wage ?? 0), 0)) : Infinity;
  const maxFee = Math.round(Math.min(worth, budget));
  const affordable = !buyer || !ex || (worth * 0.7 <= budget && ex.willNegotiate && ex.minWage <= wageRoom * 1.2 && ex.revenueShare <= 0.15);
  const quality = upgrade >= 3 && fit >= 85 ? 'sign' : upgrade >= -2 || p.potential - estOverall > 8 ? 'consider' : 'avoid';
  const verdict = affordable ? quality : 'avoid';
  const outfield = ATTRIBUTE_KEYS.filter((k) => p.position === 'GK' || !['reflexes', 'handling', 'oneOnOnes'].includes(k));
  const sorted = [...outfield].sort((x, y) => est[y] - est[x]);
  return {
    hidden,
    bestPositions: positions,
    tacticFit: fit,
    comparisonId: mine?.id ?? null,
    comparisonOverall: mine ? overall(mine) : 0,
    maxFee,
    maxWage: ex ? Math.round(Math.min(ex.idealWage, Number.isFinite(wageRoom) ? Math.max(ex.minWage, wageRoom) : ex.idealWage)) : 0,
    verdict,
    strengths: sorted.slice(0, 4),
    weaknesses: sorted.slice(-3),
  };
}

function noisy(v: number, margin: number, rng: Rng): number {
  return Math.round(clamp(v + rng.int(-margin, margin), 1, 99));
}

export function buildReport(state: GameState, rng: Rng, a: ScoutAssignment, scout: Scout, p: Player): ScoutReport {
  const m = a.errorMargin;
  const est = {} as Attributes;
  for (const k of ATTRIBUTE_KEYS) est[k] = noisy(p.attrs[k], m, rng);
  const weights = POSITION_WEIGHTS[a.position];
  let s = 0;
  let w = 0;
  for (const k in weights) {
    s += est[k as AttrKey] * (weights[k as AttrKey] ?? 0);
    w += weights[k as AttrKey] ?? 0;
  }
  const estimatedOverall = Math.round(s / w);
  const pm = potentialMarginFor(scout, a.countryCode);
  const potCenter = clamp(p.potential + rng.int(-pm, pm), estimatedOverall, 99);
  const potentialRange: [number, number] = [Math.round(clamp(potCenter - pm, estimatedOverall, 99)), Math.round(clamp(potCenter + pm, estimatedOverall, 99))];
  const buyer = state.clubs[a.clubId];
  const buyerLevel = buyer ? squadLevel(state, buyer.id) : 60;
  const score = estimatedOverall - buyerLevel + (potentialRange[0] + potentialRange[1]) / 2 / 10 - 6;
  const recommendation = score >= 4 ? 'A' : score >= 0 ? 'B' : score >= -5 ? 'C' : 'D';
  const sellerEcon = p.clubId ? (COUNTRY_BY_CODE[state.clubs[p.clubId].countryCode]?.econ ?? 0.05) : COUNTRY_BY_CODE[p.nationality].econ;
  const estimatedValue = Math.round(marketValue(p, { econ: sellerEcon, season: state.season }) * rng.float(1 - m / 60, 1 + m / 60));
  const strongest = (Object.keys(est) as AttrKey[])
    .filter((k) => k !== 'reflexes' && k !== 'handling' && k !== 'oneOnOnes')
    .sort((x, y) => est[y] - est[x])
    .slice(0, 3);
  const notes = msg('scout.notes', {
    a1: msg(`attr.${strongest[0]}`),
    a2: msg(`attr.${strongest[1]}`),
    a3: msg(`attr.${strongest[2]}`),
    m,
    country: msg('country', { code: a.countryCode }),
    k: knowledgeOf(scout, a.countryCode),
  });
  return {
    analysis: a.kind === 'player' ? analyse(state, rng, a, p, est, estimatedOverall, estimatedValue) : undefined,
    id: newId(state, 'sr'),
    assignmentId: a.id,
    scoutId: scout.id,
    playerId: p.id,
    season: state.season,
    day: state.day,
    countryCode: a.countryCode,
    position: a.position,
    errorMargin: m,
    estimatedAttrs: est,
    estimatedOverall,
    potentialRange,
    estimatedValue,
    recommendation,
    notes,
  };
}

function squadLevel(state: GameState, clubId: Id): number {
  const ps = state.clubs[clubId].playerIds.map((id) => state.players[id]).filter(Boolean);
  const top = ps.map((p) => overall(p)).sort((a, b) => b - a).slice(0, 11);
  return top.length ? top.reduce((s, v) => s + v, 0) / top.length : 50;
}

/** Avanza un día todas las misiones; las completadas generan informes. */
export function processScoutingDay(state: GameState, rng: Rng): ScoutReport[] {
  const produced: ScoutReport[] = [];
  for (const a of Object.values(state.scoutAssignments)) {
    if (a.done) continue;
    a.daysElapsed++;
    if (a.daysElapsed < a.durationDays) continue;
    a.done = true;
    const scout = state.scouts[a.scoutId];
    if (!scout) continue;
    if (a.kind === 'player' && a.targetPlayerId) {
      const target = state.players[a.targetPlayerId];
      if (!target) continue;
      const r = buildReport(state, rng, a, scout, target);
      state.scoutReports[r.id] = r;
      produced.push(r);
      if (a.clubId === state.userClubId) {
        addNews(state, {
          category: 'scouting',
          title: msg('news.analysisReady.t', { p: `${target.firstName} ${target.lastName}` }),
          body: msg(`news.analysisReady.${r.analysis?.verdict ?? 'consider'}`, { scout: `${scout.firstName} ${scout.lastName}` }),
          clubIds: [a.clubId],
          playerId: target.id,
          importance: 2,
        });
      }
      continue;
    }
    const cands = candidatesIn(state, a.countryCode, a.position, a.maxAge, a.clubId);
    const profile = COUNTRY_BY_CODE[a.countryCode].profile;
    // El ojeador ordena con su propio error: los informes de un país desconocido son menos fiables también en la selección.
    const ranked = cands
      .map((p) => ({
        p,
        score:
          overallAt(p, a.position) * 0.65 +
          p.potential * 0.35 +
          (p.age <= 23 ? 3 : p.age >= 31 ? -4 : 0) +
          regionalScore(p, profile, a.position) +
          rng.gauss(0, a.errorMargin * 0.6),
      }))
      .sort((x, y) => y.score - x.score)
      .slice(0, 5);
    for (const { p } of ranked) {
      const r = buildReport(state, rng, a, scout, p);
      state.scoutReports[r.id] = r;
      produced.push(r);
    }
    scout.countryKnowledge[a.countryCode] = Math.min(100, knowledgeOf(scout, a.countryCode) + 4);
    if (a.clubId === state.userClubId) {
      addNews(state, {
        category: 'scouting',
        title: msg('news.scoutReport.t', { pos: msg('pos', { p: a.position }), country: msg('country', { code: a.countryCode }) }),
        body: msg('news.scoutReport.b', { scout: `${scout.firstName} ${scout.lastName}`, n: ranked.length, days: a.durationDays, m: a.errorMargin }),
        clubIds: [a.clubId],
        importance: 2,
      });
    }
  }
  return produced;
}

/** Lo que el usuario "ve" de un jugador: exacto si es suyo, si no el último informe o nada. */
export function visibleAttributes(state: GameState, playerId: Id): { attrs: Attributes; margin: number } | null {
  const p = state.players[playerId];
  if (!p) return null;
  if (p.clubId && p.clubId === state.userClubId) return { attrs: p.attrs, margin: 0 };
  let latest: ScoutReport | null = null;
  for (const r of Object.values(state.scoutReports)) {
    if (r.playerId !== playerId) continue;
    if (!latest || r.season > latest.season || (r.season === latest.season && r.day > latest.day)) latest = r;
  }
  return latest ? { attrs: latest.estimatedAttrs, margin: latest.errorMargin } : null;
}
