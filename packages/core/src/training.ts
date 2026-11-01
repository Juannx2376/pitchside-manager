// Entrenamiento por grupos con sesión semanal (estilo EA FC / FIFA Manager).
//
// El usuario asigna un entrenador y un enfoque a cada grupo de la plantilla (porteros, defensas, medios,
// ataque y jóvenes) y elige la intensidad. Cada semana cada jugador recibe una pequeña mejora de atributos
// que depende del entrenador (calidad, afinidad con el grupo y especialidad), de las instalaciones, de la
// edad, de la profesionalidad y del margen que le queda hasta su potencial. La mejora es deliberadamente
// lenta: un joven brillante con un buen cuerpo técnico gana ~1.5-2 puntos de media por temporada extra.
import type { AttrKey } from './attributes';
import { POSITION_WEIGHTS } from './attributes';
import type { Club } from './club';
import { facilityEffects } from './facilities';
import { GROWTH_PLANS, PLAN_TRAINING_BONUS } from './growthPlans';
import { msg } from './i18n';
import { record } from './finance';
import { perkEffects } from './perks';
import { applyInjury, overall, rollInjury, type Player } from './player';
import type { Rng } from './rng';
import { addNews, newId, type GameState } from './state';
import type { StaffMember, StaffRole } from './staff';
import { POSITION_GROUP, clamp, type Id } from './types';

export const TRAINING_GROUPS = ['gk', 'def', 'mid', 'att', 'youth'] as const;
export type TrainingGroup = (typeof TRAINING_GROUPS)[number];

export const SESSION_FOCUSES = ['technical', 'tactical', 'physical', 'mental', 'setPieces', 'recovery'] as const;
export type SessionFocus = (typeof SESSION_FOCUSES)[number];

export const TRAINING_INTENSITIES = ['light', 'normal', 'hard'] as const;
export type TrainingIntensity = (typeof TRAINING_INTENSITIES)[number];

export interface TrainingGroupPlan {
  coachId: Id | null;
  focus: SessionFocus;
}

export interface TrainingReportRow {
  playerId: Id;
  group: TrainingGroup;
  /** Puntos de media ganados esta semana (décimas). */
  gain: number;
}

export interface WeeklyTrainingReport {
  season: number;
  day: number;
  rows: TrainingReportRow[];
  injured: Id[];
  /** Eficiencia media (0-1) de los grupos con entrenador. */
  efficiency: number;
}

export const TRAINING_CAMPS = ['fitness', 'tactical', 'technical'] as const;
export type TrainingCamp = (typeof TRAINING_CAMPS)[number];

export interface TrainingPlan {
  groups: Record<TrainingGroup, TrainingGroupPlan>;
  intensity: TrainingIntensity;
  lastReport: WeeklyTrainingReport | null;
  /** Campamento de pretemporada elegido (sólo vale la temporada en campSeason). */
  camp?: TrainingCamp | null;
  campSeason?: number;
  /** Baja la intensidad un escalón cuando hay partido en 2 días. */
  autoMatchWeek?: boolean;
}

/** Eventos de la semana que piden una decisión. */
export type TrainingEventKind = 'clash' | 'mentor' | 'extraTraining' | 'coachRaise';
export interface TrainingEvent {
  id: Id;
  kind: TrainingEventKind;
  season: number;
  day: number;
  playerId: Id;
  otherPlayerId?: Id;
  staffId?: Id;
  resolved: boolean;
  /** Clave de la decisión tomada. */
  choice?: string;
}

/** Roles de staff que pueden dirigir una sesión y con qué afinidad por grupo (1 = especialista). */
const AFFINITY: Record<TrainingGroup, Partial<Record<StaffRole, number>>> = {
  gk: { gkCoach: 1, assistant: 0.55 },
  def: { defenceCoach: 1, fitnessCoach: 0.7, assistant: 0.8 },
  mid: { assistant: 0.9, attackCoach: 0.75, defenceCoach: 0.75, fitnessCoach: 0.7 },
  att: { attackCoach: 1, assistant: 0.8, fitnessCoach: 0.6 },
  youth: { youthCoach: 1, assistant: 0.75, attackCoach: 0.6, defenceCoach: 0.6 },
};

