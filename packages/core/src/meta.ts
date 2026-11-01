// Estado "meta" del mánager: pase de temporada, perks, revelaciones pendientes y ofertas de agentes.
// Todo es opcional en `GameState.meta` y se crea de forma perezosa con `ensureMeta` (sin cambiar la versión de guardado).
// Este módulo no importa valores de `state.ts` para evitar ciclos: `state.ts` lo usa al desbloquear logros.
import type { Msg } from './i18n';
import type { Id } from './types';
import type { GameState } from './state';

/** XP del primer nivel de mánager (cada nivel da 1 punto de perk). */
export const XP_PER_POINT = 80;
/** Cada nivel cuesta `XP_STEP` más que el anterior: arranque rápido y árbol de perks que dura varias temporadas. */
export const XP_STEP = 10;

/** XP acumulada necesaria para alcanzar el nivel `level`. */
export function cumulativeXp(level: number): number {
  return XP_PER_POINT * level + (XP_STEP * level * (level - 1)) / 2;
}

/** Nivel alcanzado con `xp` puntos acumulados. */
export function levelFromXp(xp: number): number {
  let n = 0;
  while (cumulativeXp(n + 1) <= xp) n++;
  return n;
}

/** XP que cuesta pasar del nivel `level` al siguiente. */
export function xpToNext(level: number): number {
  return cumulativeXp(level + 1) - cumulativeXp(level);
}

export type RevealKind = 'signing' | 'achievement' | 'milestone' | 'potential' | 'pass' | 'legend';

/** Una "revelación" pendiente de mostrar al usuario (carta, logro, hito...). */
export interface Reveal {
  id: string;
  kind: RevealKind;
  playerId?: Id;
  title: Msg;
  body: Msg;
  /** Reacciones adicionales (afición, prensa, directiva) de la presentación de un fichaje. */
  extra?: Msg[];
  season: number;
  day: number;
}

export interface AgentOffer {
  id: string;
  playerId: Id;
  /** Traspaso pedido (EUR). */
  fee: number;
  /** Comisión del agente (EUR) que paga el usuario. */
  commission: number;
  /** Salario semanal que pedirá el jugador (EUR). */
  wage: number;
  years: number;
  expiresDay: number;
  season: number;
  /** Cuánta confianza tiene la información (0-1): el jugador mostrado puede ser peor de lo anunciado. */
  honesty: number;
  /** Media que anuncia el agente (puede estar inflada respecto a la real). */
  claimedOvr: number;
}

export interface DeadlineDeal {
  playerId: Id;
  /** Precio de oportunidad (EUR). */
  price: number;
  reason: 'expiring' | 'listed' | 'panic';
}

/** Rumor del mercado: la fuente tiene una fiabilidad fija y el usuario puede apostar si es cierto. */
export interface Rumour {
  id: string;
  playerId: Id;
  fromClubId: Id | null;
  toClubId: Id;
  sourceId: string;
  /** Verdad oculta: si es cierto, el club actúa en `resolveDay`. */
  reliable: boolean;
  season: number;
  day: number;
  resolveDay: number;
  status: 'open' | 'confirmed' | 'denied';
  /** Apuesta del usuario sobre si es cierto. */
  guess?: 'true' | 'false';
}

export interface MetaState {
  /** Niveles del pase de temporada ya reclamados. */
  passClaimed: number[];
  /** Ids de perks comprados. */
  perks: string[];
  reveals: Reveal[];
  agentOffers: AgentOffer[];
  /** Último valor de mercado visto de cada jugador de la lista de deseos (para avisos de bajada). */
  wishlistPrices: Record<Id, number>;
  /** Ofertas de última hora del día de cierre (se regeneran cada vez). */
  deadline: { season: number; day: number; deals: DeadlineDeal[] } | null;
  /** Mejor racha de victorias consecutivas del usuario, para récords. */
  bestStreak: number;
  /** Jugadores ya proclamados leyenda del club (para no repetir la revelación). */
  legends: Id[];
  /** Rumores abiertos y los últimos resueltos. */
  rumours: Rumour[];
  /** Aciertos y fallos del usuario al juzgar rumores. */
  rumourStats: { right: number; wrong: number };
  /** Resumen de la última etapa como mánager (se guarda al ser despedido o dimitir). */
  lastStint?: Stint | null;
  /** Candidaturas a clubes enviadas durante el desempleo. */
  applications: JobApplication[];
  /** Sesión de "Deadline Day en vivo" (último día de cada ventana, hora a hora). */
  deadlineLive?: DeadlineLive | null;
}

/** Una línea del ticker del día de cierre. */
export interface DeadlineEvent {
  id: number;
  hour: number;
  /** 3 = grande (fichaje de estrella, tu trato), 1 = ruido. */
  importance: 1 | 2 | 3;
  kind: 'open' | 'rival' | 'sniped' | 'raise' | 'reply' | 'signed' | 'sold' | 'ai' | 'rush' | 'close';
  text: Msg;
  playerId?: Id;
}

