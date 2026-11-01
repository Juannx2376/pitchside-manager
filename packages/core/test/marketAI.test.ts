// Fase 6: IA de mercado (necesidades V2, renovaciones preventivas, venta de descontentos,
// día de pánico), adaptabilidad del mánager y poda de fin de mes para acotar el guardado.
import { describe, expect, it } from 'vitest';
import {
  AI_SQUAD_SOFT_CAP,
  CALENDAR,
  COUNTRY_BY_CODE,
  DEADLINE_PANIC_DISCOUNT,
  NEWS_MAX,
  Rng,
  advanceDay,
  aiAdaptFormation,
  aiListSurplus,
  aiRenewContracts,
  askingPrice,
  clubPlayers,
  createWorld,
  evaluateClubBid,
  generatePlayer,
  makeTactic,
  msg,
  newId,
  pruneNegotiations,
  pruneNews,
  slotPositions,
  startNegotiation,
  weakestSlots,
  type NewsItem,
} from '../src';

function firstLeagueClubs(state: ReturnType<typeof createWorld>, howMany = 2) {
  const league = state.leagues[state.countries.ENG.leagueIds[0]];
  return league.clubIds.slice(0, howMany).map((id) => state.clubs[id]);
}

describe('necesidades de mercado V2', () => {
  it('weakestSlots devuelve los peores huecos de la rejilla, ordenados de peor a mejor', () => {
    const state = createWorld({ seed: 3, season: 2026, loadedCountries: ['ENG'] });
    const [club] = firstLeagueClubs(state);
    const players = clubPlayers(state, club.id).filter((p) => !p.academy);
    const needs = weakestSlots(club, players);
    expect(needs.length).toBeGreaterThan(0);
    expect(needs.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < needs.length; i++) expect(needs[i].level).toBeGreaterThanOrEqual(needs[i - 1].level);
    // Sólo propone posiciones que la formación realmente pide.
    const demanded = new Set(slotPositions(club.tactic.tactic));
    for (const n of needs) expect(demanded.has(n.pos)).toBe(true);
  });
});

describe('venta de descontentos y excedentes', () => {
  it('lista a los excedentes por encima del cupo y a los futbolistas descontentos', () => {
    const state = createWorld({ seed: 5, season: 2026, loadedCountries: ['ENG'] });
    const [club, other] = firstLeagueClubs(state);
    // Infla la plantilla por encima del cupo blando.
    let i = 0;
    while (clubPlayers(state, club.id).filter((p) => !p.academy).length <= AI_SQUAD_SOFT_CAP) {
      const p = generatePlayer(new Rng(500 + i), { id: newId(state, 'p'), country: COUNTRY_BY_CODE.ENG, position: 'CM', quality: 45, age: 24, season: state.season });
      p.clubId = club.id;
      p.contract = { wage: 1000, signedSeason: state.season, expiresSeason: state.season + 2, releaseClause: null, goalBonus: 0, cleanSheetBonus: 0, signingBonus: 0 };
      state.players[p.id] = p;
      club.playerIds.push(p.id);
      i++;
    }
    const total = clubPlayers(state, club.id).filter((p) => !p.academy && !p.loan).length;
    aiListSurplus(state, club);
    const listed = clubPlayers(state, club.id).filter((p) => p.listed === 'transfer').length;
    expect(listed).toBeGreaterThanOrEqual(total - AI_SQUAD_SOFT_CAP);

    // Un descontento se lista aunque no haya excedente de plantilla.
    const sad = clubPlayers(state, other.id).filter((p) => !p.academy)[0];
    sad.happiness = 10;
    sad.wantsToLeave = true;
    aiListSurplus(state, other);
    expect(sad.listed).toBe('transfer');
  });
});

describe('renovaciones preventivas', () => {
  it('extiende el contrato de un jugador clave que entra en su último año', () => {
    const state = createWorld({ seed: 8, season: 2026, loadedCountries: ['ENG'] });
    const [club] = firstLeagueClubs(state);
    club.finances.wageBudget = 1e9;
    const star = clubPlayers(state, club.id).filter((p) => !p.loan && p.contract)[0];
    star.squadStatus = 'key';
    star.age = 26;
    star.hidden.ambition = 30;
    star.contract!.expiresSeason = state.season;
    const wageBefore = star.contract!.wage;
    const rng = new Rng(1);
    let renewed = 0;
    for (let i = 0; i < 60 && star.contract!.expiresSeason <= state.season; i++) renewed += aiRenewContracts(state, club, rng);
    expect(renewed).toBeGreaterThan(0);
    expect(star.contract!.expiresSeason).toBeGreaterThan(state.season);
    expect(star.contract!.wage).toBeGreaterThanOrEqual(wageBefore);
  });
});

