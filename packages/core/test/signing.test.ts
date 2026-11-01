import { describe, expect, it } from 'vitest';
import {
  MAX_PLAYERS_IN_DEAL,
  askingPrice,
  clubPlayers,
  createWorld,
  evaluateClubBid,
  firstTeam,
  offeredPlayersValue,
  overall,
  playerExpectations,
  setUserClub,
  signingOutcome,
  signingVerdict,
  startNegotiation,
  submitBid,
  submitContract,
  tradeablePlayers,
  type GameState,
} from '../src';

function setup(seed = 61): { g: GameState; me: string; other: string } {
  const g = createWorld({ seed, season: 2026, loadedCountries: ['ENG'] });
  const clubs = Object.values(g.clubs);
  const me = clubs[0];
  const other = clubs[5];
  setUserClub(g, me.id, { firstName: 'Fich', lastName: 'Aje', nationality: 'ENG' });
  me.finances.transferBudget = 5e9;
  me.finances.wageBudget = 1e10;
  return { g, me: me.id, other: other.id };
}

describe('fichajes con jugadores incluidos', () => {
  it('incluir jugadores baja el efectivo necesario y respeta el máximo', () => {
    const { g, me, other } = setup();
    const target = firstTeam(g, other).sort((a, b) => overall(b) - overall(a))[0];
    const ask = askingPrice(g, target);
    const offered = tradeablePlayers(g, me).slice(0, MAX_PLAYERS_IN_DEAL + 2).map((p) => p.id);
    const swap = offeredPlayersValue(g, { fee: 0, sellOnPercent: 0, playersOffered: offered }, me);
    expect(swap).toBeGreaterThan(0);
    // Con sólo la mitad del precio en efectivo + jugadores se mejora la respuesta frente a sólo efectivo.
    const cashOnly = evaluateClubBid(g, target, { fee: Math.round(ask * 0.4), sellOnPercent: 0 }, me);
    const mixed = evaluateClubBid(g, target, { fee: Math.round(ask * 0.4), sellOnPercent: 0, playersOffered: offered }, me);
    const rank = { reject: 0, counter: 1, accept: 2 } as const;
    expect(rank[mixed.decision]).toBeGreaterThanOrEqual(rank[cashOnly.decision]);
    // Jugadores que no son del comprador no cuentan.
    const foreign = firstTeam(g, other).slice(0, 2).map((p) => p.id);
    expect(offeredPlayersValue(g, { fee: 0, sellOnPercent: 0, playersOffered: foreign }, me)).toBe(0);
  });

  it('al cerrar el traspaso los jugadores incluidos pasan al club vendedor', () => {
    const { g, me, other } = setup(62);
    const target = firstTeam(g, other).sort((a, b) => overall(b) - overall(a))[0];
    const give = tradeablePlayers(g, me)
      .filter((p) => p.id !== target.id)
      .slice(0, 2)
      .map((p) => p.id);
    const n = startNegotiation(g, target.id, me);
    const ask = askingPrice(g, target);
    const bid = { fee: Math.round(ask * 1.2), sellOnPercent: 0, playersOffered: give };
    expect(submitBid(g, n.id, bid).decision).toBe('accept');
    const ex = playerExpectations(g, target, g.clubs[me]);
    const res = submitContract(g, n.id, { wage: Math.round(ex.idealWage * 3), years: ex.years, releaseClause: null, goalBonus: 0, cleanSheetBonus: 0, signingBonus: 0, agentFee: ex.agentFee * 2 });
    expect(res.decision).toBe('accept');
    expect(g.players[target.id].clubId).toBe(me);
    for (const id of give) {
      expect(g.players[id].clubId).toBe(other);
      expect(clubPlayers(g, me).some((p) => p.id === id)).toBe(false);
      expect(clubPlayers(g, other).some((p) => p.id === id)).toBe(true);
    }
  });
});

describe('veredicto de fichaje', () => {
  it('está acotado, es determinista y premia a un crack barato sobre un suplente caro', () => {
    const { g, me, other } = setup(63);
    const pool = firstTeam(g, other).sort((a, b) => overall(b) - overall(a));
    const star = pool[0];
    const scrub = pool[pool.length - 1];
    const v1 = signingVerdict(g, star.id, me, { fee: 0 });
    const v2 = signingVerdict(g, star.id, me, { fee: 0 });
    expect(v1).toEqual(v2);
    for (const v of [v1, signingVerdict(g, scrub.id, me, { fee: 1e9 })]) {
      expect(v.score).toBeGreaterThanOrEqual(0);
      expect(v.score).toBeLessThanOrEqual(100);
      expect(v.stars).toBeGreaterThanOrEqual(1);
      expect(v.stars).toBeLessThanOrEqual(5);
    }
    expect(v1.score).toBeGreaterThan(signingVerdict(g, scrub.id, me, { fee: 1e9 }).score);
  });

  it('el resultado real necesita muestra y mejora con la nota', () => {
    const { g, other } = setup(64);
    const p = firstTeam(g, other)[0];
    p.stats.apps = 1;
    expect(signingOutcome(p).score).toBeNull();
    p.stats.apps = 10;
    p.stats.ratingSum = 10 * 6.0;
    const low = signingOutcome(p).score as number;
    p.stats.ratingSum = 10 * 7.6;
    const high = signingOutcome(p).score as number;
    expect(high).toBeGreaterThan(low);
  });
});
