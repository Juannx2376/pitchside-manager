import { describe, expect, it } from 'vitest';
import {
  Rng,
  absDayOf,
  askingPrice,
  createWorld,
  firstTeam,
  overall,
  processNegotiations,
  processScoutingDay,
  queueBid,
  queueContract,
  setUserClub,
  signingVerdictFromReport,
  startNegotiation,
  startPlayerAnalysis,
  type GameState,
} from '../src';

function setup(seed = 71): { g: GameState; me: string; other: string } {
  const g = createWorld({ seed, season: 2026, loadedCountries: ['ENG'] });
  const clubs = Object.values(g.clubs);
  setUserClub(g, clubs[0].id, { firstName: 'Espe', lastName: 'Ra', nationality: 'ENG' });
  g.clubs[clubs[0].id].finances.transferBudget = 5e9;
  g.clubs[clubs[0].id].finances.wageBudget = 1e10;
  g.day = 20;
  return { g, me: clubs[0].id, other: clubs[5].id };
}

describe('el ojeador y las respuestas toman tiempo', () => {
  it('sin informe no hay veredicto; con informe llega tras los días del análisis', () => {
    const { g, me, other } = setup();
    const target = firstTeam(g, other).sort((a, b) => overall(b) - overall(a))[0];
    expect(signingVerdictFromReport(g, target.id, me, { fee: 1e6 })).toBeNull();
    const scoutId = g.clubs[me].scoutIds[0];
    const a = startPlayerAnalysis(g, { scoutId, clubId: me, playerId: target.id });
    expect(a.durationDays).toBeGreaterThanOrEqual(3);
    const rng = new Rng(3);
    for (let i = 0; i < a.durationDays - 1; i++) processScoutingDay(g, rng);
    // Un día antes todavía no hay informe.
    expect(signingVerdictFromReport(g, target.id, me, { fee: 1e6 })).toBeNull();
    processScoutingDay(g, rng);
    const v = signingVerdictFromReport(g, target.id, me, { fee: 1e6 });
    expect(v).not.toBeNull();
    expect(v!.hi).toBeGreaterThanOrEqual(v!.lo);
    expect(v!.margin).toBeGreaterThan(0);
  });

  it('una oferta tarda 1-3 días en recibir respuesta y no se resuelve antes', () => {
    const { g, me, other } = setup(72);
    const target = firstTeam(g, other).sort((a, b) => overall(b) - overall(a))[0];
    const n = startNegotiation(g, target.id, me);
    const res = queueBid(g, n.id, { fee: Math.round(askingPrice(g, target) * 1.3), sellOnPercent: 0 });
    expect(res.queued).toBe(true);
    const wait = (res as { replyAbs: number }).replyAbs - absDayOf(g);
    expect(wait).toBeGreaterThanOrEqual(1);
    expect(wait).toBeLessThanOrEqual(3);
    // No se puede enviar otra oferta mientras se espera.
    expect(() => queueBid(g, n.id, { fee: 1, sellOnPercent: 0 })).toThrow();
    expect(processNegotiations(g)).toBe(0);
    expect(n.stage).toBe('club');
    g.day += wait;
    expect(processNegotiations(g)).toBe(1);
    expect(n.awaiting).toBeNull();
    expect(n.stage).toBe('player'); // el club aceptó: ahora toca el contrato
    // El contrato también se responde con retraso.
    const c = queueContract(g, n.id, { wage: 1e6, years: 3, releaseClause: null, goalBonus: 0, cleanSheetBonus: 0, signingBonus: 0, agentFee: 1e7 });
    expect(c.queued).toBe(true);
    expect(g.negotiations[n.id].stage).toBe('player');
  });
});
