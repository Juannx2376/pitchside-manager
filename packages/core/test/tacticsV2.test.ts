import { describe, expect, it } from 'vitest';
import {
  COUNTRY_BY_CODE,
  MatchSim,
  Rng,
  TACTICAL_CLAMP,
  buildSide,
  clampTacticalValue,
  createWorld,
  generateReferee,
  geographicMatchupMult,
  makeTactic,
  simulateMatch,
  tacticalAttrMod,
  tacticalIntent,
  type MatchSide,
  type PlayerFocus,
  type PlayerInstruction,
} from '../src';

const ALL_ATTACK: PlayerInstruction[] = ['getForward', 'shootOnSight', 'dribbleMore', 'earlyCross', 'stayWide', 'pressMore'];
const ALL_DEFEND: PlayerInstruction[] = ['stayBack', 'manMark', 'pressMore'];

describe('control táctico V2 (regla ±18%)', () => {
  it('el recorte táctico es estricto y simétrico', () => {
    expect(TACTICAL_CLAMP.min).toBe(0.82);
    expect(TACTICAL_CLAMP.max).toBe(1.18);
    expect(clampTacticalValue(3)).toBe(1.18);
    expect(clampTacticalValue(-3)).toBe(0.82);
    expect(clampTacticalValue(1)).toBe(1);
    expect(clampTacticalValue(1.1)).toBe(1.1);
    expect(clampTacticalValue(0.9)).toBe(0.9);
  });

  it('ninguna combinación de instrucciones mueve un atributo más de ±15%', () => {
    const keys = ['finishing', 'dribbling', 'crossing', 'longShots', 'tackling', 'marking', 'positioning', 'aggression'] as const;
    const focuses: PlayerFocus[] = ['attack', 'balanced', 'defend'];
    for (const key of keys) {
      for (const f of focuses) {
        for (const ins of [ALL_ATTACK, ALL_DEFEND, []] as PlayerInstruction[][]) {
          const m = tacticalAttrMod(key, f, ins);
          expect(m).toBeGreaterThanOrEqual(0.85);
          expect(m).toBeLessThanOrEqual(1.15);
        }
      }
    }
  });

  it('el emparejamiento geográfico inverso está acotado a ±18% por inflación', () => {
    const cases: [number[], number[], number[], number[]][] = [
      [[100, 0, 0, 0, 0], [10, 10, 10, 10, 10], [0, 0, 0, 0, 100], [50, 50, 50, 50, 50]],
      [[1, 2, 3, 4, 5], [500, 400, 300, 200, 100], [5, 4, 3, 2, 1], [100, 200, 300, 400, 500]],
      [[0, 0, 0, 0, 0], [1, 1, 1, 1, 1], [9, 9, 9, 9, 9], [1, 1, 1, 1, 1]],
      [[80, 20, 0, 0, 0], [2, 2, 2, 2, 2], [0, 0, 0, 20, 80], [2, 2, 2, 2, 2]],
    ];
    for (const [at, dc, dt, ac] of cases) {
      const a = geographicMatchupMult(at, dc, dt, ac);
      const b = geographicMatchupMult(dt, ac, at, dc);
      expect(a).toBeGreaterThanOrEqual(TACTICAL_CLAMP.min);
      expect(a).toBeLessThanOrEqual(TACTICAL_CLAMP.max);
      expect(b).toBeGreaterThanOrEqual(TACTICAL_CLAMP.min);
      expect(b).toBeLessThanOrEqual(TACTICAL_CLAMP.max);
    }
  });

  it('el emparejamiento geográfico espejado es simétrico (geoA × geoB = 1)', () => {
    // Caso sin recorte: el factor es exactamente especular entre los dos equipos.
    const at = [3, 2, 2, 2, 1];
    const ac = [5, 5, 5, 5, 5];
    const dt = [2, 2, 3, 2, 1];
    const dc = [4, 5, 4, 6, 4];
    const a = geographicMatchupMult(at, dc, dt, ac);
    const b = geographicMatchupMult(dt, ac, at, dc);
    expect(a * b).toBeCloseTo(1, 10);
  });

  it('un extremo por la izquierda gana ventaja si la banda derecha rival está desguarnecida', () => {
    const leftWinger = { threat: [100, 0, 0, 0, 0], cover: [50, 50, 50, 50, 50] };
    const weakRightBack = { threat: [0, 0, 0, 0, 100], cover: [10, 10, 10, 10, 10] };
    expect(geographicMatchupMult(leftWinger.threat, weakRightBack.cover, weakRightBack.threat, leftWinger.cover)).toBeGreaterThan(1);
  });

  it('la intención táctica está acotada y respeta el enfoque del jugador', () => {
    expect(tacticalIntent('attack', [])).toBe(0.8);
    expect(tacticalIntent('defend', [])).toBe(-0.8);
    expect(tacticalIntent('balanced', [])).toBe(0);
    expect(tacticalIntent('attack', ALL_ATTACK)).toBe(1.2);
    expect(tacticalIntent('defend', ALL_DEFEND)).toBe(-1.2);
  });
});

