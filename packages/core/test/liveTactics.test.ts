// Tácticas en caliente del partido en directo (Fase 5): setPlayerTactics.
import { describe, expect, it } from 'vitest';
import {
  COUNTRY_BY_CODE,
  MatchSim,
  PLAYER_INSTRUCTIONS,
  Rng,
  buildSide,
  createWorld,
  generateReferee,
  type MatchInput,
  type PlayerFocus,
} from '../src';

const FOCUSES: PlayerFocus[] = ['attack', 'balanced', 'defend'];

function makeInput(seed: number): MatchInput {
  const state = createWorld({ seed: 41, season: 2026, loadedCountries: ['ENG'] });
  const league = state.leagues[state.countries.ENG.leagueIds[0]];
  return {
    home: buildSide(state, state.clubs[league.clubIds[0]], new Rng(1)),
    away: buildSide(state, state.clubs[league.clubIds[5]], new Rng(2)),
    referee: generateReferee(new Rng(1234), 'ref', COUNTRY_BY_CODE.ENG),
    rng: new Rng(seed),
    importance: 0.5,
    neutral: false,
    knockout: false,
    crowdPressure: 0.6,
  };
}

/** Crea dos sims gemelos (misma semilla) sobre el mismo estado (partidos distintos por semilla). */
function twins(seed: number): [MatchSim, MatchSim] {
  const state = createWorld({ seed: 41, season: 2026, loadedCountries: ['ENG'] });
  const league = state.leagues[state.countries.ENG.leagueIds[0]];
  const mk = (s: number): MatchSim =>
    new MatchSim({
      home: buildSide(state, state.clubs[league.clubIds[0]], new Rng(1)),
      away: buildSide(state, state.clubs[league.clubIds[5]], new Rng(2)),
      referee: generateReferee(new Rng(1234), 'ref', COUNTRY_BY_CODE.ENG),
      rng: new Rng(s),
      importance: 0.5,
      neutral: false,
      knockout: false,
      crowdPressure: 0.6,
    });
  return [mk(seed), mk(seed)];
}

describe('tácticas en caliente en el partido en directo', () => {
  it('onPitch expone focus/instrucciones válidos y la posición táctica V2', () => {
    const sim = new MatchSim(makeInput(7));
    const starters = sim.onPitch('home');
    expect(starters).toHaveLength(11);
    for (const op of starters) {
      expect(FOCUSES).toContain(op.focus);
      for (const ins of op.instructions) expect(PLAYER_INSTRUCTIONS).toContain(ins);
      expect(op.tacticalPos).toBeTruthy();
    }
  });

  it('setPlayerTactics actualiza al jugador, registra el evento y no consume Rng', () => {
    const input = makeInput(7);
    const sim = new MatchSim(input);
    const rngBefore = input.rng.state;
    const target = sim.onPitch('home')[1];
    const ok = sim.setPlayerTactics('home', target.player.id, 'defend', ['stayBack', 'manMark']);
    expect(ok).toBe(true);
    // El cambio se ve inmediatamente a través de onPitch.
    const after = sim.onPitch('home').find((op) => op.player.id === target.player.id)!;
    expect(after.focus).toBe('defend');
    expect(after.instructions).toEqual(['stayBack', 'manMark']);
    // Se registra un evento de cambio en el minuto actual.
    const ev = sim.events[sim.events.length - 1];
    expect(ev.type).toBe('tactic');
    expect(ev.minute).toBe(sim.displayMinute);
    // El Rng queda intacto: el cambio es táctico, no aleatorio.
    expect(input.rng.state).toBe(rngBefore);
  });

  it('devuelve false para un jugador que no está en el campo', () => {
    const input = makeInput(7);
    const sim = new MatchSim(input);
    const bench = sim.benchOf('home')[0];
    expect(bench).toBeTruthy();
    expect(sim.setPlayerTactics('home', bench.id, 'attack', [])).toBe(false);
  });

  it('el cambio queda aplicado al jugador hasta el final del partido', () => {
    const [neutral, adjusted] = twins(555);
    const advance = (s: MatchSim) => {
      while (!s.finished && s.displayMinute < 30) s.step();
    };
    advance(neutral);
    advance(adjusted);
    // En el ajustado, todo el campo del equipo pasa a defender (excepto el portero).
    const outfielders = adjusted.onPitch('home').filter((op) => op.pos !== 'GK');
    for (const op of outfielders) adjusted.setPlayerTactics('home', op.player.id, 'defend', ['stayBack', 'manMark']);
    while (!neutral.finished) neutral.step();
    while (!adjusted.finished) adjusted.step();
    expect(adjusted.finished).toBe(true);
    // Todos los jugadores de campo que sigan sobre el césped mantienen el cambio
    // (las expulsiones pueden dejar alguno fuera, pero nunca se revierte la orden).
    const still = adjusted.onPitch('home').filter((op) => op.pos !== 'GK');
    expect(still.length).toBeGreaterThanOrEqual(9);
    for (const op of still) {
      expect(op.focus).toBe('defend');
      expect(op.instructions).toContain('stayBack');
    }
  });

  it("poner a defender al equipo en el 30' reduce sus goles de forma medible", () => {
    let neutralGoals = 0;
    let defendGoals = 0;
    const N = 60;
    for (let i = 0; i < N; i++) {
      const [n, d] = twins(700 + i);
      const advance = (s: MatchSim) => {
        while (!s.finished && s.displayMinute < 30) s.step();
      };
      advance(n);
      advance(d);
      for (const op of d.onPitch('home')) {
        if (op.pos !== 'GK') d.setPlayerTactics('home', op.player.id, 'defend', ['stayBack', 'manMark']);
      }
      while (!n.finished) n.step();
      while (!d.finished) d.step();
      neutralGoals += n.result().homeGoals;
      defendGoals += d.result().homeGoals;
    }
    // Gemelos deterministas: el promedio sobre partidos distintos es comparable.
    expect(defendGoals / N).toBeLessThan((neutralGoals / N) * 0.9);
  });
});