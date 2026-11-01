// Serialización de partidas. El estado es JSON puro (sin clases), así que basta con validar la versión.
import type { GameState } from './state';
import { ensureValues } from './world';
import { ensureTacticV3, type BuildUpStyle, type DefensiveApproach, type PlayerFocus, type PlayerInstruction, type Tactic } from './tactics';

/** Versión del esquema de guardado que entiende este binario. */
export const CURRENT_SAVE_VERSION = 4;

/** Versión mínima desde la que se puede migrar (todo lo anterior se considera obsoleto). */
const MIN_SAVE_VERSION = 2;

export interface SaveMeta {
  name: string;
  savedAt: string;
  season: number;
  day: number;
  clubName: string;
}

export interface SaveFile {
  format: 'pitchside-save';
  meta: SaveMeta;
  state: GameState;
}

export function serializeGame(state: GameState, name: string): string {
  const club = state.userClubId ? state.clubs[state.userClubId] : null;
  const file: SaveFile = {
    format: 'pitchside-save',
    meta: { name, savedAt: new Date().toISOString(), season: state.season, day: state.day, clubName: club?.name ?? '—' },
    state,
  };
  return JSON.stringify(file);
}

/** Salida de balón coherente con los deslizadores de una táctica antigua. */
function buildUpFromSliders(t: Tactic): BuildUpStyle {
  if (t.sliders.counterAttack) return 'counter';
  if (t.sliders.directness >= 66) return 'long_ball';
  if (t.sliders.directness <= 33) return 'short_pass';
  return 'balanced';
}

/** Enfoque defensivo coherente con los deslizadores de una táctica antigua. */
function defensiveFromSliders(t: Tactic): DefensiveApproach {
  if (t.sliders.pressing >= 70) return 'aggressive_press';
  if (t.sliders.defensiveLine >= 66) return 'high_block';
  if (t.sliders.defensiveLine <= 33) return 'low_block';
  return 'balanced';
}

/** Enfoque individual (Ataque/Equilibrado/Defensa) según la altura del hueco en el campo. */
function focusFromSlot(s: { y: number }, index: number): PlayerFocus {
  if (index === 0 || s.y >= 86 || s.y >= 62) return 'defend';
  if (s.y <= 30) return 'attack';
  return 'balanced';
}

/**
 * Migra una partida a la versión actual del esquema. Es idempotente: si el estado ya está
 * al día devuelve el mismo objeto sin tocarlo. Sólo cubre v2 → v3 (Táctica V2): rellena los
 * campos tácticos V2 que falten derivándolos de los deslizadores antiguos y garantiza que
 * cada jugador tenga historial de lesiones.
 */
export function migrateState(state: GameState): GameState {
  const s = state as GameState & { version: number };
  if (s.version >= CURRENT_SAVE_VERSION) return state;

  // v2 → v3: los jugadores antiguos no traen historial de lesiones.
  for (const p of Object.values(state.players)) {
    if (!p.injuryHistory) p.injuryHistory = [];
  }

  const upgradeTactic = (t: Tactic | null | undefined): void => {
    if (!t) return;
    if (t.buildUpStyle === undefined) t.buildUpStyle = buildUpFromSliders(t);
    if (t.defensiveApproach === undefined) t.defensiveApproach = defensiveFromSliders(t);
    if (t.amplitude === undefined) t.amplitude = t.sliders.width;
    if (t.depth === undefined) t.depth = t.sliders.defensiveLine;
    if (!t.focus || t.focus.length !== t.slots.length) t.focus = t.slots.map(focusFromSlot);
    if (!t.instructions || t.instructions.length !== t.slots.length) {
      t.instructions = t.slots.map((): PlayerInstruction[] => []);
    }
    if (!t.roles || t.roles.length !== t.slots.length) t.roles = new Array(t.slots.length).fill('default');
    // Táctica V3: carriles de ataque, riesgo de pase, lado de ataque, marcaje, transición y estrategia.
    ensureTacticV3(t);
  };

  for (const club of Object.values(state.clubs)) {
    upgradeTactic(club.tactic?.tactic);
    for (const st of club.savedTactics ?? []) upgradeTactic(st);
    // v3 → v4: instalaciones ampliadas (a 0); el plan de entrenamiento se crea al primer uso.
    if (club.facilities) {
      for (const k of ['gym', 'videoAnalysis', 'recoveryPool', 'youthDorm', 'scoutingNetwork', 'pitchTech'] as const) club.facilities[k] ??= 0;
    }
  }
  // v3 → v4: eventos de entrenamiento y vestuario.
  state.trainingEvents ??= [];
  state.objectives ??= [];

  s.version = CURRENT_SAVE_VERSION;
  return state;
}

export function deserializeGame(text: string): SaveFile {
  const parsed = JSON.parse(text) as Partial<SaveFile>;
  if (parsed.format !== 'pitchside-save' || !parsed.state || !parsed.meta) throw new Error('El archivo no es una partida de Pitchside.');
  const version = (parsed.state as { version?: number }).version ?? 0;
  if (version < MIN_SAVE_VERSION || version > CURRENT_SAVE_VERSION) throw new Error('save.oldVersion');
  const state = migrateState(parsed.state);
  ensureValues(state);
  return { ...parsed, state } as SaveFile;
}
