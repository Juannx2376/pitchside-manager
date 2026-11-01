// Bucle principal: avanza el calendario día a día y orquesta todos los motores.
// El partido del usuario puede quedar "pendiente" para jugarse en directo (prepareUserMatch /
// completeUserMatch); el resto del mundo se simula al instante.
import { monthlyAwards, seasonAwards } from './awards';
import { addTrophy, ensureFallbackOffer, generateJobOffers, processApplications, recordStint, seasonCareerUpdate } from './career';
import { aiChooseTactic, aiAdaptFormation, assignSquadStatuses, assignTakers, computeObjective, objectiveTargetPosition, type Club } from './club';
import { aiSignSponsors, generateSponsorOffers, progressProjects, sellSeasonTickets, updateFans } from './clubOps';
import { computeTable, drawCupRound, generateLeagueFixtures, resolveCupFixture, type Fixture, type League } from './competition';
import { advanceKnockout, clubContinental, continentalFixturesToday, continentalPrize, setupContinental } from './continental';
import { COUNTRY_BY_CODE } from './data/countries';
import { PRIZE_REINVEST, SEASON_CARRY, closeSeasonLedger, evaluateFPF, prizeMoney, processMatchdayIncome, processMonthlyTaxes, processWeeklyFinances, record, setSeasonBudgets, ticketPrice } from './finance';
import { msg, type Msg } from './i18n';
import { processInternationalDay, setupInternationalTournaments } from './international';
import { MatchSim, quickMatch, rollWeather, simulateMatch, type MatchInput, type MatchResult, type MatchSide } from './matchEngine';
import {
  ageOneYear,
  applyInjury,
  averageRating,
  developMonthly,
  emptyStats,
  generateRegen,
  isAvailable,
  marketValue,
  overall,
  overallAt,
  recomputeForm,
  rollInjury,
  roundMoney,
  tierWageFactor,
  wageForQuality,
  type Player,
} from './player';
import { autoAnswerPress, boardReview, checkPromises, generatePressConference, processDressingRoomLeaks, updateHappiness } from './press';
import { assignReferee, type Referee } from './referee';
import { Rng, hashString } from './rng';
import { processScoutingDay } from './scouting';
import { currentStreaks, matchStory, recentRuns } from './highlights';
import { applyContractClauses, checkBonusCommitments, payInstalments } from './dealTerms';
import { clubLegends, isDerby, isLegend } from './legacy';
import { processMarketDay } from './market';
import { addManagerXp, ensureMeta, pushReveal } from './meta';
import { perkEffects } from './perks';
import { checkPotentialReveals, processGrowthPlans } from './growthPlans';
import { postMatchReactions } from './social';
import { coachingFactor, physioBoost, refreshStaffMarket, roleQuality, weeklyStaffCost } from './staff';
import { refreshObjectives, updateObjectives } from './objectives';
import { rollTrainingEvent, weeklyTraining } from './training';
import { addNews, clubPlayers, newId, unlockAchievement, type GameState, type StoredMatch } from './state';
import { nearestPreset, slotPositions } from './tactics';
import { aiListPlayers, aiListSurplus, aiRenewContracts, aiTransferActivity, endLoans, isDeadlineDay, isWindowOpen, processNegotiations, releasePlayer } from './transfers';
import { CALENDAR, SEASON_LENGTH_DAYS, clamp, isFirstDayOfMonth, monthOfDay, type Id, type NewsItem } from './types';
import { hireAiManager, resetCup, transferPool } from './world';
import { INTAKE_DAYS, academyCapacity, academyCoachBoost, academyPlayers, applyYouthPolicy, expireProspects, intakeCount, makeIntakeProspects, youthScouting } from './youth';

export interface DayReport {
  season: number;
  day: number;
  userMatch: StoredMatch | null;
  /** El partido del usuario de hoy espera a jugarse en directo. */
  pendingUserMatch: boolean;
  matchesPlayed: number;
  seasonEnded: boolean;
}

export type StopReason = 'user_match' | 'live_match' | 'press' | 'season_end' | 'game_over' | 'incoming_bid' | 'job_offer' | 'deadline' | 'max_days' | 'date_reached';

function loadedLeagues(state: GameState): League[] {
  const out: League[] = [];
  for (const rt of Object.values(state.countries)) if (rt.loaded) for (const id of rt.leagueIds) out.push(state.leagues[id]);
  return out;
}

function loadedClubs(state: GameState): Club[] {
  return loadedLeagues(state).flatMap((l) => l.clubIds.map((id) => state.clubs[id]));
}

// ───────────────────────── Preparación de partidos ─────────────────────────

/** Once y banquillo listos para jugar (completa huecos del usuario por lesiones, sanciones o ventas). */
export function buildSide(state: GameState, club: Club, rng: Rng, manualSubs = false): MatchSide {
  const players = clubPlayers(state, club.id).filter((p) => !p.academy);
  const manager = club.managerId ? state.managers[club.managerId] : null;
  const byId = new Map(players.map((p) => [p.id, p]));
  const valid = (id: string) => !!id && byId.has(id) && isAvailable(byId.get(id) as Player);
  if (!club.isUser && manager) {
    // AI keeps its XI and patches gaps; a full rethink happens now and then or when the XI falls apart.
    const current = club.tactic.lineup;
    const missing = current.length === 11 ? current.filter((id) => !valid(id) || (byId.get(id) as Player).fitness < 55).length : 11;
    if (missing > 3 || rng.chance(0.08)) aiChooseTactic(state, club.id, rng);
  }
  const tactic = club.tactic.tactic;
  const slots = slotPositions(tactic);
  const lineup = [...club.tactic.lineup];
  while (lineup.length < slots.length) lineup.push('');
  if (lineup.some((id) => !valid(id) || (!club.isUser && (byId.get(id) as Player).fitness < 55))) {
    // Only the gaps are filled (best available natural fit); the rest of the XI is respected.
    lineup.forEach((id, i) => {
      if (valid(id) && (club.isUser || (byId.get(id) as Player).fitness >= 55)) return;
      let best: Player | null = null;
      let bestScore = -1;
      for (const p of players) {
        if (!isAvailable(p) || lineup.includes(p.id)) continue;
        const s = (p.position === slots[i] ? 6 : p.secondaryPositions.includes(slots[i]) ? 3 : 0) + overallAt(p, slots[i]) * (0.7 + (0.3 * p.fitness) / 100);
        if (s > bestScore) {
          bestScore = s;
          best = p;
        }
      }
      lineup[i] = best?.id ?? '';
    });
    club.tactic.lineup = lineup;
  }
  const used = new Set(lineup);
  let bench = club.tactic.bench.filter((id) => byId.has(id) && !used.has(id) && isAvailable(byId.get(id) as Player));
  if (bench.length < 7) {
    const extra = players.filter((p) => isAvailable(p) && !used.has(p.id) && !bench.includes(p.id)).sort((a, b) => overall(b) - overall(a));
    bench = [...bench, ...extra.map((p) => p.id)].slice(0, 9);
    club.tactic.bench = bench;
  }
  assignTakers(club.tactic, players);
  const starters = lineup.map((id) => byId.get(id)).filter((p): p is Player => !!p);
  return {
    club,
    players: starters,
    bench: bench.map((id) => byId.get(id)).filter((p): p is Player => !!p).slice(0, 9),
    tactic,
    manager,
    penaltyTakerId: club.tactic.penaltyTakerId,
    freeKickTakerId: club.tactic.freeKickTakerId,
    manualSubs,
    extraTimeouts: club.isUser ? perkEffects(state).timeouts : 0,
  };
}