describe('día de pánico', () => {
  it('la IA rebaja un 15% sus exigencias en las últimas 24 h del mercado', () => {
    const state = createWorld({ seed: 11, season: 2026, loadedCountries: ['ENG'] });
    const [seller] = firstLeagueClubs(state);
    const p = clubPlayers(state, seller.id).find((x) => x.contract && !x.loan && !x.injury)!;
    p.contract!.releaseClause = null;
    state.day = CALENDAR.summerWindow[0];
    const ask = askingPrice(state, p);
    const bid = { fee: Math.round(ask * 0.9), sellOnPercent: 0 };
    const normal = evaluateClubBid(state, p, bid);
    state.day = CALENDAR.summerWindow[1];
    const panic = evaluateClubBid(state, p, bid);
    expect(DEADLINE_PANIC_DISCOUNT).toBe(0.85);
    expect(normal.decision).not.toBe('accept');
    expect(panic.decision).toBe('accept');
  });
});

describe('adaptabilidad del mánager IA', () => {
  it('cambia su dibujo preferido si la plantilla no tiene naturales para la formación actual', () => {
    const state = createWorld({ seed: 13, season: 2026, loadedCountries: ['ENG'] });
    const [club] = firstLeagueClubs(state);
    const manager = state.managers[club.managerId!];
    manager.adaptability = 80;
    manager.preferredFormation = '4-3-3';
    club.tactic.tactic = makeTactic('t', '4-3-3', 'BALANCED', '4-3-3');
    // Todos los jugadores de campo son centrales: no hay laterales, extremos ni delanteros.
    for (const p of clubPlayers(state, club.id)) {
      if (p.academy || p.position === 'GK') continue;
      p.position = 'CB';
      p.secondaryPositions = [];
    }
    const changed = aiAdaptFormation(state, club.id);
    expect(changed).toBe(true);
    expect(manager.preferredFormation).not.toBe('4-3-3');
    expect(club.tactic.tactic.formation).not.toBe('4-3-3');
  });

  it('no cambia de dibujo si el mánager es rígido', () => {
    const state = createWorld({ seed: 13, season: 2026, loadedCountries: ['ENG'] });
    const [club] = firstLeagueClubs(state);
    state.managers[club.managerId!].adaptability = 10;
    for (const p of clubPlayers(state, club.id)) {
      if (p.academy || p.position === 'GK') continue;
      p.position = 'ST';
      p.secondaryPositions = [];
    }
    expect(aiAdaptFormation(state, club.id)).toBe(false);
  });
});

describe('cierre de sistemas (tamaño del guardado)', () => {
  it('la poda de fin de mes elimina noticias obsoletas y conserva las importantes', () => {
    const state = createWorld({ seed: 17, season: 2026, loadedCountries: ['ENG'] });
    state.day = 200;
    state.news = [];
    const mk = (season: number, day: number, importance: 1 | 2 | 3): NewsItem => ({
      id: newId(state, 'n'),
      season,
      day,
      category: 'general',
      title: msg('news.deadline.t'),
      body: msg('news.deadline.b'),
      clubIds: [],
      importance,
      read: false,
    });
    state.news.push(mk(2026, 190, 1)); // reciente → se queda
    state.news.push(mk(2024, 10, 1)); // obsoleta y menor → se va
    state.news.push(mk(2024, 10, 3)); // obsoleta pero importante → se queda
    const removed = pruneNews(state);
    expect(removed).toBe(1);
    expect(state.news).toHaveLength(2);
    expect(state.news.some((n) => n.season === 2024 && n.importance === 1)).toBe(false);
  });

  it('la poda elimina negociaciones caídas antiguas', () => {
    const state = createWorld({ seed: 19, season: 2026, loadedCountries: ['ENG'] });
    state.day = 100;
    const [buyer, seller] = firstLeagueClubs(state);
    const p = clubPlayers(state, seller.id).find((x) => x.contract && !x.loan)!;
    const n = startNegotiation(state, p.id, buyer.id);
    n.stage = 'collapsed';
    n.season = state.season;
    n.day = state.day - 30;
    const removed = pruneNegotiations(state);
    expect(removed).toBe(1);
    expect(state.negotiations[n.id]).toBeUndefined();
  });

  it('una temporada completa mantiene acotado el archivo de noticias', () => {
    const state = createWorld({ seed: 23, season: 2026, loadedCountries: ['ENG'] });
    for (let d = 0; d < 366; d++) advanceDay(state);
    expect(state.season).toBe(2027);
    expect(state.news.length).toBeLessThanOrEqual(NEWS_MAX);
  });
});