export interface DeadlineLive {
  season: number;
  day: number;
  /** Hora actual (0-20). */
  hour: number;
  finished: boolean;
  seq: number;
  feed: DeadlineEvent[];
  stats: { signed: number; lost: number; rivalMoves: number; rushed: number; sold: number };
}

export interface JobApplication {
  id: string;
  clubId: Id;
  season: number;
  /** Día (de la temporada `season`) en que el club responde. */
  replyDay: number;
}

export interface Stint {
  clubId: Id;
  fromSeason: number;
  toSeason: number;
  reason: 'sacked' | 'resigned';
  wins: number;
  draws: number;
  losses: number;
  bestPosition: number;
  trophies: number;
  signings: number;
  legends: number;
  confidence: number;
  compensation: number;
}

export function emptyMeta(): MetaState {
  return { passClaimed: [], perks: [], reveals: [], agentOffers: [], wishlistPrices: {}, deadline: null, bestStreak: 0, legends: [], rumours: [], rumourStats: { right: 0, wrong: 0 }, lastStint: null, applications: [] };
}

/** Devuelve el estado meta (creándolo si la partida es anterior). */
export function ensureMeta(state: GameState): MetaState {
  const m = (state.meta ??= emptyMeta());
  m.passClaimed ??= [];
  m.perks ??= [];
  m.reveals ??= [];
  m.agentOffers ??= [];
  m.wishlistPrices ??= {};
  m.deadline ??= null;
  m.bestStreak ??= 0;
  m.legends ??= [];
  m.rumours ??= [];
  m.rumourStats ??= { right: 0, wrong: 0 };
  m.lastStint ??= null;
  m.applications ??= [];
  m.deadlineLive ??= null;
  return m;
}

export function pushReveal(state: GameState, r: Omit<Reveal, 'id' | 'season' | 'day'>): Reveal {
  state.nextId += 1;
  const reveal: Reveal = { ...r, id: `rv${state.nextId.toString(36)}`, season: state.season, day: state.day };
  const meta = ensureMeta(state);
  meta.reveals.push(reveal);
  if (meta.reveals.length > 12) meta.reveals.splice(0, meta.reveals.length - 12);
  return reveal;
}

export function dismissReveal(state: GameState, id: string): void {
  const meta = ensureMeta(state);
  meta.reveals = meta.reveals.filter((r) => r.id !== id);
}

/** Suma experiencia al mánager del usuario y convierte los niveles nuevos en puntos de perk. */
export function addManagerXp(state: GameState, xp: number): void {
  const mgr = state.userManagerId ? state.managers[state.userManagerId] : null;
  if (!mgr || xp <= 0) return;
  mgr.xp = (mgr.xp ?? 0) + xp;
  const level = levelFromXp(mgr.xp);
  mgr.points = (mgr.points ?? 0) + Math.max(0, level - (mgr.level ?? 0));
  mgr.level = level;
}

/** Recompensa de cada logro: experiencia del mánager y presupuesto de fichajes. */
export const ACHIEVEMENT_REWARDS: Record<string, { xp: number; budget: number }> = {
  firstWin: { xp: 10, budget: 100_000 },
  bigWin: { xp: 20, budget: 250_000 },
  giantKiller: { xp: 30, budget: 400_000 },
  firstTrophy: { xp: 60, budget: 1_000_000 },
  tenTrophies: { xp: 150, budget: 5_000_000 },
  leagueTitle: { xp: 100, budget: 2_500_000 },
  promotionTitle: { xp: 70, budget: 1_500_000 },
  promotion: { xp: 60, budget: 1_000_000 },
  cupWin: { xp: 70, budget: 1_500_000 },
  continental: { xp: 150, budget: 5_000_000 },
  goldenBall: { xp: 80, budget: 2_000_000 },
  youthProduct: { xp: 40, budget: 500_000 },
  nationalTeam: { xp: 50, budget: 0 },
  smallLeagueChampion: { xp: 120, budget: 1_500_000 },
  hatTrick: { xp: 20, budget: 200_000 },
  comeback: { xp: 25, budget: 300_000 },
  derbyWin: { xp: 30, budget: 400_000 },
  winStreak5: { xp: 40, budget: 600_000 },
  unbeaten10: { xp: 60, budget: 800_000 },
  firstSigning: { xp: 15, budget: 150_000 },
  bigSigning: { xp: 35, budget: 500_000 },
  growthPlanDone: { xp: 30, budget: 300_000 },
  perkBought: { xp: 10, budget: 100_000 },
  passTier10: { xp: 50, budget: 1_000_000 },
  legendMade: { xp: 60, budget: 1_000_000 },
  deadlineDeal: { xp: 25, budget: 250_000 },
  deadlineSprint: { xp: 30, budget: 300_000 },
  deadlineHero: { xp: 60, budget: 800_000 },
  goodNose: { xp: 40, budget: 500_000 },
};

export const ACHIEVEMENT_IDS = Object.keys(ACHIEVEMENT_REWARDS);
