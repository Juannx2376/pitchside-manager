import { describe, expect, it } from 'vitest';
import { BUDGET_FLOOR, BUDGET_REVENUE_CAP, OWNER_BAILOUT, COUNTRY_BY_CODE, clubPlayers, createWorld, estimateSeasonRevenue, setSeasonBudgets } from '../src';

function world() {
  const state = createWorld({ seed: 11, season: 2026, loadedCountries: ['COL'], bundle: null });
  const league = state.leagues[state.countries.COL.leagueIds[0]];
  const club = state.clubs[league.clubIds[1]];
  return { state, league, club };
}

describe('economía de temporada', () => {
  it('el presupuesto de fichajes nunca supera una fracción de los ingresos aunque la caja sea enorme', () => {
    const { state, league, club } = world();
    club.finances.balance = 5e10;
    club.finances.transferBudget = 5e10;
    setSeasonBudgets(club, clubPlayers(state, club.id), league.tier, league.clubIds.length - 1);
    const revenue = estimateSeasonRevenue(club, COUNTRY_BY_CODE.COL, league.tier, league.clubIds.length - 1);
    // `roundMoney` redondea a pasos de 100 000.
    expect(club.finances.transferBudget).toBeLessThanOrEqual(revenue * BUDGET_REVENUE_CAP + 100_000);
  });

  it('un club con la caja en positivo conserva un mínimo de presupuesto', () => {
    const { state, league, club } = world();
    club.finances.balance = 1e6;
    club.finances.transferBudget = 0;
    setSeasonBudgets(club, clubPlayers(state, club.id), league.tier, league.clubIds.length - 1);
    const revenue = estimateSeasonRevenue(club, COUNTRY_BY_CODE.COL, league.tier, league.clubIds.length - 1);
    expect(club.finances.transferBudget).toBeGreaterThanOrEqual(revenue * BUDGET_FLOOR - 100_000);
  });

  it('el propietario rescata a un club de la IA con la caja en negativo, pero no al del usuario', () => {
    const { state, league, club } = world();
    club.finances.balance = -4e6;
    setSeasonBudgets(club, clubPlayers(state, club.id), league.tier, league.clubIds.length - 1);
    const revenue = estimateSeasonRevenue(club, COUNTRY_BY_CODE.COL, league.tier, league.clubIds.length - 1);
    expect(club.finances.balance).toBe(Math.round(revenue * OWNER_BAILOUT));

    club.isUser = true;
    club.finances.balance = -4e6;
    setSeasonBudgets(club, clubPlayers(state, club.id), league.tier, league.clubIds.length - 1);
    expect(club.finances.balance).toBe(-4e6);
  });

  it('es determinista: el mismo mundo da los mismos presupuestos', () => {
    const a = world();
    const b = world();
    setSeasonBudgets(a.club, clubPlayers(a.state, a.club.id), a.league.tier, a.league.clubIds.length - 1);
    setSeasonBudgets(b.club, clubPlayers(b.state, b.club.id), b.league.tier, b.league.clubIds.length - 1);
    expect(a.club.finances.transferBudget).toBe(b.club.finances.transferBudget);
    expect(a.club.finances.wageBudget).toBe(b.club.finances.wageBudget);
  });
});
