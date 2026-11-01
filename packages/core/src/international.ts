// Selecciones nacionales y torneos internacionales (Mundial cada 4 años y campeonatos continentales
// entre medias). Se juegan al final de la temporada, tras las ligas. Convocatorias automáticas con
// los mejores jugadores de cada nacionalidad; el usuario puede dirigir una selección (career.ts).
import type { Club } from './club';
import { COUNTRIES, COUNTRY_BY_CODE } from './data/countries';
import { msg, type Msg } from './i18n';
import { simulateMatch, type MatchSide } from './matchEngine';
import { overall, type Player } from './player';
import { generateReferee } from './referee';
import type { Rng } from './rng';
import { addNews, newId, type GameState } from './state';
import { makeTactic, nearestPreset } from './tactics';
import { type Confederation, type Id } from './types';
import { pickLineup, emptySetup } from './club';
import { blankFinances } from './finance';
import { defaultFacilities, defaultTickets } from './clubOps';

export interface IntlFixture {
  id: Id;
  day: number;
  home: string;
  away: string;
  played: boolean;
  hg: number;
  ag: number;
  shootoutWinner: string | null;
  scorers: Id[];
}

export interface IntlTournament {
  id: Id;
  kind: 'worldCup' | 'continental';
  confed: Confederation | null;
  name: Msg;
  season: number;
  teams: string[];
  groups: { teams: string[]; fixtures: IntlFixture[] }[];
  knockout: { name: Msg; day: number; fixtures: IntlFixture[] }[];
  alive: string[];
  winner: string | null;
  phase: 'groups' | 'knockout' | 'done';
}

export interface NationalTeamInfo {
  rating: number;
  squad: Id[];
  /** El mánager humano dirige esta selección. */
  userManaged: boolean;
}

export interface InternationalState {
  teams: Record<string, NationalTeamInfo>;
  tournaments: IntlTournament[];
}

export function emptyInternational(): InternationalState {
  return { teams: {}, tournaments: [] };
}

const WC_QUOTA: Record<Confederation, number> = { UEFA: 13, CAF: 5, AFC: 4, CONMEBOL: 5, CONCACAF: 4, OFC: 1 };
const CONT_SIZE: Record<Confederation, number> = { UEFA: 24, CONMEBOL: 12, CAF: 24, AFC: 24, CONCACAF: 16, OFC: 8 };
const GROUP_DAYS = [339, 343, 347];
const KO_DAYS = [352, 356, 359, 362];

export function isWorldCupSeason(season: number): boolean {
  return (season + 1) % 4 === 2;
}
export function isContinentalSeason(season: number): boolean {
  return (season + 1) % 4 === 0;
}

/** Convocatoria: los 23 mejores de cada nacionalidad (3 porteros). */
export function selectSquads(state: GameState): void {
  const byNat = new Map<string, Player[]>();
  for (const p of Object.values(state.players)) {
    if (p.retired || p.academy || p.age < 17) continue;
    const arr = byNat.get(p.nationality);
    if (arr) arr.push(p);
    else byNat.set(p.nationality, [p]);
  }
  for (const c of COUNTRIES) {
    const pool = (byNat.get(c.code) ?? []).sort((a, b) => overall(b) - overall(a));
    const gks = pool.filter((p) => p.position === 'GK').slice(0, 3);
    const outfield = pool.filter((p) => p.position !== 'GK').slice(0, 20);
    const squad = [...gks, ...outfield];
    const top = squad.map((p) => overall(p)).sort((a, b) => b - a).slice(0, 14);
    const rating = top.length ? top.reduce((s, v) => s + v, 0) / top.length : 40;
    const prev = state.international.teams[c.code];
    state.international.teams[c.code] = { rating: Math.round(rating * 10) / 10, squad: squad.map((p) => p.id), userManaged: prev?.userManaged ?? false };
  }
}

/** Club "virtual" para que el motor de partidos pueda jugar con una selección. */
function nationalClub(code: string): Club {
  const c = COUNTRY_BY_CODE[code];
  return {
    id: `nat-${code}`,
    name: code,
    shortName: code,
    city: code,
    countryCode: code,
    leagueId: '',
    reputation: 70,
    colors: ['#333333', '#ffffff'],
    stadium: { name: '', capacity: 60000, condition: 90 },
    fanBase: 0,
    youthFacilities: 0,
    youthRecruitment: 0,
    trainingFacilities: 0,
    staffQuality: 60,
    managerId: null,
    playerIds: [],
    scoutIds: [],
    staffIds: [],
    tactic: emptySetup(makeTactic(`nat-${code}`, code, 'BALANCED')),
    savedTactics: [],
    tacticFamiliarity: 60,
    chemistry: 65,
    boardConfidence: 60,
    objective: 'mid_table',
    objectives: { league: 'mid_table', cupRound: 0, financeTarget: 0, youthMinutes: 0, brandReputation: 0 },
    finances: blankFinances(),
    sponsors: [],
    loans: [],
    projects: [],
    facilities: defaultFacilities(),
    tickets: defaultTickets(),
    fans: { satisfaction: 60, members: 0 },
    isUser: false,
    source: 'generated',
    leakPressure: 0,
    cupProgress: 0,
    founded: c ? undefined : undefined,
  };
}

