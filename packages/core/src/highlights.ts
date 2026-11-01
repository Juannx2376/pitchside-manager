// Resumen de un partido: jugadas destacadas, etiquetas de historia y racha de resultados.
// Es puro y sólo lee `MatchResult.events` / `stats`, así que no cambia el esquema de guardado.
import type { MatchEvent, MatchResult, SideKey } from './matchEngine';
import type { StoredMatch } from './state';
import type { Id } from './types';

export interface Highlight {
  minute: number;
  type: MatchEvent['type'];
  side: SideKey | null;
  playerId?: Id;
  assistId?: Id;
  msg: MatchEvent['msg'];
  xg: number;
  /** Posición del balón (0-100 en ambos ejes) para la mini-repetición. */
  x: number;
  y: number;
  score: [number, number];
  weight: number;
}

const BASE_WEIGHT: Partial<Record<MatchEvent['type'], number>> = {
  goal: 100,
  penalty_missed: 72,
  red: 68,
  second_yellow: 62,
  penalty_awarded: 48,
  controversy: 46,
  save: 34,
  miss: 22,
  chance: 18,
  injury: 20,
};

function weightOf(e: MatchEvent, result: MatchResult): number {
  const base = BASE_WEIGHT[e.type];
  if (base === undefined) return 0;
  let w = base + (e.xg ?? 0) * 60;
  if (e.type === 'goal') {
    const [h, a] = e.score;
    const margin = Math.abs(h - a);
    if (margin === 0) w += 18; // gol del empate
    if (margin === 1) w += 10; // gol que da ventaja de uno
    if (e.minute >= 85) w += 14;
    if (e.minute <= 5) w += 4;
    if (result.homeGoals + result.awayGoals >= 6) w -= 8;
  }
  return w;
}

/** Las mejores jugadas (por defecto 6), ordenadas por minuto. */
export function buildHighlights(result: MatchResult, max = 6): Highlight[] {
  const scored = result.events
    .map((e, i) => ({ e, i, w: weightOf(e, result) }))
    .filter((r) => r.w > 0)
    .sort((a, b) => b.w - a.w || a.i - b.i)
    .slice(0, max)
    .sort((a, b) => a.e.minute - b.e.minute || a.i - b.i);
  return scored.map(({ e, w }) => ({
    minute: e.minute,
    type: e.type,
    side: e.side,
    playerId: e.playerId,
    assistId: e.assistId,
    msg: e.msg,
    xg: e.xg ?? 0,
    x: e.x ?? (e.side === 'away' ? 12 : 88),
    y: e.y ?? 50,
    score: e.score,
    weight: Math.round(w),
  }));
}

export type StoryTag = 'comeback' | 'thriller' | 'lateWinner' | 'dominant' | 'robbed' | 'redCard' | 'cleanSheet' | 'goalless' | 'rout';

/** Etiquetas narrativas del partido (para titulares y tarjetas). */
export function matchStory(result: MatchResult): StoryTag[] {
  const tags: StoryTag[] = [];
  const { homeGoals: h, awayGoals: a } = result;
  const total = h + a;
  const winner: SideKey | null = h > a ? 'home' : a > h ? 'away' : null;
  const goals = result.events.filter((e) => e.type === 'goal');
  if (winner) {
    const trailed = goals.some((e) => (winner === 'home' ? e.score[0] < e.score[1] : e.score[1] < e.score[0]));
    if (trailed) tags.push('comeback');
    const last = goals[goals.length - 1];
    if (last && last.side === winner && last.minute >= 85 && Math.abs(h - a) === 1) tags.push('lateWinner');
    if (Math.abs(h - a) >= 4) tags.push('rout');
    const loserXg = result.stats[winner === 'home' ? 'away' : 'home'].xg;
    const winnerXg = result.stats[winner].xg;
    if (winnerXg > loserXg * 2.2 && winnerXg > 1.5) tags.push('dominant');
    if (loserXg > winnerXg * 1.8 && loserXg > 1.5) tags.push('robbed');
  }
  if (total >= 5) tags.push('thriller');
  if (total === 0) tags.push('goalless');
  if (result.events.some((e) => e.type === 'red' || e.type === 'second_yellow')) tags.push('redCard');
  if (h === 0 || a === 0) if (total > 0) tags.push('cleanSheet');
  return tags;
}

export interface FormRun {
  result: 'W' | 'D' | 'L';
  scored: number;
  conceded: number;
}

/** Resultados de los partidos del club, del más reciente al más antiguo. */
export function recentRuns(matches: StoredMatch[], clubId: Id, limit = 12): FormRun[] {
  const out: FormRun[] = [];
  for (let i = matches.length - 1; i >= 0 && out.length < limit; i--) {
    const m = matches[i];
    if (m.homeId !== clubId && m.awayId !== clubId) continue;
    const home = m.homeId === clubId;
    const gf = home ? m.result.homeGoals : m.result.awayGoals;
    const ga = home ? m.result.awayGoals : m.result.homeGoals;
    out.push({ result: gf > ga ? 'W' : gf < ga ? 'L' : 'D', scored: gf, conceded: ga });
  }
  return out;
}

export interface Streaks {
  win: number;
  unbeaten: number;
  winless: number;
  cleanSheets: number;
}

/** Rachas activas a partir de los últimos resultados. */
export function currentStreaks(runs: FormRun[]): Streaks {
  const count = (pred: (r: FormRun) => boolean): number => {
    let n = 0;
    for (const r of runs) {
      if (!pred(r)) break;
      n++;
    }
    return n;
  };
  return {
    win: count((r) => r.result === 'W'),
    unbeaten: count((r) => r.result !== 'L'),
    winless: count((r) => r.result !== 'W'),
    cleanSheets: count((r) => r.conceded === 0),
  };
}
