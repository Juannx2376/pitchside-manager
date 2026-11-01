// Mercado con vida: ofertas de agentes, oportunidades del día de cierre y avisos de la lista de deseos.
import { msg } from './i18n';
import { addManagerXp, ensureMeta, type AgentOffer, type DeadlineDeal, type Rumour } from './meta';
import type { Club } from './club';
import { overall, overallAt, roundMoney, type Player } from './player';
import { perkEffects } from './perks';
import type { Rng } from './rng';
import { postSourcedRumour } from './social';
import { addNews, clubPlayers, newId, unlockAchievement, type GameState } from './state';
import { AI_SQUAD_BUY_CAP, addSwapToOffer, askingPrice, completeTransfer, isDeadlineDay, isWindowOpen, ownerClubId, playerExpectations, startNegotiation, weakestSlots } from './transfers';
import type { Id } from './types';
import { weeklyWageBill } from './finance';

const NAME = (p: Player): string => `${p.firstName} ${p.lastName}`;

function userSquadAvg(state: GameState, clubId: Id): number {
  const squad = clubPlayers(state, clubId).filter((p) => !p.academy);
  return squad.length ? squad.reduce((s, p) => s + overall(p), 0) / squad.length : 60;
}

/** Candidatos de fuera del club, del país del usuario y vecinos; limitado para que el barrido sea barato. */
function marketCandidates(state: GameState, clubId: Id, limit = 4000): Player[] {
  const club = state.clubs[clubId];
  const out: Player[] = [];
  for (const id in state.players) {
    const p = state.players[id];
    if (!p || p.retired || p.academy || p.clubId === clubId || p.loan || p.prospect) continue;
    if (p.clubId && state.clubs[p.clubId]?.countryCode !== club.countryCode) continue;
    out.push(p);
    if (out.length >= limit) break;
  }
  return out;
}

// ───────────────────────── Agentes ─────────────────────────

/** Cada pocos días de mercado un agente puede ofrecer a un jugador al usuario (puede exagerar su calidad). */
export function processAgentOffers(state: GameState, rng: Rng): void {
  const clubId = state.userClubId;
  const club = clubId ? state.clubs[clubId] : null;
  if (!clubId || !club) return;
  const meta = ensureMeta(state);
  meta.agentOffers = meta.agentOffers.filter((o) => o.season === state.season && o.expiresDay >= state.day && state.players[o.playerId]?.clubId !== clubId);
  if (!isWindowOpen(state.day) || state.day % 4 !== 1 || meta.agentOffers.length >= 3 || !rng.chance(0.55)) return;
  const avg = userSquadAvg(state, clubId);
  const budget = club.finances.transferBudget;
  const pool = marketCandidates(state, clubId).filter((p) => {
    const ovr = overall(p);
    if (ovr < avg - 2 || ovr > avg + 9 || meta.agentOffers.some((o) => o.playerId === p.id)) return false;
    const ask = askingPrice(state, p);
    return ask <= budget * 0.8;
  });
  if (!pool.length) return;
  const p = rng.pick(pool);
  const ask = Math.max(0, askingPrice(state, p));
  const ex = playerExpectations(state, p, club);
  const honesty = rng.float(0.35, 1);
  const real = overall(p);
  const inflate = Math.round((1 - honesty) * rng.float(2, 7));
  const cut = perkEffects(state).commissionCut;
  const offer: AgentOffer = {
    id: newId(state, 'ag'),
    playerId: p.id,
    fee: Math.round(ask * 0.95),
    commission: Math.round(Math.max(ask * 0.1, ex.agentFee) * (1 - cut)),
    wage: Math.round(ex.idealWage * 1.05),
    years: Math.max(2, ex.years),
    expiresDay: state.day + 6,
    season: state.season,
    honesty,
    claimedOvr: Math.min(99, real + inflate),
  };
  meta.agentOffers.push(offer);
  addNews(state, {
    category: 'transfer',
    title: msg('news.agent.t', { p: NAME(p) }),
    body: msg('news.agent.b', { fee: offer.fee, days: 6 }),
    clubIds: [clubId],
    playerId: p.id,
    importance: 1,
  });
}

