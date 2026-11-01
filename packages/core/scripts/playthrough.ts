// Partida completa sin interfaz del club del usuario: `npx tsx scripts/playthrough.ts [temporadas] [país] [semilla]`.
// Sirve para valorar el ritmo del juego: progreso de la plantilla, misiones, eventos, ojeo y fichajes con
// espera, lesiones de entrenamiento, finanzas y resultado deportivo. Las decisiones son las «por defecto».
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  EVENT_CHOICES,
  PERKS,
  Rng,
  absDayOf,
  acceptAgentOffer,
  buyPerk,
  claimAllPass,
  plansForPosition,
  startGrowthPlan,
  advanceDay,
  askingPrice,
  clubPlayers,
  computeTable,
  createWorld,
  ensureTrainingPlan,
  firstTeam,
  importAuto,
  isWindowOpen,
  overall,
  pendingTrainingEvents,
  playerExpectations,
  queueBid,
  queueContract,
  renewContract,
  resolveTrainingEvent,
  setUserClub,
  signingVerdictFromReport,
  startNegotiation,
  startPlayerAnalysis,
  userManager,
  type GameState,
} from '../src';

const seasons = Number(process.argv[2] ?? 2);
const country = (process.argv[3] ?? 'ARG').toUpperCase();
const seed = Number(process.argv[4] ?? 2026);
const db = join(process.cwd(), '..', '..', 'apps', 'web', 'public', 'data', 'world-db.json');
const bundle = existsSync(db) ? importAuto(db, readFileSync(db, 'utf8')) : null;
const state: GameState = createWorld({ seed, season: 2026, loadedCountries: [country], bundle });
const league = state.leagues[state.countries[country].leagueIds[0]];
const clubs = league.clubIds.map((id) => state.clubs[id]).sort((a, b) => b.reputation - a.reputation);
const pick = clubs[Math.floor(clubs.length / 2)];
setUserClub(state, pick.id, { firstName: 'Play', lastName: 'Tester', nationality: country, style: 'BALANCED' });
const me = state.clubs[pick.id];
ensureTrainingPlan(state, me);

const avgOvr = (): number => {
  const squad = firstTeam(state, me.id);
  return squad.reduce((s, p) => s + overall(p), 0) / Math.max(1, squad.length);
};
const youngAvg = (): number => {
  const y = firstTeam(state, me.id).filter((p) => p.age <= 22);
  return y.length ? y.reduce((s, p) => s + overall(p), 0) / y.length : 0;
};

console.log(`Club: ${me.name} (${country}, rep ${me.reputation}) · plantilla ${avgOvr().toFixed(1)} · jóvenes ${youngAvg().toFixed(1)} · liga ${league.clubIds.length} clubes`);

let eventsResolved = 0;
const log = { analyses: 0, bids: 0, accepted: 0, signings: 0, waitDaysTotal: 0, plans: 0, perks: 0, claimed: 0, reveals: 0, agentSignings: 0 };

/** Un ciclo de fichaje completo con esperas: ojeo → informe → oferta → respuesta → contrato → respuesta. */
function tryTransfer(): void {
  if (!isWindowOpen(state.day)) return;
  const squadAvg = avgOvr();
  const budget = me.finances.transferBudget;
  const target = Object.values(state.players)
    .filter((p) => p.clubId && p.clubId !== me.id && !p.academy && !p.loan && state.clubs[p.clubId]?.countryCode === country && overall(p) > squadAvg + 2)
    .map((p) => ({ p, ask: askingPrice(state, p) }))
    .filter((x) => x.ask > 0 && x.ask <= budget * 0.6)
    .sort((a, b) => overall(b.p) - overall(a.p))[0];
  if (!target) return;
  const scoutId = me.scoutIds[0];
  if (!scoutId) return;
  const start = absDayOf(state);
  let a;
  try {
    a = startPlayerAnalysis(state, { scoutId, clubId: me.id, playerId: target.p.id });
  } catch {
    return;
  }
  log.analyses++;
  const advance = (n: number) => {
    for (let i = 0; i < n && !state.gameOver; i++) {
      advanceDay(state, true);
      for (const ev of pendingTrainingEvents(state)) {
        resolveTrainingEvent(state, ev.id, EVENT_CHOICES[ev.kind][0], new Rng(state.day));
        eventsResolved++;
      }
    }
  };
  advance(a.durationDays + 1);
  const verdict = signingVerdictFromReport(state, target.p.id, me.id, { fee: target.ask });
  if (!verdict || verdict.score < 55) return;
  const n = startNegotiation(state, target.p.id, me.id);
  const q = queueBid(state, n.id, { fee: Math.round(target.ask * 1.05), sellOnPercent: 0 });
  log.bids++;
  if (!q.queued) return;
  advance(q.replyAbs - absDayOf(state) + 1);
  if (n.stage !== 'player') return;
  log.accepted++;
  const ex = playerExpectations(state, target.p, me);
  const c = queueContract(state, n.id, { wage: Math.round(ex.idealWage * 1.1), years: ex.years, releaseClause: null, goalBonus: 0, cleanSheetBonus: 0, signingBonus: 0, agentFee: ex.agentFee });
  if (!c.queued) return;
  advance(c.replyAbs - absDayOf(state) + 1);
  if (target.p.clubId === me.id) {
    log.signings++;
    log.waitDaysTotal += absDayOf(state) - start;
    console.log(`  ✓ fichaje: ${target.p.firstName} ${target.p.lastName} (${overall(target.p)}) por ${(target.ask / 1e6).toFixed(1)}M · veredicto ${verdict.lo}-${verdict.hi} · ${absDayOf(state) - start} días de proceso`);
  }
}

