// Misiones semanales y de temporada, con recompensas y puntos de mánager.
// Los avances se calculan a partir de los partidos del usuario (`state.userMatches`) y de las obras;
// la generación usa `Rng`, así que las partidas siguen siendo reproducibles.
import type { Club } from './club';
import { EXTRA_PROJECTS } from './clubOps';
import { msg } from './i18n';
import { addManagerXp } from './meta';
import { perkEffects } from './perks';
import { roundMoney } from './player';
import type { Rng } from './rng';
import { addNews, newId, type GameState, type StoredMatch } from './state';
import { clamp, type Id } from './types';

export const OBJECTIVE_KINDS = ['winMatches', 'cleanSheets', 'scoreGoals', 'unbeaten', 'winStreak', 'buildFacility'] as const;
export type ObjectiveKind = (typeof OBJECTIVE_KINDS)[number];

export type ObjectiveScope = 'week' | 'season';
export type ObjectiveStatus = 'active' | 'done' | 'failed';

export interface Objective {
  id: Id;
  kind: ObjectiveKind;
  scope: ObjectiveScope;
  target: number;
  progress: number;
  status: ObjectiveStatus;
  season: number;
  startDay: number;
  /** Último día (de la temporada `season`) en el que cuenta. */
  endDay: number;
  /** Nivel total de instalaciones al crearse (misiones de obras). */
  base?: number;
  rewardBudget: number;
  rewardXp: number;
}

/** Atributos que se pueden mejorar con puntos. */
export const MANAGER_SKILLS = ['tacticalKnowledge', 'manManagement', 'mediaHandling', 'adaptability', 'pressRelation'] as const;
export type ManagerSkill = (typeof MANAGER_SKILLS)[number];

export function facilityTotal(club: Club): number {
  const f = club.facilities;
  const extras = EXTRA_PROJECTS.reduce((s, k) => s + (f[k] ?? 0), 0);
  return Math.round(club.trainingFacilities / 20) + Math.round(club.youthFacilities / 20) + f.medical + f.fanShop + f.parking + f.vipBoxes + extras;
}

function userMatchesIn(state: GameState, o: Objective): StoredMatch[] {
  const uid = state.userClubId;
  if (!uid) return [];
  return state.userMatches.filter((m) => m.season === o.season && m.day >= o.startDay && m.day <= o.endDay && (m.homeId === uid || m.awayId === uid));
}

function goalsFor(m: StoredMatch, uid: Id): [number, number] {
  return m.homeId === uid ? [m.result.homeGoals, m.result.awayGoals] : [m.result.awayGoals, m.result.homeGoals];
}

/** Progreso actual de una misión. */
export function objectiveProgress(state: GameState, o: Objective): number {
  const uid = state.userClubId;
  const club = uid ? state.clubs[uid] : null;
  if (!uid || !club) return o.progress;
  if (o.kind === 'buildFacility') return Math.max(0, facilityTotal(club) - (o.base ?? 0));
  const ms = userMatchesIn(state, o);
  switch (o.kind) {
    case 'winMatches':
      return ms.filter((m) => {
        const [f, a] = goalsFor(m, uid);
        return f > a;
      }).length;
    case 'cleanSheets':
      return ms.filter((m) => goalsFor(m, uid)[1] === 0).length;
    case 'scoreGoals':
      return ms.reduce((s, m) => s + goalsFor(m, uid)[0], 0);
    case 'unbeaten': {
      let run = 0;
      for (const m of ms) {
        const [f, a] = goalsFor(m, uid);
        run = f >= a ? run + 1 : 0;
      }
      return Math.max(o.progress, run);
    }
    case 'winStreak': {
      let run = 0;
      let best = 0;
      for (const m of ms) {
        const [f, a] = goalsFor(m, uid);
        run = f > a ? run + 1 : 0;
        best = Math.max(best, run);
      }
      return Math.max(o.progress, best);
    }
  }
  return o.progress;
}

function rewardScale(club: Club): number {
  return Math.max(50_000, Math.round(club.reputation * club.reputation * 260));
}

function makeObjective(state: GameState, club: Club, kind: ObjectiveKind, scope: ObjectiveScope, target: number, endDay: number): Objective {
  const mult = scope === 'season' ? 6 : 1;
  return {
    id: newId(state, 'ob'),
    kind,
    scope,
    target,
    progress: 0,
    status: 'active',
    season: state.season,
    startDay: scope === 'season' ? 0 : state.day,
    endDay,
    base: kind === 'buildFacility' ? facilityTotal(club) : undefined,
    rewardBudget: roundMoney(rewardScale(club) * mult * (1 + target * 0.04)),
    rewardXp: scope === 'season' ? 60 : 12,
  };
}