export type DealResult = { ok: true } | { ok: false; reason: 'budget' | 'wages' | 'gone' | 'closed' | 'embargo' };

/** Cierra directamente un fichaje (agente / oferta de última hora) saltándose las rondas de negociación. */
function signDirect(state: GameState, playerId: Id, fee: number, wage: number, years: number, agentFee: number, rng: Rng): DealResult {
  const clubId = state.userClubId;
  const club = clubId ? state.clubs[clubId] : null;
  const p = state.players[playerId];
  if (!club || !p || p.retired) return { ok: false, reason: 'gone' };
  if (p.clubId === club.id) return { ok: false, reason: 'gone' };
  if (!isWindowOpen(state.day)) return { ok: false, reason: 'closed' };
  if (club.finances.fpf.transferEmbargo) return { ok: false, reason: 'embargo' };
  if (fee + agentFee > club.finances.transferBudget) return { ok: false, reason: 'budget' };
  if (weeklyWageBill(clubPlayers(state, club.id), club.id) + wage > club.finances.wageBudget) return { ok: false, reason: 'wages' };
  const n = startNegotiation(state, playerId, club.id);
  n.bid = { fee, sellOnPercent: 0 };
  n.contract = { wage, years, releaseClause: null, goalBonus: 0, cleanSheetBonus: 0, signingBonus: 0, agentFee };
  n.sellerClubId = ownerClubId(p);
  completeTransfer(state, n, rng);
  return { ok: true };
}

export function acceptAgentOffer(state: GameState, offerId: string, rng: Rng): DealResult {
  const meta = ensureMeta(state);
  const o = meta.agentOffers.find((x) => x.id === offerId);
  if (!o) return { ok: false, reason: 'gone' };
  const res = signDirect(state, o.playerId, o.fee, o.wage, o.years, o.commission, rng);
  if (res.ok) meta.agentOffers = meta.agentOffers.filter((x) => x.id !== offerId);
  return res;
}

export function declineAgentOffer(state: GameState, offerId: string): void {
  const meta = ensureMeta(state);
  meta.agentOffers = meta.agentOffers.filter((x) => x.id !== offerId);
}

// ───────────────────────── Día de cierre ─────────────────────────

/** Días que faltan para que cierre la ventana abierta (0 = último día), o null si está cerrada. */
export function daysToDeadline(day: number): number | null {
  if (!isWindowOpen(day)) return null;
  for (let d = day; d < day + 70; d++) if (isDeadlineDay(d)) return d - day;
  return null;
}

/** Genera la lista de oportunidades de última hora (se rehace cada día de los últimos 2 días del mercado). */
export function refreshDeadlineDeals(state: GameState): void {
  const clubId = state.userClubId;
  const club = clubId ? state.clubs[clubId] : null;
  if (!clubId || !club) return;
  const meta = ensureMeta(state);
  const left = daysToDeadline(state.day);
  if (left === null || left > 1) {
    meta.deadline = null;
    return;
  }
  if (meta.deadline && meta.deadline.season === state.season && meta.deadline.day === state.day) return;
  const avg = userSquadAvg(state, clubId);
  const budget = club.finances.transferBudget;
  const deals: DeadlineDeal[] = [];
  const cands = marketCandidates(state, clubId)
    .filter((p) => overall(p) >= avg - 1 && overall(p) <= avg + 10)
    .map((p) => {
      const ask = askingPrice(state, p);
      const expiring = !!p.contract && p.contract.expiresSeason <= state.season && state.day > 150;
      const reason: DeadlineDeal['reason'] = expiring ? 'expiring' : p.listed === 'transfer' ? 'listed' : 'panic';
      const factor = reason === 'expiring' ? 0.62 : reason === 'listed' ? 0.8 : 0.9;
      return { p, price: Math.round(ask * factor), reason, ask };
    })
    .filter((x) => x.price > 0 && x.price <= budget * 0.9)
    .sort((a, b) => overall(b.p) - overall(a.p));
  for (const c of cands) {
    if (deals.length >= 5) break;
    if (deals.some((d) => state.players[d.playerId]?.position === c.p.position && deals.length >= 3)) continue;
    deals.push({ playerId: c.p.id, price: c.price, reason: c.reason });
  }
  meta.deadline = { season: state.season, day: state.day, deals };
}

