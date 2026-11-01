import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { coverageReport, createWorld, importSofifaCSV, parseCSV } from '../src';

const sample = readFileSync(fileURLToPath(new URL('../../../sample-data/sample_players.csv', import.meta.url)), 'utf8');

describe('importador', () => {
  it('parsea CSV con comillas y comas internas', () => {
    const rows = parseCSV('a,b\n"x, y","z ""q"""\n');
    expect(rows).toEqual([
      ['a', 'b'],
      ['x, y', 'z "q"'],
    ]);
  });

  it('importa el CSV de muestra estilo SoFIFA y lo usa al construir el mundo', () => {
    const bundle = importSofifaCSV(sample);
    expect(bundle.players.length).toBeGreaterThan(5);
    expect(bundle.clubs.every((c) => c.countryCode === 'COL')).toBe(true);
    const p = bundle.players[0];
    expect(p.attrs?.finishing).toBeGreaterThan(0);
    const state = createWorld({ seed: 1, season: 2026, loadedCountries: ['COL'], bundle });
    const cov = coverageReport(state);
    expect(cov[0].countryCode).toBe('COL');
    // El registro oficial de divisiones añade el resto de clubes reales de la liga (sin plantilla FC).
    expect(cov[0].leagues[0].realClubs).toBeGreaterThanOrEqual(bundle.clubs.length);
    expect(cov[0].leagues[0].realPlayers).toBe(bundle.players.length);
  });
});
