import { describe, expect, it } from 'vitest';
import { CALENDAR, clubPlayers, createWorld, fundingOptions, generateOffersForListed, Rng, setUserClub, suggestSales, transferOutlook, type GameState } from '../src';

function setup(seed = 29): { g: GameState; clubId: string } {
  const g = createWorld({ seed, season: 2026, loadedCountries: ['ENG'] });
  const club = Object.values(g.clubs).find((c) => c.countryCode === 'ENG' && !c.isUser)!;
  setUserClub(g, club.id, { firstName: 'QA', lastName: 'Bot', nationality: 'ENG' });
  return { g, clubId: club.id };
}

describe('panorama del presupuesto', () => {
  it('available = presupuesto − reservado y las ventas previstas son el 80% de lo puesto en venta', () => {
    const { g, clubId } = setup();
    const squad = clubPlayers(g, clubId).filter((p) => p.squadStatus !== 'key' && !p.academy);
    squad[0].listed = 'transfer';
    const o = transferOutlook(g, clubId);
    expect(o.available).toBe(Math.max(0, o.budget - o.reserved));
    expect(o.listedValue).toBeGreaterThan(0);
    expect(o.expectedSales).toBe(Math.round(o.listedValue * 0.8));
  });

  it('suggestSales cubre lo que falta sin tocar a los jugadores clave', () => {
    const { g, clubId } = setup();
    const needed = 5_000_000;
    const { picks, covered } = suggestSales(g, clubId, needed);
    expect(picks.length).toBeGreaterThan(0);
    expect(picks.every((s) => s.player.squadStatus !== 'key')).toBe(true);
    if (picks.length < 4) expect(covered).toBeGreaterThanOrEqual(needed);
  });

  it('fundingOptions calcula el déficit de una oferta mayor que el presupuesto', () => {
    const { g, clubId } = setup();
    const o = transferOutlook(g, clubId);
    const f = fundingOptions(g, clubId, o.available + 3_000_000);
    expect(f.shortfall).toBe(3_000_000);
    expect(fundingOptions(g, clubId, 0).shortfall).toBe(0);
  });
});

describe('ofertas por jugadores en venta', () => {
  const run = () => {
    const { g, clubId } = setup();
    g.day = CALENDAR.summerWindow[0] + 2;
    const squad = clubPlayers(g, clubId).filter((p) => !p.academy).sort((a, b) => b.value - a.value);
    const star = squad[Math.floor(squad.length / 2)];
    star.listed = 'transfer';
    let total = 0;
    for (let i = 0; i < 12; i++) total += generateOffersForListed(g, new Rng(100 + i));
    const bids = Object.values(g.negotiations).filter((n) => n.incoming && n.playerId === star.id && n.stage === 'club');
    return { total, bids: bids.map((n) => `${n.buyerClubId}:${n.bid?.fee}`) };
  };

  it('llegan ofertas, con tope por jugador, y son deterministas', () => {
    const a = run();
    expect(a.total).toBeGreaterThan(0);
    expect(a.bids.length).toBeLessThanOrEqual(2);
    expect(run()).toEqual(a);
  });

  it('con el mercado cerrado no llega ninguna', () => {
    const { g, clubId } = setup();
    g.day = CALENDAR.summerWindow[1] + 40;
    clubPlayers(g, clubId)[0].listed = 'transfer';
    expect(generateOffersForListed(g, new Rng(5))).toBe(0);
  });
});
