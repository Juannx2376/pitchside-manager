// Deadline Day en vivo: el último día de cada ventana se juega hora a hora (0-20 h).
// Las respuestas llegan en 1-3 horas, rivales con nombre pisan tus objetivos, la IA entra en pánico y
// puedes "cerrar ya" con recargo. Al terminar el día se publica un resumen y se cierran las operaciones.
import { managerName } from './club';
import { msg } from './i18n';
import { ensureMeta, type DeadlineEvent, type DeadlineLive } from './meta';
import { overall, roundMoney, type Player } from './player';
import { Rng } from './rng';
import { addNews, unlockAchievement, type GameState } from './state';
import {
  addTension,
  aiTransferActivity,
  askingPrice,
  isDeadlineDay,
  ownerClubId,
  playerExpectations,
  processNegotiations,
  startNegotiation,
  submitBid,
  submitContract,
  type ContractOffer,
  type Negotiation,
} from './transfers';
import type { Id } from './types';
import { transferPool } from './world';

export const DEADLINE_HOURS = 20;
/** Recargo por cerrar un trato al instante en el Deadline Day (club y jugador piden prima). */
export const RUSH_FEE_PREMIUM = 0.12;
export const RUSH_WAGE_PREMIUM = 0.1;
/** Cuántos clubes de la IA se mueven cada hora. */
const AI_CLUBS_PER_HOUR = 5;

function sessionFor(state: GameState): DeadlineLive | null {
  const live = state.meta?.deadlineLive;
  return live && live.season === state.season && live.day === state.day ? live : null;
}

/** Sesión de hoy (null si no hay o es de otro día). */
export function deadlineLive(state: GameState): DeadlineLive | null {
  return sessionFor(state);
}

/** ¿Debe abrirse la pantalla de Deadline Day antes de avanzar el día? */
export function deadlineLiveAvailable(state: GameState): boolean {
  if (!state.userClubId || !isDeadlineDay(state.day)) return false;
  const s = sessionFor(state);
  return !s || !s.finished;
}

function push(live: DeadlineLive, e: Omit<DeadlineEvent, 'id' | 'hour'>): void {
  live.seq += 1;
  live.feed.unshift({ ...e, id: live.seq, hour: live.hour });
  if (live.feed.length > 120) live.feed.length = 120;
}

/** Abre (o recupera) la sesión de hoy. */
export function startDeadlineLive(state: GameState): DeadlineLive {
  const existing = sessionFor(state);
  if (existing) return existing;
  const meta = ensureMeta(state);
  const live: DeadlineLive = {
    season: state.season,
    day: state.day,
    hour: 0,
    finished: false,
    seq: 0,
    feed: [],
    stats: { signed: 0, lost: 0, rivalMoves: 0, rushed: 0, sold: 0 },
  };
  meta.deadlineLive = live;
  push(live, { kind: 'open', importance: 3, text: msg('deadline.live.open') });
  const open = userDeals(state).length;
  push(live, { kind: 'open', importance: 2, text: msg('deadline.live.openDeals', { n: open }) });
  return live;
}

/** Tratos activos del usuario como comprador (consulta, club o jugador). */
export function userDeals(state: GameState): Negotiation[] {
  return Object.values(state.negotiations).filter((n) => !n.incoming && n.buyerClubId === state.userClubId && (n.stage === 'club' || n.stage === 'player' || n.stage === 'enquiry' || n.stage === 'renegotiation'));
}

const pname = (p: Player): string => `${p.firstName} ${p.lastName}`;

function rivalFor(state: GameState, p: Player, rng: Rng, exclude: Id[]): Id | null {
  const price = askingPrice(state, p);
  const cands = Object.values(state.clubs)
    .filter((c) => !c.isUser && !exclude.includes(c.id) && c.id !== ownerClubId(p) && !c.finances.fpf.transferEmbargo && c.finances.transferBudget >= price * 0.8 && c.reputation >= p.reputation - 12)
    .sort((a, b) => b.finances.transferBudget - a.finances.transferBudget)
    .slice(0, 8);
  if (!cands.length) return null;
  return cands[Math.floor(rng.next() * cands.length)].id;
}

/** El rival intenta llevarse al jugador como lo haría la IA: oferta por el club y contrato. */
function rivalSigns(state: GameState, p: Player, rivalId: Id): boolean {
  let neg: Negotiation | null = null;
  try {
    neg = startNegotiation(state, p.id, rivalId, false, 'transfer');
    if (neg.stage === 'club') {
      const r = submitBid(state, neg.id, { fee: roundMoney(askingPrice(state, p) * 1.05), sellOnPercent: 0 });
      if (r.decision === 'counter' && neg.sellerCounter && neg.sellerCounter.fee <= state.clubs[rivalId].finances.transferBudget) submitBid(state, neg.id, neg.sellerCounter);
    }
    if (neg.stage === 'player') {
      const ex = playerExpectations(state, p, state.clubs[rivalId]);
      const offer: ContractOffer = { wage: ex.idealWage, years: ex.years, releaseClause: null, goalBonus: 0, cleanSheetBonus: 0, signingBonus: 0, agentFee: ex.agentFee };
      const r = submitContract(state, neg.id, offer);
      if (r.decision === 'counter' && neg.playerCounter) submitContract(state, neg.id, neg.playerCounter);
    }
  } catch {
    /* el rival no puede: se queda en intento */
  }
  if (neg) delete state.negotiations[neg.id];
  return p.clubId === rivalId;
}