function matchImportance(state: GameState, f: Fixture, knockout: boolean, roundsLeft: number): number {
  if (knockout) return clamp(1 - roundsLeft * 0.15, 0.3, 1);
  const home = state.clubs[f.homeId];
  const away = state.clubs[f.awayId];
  const derby = home.city === away.city ? 0.3 : 0;
  const lateSeason = f.day > 250 ? 0.2 : 0;
  return clamp(0.3 + (home.reputation + away.reputation) / 400 + derby + lateSeason, 0, 1);
}

export interface FixtureContext {
  fixture: Fixture;
  competitionName: Msg | string;
  knockout: boolean;
  kind: 'league' | 'cup' | 'continental';
  compId: Id;
  roundsLeft: number;
}

/** Busca un partido por id en ligas, copas y competiciones continentales. */
export function findFixture(state: GameState, fixtureId: Id): FixtureContext | null {
  for (const l of Object.values(state.leagues)) {
    const f = l.fixtures.find((x) => x.id === fixtureId);
    if (f) return { fixture: f, competitionName: l.name, knockout: false, kind: 'league', compId: l.id, roundsLeft: 0 };
  }
  for (const c of Object.values(state.cups)) {
    for (const r of c.rounds) {
      const f = r.fixtures.find((x) => x.id === fixtureId);
      if (f) return { fixture: f, competitionName: c.name, knockout: true, kind: 'cup', compId: c.id, roundsLeft: c.roundDays.length - c.rounds.length };
    }
  }
  for (const c of Object.values(state.continental)) {
    for (const g of c.groups) {
      const f = g.fixtures.find((x) => x.id === fixtureId);
      if (f) return { fixture: f, competitionName: c.name, knockout: false, kind: 'continental', compId: c.id, roundsLeft: 3 };
    }
    for (const r of c.knockout) {
      const f = r.fixtures.find((x) => x.id === fixtureId);
      if (f) return { fixture: f, competitionName: c.name, knockout: true, kind: 'continental', compId: c.id, roundsLeft: Math.log2(Math.max(2, r.fixtures.length * 2)) };
    }
  }
  return null;
}

function makeInput(state: GameState, ctx: FixtureContext, rng: Rng, userLive: boolean): MatchInput & { attendance: number } {
  const f = ctx.fixture;
  const home = state.clubs[f.homeId];
  const away = state.clubs[f.awayId];
  const refs: Referee[] = state.countries[home.countryCode].refereeIds.map((id) => state.referees[id]);
  const importance = matchImportance(state, f, ctx.knockout, ctx.roundsLeft);
  const referee = assignReferee(refs, importance, rng);
  if (!referee) throw new Error(`no referees in ${home.countryCode}`);
  const hs = buildSide(state, home, rng, userLive && home.isUser);
  const as = buildSide(state, away, rng, userLive && away.isUser);
  const homeForm = clubPlayers(state, home.id).reduce((s, p) => s + p.form, 0) / Math.max(1, home.playerIds.length);
  const { attendance } = processMatchdayIncome(home, away.reputation + (ctx.kind === 'continental' ? 20 : 0), homeForm);
  const crowdPressure = clamp((attendance / Math.max(1, home.stadium.capacity)) * (0.5 + home.reputation / 200) + importance * 0.2, 0, 1);
  const weather = rollWeather(rng, state.day, COUNTRY_BY_CODE[home.countryCode].profile);
  return { home: hs, away: as, referee, rng, importance, neutral: false, knockout: ctx.knockout, crowdPressure, weather, attendance };
}

// ───────────────────────── Aplicación de resultados ─────────────────────────

function applyMatchToPlayers(state: GameState, rng: Rng, club: Club, result: MatchResult, side: 'home' | 'away', input: MatchInput): void {
  const gf = side === 'home' ? result.homeGoals : result.awayGoals;
  const ga = side === 'home' ? result.awayGoals : result.homeGoals;
  const outcome = gf > ga ? 1 : gf < ga ? -1 : 0;
  const style = nearestPreset((side === 'home' ? input.home : input.away).tactic.sliders);
  state.monthlyClubMatches[club.id] = (state.monthlyClubMatches[club.id] ?? 0) + 1;
  for (const p of clubPlayers(state, club.id)) {
    const st = result.players[p.id];
    if (!st) {
      if (p.suspendedMatches > 0) p.suspendedMatches--;
      p.morale = clamp(p.morale + outcome * 2, 0, 100);
      continue;
    }
    p.stats.apps++;
    p.stats.minutes += st.minutes;
    p.stats.goals += st.goals;
    p.stats.assists += st.assists;
    p.stats.ratingSum += st.rating;
    const mr = (state.monthlyRatings[p.id] ??= { sum: 0, n: 0, goals: 0 });
    mr.sum += st.rating;
    mr.n++;
    mr.goals += st.goals;
    if (ga === 0 && st.minutes >= 60 && (p.position === 'GK' || ['CB', 'RB', 'LB'].includes(p.position))) {
      p.stats.cleanSheets++;
      if (p.contract?.cleanSheetBonus) record(club.finances, 'bonuses', p.contract.cleanSheetBonus);
    }
    if (st.goals && p.contract?.goalBonus) record(club.finances, 'bonuses', p.contract.goalBonus * st.goals);
    p.lastRatings.push(st.rating);
    if (p.lastRatings.length > 10) p.lastRatings.shift();
    recomputeForm(p);
    p.fitness = st.endFitness;
    state.monthlyMinutes[p.id] = (state.monthlyMinutes[p.id] ?? 0) + st.minutes;
    p.styleFamiliarity[style] = Math.min(100, (p.styleFamiliarity[style] ?? 40) + 0.6 * (st.minutes / 90));
    p.morale = clamp(p.morale + outcome * 4 + (st.rating >= 7.5 ? 2 : st.rating < 5.5 ? -2 : 0), 0, 100);
    if (st.yellow > 0 && !st.red) {
      p.stats.yellow += st.yellow;
      p.yellowAccumulation += st.yellow;
      if (p.yellowAccumulation >= 5) {
        p.suspendedMatches += 1;
        p.yellowAccumulation = 0;
      }
    }
    if (st.red) {
      p.stats.red++;
      p.suspendedMatches += st.yellow >= 2 ? 1 : rng.int(1, 3);
    }
    if (st.injured) {
      const inj = rollInjury(rng, p);
      // El preparador físico y el centro médico reducen la gravedad.
      inj.daysOut = Math.max(2, Math.round(inj.daysOut * (1.15 - physioBoost(state, club) * 0.25)));
      applyInjury(p, inj, rng);
      if (club.isUser) {
        addNews(state, { category: 'injury', title: msg('news.injury.t', { p: `${p.firstName} ${p.lastName}`, injury: msg(`injury.${inj.name}`) }), body: msg('news.injury.b', { days: inj.daysOut }), clubIds: [club.id], playerId: p.id, importance: inj.daysOut > 30 ? 3 : 2 });
      }
    }
  }
  club.chemistry = clamp(club.chemistry + outcome * 0.8, 0, 100);
  club.tacticFamiliarity = clamp((club.tacticFamiliarity ?? 60) + 0.8, 0, 100);
  const rival = state.clubs[side === 'home' ? input.away.club.id : input.home.club.id];
  updateFans(club, outcome as 1 | 0 | -1, club.reputation > (rival?.reputation ?? 0) + 5);
  if (outcome === 1) for (const sp of club.sponsors) if (sp.winBonus) record(club.finances, 'sponsorship', sp.winBonus);
}

