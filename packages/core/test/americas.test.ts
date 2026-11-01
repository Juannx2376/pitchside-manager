import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AMERICAS_DIVISIONS, clubPlayers, createWorld, emptyBundle, importAuto, reconcileDivisions, type ImportBundle } from '../src';

const dbPath = join(__dirname, '..', '..', '..', 'apps', 'web', 'public', 'data', 'world-db.json');

describe('registro de divisiones (unitario)', () => {
  it('cada división del registro tiene su tamaño oficial y sin nombres repetidos', () => {
    for (const d of AMERICAS_DIVISIONS) {
      expect(d.clubs.length, `${d.country} T${d.tier}`).toBeLessThanOrEqual(d.size);
      const names = d.clubs.map((c) => c.name);
      expect(new Set(names).size, `${d.country} T${d.tier}: nombres repetidos`).toBe(names.length);
    }
    const arg = AMERICAS_DIVISIONS.filter((d) => d.country === 'ARG');
    expect(arg.map((d) => d.size)).toEqual([30, 36, 22, 37]);
    expect(arg[0].clubs).toHaveLength(30);
    expect(arg[1].clubs).toHaveLength(36);
  });

  it('empareja clubes, fusiona duplicados y baja de categoría a los que no figuran', () => {
    const b: ImportBundle = emptyBundle('test');
    b.leagues = [
      { externalId: 'L1', name: 'Liga', countryCode: 'ARG', tier: 1 },
      { externalId: 'L2', name: 'Segunda', countryCode: 'ARG', tier: 2 },
    ];
    b.clubs = [
      { externalId: 'c1', name: 'River Plate', countryCode: 'ARG', leagueExternalId: 'L1' },
      { externalId: 'c2', name: 'Tigre', countryCode: 'ARG', leagueExternalId: 'L1' },
      { externalId: 'c3', name: 'Club Atlético Tigre', countryCode: 'ARG', leagueExternalId: 'L2' },
      { externalId: 'c4', name: 'Club Inventado del Sur', countryCode: 'ARG', leagueExternalId: 'L1' },
    ];
    b.players = [
      { externalId: 'p1', firstName: 'A', lastName: 'B', nationality: 'ARG', age: 25, position: 'ST', secondaryPositions: [], clubExternalId: 'c3' },
    ];
    const out = reconcileDivisions(b);
    const arg = out.clubs.filter((c) => c.countryCode === 'ARG');
    expect(arg.filter((c) => /tigre/i.test(c.name))).toHaveLength(1);
    // El jugador del duplicado pasa al club que lo sustituye.
    expect(out.players[0].clubExternalId).toBe('c2');
    // El club desconocido baja por debajo de las 4 categorías oficiales.
    const unknown = arg.find((c) => c.name === 'Club Inventado del Sur');
    const tier = out.leagues.find((l) => l.externalId === unknown?.leagueExternalId)?.tier ?? 0;
    expect(tier).toBeGreaterThan(4);
    // Es una función pura y memoizada.
    expect(reconcileDivisions(b)).toBe(out);
    expect(b.clubs).toHaveLength(4);
  });
});

describe.skipIf(!existsSync(dbPath))('divisiones y plantillas de América con la base de datos real', () => {
  const bundle = existsSync(dbPath) ? importAuto(dbPath, readFileSync(dbPath, 'utf8')) : emptyBundle('x');
  const countries = [...new Set(AMERICAS_DIVISIONS.map((d) => d.country))];
  const state = createWorld({ seed: 11, season: 2026, loadedCountries: countries, bundle });

  const leagueOf = (code: string, tier: number) => state.leagues[state.countries[code].leagueIds[tier - 1]];

  it('todas las ligas del registro tienen su tamaño oficial', () => {
    for (const d of AMERICAS_DIVISIONS) {
      const l = leagueOf(d.country, d.tier);
      expect(l.clubIds.length, `${d.country} T${d.tier} ${d.name}`).toBe(d.size);
    }
  });

  it('Argentina: la Liga Profesional son los 30 oficiales y casi todos con plantilla real', () => {
    const l = leagueOf('ARG', 1);
    const names = l.clubIds.map((id) => state.clubs[id].name);
    const expected = AMERICAS_DIVISIONS.find((d) => d.country === 'ARG' && d.tier === 1)!.clubs.map((c) => c.name);
    expect([...names].sort()).toEqual([...expected].sort());
    const real = l.clubIds.filter((id) => clubPlayers(state, id).some((p) => p.source === 'real')).length;
    expect(real).toBeGreaterThanOrEqual(26);
    // Godoy Cruz y San Martín (SJ) descendieron y mantienen su plantilla real en la Primera Nacional.
    const t2 = leagueOf('ARG', 2).clubIds.map((id) => state.clubs[id]);
    for (const n of ['Godoy Cruz', 'San Martín (SJ)']) {
      const c = t2.find((x) => x.name === n);
      expect(c, n).toBeTruthy();
      expect(clubPlayers(state, c!.id).some((p) => p.source === 'real')).toBe(true);
    }
  });

  it('sin clubes duplicados por país, plantillas completas y extranjeros razonables', () => {
    for (const code of countries) {
      const seen = new Set<string>();
      for (const lid of state.countries[code].leagueIds) {
        for (const cid of state.leagues[lid].clubIds) {
          const c = state.clubs[cid];
          expect(seen.has(c.name), `${code}: ${c.name} repetido`).toBe(false);
          seen.add(c.name);
          const squad = clubPlayers(state, cid).filter((p) => !p.academy);
          expect(squad.length, `${code} ${c.name}`).toBeGreaterThanOrEqual(18);
          expect(squad.some((p) => p.position === 'GK'), `${code} ${c.name} sin portero`).toBe(true);
        }
      }
    }
  });

  it('MLS sólo en EE. UU. y la liga canadiense es la CPL', () => {
    const usa = leagueOf('USA', 1).clubIds.map((id) => state.clubs[id].name);
    expect(usa).toContain('Inter Miami');
    expect(usa).toContain('Toronto FC');
    const can = leagueOf('CAN', 1);
    expect(can.clubIds).toHaveLength(8);
    expect(can.clubIds.map((id) => state.clubs[id].name)).not.toContain('Inter Miami');
  });
});
