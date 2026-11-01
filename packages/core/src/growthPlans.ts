// Planes de crecimiento (estilo FC 26): el usuario fija un objetivo de desarrollo a un jugador y ve hitos.
// El efecto sobre el entrenamiento es pequeño a propósito: crecer sigue siendo lento.
import type { AttrKey } from './attributes';
import { msg } from './i18n';
import { addManagerXp, pushReveal } from './meta';
import type { Player } from './player';
import { overall } from './player';
import { addNews, unlockAchievement, type GameState } from './state';
import type { Id, Position } from './types';

export const GROWTH_PLAN_IDS = [
  'explosiveWinger',
  'poacher',
  'targetMan',
  'playmaker',
  'engine',
  'ballPlayingDefender',
  'wall',
  'wingBack',
  'shotStopper',
  'sweeperKeeper',
  'leader',
] as const;
export type GrowthPlanId = (typeof GROWTH_PLAN_IDS)[number];

export interface GrowthPlanDef {
  positions: Position[];
  targets: AttrKey[];
}

export const GROWTH_PLANS: Record<GrowthPlanId, GrowthPlanDef> = {
  explosiveWinger: { positions: ['RW', 'LW', 'AM', 'ST'], targets: ['pace', 'acceleration', 'dribbling', 'finishing'] },
  poacher: { positions: ['ST', 'AM'], targets: ['finishing', 'positioning', 'composure', 'firstTouch'] },
  targetMan: { positions: ['ST'], targets: ['strength', 'heading', 'jumping', 'finishing'] },
  playmaker: { positions: ['CM', 'AM', 'DM'], targets: ['passing', 'vision', 'firstTouch', 'decisions'] },
  engine: { positions: ['CM', 'DM', 'RB', 'LB'], targets: ['stamina', 'workRate', 'tackling', 'teamwork'] },
  ballPlayingDefender: { positions: ['CB', 'DM'], targets: ['passing', 'composure', 'positioning', 'vision'] },
  wall: { positions: ['CB', 'DM'], targets: ['marking', 'tackling', 'heading', 'strength'] },
  wingBack: { positions: ['RB', 'LB'], targets: ['crossing', 'pace', 'stamina', 'dribbling'] },
  shotStopper: { positions: ['GK'], targets: ['reflexes', 'handling', 'agility', 'jumping'] },
  sweeperKeeper: { positions: ['GK'], targets: ['oneOnOnes', 'positioning', 'decisions', 'passing'] },
  leader: { positions: ['CB', 'DM', 'CM', 'AM', 'ST', 'RB', 'LB', 'RW', 'LW', 'GK'], targets: ['leadership', 'composure', 'decisions', 'teamwork'] },
};

export interface GrowthPlan {
  plan: GrowthPlanId;
  /** Valor inicial de cada atributo objetivo. */
  start: Partial<Record<AttrKey, number>>;
  ovrStart: number;
  season: number;
  day: number;
  /** Hitos ya premiados (0-3). */
  done: number;
}

/** Máximo de planes simultáneos en el primer equipo. */
export const MAX_ACTIVE_PLANS = 4;
/** Puntos a ganar en cada atributo objetivo para completar el plan. */
export const PLAN_GOAL_POINTS = 4;
/** Multiplicador de entrenamiento con un plan activo (a propósito discreto). */
export const PLAN_TRAINING_BONUS = 1.18;

export function plansForPosition(pos: Position): GrowthPlanId[] {
  return GROWTH_PLAN_IDS.filter((id) => GROWTH_PLANS[id].positions.includes(pos));
}

export function activePlans(state: GameState, clubId: Id): Player[] {
  const club = state.clubs[clubId];
  if (!club) return [];
  return club.playerIds.map((id) => state.players[id]).filter((p): p is Player => !!p && !!p.growthPlan && !p.retired);
}

