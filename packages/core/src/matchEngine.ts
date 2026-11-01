// Simulador de partidos por pasos (un minuto por paso).
//
// Cada minuto: reparto de posesión (mediocampo + táctica) → avance del balón por zonas →
// posibilidad de ocasión (ataque vs defensa, mods de la táctica, emparejamiento) → tipo de ocasión
// (terrestre/aérea/contra/balón parado) → fuera de juego (árbitro) → tiro con xG → duelo con el portero.
// En paralelo: faltas y tarjetas con error humano del árbitro, simulaciones, lesiones, fatiga, clima.
// El usuario puede intervenir entre pasos: cambios, nueva táctica y charla del descanso.
import type { AttrKey } from './attributes';
import type { Club, Manager } from './club';
import { msg, variantKey, type Msg } from './i18n';
import { overallAt, type Player } from './player';
import { judgeDive, judgeFoul, judgeOffside, refereeName, type Referee } from './referee';
import type { Rng } from './rng';
import {
  ROLE_DEFS,
  STYLE_MATCHUP,
  ZONE_LANES,
  nearestPreset,
  roleEffectScale,
  roleFit,
  roleMultiplier,
  slotPositions,
  slotShape,
  styleFit,
  tacticMods,
  tacticalPositionOf,
  tacticalPositionsOf,
  type AttackSide,
  type MarkingStyle,
  type PassingRisk,
  type PlayerChannel,
  type PlayerFocus,
  type PlayerInstruction,
  type PlayerRole,
  type StyleMods,
  type Tactic,
  type TacticalPosition,
} from './tactics';
import { POSITION_GROUP, clamp, type Id, type Position, type TacticalStyle } from './types';

export type SideKey = 'home' | 'away';
export type Weather = 'sunny' | 'cloudy' | 'rain' | 'snow' | 'wind' | 'hot';
export type TeamTalk = 'calm' | 'motivate' | 'demand' | 'praise';

export interface MatchSide {
  club: Club;
  /** Titulares en el orden de los huecos de la táctica. */
  players: Player[];
  bench: Player[];
  tactic: Tactic;
  manager: Manager | null;
  penaltyTakerId: Id | null;
  freeKickTakerId?: Id | null;
  /** Nombre a mostrar (clubes o selecciones). */
  name?: string;
  /** El usuario decide los cambios (partido en directo); si no, los hace el asistente. */
  manualSubs?: boolean;
  /** Tiempos muertos extra por mitad (perks del mánager). */
  extraTimeouts?: number;
}

export interface MatchInput {
  home: MatchSide;
  away: MatchSide;
  referee: Referee;
  rng: Rng;
  importance: number;
  neutral: boolean;
  knockout: boolean;
  crowdPressure: number;
  weather?: Weather;
  attendance?: number;
}

export type MatchEventType =
  | 'kickoff'
  | 'goal'
  | 'save'
  | 'miss'
  | 'chance'
  | 'corner'
  | 'freekick'
  | 'foul'
  | 'yellow'
  | 'second_yellow'
  | 'red'
  | 'penalty_awarded'
  | 'penalty_missed'
  | 'offside'
  | 'injury'
  | 'sub'
  | 'controversy'
  | 'info'
  | 'tactic'
  | 'halftime'
  | 'fulltime'
  | 'shootout';

export interface MatchEvent {
  minute: number;
  type: MatchEventType;
  side: SideKey | null;
  playerId?: Id;
  assistId?: Id;
  msg: Msg;
  controversy?: number;
  score: [number, number];
  xg?: number;
  /** Zona del balón 0 (portería local) – 100 (portería visitante) para la vista 2D. */
  x?: number;
  y?: number;
}

export interface TeamStats {
  possession: number;
  shots: number;
  onTarget: number;
  xg: number;
  fouls: number;
  yellows: number;
  reds: number;
  corners: number;
  offsides: number;
  passes: number;
}

export interface PlayerMatchStats {
  playerId: Id;
  side: SideKey;
  position: Position;
  started: boolean;
  minutes: number;
  rating: number;
  goals: number;
  assists: number;
  shots: number;
  saves: number;
  yellow: number;
  red: boolean;
  injured: boolean;
  endFitness: number;
}

/** Estado minuto a minuto para la visualización (posesión, balón, dominio). */
export interface MinuteFrame {
  minute: number;
  side: SideKey;
  ballX: number;
  ballY: number;
  /** -100 (domina visitante) … 100 (domina local) */
  momentum: number;
}

export interface MatchResult {
  homeGoals: number;
  awayGoals: number;
  events: MatchEvent[];
  frames: MinuteFrame[];
  stats: Record<SideKey, TeamStats>;
  players: Record<Id, PlayerMatchStats>;
  shootout: { home: number; away: number; winner: SideKey } | null;
  controversies: MatchEvent[];
  refereeId: Id;
  motmId: Id | null;
  weather: Weather;
  attendance: number;
}

interface Live {
  p: Player;
  pos: Position;
  /** Posición táctica V2 del hueco (para las líneas y los emparejamientos de rejilla). */
  tacticalPos: TacticalPosition;
  role: PlayerRole;
  /** Enfoque individual: Ataque / Equilibrado / Defensa. */
  focus: PlayerFocus;
  /** Instrucciones individuales activas. */
  instructions: PlayerInstruction[];
  /** Coordenada x (0-100) de su hueco: define el carril que cubre al defender. */
  x: number;
  /** Carril de ataque elegido por el usuario (`auto` = el de su hueco). */
  channel: PlayerChannel;
  /** Riesgo de sus pases. */
  passing: PassingRisk;
  side: SideKey;
  base: number;
  fatigue: number;
  onPitch: boolean;
  yellow: boolean;
  st: PlayerMatchStats;
}

/** Vista pública de un jugador en el campo (para la UI del partido en directo). */
export interface LiveOnPitch {
  player: Player;
  pos: Position;
  tacticalPos: TacticalPosition;
  role: PlayerRole;
  channel: PlayerChannel;
  passing: PassingRisk;
  focus: PlayerFocus;
  instructions: PlayerInstruction[];
  fatigue: number;
  rating: number;
  yellow: boolean;
}

interface TeamLive {
  key: SideKey;
  side: MatchSide;
  mods: StyleMods;
  style: TacticalStyle;
  live: Live[];
  bench: Live[];
  subsLeft: number;
  chemistry: number;
  tactical: number;
  homeBoost: number;
  /** Ajuste temporal por la charla del descanso. */
  talkBoost: number;
  stats: TeamStats;
  possessionMinutes: number;
  goals: number;
}

interface Strength {
  att: number;
  mid: number;
  def: number;
  gk: number;
  /** Presencia ofensiva por carril (0 izquierda … 4 derecha). */
  threat: number[];
  /** Cobertura defensiva por carril. */
  cover: number[];
}

const POS_SHOT_WEIGHT: Record<Position, number> = { ST: 5, RW: 2.6, LW: 2.6, AM: 2.4, CM: 1.1, DM: 0.45, RB: 0.35, LB: 0.35, CB: 0.4, GK: 0 };
/** Peso como rematador / asistente de un rol (tabla `ROLE_DEFS`, con el riesgo de pase del jugador). */
const roleWeight = (base: number, l: { role: PlayerRole; p: Player }) => (l.role === 'default' ? 1 : 1 + (base - 1) * roleEffectScale(roleFit(l.p, l.role)));
const roleShot = (l: { role: PlayerRole; p: Player }) => roleWeight(ROLE_DEFS[l.role]?.shot ?? 1, l);
const PASS_ASSIST: Record<PassingRisk, number> = { safe: 0.88, mixed: 1, risky: 1.2 };
const roleAssist = (l: { role: PlayerRole; passing: PassingRisk; p: Player }) => roleWeight(ROLE_DEFS[l.role]?.assist ?? 1, l) * PASS_ASSIST[l.passing];
const WEATHER_MOD: Record<Weather, { quality: number; error: number; fatigue: number }> = {
  sunny: { quality: 1, error: 1, fatigue: 1 },
  cloudy: { quality: 1, error: 1, fatigue: 1 },
  rain: { quality: 0.92, error: 1.25, fatigue: 1.05 },
  snow: { quality: 0.85, error: 1.4, fatigue: 1.1 },
  wind: { quality: 0.9, error: 1.15, fatigue: 1 },
  hot: { quality: 0.97, error: 1.05, fatigue: 1.25 },
};

function emptyStats(): TeamStats {
  return { possession: 0, shots: 0, onTarget: 0, xg: 0, fouls: 0, yellows: 0, reds: 0, corners: 0, offsides: 0, passes: 0 };
}

const name = (l: Live) => `${l.p.firstName ? `${l.p.firstName.charAt(0)}. ` : ''}${l.p.lastName}`;

// ───────────────────────── Táctica V2: enfoques, instrucciones y rejilla ─────────────────────────
// Regla estricta: ninguna combinación de enfoques o instrucciones puede alterar el ratio base de
// generación de ocasiones más de un ±18%. Todo multiplicador táctico se pasa por `clampTac`.
const TACTICAL_MIN = 0.82;
const TACTICAL_MAX = 1.18;
const clampTac = (v: number) => clamp(v, TACTICAL_MIN, TACTICAL_MAX);

/**
 * Anclas de calibración globales. La refactorización de líneas por rejilla V2 redistribuye el
 * ratio ataque/medio/defensa, así que la base de generación de ocasiones se reajusta para que la
 * media de goles se mantenga en la banda histórica (~2.1–3.4 por partido) en cualquier preset.
 */
const CHANCE_BASE = 0.212;
/** Base de generación de contraataques. */
const COUNTER_BASE = 0.0075;