/** Atributos que trabaja cada enfoque (los porteros usan su propio conjunto). */
const FOCUS_POOL: Record<SessionFocus, AttrKey[]> = {
  technical: ['passing', 'dribbling', 'firstTouch', 'finishing', 'crossing', 'longShots', 'heading'],
  tactical: ['positioning', 'decisions', 'marking', 'vision', 'teamwork', 'tackling'],
  physical: ['pace', 'acceleration', 'stamina', 'strength', 'agility', 'jumping'],
  mental: ['composure', 'decisions', 'workRate', 'leadership', 'teamwork'],
  setPieces: ['setPieces', 'longShots', 'crossing', 'heading'],
  recovery: [],
};
const GK_POOL: Record<SessionFocus, AttrKey[]> = {
  technical: ['reflexes', 'handling', 'oneOnOnes'],
  tactical: ['positioning', 'decisions', 'oneOnOnes'],
  physical: ['jumping', 'agility', 'reflexes'],
  mental: ['composure', 'decisions', 'leadership'],
  setPieces: ['handling', 'passing'],
  recovery: [],
};

const INTENSITY: Record<TrainingIntensity, { xp: number; injury: number; fitness: number }> = {
  light: { xp: 0.65, injury: 0.5, fitness: 1.5 },
  normal: { xp: 1, injury: 1, fitness: 0 },
  hard: { xp: 1.35, injury: 2.1, fitness: -2.5 },
};

/** Días de pretemporada en los que se puede elegir y en los que actúa el campamento. */
export const CAMP_DAYS = 28;

const CAMPS: Record<TrainingCamp, { focus: SessionFocus; xp: number; injury: number; fitness: number }> = {
  fitness: { focus: 'physical', xp: 1.4, injury: 1.35, fitness: 3 },
  tactical: { focus: 'tactical', xp: 1.35, injury: 1, fitness: 0 },
  technical: { focus: 'technical', xp: 1.35, injury: 1, fitness: 0 },
};

/** Tope semanal de mejora de media por jugador (antes de modificadores): hace el progreso lento. */
const WEEKLY_POINTS = 0.04;

export const MAX_GROUPS_PER_COACH = 2;

const TRAINERS: StaffRole[] = ['assistant', 'gkCoach', 'fitnessCoach', 'attackCoach', 'defenceCoach', 'youthCoach'];

/** ¿Este miembro del staff puede dirigir sesiones? */
export function isTrainer(m: StaffMember): boolean {
  return (TRAINERS as StaffRole[]).includes(m.role);
}

export function groupOfPlayer(p: Player): TrainingGroup {
  if (p.age <= 20) return 'youth';
  const g = POSITION_GROUP[p.position];
  return g === 'GK' ? 'gk' : g === 'DEF' ? 'def' : g === 'MID' ? 'mid' : 'att';
}

/** Afinidad (0-1) de un entrenador con un grupo; un rol ajeno al grupo rinde poco. */
export function coachAffinity(coach: StaffMember | null | undefined, group: TrainingGroup): number {
  if (!coach) return 0;
  return AFFINITY[group][coach.role] ?? 0.45;
}

/** Grupos que dirige cada entrenador según el plan. */
export function coachLoad(plan: TrainingPlan): Map<Id, TrainingGroup[]> {
  const load = new Map<Id, TrainingGroup[]>();
  for (const g of TRAINING_GROUPS) {
    const id = plan.groups[g].coachId;
    if (!id) continue;
    const arr = load.get(id) ?? [];
    arr.push(g);
    load.set(id, arr);
  }
  return load;
}