/** Ganchos de progresión tras un partido propio: XP de mánager, derbis, rachas y logros. */
function userMatchHooks(state: GameState, stored: StoredMatch, userClub: Club, rival: Club, gf: number, ga: number): void {
  const derby = isDerby(state, userClub.id, rival.id);
  const win = gf > ga;
  addManagerXp(state, (win ? 4 : gf === ga ? 1 : 0) + (derby && win ? 6 : 0));
  if (win) userClub.boardConfidence = clamp(userClub.boardConfidence + perkEffects(state).winBoard, 0, 100);
  const tags = matchStory(stored.result);
  if (win && derby) {
    unlockAchievement(state, 'derbyWin');
    for (const p of clubPlayers(state, userClub.id)) p.morale = clamp(p.morale + 4, 0, 100);
    userClub.fans.satisfaction = clamp(userClub.fans.satisfaction + 4, 0, 100);
  }
  if (win && tags.includes('comeback')) unlockAchievement(state, 'comeback');
  const ours = stored.homeId === userClub.id ? 'home' : 'away';
  if (Object.values(stored.result.players).some((s) => s.side === ours && s.goals >= 3)) unlockAchievement(state, 'hatTrick');
  const streaks = currentStreaks(recentRuns(state.userMatches, userClub.id, 30));
  const meta = ensureMeta(state);
  meta.bestStreak = Math.max(meta.bestStreak, streaks.win);
  if (streaks.win >= 5) unlockAchievement(state, 'winStreak5');
  if (streaks.unbeaten >= 10) unlockAchievement(state, 'unbeaten10');
}

/** Aplica un resultado a todo el sistema (jugadores, finanzas, copa/continental, prensa, social…). */
function finalizeFixture(state: GameState, rng: Rng, ctx: FixtureContext, input: MatchInput, result: MatchResult): StoredMatch | null {
  const f = ctx.fixture;
  const home = state.clubs[f.homeId];
  const away = state.clubs[f.awayId];
  f.played = true;
  f.homeGoals = result.homeGoals;
  f.awayGoals = result.awayGoals;
  f.refereeId = result.refereeId;
  f.attendance = result.attendance;
  if (result.shootout) f.shootoutWinnerId = result.shootout.winner === 'home' ? home.id : away.id;
  applyMatchToPlayers(state, rng, home, result, 'home', input);
  applyMatchToPlayers(state, rng, away, result, 'away', input);
  if (ctx.kind === 'continental') {
    const comp = state.continental[ctx.compId];
    for (const [club, gf, ga] of [[home, result.homeGoals, result.awayGoals], [away, result.awayGoals, result.homeGoals]] as const) {
      if (gf > ga) record(club.finances, 'prizeMoney', continentalPrize(comp, 'win'));
      club.reputation = clamp(club.reputation + (gf > ga ? 0.4 : 0.1), 1, 99);
    }
  }
  const big = result.controversies.filter((c) => (c.controversy ?? 0) > 0.6);
  if (big.length && (home.isUser || away.isUser)) {
    addNews(state, { category: 'match', title: msg('news.controversy.t', { home: home.name, away: away.name, h: result.homeGoals, a: result.awayGoals }), body: big[0].msg, clubIds: [home.id, away.id], importance: 2 });
  }
  if (!home.isUser && !away.isUser) return null;
  const stored: StoredMatch = { fixtureId: f.id, competitionId: ctx.compId, competitionName: ctx.competitionName, season: state.season, day: f.day, homeId: home.id, awayId: away.id, result };
  state.userMatches.push(stored);
  if (state.userMatches.length > 40) state.userMatches.shift();
  const userClub = home.isUser ? home : away;
  const rival = home.isUser ? away : home;
  const gf = home.isUser ? result.homeGoals : result.awayGoals;
  const ga = home.isUser ? result.awayGoals : result.homeGoals;
  addNews(state, {
    category: 'match',
    title: msg('news.result.t', { comp: ctx.competitionName, home: home.name, away: away.name, h: result.homeGoals, a: result.awayGoals }),
    body: msg(gf > ga ? 'news.result.win' : gf < ga ? 'news.result.loss' : 'news.result.draw'),
    clubIds: [home.id, away.id],
    playerId: result.motmId ?? undefined,
    importance: 2,
  });
  const star = result.motmId && result.players[result.motmId]?.side === (home.isUser ? 'home' : 'away') ? state.players[result.motmId] : null;
  postMatchReactions(state, rng, userClub, rival, gf, ga, star ?? null);
  if (gf > ga) unlockAchievement(state, 'firstWin');
  if (gf - ga >= 5) unlockAchievement(state, 'bigWin');
  if (gf > ga && rival.reputation >= userClub.reputation + 15) unlockAchievement(state, 'giantKiller');
  userMatchHooks(state, stored, userClub, rival, gf, ga);
  if (state.pendingPress) autoAnswerPress(state, state.pendingPress);
  state.pendingPress = state.settings.autoPress ? null : generatePressConference(state, userClub.id, rng, stored);
  return stored;
}

/** League reputation from which a top division is always simulated minute by minute. */
const DETAIL_LEAGUE_REP = 70;

/**
 * Detail level (like FM's "full detail" leagues): the user's matches, cups, continental games,
 * the user's country and the strongest top flights get the full engine; the rest the fast model.
 */
function fullDetail(state: GameState, ctx: FixtureContext): boolean {
  const f = ctx.fixture;
  if (state.clubs[f.homeId].isUser || state.clubs[f.awayId].isUser || ctx.kind !== 'league') return true;
  const league = state.leagues[ctx.compId];
  const user = state.userClubId ? state.clubs[state.userClubId] : null;
  if (user && league.countryCode === user.countryCode) return true;
  return league.tier === 1 && league.reputation >= DETAIL_LEAGUE_REP;
}

function playFixture(state: GameState, rng: Rng, ctx: FixtureContext): StoredMatch | null {
  const input = makeInput(state, ctx, rng, false);
  const result = fullDetail(state, ctx) ? simulateMatch(input) : quickMatch(input);
  return finalizeFixture(state, rng, ctx, input, result);
}

function rngForFixture(state: GameState, fixtureId: Id): Rng {
  return new Rng((state.rngState ^ hashString(fixtureId)) >>> 0);
}

/** Prepara el partido pendiente del usuario para jugarlo en directo. */
export function prepareUserMatch(state: GameState): { sim: MatchSim; ctx: FixtureContext; input: MatchInput } | null {
  if (!state.pendingFixtureId) return null;
  const ctx = findFixture(state, state.pendingFixtureId);
  if (!ctx) {
    state.pendingFixtureId = null;
    return null;
  }
  const rng = rngForFixture(state, ctx.fixture.id);
  const input = makeInput(state, ctx, rng, true);
  return { sim: new MatchSim(input), ctx, input };
}

