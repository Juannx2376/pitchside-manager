// Resumen de un CSV SoFIFA: ligas, nº de clubes y jugadores por liga.
// Uso: npx tsx scripts/inspectCsv.ts <ruta.csv>
import { readFileSync } from 'node:fs';
import { parseCSV } from '../src';

const rows = parseCSV(readFileSync(process.argv[2], 'utf8'));
const h = rows[0];
const li = h.indexOf('league_name');
const lv = h.indexOf('league_level');
const ci = h.indexOf('club_name');
const ni = h.indexOf('nationality_name');
const leagues = new Map<string, { clubs: Set<string>; players: number; level: string }>();
const nats = new Set<string>();
for (const r of rows.slice(1)) {
  const k = r[li] || '(sin liga)';
  const e = leagues.get(k) ?? { clubs: new Set(), players: 0, level: r[lv] };
  e.clubs.add(r[ci]);
  e.players++;
  leagues.set(k, e);
  nats.add(r[ni]);
}
console.log(`Jugadores: ${rows.length - 1} · Ligas: ${leagues.size} · Nacionalidades: ${nats.size}`);
for (const [k, v] of [...leagues].sort((a, b) => b[1].players - a[1].players)) console.log(`${k} | nivel ${v.level} | ${v.clubs.size} clubes | ${v.players} jug.`);
console.log([...nats].sort().join(' | '));