/** Eficiencia (0-1.25) de una sesión: calidad del entrenador × afinidad × reparto de carga × especialidad. */
export function sessionEfficiency(state: GameState, club: Club, plan: TrainingPlan, group: TrainingGroup): number {
  const gp = plan.groups[group];
  const coach = gp.coachId ? state.staff[gp.coachId] : undefined;
  if (!coach || coach.clubId !== club.id) return 0.28; // sin entrenador: sesión de autogestión
  const load = coachLoad(plan).get(coach.id)?.length ?? 1;
  const loadF = Math.max(0.55, 1 - 0.2 * (load - 1));
  const quality = 0.35 + (coach.ability / 100) * 0.9;
  const spec = coach.focusStyle && coach.focusStyle === gp.focus ? 1.15 : 1;
  return clamp(quality * (0.45 + 0.55 * coachAffinity(coach, group)) * loadF * spec, 0.15, 1.25);
}

/** Plan por defecto: reparte los entrenadores disponibles por afinidad. */
export function defaultTrainingPlan(state: GameState, club: Club): TrainingPlan {
  const plan: TrainingPlan = {
    groups: {
      gk: { coachId: null, focus: 'technical' },
      def: { coachId: null, focus: 'tactical' },
      mid: { coachId: null, focus: 'technical' },
      att: { coachId: null, focus: 'technical' },
      youth: { coachId: null, focus: 'technical' },
    },
    intensity: 'normal',
    lastReport: null,
  };
  const coaches = (club.staffIds ?? []).map((id) => state.staff[id]).filter((m): m is StaffMember => !!m && isTrainer(m));
  const used = new Map<Id, number>();
  for (const g of TRAINING_GROUPS) {
    const ranked = [...coaches]
      .filter((c) => (used.get(c.id) ?? 0) < 1)
      .sort((a, b) => coachAffinity(b, g) * (0.5 + b.ability / 200) - coachAffinity(a, g) * (0.5 + a.ability / 200));
    const best = ranked[0] ?? [...coaches].sort((a, b) => coachAffinity(b, g) - coachAffinity(a, g))[0];
    if (best) {
      plan.groups[g].coachId = best.id;
      used.set(best.id, (used.get(best.id) ?? 0) + 1);
    }
  }
  return plan;
}

/** Garantiza un plan válido (partidas antiguas, entrenadores despedidos…). */
export function ensureTrainingPlan(state: GameState, club: Club): TrainingPlan {
  if (!club.trainingPlan) club.trainingPlan = defaultTrainingPlan(state, club);
  const plan = club.trainingPlan;
  for (const g of TRAINING_GROUPS) {
    const gp = (plan.groups[g] ??= { coachId: null, focus: g === 'def' ? 'tactical' : 'technical' });
    if (gp.coachId && (!state.staff[gp.coachId] || state.staff[gp.coachId].clubId !== club.id)) gp.coachId = null;
    if (!SESSION_FOCUSES.includes(gp.focus)) gp.focus = 'technical';
  }
  if (!TRAINING_INTENSITIES.includes(plan.intensity)) plan.intensity = 'normal';
  plan.lastReport ??= null;
  plan.autoMatchWeek ??= true;
  plan.camp ??= null;
  return plan;
}

/** Campamento activo ahora (sólo en los primeros CAMP_DAYS de la temporada en que se eligió). */
export function activeCamp(state: GameState, plan: TrainingPlan): TrainingCamp | null {
  return plan.camp && plan.campSeason === state.season && state.day <= CAMP_DAYS ? plan.camp : null;
}

/** Coste de un campamento: ~1,5 semanas de la masa salarial de la plantilla. */
export function campCost(state: GameState, club: Club): number {
  const bill = (club.playerIds ?? []).reduce((s, id) => s + (state.players[id]?.contract?.wage ?? 0), 0);
  return Math.round(bill * 1.5);
}

export type CampResult = { ok: true; cost: number } | { ok: false; reason: 'window' | 'active' | 'broke' };

/** Elige el campamento de pretemporada (una vez por temporada, en los primeros días) y paga su coste. */
export function startCamp(state: GameState, club: Club, camp: TrainingCamp): CampResult {
  const plan = ensureTrainingPlan(state, club);
  if (state.day > CAMP_DAYS) return { ok: false, reason: 'window' };
  if (plan.camp && plan.campSeason === state.season) return { ok: false, reason: 'active' };
  const cost = campCost(state, club);
  if (club.finances.balance < cost) return { ok: false, reason: 'broke' };
  record(club.finances, 'maintenance', cost);
  plan.camp = camp;
  plan.campSeason = state.season;
  return { ok: true, cost };
}

