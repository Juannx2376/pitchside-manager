// Cantera (EA FC "Youth Academy"): ojeadores juveniles asignados a una región que encuentran
// promesas cada mes; el usuario las firma para la academia, las desarrolla y las sube al primer equipo.
import { facilityLevel } from './clubOps';
import { facilityEffects } from './facilities';
import { assignSquadStatuses, type Club, type YouthPolicy } from './club';
import { COUNTRY_BY_CODE } from './data/countries';
import { msg } from './i18n';
import { generateRegen, roundMoney, wageForQuality, overall, type Player } from './player';
import type { Rng } from './rng';
import { clubStaff } from './staff';
import { addNews, clubPlayers, newId, type GameState } from './state';
import { ATTRIBUTE_KEYS } from './attributes';
import { clamp, type Id } from './types';

export interface ProspectInfo {
  clubId: Id;
  scoutId: Id;
  expiresDay: number;
}

/** Promesas encontradas por los ojeadores juveniles del usuario (jugadores sin club, marcados). */
export function youthScouting(state: GameState, rng: Rng, club: Club): void {
  const scouts = clubStaff(state, club).filter((s) => s.role === 'youthScout');
  for (const s of scouts) {
    if (!rng.chance(0.55 + s.ability / 400)) continue;
    const country = COUNTRY_BY_CODE[s.region ?? club.countryCode];
    const p = generateRegen(rng, {
      id: newId(state, 'p'),
      country,
      season: state.season,
      youthFacilities: 50 + (s.ability - 50) * 0.6,
      youthRecruitment: 40 + s.ability * 0.6,
    });
    p.prospect = { clubId: club.id, scoutId: s.id, expiresDay: state.day + 30 };
    state.players[p.id] = p;
    (state.prospectIds ??= []).push(p.id);
    addNews(state, {
      category: 'youth',
      title: msg('news.prospect.t', { p: `${p.firstName} ${p.lastName}`, age: p.age, pos: msg('pos', { p: p.position }) }),
      body: msg('news.prospect.b', { scout: `${s.firstName} ${s.lastName}`, country: msg('country', { code: country.code }), lo: Math.max(overall(p), p.potential - 8), hi: Math.min(99, p.potential + 6) }),
      clubIds: [club.id],
      playerId: p.id,
      importance: p.potential >= 80 ? 3 : 2,
    });
  }
}

export function prospectsFor(state: GameState, clubId: Id): Player[] {
  return (state.prospectIds ?? []).map((id) => state.players[id]).filter((p) => p && p.prospect?.clubId === clubId && !p.clubId && !p.retired);
}

/** Firma un canterano para la academia con contrato juvenil. */
export function signProspect(state: GameState, club: Club, playerId: Id): void {
  const p = state.players[playerId];
  if (!p || p.clubId) return;
  const econ = COUNTRY_BY_CODE[club.countryCode].econ;
  p.clubId = club.id;
  p.academy = true;
  p.prospect = undefined;
  p.squadStatus = 'youth';
  p.contract = { wage: roundMoney(Math.max(60, wageForQuality(overall(p), econ, p.reputation) * 0.25)), signedSeason: state.season, expiresSeason: state.season + 3, releaseClause: null, goalBonus: 0, cleanSheetBonus: 0, signingBonus: 0 };
  club.playerIds.push(p.id);
}

export function promoteToFirstTeam(club: Club, p: Player): void {
  if (p.clubId !== club.id) return;
  p.academy = false;
  p.squadStatus = 'youth';
}

export function releaseFromAcademy(state: GameState, club: Club, p: Player): void {
  club.playerIds = club.playerIds.filter((id) => id !== p.id);
  p.clubId = null;
  p.contract = null;
  p.academy = false;
  state.freeAgentIds.push(p.id);
}

/** Las promesas no firmadas a tiempo desaparecen (se las lleva otro club). */
export function expireProspects(state: GameState): void {
  if (!state.prospectIds?.length) return;
  state.prospectIds = state.prospectIds.filter((id) => {
    const p = state.players[id];
    if (!p || p.clubId || !p.prospect) return false;
    if (p.prospect.expiresDay <= state.day) {
      delete state.players[id];
      return false;
    }
    return true;
  });
}

/** Academia: los canteranos crecen más rápido con buen entrenador juvenil. */
export function academyCoachBoost(state: GameState, club: Club): number {
  const coaches = clubStaff(state, club).filter((s) => s.role === 'youthCoach');
  const q = coaches.length ? coaches.reduce((s, c) => s + c.ability, 0) / coaches.length : 30;
  return clamp((0.85 + q / 250) * facilityEffects(club).youth, 0.85, 1.45);
}