/** Cierra el partido en directo del usuario y aplica todas sus consecuencias. */
export function completeUserMatch(state: GameState, live: { sim: MatchSim; ctx: FixtureContext; input: MatchInput }): StoredMatch | null {
  const rng = live.input.rng;
  const result = live.sim.runToEnd();
  const stored = finalizeFixture(state, rng, live.ctx, live.input, result);
  resolveAfterFixture(state, rng, live.ctx);
  state.pendingFixtureId = null;
  return stored;
}

/** Simula al instante el partido pendiente del usuario (botón "sólo resultado"). */
export function quickSimUserMatch(state: GameState): StoredMatch | null {
  if (!state.pendingFixtureId) return null;
  const ctx = findFixture(state, state.pendingFixtureId);
  state.pendingFixtureId = null;
  if (!ctx) return null;
  const rng = rngForFixture(state, ctx.fixture.id);
  const stored = playFixture(state, rng, ctx);
  resolveAfterFixture(state, rng, ctx);
  return stored;
}

/** Tras un partido de copa/continental: avanza el cuadro cuando la ronda está completa. */
function resolveAfterFixture(state: GameState, rng: Rng, ctx: FixtureContext): void {
  if (ctx.kind === 'cup') {
    const cup = state.cups[ctx.compId];
    resolveCupFixture(cup, ctx.fixture);
    if (cup.winnerId) cupChampion(state, cup.id);
    const loser = ctx.fixture.homeGoals > ctx.fixture.awayGoals || ctx.fixture.shootoutWinnerId === ctx.fixture.homeId ? ctx.fixture.awayId : ctx.fixture.homeId;
    const winner = loser === ctx.fixture.homeId ? ctx.fixture.awayId : ctx.fixture.homeId;
    state.clubs[winner].cupProgress = Math.max(state.clubs[winner].cupProgress, cup.rounds.length);
  } else if (ctx.kind === 'continental') {
    const comp = state.continental[ctx.compId];
    const round = comp.knockout.find((r) => r.fixtures.some((f) => f.id === ctx.fixture.id));
    if (round && round.fixtures.every((f) => f.played)) continentalRoundDone(state, rng, comp.id, round.fixtures);
  }
  if (state.userClubId && (ctx.fixture.homeId === state.userClubId || ctx.fixture.awayId === state.userClubId)) updateObjectives(state);
}

function cupChampion(state: GameState, cupId: Id): void {
  const cup = state.cups[cupId];
  if (!cup.winnerId || cup.history.some((h) => h.season === state.season)) return;
  cup.history.push({ season: state.season, clubId: cup.winnerId });
  const w = state.clubs[cup.winnerId];
  record(w.finances, 'prizeMoney', 4e6 * COUNTRY_BY_CODE[w.countryCode].econ);
  w.reputation = Math.min(99, w.reputation + 2);
  addNews(state, { category: 'general', title: msg('news.cupChampion.t', { club: w.name, cup: cup.name }), body: msg('news.cupChampion.b'), clubIds: [w.id], importance: w.isUser ? 3 : 1 });
  if (w.isUser) {
    addTrophy(state, cup.id, w.id);
    unlockAchievement(state, 'cupWin');
  }
}

function continentalRoundDone(state: GameState, rng: Rng, compId: Id, fixtures: Fixture[]): void {
  const comp = state.continental[compId];
  for (const f of fixtures) {
    const winner = f.homeGoals > f.awayGoals ? f.homeId : f.awayGoals > f.homeGoals ? f.awayId : (f.shootoutWinnerId ?? f.homeId);
    record(state.clubs[winner].finances, 'prizeMoney', continentalPrize(comp, 'round'));
  }
  const champ = advanceKnockout(comp, fixtures);
  rng.next();
  if (champ) {
    const w = state.clubs[champ];
    w.reputation = Math.min(99, w.reputation + 5);
    record(w.finances, 'prizeMoney', continentalPrize(comp, 'round') * 2);
    addNews(state, { category: 'general', title: msg('news.contChampion.t', { club: w.name, comp: comp.name }), body: msg('news.contChampion.b'), clubIds: [w.id], importance: 3 });
    if (w.isUser) {
      addTrophy(state, comp.id, w.id);
      unlockAchievement(state, 'continental');
    }
  }
}

// ───────────────────────── Ciclos ─────────────────────────

function dailyRecovery(state: GameState): void {
  for (const club of loadedClubs(state)) {
    // AI squads recover in 3-day steps (same total, a third of the work); the user's club daily.
    const step = club.isUser ? 1 : 3;
    if (step > 1 && (state.day + club.id.length + club.id.charCodeAt(club.id.length - 1)) % step !== 0) continue;
    const physio = physioBoost(state, club);
    for (const p of clubPlayers(state, club.id)) {
      if (p.fitness < 100) p.fitness = Math.min(100, p.fitness + (3 + p.attrs.naturalFitness / 40 + physio * 3) * step);
      if (p.injury) {
        p.injury.daysOut -= (1 + physio) * step;
        if (p.injury.daysOut <= 0) {
          p.injury = null;
          if (club.isUser) addNews(state, { category: 'injury', title: msg('news.recovered.t', { p: `${p.firstName} ${p.lastName}` }), body: msg('news.recovered.b'), clubIds: [club.id], playerId: p.id });
        }
      }
    }
    if (club.isUser) progressProjects(state, club);
  }
}

function weekly(state: GameState, rng: Rng): void {
  const window = isWindowOpen(state.day);
  const deadline = isDeadlineDay(state.day);
  const pool = window ? transferPool(state) : [];
  // Salario que siguen pagando los clubes por sus cedidos (lo que no cubre el club de destino).
  const loanedOutWages = new Map<Id, number>();
  const squads = new Map<Id, Player[]>();
  for (const league of loadedLeagues(state)) {
    for (const cid of league.clubIds) {
      const players = clubPlayers(state, cid);
      squads.set(cid, players);
      for (const p of players) {
        if (p.loan && p.contract) loanedOutWages.set(p.loan.parentClubId, (loanedOutWages.get(p.loan.parentClubId) ?? 0) + p.contract.wage * (1 - p.loan.wageShare / 100));
      }
    }
  }
  if (deadline && state.userClubId) {
    addNews(state, { category: 'transfer', title: msg('news.deadline.t'), body: msg('news.deadline.b'), importance: 2 });
  }
  for (const league of loadedLeagues(state)) {
    for (const cid of league.clubIds) {
      const club = state.clubs[cid];
      const players = squads.get(cid) ?? clubPlayers(state, cid);
      processWeeklyFinances(club, players, league.tier, club.isUser ? weeklyStaffCost(state, club) : undefined);
      const lw = loanedOutWages.get(cid);
      if (lw) record(club.finances, 'wages', lw);
      processDressingRoomLeaks(state, cid, rng);
      for (const p of players) p.morale = clamp(p.morale + (60 - p.morale) * 0.05, 0, 100);
      club.tacticFamiliarity = clamp((club.tacticFamiliarity ?? 60) + (club.isUser ? 1 + roleQuality(state, club, 'assistant') / 100 : 1), 0, 100);
      if (!club.isUser) {
        // Excedentes y descontentos a la lista de transferibles (aunque el mercado esté cerrado).
        aiListSurplus(state, club);
        if (window && rng.chance(deadline ? 0.85 : 0.22)) aiTransferActivity(state, rng, cid, pool, deadline);
      }
      if (club.isUser) weeklyUserClub(state, rng, club, players);
    }
  }
  pruneNegotiations(state);
  state.sponsorOffers = state.sponsorOffers.filter((o) => o.expiresDay > state.day);
}