export function acceptDeadlineDeal(state: GameState, playerId: Id, rng: Rng): DealResult {
  const meta = ensureMeta(state);
  const club = state.userClubId ? state.clubs[state.userClubId] : null;
  const deal = meta.deadline?.deals.find((d) => d.playerId === playerId);
  const p = state.players[playerId];
  if (!deal || !club || !p) return { ok: false, reason: 'gone' };
  const ex = playerExpectations(state, p, club);
  const res = signDirect(state, playerId, deal.price, Math.round(ex.idealWage * 1.1), Math.max(2, ex.years), ex.agentFee, rng);
  if (res.ok && meta.deadline) {
    meta.deadline.deals = meta.deadline.deals.filter((d) => d.playerId !== playerId);
    unlockAchievement(state, 'deadlineDeal');
  }
  return res;
}

// ───────────────────────── Lista de deseos ─────────────────────────

/** Avisos sobre los jugadores de la lista de deseos (`state.shortlist`): precio, transferible, libre, contrato. */
export function processWishlist(state: GameState): void {
  const clubId = state.userClubId;
  if (!clubId || state.day % 3 !== 0) return;
  const meta = ensureMeta(state);
  for (const id of state.shortlist) {
    const p = state.players[id];
    if (!p || p.retired || p.clubId === clubId) continue;
    const price = askingPrice(state, p);
    const prev = meta.wishlistPrices[id];
    if (prev !== undefined && prev > 0 && price > 0 && price <= prev * 0.92) {
      addNews(state, { category: 'transfer', title: msg('news.wish.price.t', { p: NAME(p) }), body: msg('news.wish.price.b', { cost: prev, value: price }), clubIds: [clubId], playerId: p.id, importance: 2 });
    }
    meta.wishlistPrices[id] = price;
    const flags: [string, boolean, string][] = [
      [`L:${id}`, p.listed === 'transfer', 'listed'],
      [`F:${id}`, !p.clubId && !p.loan, 'free'],
      [`E:${id}`, !!p.contract && p.contract.expiresSeason <= state.season && state.day > 200, 'expiring'],
    ];
    for (const [key, on, kind] of flags) {
      const was = meta.wishlistPrices[key] === 1;
      if (on && !was) {
        meta.wishlistPrices[key] = 1;
        addNews(state, { category: 'transfer', title: msg(`news.wish.${kind}.t`, { p: NAME(p) }), body: msg(`news.wish.${kind}.b`, { p: NAME(p) }), clubIds: [clubId], playerId: p.id, importance: 2 });
      } else if (!on && was) meta.wishlistPrices[key] = 0;
    }
  }
}

// ───────────────────────── Rumores con fiabilidad ─────────────────────────

export interface RumourSource {
  id: string;
  name: string;
  handle: string;
  /** Probabilidad de que lo que publica sea cierto. */
  reliability: number;
}

export const RUMOUR_SOURCES: RumourSource[] = [
  { id: 'mercatoInsider', name: 'Mercato Insider', handle: '@mercatoinsider', reliability: 0.85 },
  { id: 'transferDesk', name: 'Transfer Desk', handle: '@transferdesk', reliability: 0.7 },
  { id: 'fichajesHoy', name: 'Fichajes Hoy', handle: '@fichajeshoy', reliability: 0.55 },
  { id: 'radioBola', name: 'Rádio Bola', handle: '@radiobola', reliability: 0.4 },
  { id: 'golazoNews', name: 'Golazo News', handle: '@golazonews', reliability: 0.3 },
];

export const rumourSource = (id: string): RumourSource => RUMOUR_SOURCES.find((s) => s.id === id) ?? RUMOUR_SOURCES[RUMOUR_SOURCES.length - 1];