/** Límites estrictos del control táctico V2: ningún multiplicador táctico sale de ±18%. */
export const TACTICAL_CLAMP = { min: TACTICAL_MIN, max: TACTICAL_MAX } as const;

/** Recorta un multiplicador táctico V2 al margen estricto de control (±18%). */
export function clampTacticalValue(v: number): number {
  return clampTac(v);
}

/** Intención ofensiva neta de cada instrucción individual (se suma al `focus`). */
const INSTR_INTENT: Partial<Record<PlayerInstruction, number>> = {
  getForward: 0.7,
  shootOnSight: 0.35,
  dribbleMore: 0.2,
  earlyCross: 0.1,
  stayWide: 0.1,
  pressMore: 0.15,
  stayBack: -0.7,
  manMark: -0.3,
  holdPosition: -0.25,
  roam: 0.2,
  longBalls: 0.05,
  tackleHard: -0.05,
};

/** Desgaste físico extra (relativo, por minuto) de las instrucciones de esfuerzo. */
const INSTR_FATIGUE: Partial<Record<PlayerInstruction, number>> = {
  pressMore: 0.06,
  getForward: 0.04,
  dribbleMore: 0.02,
  manMark: 0.02,
  roam: 0.03,
  tackleHard: 0.015,
};

/** Reparto de la amenaza por carriles según el lado elegido para atacar. */
const SIDE_BIAS: Record<AttackSide, number[]> = {
  balanced: [1, 1, 1, 1, 1],
  left: [1.35, 1.15, 1, 0.9, 0.8],
  center: [0.85, 1.05, 1.3, 1.05, 0.85],
  right: [0.8, 0.9, 1, 1.15, 1.35],
};

/** Atributos ofensivos y defensivos modulados por el enfoque/instrucciones del jugador. */
const ATT_ATTRS = new Set<AttrKey>(['finishing', 'dribbling', 'crossing', 'longShots', 'firstTouch', 'passing', 'vision']);
const DEF_ATTRS = new Set<AttrKey>(['tackling', 'marking', 'positioning', 'aggression', 'strength', 'heading', 'jumping', 'workRate', 'decisions', 'composure']);

/** Intención ofensiva neta de un jugador (−1.2 defensiva … +1.2 ofensiva). */
export function tacticalIntent(focus: PlayerFocus, instructions: PlayerInstruction[]): number {
  let v = focus === 'attack' ? 0.8 : focus === 'defend' ? -0.8 : 0;
  for (const i of instructions) v += INSTR_INTENT[i] ?? 0;
  return clamp(v, -1.2, 1.2);
}

/** Intención ofensiva neta de un jugador (−1.2 defensiva … +1.2 ofensiva). */
function attackIntent(l: Live): number {
  const risk = l.passing === 'risky' ? 0.2 : l.passing === 'safe' ? -0.15 : 0;
  return clamp(tacticalIntent(l.focus, l.instructions) + (ROLE_DEFS[l.role]?.intent ?? 0) + risk, -1.2, 1.2);
}

/** Multiplicador puro de atributo (0.85–1.15) que aplican enfoque e instrucciones a un atributo. */
export function tacticalAttrMod(key: AttrKey, focus: PlayerFocus, instructions: PlayerInstruction[]): number {
  const intent = tacticalIntent(focus, instructions);
  let m = 1;
  if (ATT_ATTRS.has(key)) m *= 1 + 0.06 * intent;
  else if (DEF_ATTRS.has(key)) m *= 1 - 0.05 * intent;
  return clamp(m, 0.85, 1.15);
}

/**
 * Multiplicador de emparejamiento geográfico inverso a partir de las presencias por carril puros:
 * la amenaza del atacante se cruza con la cobertura del rival en espejo y se compara con la que el
 * rival consigue, de modo que el resultado es simétrico. Siempre dentro del ±18% de control.
 */
export function geographicMatchupMult(atkThreat: number[], defCover: number[], defThreat: number[], atkCover: number[]): number {
  const lanes = atkThreat.length;
  if (lanes === 0) return 1;
  const totalA = atkThreat.reduce((a, b) => a + b, 0) || 1;
  const totalB = defThreat.reduce((a, b) => a + b, 0) || 1;
  let advA = 0;
  let advB = 0;
  for (let lane = 0; lane < lanes; lane++) {
    advA += (atkThreat[lane] / totalA) * defCover[lanes - 1 - lane];
    advB += (defThreat[lane] / totalB) * atkCover[lanes - 1 - lane];
  }
  return clampTac(Math.sqrt((advB + 1) / (advA + 1)));
}

export function rollWeather(rng: Rng, day: number, countryProfile: string): Weather {
  // Invierno del hemisferio norte: días ~150-260 de la temporada.
  const winter = day > 150 && day < 260 && !['andean', 'brazil', 'caribbean', 'west_africa', 'southeast_asia', 'oceania', 'middle_east', 'central_america'].includes(countryProfile);
  return rng.weightedPick(['sunny', 'cloudy', 'rain', 'snow', 'wind', 'hot'] as Weather[], (w) =>
    ({ sunny: 4, cloudy: 3, rain: winter ? 3 : 1.5, snow: winter ? 0.8 : 0, wind: 1, hot: winter ? 0 : ['middle_east', 'west_africa', 'brazil'].includes(countryProfile) ? 2 : 0.6 })[w],
  );
}

/** Momentos clave que pausan el partido y dejan decidir al usuario. */
export type KeyMomentKind = 'penalty' | 'freeKick';
export type PenaltyStyle = 'power' | 'placed' | 'panenka';
export type FreeKickChoice = 'shoot' | 'cross';

export interface KeyMomentCandidate {
  playerId: Id;
  /** Puntuación (0-100) de lo bien que lo lanza. */
  score: number;
}

export interface KeyMoment {
  kind: KeyMomentKind;
  minute: number;
  side: SideKey;
  candidates: KeyMomentCandidate[];
  defaultTakerId: Id;
}

export interface MomentChoice {
  takerId?: Id;
  penalty?: PenaltyStyle;
  freeKick?: FreeKickChoice;
}

export class MatchSim {
  readonly input: MatchInput;
  readonly events: MatchEvent[] = [];
  readonly frames: MinuteFrame[] = [];
  minute = 0;
  /** Minuto de juego mostrado (sin el añadido). */
  displayMinute = 0;
  finished = false;
  halftimePending = false;
  /** Tiempos muertos tácticos que le quedan a cada lado en la parte actual (1 por mitad). */
  private timeouts: Record<SideKey, number> = { home: 1, away: 1 };
  /** Lado del usuario para los momentos clave interactivos (null = todo automático). */
  momentSide: SideKey | null = null;
  /** Momento clave esperando la decisión del usuario: mientras exista, `step()` no avanza. */
  pendingMoment: KeyMoment | null = null;
  private deferredMoment: { kind: KeyMomentKind; minute: number; atkKey: SideKey; shot?: 'setpiece' | 'aerial' } | null = null;
  private teams: Record<SideKey, TeamLive>;
  private score: [number, number] = [0, 0];
  private added1: number;
  private added2: number;
  private totalMinutes: number;
  private firstHalfDone = false;
  private strengthDirty = true;
  private sH: Strength = { att: 0, mid: 0, def: 0, gk: 0, threat: [0, 0, 0, 0, 0], cover: [0, 0, 0, 0, 0] };
  private sA: Strength = { att: 0, mid: 0, def: 0, gk: 0, threat: [0, 0, 0, 0, 0], cover: [0, 0, 0, 0, 0] };
  private ballX = 50;
  private momentum = 0;
  private shootout: MatchResult['shootout'] = null;
  readonly weather: Weather;

  constructor(input: MatchInput) {
    this.input = input;
    const rng = input.rng;
    this.weather = input.weather ?? 'cloudy';
    this.timeouts = { home: 1 + (input.home.extraTimeouts ?? 0), away: 1 + (input.away.extraTimeouts ?? 0) };
    this.teams = { home: this.build('home', input.home), away: this.build('away', input.away) };
    this.added1 = rng.int(1, 4);
    this.added2 = rng.int(2, 7);
    this.totalMinutes = 90 + this.added1 + this.added2;
    this.push(0, 'kickoff', null, msg('mc.kickoff', { ref: refereeName(input.referee), weather: msg(`weather.${this.weather}`) }));
  }

  private build(key: SideKey, side: MatchSide): TeamLive {
    const positions = slotPositions(side.tactic);
    const style = nearestPreset(side.tactic.sliders);
    const v2 = tacticalPositionsOf(side.tactic.slots);
    const live = side.players.map((p, i) => {
      const pos = positions[i] ?? p.position;
      return this.makeLive(p, pos, side.tactic.roles[i] ?? 'default', key, style, true, v2[i] ?? tacticalPositionOf(pos), side.tactic.focus?.[i] ?? 'balanced', side.tactic.instructions?.[i] ?? [], {
        x: side.tactic.slots[i]?.x ?? 50,
        channel: side.tactic.channels?.[i] ?? 'auto',
        passing: side.tactic.passing?.[i] ?? 'mixed',
      });
    });
    const bench = side.bench.map((p) => this.makeLive(p, p.position, 'default', key, style, false));
    const tk = side.manager?.tacticalKnowledge ?? 50;
    const familiarity = side.club.tacticFamiliarity ?? 60;
    return {
      key,
      side,
      mods: tacticMods(side.tactic),
      style,
      live,
      bench,
      subsLeft: 5,
      chemistry: 0.95 + (0.1 * side.club.chemistry) / 100,
      tactical: (1 + (tk - 50) / 900) * (0.95 + familiarity / 1500),
      homeBoost: key === 'home' && !this.input.neutral ? 1.04 : 1,
      talkBoost: 1,
      stats: emptyStats(),
      possessionMinutes: 0,
      goals: 0,
    };
  }