/** Intensidad efectiva de la semana: baja un escalón si hay partido en ≤ 2 días y el plan lo permite. */
export function effectiveIntensity(plan: TrainingPlan, nextMatchInDays: number | null): TrainingIntensity {
  if (!plan.autoMatchWeek || nextMatchInDays === null || nextMatchInDays > 2) return plan.intensity;
  return plan.intensity === 'hard' ? 'normal' : 'light';
}

/** Cambio de media en los últimos months meses (null si aún no hay histórico). */
export function ovrTrend(p: Player, months = 3): number | null {
  const h = p.ovrHistory;
  if (!h || h.length < 2) return null;
  return h[h.length - 1].ovr - h[Math.max(0, h.length - 1 - months)].ovr;
}

/** Asigna (o quita) el entrenador de un grupo. Un entrenador dirige como mucho `MAX_GROUPS_PER_COACH` grupos. */
export function assignCoach(state: GameState, club: Club, group: TrainingGroup, coachId: Id | null): boolean {
  const plan = ensureTrainingPlan(state, club);
  if (coachId) {
    const m = state.staff[coachId];
    if (!m || m.clubId !== club.id || !isTrainer(m)) return false;
    const others = coachLoad(plan).get(coachId)?.filter((g) => g !== group).length ?? 0;
    if (others >= MAX_GROUPS_PER_COACH) return false;
  }
  plan.groups[group].coachId = coachId;
  return true;
}

export function setSessionFocus(state: GameState, club: Club, group: TrainingGroup, focus: SessionFocus): void {
  ensureTrainingPlan(state, club).groups[group].focus = focus;
}

export function setIntensity(state: GameState, club: Club, intensity: TrainingIntensity): void {
  ensureTrainingPlan(state, club).intensity = intensity;
}

/** Cuánto aprovecha un jugador una semana de sesión (0-~1.3): edad, profesionalidad, margen y minutos. */
export function learnerFactor(p: Player): number {
  const age = p.age;
  const ageF = age <= 19 ? 1.25 : age <= 22 ? 1 : age <= 25 ? 0.7 : age <= 28 ? 0.38 : age <= 31 ? 0.14 : age <= 33 ? 0.05 : 0;
  const prof = 0.6 + (0.8 * p.hidden.professionalism) / 100;
  const ca = overall(p);
  const room = clamp((p.potential - ca) / 10, 0, 1);
  return ageF * prof * room;
}

/** Mejora esperada semanal (puntos de media) de un jugador con un plan y eficiencia dados. */
export function weeklyGainEstimate(p: Player, efficiency: number, intensity: TrainingIntensity, facility: number): number {
  return WEEKLY_POINTS * learnerFactor(p) * efficiency * INTENSITY[intensity].xp * facility;
}

export function absWeek(state: GameState): number {
  return state.season * 60 + Math.floor(state.day / 7);
}

/**
 * Sesión semanal del club del usuario. Devuelve el informe (también queda en `club.trainingPlan.lastReport`).
 * Toda la aleatoriedad pasa por `rng`.
 */
