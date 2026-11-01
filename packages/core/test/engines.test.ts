import { describe, expect, it } from 'vitest';
import {
  COUNTRY_BY_CODE,
  Rng,
  advanceDay,
  clubPlayers,
  completeUserMatch,
  createCustomClub,
  prepareUserMatch,
  computeTable,
  createWorld,
  errorMarginFor,
  estimateSeasonRevenue,
  generatePlayer,
  generateReferee,
  generateScout,
  MatchSim,
  TACTICAL_STYLES,
  buildSide,
  endLoans,
  makeTactic,
  progressProjects,
  quickMatch,
  reportDurationFor,
  setUserClub,
  simulateMatch,
  startNegotiation,
  startProject,
  styleFit,
  submitLoanBid,
  type Club,
  type GameState,
  type MatchSide,
} from '../src';

function topClub(state: GameState, code: string): Club {
  const league = state.leagues[state.countries[code].leagueIds[0]];
  return league.clubIds.map((id) => state.clubs[id]).sort((a, b) => b.reputation - a.reputation)[0];
}

describe('macroeconomía regional', () => {
  it('un club top de Colombia ingresa muchísimo menos que uno de España', () => {
    const state = createWorld({ seed: 7, season: 2026, loadedCountries: ['ESP', 'COL'] });
    const esp = topClub(state, 'ESP');
    const col = topClub(state, 'COL');
    const revEsp = estimateSeasonRevenue(esp, COUNTRY_BY_CODE.ESP, 1, 19);
    const revCol = estimateSeasonRevenue(col, COUNTRY_BY_CODE.COL, 1, 17);
    expect(revEsp / revCol).toBeGreaterThan(4);
    const wageEsp = clubPlayers(state, esp.id).reduce((s, p) => s + (p.contract?.wage ?? 0), 0);
    const wageCol = clubPlayers(state, col.id).reduce((s, p) => s + (p.contract?.wage ?? 0), 0);
    expect(wageEsp / wageCol).toBeGreaterThan(4);
  });
});

describe('scouting geográfico', () => {
  it('100% de conocimiento → ±1; 0% → ±15 y triple de tiempo', () => {
    const rng = new Rng(3);
    const scout = generateScout(rng, 's1', COUNTRY_BY_CODE.COL, 50);
    scout.judgeAbility = 50;
    scout.countryKnowledge = { COL: 100, JPN: 0 };
    expect(errorMarginFor(scout, 'COL')).toBe(1);
    expect(errorMarginFor(scout, 'JPN')).toBe(15);
    expect(reportDurationFor(scout, 'JPN')).toBe(reportDurationFor(scout, 'COL') * 3);
  });
});

describe('estilos tácticos', () => {
  it('un tanque aéreo rinde mucho peor en Tiki-Taka que en Juego Directo', () => {
    const rng = new Rng(11);
    const p = generatePlayer(rng, { id: 'x', country: COUNTRY_BY_CODE.ENG, position: 'ST', quality: 72, season: 2026, age: 27 });
    Object.assign(p.attrs, { strength: 90, heading: 90, jumping: 88, passing: 45, firstTouch: 48, vision: 40, decisions: 50, composure: 55, teamwork: 50, agility: 45, dribbling: 45 });
    p.styleFamiliarity.TIKI_TAKA = 10;
    p.styleFamiliarity.DIRECT = 80;
    expect(styleFit(p, 'DIRECT')).toBeGreaterThan(1.0);
    expect(styleFit(p, 'TIKI_TAKA')).toBeLessThan(0.8);
  });
});

