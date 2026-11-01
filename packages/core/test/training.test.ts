import { describe, expect, it } from 'vitest';
import {
  EVENT_CHOICES,
  MAX_GROUPS_PER_COACH,
  PROJECT_REQUIRES,
  Rng,
  TRAINING_GROUPS,
  assignCoach,
  canBuild,
  createWorld,
  defaultTrainingPlan,
  ensureTrainingPlan,
  facilityEffects,
  firstTeam,
  groupOfPlayer,
  migrateState,
  overall,
  pendingTrainingEvents,
  resolveTrainingEvent,
  rollTrainingEvent,
  setIntensity,
  setSessionFocus,
  setUserClub,
  startProject,
  weeklyTraining,
  type GameState,
  type Player,
} from '../src';

function world(seed = 77): { g: GameState; clubId: string } {
  const g = createWorld({ seed, season: 2026, loadedCountries: ['ENG'] });
  const club = Object.values(g.clubs).find((c) => !c.isUser)!;
  setUserClub(g, club.id, { firstName: 'Test', lastName: 'Boss', nationality: 'ENG' });
  return { g, clubId: club.id };
}

function youngTalent(g: GameState, clubId: string): Player {
  const p = firstTeam(g, clubId).find((x) => x.position === 'CM') ?? firstTeam(g, clubId)[5];
  p.age = 18;
  p.potential = Math.min(95, overall(p) + 18);
  p.hidden.professionalism = 80;
  p.injury = null;
  return p;
}

describe('entrenamiento por grupos', () => {
  it('el plan por defecto reparte entrenadores y respeta el límite por entrenador', () => {
    const { g, clubId } = world();
    const club = g.clubs[clubId];
    const plan = defaultTrainingPlan(g, club);
    const assigned = TRAINING_GROUPS.map((k) => plan.groups[k].coachId).filter(Boolean);
    expect(assigned.length).toBeGreaterThan(2);
    // Un mismo entrenador no puede dirigir más de MAX_GROUPS_PER_COACH grupos.
    const coachId = assigned[0] as string;
    club.trainingPlan = plan;
    let ok = 0;
    for (const grp of TRAINING_GROUPS) if (assignCoach(g, club, grp, coachId)) ok++;
    expect(ok).toBeLessThanOrEqual(MAX_GROUPS_PER_COACH + 1);
    const load = TRAINING_GROUPS.filter((k) => club.trainingPlan!.groups[k].coachId === coachId).length;
    expect(load).toBeLessThanOrEqual(MAX_GROUPS_PER_COACH);
  });

  it('un jugador joven mejora despacio y con tope; sin entrenador mejora menos', () => {
    const run = (withCoach: boolean): number => {
      const { g, clubId } = world(91);
      const club = g.clubs[clubId];
      const p = youngTalent(g, clubId);
      const plan = ensureTrainingPlan(g, club);
      const group = groupOfPlayer(p);
      if (!withCoach) plan.groups[group].coachId = null;
      setSessionFocus(g, club, group, 'technical');
      setIntensity(g, club, 'normal');
      const rng = new Rng(5);
      const before = overall(p);
      for (let w = 0; w < 40; w++) weeklyTraining(g, club, [p], rng);
      return overall(p) - before;
    };
    const coached = run(true);
    const alone = run(false);
    expect(coached).toBeGreaterThanOrEqual(alone);
    expect(coached).toBeLessThanOrEqual(6); // lento: nunca un salto absurdo en una temporada
    expect(alone).toBeLessThanOrEqual(3);
  });

  it('los veteranos casi no progresan con el entrenamiento', () => {
    const { g, clubId } = world(12);
    const club = g.clubs[clubId];
    const p = firstTeam(g, clubId)[3];
    p.age = 34;
    p.injury = null;
    ensureTrainingPlan(g, club);
    const rng = new Rng(8);
    const before = overall(p);
    for (let w = 0; w < 40; w++) weeklyTraining(g, club, [p], rng);
    expect(overall(p) - before).toBeLessThanOrEqual(0);
  });

  it('es determinista con la misma semilla', () => {
    const play = (): number[] => {
      const { g, clubId } = world(33);
      const club = g.clubs[clubId];
      const squad = firstTeam(g, clubId);
      ensureTrainingPlan(g, club);
      const rng = new Rng(2);
      for (let w = 0; w < 6; w++) weeklyTraining(g, club, squad, rng);
      return squad.slice(0, 8).map((p) => Math.round(p.attrs.passing * 100));
    };
    expect(play()).toEqual(play());
  });

  it('la intensidad dura sube el riesgo de lesión y baja la forma física', () => {
    const measure = (intensity: 'light' | 'hard'): { injured: number; fitness: number } => {
      const { g, clubId } = world(44);
      const club = g.clubs[clubId];
      const squad = firstTeam(g, clubId);
      for (const p of squad) {
        p.injury = null;
        p.fitness = 90;
      }
      ensureTrainingPlan(g, club);
      setIntensity(g, club, intensity);
      const rng = new Rng(3);
      let injured = 0;
      for (let w = 0; w < 25; w++) injured += weeklyTraining(g, club, squad, rng).injured.length;
      return { injured, fitness: squad.reduce((s, p) => s + p.fitness, 0) / squad.length };
    };
    const light = measure('light');
    const hard = measure('hard');
    expect(hard.injured).toBeGreaterThanOrEqual(light.injured);
    expect(hard.fitness).toBeLessThan(light.fitness);
  });
});