export function weeklyTraining(state: GameState, club: Club, players: Player[], rng: Rng, ctx: { nextMatchInDays: number | null } = { nextMatchInDays: null }): WeeklyTrainingReport {
  const plan = ensureTrainingPlan(state, club);
  const fx = facilityEffects(club);
  const perks = perkEffects(state);
  const intensity = effectiveIntensity(plan, ctx.nextMatchInDays);
  const camp = activeCamp(state, plan);
  const campFx = camp ? CAMPS[camp] : null;
  const inten = INTENSITY[intensity];
  const week = absWeek(state);
  const rows: TrainingReportRow[] = [];
  const injured: Id[] = [];
  const effByGroup = {} as Record<TrainingGroup, number>;
  for (const g of TRAINING_GROUPS) effByGroup[g] = sessionEfficiency(state, club, plan, g);

  for (const p of players) {
    if (p.retired || p.loan) continue;
    const group = groupOfPlayer(p);
    const focus = campFx ? campFx.focus : plan.groups[group].focus;
    const eff = effByGroup[group];

    if (p.injury) {
      // Lesionados: sólo trabajo de recuperación (más rápido con buen fisio e instalaciones).
      p.injury.daysOut -= 0.35 * fx.recovery * eff * (1 + perks.recovery);
      continue;
    }

    if (focus === 'recovery') {
      p.fitness = clamp(p.fitness + 4 * fx.recovery, 0, 100);
      continue;
    }
    p.fitness = clamp(p.fitness + (campFx?.fitness ?? 0) + inten.fitness * (inten.fitness < 0 ? 1 / Math.max(0.6, fx.recovery) : 1), 0, 100);

    // Riesgo de lesión de entrenamiento: sube con la intensidad y con el cansancio, baja con fisio e instalaciones.
    const tired = p.fitness < 60 ? 1.6 : 1;
    const risk = 0.0032 * inten.injury * (campFx?.injury ?? 1) * tired * (0.4 + p.hidden.injuryProneness / 70) * fx.injuryMult;
    if (rng.chance(risk)) {
      const inj = rollInjury(rng, p);
      inj.daysOut = Math.max(2, Math.round(inj.daysOut * 0.55));
      applyInjury(p, inj, rng);
      injured.push(p.id);
      addNews(state, {
        category: 'injury',
        title: msg('news.trainingInjury.t', { p: `${p.firstName} ${p.lastName}`, injury: msg(`injury.${inj.name}`) }),
        body: msg('news.trainingInjury.b', { days: inj.daysOut }),
        clubIds: [club.id],
        playerId: p.id,
        importance: 2,
      });
      continue;
    }

    // Mejora de atributos del enfoque.
    const boost = p.trainingBoost && p.trainingBoost.untilWeek >= week ? p.trainingBoost.mult : 1;
    const mentor = p.mentorId && state.players[p.mentorId] && !state.players[p.mentorId].retired ? 1.12 : 1;
    const gp = p.growthPlan ? GROWTH_PLANS[p.growthPlan.plan] : null;
    const planMult = gp ? 1 + (PLAN_TRAINING_BONUS - 1) * (1 + perks.plan) : 1;
    const youthMult = p.age <= 21 ? 1 + perks.youth : 1;
    const gain = weeklyGainEstimate(p, eff, intensity, fx.training) * (campFx?.xp ?? 1) * boost * mentor * planMult * youthMult * (1 + perks.training) * (0.8 + rng.float(0, 0.4));
    if (gain > 0) {
      // Con un plan de crecimiento la mitad de las sesiones se orienta a sus atributos objetivo.
      const basePool = (group === 'gk' ? GK_POOL : FOCUS_POOL)[focus];
      const pool = gp ? [...basePool, ...gp.targets, ...gp.targets] : basePool;
      const weights = POSITION_WEIGHTS[p.position] as Partial<Record<AttrKey, number>>;
      const rel = pool.map((k) => ({ k, w: 0.3 + (weights[k] ?? 0) }));
      const total = rel.reduce((s, r) => s + r.w, 0) || 1;
      let applied = 0;
      for (const r of rel) {
        const d = (gain * 3.2 * r.w) / total; // un punto de media ≈ 3 puntos repartidos entre ~6 atributos
        const before = p.attrs[r.k];
        p.attrs[r.k] = clamp(before + d * rng.float(0.7, 1.3), 1, 99);
        applied += p.attrs[r.k] - before;
      }
      p.trainingXp = (p.trainingXp ?? 0) + gain;
      if (applied > 0) rows.push({ playerId: p.id, group, gain: Math.round(gain * 100) / 100 });
    }
    // Sesión táctica: sube la familiaridad con el rol y con el sistema.
    if (focus === 'tactical') {
      const idx = club.tactic.lineup.indexOf(p.id);
      const role = idx >= 0 ? club.tactic.tactic.roles[idx] : undefined;
      if (role && role !== 'default') {
        const fam = (p.roleFamiliarity ??= {});
        fam[role] = clamp((fam[role] ?? 40) + 1.4 * eff * fx.video * (1 + perks.tacticalFam), 0, 100);
      }
    }
  }
  if (TRAINING_GROUPS.some((g) => plan.groups[g].focus === 'tactical')) {
    club.tacticFamiliarity = clamp((club.tacticFamiliarity ?? 60) + 0.5 * fx.video, 0, 100);
  }

  // Los entrenadores también aprenden (muy despacio) mientras dirigen sesiones.
  for (const [cid, groups] of coachLoad(plan)) {
    const c = state.staff[cid];
    if (!c || c.age >= 62) continue;
    c.xp = (c.xp ?? 0) + groups.length;
    if (c.xp >= 14) {
      c.xp = 0;
      c.ability = Math.min(95, c.ability + 1);
    }
  }

  rows.sort((a, b) => b.gain - a.gain);
  const effs = TRAINING_GROUPS.filter((g) => plan.groups[g].coachId).map((g) => effByGroup[g]);
  const report: WeeklyTrainingReport = {
    season: state.season,
    day: state.day,
    rows: rows.slice(0, 24),
    injured,
    efficiency: effs.length ? effs.reduce((s, v) => s + v, 0) / effs.length : 0.28,
  };
  plan.lastReport = report;
  return report;
}

