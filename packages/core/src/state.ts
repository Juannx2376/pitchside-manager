// Estado global de la partida y utilidades de acceso compartidas por los motores.
import type { Club, Manager } from './club';
import type { SponsorOffer } from './clubOps';
import type { Cup, League } from './competition';
import type { ContinentalComp } from './continental';
import { msg, type Msg } from './i18n';
import type { InternationalState } from './international';
import { ACHIEVEMENT_REWARDS, addManagerXp, pushReveal, type MetaState } from './meta';
import type { MatchResult } from './matchEngine';
import type { Player } from './player';
import type { Journalist, PressConference } from './press';
import type { Referee } from './referee';
import type { Scout, ScoutAssignment, ScoutReport } from './scouting';
import type { SocialPost } from './social';
import type { StaffMember } from './staff';
import type { Objective } from './objectives';
import type { TrainingEvent } from './training';
import type { Negotiation } from './transfers';
import type { Id, NewsCategory, NewsItem } from './types';

export interface CountryRuntime {
  code: string;
  loaded: boolean;
  leagueIds: Id[];
  cupId: Id | null;
  refereeIds: Id[];
  journalistIds: Id[];
  poolPlayerIds: Id[];
}

export interface TransferRecord {
  season: number;
  day: number;
  playerId: Id;
  fromClubId: Id | null;
  toClubId: Id;
  fee: number;
  wage: number;
  loan?: boolean;
}

export interface StoredMatch {
  fixtureId: Id;
  competitionId: Id;
  competitionName: Msg | string;
  season: number;
  day: number;
  homeId: Id;
  awayId: Id;
  result: MatchResult;
}

export interface JobOffer {
  id: Id;
  clubId: Id | null;
  nationalTeam: string | null;
  expiresDay: number;
  season: number;
}

export interface AwardRecord {
  season: number;
  /** 'month' = jugador del mes, 'goldenBoot', 'goldenBall', 'manager'… */
  kind: string;
  /** Mes de temporada (0 = julio) para premios mensuales. */
  month?: number;
  leagueId?: Id;
  playerId?: Id;
  clubId?: Id;
  managerId?: Id;
  value?: number;
}

export interface Achievement {
  id: string;
  season: number;
  day: number;
}

export interface GameSettings {
  /** Partidos propios: en directo, sólo resultado o el asistente decide. */
  matchMode: 'live' | 'quick';
  /** Velocidad por defecto del partido en directo (índice de velocidad). */
  matchSpeed: number;
  autoPress: boolean;
}

export interface GameState {
  version: 4;
  seed: number;
  rngState: number;
  season: number;
  day: number;
  countries: Record<string, CountryRuntime>;
  leagues: Record<Id, League>;
  cups: Record<Id, Cup>;
  continental: Record<Id, ContinentalComp>;
  international: InternationalState;
  clubs: Record<Id, Club>;
  players: Record<Id, Player>;
  managers: Record<Id, Manager>;
  referees: Record<Id, Referee>;
  journalists: Record<Id, Journalist>;
  scouts: Record<Id, Scout>;
  scoutAssignments: Record<Id, ScoutAssignment>;
  scoutReports: Record<Id, ScoutReport>;
  staff: Record<Id, StaffMember>;
  staffMarket: Id[];
  sponsorOffers: SponsorOffer[];
  shortlist: Id[];
  negotiations: Record<Id, Negotiation>;
  news: NewsItem[];
  social: SocialPost[];
  transfers: TransferRecord[];
  awards: AwardRecord[];
  achievements: Achievement[];
  jobOffers: JobOffer[];
  freeAgentIds: Id[];
  /** Youth prospects found by the user's youth scouts, not yet signed (avoids scanning every player). */
  prospectIds?: Id[];
  userClubId: Id | null;
  userManagerId: Id | null;
  nextId: number;
  userMatches: StoredMatch[];
  /** Partido propio del día esperando a jugarse en directo. */
  pendingFixtureId: Id | null;
  pendingPress: PressConference | null;
  gameOver: Msg | null;
  settings: GameSettings;
  monthlyMinutes: Record<Id, number>;
  monthlyClubMatches: Record<Id, number>;
  /** Notas del mes por jugador (premios mensuales). */
  monthlyRatings: Record<Id, { sum: number; n: number; goals: number }>;
  /** Eventos semanales de entrenamiento y vestuario (decisiones del usuario). */
  trainingEvents: TrainingEvent[];
  /** Misiones semanales y de temporada del usuario. */
  objectives: Objective[];
  /** Pase de temporada, perks, revelaciones y agentes (se crea de forma perezosa con `ensureMeta`). */
  meta?: MetaState;
}

export function newId(state: GameState, prefix: string): Id {
  state.nextId += 1;
  return `${prefix}${state.nextId.toString(36)}`;
}

export function addNews(
  state: GameState,
  n: { category: NewsCategory; title: Msg; body: Msg; clubIds?: Id[]; playerId?: Id; importance?: 1 | 2 | 3 },
): NewsItem {
  const item: NewsItem = {
    id: newId(state, 'n'),
    season: state.season,
    day: state.day,
    category: n.category,
    title: n.title,
    body: n.body,
    clubIds: (n.clubIds ?? []).filter(Boolean),
    playerId: n.playerId,
    importance: n.importance ?? 1,
    read: false,
  };
  // Only newsworthy items are kept: the user's club and country, big clubs and major stories.
  // Otherwise thousands of AI leaks and transfers would push the user's own news out of the inbox.
  const userCountry = state.userClubId ? state.clubs[state.userClubId]?.countryCode : null;
  const relevant =
    item.clubIds.length === 0 ||
    item.importance === 3 ||
    item.clubIds.some((id) => {
      const c = state.clubs[id];
      return !!c && (c.isUser || c.reputation >= 72 || c.countryCode === userCountry);
    });
  if (!relevant) return item;
  state.news.unshift(item);
  if (state.news.length > 600) state.news.length = 600;
  return item;
}

export function clubPlayers(state: GameState, clubId: Id): Player[] {
  const club = state.clubs[clubId];
  if (!club) return [];
  const out: Player[] = [];
  for (const id of club.playerIds) {
    const p = state.players[id];
    if (p && !p.retired) out.push(p);
  }
  return out;
}

/** Jugadores del primer equipo (sin canteranos de la academia). */
export function firstTeam(state: GameState, clubId: Id): Player[] {
  return clubPlayers(state, clubId).filter((p) => !p.academy);
}

export function leagueOf(state: GameState, clubId: Id): League | null {
  const club = state.clubs[clubId];
  return club ? (state.leagues[club.leagueId] ?? null) : null;
}

export function userClub(state: GameState): Club | null {
  return state.userClubId ? (state.clubs[state.userClubId] ?? null) : null;
}

export function isUserClub(state: GameState, clubId: Id | null): boolean {
  return !!clubId && clubId === state.userClubId;
}

export function unlockAchievement(state: GameState, id: string): boolean {
  if (state.achievements.some((a) => a.id === id)) return false;
  state.achievements.push({ id, season: state.season, day: state.day });
  // Los logros dan experiencia de mánager y presupuesto, y se anuncian con una revelación.
  const reward = ACHIEVEMENT_REWARDS[id] ?? { xp: 20, budget: 200_000 };
  addManagerXp(state, reward.xp);
  const club = state.userClubId ? state.clubs[state.userClubId] : null;
  if (club) club.finances.transferBudget += reward.budget;
  pushReveal(state, { kind: 'achievement', title: msg(`ach.${id}.t`), body: msg('ui.reveal.achBody', { xp: reward.xp, budget: reward.budget }) });
  return true;
}
