import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createWorld, importCompactDatabase, type CompactDatabase } from '../src';

const dbPath = fileURLToPath(new URL('../../../apps/web/public/data/world-db.json', import.meta.url));
const hasDb = existsSync(dbPath);

describe.skipIf(!hasDb)('base de datos real (FC 26 + Wikidata)', () => {
  const bundle = hasDb ? importCompactDatabase(JSON.parse(readFileSync(dbPath, 'utf8')) as CompactDatabase) : null;

  it('crea el mundo con los 211 países activos y ligas reales', () => {
    const state = createWorld({ seed: 3, season: 2026, loadedCountries: [], bundle });
    const loaded = Object.values(state.countries).filter((c) => c.loaded);
    expect(loaded.length).toBe(211);
    // Colombia: Primera A y Primera B con todos sus clubes reales.
    const col = state.countries.COL.leagueIds.map((id) => state.leagues[id]);
    expect(col[0].clubIds.length).toBeGreaterThanOrEqual(18);
    expect(col[0].clubIds.every((id) => state.clubs[id].source === 'real')).toBe(true);
    // Inglaterra: cuatro divisiones de FC 26 completas.
    const eng = state.countries.ENG.leagueIds.map((id) => state.leagues[id]);
    expect(eng.map((l) => l.clubIds.length)).toEqual([20, 24, 24, 24]);
    // Jugadores de FC 26 en sus clubes reales.
    const real = Object.values(state.players).filter((p) => p.source === 'real');
    expect(real.length).toBeGreaterThan(15000);
    // Ningún "club" es en realidad una persona (antes aparecía "Luis Sinisterra" en Colombia).
    expect(Object.values(state.clubs).some((c) => c.name === 'Luis Sinisterra')).toBe(false);
    // Los gigantes tienen escudo y la reputación más alta del mundo.
    for (const name of ['FC Bayern München', 'Real Madrid', 'Liverpool']) {
      const c = Object.values(state.clubs).find((x) => x.name === name);
      expect(c, name).toBeTruthy();
      expect(c!.logo, `${name} logo`).toBeTruthy();
      expect(c!.reputation, `${name} rep`).toBeGreaterThanOrEqual(85);
    }
    // Los clubes reales llevan escudo en su gran mayoría.
    const realClubs = Object.values(state.clubs).filter((c) => c.source === 'real');
    expect(realClubs.filter((c) => c.logo).length / realClubs.length).toBeGreaterThan(0.6);
  });
});