  private makeLive(
    p: Player,
    pos: Position,
    role: PlayerRole,
    side: SideKey,
    style: TacticalStyle,
    started: boolean,
    tacticalPos: TacticalPosition = tacticalPositionOf(pos),
    focus: PlayerFocus = 'balanced',
    instructions: PlayerInstruction[] = [],
    extra: { x: number; channel: PlayerChannel; passing: PassingRisk } = { x: 50, channel: 'auto', passing: 'mixed' },
  ): Live {
    const rng = this.input.rng;
    const consistencyNoise = ((100 - p.hidden.consistency) / 100) * 0.09;
    const dayForm = clamp(1 + rng.gauss(0, consistencyNoise), 0.86, 1.12);
    const bigMatch = 1 + this.input.importance * ((p.hidden.bigMatches - 50) / 600);
    const morale = 0.93 + (0.14 * p.morale) / 100;
    const form = 0.96 + (0.08 * p.form) / 100;
    const base = overallAt(p, pos) * styleFit(p, style) * roleMultiplier(p, role) * dayForm * bigMatch * morale * form;
    return {
      p,
      pos,
      tacticalPos,
      role,
      focus,
      instructions,
      x: extra.x,
      channel: extra.channel,
      passing: extra.passing,
      side,
      base,
      fatigue: p.fitness,
      onPitch: started,
      yellow: false,
      st: { playerId: p.id, side, position: pos, started, minutes: 0, rating: 6.0 + (dayForm - 1) * 4, goals: 0, assists: 0, shots: 0, saves: 0, yellow: 0, red: false, injured: false, endFitness: p.fitness },
    };
  }

  get currentScore(): [number, number] {
    return [this.score[0], this.score[1]];
  }

  teamStats(side: SideKey): TeamStats {
    const t = this.teams[side];
    const total = this.teams.home.possessionMinutes + this.teams.away.possessionMinutes || 1;
    return { ...t.stats, possession: Math.round((100 * t.possessionMinutes) / total) };
  }

  onPitch(side: SideKey): LiveOnPitch[] {
    return this.teams[side].live.filter((l) => l.onPitch).map((l) => ({
      player: l.p,
      pos: l.pos,
      tacticalPos: l.tacticalPos,
      role: l.role,
      channel: l.channel,
      passing: l.passing,
      focus: l.focus,
      instructions: l.instructions,
      fatigue: l.fatigue,
      rating: l.st.rating,
      yellow: l.yellow,
    }));
  }

  benchOf(side: SideKey): Player[] {
    return this.teams[side].bench.filter((b) => !b.onPitch && b.st.minutes === 0 && !b.st.injured).map((b) => b.p);
  }

  subsLeft(side: SideKey): number {
    return this.teams[side].subsLeft;
  }

  private push(minute: number, type: MatchEventType, side: SideKey | null, m: Msg, extra: Partial<MatchEvent> = {}) {
    this.events.push({ minute, type, side, msg: m, score: [this.score[0], this.score[1]], x: this.ballX, ...extra });
  }

  private v(base: string): string {
    return variantKey(base, this.input.rng.next() * 1000);
  }

  private static other(k: SideKey): SideKey {
    return k === 'home' ? 'away' : 'home';
  }

  private onPitchLive(t: TeamLive): Live[] {
    return t.live.filter((l) => l.onPitch);
  }

  private gkOf(t: TeamLive): Live | undefined {
    return t.live.find((l) => l.onPitch && l.pos === 'GK');
  }

  private eff(l: Live): number {
    return l.base * (0.72 + (0.28 * l.fatigue) / 100);
  }

  /** Atributo de un jugador con los multiplicadores de su enfoque e instrucciones (±15%). */
  private at(l: Live, key: AttrKey): number {
    return l.p.attrs[key] * tacticalAttrMod(key, l.focus, l.instructions);
  }

  /** Desgaste físico extra (relativo) por enfoque ofensivo e instrucciones de esfuerzo. */
  private fatigueExtra(l: Live): number {
    let f = (l.focus === 'attack' ? 0.05 : 0) + (ROLE_DEFS[l.role]?.fatigue ?? 0);
    for (const i of l.instructions) f += INSTR_FATIGUE[i] ?? 0;
    return clamp(f, 0, 0.18);
  }

  /** Sesgo de posesión por presión/marcaje individual (clamp estricto ±0.05). */
  private pressBias(t: TeamLive): number {
    const on = this.onPitchLive(t).filter((l) => l.pos !== 'GK');
    if (on.length === 0) return 0;
    let s = 0;
    for (const l of on) {
      if (l.instructions.includes('pressMore')) s += 0.06;
      if (l.instructions.includes('manMark')) s += 0.02;
      if (l.instructions.includes('stayBack')) s += 0.01;
    }
    return clamp(s / on.length, -0.05, 0.05);
  }

  /**
   * Ventaja geográfica inversa de una transición: la presencia ofensiva de cada carril se cruza con
   * la cobertura defensiva del carril opuesto (el extremo izquierdo ataca al lateral derecho).
   * Se mide la explotación del atacante frente a la que el rival logra en espejo, de modo que el
   * multiplicador es simétrico (geoA × geoB ≈ 1) y no sesga la media de goles. Acotado al ±18%.
   */
  private geoMatchup(atk: Strength, def: Strength): number {
    return geographicMatchupMult(atk.threat, def.cover, def.threat, atk.cover);
  }

  /**
   * Líneas de un equipo desde la rejilla V2 (5 carriles × 7 alturas): cada posición táctica aporta
   * un peso específico a ataque, medio y defensa, y se registra la presencia por carril para los
   * emparejamientos geográficos. Sustituye a los promedios genéricos por grupo de posición.
   */
  private strength(t: TeamLive): Strength {
    const on = this.onPitchLive(t);
    const numbers = Math.pow(on.length / 11, 0.7);
    const k = t.chemistry * t.tactical * t.homeBoost * numbers * t.talkBoost;
    let attW = 0;
    let midW = 0;
    let defW = 0;
    let attS = 0;
    let midS = 0;
    let defS = 0;
    const threat = new Array<number>(ZONE_LANES).fill(0);
    const cover = new Array<number>(ZONE_LANES).fill(0);
    for (const l of on) {
      if (l.pos === 'GK') continue;
      // Aporte del hueco + su rol; carril de ataque (forzado o el de su posición) y carril que cubre.
      const w = slotShape(l.tacticalPos, l.role, l.channel, l.x, l.instructions, l.role === 'default' ? undefined : roleFit(l.p, l.role));
      const e = this.eff(l);
      const intent = attackIntent(l);
      const aE = e * clamp(1 + 0.12 * intent, TACTICAL_MIN, TACTICAL_MAX);
      const dE = e * clamp(1 - 0.12 * intent, TACTICAL_MIN, TACTICAL_MAX);
      attS += aE * w.att;
      attW += w.att;
      midS += e * w.mid;
      midW += w.mid;
      defS += dE * w.def;
      defW += w.def;
      if (w.roaming) {
        // Rol libre / "roam": su amenaza y su cobertura se reparten por todo el ancho.
        for (let k = 0; k < ZONE_LANES; k++) {
          threat[k] += (aE * w.att) / ZONE_LANES;
          cover[k] += (dE * w.def) / ZONE_LANES;
        }
      } else {
        threat[w.threatLane] += aE * w.att;
        cover[w.coverLane] += dE * w.def;
      }
    }
    // Lado elegido para atacar: concentra la amenaza donde el equipo quiere y la hace más previsible.
    const bias = SIDE_BIAS[t.side.tactic.attackSide ?? 'balanced'];
    for (let k = 0; k < ZONE_LANES; k++) threat[k] *= bias[k];
    // Marcaje al hombre: los defensas siguen a su hombre y la cobertura deja de depender del carril.
    const marking: MarkingStyle = t.side.tactic.marking ?? 'zonal';
    if (marking !== 'zonal') {
      const mean = cover.reduce((a, b) => a + b, 0) / ZONE_LANES;
      const flat = marking === 'man' ? 0.5 : 0.25;
      for (let k = 0; k < ZONE_LANES; k++) cover[k] = cover[k] * (1 - flat) + mean * flat;
    }
    const mid = midW ? midS / midW : 0;
    const att = attW ? attS / attW : mid * 0.85;
    const def = defW ? defS / defW : mid * 0.8;
    const gkLive = this.gkOf(t);
    const gk = gkLive ? this.eff(gkLive) : def * 0.45;
    return { att: att * k, mid: (mid || (att + def) / 2) * k, def: def * k, gk: gk * t.homeBoost, threat, cover };
  }

  private tension(minute: number): number {
    return clamp((minute / 90) * 0.6 + (Math.abs(this.score[0] - this.score[1]) <= 1 ? 0.3 : 0) + this.input.importance * 0.3, 0, 1);
  }

  private scoreGoal(minute: number, atk: TeamLive, shooter: Live, assister: Live | null, xg: number, m: Msg, controversy?: number) {
    atk.goals++;
    if (atk.key === 'home') this.score[0]++;
    else this.score[1]++;
    shooter.st.goals++;
    shooter.st.rating += POSITION_GROUP[shooter.pos] === 'ATT' ? 1.0 : 1.2;
    if (assister) {
      assister.st.assists++;
      assister.st.rating += 0.6;
    }
    const def = this.teams[MatchSim.other(atk.key)];
    const gk = this.gkOf(def);
    if (gk) gk.st.rating -= 0.3;
    for (const l of this.onPitchLive(def)) if (POSITION_GROUP[l.pos] === 'DEF') l.st.rating -= 0.12;
    this.ballX = atk.key === 'home' ? 97 : 3;
    this.momentum = clamp(this.momentum + (atk.key === 'home' ? 25 : -25), -100, 100);
    this.push(minute, 'goal', atk.key, m, { playerId: shooter.p.id, assistId: assister?.p.id, xg, controversy });
  }