/** Crea un rumor en ventana de mercado (sobre jugadores del usuario, de su lista de deseos o de la liga). */
export function processRumours(state: GameState, rng: Rng): void {
  const clubId = state.userClubId;
  const user = clubId ? state.clubs[clubId] : null;
  if (!clubId || !user) return;
  const meta = ensureMeta(state);
  // Resolución de los que vencen hoy.
  for (const r of meta.rumours) {
    if (r.status !== 'open' || r.season !== state.season || r.resolveDay > state.day) continue;
    resolveRumour(state, rng, r);
  }
  meta.rumours = meta.rumours.filter((r) => r.status === 'open' || state.season * 400 + state.day - (r.season * 400 + r.resolveDay) <= 40);
  if (!isWindowOpen(state.day) || state.day % 3 !== 2 || meta.rumours.filter((r) => r.status === 'open').length >= 4 || !rng.chance(0.6)) return;

  const mine = clubPlayers(state, clubId).filter((p) => !p.academy && p.age >= 20);
  const wished = state.shortlist.map((id) => state.players[id]).filter((p): p is Player => !!p && !!p.clubId && p.clubId !== clubId);
  const pool = rng.chance(0.45) && mine.length ? mine : wished.length && rng.chance(0.5) ? wished : marketCandidates(state, clubId, 1500).filter((p) => p.clubId && overall(p) >= 66);
  if (!pool.length) return;
  const p = rng.pick(pool);
  const owner = ownerClubId(p);
  const buyers = Object.values(state.clubs).filter((c) => c.id !== owner && !c.isUser && c.countryCode === user.countryCode && c.reputation >= (state.clubs[owner ?? '']?.reputation ?? 40) - 6);
  if (!buyers.length || meta.rumours.some((r) => r.playerId === p.id && r.status === 'open')) return;
  const to = rng.pick(buyers);
  const source = rng.weightedPick(RUMOUR_SOURCES, (s) => 1 + (1 - s.reliability));
  const rumour: Rumour = {
    id: newId(state, 'ru'),
    playerId: p.id,
    fromClubId: owner,
    toClubId: to.id,
    sourceId: source.id,
    reliable: rng.chance(source.reliability),
    season: state.season,
    day: state.day,
    resolveDay: state.day + rng.int(3, 7),
    status: 'open',
  };
  meta.rumours.push(rumour);
  postSourcedRumour(state, rng, source, p, owner ? state.clubs[owner] : null, to);
}

function resolveRumour(state: GameState, rng: Rng, r: Rumour): void {
  const meta = ensureMeta(state);
  const p = state.players[r.playerId];
  const to = state.clubs[r.toClubId];
  const clubId = state.userClubId;
  const stillThere = !!p && !p.retired && ownerClubId(p) === r.fromClubId;
  let confirmed = r.reliable && stillThere && !!to;
  if (confirmed && p && to) {
    try {
      if (r.fromClubId === clubId) {
        // Puja real por un jugador del usuario: queda pendiente de su decisión.
        const n = startNegotiation(state, p.id, to.id, true);
        n.bid = { fee: roundMoney(askingPrice(state, p) * rng.float(0.95, 1.08)), sellOnPercent: 0 };
        addNews(state, { category: 'transfer', title: msg('news.bid.t', { club: to.name, fee: n.bid.fee, p: `${p.firstName} ${p.lastName}` }), body: msg('news.bid.b'), clubIds: [to.id, clubId as Id], playerId: p.id, importance: 2 });
      } else if (clubPlayers(state, to.id).length < 33) {
        const ask = askingPrice(state, p);
        const n = startNegotiation(state, p.id, to.id);
        n.bid = { fee: ask, sellOnPercent: 0 };
        n.sellerClubId = ownerClubId(p);
        n.contract = { wage: Math.round((p.contract?.wage ?? 20_000) * 1.2), years: 3, releaseClause: null, goalBonus: 0, cleanSheetBonus: 0, signingBonus: 0, agentFee: 0 };
        completeTransfer(state, n, rng);
      } else confirmed = false;
    } catch {
      // El comprador está vetado o el jugador ya está en el club: el rumor queda en nada.
      confirmed = false;
    }
  }
  r.status = confirmed ? 'confirmed' : 'denied';
  const src = rumourSource(r.sourceId);
  if (p && to) {
    addNews(state, {
      category: 'transfer',
      title: msg(confirmed ? 'news.rumour.confirmed.t' : 'news.rumour.denied.t', { p: `${p.firstName} ${p.lastName}`, club: to.name }),
      body: msg(confirmed ? 'news.rumour.confirmed.b' : 'news.rumour.denied.b', { src: src.name }),
      clubIds: [to.id, ...(r.fromClubId ? [r.fromClubId] : [])],
      playerId: p.id,
      importance: r.fromClubId === clubId ? 2 : 1,
    });
  }
  if (r.guess) {
    const right = (r.guess === 'true') === confirmed;
    meta.rumourStats[right ? 'right' : 'wrong']++;
    if (right) {
      addManagerXp(state, 8);
      if (meta.rumourStats.right >= 5) unlockAchievement(state, 'goodNose');
    }
  }
}