function userSnapshot(state: GameState): Map<Id, string> {
  const m = new Map<Id, string>();
  for (const n of Object.values(state.negotiations)) if (!n.incoming && n.buyerClubId === state.userClubId) m.set(n.id, n.stage);
  return m;
}

/** Avanza `hours` horas (se detiene en la hora 20 y cierra el día). Devuelve las horas realmente avanzadas. */
export function advanceDeadlineHours(state: GameState, hours = 1): number {
  const live = startDeadlineLive(state);
  const userId = state.userClubId;
  if (!userId || live.finished) return 0;
  let done = 0;
  const pool = transferPool(state);
  for (let i = 0; i < hours && !live.finished; i++) {
    live.hour += 1;
    done++;
    const rng = new Rng((state.seed + state.season * 104729 + state.day * 7919 + live.hour * 613) >>> 0);
    const before = userSnapshot(state);

    // 1) Respuestas que vencen a esta hora.
    processNegotiations(state, live.hour);
    for (const n of Object.values(state.negotiations)) {
      if (n.incoming || n.buyerClubId !== userId) continue;
      const was = before.get(n.id);
      if (was === undefined || was === n.stage) {
        // Sin cambio de fase, pero hubo contestación: se anuncia la última línea del registro.
        continue;
      }
      const p = state.players[n.playerId];
      if (!p) continue;
      if (n.stage === 'agreed' && p.clubId === userId) {
        live.stats.signed++;
        push(live, { kind: 'signed', importance: 3, playerId: p.id, text: msg('deadline.live.signed', { p: pname(p), club: state.clubs[userId].name }) });
      } else if (n.stage === 'collapsed') {
        live.stats.lost++;
        push(live, { kind: 'reply', importance: 2, playerId: p.id, text: msg('deadline.live.collapsed', { p: pname(p) }) });
      } else if (n.stage === 'renegotiation') {
        push(live, { kind: 'raise', importance: 3, playerId: p.id, text: msg('deadline.live.reneg', { p: pname(p) }) });
      } else if (n.stage === 'player') {
        push(live, { kind: 'reply', importance: 2, playerId: p.id, text: msg('deadline.live.clubOk', { p: pname(p) }) });
      }
    }

    // 2) Rivales con nombre pisan tus objetivos.
    const targets = userDeals(state).filter((n) => n.stage === 'club' || n.stage === 'player');
    const chance = Math.min(0.55, 0.14 + live.hour * 0.02);
    if (targets.length && rng.chance(chance)) {
      const n = targets[Math.floor(rng.next() * targets.length)];
      const p = state.players[n.playerId];
      const rid = p ? rivalFor(state, p, rng, [userId]) : null;
      if (p && rid) {
        const rival = state.clubs[rid];
        const boss = rival.managerId ? state.managers[rival.managerId] : null;
        const who = boss ? managerName(boss) : rival.name;
        live.stats.rivalMoves++;
        const snipe = live.hour >= 5 && rng.chance(0.3);
        if (snipe && rivalSigns(state, p, rid)) {
          n.stage = 'collapsed';
          n.awaiting = null;
          n.log.push(msg('deadline.live.sniped', { p: pname(p), club: rival.name }));
          live.stats.lost++;
          push(live, { kind: 'sniped', importance: 3, playerId: p.id, text: msg('deadline.live.sniped', { p: pname(p), club: rival.name, boss: who }) });
        } else if (n.sellerCounter && n.stage === 'club') {
          const raise = 6 + Math.floor(rng.next() * 8);
          n.sellerCounter = { ...n.sellerCounter, fee: roundMoney(n.sellerCounter.fee * (1 + raise / 100)) };
          addTension(n, 8);
          push(live, { kind: 'raise', importance: 3, playerId: p.id, text: msg('deadline.live.raise', { p: pname(p), club: rival.name, boss: who, pct: raise }) });
        } else {
          addTension(n, 6);
          push(live, { kind: 'rival', importance: 2, playerId: p.id, text: msg('deadline.live.rival', { p: pname(p), club: rival.name, boss: who }) });
        }
      }
    }

    // 3) La IA entra en pánico: unos cuantos clubes cierran fichajes.
    const clubIds = Object.values(state.clubs)
      .filter((c) => !c.isUser && c.playerIds.length > 0)
      .map((c) => c.id);
    for (let k = 0; k < AI_CLUBS_PER_HOUR && clubIds.length; k++) {
      const cid = clubIds[Math.floor(rng.next() * clubIds.length)];
      const club = state.clubs[cid];
      const had = new Set(club.playerIds);
      try {
        aiTransferActivity(state, rng, cid, pool, true);
      } catch {
        continue;
      }
      for (const pid of club.playerIds) {
        if (had.has(pid)) continue;
        const p = state.players[pid];
        if (!p) continue;
        const star = p.reputation >= 72 || overall(p) >= 78;
        if (star || rng.chance(0.15)) push(live, { kind: 'ai', importance: star ? 3 : 1, playerId: p.id, text: msg('deadline.live.ai', { p: pname(p), club: club.name }) });
      }
    }

    if (live.hour >= DEADLINE_HOURS) finishDeadlineLive(state);
  }
  return done;
}