  private chooseShooter(atk: TeamLive, aerial: boolean): Live {
    const cands = this.onPitchLive(atk).filter((l) => l.pos !== 'GK');
    return this.input.rng.weightedPick(cands, (l) =>
      (aerial
        ? (POS_SHOT_WEIGHT[l.pos] + (l.pos === 'CB' ? 1.2 : 0)) * Math.pow((this.at(l, 'heading') + this.at(l, 'jumping')) / 100, 2) * (l.role === 'targetMan' ? 1.8 : 1)
        : POS_SHOT_WEIGHT[l.pos] * Math.pow(this.at(l, 'finishing') / 60, 2)) *
      roleShot(l) *
      (l.instructions.includes('shootOnSight') ? 1.25 : 1),
    );
  }

  private chooseAssister(atk: TeamLive, shooter: Live, aerial: boolean): Live | null {
    const rng = this.input.rng;
    if (rng.chance(0.24)) return null;
    const cands = this.onPitchLive(atk).filter((l) => l !== shooter && l.pos !== 'GK');
    if (cands.length === 0) return null;
    return rng.weightedPick(cands, (l) =>
      (aerial
        ? Math.pow(this.at(l, 'crossing') / 60, 2) * (['RB', 'LB', 'RW', 'LW'].includes(l.pos) ? 2 : 0.7) * (l.instructions.includes('earlyCross') ? 1.2 : 1) * (l.instructions.includes('longBalls') ? 1.15 : 1)
        : Math.pow((this.at(l, 'passing') + this.at(l, 'vision')) / 120, 2)) * roleAssist(l),
    );
  }

  private resolveShot(minute: number, atk: TeamLive, kind: 'ground' | 'aerial' | 'counter' | 'setpiece', takerId?: Id) {
    const rng = this.input.rng;
    if (!this.onPitchLive(atk).some((l) => l.pos !== 'GK')) return;
    const def = this.teams[MatchSim.other(atk.key)];
    const aerial = kind === 'aerial';
    const shooter =
      kind === 'setpiece'
        ? (this.onPitchLive(atk).find((l) => l.p.id === (takerId ?? atk.side.freeKickTakerId)) ?? this.chooseShooter(atk, false))
        : this.chooseShooter(atk, aerial);
    const assister = kind === 'setpiece' ? null : this.chooseAssister(atk, shooter, aerial);
    const w = WEATHER_MOD[this.weather];
    const cq = atk.mods.chanceQuality * (kind === 'counter' ? 1.45 + Math.max(0, def.mods.spaceBehind) : 1) * (aerial ? 0.85 : 1) * (kind === 'setpiece' ? 0.75 : 1) * w.quality;
    const xg = clamp(-Math.log(1 - rng.next() * 0.999) * 0.087 * cq, 0.015, 0.85);
    atk.stats.shots++;
    atk.stats.xg += xg;
    shooter.st.shots++;
    const gk = this.gkOf(def);
    const skill =
      kind === 'setpiece'
        ? this.at(shooter, 'setPieces') * 0.7 + this.at(shooter, 'longShots') * 0.3
        : aerial
          ? this.at(shooter, 'heading') * 0.5 + this.at(shooter, 'jumping') * 0.3 + this.at(shooter, 'strength') * 0.2
          : this.at(shooter, 'finishing') * 0.65 + this.at(shooter, 'composure') * 0.35;
    const shooterQ = skill * (this.eff(shooter) / Math.max(1, shooter.base)) * (shooter.base / Math.max(1, overallAt(shooter.p, shooter.pos)));
    const gkQ = gk ? (gk.p.attrs.reflexes * 0.4 + gk.p.attrs.handling * 0.25 + gk.p.attrs.oneOnOnes * 0.35) * (this.eff(gk) / Math.max(1, gk.base)) * (gk.base / Math.max(1, overallAt(gk.p, 'GK'))) / w.error ** 0.3 : 20;
    const pGoal = clamp(xg * Math.pow(Math.max(10, shooterQ) / Math.max(10, gkQ), 0.85), 0.005, 0.95);
    this.ballX = atk.key === 'home' ? rng.float(80, 94) : rng.float(6, 20);

    let offsideControversy: number | undefined;
    if (kind === 'ground' || kind === 'counter') {
      const trap = def.mods.offsideTrap;
      if (rng.chance((kind === 'counter' ? 0.2 : 0.1) + trap)) {
        const marginCm = rng.gauss(-4 + trap * 60, 22);
        const d = judgeOffside(this.input.referee, rng, { marginCm, attackerIsHome: atk.key === 'home', crowdPressure: this.input.crowdPressure, tension: this.tension(minute) });
        if (d.flagged) {
          atk.stats.offsides++;
          atk.stats.shots--;
          atk.stats.xg -= xg;
          shooter.st.shots--;
          this.push(minute, 'offside', atk.key, msg(this.v('mc.offside'), { p: name(shooter) }), { playerId: shooter.p.id });
          if (!d.correct && xg > 0.15) {
            this.push(minute, 'controversy', atk.key, msg('mc.ctrv.offsideWrong', { p: name(shooter), cm: Math.abs(Math.round(marginCm)) }), { controversy: d.controversy, playerId: shooter.p.id });
          }
          return;
        }
        if (!d.correct) offsideControversy = d.controversy;
      }
    }

    if (rng.chance(pGoal)) {
      const base = kind === 'counter' ? 'mc.goalCounter' : aerial ? 'mc.goalHeader' : kind === 'setpiece' ? 'mc.goalFreeKick' : 'mc.goal';
      this.scoreGoal(minute, atk, shooter, assister, xg, msg(this.v(base), { p: name(shooter), a: assister ? name(assister) : '' }), offsideControversy);
      atk.stats.onTarget++;
      if (offsideControversy !== undefined) {
        this.push(minute, 'controversy', MatchSim.other(atk.key), msg('mc.ctrv.goalOffside', { p: name(shooter) }), { controversy: offsideControversy, playerId: shooter.p.id });
      }
      return;
    }
    const onTarget = rng.chance(0.42 + (shooterQ - 60) / 400);
    if (onTarget && gk) {
      atk.stats.onTarget++;
      gk.st.saves++;
      gk.st.rating += 0.22;
      shooter.st.rating += 0.08;
      this.push(minute, 'save', atk.key, msg(this.v('mc.save'), { p: name(shooter), gk: name(gk) }), { playerId: shooter.p.id, xg });
      if (rng.chance(0.3)) this.corner(minute, atk);
    } else {
      shooter.st.rating -= 0.06;
      if (xg > 0.12 || rng.chance(0.3)) this.push(minute, 'miss', atk.key, msg(this.v('mc.miss'), { p: name(shooter) }), { playerId: shooter.p.id, xg });
      if (rng.chance(0.15)) this.corner(minute, atk);
    }
  }

  private cornerChain = false;

  private corner(minute: number, atk: TeamLive) {
    atk.stats.corners++;
    if (this.input.rng.chance(0.5)) this.push(minute, 'corner', atk.key, msg(this.v('mc.corner'), { team: atk.side.name ?? atk.side.club.name }));
    // La jugada ensayada del córner (estilo del equipo) puede acabar en remate; sin encadenar córners.
    if (this.cornerChain) return;
    const style = atk.side.tactic.cornerStyle ?? 'mixed';
    const p = style === 'near' ? 0.07 : style === 'far' ? 0.065 : style === 'short' ? 0.045 : 0.055;
    if (this.input.rng.chance(p)) {
      this.cornerChain = true;
      this.resolveShot(minute, atk, style === 'short' ? 'ground' : 'aerial');
      this.cornerChain = false;
    }
  }

  /** Lo bien que un jugador lanza un penalti (0-100). */
  private penaltyScore(l: Live): number {
    return Math.round(l.p.attrs.finishing * 0.45 + l.p.attrs.composure * 0.4 + l.p.attrs.setPieces * 0.15);
  }

  private takePenalty(minute: number, atk: TeamLive, choice?: MomentChoice) {
    const rng = this.input.rng;
    if (this.onPitchLive(atk).length === 0) return;
    const def = this.teams[MatchSim.other(atk.key)];
    const preferred = this.onPitchLive(atk).find((l) => l.p.id === (choice?.takerId ?? atk.side.penaltyTakerId));
    const byScore = [...this.onPitchLive(atk)].sort((a, b) => this.penaltyScore(b) - this.penaltyScore(a));
    // El usuario decide en directo: el partido se detiene y se reanuda en `resolveMoment`.
    if (!choice && this.momentSide === atk.key && !this.pendingMoment) {
      const candidates = byScore.filter((l) => l.pos !== 'GK').slice(0, 5).map((l) => ({ playerId: l.p.id, score: this.penaltyScore(l) }));
      this.pendingMoment = { kind: 'penalty', minute, side: atk.key, candidates, defaultTakerId: (preferred ?? byScore[0]).p.id };
      this.deferredMoment = { kind: 'penalty', minute, atkKey: atk.key };
      return;
    }
    const taker = preferred ?? byScore[0];
    const gk = this.gkOf(def);
    const style = choice?.penalty ?? 'placed';
    const styleMod = style === 'power' ? 0.03 : style === 'panenka' ? -0.14 + (taker.p.attrs.composure - 60) / 500 : 0;
    const pGoal = clamp(0.76 + styleMod + (taker.p.attrs.composure - 60) / 300 + (taker.p.attrs.finishing - 60) / 400 - (gk ? (gk.p.attrs.reflexes - 60) / 350 : -0.1), 0.45, 0.93);
    atk.stats.shots++;
    atk.stats.xg += 0.76;
    taker.st.shots++;
    this.ballX = atk.key === 'home' ? 89 : 11;
    if (rng.chance(pGoal)) {
      atk.stats.onTarget++;
      this.scoreGoal(minute, atk, taker, null, 0.76, msg(this.v('mc.penaltyGoal'), { p: name(taker) }));
    } else {
      taker.st.rating -= 0.5;
      if (gk) gk.st.rating += 0.6;
      this.push(minute, 'penalty_missed', atk.key, msg(this.v('mc.penaltyMiss'), { p: name(taker), gk: gk ? name(gk) : '' }), { playerId: taker.p.id });
    }
  }

