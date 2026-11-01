// Mide el coste por día de simulación con la base de datos real: `npx tsx scripts/profileDays.ts 90`
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { advanceDay, autoAnswerPress, createWorld, importAuto, setUserClub } from '../src';

const days = Number(process.argv[2] ?? 90);
const db = join(process.cwd(), '..', '..', 'apps', 'web', 'public', 'data', 'world-db.json');
const bundle = existsSync(db) ? importAuto(db, readFileSync(db, 'utf8')) : null;
const state = createWorld({ seed: 42, season: 2026, loadedCountries: [], bundle });
const league = state.leagues[state.countries.ESP.leagueIds[0]];
setUserClub(state, league.clubIds[0], { firstName: 'P', lastName: 'Rof', nationality: 'ESP' });
const detail = Object.values(state.leagues).filter((l) => l.tier === 1 && l.reputation >= 70);
console.log(`Ligas a todo detalle: ${detail.length} · ${detail.map((l) => `${l.countryCode}:${l.reputation}`).join(' ')}`);
const t0 = performance.now();
const slow: [number, number][] = [];
for (let d = 0; d < days; d++) {
  const t = performance.now();
  advanceDay(state, true);
  if (state.pendingPress) autoAnswerPress(state, state.pendingPress);
  slow.push([state.day - 1, performance.now() - t]);
}
const total = performance.now() - t0;
console.log(`${days} días: ${Math.round(total)} ms · ${Math.round(total / days)} ms/día`);
console.log('Días más lentos:', slow.sort((a, b) => b[1] - a[1]).slice(0, 8).map(([d, ms]) => `d${d}=${Math.round(ms)}ms`).join(' '));
