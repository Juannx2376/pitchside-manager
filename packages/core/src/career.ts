// Carrera del mánager: reputación, ofertas de otros clubes y de selecciones, dimisión,
// palmarés e historial (FIFA Manager / EA FC "Manager market").
import type { Club } from './club';
import { COUNTRY_BY_CODE } from './data/countries';
import { msg } from './i18n';
import { ensureMeta, type Stint } from './meta';
import type { Rng } from './rng';
import { addNews, clubPlayers, newId, unlockAchievement, type GameState, type JobOffer } from './state';
import { clamp, type Id } from './types';
import { hireAiManager } from './world';

export function userManager(state: GameState) {
  return state.userManagerId ? state.managers[state.userManagerId] : null;
}

/** Cada mes: con buena reputación llegan ofertas de clubes (más grandes) y de selecciones. */
export function generateJobOffers(state: GameState, rng: Rng): void {
  const m = userManager(state);
  if (!m || state.gameOver) return;
  state.jobOffers = state.jobOffers.filter((o) => o.expiresDay > state.day && o.season === state.season);
  if (state.jobOffers.length >= 3) return;
  const current = m.clubId ? state.clubs[m.clubId] : null;
  const pChance = clamp((m.reputation - 30) / 250, 0.01, 0.25);
  if (!rng.chance(pChance)) return;
  // Clubes sin entrenador o con la directiva descontenta, de nivel similar o algo superior.
  const candidates = Object.values(state.clubs).filter(
    (c) => !c.isUser && c.reputation <= m.reputation + 15 && c.reputation >= (current?.reputation ?? 0) - 5 && (c.managerId === null || c.boardConfidence < 35),
  );
  if (candidates.length) {
    const club = rng.pick(candidates);
    pushOffer(state, { clubId: club.id, nationalTeam: null });
  } else if (m.reputation >= 55 && rng.chance(0.3) && !m.nationalTeam) {
    const teams = Object.entries(state.international.teams).filter(([, t]) => !t.userManaged && t.rating < m.reputation + 10);
    if (teams.length) pushOffer(state, { clubId: null, nationalTeam: rng.pick(teams)[0] });
  }
}

function pushOffer(state: GameState, o: Pick<JobOffer, 'clubId' | 'nationalTeam'>): void {
  const offer: JobOffer = { id: newId(state, 'jo'), ...o, expiresDay: state.day + 14, season: state.season };
  state.jobOffers.push(offer);
  addNews(state, {
    category: 'career',
    title: o.clubId ? msg('news.jobOffer.t', { club: state.clubs[o.clubId].name }) : msg('news.jobOfferNT.t', { team: msg('country', { code: o.nationalTeam ?? '' }) }),
    body: msg('news.jobOffer.b'),
    clubIds: o.clubId ? [o.clubId] : [],
    importance: 3,
  });
}

/** Aceptar una oferta: el mánager cambia de club (o asume la selección además de su club). */
export function acceptJob(state: GameState, offerId: Id, rng: Rng): void {
  const offer = state.jobOffers.find((o) => o.id === offerId);
  const m = userManager(state);
  if (!offer || !m) return;
  state.jobOffers = state.jobOffers.filter((o) => o.id !== offerId);
  if (offer.nationalTeam) {
    if (m.nationalTeam) state.international.teams[m.nationalTeam].userManaged = false;
    m.nationalTeam = offer.nationalTeam;
    state.international.teams[offer.nationalTeam] = { ...(state.international.teams[offer.nationalTeam] ?? { rating: 50, squad: [] }), userManaged: true };
    unlockAchievement(state, 'nationalTeam');
    addNews(state, { category: 'career', title: msg('news.ntSigned.t', { team: msg('country', { code: offer.nationalTeam }) }), body: msg('news.ntSigned.b'), importance: 3 });
    return;
  }
  const newClub = offer.clubId ? state.clubs[offer.clubId] : null;
  if (!newClub) return;
  const old = m.clubId ? state.clubs[m.clubId] : null;
  if (old) {
    old.isUser = false;
    hireAiManager(state, old.id, rng);
  }
  if (newClub.managerId && newClub.managerId !== m.id) {
    const prev = state.managers[newClub.managerId];
    if (prev) prev.clubId = null;
  }
  // El personal y los ojeadores se quedan en el club anterior; el nuevo trae los suyos.
  newClub.managerId = m.id;
  newClub.isUser = true;
  newClub.boardConfidence = 65;
  m.clubId = newClub.id;
  state.userClubId = newClub.id;
  state.pendingPress = null;
  state.pendingFixtureId = null;
  newClub.tactic.tactic = { ...newClub.tactic.tactic, id: 'user-1' };
  addNews(state, { category: 'career', title: msg('news.newJob.t', { club: newClub.name }), body: msg('news.newJob.b', { country: msg('country', { code: newClub.countryCode }) }), clubIds: [newClub.id], importance: 3 });
}