export function startGrowthPlan(state: GameState, playerId: Id, plan: GrowthPlanId): { ok: boolean; reason?: 'full' | 'position' | 'noPlayer' | 'old' } {
  const p = state.players[playerId];
  const clubId = state.userClubId;
  if (!p || !clubId || p.clubId !== clubId) return { ok: false, reason: 'noPlayer' };
  if (!GROWTH_PLANS[plan].positions.includes(p.position)) return { ok: false, reason: 'position' };
  if (p.age >= 32) return { ok: false, reason: 'old' };
  if (!p.growthPlan && activePlans(state, clubId).length >= MAX_ACTIVE_PLANS) return { ok: false, reason: 'full' };
  const start: Partial<Record<AttrKey, number>> = {};
  for (const k of GROWTH_PLANS[plan].targets) start[k] = p.attrs[k];
  p.growthPlan = { plan, start, ovrStart: overall(p), season: state.season, day: state.day, done: 0 };
  return { ok: true };
}

export function cancelGrowthPlan(p: Player): void {
  p.growthPlan = null;
}

export interface PlanProgress {
  pct: number;
  rows: { key: AttrKey; start: number; now: number; goal: number }[];
  milestone: number;
}

export function planProgress(p: Player): PlanProgress | null {
  const gp = p.growthPlan;
  if (!gp) return null;
  const def = GROWTH_PLANS[gp.plan];
  const rows = def.targets.map((key) => {
    const start = gp.start[key] ?? p.attrs[key];
    return { key, start, now: p.attrs[key], goal: start + PLAN_GOAL_POINTS };
  });
  const pct = rows.reduce((s, r) => s + Math.max(0, Math.min(1, (r.now - r.start) / PLAN_GOAL_POINTS)), 0) / Math.max(1, rows.length);
  const milestone = pct >= 1 ? 3 : pct >= 0.67 ? 2 : pct >= 0.34 ? 1 : 0;
  return { pct, rows, milestone };
}

const NAME = (p: Player): string => `${p.firstName} ${p.lastName}`;

/** Premia los hitos recién alcanzados. Se llama tras la sesión semanal del club del usuario. */
export function processGrowthPlans(state: GameState): void {
  const clubId = state.userClubId;
  if (!clubId) return;
  for (const p of activePlans(state, clubId)) {
    const gp = p.growthPlan;
    const prog = planProgress(p);
    if (!gp || !prog) continue;
    while (gp.done < prog.milestone) {
      gp.done += 1;
      const last = gp.done >= 3;
      p.morale = Math.min(100, p.morale + (last ? 12 : 5));
      addManagerXp(state, last ? 30 : 10);
      pushReveal(state, {
        kind: 'milestone',
        playerId: p.id,
        title: msg(last ? 'ui.plan.completeT' : 'ui.plan.milestoneT', { p: NAME(p), n: gp.done }),
        body: msg(last ? 'ui.plan.completeB' : 'ui.plan.milestoneB', { plan: msg(`ui.plan.${gp.plan}`), ovr: overall(p), from: gp.ovrStart }),
      });
      addNews(state, {
        category: 'youth',
        title: msg('news.plan.t', { p: NAME(p), n: gp.done }),
        body: msg('news.plan.b', { plan: msg(`ui.plan.${gp.plan}`) }),
        clubIds: [clubId],
        playerId: p.id,
        importance: last ? 2 : 1,
      });
      if (last) {
        unlockAchievement(state, 'growthPlanDone');
        p.growthPlan = null;
        break;
      }
    }
  }
}

/** Revela la joya de la cantera cuando ha jugado lo suficiente (una sola vez por jugador). */
export function checkPotentialReveals(state: GameState): void {
  const clubId = state.userClubId;
  const club = clubId ? state.clubs[clubId] : null;
  if (!club) return;
  for (const id of club.playerIds) {
    const p = state.players[id];
    if (!p || p.retired || p.revealed) continue;
    const enough = p.stats.minutes >= 540 || (p.academy && p.stats.apps >= 3);
    if (!enough || p.age > 22) continue;
    p.revealed = true;
    if (p.potential >= 80 && p.potential - overall(p) >= 8) {
      pushReveal(state, {
        kind: 'potential',
        playerId: p.id,
        title: msg('ui.reveal.gemT', { p: NAME(p) }),
        body: msg('ui.reveal.gemB', { pot: p.potential }),
      });
    }
  }
}
