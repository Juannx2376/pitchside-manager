import { describe, expect, it } from 'vitest';
import { SALE_REINVEST, clubPlayers, createWorld, creditSale, leagueOf, setSeasonBudgets, setUserClub } from '../src';

function setup() {
  const g = createWorld({ seed: 23, season: 2026, loadedCountries: ['ENG'] });
  const club = Object.values(g.clubs).find((c) => c.countryCode === 'ENG' && !c.isUser)!;
  setUserClub(g, club.id, { firstName: 'QA', lastName: 'Bot', nationality: 'ENG' });
  return { g, club };
}

describe('presupuesto de fichajes', () => {
  it('una venta devuelve el 80% al presupuesto de fichajes', () => {
    const { club } = setup();
    const before = club.finances.transferBudget;
    creditSale(club, 10_000_000);
    expect(club.finances.transferBudget - before).toBe(Math.round(10_000_000 * SALE_REINVEST));
  });

  it('al empezar la temporada lo que sobró se arrastra en parte (nunca baja del cálculo base)', () => {
    const { g, club } = setup();
    const lg = leagueOf(g, club.id)!;
    const players = clubPlayers(g, club.id);
    club.finances.transferBudget = 0;
    setSeasonBudgets(club, players, lg.tier, lg.clubIds.length - 1);
    const base = club.finances.transferBudget;
    club.finances.balance = 400_000_000;
    club.finances.transferBudget = 50_000_000;
    setSeasonBudgets(club, players, lg.tier, lg.clubIds.length - 1);
    expect(club.finances.transferBudget).toBeGreaterThanOrEqual(base);
  });
});