/** Renovaciones como haría un mánager atento: los que acaban contrato y son útiles. */
function renewExpiring(): number {
  let n = 0;
  const avg = avgOvr();
  for (const p of clubPlayers(state, me.id)) {
    if (p.academy || p.loan || !p.contract || p.contract.expiresSeason > state.season) continue;
    if (overall(p) < avg - 4) continue;
    const ex = playerExpectations(state, p, me);
    const r = renewContract(state, me.id, p.id, { wage: Math.round(ex.idealWage * 1.05), years: ex.years, releaseClause: null, goalBonus: 0, cleanSheetBonus: 0, signingBonus: 0, agentFee: ex.agentFee });
    if (r.decision === 'accept') n++;
  }
  return n;
}

/** Ganchos FC: planes de crecimiento a las promesas, perks con los puntos y recompensas del camino. */
function useHooks(): void {
  const plans = clubPlayers(state, me.id)
    .filter((p) => !p.academy && !p.growthPlan && p.age <= 23 && p.potential - overall(p) >= 6 && plansForPosition(p.position).length)
    .sort((a, b) => b.potential - a.potential);
  for (const p of plans) {
    if (!startGrowthPlan(state, p.id, plansForPosition(p.position)[0]).ok) break;
    log.plans++;
  }
  for (const perk of PERKS) if (buyPerk(state, perk.id)) log.perks++;
  log.claimed += claimAllPass(state);
  // Se descartan las revelaciones pendientes como haría el usuario al pulsar «Continuar».
  const meta = state.meta;
  if (meta) {
    log.reveals += meta.reveals.length;
    meta.reveals = [];
    for (const o of [...meta.agentOffers]) {
      const p = state.players[o.playerId];
      if (p && overall(p) >= avgOvr() + 2 && acceptAgentOffer(state, o.id, new Rng(state.day + 7)).ok) log.agentSignings++;
    }
  }
}

const t0 = Date.now();
for (let s = 0; s < seasons; s++) {
  const startSeason = state.season;
  const startAvg = avgOvr();
  const startYoung = youngAvg();
  let days = 0;
  let tried = false;
  while (state.season === startSeason && !state.gameOver) {
    if (!tried && state.day >= 3 && isWindowOpen(state.day) && userManager(state)?.clubId === me.id) {
      tried = true;
      renewExpiring();
      tryTransfer();
      useHooks();
      if (state.season !== startSeason) break;
    }
    advanceDay(state, true);
    days++;
    for (const ev of pendingTrainingEvents(state)) {
      resolveTrainingEvent(state, ev.id, EVENT_CHOICES[ev.kind][0], new Rng(days));
      eventsResolved++;
    }
    if (days > 700) break;
  }
  const final = userManager(state)?.history.find((h) => h.season === startSeason);
  const row = final?.position ?? 0;
  const table = computeTable(state.leagues[final?.leagueId ?? league.id]);
  const obj = state.objectives ?? [];
  const done = obj.filter((o) => o.status === 'done').length;
  const m = userManager(state);
  console.log(
    `Temporada ${startSeason}: puesto ${row}/${table.length} · media ${startAvg.toFixed(1)} → ${avgOvr().toFixed(1)} · jóvenes ${startYoung.toFixed(1)} → ${youngAvg().toFixed(1)} · ` +
      `misiones ${done} cumplidas (activas ${obj.filter((o) => o.status === 'active').length}) · mánager nivel ${m?.level ?? 0} (${m?.xp ?? 0} XP) · caja ${(me.finances.balance / 1e6).toFixed(1)}M · plantilla ${clubPlayers(state, me.id).length} · ` +
      `directiva ${Math.round(me.boardConfidence)}% · ${m?.clubId === me.id ? 'en el cargo' : 'SIN CLUB'} · liga ${state.leagues[me.leagueId].tier}ª`,
  );
}
console.log(`Ganchos: planes ${log.plans} · perks ${log.perks} · niveles del camino reclamados ${log.claimed} · revelaciones ${log.reveals} · fichajes por agente ${log.agentSignings} · logros ${state.achievements.length}`);
console.log(`Eventos de entrenamiento resueltos: ${eventsResolved} · fichajes: ${log.signings} (análisis ${log.analyses}, ofertas ${log.bids}, aceptadas ${log.accepted}) · tiempo ${((Date.now() - t0) / 1000).toFixed(0)} s`);