/** "Cerrar ya": paga prima al club y al jugador para resolver en el acto. */
export function rushDeal(state: GameState, negId: Id): { ok: boolean; message: ReturnType<typeof msg> } {
  const live = startDeadlineLive(state);
  const n = state.negotiations[negId];
  const userId = state.userClubId;
  if (!n || !userId || n.buyerClubId !== userId || n.incoming) return { ok: false, message: msg('err.negotiation') };
  if (live.finished) return { ok: false, message: msg('deadline.live.finished') };
  const p = state.players[n.playerId];
  if (!p || (n.stage !== 'club' && n.stage !== 'player') || n.kind !== 'transfer') return { ok: false, message: msg('err.negotiation') };
  const buyer = state.clubs[userId];
  n.awaiting = null;
  const note = (ok: boolean, m: ReturnType<typeof msg>) => ({ ok, message: m });
  if (n.stage === 'club') {
    const base = n.sellerCounter ?? { fee: askingPrice(state, p), sellOnPercent: 0 };
    const bid = { ...base, fee: roundMoney(base.fee * (1 + RUSH_FEE_PREMIUM)) };
    if (bid.fee > buyer.finances.transferBudget) return note(false, msg('neg.budget', { budget: buyer.finances.transferBudget }));
    const r = submitBid(state, n.id, bid);
    if (r.decision !== 'accept') return note(false, r.message);
  }
  if (n.stage === 'player' || n.playerAgreed) {
    // Si el jugador ya aceptó mientras el club negociaba, `submitBid` ya cerró el trato.
  }
  const cur = state.negotiations[n.id];
  if (cur && cur.stage === 'player') {
    const ex = playerExpectations(state, p, buyer);
    const base: ContractOffer = cur.playerCounter ?? cur.contract ?? { wage: ex.idealWage, years: ex.years, releaseClause: null, goalBonus: 0, cleanSheetBonus: 0, signingBonus: 0, agentFee: ex.agentFee };
    const offer: ContractOffer = { ...base, wage: roundMoney(base.wage * (1 + RUSH_WAGE_PREMIUM)) };
    const r = submitContract(state, cur.id, offer);
    if (r.decision !== 'accept') return note(false, r.message);
  }
  live.stats.rushed++;
  const after = state.negotiations[n.id];
  if (after && after.stage === 'agreed' && p.clubId === userId) {
    live.stats.signed++;
    push(live, { kind: 'rush', importance: 3, playerId: p.id, text: msg('deadline.live.rush', { p: pname(p) }) });
    return note(true, msg('deadline.live.rush', { p: pname(p) }));
  }
  push(live, { kind: 'rush', importance: 2, playerId: p.id, text: msg('deadline.live.rushPartial', { p: pname(p) }) });
  return note(true, msg('deadline.live.rushPartial', { p: pname(p) }));
}

/** Cierra el día: resuelve lo que quede, publica el resumen y reparte logros. */
export function finishDeadlineLive(state: GameState): void {
  const live = sessionFor(state);
  if (!live || live.finished) return;
  processNegotiations(state, DEADLINE_HOURS + 1);
  live.hour = DEADLINE_HOURS;
  live.finished = true;
  // Tratos que seguían abiertos sin respuesta posible: el mercado cierra.
  for (const n of userDeals(state)) {
    if (n.stage === 'enquiry' || n.awaiting) continue;
    live.stats.lost += n.stage === 'club' || n.stage === 'player' ? 1 : 0;
  }
  push(live, { kind: 'close', importance: 3, text: msg('deadline.live.close', { signed: live.stats.signed, lost: live.stats.lost }) });
  const sold = state.transfers.filter((t) => t.season === state.season && t.day === state.day && t.fromClubId === state.userClubId).length;
  live.stats.sold = sold;
  if (live.stats.signed >= 1) unlockAchievement(state, 'deadlineSprint');
  if (live.stats.signed >= 3 || live.stats.rushed >= 1) unlockAchievement(state, 'deadlineHero');
  addNews(state, {
    category: 'transfer',
    title: msg('deadline.live.news.t'),
    body: msg('deadline.live.news.b', { signed: live.stats.signed, lost: live.stats.lost, rivals: live.stats.rivalMoves }),
    clubIds: state.userClubId ? [state.userClubId] : [],
    importance: 3,
  });
}
