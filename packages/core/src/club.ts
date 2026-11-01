// Clubes, mánagers y selección de alineaciones según la táctica del entrenador.
import type { BankLoan, ClubFacilities, ConstructionProject, CrestDesign, FanBase, Sponsorship, TicketPolicy } from './clubOps';
import type { CountryDef } from './data/countries';
import { generatePersonName } from './data/names';
import type { ClubFinances } from './finance';
import { isAvailable, overall, overallAt, type Player, type SquadStatus } from './player';
import { Rng, hashString } from './rng';
import type { GameState } from './state';
import type { TrainingPlan } from './training';
import {
  PRESETS,
  culturalFamiliarity,
  ensureTacticV3,
  makeTactic,
  nearestPreset,
  positionFromSlot,
  slotPositions,
  styleFit,
  suggestRoles,
  tacticalPositionsOf,
  zoneFromSlot,
  type PlayerFocus,
  type Tactic,
  type TacticalPosition,
} from './tactics';
import { TACTICAL_STYLES, FORMATION_LIST, clamp, type Formation, type Id, type Position, type TacticalStyle } from './types';

export interface Stadium {
  name: string;
  capacity: number;
  /** 0-100: estado de conservación (afecta mantenimiento y asistencia). */
  condition: number;
}

/** Táctica activa + once, banquillo y lanzadores. */
export interface TeamSetup {
  tactic: Tactic;
  /** 11 ids en el orden de tactic.slots ('' = hueco vacío). */
  lineup: Id[];
  bench: Id[];
  captainId: Id | null;
  penaltyTakerId: Id | null;
  freeKickTakerId: Id | null;
  cornerTakerId: Id | null;
}

export type SeasonObjective = 'title' | 'continental' | 'top_half' | 'mid_table' | 'survival' | 'promotion';

/** Objetivos de la directiva por áreas (estilo EA FC): cada uno pesa en su valoración. */
export interface BoardObjectives {
  league: SeasonObjective;
  /** Ronda mínima de copa (0 = ninguna exigencia). */
  cupRound: number;
  /** Resultado económico mínimo de la temporada (EUR; negativo = pérdidas toleradas). */
  financeTarget: number;
  /** Minutos que deben sumar los sub-21 en liga. */
  youthMinutes: number;
  /** Reputación que debe alcanzar el club. */
  brandReputation: number;
}

export type YouthPolicy = 'balanced' | 'potential' | 'ready';

export interface Club {
  id: Id;
  name: string;
  shortName: string;
  city: string;
  countryCode: string;
  leagueId: Id;
  /** 0-100 */
  reputation: number;
  colors: [string, string];
  stadium: Stadium;
  fanBase: number;
  youthFacilities: number;
  youthRecruitment: number;
  /** Política de cantera: equilibrada, más potencial o más listos para el primer equipo. */
  youthPolicy?: YouthPolicy;
  trainingFacilities: number;
  /** 0-100: calidad del cuerpo técnico de clubes IA (el del usuario sale de su staff). */
  staffQuality: number;
  managerId: Id | null;
  playerIds: Id[];
  scoutIds: Id[];
  staffIds: Id[];
  tactic: TeamSetup;
  /** Tácticas guardadas por el usuario (máx. 5). */
  savedTactics: Tactic[];
  /** 0-100: lo bien que el equipo conoce su táctica actual. */
  tacticFamiliarity: number;
  /** 0-100: química del vestuario. */
  chemistry: number;
  /** 0-100: confianza de la directiva en el mánager. */
  boardConfidence: number;
  objective: SeasonObjective;
  objectives: BoardObjectives;
  finances: ClubFinances;
  sponsors: Sponsorship[];
  loans: BankLoan[];
  projects: ConstructionProject[];
  facilities: ClubFacilities;
  tickets: TicketPolicy;
  fans: FanBase;
  isUser: boolean;
  source: 'real' | 'generated' | 'custom';
  /** URL del escudo (Wikimedia) si existe. */
  logo?: string;
  /** Escudo diseñado por el usuario (club propio). */
  crest?: CrestDesign;
  /** true si los colores vienen de datos reales (si no, la interfaz los deduce del escudo). */
  colorsKnown?: boolean;
  founded?: number;
  /** Presión mediática acumulada por filtraciones del vestuario. */
  leakPressure: number;
  /** Mejor ronda de copa alcanzada esta temporada. */
  cupProgress: number;
  /** Plan de entrenamiento por grupos (sólo el club del usuario; se crea al primer uso). */
  trainingPlan?: TrainingPlan;
}