/** Balance de la etapa que acaba (se guarda en `meta.lastStint` para la pantalla de desempleo). */
export function recordStint(state: GameState, club: Club, reason: Stint['reason']): Stint {
  const m = userManager(state);
  const mine = (m?.history ?? []).filter((h) => h.clubId === club.id);
  const fromSeason = mine.length ? Math.min(...mine.map((h) => h.season)) : state.season;
  let wins = 0;
  let draws = 0;
  let losses = 0;
  for (const x of state.userMatches) {
    if (x.homeId !== club.id && x.awayId !== club.id) continue;
    const gf = x.homeId === club.id ? x.result.homeGoals : x.result.awayGoals;
    const ga = x.homeId === club.id ? x.result.awayGoals : x.result.homeGoals;
    if (gf > ga) wins++;
    else if (gf < ga) losses++;
    else draws++;
  }
  const seasons = Math.max(1, state.season - fromSeason + 1);
  const stint: Stint = {
    clubId: club.id,
    fromSeason,
    toSeason: state.season,
    reason,
    wins,
    draws,
    losses,
    bestPosition: mine.length ? Math.min(...mine.map((h) => h.position)) : 0,
    trophies: (m?.trophies ?? []).filter((t) => t.clubId === club.id).length,
    signings: state.transfers.filter((t) => t.toClubId === club.id && t.season >= fromSeason && !t.loan && t.fee >= 0).length,
    legends: (state.meta?.legends ?? []).filter((id) => state.players[id]?.career.some((c) => c.clubId === club.id)).length,
    confidence: Math.round(club.boardConfidence),
    compensation: Math.round((m?.reputation ?? 30) * 12_000 * (1 + Math.min(3, seasons - 1))),
  };
  ensureMeta(state).lastStint = stint;
  return stint;
}

/** Garantiza al menos una oferta (de un club modesto) para que el desempleo nunca sea un callejón sin salida. */
export function ensureFallbackOffer(state: GameState, rng: Rng): void {
  const m = userManager(state);
  if (!m || state.userClubId || state.jobOffers.length > 0) return;
  const sorted = Object.values(state.clubs)
    .filter((c) => !c.isUser)
    .sort((a, b) => a.reputation - b.reputation);
  const pool = sorted.filter((c) => c.reputation <= Math.max(35, m.reputation)).slice(-12);
  const pick = pool.length ? rng.pick(pool) : sorted[0];
  if (pick) pushOffer(state, { clubId: pick.id, nationalTeam: null });
}

export function openApplications(state: GameState): number {
  return (state.meta?.applications ?? []).filter((a) => a.season === state.season && a.replyDay >= state.day).length;
}

/** Candidatura a un club. Responde en 1-3 días; la probabilidad depende de la reputación del mánager. */
export function applyForJob(state: GameState, clubId: Id, rng: Rng): { ok: boolean; reason?: 'employed' | 'limit' | 'duplicate' | 'noClub' } {
  const m = userManager(state);
  const club = state.clubs[clubId];
  if (!m || !club || club.isUser) return { ok: false, reason: 'noClub' };
  if (state.userClubId) return { ok: false, reason: 'employed' };
  const meta = ensureMeta(state);
  if (openApplications(state) >= 2) return { ok: false, reason: 'limit' };
  if (meta.applications.some((a) => a.clubId === clubId && a.season === state.season && a.replyDay >= state.day)) return { ok: false, reason: 'duplicate' };
  meta.applications.push({ id: newId(state, 'ap'), clubId, season: state.season, replyDay: state.day + rng.int(1, 3) });
  return { ok: true };
}

