// Diagnóstico de calibración económica: ratio masa salarial / ingresos por liga.
// Uso: npx tsx scripts/calibrate.ts ESP,COL,ENG
import { COUNTRY_BY_CODE, clubPlayers, createWorld, estimateSeasonRevenue, formatMoney } from '../src';

const codes = (process.argv[2] ?? 'ESP,COL,ENG,BRA,JAM').split(',');
const state = createWorld({ seed: 13, season: 2026, loadedCountries: codes });
for (const code of codes) {
  for (const lid of state.countries[code].leagueIds) {
    const league = state.leagues[lid];
    const rows = league.clubIds.map((id) => {
      const c = state.clubs[id];
      const wages = clubPlayers(state, id).reduce((s, p) => s + (p.contract?.wage ?? 0), 0) * 52;
      const rev = estimateSeasonRevenue(c, COUNTRY_BY_CODE[code], league.tier, league.clubIds.length - 1);
      return { name: c.name, rep: c.reputation, wages, rev, ratio: wages / rev };
    });
    rows.sort((a, b) => b.rep - a.rep);
    const avg = rows.reduce((s, r) => s + r.ratio, 0) / rows.length;
    const top = rows[0];
    const bottom = rows[rows.length - 1];
    console.log(
      `${code} T${league.tier} ${league.name}: ratio medio ${(avg * 100).toFixed(0)}% · top ${top.name} ${formatMoney(top.rev)} (${(top.ratio * 100).toFixed(0)}%) · último ${formatMoney(bottom.rev)} (${(bottom.ratio * 100).toFixed(0)}%)`,
    );
  }
}