export interface Manager {
  id: Id;
  firstName: string;
  lastName: string;
  nationality: string;
  age: number;
  preferredStyle: TacticalStyle;
  preferredFormation: Formation;
  adaptability: number;
  tacticalKnowledge: number;
  manManagement: number;
  mediaHandling: number;
  reputation: number;
  clubId: Id | null;
  /** Selección nacional que dirige (código FIFA), si alguna. */
  nationalTeam: string | null;
  pressRelation: number;
  isHuman: boolean;
  sackings: number;
  /** Avatar (índice de preset) para el mánager humano. */
  avatar?: number;
  /** Experiencia, nivel y puntos de habilidad sin gastar (misiones). */
  xp?: number;
  level?: number;
  points?: number;
  trophies: { season: number; competition: string; clubId: Id | null }[];
  history: { season: number; clubId: Id; position: number; leagueId: Id }[];
}

export function managerName(m: Manager): string {
  return `${m.firstName} ${m.lastName}`;
}

export function generateManager(rng: Rng, id: Id, country: CountryDef, quality: number): Manager {
  // El estilo predilecto se sesga hacia la cultura futbolística del país.
  const style = rng.weightedPick(
    TACTICAL_STYLES.filter((s) => s !== 'BALANCED'),
    (s) => 1 + culturalFamiliarity(country.profile, s) / 8,
  );
  const formation = rng.pick(PRESETS[style].formations);
  const q = clamp(quality, 20, 95);
  return {
    id,
    ...generatePersonName(rng, country.nameRegion),
    nationality: country.code,
    age: rng.int(36, 66),
    preferredStyle: style,
    preferredFormation: formation,
    adaptability: Math.round(clamp(rng.gauss(50, 18), 5, 95)),
    tacticalKnowledge: Math.round(clamp(rng.gauss(q, 8), 10, 99)),
    manManagement: Math.round(clamp(rng.gauss(q, 10), 10, 99)),
    mediaHandling: Math.round(clamp(rng.gauss(55, 15), 5, 99)),
    reputation: Math.round(clamp((q - 35) * 1.5 + rng.gauss(0, 6), 1, 99)),
    clubId: null,
    nationalTeam: null,
    pressRelation: 60,
    isHuman: false,
    sackings: 0,
    trophies: [],
    history: [],
  };
}

export function emptySetup(tactic: Tactic): TeamSetup {
  return { tactic, lineup: [], bench: [], captainId: null, penaltyTakerId: null, freeKickTakerId: null, cornerTakerId: null };
}

/**
 * Once greedy: rellena primero los puestos más escasos (portero, centrales, delanteros)
 * con el jugador que maximiza media × encaje × forma física. Excluye a los canteranos de la academia.
 */
export function pickLineup(players: Player[], tactic: Tactic): { lineup: Id[]; bench: Id[] } {
  const slots = slotPositions(tactic);
  const available = players.filter((p) => isAvailable(p) && !p.academy);
  const used = new Set<Id>();
  const lineup: Id[] = new Array(slots.length).fill('');
  const order = slots.map((pos, idx) => ({ pos, idx })).sort((a, b) => scarcity(a.pos) - scarcity(b.pos));
  // Encaje con el estilo y estado físico: una vez por jugador (no por jugador × puesto).
  const style = nearestPreset(tactic.sliders);
  const factor = new Map<Id, number>();
  for (const p of available) factor.set(p.id, styleFit(p, style) * (0.6 + 0.4 * (p.fitness / 100)) * (0.9 + 0.2 * (p.form / 100)));
  const ovrCache = new Map<string, number>();
  const ovr = (p: Player, pos: Position) => {
    const k = p.id + pos;
    let v = ovrCache.get(k);
    if (v === undefined) {
      v = overallAt(p, pos);
      ovrCache.set(k, v);
    }
    return v;
  };
  for (const { pos, idx } of order) {
    let best: Player | null = null;
    let bestScore = -1;
    for (const p of available) {
      if (used.has(p.id)) continue;
      const s = ovr(p, pos) * (factor.get(p.id) as number);
      if (s > bestScore) {
        bestScore = s;
        best = p;
      }
    }
    if (best) {
      lineup[idx] = best.id;
      used.add(best.id);
    }
  }
  const rest = available.filter((p) => !used.has(p.id)).sort((a, b) => overall(b) - overall(a));
  const bench: Id[] = [];
  const gk = rest.find((p) => p.position === 'GK');
  if (gk) bench.push(gk.id);
  for (const p of rest) {
    if (bench.length >= 9) break;
    if (!bench.includes(p.id)) bench.push(p.id);
  }
  return { lineup, bench };
}