describe('motor de partidos', () => {
  it('produce marcadores realistas (media de goles entre 2 y 3.4)', () => {
    const state = createWorld({ seed: 21, season: 2026, loadedCountries: ['ENG'] });
    const league = state.leagues[state.countries.ENG.leagueIds[0]];
    const rng = new Rng(99);
    const ref = generateReferee(rng, 'ref', COUNTRY_BY_CODE.ENG);
    let goals = 0;
    let homeWins = 0;
    const N = 250;
    const side = (club: Club): MatchSide => buildSide(state, club, rng);
    for (let i = 0; i < N; i++) {
      const h = state.clubs[league.clubIds[i % league.clubIds.length]];
      const a = state.clubs[league.clubIds[(i + 7) % league.clubIds.length]];
      const r = simulateMatch({ home: side(h), away: side(a), referee: ref, rng, importance: 0.5, neutral: false, knockout: false, crowdPressure: 0.6 });
      goals += r.homeGoals + r.awayGoals;
      if (r.homeGoals > r.awayGoals) homeWins++;
    }
    const avg = goals / N;
    expect(avg).toBeGreaterThan(2.0);
    expect(avg).toBeLessThan(3.4);
    expect(homeWins / N).toBeGreaterThan(0.3);
    expect(ref.stats.matches).toBe(N);
  });

  it('todos los presets tácticos mantienen marcadores realistas', () => {
    const state = createWorld({ seed: 31, season: 2026, loadedCountries: ['ESP'] });
    const league = state.leagues[state.countries.ESP.leagueIds[0]];
    const rng = new Rng(7);
    const ref = generateReferee(rng, 'ref', COUNTRY_BY_CODE.ESP);
    for (const style of TACTICAL_STYLES) {
      let goals = 0;
      const N = 80;
      for (let i = 0; i < N; i++) {
        const h = state.clubs[league.clubIds[i % league.clubIds.length]];
        const a = state.clubs[league.clubIds[(i + 5) % league.clubIds.length]];
        const hs = buildSide(state, h, rng);
        hs.tactic = makeTactic('t', style, style);
        const r = simulateMatch({ home: hs, away: buildSide(state, a, rng), referee: ref, rng, importance: 0.5, neutral: false, knockout: false, crowdPressure: 0.5 });
        goals += r.homeGoals + r.awayGoals;
      }
      expect(goals / N).toBeGreaterThan(1.6);
      // Un equipo forzado a un estilo ajeno a su plantilla (p. ej. juego directo en España) pierde mucho:
      // los goles totales suben por los que encaja. El umbral deja margen al ruido de N = 80.
      expect(goals / N).toBeLessThan(4.1);
    }
  });

  it('el modelo rápido (ligas lejanas) da marcadores y estadísticas plausibles', () => {
    const state = createWorld({ seed: 23, season: 2026, loadedCountries: ['ENG'] });
    const league = state.leagues[state.countries.ENG.leagueIds[1]];
    const rng = new Rng(5);
    const ref = generateReferee(rng, 'ref', COUNTRY_BY_CODE.ENG);
    let goals = 0;
    let homeWins = 0;
    let scorersOk = true;
    const N = 400;
    for (let i = 0; i < N; i++) {
      const h = state.clubs[league.clubIds[i % league.clubIds.length]];
      const a = state.clubs[league.clubIds[(i + 3) % league.clubIds.length]];
      const r = quickMatch({ home: buildSide(state, h, rng), away: buildSide(state, a, rng), referee: ref, rng, importance: 0.5, neutral: false, knockout: false, crowdPressure: 0.5 });
      goals += r.homeGoals + r.awayGoals;
      if (r.homeGoals > r.awayGoals) homeWins++;
      const scored = Object.values(r.players).reduce((s, p) => s + p.goals, 0);
      if (scored !== r.homeGoals + r.awayGoals) scorersOk = false;
    }
    expect(goals / N).toBeGreaterThan(2.1);
    expect(goals / N).toBeLessThan(3.3);
    expect(homeWins / N).toBeGreaterThan(0.33);
    expect(scorersOk).toBe(true);
  });

  it('jugar paso a paso da el mismo resultado que simular de golpe', () => {
    const state = createWorld({ seed: 4, season: 2026, loadedCountries: ['COL'] });
    const league = state.leagues[state.countries.COL.leagueIds[0]];
    const [h, a] = [state.clubs[league.clubIds[0]], state.clubs[league.clubIds[1]]];
    const make = () => {
      const rng = new Rng(1234);
      const ref = generateReferee(new Rng(5), 'r', COUNTRY_BY_CODE.COL);
      return new MatchSim({ home: buildSide(state, h, new Rng(1)), away: buildSide(state, a, new Rng(2)), referee: ref, rng, importance: 0.5, neutral: false, knockout: false, crowdPressure: 0.5 });
    };
    const s1 = make();
    let steps = 0;
    while (!s1.finished) {
      s1.step();
      steps++;
    }
    const r2 = make().runToEnd();
    expect(steps).toBeGreaterThan(90);
    expect(s1.currentScore).toEqual([r2.homeGoals, r2.awayGoals]);
  });
});

describe('cesiones y obras', () => {
  it('cede un jugador joven, reparte el salario y vuelve al final de temporada', () => {
    const state = createWorld({ seed: 8, season: 2026, loadedCountries: ['ENG'] });
    const [top, small] = [state.leagues[state.countries.ENG.leagueIds[0]], state.leagues[state.countries.ENG.leagueIds[1]]];
    const parent = state.clubs[top.clubIds[0]];
    const borrower = state.clubs[small.clubIds[5]];
    const young = clubPlayers(state, parent.id).sort((x, y) => x.age - y.age)[0];
    young.listed = 'loan';
    borrower.finances.transferBudget = 1e9;
    const n = startNegotiation(state, young.id, borrower.id, false, 'loan');
    const r = submitLoanBid(state, n.id, 0, { wageShare: 80, buyOption: null, obligatory: false });
    expect(r.decision).toBe('accept');
    expect(young.clubId).toBe(borrower.id);
    expect(young.loan?.parentClubId).toBe(parent.id);
    endLoans(state);
    expect(young.clubId).toBe(parent.id);
    expect(young.loan).toBeNull();
  });

  it('una ampliación del estadio cuesta dinero, tarda y añade asientos', () => {
    const state = createWorld({ seed: 9, season: 2026, loadedCountries: ['COL'] });
    const club = state.clubs[state.leagues[state.countries.COL.leagueIds[0]].clubIds[0]];
    club.isUser = true;
    const before = club.stadium.capacity;
    const balance = club.finances.balance;
    const p = startProject(state, club, 'stadiumExpansion');
    expect(club.finances.balance).toBeLessThan(balance);
    for (let d = 0; d < p.days; d++) progressProjects(state, club);
    expect(club.stadium.capacity).toBeGreaterThan(before);
    expect(club.projects.length).toBe(0);
  });
});

