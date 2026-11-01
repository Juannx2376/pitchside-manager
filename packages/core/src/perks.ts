// Árbol de perks del mánager y "camino de temporada" (recompensas por nivel de mánager).
// Los puntos y niveles vienen de `Manager.points` / `Manager.level` (misiones, logros...).
import { msg } from './i18n';
import { ensureMeta, pushReveal, type MetaState } from './meta';
import { addNews, unlockAchievement, type GameState } from './state';

export type PerkBranch = 'tactical' | 'squad' | 'business';

export interface PerkEffects {
  /** Fracción extra de mejora de entrenamiento (0.06 = +6 %). */
  training: number;
  /** Fracción extra de familiaridad de rol en sesiones tácticas. */
  tacticalFam: number;
  /** Fracción extra del bono de los planes de crecimiento. */
  plan: number;
  /** Fracción extra de recuperación de lesiones. */
  recovery: number;
  /** Fracción extra de aprendizaje de los menores de 22. */
  youth: number;
  /** Días que se restan al análisis de ojeadores. */
  scoutDays: number;
  /** Fracción de comisión de agentes que se ahorra. */
  commissionCut: number;
  /** Confianza de la directiva extra por victoria. */
  winBoard: number;
  /** Fracción extra del presupuesto de las misiones. */
  missionBudget: number;
  /** Tiempos muertos extra por partido. */
  timeouts: number;
}

export interface PerkDef {
  id: string;
  branch: PerkBranch;
  cost: number;
  requires?: string;
  effects: Partial<PerkEffects>;
}

export const PERKS: PerkDef[] = [
  { id: 'drill', branch: 'tactical', cost: 1, effects: { tacticalFam: 0.25 } },
  { id: 'timeoutPlus', branch: 'tactical', cost: 2, requires: 'drill', effects: { timeouts: 1 } },
  { id: 'systems', branch: 'tactical', cost: 2, requires: 'drill', effects: { tacticalFam: 0.35 } },
  { id: 'coaching1', branch: 'squad', cost: 1, effects: { training: 0.06 } },
  { id: 'coaching2', branch: 'squad', cost: 2, requires: 'coaching1', effects: { training: 0.07 } },
  { id: 'planBoost', branch: 'squad', cost: 2, requires: 'coaching1', effects: { plan: 0.5 } },
  { id: 'physio', branch: 'squad', cost: 1, effects: { recovery: 0.2 } },
  { id: 'mentoring', branch: 'squad', cost: 2, requires: 'coaching1', effects: { youth: 0.12 } },
  { id: 'network', branch: 'business', cost: 1, effects: { scoutDays: 1 } },
  { id: 'agentsFriend', branch: 'business', cost: 1, effects: { commissionCut: 0.4 } },
  { id: 'boardFriend', branch: 'business', cost: 2, effects: { winBoard: 1 } },
  { id: 'fundraiser', branch: 'business', cost: 2, requires: 'network', effects: { missionBudget: 0.25 } },
  // Nivel experto: caros, para que el árbol dure varias temporadas.
  { id: 'masterTactician', branch: 'tactical', cost: 3, requires: 'systems', effects: { tacticalFam: 0.5, timeouts: 1 } },
  { id: 'goldenAcademy', branch: 'squad', cost: 3, requires: 'mentoring', effects: { youth: 0.2, training: 0.04 } },
  { id: 'dealmaker', branch: 'business', cost: 3, requires: 'fundraiser', effects: { missionBudget: 0.35, commissionCut: 0.3 } },
];

export const PERK_BY_ID: Record<string, PerkDef> = Object.fromEntries(PERKS.map((p) => [p.id, p]));

const ZERO: PerkEffects = { training: 0, tacticalFam: 0, plan: 0, recovery: 0, youth: 0, scoutDays: 0, commissionCut: 0, winBoard: 0, missionBudget: 0, timeouts: 0 };

/** Suma los efectos de los perks comprados (siempre devuelve un objeto nuevo). */
export function perkEffects(state: GameState): PerkEffects {
  const out = { ...ZERO };
  for (const id of state.meta?.perks ?? []) {
    const def = PERK_BY_ID[id];
    if (!def) continue;
    for (const k of Object.keys(def.effects) as (keyof PerkEffects)[]) out[k] += def.effects[k] ?? 0;
  }
  out.commissionCut = Math.min(0.8, out.commissionCut);
  return out;
}

export type PerkStatus = 'owned' | 'available' | 'locked' | 'noPoints';

export function perkStatus(state: GameState, perk: PerkDef): PerkStatus {
  const meta = state.meta;
  if (meta?.perks.includes(perk.id)) return 'owned';
  if (perk.requires && !meta?.perks.includes(perk.requires)) return 'locked';
  const mgr = state.userManagerId ? state.managers[state.userManagerId] : null;
  return (mgr?.points ?? 0) >= perk.cost ? 'available' : 'noPoints';
}

export function buyPerk(state: GameState, perkId: string): boolean {
  const perk = PERK_BY_ID[perkId];
  const mgr = state.userManagerId ? state.managers[state.userManagerId] : null;
  if (!perk || !mgr || perkStatus(state, perk) !== 'available') return false;
  mgr.points = (mgr.points ?? 0) - perk.cost;
  const meta = ensureMeta(state);
  meta.perks.push(perk.id);
  unlockAchievement(state, 'perkBought');
  return true;
}

// ───────────────────────── Camino de temporada ─────────────────────────

export interface PassReward {
  level: number;
  budget: number;
  points: number;
  /** Nivel "grande" (cada 5) con premio extra. */
  big: boolean;
}

export function passReward(level: number): PassReward {
  const big = level % 5 === 0;
  return { level, budget: 150_000 * (1 + Math.floor(level / 5)) * (big ? 3 : 1), points: big ? 1 : 0, big };
}

export function managerLevel(state: GameState): number {
  const mgr = state.userManagerId ? state.managers[state.userManagerId] : null;
  return mgr?.level ?? 0;
}

/** Niveles ya alcanzados y sin reclamar. */
export function claimableLevels(state: GameState): number[] {
  const meta: MetaState | undefined = state.meta;
  const lvl = managerLevel(state);
  const out: number[] = [];
  for (let l = 1; l <= lvl; l++) if (!meta?.passClaimed.includes(l)) out.push(l);
  return out;
}

export function claimPassReward(state: GameState, level: number): PassReward | null {
  if (!claimableLevels(state).includes(level)) return null;
  const club = state.userClubId ? state.clubs[state.userClubId] : null;
  const mgr = state.userManagerId ? state.managers[state.userManagerId] : null;
  if (!club || !mgr) return null;
  const meta = ensureMeta(state);
  const r = passReward(level);
  meta.passClaimed.push(level);
  club.finances.transferBudget += r.budget;
  mgr.points = (mgr.points ?? 0) + r.points;
  if (r.big) {
    pushReveal(state, { kind: 'pass', title: msg('ui.reveal.passT', { n: level }), body: msg('ui.reveal.passB', { budget: r.budget, points: r.points }) });
    addNews(state, { category: 'career', title: msg('news.pass.t', { n: level }), body: msg('news.pass.b', { budget: r.budget }), clubIds: [club.id], importance: 1 });
  }
  if (level >= 10) {
    unlockAchievement(state, 'passTier10');
  }
  return r;
}

/** Reclama de golpe todos los niveles pendientes; devuelve cuántos. */
export function claimAllPass(state: GameState): number {
  let n = 0;
  for (const l of claimableLevels(state)) if (claimPassReward(state, l)) n++;
  return n;
}