function scarcity(pos: Position): number {
  return { GK: 0, CB: 1, ST: 2, DM: 3, CM: 4, RB: 5, LB: 5, AM: 6, RW: 7, LW: 7 }[pos];
}

/** Lanzadores y capitán: el mejor de los titulares en cada faceta. */
export function assignTakers(setup: TeamSetup, players: Player[]): void {
  const byId = new Map(players.map((p) => [p.id, p]));
  const starters = setup.lineup.map((id) => byId.get(id)).filter((p): p is Player => !!p);
  if (starters.length === 0) return;
  const best = (score: (p: Player) => number) => [...starters].sort((a, b) => score(b) - score(a))[0]?.id ?? null;
  if (!setup.captainId || !setup.lineup.includes(setup.captainId)) setup.captainId = best((p) => p.attrs.leadership + p.age * 0.5);
  if (!setup.penaltyTakerId || !setup.lineup.includes(setup.penaltyTakerId)) setup.penaltyTakerId = best((p) => p.attrs.finishing + p.attrs.composure);
  if (!setup.freeKickTakerId || !setup.lineup.includes(setup.freeKickTakerId)) setup.freeKickTakerId = best((p) => p.attrs.setPieces * 2 + p.attrs.longShots);
  if (!setup.cornerTakerId || !setup.lineup.includes(setup.cornerTakerId)) setup.cornerTakerId = best((p) => p.attrs.setPieces + p.attrs.crossing);
}

/** Titulares que no pueden jugar (lesionados, sancionados o fuera de la plantilla) — índices del once. */
export function unavailableInLineup(setup: TeamSetup, players: Player[]): number[] {
  const byId = new Map(players.map((p) => [p.id, p]));
  const out: number[] = [];
  setup.lineup.forEach((id, i) => {
    const p = id ? byId.get(id) : undefined;
    if (id && (!p || !isAvailable(p))) out.push(i);
    else if (!id) out.push(i);
  });
  return out;
}

/**
 * Sustituye en el once a los no disponibles por el mejor disponible para cada hueco (el resto del
 * once se respeta). Devuelve cuántos huecos se rellenaron.
 */
export function replaceUnavailable(setup: TeamSetup, tactic: Tactic, players: Player[]): number {
  const bad = unavailableInLineup(setup, players);
  if (!bad.length) return 0;
  const slots = slotPositions(tactic);
  const lineup = [...setup.lineup];
  while (lineup.length < slots.length) lineup.push('');
  let filled = 0;
  for (const i of bad) {
    let best: Player | null = null;
    let bestScore = -1;
    for (const p of players) {
      if (p.academy || !isAvailable(p) || lineup.includes(p.id)) continue;
      const s = (p.position === slots[i] ? 6 : p.secondaryPositions.includes(slots[i]) ? 3 : 0) + overallAt(p, slots[i]) * (0.7 + (0.3 * p.fitness) / 100);
      if (s > bestScore) {
        bestScore = s;
        best = p;
      }
    }
    if (best) {
      lineup[i] = best.id;
      filled++;
    } else lineup[i] = '';
  }
  setup.lineup = lineup;
  setup.bench = setup.bench.filter((id) => !lineup.includes(id));
  assignTakers(setup, players);
  return filled;
}

/** Enfoque individual (Ataque/Equilibrado/Defensa) según la altura del hueco en la rejilla V2. */
function aiFocusFor(pos: TacticalPosition): PlayerFocus {
  const h = zoneFromSlot(pos).height;
  if (h <= 1) return 'attack';
  if (h >= 5) return 'defend';
  return 'balanced';
}

/** Puntuación del once de una formación: media efectiva en cada puesto de la rejilla V2. */
function xiScore(players: Player[], tactic: Tactic, lineup: Id[], style: TacticalStyle): number {
  const byId = new Map(players.map((p) => [p.id, p]));
  const named = tacticalPositionsOf(tactic.slots);
  let total = 0;
  tactic.slots.forEach((_slot, i) => {
    const p = byId.get(lineup[i] ?? '');
    if (!p) {
      total -= 12;
      return;
    }
    const base = positionFromSlot(named[i]);
    total += overallAt(p, base) * styleFit(p, style) * (0.9 + 0.2 * (p.fitness / 100));
  });
  return total;
}