// ───────────────────────── Eventos semanales ─────────────────────────

const EVENT_WEIGHTS: { kind: TrainingEventKind; w: number }[] = [
  { kind: 'clash', w: 3 },
  { kind: 'mentor', w: 3 },
  { kind: 'extraTraining', w: 3 },
  { kind: 'coachRaise', w: 1.2 },
];

export function pendingTrainingEvents(state: GameState): TrainingEvent[] {
  return (state.trainingEvents ?? []).filter((e) => !e.resolved);
}

/** Como mucho un evento nuevo por semana; caducan a las dos semanas (se resuelven como «ignorar»). */
export function rollTrainingEvent(state: GameState, club: Club, players: Player[], rng: Rng): TrainingEvent | null {
  state.trainingEvents ??= [];
  // Caducidad: se archivan los viejos y los resueltos antiguos.
  for (const e of state.trainingEvents) {
    if (!e.resolved && (state.season - e.season) * 400 + state.day - e.day > 14) resolveTrainingEvent(state, e.id, 'ignore');
  }
  state.trainingEvents = state.trainingEvents.filter((e) => !e.resolved || (state.season - e.season) * 400 + state.day - e.day <= 56);
  const list = state.trainingEvents;
  if (pendingTrainingEvents(state).length >= 3 || !rng.chance(0.42)) return null;
  const squad = players.filter((p) => !p.academy && !p.retired && !p.loan);
  if (squad.length < 8) return null;
  const kind = rng.weightedPick(EVENT_WEIGHTS, (e) => e.w).kind;
  const ev: TrainingEvent = { id: newId(state, 'te'), kind, season: state.season, day: state.day, playerId: '', resolved: false };
  if (kind === 'clash') {
    const a = rng.pick(squad);
    const others = squad.filter((p) => p.id !== a.id && (POSITION_GROUP[p.position] === POSITION_GROUP[a.position] || rng.chance(0.3)));
    if (!others.length) return null;
    ev.playerId = a.id;
    ev.otherPlayerId = rng.pick(others).id;
  } else if (kind === 'mentor') {
    const vets = squad.filter((p) => p.age >= 30 && p.attrs.leadership >= 55);
    const kids = squad.filter((p) => p.age <= 21 && p.potential - overall(p) >= 6 && !p.mentorId);
    if (!vets.length || !kids.length) return null;
    ev.playerId = rng.pick(vets).id;
    ev.otherPlayerId = rng.pick(kids).id;
  } else if (kind === 'extraTraining') {
    const eager = squad.filter((p) => p.age <= 26 && p.hidden.professionalism >= 60 && p.potential - overall(p) >= 4);
    if (!eager.length) return null;
    ev.playerId = rng.pick(eager).id;
  } else {
    const coaches = (club.staffIds ?? []).map((id) => state.staff[id]).filter((m): m is StaffMember => !!m && isTrainer(m));
    if (!coaches.length) return null;
    const c = rng.pick(coaches);
    ev.staffId = c.id;
    ev.playerId = '';
  }
  list.unshift(ev);
  addNews(state, { category: 'staff', title: msg(`news.tev.${kind}.t`), body: msg(`news.tev.${kind}.b`), clubIds: [club.id], importance: 2 });
  return ev;
}