describe('calibración V2 con tácticas extremas', () => {
  function extremeSide(base: MatchSide, focus: PlayerFocus, instructions: PlayerInstruction[]): MatchSide {
    const tactic = makeTactic('t', 't', 'BALANCED');
    tactic.focus = tactic.slots.map((): PlayerFocus => focus);
    tactic.instructions = tactic.slots.map((): PlayerInstruction[] => [...instructions]);
    const s: MatchSide = base;
    s.tactic = tactic;
    return s;
  }

  function avgGoals(mutate: (h: MatchSide, a: MatchSide) => void): number {
    const state = createWorld({ seed: 41, season: 2026, loadedCountries: ['ENG'] });
    const league = state.leagues[state.countries.ENG.leagueIds[0]];
    const rng = new Rng(1234);
    const ref = generateReferee(rng, 'ref', COUNTRY_BY_CODE.ENG);
    let goals = 0;
    const N = 200;
    for (let i = 0; i < N; i++) {
      const h = buildSide(state, state.clubs[league.clubIds[i % league.clubIds.length]], rng);
      const a = buildSide(state, state.clubs[league.clubIds[(i + 9) % league.clubIds.length]], rng);
      mutate(h, a);
      goals += simulateMatch({ home: h, away: a, referee: ref, rng, importance: 0.5, neutral: false, knockout: false, crowdPressure: 0.6 }).homeGoals;
      goals += simulateMatch({ home: a, away: h, referee: ref, rng, importance: 0.5, neutral: false, knockout: false, crowdPressure: 0.6 }).awayGoals;
    }
    return goals / N;
  }

  it('ni toda la plantilla al ataque desborda la banda de goles razonable', () => {
    const neutral = avgGoals(() => undefined);
    const allAttack = avgGoals((h) => extremeSide(h, 'attack', ALL_ATTACK));
    expect(allAttack).toBeGreaterThan(1.15);
    expect(allAttack).toBeLessThan(neutral * 1.2 + 0.6);
  });

  it('ni toda la plantilla a defender apaga el partido por debajo de lo razonable', () => {
    const allDefend = avgGoals((h) => extremeSide(h, 'defend', ALL_DEFEND));
    expect(allDefend).toBeGreaterThan(0.8);
  });

  it('los partidos siguen siendo deterministas con el mismo rng', () => {
    const state = createWorld({ seed: 41, season: 2026, loadedCountries: ['ENG'] });
    const league = state.leagues[state.countries.ENG.leagueIds[0]];
    const ref = generateReferee(new Rng(1234), 'ref', COUNTRY_BY_CODE.ENG);
    const play = (): number => {
      const rng = new Rng(777);
      const h = buildSide(state, state.clubs[league.clubIds[0]], rng);
      const a = buildSide(state, state.clubs[league.clubIds[5]], rng);
      const sim = new MatchSim({ home: h, away: a, referee: ref, rng, importance: 0.5, neutral: false, knockout: false, crowdPressure: 0.6 });
      const r = sim.result();
      return r.homeGoals * 100 + r.awayGoals;
    };
    expect(play()).toBe(play());
  });
});