/** Proporción de huecos (0-1) que la plantilla puede cubrir con jugadores naturales (posición o secundaria). */
export function formationNaturalFit(players: Player[], positions: Position[]): number {
  if (positions.length === 0) return 0;
  const used = new Set<Id>();
  // Asigna primero los puestos más escasos (portero, centrales, delanteros).
  const order = positions.map((pos, i) => ({ pos, i })).sort((a, b) => scarcity(a.pos) - scarcity(b.pos));
  let matched = 0;
  for (const { pos } of order) {
    let pick: Player | null = null;
    let bestScore = -Infinity;
    for (const p of players) {
      if (used.has(p.id) || p.academy || p.retired) continue;
      const natural = p.position === pos ? 2 : p.secondaryPositions.includes(pos) ? 1 : 0;
      if (natural === 0) continue;
      const score = natural * 100 + overallAt(p, pos);
      if (score > bestScore) {
        bestScore = score;
        pick = p;
      }
    }
    if (pick) {
      used.add(pick.id);
      matched++;
    }
  }
  return matched / positions.length;
}

/** Aplica a un club IA una táctica: once, banquillo, roles, enfoques individuales y lanzadores. */
function aiApplySetup(club: Club, tactic: Tactic, players: Player[]): void {
  club.tactic.tactic = tactic;
  const { lineup, bench } = pickLineup(players, tactic);
  const positions = tacticalPositionsOf(tactic.slots);
  const byId = new Map(players.map((p) => [p.id, p]));
  // Roles según las cualidades de cada jugador y el estilo del equipo (mismo asistente que el usuario).
  tactic.roles = suggestRoles(
    tactic,
    lineup.map((id) => byId.get(id ?? '') ?? null),
  );
  tactic.focus = positions.map(aiFocusFor);
  ensureTacticV3(tactic);
  club.tactic.lineup = lineup;
  club.tactic.bench = bench;
  club.tactic.captainId = null;
  club.tactic.penaltyTakerId = null;
  club.tactic.freeKickTakerId = null;
  club.tactic.cornerTakerId = null;
  assignTakers(club.tactic, players);
}

/** Plantilla de un club a partir del estado (sin importar `state.ts` para no crear ciclos). */
function squadOf(state: GameState, club: Club): Player[] {
  const out: Player[] = [];
  for (const id of club.playerIds) {
    const p = state.players[id];
    if (p && !p.retired) out.push(p);
  }
  return out;
}

/**
 * La IA configura la táctica y el once de un club sobre la rejilla de la Táctica V2:
 * elige estilo (si el mánager es adaptable) y formación maximizando el encaje real de la
 * plantilla (disponibilidad, medias por puesto y compatibilidad en la rejilla), y reparte
 * roles y enfoques individuales según la posición táctica V2 de cada hueco.
 *
 * `rng` es opcional: los flujos con azar compartido (partido, día) lo pasan para no romper la
 * secuencia; si falta se deriva uno determinista a partir del club y la fecha.
 */
export function aiChooseTactic(state: GameState, clubId: Id, rng?: Rng): void {
  const club = state.clubs[clubId];
  if (!club || club.isUser) return;
  const manager = club.managerId ? state.managers[club.managerId] : null;
  if (!manager) return;
  const players = squadOf(state, club);
  if (players.length === 0) return;
  const r = rng ?? new Rng(hashString(`${clubId}:${state.season}:${state.day}`));

  // Estilo: el de su filosofía o, si es adaptable, el que mejor encaja con la plantilla.
  let style = manager.preferredStyle;
  if (manager.adaptability > 70 && players.length >= 14) {
    let bestStyle = style;
    let bestCoh = 0;
    for (const s of TACTICAL_STYLES) {
      const coh = players.reduce((acc, p) => acc + styleFit(p, s), 0) * (s === manager.preferredStyle ? 1.04 : 1);
      if (coh > bestCoh) {
        bestCoh = coh;
        bestStyle = s;
      }
    }
    style = bestStyle;
  }

  // Formación: entre las del estilo y la preferida, la que mejor aprovecha la plantilla.
  const candidates = new Set<Formation>(PRESETS[style].formations);
  candidates.add(manager.preferredFormation);
  let bestFormation = manager.preferredFormation;
  let bestScore = -Infinity;
  for (const f of candidates) {
    const probe = makeTactic(`ai-${club.id}`, style, style, f);
    const { lineup } = pickLineup(players, probe);
    const score = xiScore(players, probe, lineup, style) + (f === manager.preferredFormation ? 2 : 0) + r.float(0, 0.5);
    if (score > bestScore) {
      bestScore = score;
      bestFormation = f;
    }
  }

  let tactic = club.tactic.tactic;
  if (tactic.preset !== style || tactic.formation !== bestFormation) {
    tactic = makeTactic(`ai-${club.id}`, style, style, bestFormation);
    club.tactic.tactic = tactic;
  }

  // Reparte roles y enfoques individuales según la posición táctica V2 de cada hueco.
  aiApplySetup(club, tactic, players);
}