/** El usuario apuesta si un rumor abierto es cierto. */
export function guessRumour(state: GameState, id: string, guess: 'true' | 'false' | undefined): void {
  const r = ensureMeta(state).rumours.find((x) => x.id === id && x.status === 'open');
  if (r) r.guess = guess;
}

/** Máximo de ofertas abiertas por jugador en venta y por día. */
const OFFERS_PER_LISTED = 2;
const OFFERS_PER_DAY = 2;

/**
 * Vender es tan fácil como comprar: los jugadores que pones en venta reciben ofertas de clubes de la IA a los
 * que les hacen falta (en su puesto) y que pueden pagarlos. Sólo durante la ventana; determinista con `Rng`.
 */
export function generateOffersForListed(state: GameState, rng: Rng): number {
  const uid = state.userClubId;
  if (!uid || !isWindowOpen(state.day)) return 0;
  const listed = clubPlayers(state, uid).filter((p) => p.listed === 'transfer' && !p.loan && !p.academy && !p.retired);
  if (!listed.length) return 0;
  const open = (pid: string) => Object.values(state.negotiations).filter((n) => n.incoming && n.playerId === pid && n.stage === 'club').length;
  let clubs: Club[] | null = null;
  let made = 0;
  for (const p of listed) {
    if (made >= OFFERS_PER_DAY) break;
    if (open(p.id) >= OFFERS_PER_LISTED || !rng.chance(0.4)) continue;
    const price = askingPrice(state, p);
    clubs ??= Object.values(state.clubs).filter((c) => !c.isUser && !c.finances.fpf.transferEmbargo && c.playerIds.length > 0);
    let best: { club: Club; score: number } | null = null;
    const afford = clubs.filter((c) => c.finances.transferBudget >= price * 0.9 && c.reputation >= p.reputation - 15 && c.playerIds.length < AI_SQUAD_BUY_CAP);
    for (let i = 0; i < 25 && afford.length; i++) {
      const c = afford[Math.floor(rng.next() * afford.length)];
      const needs = weakestSlots(c, clubPlayers(state, c.id).filter((q) => !q.academy));
      const fit = needs.reduce((m, nd) => Math.max(m, overallAt(p, nd.pos) - nd.level), -99);
      if (fit < -2) continue;
      const score = fit + c.finances.transferBudget / Math.max(1, price);
      if (!best || score > best.score) best = { club: c, score };
    }
    if (!best) continue;
    const buyer = best.club;
    try {
      const n = startNegotiation(state, p.id, buyer.id, true, 'transfer');
      n.bid = { fee: roundMoney(price * rng.float(0.9, 1.05)), sellOnPercent: 0 };
      addSwapToOffer(state, n, rng);
      addNews(state, {
        category: 'transfer',
        title: msg('news.bid.t', { club: buyer.name, fee: n.bid.fee, p: `${p.firstName} ${p.lastName}` }),
        body: msg('news.bid.b'),
        clubIds: [buyer.id, uid],
        playerId: p.id,
        importance: 3,
      });
      made++;
    } catch {
      /* ya hay un trato abierto o el club no puede */
    }
  }
  return made;
}

/** Paso diario del mercado del usuario. */
export function processMarketDay(state: GameState, rng: Rng): void {
  if (!state.userClubId) return;
  generateOffersForListed(state, rng);
  processAgentOffers(state, rng);
  processRumours(state, rng);
  refreshDeadlineDeals(state);
  processWishlist(state);
}