  private sendOff(l: Live) {
    this.strengthDirty = true;
    l.onPitch = false;
    l.st.red = true;
    l.st.rating -= 1.5;
  }

  private processFoul(minute: number, atk: TeamLive) {
    const rng = this.input.rng;
    const def = this.teams[MatchSim.other(atk.key)];
    const defenders = this.onPitchLive(def).filter((l) => l.pos !== 'GK');
    const victims = this.onPitchLive(atk).filter((l) => l.pos !== 'GK');
    if (defenders.length === 0 || victims.length === 0) return;
    const offender = rng.weightedPick(
      defenders,
      (l) => this.at(l, 'aggression') / 50 + (POSITION_GROUP[l.pos] === 'DEF' ? 0.6 : 0.3) + (l.role === 'ballWinner' || l.role === 'stopper' ? 0.5 : 0) + (l.instructions.includes('pressMore') ? 0.3 : 0) + (l.instructions.includes('tackleHard') ? 0.4 : 0),
    );
    const victim = rng.weightedPick(victims, (l) => this.at(l, 'dribbling') / 50 + 0.2);
    const aggr = (this.at(offender, 'aggression') - 50) / 250 + (def.mods.foulRate - 1) * 0.15;
    const severity = clamp(Math.pow(rng.next(), 1.55) + aggr, 0, 1);
    const inBox = rng.chance(0.045 + (this.at(victim, 'dribbling') - 60) / 1200 + (atk.mods.aerialShare > 0.25 ? 0.01 : 0));
    const ref = this.input.referee;
    const dec = judgeFoul(ref, rng, {
      severity,
      inBox,
      offenderIsAway: def.key === 'away',
      crowdPressure: this.input.neutral ? 0 : this.input.crowdPressure,
      tension: this.tension(minute),
      offenderHasYellow: offender.yellow,
    });
    const refN = refereeName(ref);
    if (!dec.foulCalled) {
      if (dec.truth.foul && inBox && severity > 0.42) {
        this.push(minute, 'controversy', atk.key, msg('mc.ctrv.penaltyDenied', { ref: refN, p: name(victim) }), { controversy: dec.controversy, playerId: victim.p.id });
      }
      return;
    }
    def.stats.fouls++;
    offender.st.rating -= 0.05;
    if (dec.card === 'yellow') {
      offender.st.yellow++;
      def.stats.yellows++;
      offender.st.rating -= 0.3;
      if (offender.yellow) {
        def.stats.reds++;
        this.sendOff(offender);
        this.push(minute, 'second_yellow', def.key, msg('mc.secondYellow', { p: name(offender), ref: refN }), { playerId: offender.p.id });
      } else {
        offender.yellow = true;
        this.push(minute, 'yellow', def.key, msg(this.v('mc.yellow'), { p: name(offender), ref: refN }), { playerId: offender.p.id });
      }
    } else if (dec.card === 'red') {
      def.stats.reds++;
      this.sendOff(offender);
      this.push(minute, 'red', def.key, msg(this.v('mc.red'), { p: name(offender), ref: refN }), { playerId: offender.p.id });
    }
    if (!dec.correct && dec.controversy > 0.35) {
      const key =
        dec.card === 'red' && dec.truth.card !== 'red'
          ? 'mc.ctrv.redHarsh'
          : dec.truth.card === 'red' && dec.card !== 'red'
            ? 'mc.ctrv.redMissed'
            : dec.penalty && !dec.truth.foul
              ? 'mc.ctrv.phantomPenalty'
              : 'mc.ctrv.dubious';
      this.push(minute, 'controversy', def.key, msg(key, { p: dec.penalty && !dec.truth.foul ? name(victim) : name(offender) }), { controversy: dec.controversy, playerId: offender.p.id });
    }
    if (dec.penalty) {
      this.push(minute, 'penalty_awarded', atk.key, msg('mc.penalty', { p: name(victim), ref: refN }), { playerId: victim.p.id });
      this.takePenalty(minute, atk);
    } else if (rng.chance(0.08 + (atk.key === 'home' ? 0.01 : 0))) {
      // Falta peligrosa al borde del área.
      this.push(minute, 'freekick', atk.key, msg(this.v('mc.freekick'), { team: atk.side.name ?? atk.side.club.name }));
      if (rng.chance(0.55)) {
        const fk = atk.side.tactic.freeKickStyle ?? 'mixed';
        if (this.momentSide === atk.key && !this.pendingMoment) {
          // Falta peligrosa del usuario: elige lanzador y si tira o centra.
          const takers = [...this.onPitchLive(atk)]
            .filter((l) => l.pos !== 'GK')
            .sort((a, b) => b.p.attrs.setPieces * 0.7 + b.p.attrs.longShots * 0.3 - (a.p.attrs.setPieces * 0.7 + a.p.attrs.longShots * 0.3));
          const preferred = takers.find((l) => l.p.id === atk.side.freeKickTakerId) ?? takers[0];
          if (preferred) {
            this.pendingMoment = {
              kind: 'freeKick',
              minute,
              side: atk.key,
              candidates: takers.slice(0, 4).map((l) => ({ playerId: l.p.id, score: Math.round(l.p.attrs.setPieces * 0.7 + l.p.attrs.longShots * 0.3) })),
              defaultTakerId: preferred.p.id,
            };
            this.deferredMoment = { kind: 'freeKick', minute, atkKey: atk.key };
            return;
          }
        }
        this.resolveShot(minute, atk, fk === 'cross' ? 'aerial' : 'setpiece');
      }
    }
  }

  private processDive(minute: number, atk: TeamLive) {
    const rng = this.input.rng;
    const divers = this.onPitchLive(atk).filter((l) => POSITION_GROUP[l.pos] === 'ATT' || l.pos === 'AM');
    if (divers.length === 0) return;
    const ref = this.input.referee;
    const diver = rng.weightedPick(divers, (l) => (100 - l.p.hidden.professionalism) / 50 + this.at(l, 'agility') / 100);
    const dec = judgeDive(ref, rng, { diveQuality: this.at(diver, 'agility') / 100, attackerIsHome: atk.key === 'home', crowdPressure: this.input.neutral ? 0 : this.input.crowdPressure });
    if (dec.penalty) {
      this.push(minute, 'penalty_awarded', atk.key, msg('mc.penalty', { p: name(diver), ref: refereeName(ref) }), { playerId: diver.p.id });
      this.push(minute, 'controversy', MatchSim.other(atk.key), msg('mc.ctrv.dive', { p: name(diver), ref: refereeName(ref) }), { controversy: dec.controversy, playerId: diver.p.id });
      this.takePenalty(minute, atk);
    } else if (rng.chance(0.25 + ref.rigor / 300)) {
      diver.st.yellow++;
      atk.stats.yellows++;
      if (diver.yellow) {
        atk.stats.reds++;
        this.sendOff(diver);
        this.push(minute, 'second_yellow', atk.key, msg('mc.diveSecondYellow', { p: name(diver), ref: refereeName(ref) }), { playerId: diver.p.id });
      } else {
        diver.yellow = true;
        this.push(minute, 'yellow', atk.key, msg('mc.diveYellow', { p: name(diver) }), { playerId: diver.p.id });
      }
    }
  }

  private bestBenchFor(t: TeamLive, pos: Position): Live | null {
    let best: Live | null = null;
    let bestS = -1;
    for (const b of t.bench) {
      if (b.onPitch || b.st.minutes > 0 || b.st.injured) continue;
      if (pos !== 'GK' && b.p.position === 'GK') continue;
      const s = overallAt(b.p, pos) * styleFit(b.p, t.style);
      if (s > bestS) {
        bestS = s;
        best = b;
      }
    }
    return best;
  }

  private doSub(minute: number, t: TeamLive, out: Live, inn: Live, reason: string): boolean {
    if (t.subsLeft <= 0 || !out.onPitch || inn.onPitch || inn.st.minutes > 0) return false;
    this.strengthDirty = true;
    out.onPitch = false;
    inn.onPitch = true;
    inn.pos = out.pos;
    inn.tacticalPos = out.tacticalPos;
    inn.role = out.role;
    inn.focus = out.focus;
    inn.instructions = out.instructions;
    inn.x = out.x;
    inn.channel = out.channel;
    inn.passing = out.passing;
    inn.base = overallAt(inn.p, out.pos) * styleFit(inn.p, t.style) * roleMultiplier(inn.p, out.role) * (0.93 + (0.14 * inn.p.morale) / 100);
    inn.st.position = out.pos;
    t.live.push(inn);
    t.bench = t.bench.filter((b) => b !== inn);
    t.subsLeft--;
    this.push(minute, 'sub', t.key, msg('mc.sub', { in: name(inn), out: name(out), reason: reason ? msg(`mc.reason.${reason}`) : '' }), { playerId: inn.p.id });
    return true;
  }

  private autoSub(minute: number, t: TeamLive, out: Live, reason: string): boolean {
    const inn = this.bestBenchFor(t, out.pos);
    return inn ? this.doSub(minute, t, out, inn, reason) : false;
  }

