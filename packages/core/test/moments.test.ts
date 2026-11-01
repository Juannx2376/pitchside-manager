// Momentos clave interactivos: penaltis y faltas del usuario detienen el reloj hasta decidir.
import { describe, expect, it } from 'vitest';
import { COUNTRY_BY_CODE, MatchSim, Rng, buildSide, createWorld, generateReferee } from '../src';

function makeSim(seed: number, state = createWorld({ seed: 41, season: 2026, loadedCountries: ['ENG'] })): MatchSim {
  const league = state.leagues[state.countries.ENG.leagueIds[0]];
  return new MatchSim({
    home: buildSide(state, state.clubs[league.clubIds[0]], new Rng(1)),
    away: buildSide(state, state.clubs[league.clubIds[5]], new Rng(2)),
    referee: generateReferee(new Rng(1234), 'ref', COUNTRY_BY_CODE.ENG),
    rng: new Rng(seed),
    importance: 0.5,
    neutral: false,
    knockout: false,
    crowdPressure: 0.6,
  });
}

describe('momentos clave', () => {
  it('sin lado interactivo nunca hay momentos pendientes', () => {
    const sim = makeSim(5);
    while (!sim.finished) {
      sim.step();
      expect(sim.pendingMoment).toBeNull();
    }
  });

  it('un momento detiene el reloj y se resuelve con la decisión', () => {
    const state = createWorld({ seed: 41, season: 2026, loadedCountries: ['ENG'] });
    let found = 0;
    let tried = 0;
    for (let seed = 1; seed <= 60 && found < 2; seed++) {
      tried++;
      const sim = makeSim(seed, state);
      sim.momentSide = 'home';
      while (!sim.finished) {
        sim.step();
        const pm = sim.pendingMoment;
        if (!pm) continue;
        found++;
        const minute = sim.minute;
        expect(pm.candidates.length).toBeGreaterThan(0);
        // El reloj no avanza mientras haya un momento sin resolver.
        expect(sim.step()).toEqual([]);
        expect(sim.minute).toBe(minute);
        const events = sim.resolveMoment({ takerId: pm.candidates[0].playerId, penalty: 'power', freeKick: 'shoot' });
        expect(sim.pendingMoment).toBeNull();
        expect(events.length).toBeGreaterThan(0);
        break;
      }
    }
    expect(tried).toBeGreaterThan(0);
    expect(found).toBeGreaterThan(0);
  });

  it('el tiempo muerto táctico: uno por mitad y se recupera en la segunda', () => {
    const sim = makeSim(12);
    for (let i = 0; i < 10; i++) sim.step();
    expect(sim.timeoutsLeft('home')).toBe(1);
    expect(sim.callTimeout('home')).toBe(true);
    expect(sim.timeoutsLeft('home')).toBe(0);
    expect(sim.callTimeout('home')).toBe(false);
    expect(sim.timeoutsLeft('away')).toBe(1);
    // Hasta el descanso y de ahí a la segunda parte: vuelve a haber uno.
    while (!sim.halftimePending && !sim.finished) sim.step();
    expect(sim.timeoutsLeft('home')).toBe(1);
  });

  it('runToEnd resuelve los momentos pendientes solo y el partido termina', () => {
    const sim = makeSim(9);
    sim.momentSide = 'home';
    const r = sim.runToEnd();
    expect(sim.finished).toBe(true);
    expect(r.homeGoals + r.awayGoals).toBeGreaterThanOrEqual(0);
  });
});