/** Elimina negociaciones cerradas: las de la IA en seguida, las del usuario al cabo de dos meses. */
export function pruneNegotiations(state: GameState): number {
  let removed = 0;
  for (const n of Object.values(state.negotiations)) {
    if (n.incoming && n.stage === 'club' && (state.season > n.season || state.day - n.day > 7)) n.stage = 'collapsed';
    if (n.stage !== 'collapsed' && n.stage !== 'agreed') continue;
    if (n.entryAbs) continue; // traspaso pactado para más adelante
    const age = (state.season - n.season) * SEASON_LENGTH_DAYS + state.day - n.day;
    const userSide = n.buyerClubId === state.userClubId || n.sellerClubId === state.userClubId;
    if (age > (userSide ? 60 : 7)) {
      delete state.negotiations[n.id];
      removed++;
    }
  }
  return removed;
}

/** Tope de noticias guardadas (evita que el save crezca sin límite con los años). */
export const NEWS_MAX = 320;
/** Antigüedad (días) a partir de la cual sólo se conservan las noticias importantes. */
export const NEWS_MAX_AGE_DAYS = 420;

/** Poda de noticias obsoletas al cierre de mes: conserva lo reciente y lo importante. */
export function pruneNews(state: GameState): number {
  const kept: NewsItem[] = [];
  for (const n of state.news) {
    const age = (state.season - n.season) * SEASON_LENGTH_DAYS + state.day - n.day;
    if (age > NEWS_MAX_AGE_DAYS && n.importance < 3) continue;
    kept.push(n);
  }
  const before = state.news.length;
  if (kept.length > NEWS_MAX) {
    // Recorta por importancia y recencia sin reordenar el feed.
    const ranked = [...kept].sort((a, b) => b.importance - a.importance || b.season - a.season || b.day - a.day);
    const keep = new Set(ranked.slice(0, NEWS_MAX).map((n) => n.id));
    state.news = kept.filter((n) => keep.has(n.id));
  } else {
    state.news = kept;
  }
  return before - state.news.length;
}

/** Entrenamiento semanal del club del usuario: reconversiones de posición y aprendizaje. */
function weeklyUserClub(state: GameState, rng: Rng, club: Club, players: Player[]): void {
  const assistant = roleQuality(state, club, 'assistant');
  for (const p of players) {
    if (!p.retraining) continue;
    p.retraining.progress += 3 + p.hidden.adaptability / 30 + assistant / 60 + rng.float(0, 1.5);
    if (p.retraining.progress >= 100) {
      if (!p.secondaryPositions.includes(p.retraining.position)) p.secondaryPositions.push(p.retraining.position);
      addNews(state, { category: 'general', title: msg('news.retrained.t', { p: `${p.firstName} ${p.lastName}`, pos: msg('pos', { p: p.retraining.position }) }), body: msg('news.retrained.b'), clubIds: [club.id], playerId: p.id });
      p.retraining = null;
    }
  }
  // Sesiones por grupos (entrenador + enfoque + intensidad) y eventos de la semana.
  const squad = players.filter((p) => !p.academy);
  // Los canteranos también entrenan cada semana (grupo juvenil); los eventos sólo afectan al primer equipo.
  const nextMatch = upcomingFixtures(state, club.id, 1)[0];
  weeklyTraining(state, club, players, rng, { nextMatchInDays: nextMatch ? nextMatch.fixture.day - state.day : null });
  processGrowthPlans(state);
  checkPotentialReveals(state);
  rollTrainingEvent(state, club, squad, rng);
  const matchesThisWeek = upcomingFixtures(state, club.id, 4).filter((x) => x.fixture.day <= state.day + 6).length;
  refreshObjectives(state, club, rng, matchesThisWeek);
  updateObjectives(state);
}

function monthly(state: GameState, rng: Rng): void {
  const seasonMonth = monthOfDay(state.day) - 1;
  monthlyAwards(state, rng, Math.max(0, seasonMonth));
  for (const league of loadedLeagues(state)) {
    const table = computeTable(league);
    for (const cid of league.clubIds) {
      const club = state.clubs[cid];
      const country = COUNTRY_BY_CODE[club.countryCode];
      const matches = state.monthlyClubMatches[cid] ?? 0;
      const players = clubPlayers(state, cid);
      const academy = club.isUser ? academyCoachBoost(state, club) : 1;
      for (const p of players) {
        const share = matches > 0 ? (state.monthlyMinutes[p.id] ?? 0) / (matches * 90) : p.squadStatus === 'key' || p.squadStatus === 'first' ? 0.7 : 0.2;
        developMonthly(p, rng, {
          trainingFacilities: club.trainingFacilities,
          minutesShare: p.academy ? 0.45 : share,
          coachingQuality: coachingFactor(state, club, p.position === 'GK') * (p.academy ? academy : 1),
        });
        if (!p.academy) updateHappiness(p, { minutesShare: share, fairWage: wageForQuality(overall(p), country.econ, p.reputation, country.quality) * tierWageFactor(league.tier), clubReputation: club.reputation });
        p.value = marketValue(p, { econ: country.econ, season: state.season });
        if (club.isUser) {
          const hist = (p.ovrHistory ??= []);
          hist.push({ season: state.season, day: state.day, ovr: overall(p) });
          if (hist.length > 12) hist.shift();
        }
        if (p.stats.apps >= 3) {
          const target = (overall(p) - 40) * 1.6 + (averageRating(p) - 6.7) * 8 + club.reputation * 0.1;
          p.reputation = Math.round(clamp(p.reputation + (target - p.reputation) * 0.05, 1, 99));
        }
      }
      processMonthlyTaxes(club, state.season, Math.max(0, seasonMonth));
      const row = table.findIndex((r) => r.clubId === cid) + 1;
      const games = table.find((r) => r.clubId === cid)?.played ?? 0;
      const verdict = boardReview(state, cid, { position: row, targetPosition: objectiveTargetPosition(club.objective, league.clubIds.length), leagueSize: league.clubIds.length, gamesPlayed: games });
      if (verdict === 'sacked') sackManager(state, club, rng);
      else if (verdict === 'warning' && club.isUser) {
        addNews(state, { category: 'board', title: msg('news.boardWarning.t'), body: msg('news.boardWarning.b', { conf: Math.round(club.boardConfidence) }), clubIds: [cid], importance: 3 });
      }
      if (club.isUser) {
        checkPromises(state, club);
        youthScouting(state, rng, club);
        if (state.day >= 184 && state.day <= 300) {
          const expiring = players.filter((p) => p.contract && p.contract.expiresSeason === state.season && !p.loan);
          if (expiring.length) addNews(state, { category: 'general', title: msg('news.expiring.t', { n: expiring.length }), body: msg('news.expiring.b', { names: expiring.slice(0, 6).map((p) => p.lastName).join(', ') }), clubIds: [cid] });
        }
      } else {
        // Mercado IA: renovaciones preventivas de los jugadores clave en su último año…
        aiRenewContracts(state, club, rng);
        // …y adaptación del dibujo si la plantilla no tiene naturales para la formación actual.
        if (rng.chance(0.5)) aiAdaptFormation(state, cid);
      }
    }
  }
  generateJobOffers(state, rng);
  checkBonusCommitments(state);
  pruneNegotiations(state);
  pruneNews(state);
  state.monthlyMinutes = {};
  state.monthlyClubMatches = {};
  state.monthlyRatings = {};
}