  private aiSubs(minute: number, t: TeamLive) {
    if (t.subsLeft <= 0) return;
    const diff = t.key === 'home' ? this.score[0] - this.score[1] : this.score[1] - this.score[0];
    const cands = this.onPitchLive(t)
      .filter((l) => l.pos !== 'GK')
      .sort((a, b) => a.fatigue + a.st.rating * 6 - (b.fatigue + b.st.rating * 6));
    let made = 0;
    for (const c of cands) {
      if (made >= 2 || t.subsLeft <= 0) break;
      const tired = c.fatigue < 62;
      const poor = c.st.rating < 6.0;
      const booked = c.yellow && c.p.attrs.aggression > 65;
      if (tired || poor || booked || (diff < 0 && POSITION_GROUP[c.pos] === 'ATT' && minute >= 70)) {
        if (this.autoSub(minute, t, c, tired ? 'tired' : booked ? 'booked' : 'tactical')) made++;
      }
    }
  }

  // ───────────────────────── Intervención del usuario ─────────────────────────

  /** Cambio manual. Devuelve false si no es posible. */
  substitute(side: SideKey, outId: Id, inId: Id): boolean {
    const t = this.teams[side];
    const out = t.live.find((l) => l.p.id === outId && l.onPitch);
    const inn = t.bench.find((b) => b.p.id === inId);
    if (!out || !inn) return false;
    return this.doSub(this.displayMinute, t, out, inn, '');
  }

  /** Nueva táctica a mitad de partido (deslizadores, roles y posiciones de los que están en el campo). */
  setTactic(side: SideKey, tactic: Tactic): void {
    const t = this.teams[side];
    t.side = { ...t.side, tactic };
    t.mods = tacticMods(tactic);
    t.style = nearestPreset(tactic.sliders);
    const positions = slotPositions(tactic);
    const v2 = tacticalPositionsOf(tactic.slots);
    // Reasignar puestos a los once actuales en el orden en que figuran.
    this.onPitchLive(t).forEach((l, i) => {
      if (positions[i] && l.pos !== 'GK') l.pos = positions[i];
      if (v2[i]) l.tacticalPos = v2[i];
      l.role = tactic.roles[i] ?? l.role;
      l.focus = tactic.focus?.[i] ?? l.focus;
      l.instructions = tactic.instructions?.[i] ?? l.instructions;
      l.x = tactic.slots[i]?.x ?? l.x;
      l.channel = tactic.channels?.[i] ?? l.channel;
      l.passing = tactic.passing?.[i] ?? l.passing;
      l.base = overallAt(l.p, l.pos) * styleFit(l.p, t.style) * roleMultiplier(l.p, l.role) * (0.93 + (0.14 * l.p.morale) / 100);
    });
    this.strengthDirty = true;
    this.push(this.displayMinute, 'tactic', side, msg('mc.tacticChange', { team: t.side.name ?? t.side.club.name }));
  }

  /**
   * Cambio táctico en caliente de un jugador (enfoque + instrucciones individuales).
   * Se localiza al jugador por su id, no por índice, para que nunca se desajuste tras un cambio.
   * Marca `strengthDirty`, de modo que el `step()` siguiente recalcula las líneas y el cambio
   * queda absorbido en el minuto siguiente, sin consumir Rng (determinismo intacto).
   * Devuelve false si el jugador no está en el campo.
   */
  setPlayerTactics(
    side: SideKey,
    playerId: Id,
    focus: PlayerFocus,
    instructions: PlayerInstruction[],
    extra: { role?: PlayerRole; channel?: PlayerChannel; passing?: PassingRisk } = {},
  ): boolean {
    const t = this.teams[side];
    const l = t.live.find((x) => x.p.id === playerId && x.onPitch);
    if (!l) return false;
    l.focus = focus;
    l.instructions = [...instructions];
    if (extra.role && extra.role !== l.role) {
      l.role = extra.role;
      l.base = overallAt(l.p, l.pos) * styleFit(l.p, t.style) * roleMultiplier(l.p, l.role) * (0.93 + (0.14 * l.p.morale) / 100);
    }
    if (extra.channel) l.channel = extra.channel;
    if (extra.passing) l.passing = extra.passing;
    this.strengthDirty = true;
    this.push(this.displayMinute, 'tactic', side, msg('mc.tacticInstruction', { name: name(l) }));
    return true;
  }

  /** Charla del descanso: su efecto depende del marcador y de la gestión del mánager. */
  teamTalk(side: SideKey, talk: TeamTalk): Msg {
    const t = this.teams[side];
    const diff = side === 'home' ? this.score[0] - this.score[1] : this.score[1] - this.score[0];
    const mm = (t.side.manager?.manManagement ?? 50) / 100;
    const table: Record<TeamTalk, number> = {
      calm: diff > 0 ? 0.02 : diff === 0 ? 0.01 : -0.01,
      motivate: diff < 0 ? 0.04 : 0.015,
      demand: diff < 0 ? 0.03 : diff > 0 ? -0.02 : 0.01,
      praise: diff > 0 ? 0.035 : diff < 0 ? -0.03 : 0.0,
    };
    const effect = table[talk] * (0.6 + mm * 0.8);
    t.talkBoost = clamp(1 + effect, 0.95, 1.06);
    this.strengthDirty = true;
    return msg(effect > 0.02 ? 'talk.great' : effect > 0 ? 'talk.ok' : 'talk.bad');
  }

  // ───────────────────────── Bucle ─────────────────────────

  /** Simula un minuto. Devuelve los eventos de ese minuto. */
  /** Tiempos muertos que le quedan a un lado en esta parte. */
  timeoutsLeft(side: SideKey): number {
    return this.timeouts[side];
  }

  /**
   * Tiempo muerto táctico: los jugadores recuperan algo de aliento y se frena la inercia del rival.
   * Un uso por mitad; no se puede pedir en el descanso ni con un momento clave pendiente.
   */
  callTimeout(side: SideKey): boolean {
    if (this.finished || this.halftimePending || this.pendingMoment || this.timeouts[side] <= 0) return false;
    this.timeouts[side]--;
    const t = this.teams[side];
    for (const l of t.live) if (l.onPitch) l.fatigue = Math.min(100, l.fatigue + 8);
    this.momentum *= 0.4;
    this.strengthDirty = true;
    this.push(this.displayMinute, 'tactic', side, msg('mc.timeout', { team: t.side.name ?? t.side.club.name }));
    return true;
  }

  /**
   * Resuelve el momento clave pendiente con la decisión del usuario (o la por defecto si no hay).
   * Devuelve los eventos generados.
   */
  resolveMoment(choice: MomentChoice = {}): MatchEvent[] {
    const d = this.deferredMoment;
    const pm = this.pendingMoment;
    if (!d || !pm) return [];
    this.deferredMoment = null;
    this.pendingMoment = null;
    const startLen = this.events.length;
    const atk = this.teams[d.atkKey];
    const takerId = choice.takerId ?? pm.defaultTakerId;
    if (d.kind === 'penalty') {
      this.takePenalty(d.minute, atk, { takerId, penalty: choice.penalty ?? 'placed' });
    } else {
      const kind = choice.freeKick === 'cross' ? 'aerial' : 'setpiece';
      this.resolveShot(d.minute, atk, kind, takerId);
    }
    return this.events.slice(startLen);
  }

