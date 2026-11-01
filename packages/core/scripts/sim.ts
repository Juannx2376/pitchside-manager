// Simulación sin interfaz: `npm run sim -- --seasons 3 --countries ESP,COL --seed 42`
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  COUNTRY_BY_CODE,
  advanceDay,
  autoAnswerPress,
  clubPlayers,
  computeTable,
  createWorld,
  formatMoney,
  fullName,
  importAuto,
  overall,
  setUserClub,
  tm,
  type GameState,
} from '../src';

function arg(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const seasons = Number(arg('seasons', '1'));
const countryArg = arg('countries', 'ALL');
const countries = countryArg === 'ALL' ? [] : countryArg.split(',').map((s) => s.trim().toUpperCase());
const seed = Number(arg('seed', '42'));
const defaultDb = join(process.cwd(), '..', '..', 'apps', 'web', 'public', 'data', 'world-db.json');
const importFile = arg('import', existsSync(defaultDb) ? defaultDb : '');
const userCountry = arg('user', countries[0] ?? 'ESP');

const bundle = importFile ? importAuto(importFile, readFileSync(importFile, 'utf8')) : null;
if (bundle) console.log(`Datos: ${bundle.source} · ${bundle.players.length} jugadores, ${bundle.clubs.length} clubes`);

console.time('Creación del mundo');
const state: GameState = createWorld({ seed, season: 2026, loadedCountries: countries, bundle });
console.timeEnd('Creación del mundo');
const loadedCodes = Object.values(state.countries).filter((c) => c.loaded).map((c) => c.code);
console.log(`Países activos: ${loadedCodes.length} · Ligas: ${Object.keys(state.leagues).length} · Clubes: ${Object.keys(state.clubs).length} · Jugadores: ${Object.keys(state.players).length}`);
console.log(`Memoria: ${Math.round(process.memoryUsage().heapUsed / 1e6)} MB`);

const firstLeague = state.leagues[state.countries[userCountry].leagueIds[0]];
const userClubId = firstLeague.clubIds[0];
setUserClub(state, userClubId, { firstName: 'Sim', lastName: 'Bot', nationality: userCountry });

for (let s = 0; s < seasons; s++) {
  const startSeason = state.season;
  console.time(`Temporada ${startSeason}`);
  while (state.season === startSeason && !state.gameOver) {
    // Sin interfaz el partido del usuario se simula al instante (en la web queda pendiente para jugarlo en directo).
    advanceDay(state, true);
    if (state.pendingPress) autoAnswerPress(state, state.pendingPress);
  }
  console.timeEnd(`Temporada ${startSeason}`);
  for (const code of (countries.length ? countries : ['ENG', 'ESP', 'COL', 'JAM']).filter((c) => state.countries[c]?.loaded)) {
    for (const lid of state.countries[code].leagueIds) {
      const l = state.leagues[lid];
      const champ = l.champions[l.champions.length - 1];
      console.log(`  ${COUNTRY_BY_CODE[code].name} · ${l.name}: campeón ${champ ? state.clubs[champ.clubId].name : '—'}`);
    }
    const top = state.leagues[state.countries[code].leagueIds[0]].clubIds.map((id) => state.clubs[id]).sort((a, b) => b.reputation - a.reputation)[0];
    const h = top.finances.history[top.finances.history.length - 1];
    if (h) console.log(`    ${top.name}: ingresos ${formatMoney(h.revenue)}, gastos ${formatMoney(h.expenses)}, neto ${formatMoney(h.net)} · ${tm(top.finances.fpf.lastVerdict)}`);
  }
  if (state.gameOver) {
    console.log(state.gameOver);
    break;
  }
}

const uc = state.clubs[userClubId];
const table = computeTable(state.leagues[uc.leagueId]);
console.log(`\nTabla actual de ${state.leagues[uc.leagueId].name} (temporada ${state.season}):`);
for (const [i, r] of table.slice(0, 5).entries()) console.log(`  ${i + 1}. ${state.clubs[r.clubId].name} ${r.points} pts`);
const regens = clubPlayers(state, userClubId).filter((p) => p.source === 'regen');
console.log(`\nCanteranos en ${uc.name}: ${regens.map((p) => `${fullName(p)} (${overall(p)}/${p.potential})`).join(', ') || 'ninguno'}`);
console.log(`Traspasos registrados: ${state.transfers.length} · Noticias: ${state.news.length}`);
