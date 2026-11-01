import { describe, expect, it } from 'vitest';
import {
  CAMP_DAYS,
  Rng,
  SEASON_LENGTH_DAYS,
  academyCapacity,
  academyPlayers,
  activeCamp,
  advanceDay,
  clubPlayers,
  createWorld,
  effectiveIntensity,
  endLoans,
  ensureTrainingPlan,
  ovrTrend,
  prospectsFor,
  sendOnYouthLoan,
  setUserClub,
  signBestProspects,
  signProspect,
  startCamp,
  weeklyTraining,
  type GameState,
} from '../src';

function setup(seed = 37): { g: GameState; clubId: string } {
  const g = createWorld({ seed, season: 2026, loadedCountries: ['ENG'] });
  const club = Object.values(g.clubs).find((c) => c.countryCode === 'ENG' && !c.isUser)!;
  setUserClub(g, club.id, { firstName: 'QA', lastName: 'Bot', nationality: 'ENG' });
  return { g, clubId: club.id };
}

describe('entrenamiento', () => {
  it('el campamento se elige una vez en pretemporada, cuesta dinero y caduca', () => {
    const { g, clubId } = setup();
    const club = g.clubs[clubId];
    club.finances.balance = 1e10;
    g.day = 3;
    const before = club.finances.balance;
    const r = startCamp(g, club, 'fitness');
    expect(r.ok).toBe(true);
    expect(club.finances.balance).toBeLessThan(before);
    expect(activeCamp(g, ensureTrainingPlan(g, club))).toBe('fitness');
    expect(startCamp(g, club, 'tactical')).toEqual({ ok: false, reason: 'active' });
    g.day = CAMP_DAYS + 5;
    expect(activeCamp(g, ensureTrainingPlan(g, club))).toBeNull();
    expect(startCamp(g, club, 'tactical')).toEqual({ ok: false, reason: 'window' });
  });

  it('un campamento aumenta lo que se entrena esa semana', () => {
    const run = (camp: boolean) => {
      const { g, clubId } = setup();
      const club = g.clubs[clubId];
      club.finances.balance = 1e10;
      g.day = 7;
      if (camp) startCamp(g, club, 'technical');
      const squad = clubPlayers(g, clubId).filter((p) => !p.academy);
      weeklyTraining(g, club, squad, new Rng(5));
      return squad.reduce((s, p) => s + (p.trainingXp ?? 0), 0);
    };
    expect(run(true)).toBeGreaterThan(run(false));
  });

  it('la semana de partido baja un escalón la intensidad si hay partido en ≤ 2 días', () => {
    const { g, clubId } = setup();
    const plan = ensureTrainingPlan(g, g.clubs[clubId]);
    plan.intensity = 'hard';
    expect(effectiveIntensity(plan, 1)).toBe('normal');
    expect(effectiveIntensity(plan, 5)).toBe('hard');
    plan.intensity = 'normal';
    expect(effectiveIntensity(plan, 2)).toBe('light');
    plan.autoMatchWeek = false;
    expect(effectiveIntensity(plan, 1)).toBe('normal');
  });

  it('la tendencia se calcula con el histórico mensual', () => {
    const { g, clubId } = setup();
    const p = clubPlayers(g, clubId)[0];
    expect(ovrTrend(p)).toBeNull();
    p.ovrHistory = [60, 61, 61, 63].map((ovr, i) => ({ season: 2026, day: i * 30, ovr }));
    expect(ovrTrend(p, 3)).toBe(3);
  });
});

describe('cantera', () => {
  it('la capacidad crece con las instalaciones juveniles', () => {
    const { g, clubId } = setup();
    const club = g.clubs[clubId];
    club.youthFacilities = 20;
    const base = academyCapacity(club);
    club.youthFacilities = 80;
    expect(academyCapacity(club)).toBeGreaterThan(base);
  });

  it('la cosecha del usuario llega como promesas, no entra sola', () => {
    const { g, clubId } = setup();
    const academyBefore = academyPlayers(g, clubId).length;
    g.day = SEASON_LENGTH_DAYS - 1;
    advanceDay(g, true);
    expect(g.season).toBe(2027);
    expect(academyPlayers(g, clubId).length).toBe(academyBefore);
    expect(prospectsFor(g, clubId).length).toBeGreaterThan(0);
    const signed = signBestProspects(g, g.clubs[clubId]);
    expect(signed).toBeGreaterThan(0);
    expect(academyPlayers(g, clubId).length).toBe(academyBefore + signed);
  });

  it('un canterano cedido gana minutos fuera y vuelve a la academia', () => {
    const { g, clubId } = setup();
    const club = g.clubs[clubId];
    g.day = SEASON_LENGTH_DAYS - 1;
    advanceDay(g, true);
    const [prospect] = prospectsFor(g, clubId);
    signProspect(g, club, prospect.id);
    const r = sendOnYouthLoan(g, club, prospect.id);
    expect(r.ok).toBe(true);
    const p = g.players[prospect.id];
    expect(p.loan?.wasAcademy).toBe(true);
    expect(p.clubId).not.toBe(clubId);
    endLoans(g);
    expect(g.players[prospect.id].clubId).toBe(clubId);
    expect(g.players[prospect.id].academy).toBe(true);
    expect(g.players[prospect.id].loan).toBeNull();
  });
});