function sackManager(state: GameState, club: Club, rng: Rng): void {
  const m = club.managerId ? state.managers[club.managerId] : null;
  if (!m) return;
  m.clubId = null;
  m.sackings++;
  club.managerId = null;
  addNews(state, { category: 'board', title: msg('news.sacked.t', { club: club.name, manager: `${m.firstName} ${m.lastName}` }), body: msg('news.sacked.b', { conf: Math.round(club.boardConfidence) }), clubIds: [club.id], importance: 3 });
  if (m.isHuman) {
    recordStint(state, club, 'sacked');
    club.isUser = false;
    m.reputation = clamp(m.reputation - 8, 1, 99);
    // FIFA Manager: el despido no termina la partida; el mánager queda libre esperando ofertas.
    state.userClubId = null;
    state.pendingFixtureId = null;
    state.pendingPress = null;
    for (let i = 0; i < 3; i++) generateJobOffers(state, rng);
    // Nunca hay "game over": siempre llega al menos una oferta modesta.
    ensureFallbackOffer(state, rng);
  }
  hireAiManager(state, club.id, rng);
}

function playDayMatches(state: GameState, rng: Rng, autoPlayUser: boolean): { userMatch: StoredMatch | null; pending: boolean; count: number } {
  let userMatch: StoredMatch | null = null;
  let pending = false;
  let count = 0;
  const isUserFixture = (f: Fixture) => state.clubs[f.homeId]?.isUser || state.clubs[f.awayId]?.isUser;
  const live = state.settings.matchMode === 'live' && !autoPlayUser;
  const run = (ctx: FixtureContext): boolean => {
    if (isUserFixture(ctx.fixture) && live) {
      state.pendingFixtureId = ctx.fixture.id;
      pending = true;
      return false;
    }
    const r = playFixture(state, rng, ctx);
    count++;
    if (r) userMatch = r;
    return true;
  };
  for (const rt of Object.values(state.countries)) {
    if (!rt.loaded) continue;
    for (const lid of rt.leagueIds) {
      const league = state.leagues[lid];
      for (const f of league.fixtures) if (f.day === state.day && !f.played) run({ fixture: f, competitionName: league.name, knockout: false, kind: 'league', compId: league.id, roundsLeft: 0 });
    }
    const cup = rt.cupId ? state.cups[rt.cupId] : null;
    if (cup && !cup.winnerId && cup.aliveClubIds.length > 1 && cup.roundDays[cup.rounds.length] === state.day) {
      const round = drawCupRound(cup, state.day, rng, () => newId(state, 'f'));
      const roundsLeft = cup.roundDays.length - cup.rounds.length;
      for (const f of round.fixtures) {
        const ctx: FixtureContext = { fixture: f, competitionName: cup.name, knockout: true, kind: 'cup', compId: cup.id, roundsLeft };
        if (run(ctx)) {
          resolveCupFixture(cup, f);
          const w = f.homeGoals > f.awayGoals || f.shootoutWinnerId === f.homeId ? f.homeId : f.awayId;
          state.clubs[w].cupProgress = Math.max(state.clubs[w].cupProgress, cup.rounds.length);
        }
      }
      if (cup.winnerId) cupChampion(state, cup.id);
    }
  }
  for (const comp of Object.values(state.continental)) {
    if (comp.season !== state.season || comp.phase === 'done') continue;
    const { fixtures, knockout } = continentalFixturesToday(state, comp, rng);
    for (const f of fixtures) run({ fixture: f, competitionName: comp.name, knockout, kind: 'continental', compId: comp.id, roundsLeft: knockout ? Math.log2(fixtures.length * 2) : 3 });
    if (knockout && fixtures.length && fixtures.every((f) => f.played)) continentalRoundDone(state, rng, comp.id, fixtures);
  }
  return { userMatch, pending, count };
}

// ───────────────────────── Temporada ─────────────────────────

function endOfSeason(state: GameState, rng: Rng): void {
  for (const rt of Object.values(state.countries)) {
    if (!rt.loaded) continue;
    const country = COUNTRY_BY_CODE[rt.code];
    const leagues = rt.leagueIds.map((id) => state.leagues[id]).sort((a, b) => a.tier - b.tier);
    const tables = leagues.map((l) => computeTable(l));
    leagues.forEach((league, i) => {
      const table = tables[i];
      const size = table.length;
      if (!table.length) return;
      const champ = state.clubs[table[0].clubId];
      league.champions.push({ season: state.season, clubId: champ.id });
      if (champ.isUser || league.reputation >= 75) addNews(state, { category: 'general', title: msg('news.champion.t', { club: champ.name, league: league.name }), body: msg('news.champion.b', { pts: table[0].points }), clubIds: [champ.id], importance: champ.isUser ? 3 : 2 });
      if (champ.isUser) addTrophy(state, league.id, champ.id);
      const repRank = [...league.clubIds].sort((a, b) => state.clubs[b].reputation - state.clubs[a].reputation);
      table.forEach((row, idx) => {
        const club = state.clubs[row.clubId];
        record(club.finances, 'prizeMoney', prizeMoney(country, league.tier, idx + 1, size));
        if (idx === 0) for (const sp of club.sponsors) if (sp.titleBonus) record(club.finances, 'sponsorship', sp.titleBonus);
        const expected = repRank.indexOf(club.id) + 1;
        club.reputation = Math.round(clamp(club.reputation + ((expected - (idx + 1)) / size) * 6 + (idx === 0 ? 2 : 0), 1, 99));
        const target = objectiveTargetPosition(club.objective, size);
        if (!club.isUser) {
          if (idx + 1 > target + Math.max(2, size * 0.2) && rng.chance(0.6)) sackManager(state, club, rng);
        } else {
          const met = idx + 1 <= target;
          seasonCareerUpdate(state, club, idx + 1, size, met);
          club.boardConfidence = clamp(club.boardConfidence + (met ? 15 : -15), 0, 100);
          addNews(state, { category: 'board', title: msg(met ? 'news.objectiveMet.t' : 'news.objectiveMissed.t'), body: msg(met ? 'news.objectiveMet.b' : 'news.objectiveMissed.b', { pos: idx + 1 }), clubIds: [club.id], importance: 3 });
          if (!met && club.boardConfidence < 15) sackManager(state, club, rng);
        }
      });
    });
    for (let i = 0; i + 1 < leagues.length; i++) {
      const upper = leagues[i];
      const lower = leagues[i + 1];
      const n = Math.min(upper.relegationSlots, lower.promotionSlots);
      const down = tables[i].slice(-n).map((r) => r.clubId);
      const up = tables[i + 1].slice(0, n).map((r) => r.clubId);
      upper.clubIds = upper.clubIds.filter((id) => !down.includes(id)).concat(up);
      lower.clubIds = lower.clubIds.filter((id) => !up.includes(id)).concat(down);
      for (const id of up) {
        state.clubs[id].leagueId = upper.id;
        state.clubs[id].reputation = Math.min(99, state.clubs[id].reputation + 5);
        if (state.clubs[id].isUser) {
          addNews(state, { category: 'general', title: msg('news.promoted.t', { club: state.clubs[id].name, league: upper.name }), body: msg('news.promoted.b'), clubIds: [id], importance: 3 });
          unlockAchievement(state, 'promotion');
        }
        applyContractClauses(state, id, 'raise');
      }
      for (const id of down) {
        state.clubs[id].leagueId = lower.id;
        state.clubs[id].reputation = Math.max(1, state.clubs[id].reputation - 6);
        if (state.clubs[id].isUser) addNews(state, { category: 'general', title: msg('news.relegated.t', { club: state.clubs[id].name, league: lower.name }), body: msg('news.relegated.b'), clubIds: [id], importance: 3 });
        applyContractClauses(state, id, 'cut');
      }
    }
    for (const league of leagues) {
      for (const cid of league.clubIds) {
        const club = state.clubs[cid];
        closeSeasonLedger(club, state.season);
        const v = evaluateFPF(club);
        if (!v.compliant && club.isUser) addNews(state, { category: 'fpf', title: msg('news.fpf.t', { club: club.name }), body: v.message, clubIds: [cid], importance: 3 });
      }
    }
  }
  seasonAwards(state, rng);
  checkLegends(state);
  for (const p of Object.values(state.players)) {
    if (p.stats.apps > 0) p.career.push({ season: state.season, clubId: p.clubId, apps: p.stats.apps, goals: p.stats.goals, assists: p.stats.assists, avgRating: Math.round(averageRating(p) * 100) / 100 });
  }
}