function nationalSide(state: GameState, code: string, name: string): MatchSide {
  const info = state.international.teams[code];
  const players = (info?.squad ?? []).map((id) => state.players[id]).filter((p): p is Player => !!p && !p.injury);
  const style = players.length ? nearestPreset(makeTactic('x', 'x', 'BALANCED').sliders) : 'BALANCED';
  const tactic = makeTactic(`nat-${code}`, code, style, '4-3-3');
  const { lineup, bench } = pickLineup(players, tactic);
  const byId = new Map(players.map((p) => [p.id, p]));
  return {
    club: nationalClub(code),
    players: lineup.map((id) => byId.get(id)).filter((p): p is Player => !!p),
    bench: bench.map((id) => byId.get(id)).filter((p): p is Player => !!p),
    tactic,
    manager: null,
    penaltyTakerId: null,
    name,
  };
}

function makeFx(state: GameState, day: number, home: string, away: string): IntlFixture {
  return { id: newId(state, 'if'), day, home, away, played: false, hg: 0, ag: 0, shootoutWinner: null, scorers: [] };
}

function buildTournament(state: GameState, rng: Rng, kind: IntlTournament['kind'], confed: Confederation | null, teams: string[]): IntlTournament {
  const shuffled = [...teams];
  // Bombos por rating: cabezas de serie repartidas.
  shuffled.sort((a, b) => (state.international.teams[b]?.rating ?? 0) - (state.international.teams[a]?.rating ?? 0));
  const nGroups = Math.max(1, Math.floor(shuffled.length / 4));
  const pots = [0, 1, 2, 3].map((p) => rng.shuffle(shuffled.slice(p * nGroups, (p + 1) * nGroups)));
  const groups: IntlTournament['groups'] = [];
  for (let g = 0; g < nGroups; g++) {
    const ts = pots.map((pot) => pot[g]).filter(Boolean);
    const fixtures: IntlFixture[] = [];
    const pairs: [number, number][][] = [
      [[0, 1], [2, 3]],
      [[0, 2], [1, 3]],
      [[3, 0], [1, 2]],
    ];
    pairs.forEach((md, r) => md.forEach(([h, a]) => ts[h] && ts[a] && fixtures.push(makeFx(state, GROUP_DAYS[r], ts[h], ts[a]))));
    groups.push({ teams: ts, fixtures });
  }
  return {
    id: newId(state, 'it'),
    kind,
    confed,
    name: kind === 'worldCup' ? msg('intl.worldCup') : msg(`intl.cont.${confed}`),
    season: state.season,
    teams: shuffled,
    groups,
    knockout: [],
    alive: [],
    winner: null,
    phase: 'groups',
  };
}

/** Al terminar las ligas: crea el torneo internacional del verano (si toca). */
export function setupInternationalTournaments(state: GameState, rng: Rng): void {
  selectSquads(state);
  const rated = (codes: string[]) => [...codes].sort((a, b) => (state.international.teams[b]?.rating ?? 0) - (state.international.teams[a]?.rating ?? 0));
  if (isWorldCupSeason(state.season)) {
    const teams: string[] = [];
    for (const [confed, quota] of Object.entries(WC_QUOTA) as [Confederation, number][]) {
      teams.push(...rated(COUNTRIES.filter((c) => c.confederation === confed).map((c) => c.code)).slice(0, quota));
    }
    state.international.tournaments.push(buildTournament(state, rng, 'worldCup', null, teams));
  } else if (isContinentalSeason(state.season)) {
    for (const confed of Object.keys(CONT_SIZE) as Confederation[]) {
      const pool = COUNTRIES.filter((c) => c.confederation === confed).map((c) => c.code);
      let teams = rated(pool).slice(0, CONT_SIZE[confed]);
      if (confed === 'CONMEBOL') teams = [...teams, 'MEX', 'USA'];
      teams = teams.slice(0, 4 * Math.floor(teams.length / 4));
      if (teams.length >= 8) state.international.tournaments.push(buildTournament(state, rng, 'continental', confed, teams));
    }
  }
  for (const t of state.international.tournaments.filter((x) => x.season === state.season)) {
    addNews(state, { category: 'general', title: msg('news.intlStart.t', { name: t.name }), body: msg('news.intlStart.b', { n: t.teams.length }), importance: 2 });
  }
}