export const YOUTH_POLICIES: YouthPolicy[] = ['balanced', 'potential', 'ready'];
/** Días que tienen las promesas de la cosecha anual para ser firmadas. */
export const INTAKE_DAYS = 45;

/** Plazas de la academia: crecen con la academia y la residencia juvenil. */
export function academyCapacity(club: Club): number {
  return 6 + 3 * facilityLevel(club, 'youthAcademy') + 2 * facilityLevel(club, 'youthDorm');
}

/** Canteranos del club (no cedidos). */
export function academyPlayers(state: GameState, clubId: Id): Player[] {
  return clubPlayers(state, clubId).filter((p) => p.academy && !p.loan);
}

/** Retoca a un canterano recién generado según la política: "ready" llega más hecho, "potential" más verde y con más techo. */
export function applyYouthPolicy(p: Player, policy: YouthPolicy | undefined): void {
  if (!policy || policy === 'balanced') return;
  const delta = policy === 'ready' ? 4 : -3;
  for (const k of ATTRIBUTE_KEYS) p.attrs[k] = clamp(p.attrs[k] + delta, 1, 99);
  p.potential = clamp(p.potential + (policy === 'ready' ? -3 : 4), 30, 99);
  if (policy === 'ready') p.age = Math.min(19, p.age + 2);
}

/** Cantidad de canteranos de la cosecha anual según la política. */
export function intakeCount(base: number, policy: YouthPolicy | undefined): number {
  return Math.max(1, base + (policy === 'ready' ? -1 : 0));
}

/** La cosecha del usuario no entra sola: son promesas que firma (o deja marchar) en `INTAKE_DAYS`. */
export function makeIntakeProspects(state: GameState, club: Club, players: Player[]): void {
  for (const p of players) {
    p.clubId = null;
    p.academy = false;
    p.prospect = { clubId: club.id, scoutId: '', expiresDay: state.day + INTAKE_DAYS };
    state.players[p.id] = p;
    (state.prospectIds ??= []).push(p.id);
  }
}

/** Firma las mejores promesas (por potencial) hasta llenar la academia. Devuelve cuántas firmó. */
export function signBestProspects(state: GameState, club: Club): number {
  const free = academyCapacity(club) - academyPlayers(state, club.id).length;
  const best = prospectsFor(state, club.id).sort((a, b) => b.potential - a.potential).slice(0, Math.max(0, free));
  for (const p of best) signProspect(state, club, p.id);
  return best.length;
}

/** ¿Está listo para el primer equipo? 19+ años y media al nivel de la plantilla. */
export function readyToPromote(state: GameState, club: Club, p: Player): boolean {
  if (!p.academy || p.age < 19) return false;
  const squad = clubPlayers(state, club.id).filter((q) => !q.academy);
  if (!squad.length) return true;
  const avg = squad.reduce((s, q) => s + overall(q), 0) / squad.length;
  return overall(p) >= avg - 6;
}

/** Cede un canterano a un club de división inferior para que juegue; vuelve a la academia al acabar la temporada. */
export function sendOnYouthLoan(state: GameState, club: Club, playerId: Id): { ok: boolean; clubId?: Id } {
  const p = state.players[playerId];
  if (!p || p.clubId !== club.id || !p.academy || p.loan) return { ok: false };
  const myTier = state.leagues[club.leagueId]?.tier ?? 1;
  const dests = Object.values(state.clubs)
    .filter((c) => !c.isUser && c.countryCode === club.countryCode && c.playerIds.length < 34)
    .map((c) => ({ c, tier: state.leagues[c.leagueId]?.tier ?? myTier }))
    .filter((x) => x.tier >= myTier)
    .sort((a, b) => b.tier - a.tier || a.c.reputation - b.c.reputation);
  const dest = dests[0]?.c;
  if (!dest) return { ok: false };
  club.playerIds = club.playerIds.filter((id) => id !== p.id);
  p.loan = { parentClubId: club.id, untilSeason: state.season, wageShare: 100, buyOption: null, obligatory: false, wasAcademy: true };
  p.academy = false;
  p.clubId = dest.id;
  dest.playerIds.push(p.id);
  assignSquadStatuses(clubPlayers(state, dest.id), true);
  addNews(state, { category: 'youth', title: msg('news.youthLoan.t', { p: `${p.firstName} ${p.lastName}`, club: dest.name }), body: msg('news.youthLoan.b'), clubIds: [club.id, dest.id], playerId: p.id });
  return { ok: true, clubId: dest.id };
}