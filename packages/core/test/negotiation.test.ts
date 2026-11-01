import { describe, expect, it } from 'vitest';
import { Rng, addSwapToOffer, clubPlayers, counterIncomingBid, createWorld, exerciseBuyBack, playerValue, setUserClub, startNegotiation, type GameState, type Negotiation } from '../src';

function setup(seed = 31): { g: GameState; userId: string; buyerId: string } {
  const g = createWorld({ seed, season: 2026, loadedCountries: ['ENG'] });
  const clubs = Object.values(g.clubs).filter((c) => c.countryCode === 'ENG');
  setUserClub(g, clubs[0].id, { firstName: 'QA', lastName: 'Bot', nationality: 'ENG' });
  return { g, userId: clubs[0].id, buyerId: clubs[1].id };
}

function incoming(g: GameState, userId: string, buyerId: string, feeFactor = 1): { n: Negotiation; pid: string } {
  const p = clubPlayers(g, userId).filter((q) => !q.academy && q.squadStatus !== 'key')[0];
  g.clubs[buyerId].finances.transferBudget = 5e9;
  const n = startNegotiation(g, p.id, buyerId, true);
  n.bid = { fee: Math.round(playerValue(g, p) * feeFactor), sellOnPercent: 0 };
  return { n, pid: p.id };
}

describe('precio de los jugadores', () => {
  it('al crear el mundo ningún jugador con club tiene valor 0', () => {
    const { g } = setup();
    const zero = Object.values(g.players).filter((p) => p.clubId && !p.retired && p.value <= 0);
    expect(zero).toHaveLength(0);
  });
});

describe('negociar una oferta entrante', () => {
  it('un precio razonable se acepta y el jugador se va', () => {
    const { g, userId, buyerId } = setup();
    const { n, pid } = incoming(g, userId, buyerId);
    const value = playerValue(g, g.players[pid]);
    n.bid = { fee: Math.round(value * 0.5), sellOnPercent: 0 };
    const r = counterIncomingBid(g, n.id, { fee: Math.round(value * 0.6) }, new Rng(7));
    expect(r.decision).toBe('accept');
  });

  it('un precio disparatado hace que el club se retire', () => {
    const { g, userId, buyerId } = setup();
    const { n, pid } = incoming(g, userId, buyerId);
    const value = playerValue(g, g.players[pid]);
    const r = counterIncomingBid(g, n.id, { fee: Math.round(value * 3) }, new Rng(7));
    expect(r.decision).toBe('reject');
    expect(g.negotiations[n.id].stage).toBe('collapsed');
  });

  it('con la cláusula de recompra el vendedor puede recuperar al jugador', () => {
    const { g, userId, buyerId } = setup();
    const { n, pid } = incoming(g, userId, buyerId);
    const value = playerValue(g, g.players[pid]);
    const r = counterIncomingBid(g, n.id, { fee: Math.round(value * 0.5), buyBack: Math.round(value * 1.5) }, new Rng(9));
    expect(r.decision).toBe('accept');
    const p = g.players[pid];
    if (p.clubId === buyerId) {
      expect(p.buyBack?.fee).toBe(Math.round(value * 1.5));
      g.clubs[userId].finances.transferBudget = 5e9;
      g.clubs[userId].finances.wageBudget = 1e12;
      const back = exerciseBuyBack(g, pid);
      expect(back.ok).toBe(true);
      expect(g.players[pid].clubId).toBe(userId);
      expect(g.players[pid].buyBack).toBeUndefined();
    }
  });

  it('la IA puede incluir un jugador suyo en el intercambio', () => {
    let found = false;
    for (let seed = 1; seed <= 40 && !found; seed++) {
      const { g, userId, buyerId } = setup(31);
      const { n, pid } = incoming(g, userId, buyerId, 2);
      addSwapToOffer(g, n, new Rng(seed));
      const swap = n.bid?.playersOffered?.[0];
      if (swap) {
        found = true;
        expect(g.players[swap].clubId).toBe(buyerId);
        expect(n.bid!.fee).toBeLessThan(playerValue(g, g.players[pid]) * 2);
      }
    }
    expect(found).toBe(true);
  });
});