/** Decisiones válidas de cada tipo de evento. */
export const EVENT_CHOICES: Record<TrainingEventKind, string[]> = {
  clash: ['mediate', 'punish', 'ignore'],
  mentor: ['accept', 'decline'],
  extraTraining: ['grant', 'refuse'],
  coachRaise: ['pay', 'refuse'],
};

/** Aplica la decisión del usuario. Usa `rng` para el resultado probabilístico. Devuelve la clave de resultado. */
export function resolveTrainingEvent(state: GameState, eventId: Id, choice: string, rng?: Rng): string {
  const ev = (state.trainingEvents ?? []).find((e) => e.id === eventId);
  if (!ev || ev.resolved) return 'none';
  ev.resolved = true;
  ev.choice = choice;
  const a = state.players[ev.playerId];
  const b = ev.otherPlayerId ? state.players[ev.otherPlayerId] : undefined;
  const club = state.userClubId ? state.clubs[state.userClubId] : null;
  const roll = (p: number) => (rng ? rng.chance(p) : p >= 0.5);
  const week = absWeek(state);
  switch (ev.kind) {
    case 'clash': {
      if (!a || !b || !club) return 'none';
      if (choice === 'mediate') {
        const ok = roll(0.65);
        a.morale = clamp(a.morale + (ok ? 6 : -3), 0, 100);
        b.morale = clamp(b.morale + (ok ? 6 : -3), 0, 100);
        club.chemistry = clamp(club.chemistry + (ok ? 2 : -1), 0, 100);
        return ok ? 'mediated' : 'failed';
      }
      if (choice === 'punish') {
        const [culprit, other] = a.morale <= b.morale ? [a, b] : [b, a];
        culprit.morale = clamp(culprit.morale - 8, 0, 100);
        other.morale = clamp(other.morale + 3, 0, 100);
        club.chemistry = clamp(club.chemistry + 1, 0, 100);
        return 'punished';
      }
      a.morale = clamp(a.morale - 4, 0, 100);
      b.morale = clamp(b.morale - 4, 0, 100);
      club.chemistry = clamp(club.chemistry - 3, 0, 100);
      return 'ignored';
    }
    case 'mentor': {
      if (!a || !b) return 'none';
      if (choice === 'accept') {
        b.mentorId = a.id;
        a.morale = clamp(a.morale + 5, 0, 100);
        b.morale = clamp(b.morale + 4, 0, 100);
        return 'accepted';
      }
      a.morale = clamp(a.morale - 2, 0, 100);
      return 'declined';
    }
    case 'extraTraining': {
      if (!a) return 'none';
      if (choice === 'grant') {
        a.trainingBoost = { untilWeek: week + 4, mult: 1.6 };
        a.fitness = clamp(a.fitness - 6, 0, 100);
        a.morale = clamp(a.morale + 4, 0, 100);
        return 'granted';
      }
      a.morale = clamp(a.morale - 4, 0, 100);
      return 'refused';
    }
    case 'coachRaise': {
      const m = ev.staffId ? state.staff[ev.staffId] : undefined;
      if (!m || !club) return 'none';
      if (choice === 'pay') {
        m.wage = Math.round(m.wage * 1.12);
        return 'paid';
      }
      if (roll(0.3)) {
        m.clubId = null;
        club.staffIds = club.staffIds.filter((id) => id !== m.id);
        return 'quit';
      }
      return 'stayed';
    }
  }
}