function groupStandings(g: IntlTournament['groups'][number]): { code: string; pts: number; gd: number; gf: number }[] {
  const rows = new Map(g.teams.map((c) => [c, { code: c, pts: 0, gd: 0, gf: 0 }]));
  for (const f of g.fixtures) {
    if (!f.played) continue;
    const h = rows.get(f.home)!;
    const a = rows.get(f.away)!;
    h.gf += f.hg;
    a.gf += f.ag;
    h.gd += f.hg - f.ag;
    a.gd += f.ag - f.hg;
    if (f.hg > f.ag) h.pts += 3;
    else if (f.hg < f.ag) a.pts += 3;
    else {
      h.pts++;
      a.pts++;
    }
  }
  return [...rows.values()].sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf);
}

export { groupStandings as intlGroupStandings };

function playIntl(state: GameState, rng: Rng, f: IntlFixture, knockout: boolean): void {
  const refCountry = rng.pick(COUNTRIES.filter((c) => c.quality > 60));
  const referee = generateReferee(rng, 'intl-ref', refCountry);
  const home = nationalSide(state, f.home, f.home);
  const away = nationalSide(state, f.away, f.away);
  if (home.players.length < 7 || away.players.length < 7) {
    f.played = true;
    f.hg = home.players.length >= away.players.length ? 1 : 0;
    f.ag = 1 - f.hg;
    return;
  }
  const r = simulateMatch({ home, away, referee, rng, importance: knockout ? 0.9 : 0.7, neutral: true, knockout, crowdPressure: 0.5 });
  f.played = true;
  f.hg = r.homeGoals;
  f.ag = r.awayGoals;
  if (r.shootout) f.shootoutWinner = r.shootout.winner === 'home' ? f.home : f.away;
  for (const st of Object.values(r.players)) {
    const p = state.players[st.playerId];
    if (!p) continue;
    p.caps = (p.caps ?? 0) + 1;
    p.intGoals = (p.intGoals ?? 0) + st.goals;
    for (let i = 0; i < st.goals; i++) f.scorers.push(p.id);
  }
}

/** Juega los partidos internacionales del día y gestiona el paso a eliminatorias. */
export function processInternationalDay(state: GameState, rng: Rng): void {
  for (const t of state.international.tournaments) {
    if (t.season !== state.season || t.phase === 'done') continue;
    if (t.phase === 'groups') {
      for (const g of t.groups) for (const f of g.fixtures) if (f.day === state.day && !f.played) playIntl(state, rng, f, false);
      if (t.groups.every((g) => g.fixtures.every((f) => f.played))) {
        // Pasan los dos primeros y los mejores terceros hasta completar una potencia de 2.
        const firsts: string[] = [];
        const seconds: string[] = [];
        const thirds: { code: string; pts: number; gd: number; gf: number }[] = [];
        for (const g of t.groups) {
          const s = groupStandings(g);
          firsts.push(s[0].code);
          seconds.push(s[1].code);
          if (s[2]) thirds.push(s[2]);
        }
        const qualified = firsts.length + seconds.length;
        const target = 2 ** Math.ceil(Math.log2(qualified));
        const bestThirds = thirds.sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf).slice(0, target - qualified).map((x) => x.code);
        const order: string[] = [];
        firsts.forEach((f, i) => order.push(f, seconds[(i + 1) % seconds.length]));
        t.alive = [...order, ...bestThirds];
        t.phase = 'knockout';
      }
      continue;
    }
    const roundsLeft = Math.log2(t.alive.length);
    const day = KO_DAYS[KO_DAYS.length - roundsLeft];
    if (day !== state.day) continue;
    const fixtures: IntlFixture[] = [];
    for (let i = 0; i + 1 < t.alive.length; i += 2) fixtures.push(makeFx(state, day, t.alive[i], t.alive[i + 1]));
    for (const f of fixtures) playIntl(state, rng, f, true);
    t.knockout.push({ name: msg(`round.${['final', 'semi', 'quarter', 'r16'][roundsLeft - 1] ?? 'r16'}`), day, fixtures });
    t.alive = fixtures.map((f) => (f.hg > f.ag ? f.home : f.ag > f.hg ? f.away : (f.shootoutWinner ?? f.home)));
    if (t.alive.length === 1) {
      t.winner = t.alive[0];
      t.phase = 'done';
      addNews(state, { category: 'general', title: msg('news.intlChampion.t', { team: msg('country', { code: t.winner }), name: t.name }), body: msg('news.intlChampion.b'), importance: 3 });
    }
  }
}
