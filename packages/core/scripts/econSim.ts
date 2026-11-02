// Simulación económica headless: `npm run econ -w @pitchside/core -- --seasons 8 --countries ESP,COL,ENG --seed 7`
// Imprime por tier la mediana / p10 / p90 de presupuesto de fichajes, caja, ingresos y plantilla en cada temporada.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { advanceDay, autoAnswerPress, clubPlayers, createWorld, importAuto, overall, setUserClub, type GameState } from '../src';

function arg(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const seasons = Number(arg('seasons', '8'));
const countries = arg('countries', 'ESP,COL,ENG').split(',').map((s) => s.trim().toUpperCase());
const seed = Number(arg('seed', '7'));
const useDb = arg('db', 'auto');
const defaultDb = join(process.cwd(), '..', '..', 'apps', 'web', 'public', 'data', 'world-db.json');
const importFile = useDb === 'no' ? '' : existsSync(defaultDb) ? defaultDb : '';
const bundle = importFile ? importAuto(importFile, readFileSync(importFile, 'utf8')) : null;

const state: GameState = createWorld({ seed, season: 2026, loadedCountries: countries, bundle });
const first = state.leagues[state.countries[countries[0]].leagueIds[0]];
setUserClub(state, first.clubIds[0], { firstName: 'Sim', lastName: 'Bot', nationality: countries[0] });

const q = (xs: number[], p: number): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
const m = (n: number): string => (n / 1e6).toFixed(1).padStart(7);

interface Row { season: number; tier: number; budget: number[]; balance: number[]; revenue: number[]; wages: number[]; ovr: number[]; zero: number; negative: number; embargo: number; ratio: number[]; n: number }
const rows: Row[] = [];
const ageOvr: Record<string, number[]> = {};

function snapshot(label: number): void {
  const byTier: Record<number, Row> = {};
  for (const code of countries) {
    for (const lid of state.countries[code].leagueIds) {
      const l = state.leagues[lid];
      const r = (byTier[l.tier] ??= { season: label, tier: l.tier, budget: [], balance: [], revenue: [], wages: [], ovr: [], zero: 0, negative: 0, embargo: 0, ratio: [], n: 0 });
      for (const cid of l.clubIds) {
        const c = state.clubs[cid];
        const h = c.finances.history[c.finances.history.length - 1];
        const pl = clubPlayers(state, cid);
        r.budget.push(c.finances.transferBudget);
        r.balance.push(c.finances.balance);
        r.revenue.push(h?.revenue ?? 0);
        r.wages.push(h?.wageBill ?? 0);
        r.ovr.push(pl.length ? pl.reduce((s, p) => s + overall(p), 0) / pl.length : 0);
        if (c.finances.transferBudget < 1e4) r.zero++;
        if (c.finances.fpf.transferEmbargo) r.embargo++;
        r.ratio.push(h && h.revenue > 0 ? h.wageBill / h.revenue : 0);
        if (c.finances.balance < 0) r.negative++;
        r.n++;
        for (const p of pl) (ageOvr[`${Math.min(36, Math.max(17, p.age))}`] ??= []).push(overall(p));
      }
    }
  }
  for (const t of Object.keys(byTier).map(Number).sort()) rows.push(byTier[t]);
}

snapshot(state.season);
for (let s = 0; s < seasons; s++) {
  const start = state.season;
  while (state.season === start && !state.gameOver) {
    advanceDay(state, true);
    if (state.pendingPress) autoAnswerPress(state, state.pendingPress);
  }
  snapshot(state.season);
}

console.log(`econSim · semilla ${seed} · ${countries.join(',')} · ${importFile ? 'DB real' : 'mundo generado'} · ${seasons} temporadas (cifras en M€)`);
console.log('temp  tier |  ppto p10  med  p90 | caja p10  med  p90 | ingr med | salarios med | ovr med | ppto≈0  caja<0 | embargo | sal/ingr');
for (const r of rows) {
  console.log(
    `${r.season}  T${r.tier}   |${m(q(r.budget, 0.1))}${m(q(r.budget, 0.5))}${m(q(r.budget, 0.9))} |${m(q(r.balance, 0.1))}${m(q(r.balance, 0.5))}${m(q(r.balance, 0.9))} |${m(q(r.revenue, 0.5))} |${m(q(r.wages, 0.5))}     | ${q(r.ovr, 0.5).toFixed(1)} | ${String(r.zero).padStart(3)}/${r.n}  ${String(r.negative).padStart(3)}/${r.n}   ${String(r.embargo).padStart(3)}/${r.n}  ${q(r.ratio, 0.5).toFixed(2)}`,
  );
}
console.log('\nMedia de overall por edad (final):');
console.log(Object.keys(ageOvr).sort((a, b) => Number(a) - Number(b)).map((a) => `${a}:${q(ageOvr[a], 0.5).toFixed(0)}`).join('  '));