describe('bucle de juego', () => {
  it('simula una temporada completa con ascensos, FPF y regens', () => {
    const state = createWorld({ seed: 5, season: 2026, loadedCountries: ['COL'] });
    // Mundo sólo con IA: un despido del usuario (fin de partida) no debe cortar la temporada del test.
    const club = topClub(state, 'COL');
    const playersBefore = Object.keys(state.players).length;
    for (let d = 0; d < 366; d++) advanceDay(state);
    expect(state.season).toBe(2027);
    const league = state.leagues[state.countries.COL.leagueIds[0]];
    expect(league.champions.length).toBe(1);
    expect(computeTable(league).every((r) => r.played === 0)).toBe(true);
    expect(Object.keys(state.players).length).toBeGreaterThan(playersBefore);
    expect(state.clubs[club.id].finances.history.length).toBe(1);
  });

  it('el partido del usuario queda pendiente, se juega en directo con un cambio y genera rueda de prensa', () => {
    const state = createWorld({ seed: 9, season: 2026, loadedCountries: ['COL'] });
    const club = topClub(state, 'COL');
    setUserClub(state, club.id, { firstName: 'Test', lastName: 'Manager', nationality: 'COL' });
    let pending = false;
    for (let d = 0; d < 80 && !pending; d++) pending = advanceDay(state).pendingUserMatch;
    expect(pending).toBe(true);
    const live = prepareUserMatch(state);
    expect(live).not.toBeNull();
    const side = live!.ctx.fixture.homeId === club.id ? 'home' : 'away';
    for (let i = 0; i < 60; i++) live!.sim.step();
    const out = live!.sim.onPitch(side).find((x) => x.pos !== 'GK')!;
    const inn = live!.sim.benchOf(side)[0];
    expect(live!.sim.substitute(side, out.player.id, inn.id)).toBe(true);
    const stored = completeUserMatch(state, live!);
    expect(stored).not.toBeNull();
    expect(state.pendingFixtureId).toBeNull();
    expect(state.pendingPress?.questions.length).toBeGreaterThan(0);
  });
});

describe('club propio', () => {
  it('un club recién fundado en cuarta división tiene presupuesto y no se arruina en su primera temporada', () => {
    const state = createWorld({ seed: 17, season: 2026, loadedCountries: ['ENG'] });
    const league = state.leagues[state.countries.ENG.leagueIds[3]];
    const id = createCustomClub(state, new Rng(3), {
      leagueId: league.id,
      name: 'Test United',
      shortName: 'TU',
      city: 'Testford',
      colors: ['#123456', '#ffffff'],
      crest: { shape: 'shield', pattern: 'plain', primary: '#123456', secondary: '#ffffff', accent: '#ffcc00', symbol: 'star', initials: 'TU' },
      stadiumName: 'Test Park',
      ambition: 1,
    });
    setUserClub(state, id, { firstName: 'A', lastName: 'B', nationality: 'ENG' });
    const club = state.clubs[id];
    expect(club.finances.transferBudget).toBeGreaterThan(0);
    const start = club.finances.balance;
    for (let d = 0; d < 330; d++) advanceDay(state, true);
    expect(club.finances.balance).toBeGreaterThan(-Math.max(1e6, start));
  });
});

describe('equilibrio financiero', () => {
  it('la masa salarial ronda entre el 30% y el 80% de los ingresos en España y Colombia', () => {
    const state = createWorld({ seed: 13, season: 2026, loadedCountries: ['ESP', 'COL'] });
    for (const code of ['ESP', 'COL']) {
      const league = state.leagues[state.countries[code].leagueIds[0]];
      let ratioSum = 0;
      for (const id of league.clubIds) {
        const c = state.clubs[id];
        const wages = clubPlayers(state, id).reduce((s, p) => s + (p.contract?.wage ?? 0), 0) * 52;
        ratioSum += wages / estimateSeasonRevenue(c, COUNTRY_BY_CODE[code], 1, league.clubIds.length - 1);
      }
      const ratio = ratioSum / league.clubIds.length;
      expect(ratio).toBeGreaterThan(0.3);
      expect(ratio).toBeLessThan(0.8);
    }
  });
});
