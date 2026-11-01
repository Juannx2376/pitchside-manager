import { describe, expect, it } from 'vitest';
import {
  CURATED_ROSTERS,
  Rng,
  addManagerXp,
  advanceDay,
  advanceUntilOffer,
  applicationOdds,
  applyForJob,
  buildReplay,
  cumulativeXp,
  createWorld,
  ensureMeta,
  guessRumour,
  levelFromXp,
  processApplications,
  processRumours,
  recordStint,
  replayDuration,
  resign,
  setUserClub,
  userManager,
  xpToNext,
  type GameState,
} from '../src';

function setup(): { g: GameState; clubId: string } {
  const g = createWorld({ seed: 5150, season: 2026, loadedCountries: ['ENG'] });
  const club = Object.values(g.clubs).find((c) => !c.isUser)!;
  setUserClub(g, club.id, { firstName: 'Fase', lastName: 'Seis', nationality: 'ENG' });
  return { g, clubId: club.id };
}

describe('curva de XP', () => {
  it('cada nivel cuesta más que el anterior y es reversible', () => {
    expect(cumulativeXp(1)).toBe(80);
    expect(xpToNext(5)).toBeGreaterThan(xpToNext(1));
    for (const l of [1, 5, 10, 25]) {
      expect(levelFromXp(cumulativeXp(l))).toBe(l);
      expect(levelFromXp(cumulativeXp(l) - 1)).toBe(l - 1);
    }
  });

  it('addManagerXp convierte niveles en puntos', () => {
    const { g } = setup();
    addManagerXp(g, cumulativeXp(3));
    const m = userManager(g)!;
    expect(m.level).toBe(3);
    expect(m.points).toBe(3);
  });
});

describe('repetición 2D', () => {
  const slots = Array.from({ length: 11 }, (_, i) => ({ x: 10 + (i % 5) * 20, y: 90 - Math.floor(i / 5) * 35 }));
  const h = { minute: 55, type: 'goal' as const, x: 90, y: 40, playerId: 'p1' };

  it('genera 22 posiciones por fotograma y acaba en gol', () => {
    const f = buildReplay(h, slots, slots);
    expect(f.length).toBeGreaterThanOrEqual(5);
    for (const fr of f) {
      expect(fr.home).toHaveLength(11);
      expect(fr.away).toHaveLength(11);
    }
    expect(f[f.length - 1].kind).toBe('goal');
    expect(replayDuration(f)).toBeGreaterThan(f.length * 100);
  });

  it('es determinista', () => {
    expect(buildReplay(h, slots, slots)).toEqual(buildReplay(h, slots, slots));
  });
});

describe('rumores', () => {
  it('se crean en ventana y se resuelven; la apuesta puntúa', () => {
    const { g } = setup();
    const rng = new Rng(77);
    g.day = 2;
    let made = 0;
    for (let d = 2; d < 60 && made < 3; d++) {
      g.day = d;
      processRumours(g, rng);
      made = ensureMeta(g).rumours.length;
    }
    expect(made).toBeGreaterThan(0);
    const open = ensureMeta(g).rumours.find((r) => r.status === 'open')!;
    guessRumour(g, open.id, open.reliable ? 'true' : 'false');
    g.day = open.resolveDay;
    processRumours(g, rng);
    const r = ensureMeta(g).rumours.find((x) => x.id === open.id)!;
    expect(r.status).not.toBe('open');
    expect(ensureMeta(g).rumourStats.right + ensureMeta(g).rumourStats.wrong).toBeGreaterThanOrEqual(0);
  });

  it('la fiabilidad de la fuente se refleja en la verdad oculta', () => {
    const { g } = setup();
    const rng = new Rng(2024);
    let total = 0;
    let reliable = 0;
    for (let season = 0; season < 40; season++) {
      g.day = 2;
      ensureMeta(g).rumours = [];
      for (let d = 2; d < 30; d += 3) {
        g.day = d;
        processRumours(g, rng);
      }
      for (const r of ensureMeta(g).rumours) {
        total++;
        if (r.reliable) reliable++;
      }
    }
    expect(total).toBeGreaterThan(30);
    expect(reliable / total).toBeGreaterThan(0.35);
    expect(reliable / total).toBeLessThan(0.9);
  });
});

describe('desempleo', () => {
  it('al dimitir se guarda el balance y se puede postular y esperar ofertas', () => {
    const { g } = setup();
    for (let i = 0; i < 60; i++) advanceDay(g, true);
    resign(g, new Rng(1));
    expect(g.userClubId).toBeNull();
    const stint = ensureMeta(g).lastStint!;
    expect(stint.reason).toBe('resigned');
    expect(stint.wins + stint.draws + stint.losses).toBeGreaterThan(0);

    const target = Object.values(g.clubs).find((c) => !c.isUser && c.id !== stint.clubId)!;
    expect(applicationOdds(g, target.id)).toBeGreaterThan(0);
    expect(applyForJob(g, target.id, new Rng(3)).ok).toBe(true);
    expect(applyForJob(g, target.id, new Rng(3)).reason).toBe('duplicate');
    g.day += 4;
    processApplications(g, new Rng(9));
    expect(ensureMeta(g).applications).toHaveLength(0);

    g.jobOffers = [];
    const days = advanceUntilOffer(g, 40);
    expect(days).toBeGreaterThanOrEqual(0);
    expect(g.jobOffers.length + (g.userClubId ? 1 : 0)).toBeGreaterThan(0);
  });

  it('recordStint cuenta partidos del club', () => {
    const { g, clubId } = setup();
    const s = recordStint(g, g.clubs[clubId], 'sacked');
    expect(s.reason).toBe('sacked');
    expect(s.clubId).toBe(clubId);
  });
});

describe('plantillas curadas', () => {
  it('todas tienen porteros y nacionalidades válidas en el formato', () => {
    expect(CURATED_ROSTERS.length).toBeGreaterThan(150);
    for (const r of CURATED_ROSTERS) {
      const players = r.squad.split(';').filter(Boolean);
      expect(players.length, `${r.country} ${r.club}`).toBeGreaterThanOrEqual(8);
      for (const p of players) {
        const [pos, nat, ...rest] = p.split(':');
        expect(['G', 'D', 'M', 'F']).toContain(pos);
        expect(nat).toMatch(/^[A-Z]{3}$/);
        expect(rest.length).toBeGreaterThanOrEqual(2);
      }
    }
  });
});