/**
 * Adaptabilidad del mánager IA: si su plantilla no cuenta con jugadores naturales para sostener el
 * dibujo actual, cambia su formación preferida por otra de la Táctica V2 que mejor encaje y
 * reconstruye el once. Devuelve `true` si ha cambiado de dibujo.
 */
export function aiAdaptFormation(state: GameState, clubId: Id): boolean {
  const club = state.clubs[clubId];
  if (!club || club.isUser) return false;
  const manager = club.managerId ? state.managers[club.managerId] : null;
  // Un mánager rígido prefiere mantener su idea aunque la plantilla no encaje.
  if (!manager || manager.adaptability < 40) return false;
  const players = squadOf(state, club).filter((p) => !p.academy);
  if (players.length < 14) return false;
  const current = club.tactic.tactic;
  const currentFit = formationNaturalFit(players, slotPositions(current));
  if (currentFit >= 0.72) return false;
  const style = nearestPreset(current.sliders);
  let bestFormation = current.formation as Formation;
  let bestFit = currentFit;
  for (const f of FORMATION_LIST) {
    if (f === current.formation) continue;
    const probe = makeTactic(`ai-${club.id}`, style, style, f);
    const fit = formationNaturalFit(players, slotPositions(probe));
    if (fit > bestFit + 0.05) {
      bestFit = fit;
      bestFormation = f;
    }
  }
  if (bestFormation === current.formation) return false;
  manager.preferredFormation = bestFormation;
  aiApplySetup(club, makeTactic(`ai-${club.id}`, style, style, bestFormation), players);
  // El nuevo dibujo arranca con un pequeño chute de familiaridad para el estilo en uso.
  for (const p of players) p.styleFamiliarity[style] = Math.min(100, (p.styleFamiliarity[style] ?? 40) + 2);
  return true;
}

/** Rol en la plantilla según jerarquía de calidad (la IA; el usuario puede fijarlos a mano). */
export function assignSquadStatuses(players: Player[], respectManual = false): void {
  const sorted = [...players].filter((p) => !p.academy).sort((a, b) => overall(b) - overall(a));
  sorted.forEach((p, i) => {
    if (respectManual && p.statusLocked) return;
    let s: SquadStatus;
    if (p.age <= 19 && i > 14) s = 'youth';
    else if (i < 3) s = 'key';
    else if (i < 11) s = 'first';
    else if (i < 18) s = 'rotation';
    else s = 'backup';
    p.squadStatus = s;
  });
}

export function squadStrength(players: Player[]): number {
  const top = players
    .filter((p) => !p.retired && !p.academy)
    .map((p) => overall(p))
    .sort((a, b) => b - a)
    .slice(0, 16);
  if (top.length === 0) return 0;
  return top.reduce((s, v) => s + v, 0) / top.length;
}

/** Objetivo de liga de la directiva en función del ranking de reputación dentro de la liga. */
export function computeObjective(club: Club, leagueClubs: Club[], tier: number): SeasonObjective {
  const ranked = [...leagueClubs].sort((a, b) => b.reputation - a.reputation);
  const idx = ranked.findIndex((c) => c.id === club.id);
  const n = ranked.length;
  if (tier > 1 && idx < 3) return 'promotion';
  if (idx === 0) return 'title';
  if (idx < Math.max(2, Math.round(n * 0.2))) return 'continental';
  if (idx < n * 0.45) return 'top_half';
  if (idx < n * 0.75) return 'mid_table';
  return 'survival';
}

export function objectiveTargetPosition(obj: SeasonObjective, leagueSize: number): number {
  switch (obj) {
    case 'title':
      return 1;
    case 'continental':
      return Math.max(2, Math.round(leagueSize * 0.2));
    case 'top_half':
      return Math.round(leagueSize / 2);
    case 'mid_table':
      return Math.round(leagueSize * 0.7);
    case 'survival':
      return leagueSize - 3;
    case 'promotion':
      return 3;
  }
}

const KIT_COLORS = ['#e10600', '#0047ab', '#ffffff', '#111111', '#ffd400', '#00843d', '#6c1d45', '#87ceeb', '#ff7a00', '#5b2c83', '#a50021', '#003366'];

export function randomColors(rng: Rng): [string, string] {
  const a = rng.pick(KIT_COLORS);
  let b = rng.pick(KIT_COLORS);
  while (b === a) b = rng.pick(KIT_COLORS);
  return [a, b];
}