  step(): MatchEvent[] {
    if (this.finished) return [];
    // Un momento clave sin resolver detiene el reloj.
    if (this.pendingMoment) return [];
    if (this.halftimePending) this.halftimePending = false;
    const startLen = this.events.length;
    const rng = this.input.rng;
    this.minute++;
    const minute = this.minute;
    const dm = minute <= 45 + this.added1 ? Math.min(minute, 45) : Math.min(minute - this.added1, 90);
    this.displayMinute = dm;
    const teams = this.teams;

    if (this.strengthDirty || minute % 5 === 0) {
      this.sH = this.strength(teams.home);
      this.sA = this.strength(teams.away);
      this.strengthDirty = false;
    }
    const sH = this.sH;
    const sA = this.sA;
    let pHome = 0.5 + (sH.mid - sA.mid) / 70 + teams.home.mods.possession - teams.away.mods.possession + this.pressBias(teams.home) - this.pressBias(teams.away);
    pHome = clamp(pHome, 0.22, 0.78);
    const atkKey: SideKey = rng.chance(pHome) ? 'home' : 'away';
    const atk = teams[atkKey];
    const defT = teams[MatchSim.other(atkKey)];
    const sAtk = atkKey === 'home' ? sH : sA;
    const sDef = atkKey === 'home' ? sA : sH;
    atk.possessionMinutes++;
    atk.stats.passes += Math.round(rng.float(5, 9) * (1.3 - atk.side.tactic.sliders.directness / 200));
    // Avance del balón hacia la portería rival.
    const target = atkKey === 'home' ? 55 + rng.float(0, 30) : 45 - rng.float(0, 30);
    this.ballX = this.ballX + (target - this.ballX) * 0.5;
    this.momentum = clamp(this.momentum * 0.9 + (atkKey === 'home' ? 6 : -6), -100, 100);

    const diff = atkKey === 'home' ? this.score[0] - this.score[1] : this.score[1] - this.score[0];
    // Planes situacionales: el que gana protege (cierra líneas) y el que pierde aprieta (se abre).
    const planFactor = (side: TeamLive, lead: number): { chance: number; def: number } => {
      const tac = side.side.tactic;
      if (minute < 55) return { chance: 0, def: 1 };
      if (lead > 0) {
        if (tac.leadingPlan === 'protect') return { chance: -0.05, def: 1.06 };
        if (tac.leadingPlan === 'control') return { chance: -0.02, def: 1.025 };
      } else if (lead < 0) {
        if (tac.trailingPlan === 'allIn') return { chance: 0.1, def: 0.94 };
        if (tac.trailingPlan === 'press') return { chance: 0.05, def: 0.98 };
      }
      return { chance: 0, def: 1 };
    };
    const atkPlan = planFactor(atk, diff);
    const defPlan = planFactor(defT, -diff);
    const ratio = (sAtk.att * 0.6 + sAtk.mid * 0.4) / Math.max(1, (sDef.def * 0.7 + sDef.mid * 0.3) * defT.mods.defensiveSolidity * defPlan.def);
    const matchup = STYLE_MATCHUP[atk.style][defT.style] ?? 0;
    const gameState = (minute > 60 ? clamp(-diff * 0.05, -0.08, 0.12) - (atk.side.tactic.sliders.timeWasting && diff > 0 ? 0.06 : 0) : 0) + atkPlan.chance;
    // Multiplicador táctico V2 (rejilla + enfoques + instrucciones), acotado al ±18%.
    const tacAtk = this.geoMatchup(sAtk, sDef);
    const pChance = clamp(CHANCE_BASE * atk.mods.chanceRate * Math.pow(ratio, 2.1) * (1 + matchup + gameState) * tacAtk, 0.03, 0.6);
    if (rng.chance(pChance)) {
      this.resolveShot(dm, atk, rng.chance(atk.mods.aerialShare) ? 'aerial' : 'ground');
    } else if (rng.chance(0.05)) {
      // Narración de construcción: la retransmisión no se queda en silencio.
      this.push(dm, 'info', atkKey, msg(this.v('mc.buildup'), { team: atk.side.name ?? atk.side.club.name }));
    }
    const tacDef = this.geoMatchup(sDef, sAtk);
    const pCounter = clamp(
      COUNTER_BASE * defT.mods.counterThreat * Math.pow(sDef.att / Math.max(1, sAtk.def), 1.5) * (1 + Math.max(0, atk.mods.spaceBehind)) * (atk.mods.possession > 0.05 ? 1.25 : 1) * tacDef,
      0,
      0.2,
    );
    if (rng.chance(pCounter)) this.resolveShot(dm, defT, 'counter');

    if (rng.chance(0.13 * defT.mods.foulRate * WEATHER_MOD[this.weather].error ** 0.3)) this.processFoul(dm, atk);
    if (rng.chance(0.0035)) this.processDive(dm, atk);

    for (const t of [teams.home, teams.away]) {
      for (const l of t.live) {
        if (!l.onPitch) continue;
        l.st.minutes++;
        const drain = 0.42 * t.mods.fatigue * WEATHER_MOD[this.weather].fatigue * (1.45 - l.p.attrs.stamina / 100) * (1 + this.fatigueExtra(l));
        l.fatigue = Math.max(5, l.fatigue - drain);
        const pInj = 0.00008 * (0.4 + l.p.hidden.injuryProneness / 55) * (1 + (100 - l.fatigue) / 80);
        if (rng.chance(pInj)) {
          l.st.injured = true;
          this.push(dm, 'injury', t.key, msg(this.v('mc.injury'), { p: name(l) }), { playerId: l.p.id });
          // Sólo la IA sustituye sola al lesionado; el usuario lo decide (si no, lo hace el asistente).
          if (!this.autoSub(dm, t, l, 'injury')) {
            l.onPitch = false;
            this.strengthDirty = true;
          }
        }
      }
    }
    if (dm === 58 || dm === 68 || dm === 78 || dm === 85) {
      for (const t of [teams.home, teams.away]) if (!t.side.manualSubs) this.aiSubs(dm, t);
    }
    this.frames.push({ minute: dm, side: atkKey, ballX: this.ballX, ballY: 50 + rng.gauss(0, 18), momentum: this.momentum });

    if (!this.firstHalfDone && minute === 45 + this.added1) {
      this.firstHalfDone = true;
      this.halftimePending = true;
      this.timeouts = { home: 1 + (this.input.home.extraTimeouts ?? 0), away: 1 + (this.input.away.extraTimeouts ?? 0) };
      this.push(45, 'halftime', null, msg('mc.halftime', { h: this.score[0], a: this.score[1] }));
      for (const t of [teams.home, teams.away]) for (const l of t.live) l.fatigue = Math.min(100, l.fatigue + 4);
      this.ballX = 50;
    }
    // En el último minuto no se puede dejar nada pendiente: se resuelve con lo habitual.
    if (this.pendingMoment && minute >= this.totalMinutes) this.resolveMoment();
    if (minute >= this.totalMinutes) this.finish();
    return this.events.slice(startLen);
  }

  private finish() {
    const rng = this.input.rng;
    const { home, away } = this.input;
    this.push(90, 'fulltime', null, msg('mc.fulltime', { home: home.name ?? home.club.name, away: away.name ?? away.club.name, h: this.score[0], a: this.score[1] }));
    if (this.input.knockout && this.score[0] === this.score[1]) {
      this.shootout = simulateShootout(this.teams.home, this.teams.away, rng);
      const winner = this.shootout.winner === 'home' ? (home.name ?? home.club.name) : (away.name ?? away.club.name);
      this.push(90, 'shootout', this.shootout.winner, msg('mc.shootout', { h: this.shootout.home, a: this.shootout.away, team: winner }));
    }
    this.finished = true;
  }

  /** Simula hasta el final. */
  runToEnd(): MatchResult {
    while (!this.finished) {
      if (this.pendingMoment) this.resolveMoment();
      this.step();
    }
    return this.result();
  }

  result(): MatchResult {
    const rng = this.input.rng;
    const teams = this.teams;
    const players: Record<Id, PlayerMatchStats> = {};
    for (const t of [teams.home, teams.away]) {
      const gf = t.key === 'home' ? this.score[0] : this.score[1];
      const ga = t.key === 'home' ? this.score[1] : this.score[0];
      const resultBonus = gf > ga ? 0.3 : gf < ga ? -0.3 : 0;
      t.stats.possession = Math.round((100 * t.possessionMinutes) / (teams.home.possessionMinutes + teams.away.possessionMinutes || 1));
      for (const l of [...t.live, ...t.bench]) {
        if (l.st.minutes === 0 && !l.st.started) continue;
        let r = l.st.rating + resultBonus + rng.gauss(0, 0.22);
        if (ga === 0 && (l.pos === 'GK' || POSITION_GROUP[l.pos] === 'DEF') && l.st.minutes >= 60) r += 0.5;
        players[l.p.id] = { ...l.st, rating: Math.round(clamp(r, 3, 10) * 10) / 10, endFitness: Math.round(l.fatigue) };
      }
    }
    let motmId: Id | null = null;
    let bestR = -1;
    for (const st of Object.values(players)) {
      if (st.rating > bestR) {
        bestR = st.rating;
        motmId = st.playerId;
      }
    }
    this.input.referee.stats.matches++;
    return {
      homeGoals: this.score[0],
      awayGoals: this.score[1],
      events: this.events,
      frames: this.frames,
      stats: { home: teams.home.stats, away: teams.away.stats },
      players,
      shootout: this.shootout,
      controversies: this.events.filter((e) => e.type === 'controversy'),
      refereeId: this.input.referee.id,
      motmId,
      weather: this.weather,
      attendance: this.input.attendance ?? 0,
    };
  }
}

/** Simulación completa de un partido (IA o resultado directo). */
export function simulateMatch(input: MatchInput): MatchResult {
  return new MatchSim(input).runToEnd();
}

// ───────────────────────── Modelo rápido ─────────────────────────
// Para ligas lejanas al usuario (como el "sólo resultado" de FM): marcador por Poisson según la
// calidad de los onces y la táctica, y estadísticas individuales plausibles (goles, asistencias,
// notas, minutos, tarjetas, lesiones, cansancio). ~30 veces más barato que el minuto a minuto.

function poisson(rng: Rng, lambda: number): number {
  const l = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng.next();
  } while (p > l && k < 12);
  return k - 1;
}

const SCORE_W: Record<Position, number> = { GK: 0.02, CB: 0.6, RB: 0.5, LB: 0.5, DM: 0.6, CM: 1.3, AM: 3, RW: 3.5, LW: 3.5, ST: 6 };
const ASSIST_W: Record<Position, number> = { GK: 0.05, CB: 0.4, RB: 1.5, LB: 1.5, DM: 1, CM: 2.5, AM: 3.5, RW: 3, LW: 3, ST: 2 };

