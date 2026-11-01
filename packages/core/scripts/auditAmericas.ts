// Auditoría de divisiones y plantillas de América: `npx tsx scripts/auditAmericas.ts [PAÍS ...]`
// Carga el mundo con la base de datos real y lista, por país y categoría, tamaño, clubes con plantilla
// real, tamaño de plantilla mínimo, duplicados y nacionalidades. Termina con código 1 si hay problemas.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AMERICAS_DIVISIONS, clubPlayers, createWorld, displayName, importAuto } from '../src';

const db = join(process.cwd(), '..', '..', 'apps', 'web', 'public', 'data', 'world-db.json');
if (!existsSync(db)) {
  console.error('No se encuentra world-db.json');
  process.exit(2);
}
const bundle = importAuto(db, readFileSync(db, 'utf8'));
const only = process.argv.slice(2).map((s) => s.toUpperCase());
const countries = [...new Set(AMERICAS_DIVISIONS.map((d) => d.country))].filter((c) => !only.length || only.includes(c));
const state = createWorld({ seed: 7, season: 2026, loadedCountries: countries, bundle });

let problems = 0;
const bad = (msg: string): void => {
  problems++;
  console.log(`   ✗ ${msg}`);
};
const seenGlobal = new Map<string, string>();
for (const code of countries) {
  console.log(`\n== ${code}`);
  for (const lid of state.countries[code].leagueIds) {
    const l = state.leagues[lid];
    const def = AMERICAS_DIVISIONS.find((d) => d.country === code && d.tier === l.tier);
    const clubs = l.clubIds.map((id) => state.clubs[id]);
    const real = clubs.filter((c) => c.source === 'real').length;
    const withReal = clubs.filter((c) => clubPlayers(state, c.id).some((p) => p.source === 'real')).length;
    const withCurated = clubs.filter((c) => clubPlayers(state, c.id).some((p) => p.source === 'curated')).length;
    const sizes = clubs.map((c) => clubPlayers(state, c.id).filter((p) => !p.academy).length);
    const min = Math.min(...sizes);
    const foreign = clubs.reduce((s, c) => s + clubPlayers(state, c.id).filter((p) => p.nationality !== code).length, 0);
    const total = sizes.reduce((a, b) => a + b, 0);
    console.log(`  T${l.tier} ${displayName(l.name)}: ${clubs.length} clubes · ${real} reales · ${withReal} con jugadores FC26 · ${withCurated} con plantilla de referencia · plantilla mín. ${min} · extranjeros ${Math.round((100 * foreign) / Math.max(1, total))}%`);
    if (def && clubs.length !== def.size) bad(`tamaño ${clubs.length} ≠ oficial ${def.size}`);
    if (min < 18) bad(`plantilla mínima ${min} (< 18)`);
    const names = new Map<string, number>();
    for (const c of clubs) names.set(c.name, (names.get(c.name) ?? 0) + 1);
    for (const [n, k] of names) if (k > 1) bad(`nombre repetido: ${n} ×${k}`);
    for (const c of clubs) {
      const prev = seenGlobal.get(`${code}:${c.name}`);
      if (prev && prev !== l.id) bad(`${c.name} está en dos ligas de ${code}`);
      seenGlobal.set(`${code}:${c.name}`, l.id);
    }
  }
}
console.log(problems ? `\n${problems} problema(s)` : '\nSin problemas');
process.exit(problems ? 1 : 0);
