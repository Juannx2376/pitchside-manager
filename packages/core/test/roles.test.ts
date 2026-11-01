import { describe, expect, it } from 'vitest';
import {
  COUNTRY_BY_CODE,
  Rng,
  buildSide,
  cloneTactic,
  createWorld,
  generateReferee,
  roleEffectScale,
  roleFit,
  roleMultiplier,
  rolesForPosition,
  simulateMatch,
  suggestRoles,
  tacticalPositionsOf,
  type MatchSide,
  type PlayerRole,
  type Tactic,
} from '../src';

describe('los roles importan', () => {
  it('el multiplicador y la escala del rol crecen con el encaje', () => {
    expect(roleEffectScale(30)).toBeLessThan(roleEffectScale(60));
    expect(roleEffectScale(60)).toBeCloseTo(1, 5);
    expect(roleEffectScale(90)).toBeGreaterThan(roleEffectScale(60));
    expect(roleEffectScale(5)).toBeGreaterThanOrEqual(0.3);
    expect(roleEffectScale(99)).toBeLessThanOrEqual(1.25);
  });

  it('un once con los mejores roles supera a otro con los peores (emparejado, mismas semillas)', () => {
    const state = createWorld({ seed: 31, season: 2026, loadedCountries: ['ENG'] });
    const league = state.leagues[state.countries.ENG.leagueIds[0]];
    const ref = generateReferee(new Rng(1), 'ref', COUNTRY_BY_CODE.ENG);
    const N = 220;

    const withRoles = (mode: 'best' | 'worst', i: number): number => {
      const rng = new Rng(1000 + i);
      const h = state.clubs[league.clubIds[i % league.clubIds.length]];
      const a = state.clubs[league.clubIds[(i + 7) % league.clubIds.length]];
      const hs: MatchSide = buildSide(state, h, rng);
      const as: MatchSide = buildSide(state, a, rng);
      const tc: Tactic = cloneTactic(hs.tactic);
      const labels = tacticalPositionsOf(tc.slots);
      if (mode === 'best') tc.roles = suggestRoles(tc, hs.players);
      else {
        tc.roles = labels.map((pos, k): PlayerRole => {
          const p = hs.players[k];
          if (!p) return 'default';
          const sorted = rolesForPosition(pos)
            .filter((r) => r !== 'default')
            .sort((x, y) => roleFit(p, x) - roleFit(p, y));
          return sorted[0] ?? 'default';
        });
      }
      hs.tactic = tc;
      as.tactic = cloneTactic(as.tactic);
      as.tactic.roles = as.tactic.roles.map((): PlayerRole => 'default');
      const r = simulateMatch({ home: hs, away: as, referee: ref, rng, importance: 0.5, neutral: false, knockout: false, crowdPressure: 0.5 });
      return r.homeGoals - r.awayGoals;
    };

    let best = 0;
    let worst = 0;
    for (let i = 0; i < N; i++) {
      best += withRoles('best', i);
      worst += withRoles('worst', i);
    }
    // Diferencia de goles media: los roles bien elegidos deben notarse con claridad.
    expect(best / N - worst / N).toBeGreaterThan(0.12);
  });

  it('roleMultiplier ya no es casi neutro', () => {
    const state = createWorld({ seed: 5, season: 2026, loadedCountries: ['ENG'] });
    const players = Object.values(state.players).slice(0, 200);
    let lo = 2;
    let hi = 0;
    for (const p of players) {
      for (const r of ['poacher', 'anchor', 'winger', 'deepPlaymaker'] as PlayerRole[]) {
        const m = roleMultiplier(p, r);
        lo = Math.min(lo, m);
        hi = Math.max(hi, m);
      }
    }
    expect(hi - lo).toBeGreaterThan(0.06);
  });
});