/** Al cerrar la temporada, proclama leyendas del club del usuario a quienes acumulan suficiente historia. */
function checkLegends(state: GameState): void {
  const clubId = state.userClubId;
  if (!clubId) return;
  const meta = ensureMeta(state);
  for (const l of clubLegends(state, clubId, 12)) {
    if (!isLegend(l) || meta.legends.includes(l.playerId)) continue;
    meta.legends.push(l.playerId);
    const p = state.players[l.playerId];
    unlockAchievement(state, 'legendMade');
    pushReveal(state, {
      kind: 'legend',
      playerId: p.id,
      title: msg('ui.reveal.legendT', { p: `${p.firstName} ${p.lastName}` }),
      body: msg('ui.reveal.legendB', { a: l.apps, g: l.goals }),
    });
  }
}

function startNewSeason(state: GameState, rng: Rng): void {
  endLoans(state);
  const prevUserBudget = state.userClubId ? state.clubs[state.userClubId].finances.transferBudget : 0;
  state.season += 1;
  state.day = 0;
  // Cierre de temporada: poda negociaciones y noticias para arrancar con el save compacto.
  pruneNegotiations(state);
  pruneNews(state);
  for (const p of Object.values(state.players)) {
    if (p.retired) continue;
    p.stats = emptyStats();
    p.yellowAccumulation = 0;
    p.promise = null;
    if (ageOneYear(p, rng)) {
      if (p.clubId) {
        const c = state.clubs[p.clubId];
        c.playerIds = c.playerIds.filter((id) => id !== p.id);
        if (c.isUser) addNews(state, { category: 'general', title: msg('news.retire.t', { p: `${p.firstName} ${p.lastName}` }), body: msg('news.retire.b', { age: p.age }), clubIds: [c.id], playerId: p.id });
      }
      state.freeAgentIds = state.freeAgentIds.filter((id) => id !== p.id);
      p.clubId = null;
      p.contract = null;
      p.loan = null;
    }
  }
  for (const club of loadedClubs(state)) {
    const players = clubPlayers(state, club.id);
    const avg = players.reduce((s, p) => s + overall(p), 0) / Math.max(1, players.length);
    for (const p of players) {
      if (!p.contract || p.contract.expiresSeason >= state.season || p.loan) continue;
      const keep = !club.isUser && overall(p) >= avg - 4 && p.age < 33 && rng.chance(0.75);
      if (keep) p.contract = { ...p.contract, signedSeason: state.season, expiresSeason: state.season + rng.int(1, 3), wage: roundMoney(p.contract.wage * rng.float(1.0, 1.25)) };
      else {
        releasePlayer(state, club.id, p.id, false);
        if (club.isUser) addNews(state, { category: 'transfer', title: msg('news.leftFree.t', { p: `${p.firstName} ${p.lastName}` }), body: msg('news.leftFree.b'), clubIds: [club.id], playerId: p.id });
      }
    }
    // Cantera: los juveniles heredan el nivel del país; los del usuario entran en su academia.
    const country = COUNTRY_BY_CODE[club.countryCode];
    const intake = intakeCount(2 + Math.round((club.youthRecruitment / 100) * 3 + rng.next()), club.youthPolicy);
    const regens: Player[] = [];
    for (let i = 0; i < intake; i++) {
      const p = generateRegen(rng, { id: newId(state, 'p'), country, season: state.season, youthFacilities: club.youthFacilities, youthRecruitment: club.youthRecruitment });
      applyYouthPolicy(p, club.youthPolicy);
      p.clubId = club.id;
      p.academy = club.isUser;
      p.contract = { wage: roundMoney(Math.max(80, wageForQuality(overall(p), country.econ, p.reputation, country.quality) * tierWageFactor(state.leagues[club.leagueId].tier) * 0.4)), signedSeason: state.season, expiresSeason: state.season + 2, releaseClause: null, goalBonus: 0, cleanSheetBonus: 0, signingBonus: 0 };
      state.players[p.id] = p;
      if (!club.isUser) club.playerIds.push(p.id);
      regens.push(p);
    }
    if (club.isUser && regens.length) {
      // Día de la cantera: la cosecha son promesas que el usuario decide firmar (según las plazas de la academia).
      makeIntakeProspects(state, club, regens);
      const best = [...regens].sort((a, b) => b.potential - a.potential)[0];
      addNews(state, {
        category: 'youth',
        title: msg('news.intakeDay.t', { n: regens.length }),
        body: msg('news.intakeDay.b', { p: `${best.firstName} ${best.lastName}`, pos: msg('pos', { p: best.position }), age: best.age, slots: Math.max(0, academyCapacity(club) - academyPlayers(state, club.id).length), days: INTAKE_DAYS }),
        clubIds: [club.id],
        playerId: best.id,
        importance: 3,
      });
    }
    // Patrocinios: pasa un año; la IA renueva y el usuario recibe ofertas.
    for (const sp of club.sponsors) sp.years--;
    club.sponsors = club.sponsors.filter((sp) => sp.years > 0);
    club.cupProgress = 0;
  }
  state.freeAgentIds = state.freeAgentIds.filter((id) => {
    const p = state.players[id];
    if (!p || p.retired) return false;
    if (p.age >= 34 && rng.chance(0.5)) {
      p.retired = true;
      return false;
    }
    return true;
  });
  for (const rt of Object.values(state.countries)) {
    if (!rt.loaded) continue;
    for (const lid of rt.leagueIds) {
      const league = state.leagues[lid];
      league.pointsDeductions = {};
      for (const cid of league.clubIds) {
        const club = state.clubs[cid];
        if (club.finances.fpf.pointsDeducted > 0) {
          league.pointsDeductions[cid] = club.finances.fpf.pointsDeducted;
          club.finances.fpf.pointsDeducted = 0;
        }
      }
      league.fixtures = generateLeagueFixtures(league, rng, () => newId(state, 'f'));
      const clubs = league.clubIds.map((id) => state.clubs[id]);
      for (const club of clubs) {
        const players = clubPlayers(state, club.id);
        club.objective = computeObjective(club, clubs, league.tier);
        club.objectives = { league: club.objective, cupRound: club.reputation > 70 ? 3 : 1, financeTarget: 0, youthMinutes: club.reputation > 60 ? 600 : 1200, brandReputation: club.reputation + 2 };
        assignSquadStatuses(players, club.isUser);
        setSeasonBudgets(club, players, league.tier, league.clubIds.length - 1);
        sellSeasonTickets(club, league.clubIds.length - 1, ticketPrice(club, COUNTRY_BY_CODE[club.countryCode]));
        if (!club.isUser) {
          if (club.sponsors.length < 2) aiSignSponsors(state, club, rng, league.tier);
          aiListPlayers(state, club);
          aiChooseTactic(state, club.id, rng);
        } else {
          state.sponsorOffers = generateSponsorOffers(state, club, rng, league.tier);
          if (state.sponsorOffers.length) addNews(state, { category: 'finance', title: msg('news.sponsorOffers.t', { n: state.sponsorOffers.length }), body: msg('news.sponsorOffers.b'), clubIds: [club.id], importance: 2 });
        }
      }
    }
    if (rt.cupId) {
      const ids = rt.leagueIds.flatMap((lid) => state.leagues[lid].clubIds).sort((a, b) => state.clubs[b].reputation - state.clubs[a].reputation);
      resetCup(state.cups[rt.cupId], ids);
    }
  }
  setupContinental(state, rng);
  refreshStaffMarket(state, rng);
  // Las cuotas aplazadas que vencen ahora se pagan una vez fijados los presupuestos de la temporada.
  payInstalments(state, state.season);
  for (const [id, n] of Object.entries(state.negotiations)) if ((n.stage === 'agreed' && !n.entryAbs) || n.stage === 'collapsed') delete state.negotiations[id];
  const uc = state.userClubId ? state.clubs[state.userClubId] : null;
  if (uc) {
    const cont = clubContinental(state, uc.id);
    addNews(state, {
      category: 'board',
      title: msg('news.newSeason.t', { season: state.season }),
      body: msg('news.newSeason.b', { objective: msg(`objective.${uc.objective}`), budget: uc.finances.transferBudget, wages: uc.finances.wageBudget, continental: cont.length ? cont[0].name : '' }),
      clubIds: [uc.id],
      importance: 3,
    });
    // Aviso claro de cómo queda el dinero para fichar (arrastre + premio de la liga reinvertido).
    const prize = uc.finances.history[uc.finances.history.length - 1]?.ledger.prizeMoney ?? 0;
    addNews(state, {
      category: 'finance',
      title: msg('news.budget.t'),
      body: msg('news.budget.b', { budget: uc.finances.transferBudget, amount: Math.round(prevUserBudget * SEASON_CARRY), value: Math.round(prize * PRIZE_REINVEST) }),
      clubIds: [uc.id],
      importance: 3,
    });
  }
}