describe('eventos semanales', () => {
  it('generan decisiones y se resuelven sin romper el estado', () => {
    const { g, clubId } = world(5);
    const club = g.clubs[clubId];
    const squad = firstTeam(g, clubId);
    for (const p of squad.slice(0, 4)) {
      p.age = 33;
      p.attrs.leadership = 80;
    }
    for (const p of squad.slice(10, 14)) {
      p.age = 18;
      p.potential = 90;
    }
    const rng = new Rng(21);
    g.day = 40; // mismo día: los eventos no caducan durante la prueba
    for (let w = 0; w < 80; w++) rollTrainingEvent(g, club, squad, rng);
    const pending = pendingTrainingEvents(g);
    expect(pending.length).toBeGreaterThan(0);
    for (const ev of pending) {
      const choice = EVENT_CHOICES[ev.kind][0];
      expect(resolveTrainingEvent(g, ev.id, choice, new Rng(1))).not.toBe('none');
      expect(ev.resolved).toBe(true);
    }
    // Resolver dos veces no tiene efecto.
    expect(resolveTrainingEvent(g, pending[0].id, 'ignore')).toBe('none');
  });
});

describe('instalaciones ampliadas', () => {
  it('respetan prerrequisitos, cuestan dinero y mejoran los efectos', () => {
    const { g, clubId } = world(9);
    const club = g.clubs[clubId];
    club.trainingFacilities = 20; // nivel 1
    expect(PROJECT_REQUIRES.gym).toBeTruthy();
    expect(canBuild(club, 'gym')).toBe(false);
    club.trainingFacilities = 60; // nivel 3
    expect(canBuild(club, 'gym')).toBe(true);
    const before = facilityEffects(club);
    club.finances.transferBudget = 1e9;
    startProject(g, club, 'gym');
    club.projects[0].daysLeft = 1;
    // Termina la obra.
    for (let i = 0; i < 2; i++) club.projects.forEach((p) => p.daysLeft--);
    club.facilities.gym = 2;
    const after = facilityEffects(club);
    expect(after.training).toBeGreaterThan(before.training);
    expect(after.injuryMult).toBeLessThan(before.injuryMult);
  });

  it('una partida v3 migra a v4 con instalaciones y eventos por defecto', () => {
    const { g } = world(3);
    (g as unknown as { version: number }).version = 3;
    for (const c of Object.values(g.clubs)) {
      const f = c.facilities as unknown as Record<string, unknown>;
      delete f.gym;
      delete f.videoAnalysis;
    }
    delete (g as unknown as Record<string, unknown>).trainingEvents;
    const s = migrateState(g);
    expect(s.version).toBe(4);
    expect(s.trainingEvents).toEqual([]);
    for (const c of Object.values(s.clubs)) expect(c.facilities.gym).toBe(0);
  });
});
