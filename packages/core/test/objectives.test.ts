import { describe, expect, it } from 'vitest';
import { Rng, createWorld, refreshObjectives, setUserClub, spendManagerPoint, updateObjectives, userManager, type GameState, type StoredMatch } from '../src';

function setup(): { g: GameState; clubId: string } {
  const g = createWorld({ seed: 123, season: 2026, loadedCountries: ['ENG'] });
  const club = Object.values(g.clubs).find((c) => !c.isUser)!;
  setUserClub(g, club.id, { firstName: 'Mis', lastName: 'Ion', nationality: 'ENG' });
  return { g, clubId: club.id };
}

function fakeMatch(g: GameState, clubId: string, day: number, gf: number, ga: number): StoredMatch {
  const other = Object.values(g.clubs).find((c) => c.id !== clubId)!;
  return {
    fixtureId: `f${day}`,
    competitionId: 'x',
    competitionName: 'League',
    season: g.season,
    day,
    homeId: clubId,
    awayId: other.id,
    result: { homeGoals: gf, awayGoals: ga } as StoredMatch['result'],
  };
}

describe('misiones', () => {
  it('se crean 3 de temporada y 2 semanales, sin duplicar tipos semanales', () => {
    const { g, clubId } = setup();
    refreshObjectives(g, g.clubs[clubId], new Rng(1));
    expect(g.objectives.filter((o) => o.scope === 'season')).toHaveLength(3);
    const weekly = g.objectives.filter((o) => o.scope === 'week');
    expect(weekly).toHaveLength(2);
    expect(new Set(weekly.map((o) => o.kind)).size).toBe(2);
    // Llamarlo otra vez no crea más.
    refreshObjectives(g, g.clubs[clubId], new Rng(2));
    expect(g.objectives).toHaveLength(5);
  });

  it('cumplir una misión da presupuesto, XP y puntos; los puntos mejoran habilidades', () => {
    const { g, clubId } = setup();
    const club = g.clubs[clubId];
    g.day = 10;
    refreshObjectives(g, club, new Rng(3));
    const o = g.objectives.find((x) => x.scope === 'week')!;
    o.kind = 'winMatches';
    o.target = 2;
    o.endDay = 40;
    g.userMatches.push(fakeMatch(g, clubId, 11, 2, 0), fakeMatch(g, clubId, 13, 1, 0));
    const before = club.finances.transferBudget;
    updateObjectives(g);
    expect(o.status).toBe('done');
    expect(club.finances.transferBudget).toBeGreaterThan(before);
    const m = userManager(g)!;
    expect(m.xp).toBeGreaterThan(0);
    m.points = 1;
    const skill = m.tacticalKnowledge;
    expect(spendManagerPoint(g, 'tacticalKnowledge')).toBe(true);
    expect(m.tacticalKnowledge).toBeGreaterThan(skill);
    expect(spendManagerPoint(g, 'tacticalKnowledge')).toBe(false);
  });

  it('una misión semanal caduca como fallida', () => {
    const { g, clubId } = setup();
    g.day = 10;
    refreshObjectives(g, g.clubs[clubId], new Rng(4));
    const o = g.objectives.find((x) => x.scope === 'week')!;
    o.target = 99;
    o.endDay = 15;
    g.day = 20;
    updateObjectives(g);
    // Las semanales caducadas desaparecen (no ensucian la lista).
    expect(g.objectives.some((x) => x.id === o.id)).toBe(false);
  });

  it('sin partidos esa semana no se crean misiones semanales', () => {
    const { g, clubId } = setup();
    g.day = 10;
    refreshObjectives(g, g.clubs[clubId], new Rng(9), 0);
    expect(g.objectives.filter((x) => x.scope === 'week')).toHaveLength(0);
    refreshObjectives(g, g.clubs[clubId], new Rng(9), 1);
    expect(g.objectives.filter((x) => x.scope === 'week')).toHaveLength(1);
  });
});
