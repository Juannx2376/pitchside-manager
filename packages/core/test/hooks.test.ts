import { describe, expect, it } from 'vitest';
import {
  GROWTH_PLANS,
  PERKS,
  PLAN_GOAL_POINTS,
  Rng,
  acceptAgentOffer,
  advanceDay,
  buildHighlights,
  buyPerk,
  cardOf,
  claimAllPass,
  claimableLevels,
  clubLegends,
  clubRecords,
  createWorld,
  currentStreaks,
  daysToDeadline,
  ensureMeta,
  matchStory,
  perkEffects,
  planProgress,
  plansForPosition,
  potentialView,
  processGrowthPlans,
  processMarketDay,
  recentRuns,
  refreshDeadlineDeals,
  setUserClub,
  startGrowthPlan,
  unlockAchievement,
  userManager,
  weeklyTraining,
  clubPlayers,
  ensureTrainingPlan,
  type GameState,
  type MatchEvent,
  type MatchResult,
  type StoredMatch,
} from '../src';

function setup(): { g: GameState; clubId: string } {
  const g = createWorld({ seed: 77, season: 2026, loadedCountries: ['ENG'] });
  const club = Object.values(g.clubs).find((c) => !c.isUser)!;
  setUserClub(g, club.id, { firstName: 'Hook', lastName: 'Tester', nationality: 'ENG' });
  return { g, clubId: club.id };
}

function ev(minute: number, type: MatchEvent['type'], side: 'home' | 'away', score: [number, number], xg = 0): MatchEvent {
  return { minute, type, side, msg: { k: 'mc.goal', p: {} }, score, xg };
}

function fakeResult(events: MatchEvent[], h: number, a: number): MatchResult {
  const stats = { possession: 50, shots: 10, onTarget: 4, xg: 1, fouls: 0, yellows: 0, reds: 0, corners: 0, offsides: 0, passes: 0 };
  return {
    homeGoals: h,
    awayGoals: a,
    events,
    frames: [],
    stats: { home: { ...stats, xg: 1.4 }, away: { ...stats, xg: 0.6 } },
    players: {},
    shootout: null,
    controversies: [],
    refereeId: 'r',
    motmId: null,
    weather: 'sunny',
    attendance: 1000,
  } as MatchResult;
}

describe('cartas', () => {
  it('rareza por media y seis caras', () => {
    const { g, clubId } = setup();
    const p = clubPlayers(g, clubId)[0];
    const c = cardOf(p, potentialView(g, p, clubId));
    expect(c.faces).toHaveLength(6);
    expect(['bronze', 'silver', 'gold', 'elite', 'rising']).toContain(c.tier);
    expect(c.stars).toBeGreaterThanOrEqual(1);
    expect(c.traits.length).toBeLessThanOrEqual(3);
  });

  it('potencial: propio exacto, ajeno sin ojear oculto y sin estrellas', () => {
    const { g, clubId } = setup();
    const own = clubPlayers(g, clubId)[0];
    expect(potentialView(g, own, clubId)).toEqual({ kind: 'exact', value: own.potential });
    const other = Object.values(g.players).find((p) => p.clubId && p.clubId !== clubId)!;
    expect(potentialView(g, other, clubId).kind).toBe('hidden');
    expect(cardOf(other).stars).toBeNull();
  });
});

describe('highlights', () => {
  it('prioriza goles y devuelve ordenado por minuto', () => {
    const events = [ev(5, 'chance', 'home', [0, 0], 0.1), ev(30, 'goal', 'home', [1, 0], 0.4), ev(60, 'save', 'away', [1, 0], 0.5), ev(88, 'goal', 'away', [1, 1], 0.2)];
    const hl = buildHighlights(fakeResult(events, 1, 1), 3);
    expect(hl.map((h) => h.minute)).toEqual([30, 60, 88]);
    expect(hl.filter((h) => h.type === 'goal')).toHaveLength(2);
  });

  it('etiqueta una remontada y una goleada', () => {
    const come = fakeResult([ev(10, 'goal', 'away', [0, 1]), ev(50, 'goal', 'home', [1, 1]), ev(70, 'goal', 'home', [2, 1])], 2, 1);
    expect(matchStory(come)).toContain('comeback');
    const rout = fakeResult([], 5, 0);
    expect(matchStory(rout)).toContain('rout');
  });

  it('calcula rachas', () => {
    const { g, clubId } = setup();
    const other = Object.values(g.clubs).find((c) => c.id !== clubId)!;
    const m = (gf: number, ga: number): StoredMatch => ({
      fixtureId: `f${gf}-${ga}`,
      competitionId: 'x',
      competitionName: 'L',
      season: 2026,
      day: 1,
      homeId: clubId,
      awayId: other.id,
      result: { homeGoals: gf, awayGoals: ga } as MatchResult,
    });
    const runs = recentRuns([m(0, 1), m(2, 0), m(1, 0), m(3, 1)], clubId);
    expect(currentStreaks(runs).win).toBe(3);
    expect(currentStreaks(runs).cleanSheets).toBe(0); // el último partido (3-1) encajó un gol
  });
});

