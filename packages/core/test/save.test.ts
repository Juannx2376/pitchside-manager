import { describe, expect, it } from 'vitest';
import { deserializeGame, makeTactic, migrateState, serializeGame, type GameState, type Player } from '../src';

/** Estado v2 mínimo: una táctica activa, una guardada y un jugador sin historial de lesiones. */
function fakeV2State() {
  const strip = () => {
    const t = makeTactic('t', 'BALANCED', 'BALANCED', '4-4-2');
    delete t.buildUpStyle;
    delete t.defensiveApproach;
    delete t.amplitude;
    delete t.depth;
    delete t.focus;
    delete t.instructions;
    return t;
  };
  const tactic = strip();
  const saved = strip();
  const player = { id: 'p1' } as unknown as Player;
  const state = {
    version: 2,
    players: { p1: player },
    clubs: {
      c1: {
        id: 'c1',
        tactic: { tactic, lineup: [], bench: [], captainId: null, penaltyTakerId: null, freeKickTakerId: null, cornerTakerId: null },
        savedTactics: [saved],
      },
    },
  } as unknown as GameState;
  return { state, tactic, saved, player };
}

describe('guardado y migración', () => {
  it('migra partidas v2 al esquema v3 sin corromperlas', () => {
    const { state, tactic, saved, player } = fakeV2State();
    migrateState(state);
    expect(state.version).toBe(4);
    expect(player.injuryHistory).toEqual([]);
    for (const t of [tactic, saved]) {
      expect(t.buildUpStyle).toBeTypeOf('string');
      expect(t.defensiveApproach).toBeTypeOf('string');
      expect(t.amplitude).toBe(t.sliders.width);
      expect(t.depth).toBe(t.sliders.defensiveLine);
      expect(t.focus).toHaveLength(t.slots.length);
      expect(t.instructions).toHaveLength(t.slots.length);
      expect(t.roles).toHaveLength(t.slots.length);
    }
  });

  it('es idempotente (no reconstruye lo ya migrado)', () => {
    const { state, tactic } = fakeV2State();
    migrateState(state);
    const focus = tactic.focus;
    migrateState(state);
    expect(state.version).toBe(4);
    expect(tactic.focus).toBe(focus);
  });

  it('deserializa v2 aplicando la migración y rechaza versiones no soportadas', () => {
    const { state } = fakeV2State();
    const file = JSON.stringify({ format: 'pitchside-save', meta: { name: 'x', savedAt: '', season: 1, day: 0, clubName: 'c' }, state });
    expect(deserializeGame(file).state.version).toBe(4);

    const old = JSON.stringify({ format: 'pitchside-save', meta: { name: 'x', savedAt: '', season: 1, day: 0, clubName: 'c' }, state: { version: 1 } });
    expect(() => deserializeGame(old)).toThrowError('save.oldVersion');
  });

  it('serializa con la versión actual del esquema', () => {
    const { state } = fakeV2State();
    migrateState(state);
    const parsed = JSON.parse(serializeGame(state, 'slot')) as { state: GameState };
    expect(parsed.state.version).toBe(4);
  });
});