/** Probabilidad (0-1) de que un club acepte la candidatura del usuario. */
export function applicationOdds(state: GameState, clubId: Id): number {
  const m = userManager(state);
  const club = state.clubs[clubId];
  if (!m || !club) return 0;
  const base = clamp(0.5 + (m.reputation - club.reputation) / 70, 0.04, 0.92);
  return club.managerId ? base * 0.45 : Math.min(0.95, base * 1.15);
}

/** Respuestas a las candidaturas pendientes (se llama cada día). */
export function processApplications(state: GameState, rng: Rng): void {
  const meta = state.meta;
  if (!meta?.applications.length) return;
  const due = meta.applications.filter((a) => a.season !== state.season || a.replyDay <= state.day);
  if (!due.length) return;
  meta.applications = meta.applications.filter((a) => !due.includes(a));
  for (const a of due) {
    const club = state.clubs[a.clubId];
    if (!club || state.userClubId || club.isUser) continue;
    const ok = rng.chance(applicationOdds(state, a.clubId));
    if (ok) pushOffer(state, { clubId: club.id, nationalTeam: null });
    else addNews(state, { category: 'career', title: msg('news.applyNo.t', { club: club.name }), body: msg('news.applyNo.b'), clubIds: [club.id], importance: 2 });
  }
}

/** Dimitir: la partida sigue sin club hasta aceptar otra oferta. */
export function resign(state: GameState, rng: Rng): void {
  const m = userManager(state);
  if (!m || !m.clubId) return;
  const club = state.clubs[m.clubId];
  recordStint(state, club, 'resigned');
  club.isUser = false;
  hireAiManager(state, club.id, rng);
  m.clubId = null;
  state.userClubId = null;
  state.pendingFixtureId = null;
  state.pendingPress = null;
  m.reputation = clamp(m.reputation - 4, 1, 99);
  addNews(state, { category: 'career', title: msg('news.resigned.t', { club: club.name }), body: msg('news.resigned.b'), importance: 3 });
  // Sin club el usuario sigue recibiendo ofertas (más frecuentes).
  for (let i = 0; i < 2; i++) generateJobOffers(state, rng);
}

/** Cierre de temporada para la carrera: reputación por objetivos, palmarés e historial. */
export function seasonCareerUpdate(state: GameState, club: Club, position: number, leagueSize: number, objectiveMet: boolean): void {
  const m = userManager(state);
  if (!m) return;
  m.history.push({ season: state.season, clubId: club.id, position, leagueId: club.leagueId });
  const leagueRep = state.leagues[club.leagueId].reputation;
  m.reputation = clamp(m.reputation + (objectiveMet ? 3 + leagueRep / 40 : -3) + (position === 1 ? 4 : 0) - (position > leagueSize - 3 ? 3 : 0), 1, 99);
  if (position === 1) unlockAchievement(state, state.leagues[club.leagueId].tier === 1 ? 'leagueTitle' : 'promotionTitle');
  if (COUNTRY_BY_CODE[club.countryCode].econ <= 0.05 && position === 1) unlockAchievement(state, 'smallLeagueChampion');
  if (clubPlayers(state, club.id).some((p) => p.source === 'regen' && p.stats.apps >= 20)) unlockAchievement(state, 'youthProduct');
}

/** Añade un trofeo al palmarés del mánager humano. `competitionId` = liga, copa o torneo continental. */
export function addTrophy(state: GameState, competitionId: string, clubId: Id | null): void {
  const m = userManager(state);
  if (!m) return;
  m.trophies.push({ season: state.season, competition: competitionId, clubId });
  if (m.trophies.length === 1) unlockAchievement(state, 'firstTrophy');
  if (m.trophies.length >= 10) unlockAchievement(state, 'tenTrophies');
}