/** Crea las misiones que falten (3 de temporada y 2 semanales activas). */
export function refreshObjectives(state: GameState, club: Club, rng: Rng, matchesThisWeek = 2): void {
  const list = (state.objectives ??= []);
  const seasonEnd = 399;
  const hasSeason = list.filter((o) => o.scope === 'season' && o.season === state.season).length;
  if (hasSeason < 3) {
    const picks: [ObjectiveKind, number][] = [
      ['winMatches', 8 + rng.int(0, 5)],
      ['scoreGoals', 22 + rng.int(0, 10)],
      ['cleanSheets', 5 + rng.int(0, 3)],
      ['buildFacility', 2],
    ];
    const taken = new Set(list.filter((o) => o.scope === 'season' && o.season === state.season).map((o) => o.kind));
    for (const [k, target] of picks) {
      if (list.filter((o) => o.scope === 'season' && o.season === state.season).length >= 3) break;
      if (taken.has(k)) continue;
      list.push(makeObjective(state, club, k, 'season', target, seasonEnd));
    }
  }
  // Misiones semanales: sólo en semanas con partido y con metas alcanzables para el número de partidos.
  const weekly = list.filter((o) => o.scope === 'week' && o.status === 'active');
  const kinds: [ObjectiveKind, number][] =
    matchesThisWeek >= 2
      ? [
          ['winMatches', 1],
          ['scoreGoals', 2 + rng.int(0, 1)],
          ['cleanSheets', 1],
          ['unbeaten', 2],
        ]
      : [
          ['winMatches', 1],
          ['scoreGoals', 1 + rng.int(0, 1)],
          ['cleanSheets', 1],
        ];
  const wanted = matchesThisWeek <= 0 ? 0 : matchesThisWeek >= 2 ? 2 : 1;
  while (weekly.length < wanted) {
    const free = kinds.filter(([kk]) => !weekly.some((w) => w.kind === kk));
    if (!free.length) break;
    const [k, target] = rng.pick(free);
    const o = makeObjective(state, club, k, 'week', target, Math.min(seasonEnd, state.day + 7));
    list.push(o);
    weekly.push(o);
  }
  // Se conserva un historial corto de resueltas.
  const done = list.filter((o) => o.status !== 'active');
  if (done.length > 18) {
    const drop = new Set(done.slice(0, done.length - 18).map((o) => o.id));
    state.objectives = list.filter((o) => !drop.has(o.id));
  }
}

/** Recalcula el avance, cierra las cumplidas / caducadas y entrega recompensas. */
export function updateObjectives(state: GameState): void {
  const uid = state.userClubId;
  const club = uid ? state.clubs[uid] : null;
  const mgr = state.userManagerId ? state.managers[state.userManagerId] : null;
  if (!club || !state.objectives) return;
  for (const o of state.objectives) {
    if (o.status !== 'active') continue;
    o.progress = Math.max(o.progress, objectiveProgress(state, o));
    if (o.progress >= o.target) {
      o.status = 'done';
      club.finances.transferBudget += Math.round(o.rewardBudget * (1 + perkEffects(state).missionBudget));
      if (mgr) addManagerXp(state, o.rewardXp);
      addNews(state, { category: 'board', title: msg('news.objectiveDone.t', { kind: msg(`obj.kind.${o.kind}`, { n: o.target }) }), body: msg('news.objectiveDone.b', { budget: o.rewardBudget, xp: o.rewardXp }), clubIds: [club.id], importance: 2 });
    } else if (state.season > o.season || state.day > o.endDay) {
      o.status = 'failed';
    }
  }
  // Las semanales caducadas se archivan sin ruido: sólo se recuerdan las de temporada.
  state.objectives = state.objectives.filter((o) => !(o.scope === 'week' && o.status === 'failed'));
}

/** Gasta un punto de mánager en una habilidad. */
export function spendManagerPoint(state: GameState, skill: ManagerSkill): boolean {
  const mgr = state.userManagerId ? state.managers[state.userManagerId] : null;
  if (!mgr || (mgr.points ?? 0) <= 0 || !MANAGER_SKILLS.includes(skill) || mgr[skill] >= 99) return false;
  mgr[skill] = clamp(mgr[skill] + 2, 1, 99);
  mgr.points = (mgr.points ?? 0) - 1;
  return true;
}