/** Avanza un día de calendario. Con `autoPlayUser` el partido propio se simula sin directo. */
export function advanceDay(state: GameState, autoPlayUser = false): DayReport {
  if (state.gameOver || state.pendingFixtureId) {
    return { season: state.season, day: state.day, userMatch: null, pendingUserMatch: !!state.pendingFixtureId, matchesPlayed: 0, seasonEnded: false };
  }
  const rng = new Rng(state.rngState);
  dailyRecovery(state);
  const { userMatch, pending, count } = playDayMatches(state, rng, autoPlayUser);
  processScoutingDay(state, rng);
  processNegotiations(state);
  processApplications(state, rng);
  // Sin club y sin ofertas durante una semana: llega una oferta modesta (el desempleo no es un callejón sin salida).
  if (!state.userClubId && state.userManagerId && state.day % 7 === 0 && state.jobOffers.length === 0) ensureFallbackOffer(state, rng);
  processMarketDay(state, rng);
  expireProspects(state);
  if (state.day >= 338) processInternationalDay(state, rng);
  if (state.day % 7 === 0) weekly(state, rng);
  if (state.day > 0 && isFirstDayOfMonth(state.day)) monthly(state, rng);
  let seasonEnded = false;
  if (state.day === CALENDAR.seasonEndDay) {
    endOfSeason(state, rng);
    seasonEnded = true;
  }
  if (state.day === CALENDAR.seasonEndDay + 1) setupInternationalTournaments(state, rng);
  const report: DayReport = { season: state.season, day: state.day, userMatch, pendingUserMatch: pending, matchesPlayed: count, seasonEnded };
  state.day += 1;
  if (state.day >= SEASON_LENGTH_DAYS) startNewSeason(state, rng);
  state.rngState = rng.state;
  return report;
}

/** Desempleado: avanza días hasta que llegue una oferta (o `maxDays`). Devuelve los días avanzados. */
export function advanceUntilOffer(state: GameState, maxDays = 45): number {
  let n = 0;
  while (n < maxDays && !state.userClubId && state.jobOffers.length === 0) {
    advanceDay(state, true);
    n++;
  }
  return n;
}

/** Próximo partido de un club (liga, copa sorteada o continental). */
export function nextFixtureFor(state: GameState, clubId: Id): { fixture: Fixture; competitionName: Msg | string } | null {
  return upcomingFixtures(state, clubId, 1)[0] ?? null;
}

/** Partidos de un club (jugados y por jugar) en todas las competiciones, ordenados por día. */
export function clubFixtures(state: GameState, clubId: Id): { fixture: Fixture; competitionName: Msg | string; kind: FixtureContext['kind'] }[] {
  const out: { fixture: Fixture; competitionName: Msg | string; kind: FixtureContext['kind'] }[] = [];
  const club = state.clubs[clubId];
  if (!club) return out;
  const rt = state.countries[club.countryCode];
  for (const lid of rt.leagueIds) {
    const l = state.leagues[lid];
    for (const f of l.fixtures) if (f.homeId === clubId || f.awayId === clubId) out.push({ fixture: f, competitionName: l.name, kind: 'league' });
  }
  const cup = rt.cupId ? state.cups[rt.cupId] : null;
  if (cup) for (const r of cup.rounds) for (const f of r.fixtures) if (f.homeId === clubId || f.awayId === clubId) out.push({ fixture: f, competitionName: cup.name, kind: 'cup' });
  for (const c of clubContinental(state, clubId)) {
    for (const g of c.groups) for (const f of g.fixtures) if (f.homeId === clubId || f.awayId === clubId) out.push({ fixture: f, competitionName: c.name, kind: 'continental' });
    for (const r of c.knockout) for (const f of r.fixtures) if (f.homeId === clubId || f.awayId === clubId) out.push({ fixture: f, competitionName: c.name, kind: 'continental' });
  }
  return out.sort((a, b) => a.fixture.day - b.fixture.day);
}

export function upcomingFixtures(state: GameState, clubId: Id, n = 5): { fixture: Fixture; competitionName: Msg | string }[] {
  return clubFixtures(state, clubId).filter((x) => !x.fixture.played && x.fixture.day >= state.day).slice(0, n);
}

/** Días de copa previstos (aún sin sortear) para el calendario. */
export function cupDaysFor(state: GameState, clubId: Id): number[] {
  const club = state.clubs[clubId];
  const cup = club ? state.cups[state.countries[club.countryCode].cupId ?? ''] : null;
  if (!cup || !cup.aliveClubIds.includes(clubId)) return [];
  return cup.roundDays.slice(cup.rounds.length);
}