describe('planes de crecimiento', () => {
  it('se empieza, avanza por hitos y otorga recompensas', () => {
    const { g, clubId } = setup();
    const p = clubPlayers(g, clubId).find((x) => !x.academy && x.position !== 'GK' && x.age < 30)!;
    const plan = plansForPosition(p.position)[0];
    expect(startGrowthPlan(g, p.id, plan).ok).toBe(true);
    expect(planProgress(p)!.pct).toBe(0);
    for (const k of GROWTH_PLANS[plan].targets) p.attrs[k] = Math.min(99, p.attrs[k] + PLAN_GOAL_POINTS);
    expect(planProgress(p)!.milestone).toBe(3);
    const xp0 = userManager(g)!.xp ?? 0;
    processGrowthPlans(g);
    expect(userManager(g)!.xp!).toBeGreaterThan(xp0);
    expect(p.growthPlan).toBeNull();
    expect(g.achievements.some((a) => a.id === 'growthPlanDone')).toBe(true);
    expect(g.meta!.reveals.length).toBeGreaterThan(0);
  });

  it('con plan, el entrenamiento mejora los atributos objetivo', () => {
    const { g, clubId } = setup();
    const club = g.clubs[clubId];
    ensureTrainingPlan(g, club);
    const squad = clubPlayers(g, clubId).filter((x) => !x.academy);
    const p = squad.find((x) => x.age <= 21 && x.position !== 'GK') ?? squad.find((x) => x.position !== 'GK')!;
    p.age = 19;
    p.potential = 95;
    const plan = plansForPosition(p.position)[0];
    startGrowthPlan(g, p.id, plan);
    const before = GROWTH_PLANS[plan].targets.reduce((s, k) => s + p.attrs[k], 0);
    const rng = new Rng(5);
    for (let i = 0; i < 20; i++) weeklyTraining(g, club, squad, rng);
    const after = GROWTH_PLANS[plan].targets.reduce((s, k) => s + p.attrs[k], 0);
    expect(after).toBeGreaterThan(before);
  });
});

describe('perks y camino', () => {
  it('comprar un perk gasta puntos, exige el previo y aplica efectos', () => {
    const { g } = setup();
    const m = userManager(g)!;
    m.points = 5;
    expect(buyPerk(g, 'timeoutPlus')).toBe(false); // requiere 'drill'
    expect(buyPerk(g, 'drill')).toBe(true);
    expect(buyPerk(g, 'timeoutPlus')).toBe(true);
    expect(m.points).toBe(5 - 1 - 2);
    expect(perkEffects(g).timeouts).toBe(1);
    expect(PERKS.length).toBeGreaterThan(8);
    expect(g.achievements.some((a) => a.id === 'perkBought')).toBe(true);
  });

  it('las recompensas del camino se reclaman una sola vez', () => {
    const { g, clubId } = setup();
    const m = userManager(g)!;
    m.level = 6;
    const before = g.clubs[clubId].finances.transferBudget;
    expect(claimableLevels(g)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(claimAllPass(g)).toBe(6);
    expect(g.clubs[clubId].finances.transferBudget).toBeGreaterThan(before);
    expect(claimAllPass(g)).toBe(0);
    expect(m.points ?? 0).toBeGreaterThanOrEqual(1); // el nivel 5 es "grande"
  });

  it('los logros dan XP y presupuesto una vez', () => {
    const { g, clubId } = setup();
    const before = g.clubs[clubId].finances.transferBudget;
    expect(unlockAchievement(g, 'derbyWin')).toBe(true);
    expect(unlockAchievement(g, 'derbyWin')).toBe(false);
    expect(g.clubs[clubId].finances.transferBudget).toBeGreaterThan(before);
    expect(ensureMeta(g).reveals.some((r) => r.kind === 'achievement')).toBe(true);
  });
});

describe('mercado vivo', () => {
  it('los agentes ofrecen jugadores en ventana y se pueden fichar', () => {
    const { g, clubId } = setup();
    const club = g.clubs[clubId];
    club.finances.transferBudget = 200e6;
    club.finances.wageBudget = 1e9;
    g.day = 5;
    const rng = new Rng(9);
    let found = false;
    for (let d = 1; d <= 40 && !found; d += 4) {
      g.day = d;
      processMarketDay(g, rng);
      found = (g.meta?.agentOffers.length ?? 0) > 0;
    }
    expect(found).toBe(true);
    const offer = g.meta!.agentOffers[0];
    const res = acceptAgentOffer(g, offer.id, rng);
    expect(res.ok).toBe(true);
    expect(g.players[offer.playerId].clubId).toBe(clubId);
    expect(g.achievements.some((a) => a.id === 'firstSigning')).toBe(true);
  });

  it('el día de cierre genera oportunidades sólo en los últimos días', () => {
    const { g, clubId } = setup();
    g.clubs[clubId].finances.transferBudget = 300e6;
    g.day = 30;
    refreshDeadlineDeals(g);
    expect(g.meta?.deadline ?? null).toBeNull();
    g.day = 62;
    expect(daysToDeadline(g.day)).toBe(0);
    refreshDeadlineDeals(g);
    expect(g.meta!.deadline).not.toBeNull();
    expect(g.meta!.deadline!.deals.length).toBeGreaterThan(0);
  });
});

describe('legado', () => {
  it('récords y leyendas se derivan del estado y la simulación no se rompe', () => {
    const { g, clubId } = setup();
    for (let i = 0; i < 20; i++) advanceDay(g, true);
    expect(clubRecords(g).matches).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(clubLegends(g, clubId))).toBe(true);
  });
});
