import { describe, expect, it } from 'vitest';
import {
  GROWTH_PROFILES,
  Rng,
  absDayOf,
  askingPrice,
  createWorld,
  delegateNegotiation,
  dynamicOvr,
  finalizeDeal,
  growthProfileOf,
  hashString,
  overall,
  ovrBreakdown,
  payInstalments,
  playerExpectations,
  processNegotiations,
  renegotiationChance,
  resolveRenegotiation,
  setUserClub,
  startEnquiry,
  startNegotiation,
  submitBid,
  submitContract,
  type GameState,
  type Negotiation,
  type Player,
} from '../src';

function setup(): { g: GameState; clubId: string; target: Player } {
  const g = createWorld({ seed: 4242, season: 2026, loadedCountries: ['ENG'] });
  const club = Object.values(g.clubs).find((c) => !c.isUser)!;
  setUserClub(g, club.id, { firstName: 'Deal', lastName: 'Maker', nationality: 'ENG' });
  const c = g.clubs[club.id];
  c.finances.transferBudget = 900e6;
  c.finances.wageBudget = 5e9;
  g.day = 5;
  const target = Object.values(g.players).find((p) => p.clubId && p.clubId !== club.id && !p.academy && !p.loan && p.reputation <= 55 && p.contract && p.squadStatus !== 'key')!;
  return { g, clubId: club.id, target };
}

const offerFor = (g: GameState, p: Player, clubId: string) => {
  const ex = playerExpectations(g, p, g.clubs[clubId]);
  return { wage: Math.round(ex.idealWage * 1.3), years: ex.years, releaseClause: null, goalBonus: 0, cleanSheetBonus: 0, signingBonus: 0, agentFee: ex.agentFee * 2 };
};

describe('traspasos por fases', () => {
  it('la consulta tarda y abre (o cierra) la puerta', () => {
    const { g, clubId, target } = setup();
    const n = startEnquiry(g, target.id, clubId);
    expect(n.stage).toBe('enquiry');
    expect(n.awaiting?.kind).toBe('enquiry');
    g.day += 4;
    processNegotiations(g);
    expect(['club', 'player', 'collapsed']).toContain(n.stage);
  });

  it('cuotas y primas dejan compromisos futuros y se pagan al empezar la temporada', () => {
    const { g, clubId, target } = setup();
    const club = g.clubs[clubId];
    const n = startNegotiation(g, target.id, clubId);
    const ask = askingPrice(g, target);
    const before = club.finances.transferBudget;
    submitBid(g, n.id, { fee: Math.round(ask * 1.3), sellOnPercent: 0, instalments: 3, bonus: 1_000_000 });
    expect(n.stage).toBe('player');
    submitContract(g, n.id, offerFor(g, target, clubId), new Rng(1));
    expect(target.clubId).toBe(clubId);
    const cm = club.finances.commitments ?? [];
    expect(cm.filter((c) => c.kind === 'instalment')).toHaveLength(2);
    expect(cm.filter((c) => c.kind === 'bonus')).toHaveLength(1);
    // Sólo se pagó la primera parte ahora.
    expect(club.finances.ledger.playerPurchases).toBeLessThan(Math.round(ask * 1.3) * 0.5);
    expect(before).toBeGreaterThan(club.finances.transferBudget);
    const balance = club.finances.balance;
    payInstalments(g, g.season + 2);
    expect((club.finances.commitments ?? []).filter((c) => c.kind === 'instalment')).toHaveLength(0);
    expect(club.finances.balance).toBeLessThan(balance);
  });

  it('el jugador puede cerrar sus condiciones en paralelo y el trato se completa con el club', () => {
    const { g, clubId, target } = setup();
    const n = startNegotiation(g, target.id, clubId);
    submitContract(g, n.id, offerFor(g, target, clubId));
    expect(n.playerAgreed).toBe(true);
    expect(target.clubId).not.toBe(clubId);
    submitBid(g, n.id, { fee: Math.round(askingPrice(g, target) * 1.4), sellOnPercent: 0 });
    expect(target.clubId).toBe(clubId);
  });

  it('una estrella puede forzar una renegociación única', () => {
    const { g, clubId, target } = setup();
    target.reputation = 90;
    expect(renegotiationChance(target)).toBeGreaterThan(20);
    const n = startNegotiation(g, target.id, clubId);
    // Un id cuyo hash dispare la renegociación (determinista).
    let fid = '';
    for (let i = 0; i < 2000; i++) {
      if (hashString(`t${i}:rv`) % 100 < renegotiationChance(target)) {
        fid = `t${i}`;
        break;
      }
    }
    expect(fid).not.toBe('');
    delete g.negotiations[n.id];
    const m: Negotiation = { ...n, id: fid, stage: 'agreed', bid: { fee: askingPrice(g, target), sellOnPercent: 0 }, contract: offerFor(g, target, clubId) };
    g.negotiations[fid] = m;
    finalizeDeal(g, m, new Rng(2));
    expect(m.stage).toBe('renegotiation');
    expect(m.renegotiation).not.toBeNull();
    const r = resolveRenegotiation(g, fid, true, new Rng(3));
    expect(r.ok).toBe(true);
    expect(['agreed']).toContain(m.stage);
    expect(target.clubId).toBe(clubId);
  });

  it('el director de fútbol cierra o falla sin lanzar errores', () => {
    const { g, clubId, target } = setup();
    const n = startNegotiation(g, target.id, clubId);
    const ex = playerExpectations(g, target, g.clubs[clubId]);
    const r = delegateNegotiation(g, n.id, { maxFee: askingPrice(g, target) * 1.2, maxWage: ex.idealWage * 2 }, new Rng(4));
    expect(typeof r.ok).toBe('boolean');
    expect(['club', 'player']).not.toContain(n.stage);
    expect(absDayOf(g)).toBeGreaterThan(0);
  });
});

describe('GRL dinámico y perfiles', () => {
  it('forma, moral y preparación mueven la valoración y se desglosan', () => {
    const { g, clubId } = setup();
    const p = Object.values(g.players).find((x) => x.clubId === clubId && !x.academy)!;
    p.form = 50;
    p.morale = 50;
    p.fitness = 100;
    p.injury = null;
    expect(dynamicOvr(p)).toBe(overall(p));
    p.form = 100;
    p.morale = 100;
    const hot = ovrBreakdown(p);
    expect(hot.total).toBeGreaterThanOrEqual(hot.base);
    expect(hot.form).toBeGreaterThan(0);
    p.fitness = 40;
    expect(ovrBreakdown(p).readiness).toBeLessThan(0);
    expect(dynamicOvr(p)).toBeLessThan(hot.total);
  });

  it('asigna los seis perfiles de forma determinista', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 800; i++) seen.add(growthProfileOf({ id: `p${i}` }));
    expect(seen.size).toBe(GROWTH_PROFILES.length);
    expect(growthProfileOf({ id: 'p7' })).toBe(growthProfileOf({ id: 'p7' }));
  });
});