export function quickMatch(input: MatchInput): MatchResult {
  const rng = input.rng;
  const keys: SideKey[] = ['home', 'away'];
  const sides = keys.map((key) => {
    const s = input[key];
    const positions = slotPositions(s.tactic);
    const style = nearestPreset(s.tactic.sliders);
    const rows = s.players.map((p, i) => {
      const pos = positions[i] ?? p.position;
      const fit = styleFit(p, style);
      const q = overallAt(p, pos) * fit * (0.93 + (0.14 * p.morale) / 100) * (0.96 + (0.08 * p.form) / 100) * (0.85 + (0.15 * p.fitness) / 100);
      return { p, pos, q, fit };
    });
    // Penalización de rejilla V2: huecos sin jugador y hombres drásticamente opuestos al estilo grupal.
    const empty = Math.max(0, 11 - rows.length);
    const misfit = rows.filter((r) => r.fit < 0.72).length;
    const penalty = empty * 3.2 + misfit * 1.1;
    const quality = rows.reduce((a, r) => a + r.q, 0) / 11 - penalty;
    // Sesgo táctico V2 por enfoques e instrucciones, acotado estrictamente al ±18%.
    const focus = s.tactic.focus;
    const instr = s.tactic.instructions;
    let intent = 0;
    for (let i = 0; i < 11; i++) {
      if (focus?.[i] === 'attack') intent += 0.8;
      else if (focus?.[i] === 'defend') intent -= 0.8;
      for (const ins of instr?.[i] ?? []) intent += INSTR_INTENT[ins] ?? 0;
      intent += ROLE_DEFS[s.tactic.roles?.[i] ?? 'default']?.intent ?? 0;
      const risk = s.tactic.passing?.[i];
      intent += risk === 'risky' ? 0.2 : risk === 'safe' ? -0.15 : 0;
    }
    const tac = clampTac(1 + 0.16 * clamp(intent / 11, -1, 1));
    return { key, s, rows, q: quality, tac, mods: tacticMods(s.tactic) };
  });
  const [h, a] = sides;
  const homeAdv = input.neutral ? 0 : 2.2;
  const lam = (atk: (typeof sides)[number], def: (typeof sides)[number], base: number, adv: number) =>
    clamp(
      base * Math.exp((atk.q + adv - def.q) / 11) * Math.sqrt(atk.mods.chanceRate / def.mods.defensiveSolidity) * clampTac(atk.tac / def.tac),
      0.12,
      4.6,
    );
  const goals = [poisson(rng, lam(h, a, 1.22, homeAdv)), poisson(rng, lam(a, h, 1.22, -homeAdv))];
  const players: Record<Id, PlayerMatchStats> = {};
  const events: MatchEvent[] = [];
  const stats: Record<SideKey, TeamStats> = { home: emptyStats(), away: emptyStats() };
  const pickW = <T,>(list: T[], w: (x: T) => number): T => rng.weightedPick(list, (x) => Math.max(0.001, w(x)));

  sides.forEach((side, si) => {
    const gf = goals[si];
    const ga = goals[1 - si];
    const st = stats[side.key];
    // Cambios del asistente entre el 55' y el 85'.
    const minutes = new Map<Id, number>(side.rows.map((r) => [r.p.id, 90]));
    const subs: { p: Player; pos: Position; min: number }[] = [];
    const outfield = side.rows.filter((r) => r.pos !== 'GK');
    const nSubs = Math.min(side.s.bench.length, rng.int(2, 4));
    for (let i = 0; i < nSubs; i++) {
      const out = outfield[rng.int(0, outfield.length - 1)];
      if (!out || minutes.get(out.p.id) !== 90) continue;
      const inn = side.s.bench.find((b) => !minutes.has(b.id) && b.position !== 'GK');
      if (!inn) break;
      const min = rng.int(55, 85);
      minutes.set(out.p.id, min);
      minutes.set(inn.id, 90 - min);
      subs.push({ p: inn, pos: out.pos, min });
    }
    const all = [...side.rows.map((r) => ({ p: r.p, pos: r.pos, started: true })), ...subs.map((x) => ({ p: x.p, pos: x.pos, started: false }))];
    for (const { p, pos, started } of all) {
      const mins = minutes.get(p.id) ?? 0;
      const drain = mins * 0.42 * side.mods.fatigue * (1.45 - p.attrs.stamina / 100);
      players[p.id] = {
        playerId: p.id,
        side: side.key,
        position: pos,
        started,
        minutes: mins,
        rating: 6.3 + rng.gauss(0, 0.5),
        goals: 0,
        assists: 0,
        shots: 0,
        saves: 0,
        yellow: 0,
        red: false,
        injured: rng.chance(0.0075 * (0.4 + p.hidden.injuryProneness / 55) * (mins / 90)),
        endFitness: Math.round(clamp(p.fitness - drain + 4, 5, 100)),
      };
    }
    const onPitch = all.filter((x) => (minutes.get(x.p.id) ?? 0) > 0);
    for (let gi = 0; gi < gf; gi++) {
      const scorer = pickW(onPitch, (x) => SCORE_W[x.pos] * (x.p.attrs.finishing / 60) ** 2 * ((minutes.get(x.p.id) ?? 0) / 90));
      const ps = players[scorer.p.id];
      ps.goals++;
      ps.shots++;
      ps.rating += 0.9;
      let assistId: Id | undefined;
      if (rng.chance(0.75)) {
        const others = onPitch.filter((x) => x.p.id !== scorer.p.id);
        if (others.length) {
          const as = pickW(others, (x) => ASSIST_W[x.pos] * ((x.p.attrs.passing + x.p.attrs.vision) / 120) * ((minutes.get(x.p.id) ?? 0) / 90));
          players[as.p.id].assists++;
          players[as.p.id].rating += 0.5;
          assistId = as.p.id;
        }
      }
      const minute = rng.int(1, 90);
      events.push({ minute, type: 'goal', side: side.key, playerId: scorer.p.id, assistId, msg: msg(variantKey('mc.goal', minute), { p: `${scorer.p.firstName.charAt(0)}. ${scorer.p.lastName}` }), score: [0, 0] });
    }
    // Tarjetas.
    const yellows = poisson(rng, 1.6 * side.mods.foulRate);
    for (let i = 0; i < yellows; i++) {
      const x = pickW(onPitch, (o) => (POSITION_GROUP[o.pos] === 'ATT' ? 0.6 : POSITION_GROUP[o.pos] === 'GK' ? 0.05 : 1.2) * (0.5 + o.p.attrs.aggression / 100));
      const ps = players[x.p.id];
      ps.yellow++;
      ps.rating -= 0.3;
      st.yellows++;
      if (ps.yellow === 2) {
        ps.red = true;
        st.reds++;
      }
    }
    if (rng.chance(0.045 * side.mods.foulRate)) {
      const x = onPitch[rng.int(0, onPitch.length - 1)];
      players[x.p.id].red = true;
      players[x.p.id].rating -= 1.2;
      st.reds++;
    }
    const resultBonus = gf > ga ? 0.3 : gf < ga ? -0.3 : 0;
    for (const { p, pos } of all) {
      const ps = players[p.id];
      if (!ps.minutes) continue;
      if (pos === 'GK') {
        ps.saves = rng.int(1, 5);
        ps.rating += ps.saves * 0.12 - ga * 0.25;
      }
      if (ga === 0 && (pos === 'GK' || POSITION_GROUP[pos] === 'DEF') && ps.minutes >= 60) ps.rating += 0.5;
      ps.rating = Math.round(clamp(ps.rating + resultBonus, 3, 10) * 10) / 10;
    }
    st.shots = gf * 2 + poisson(rng, 8 * Math.sqrt(side.mods.chanceRate));
    st.onTarget = Math.min(st.shots, gf + poisson(rng, 2.8));
    st.xg = Math.round((gf * 0.6 + st.shots * 0.07) * 100) / 100;
    st.fouls = yellows * 4 + poisson(rng, 7);
    st.corners = poisson(rng, 4.8);
    st.offsides = poisson(rng, 1.8);
    st.passes = Math.round(rng.float(320, 520) * (1.25 - side.s.tactic.sliders.directness / 200));
  });
  const possH = Math.round(clamp(50 + (h.q - a.q) * 0.9 + (h.mods.possession - a.mods.possession) * 100, 28, 72));
  stats.home.possession = possH;
  stats.away.possession = 100 - possH;
  events.sort((x, y) => x.minute - y.minute);
  const score: [number, number] = [0, 0];
  for (const e of events) {
    if (e.side === 'home') score[0]++;
    else score[1]++;
    e.score = [score[0], score[1]];
  }
  let shootout: MatchResult['shootout'] = null;
  if (input.knockout && goals[0] === goals[1]) {
    const homeWins = rng.chance(clamp(0.5 + (h.q - a.q) / 80, 0.3, 0.7));
    const loser = rng.int(2, 4);
    shootout = homeWins ? { home: loser + 1, away: loser, winner: 'home' } : { home: loser, away: loser + 1, winner: 'away' };
  }
  let motmId: Id | null = null;
  let best = -1;
  for (const ps of Object.values(players)) {
    if (ps.minutes >= 45 && ps.rating > best) {
      best = ps.rating;
      motmId = ps.playerId;
    }
  }
  const ref = input.referee;
  ref.stats.matches++;
  ref.stats.yellows += stats.home.yellows + stats.away.yellows;
  ref.stats.reds += stats.home.reds + stats.away.reds;
  return {
    homeGoals: goals[0],
    awayGoals: goals[1],
    events,
    frames: [],
    stats,
    players,
    shootout,
    controversies: [],
    refereeId: ref.id,
    motmId,
    weather: input.weather ?? 'cloudy',
    attendance: input.attendance ?? 0,
  };
}

function simulateShootout(home: TeamLive, away: TeamLive, rng: Rng): { home: number; away: number; winner: SideKey } {
  const takers = (t: TeamLive) =>
    t.live.filter((l) => l.onPitch).sort((a, b) => b.p.attrs.composure + b.p.attrs.finishing - (a.p.attrs.composure + a.p.attrs.finishing));
  const hT = takers(home);
  const aT = takers(away);
  const gk = (t: TeamLive) => t.live.find((l) => l.onPitch && l.pos === 'GK');
  const shoot = (taker: Live, keeper: Live | undefined) =>
    rng.chance(clamp(0.75 + (taker.p.attrs.composure - 60) / 250 + (taker.p.hidden.bigMatches - 50) / 500 - (keeper ? (keeper.p.attrs.reflexes - 60) / 400 : 0), 0.45, 0.93));
  let h = 0;
  let a = 0;
  for (let i = 0; i < 5; i++) {
    if (hT.length && shoot(hT[i % hT.length], gk(away))) h++;
    if (aT.length && shoot(aT[i % aT.length], gk(home))) a++;
    const left = 4 - i;
    if (h > a + left || a > h + left) break;
  }
  let i = 5;
  while (h === a && i < 40) {
    if (hT.length && shoot(hT[i % hT.length], gk(away))) h++;
    if (aT.length && shoot(aT[i % aT.length], gk(home))) a++;
    i++;
  }
  if (h === a) h++;
  return { home: h, away: a, winner: h > a ? 'home' : 'away' };
}
