// Mercado de fichajes: tasación, negociación club-club y club-jugador (salario, cláusula,
// bonus, % de futura venta, comisión del agente), cesiones (reparto de salario, opción u
// obligación de compra), listas de transferibles/cedibles e IA de mercado según la filosofía del mánager.
import { assignSquadStatuses, type Club } from './club';
import { COUNTRY_BY_CODE } from './data/countries';
import { creditSale, record, wageShareOfRevenue, weeklyWageBill } from './finance';
import { msg, type Msg } from './i18n';
import { marketValue, overall, overallAt, roundMoney, tierWageFactor, wageForQuality, type Player, type SquadStatus } from './player';
import { scheduleFee } from './dealTerms';
import { Rng, hashString } from './rng';
import { postRumour, postSigning } from './social';
import { pushReveal } from './meta';
import { addNews, clubPlayers, newId, unlockAchievement, type GameState } from './state';
import { nearestPreset, slotPositions, styleFit } from './tactics';
import { CALENDAR, clamp, type Contract, type Id, type Position } from './types';

export interface ClubBid {
  fee: number;
  /** % de una futura venta que se queda el club vendedor (0-50). */
  sellOnPercent: number;
  /** Jugadores del comprador que se incluyen en la operación (el vendedor los valora). */
  playersOffered?: Id[];
  /** Pagos aplazados: nº de plazos anuales (1 = todo ahora, máx. 4). */
  instalments?: number;
  /** Prima condicionada: se paga cuando el jugador llega a 15 partidos con el club (máx. 2 temporadas). */
  bonus?: number;
  /** Cuándo entra el jugador. */
  entry?: 'now' | 'nextWindow' | 'nextSeason';
  /** Cláusula de recompra (precio): el vendedor puede volver a comprarlo durante 2 temporadas. */
  buyBack?: number;
}

export interface LoanTerms {
  /** % del salario que paga el club que recibe la cesión. */
  wageShare: number;
  buyOption: number | null;
  obligatory: boolean;
}

export interface ContractOffer {
  wage: number;
  years: number;
  releaseClause: number | null;
  goalBonus: number;
  cleanSheetBonus: number;
  signingBonus: number;
  agentFee: number;
  /** Rol pactado en el equipo (expectativas de minutos). */
  role?: SquadStatus;
  /** Prima por aparición (EUR). */
  appearanceBonus?: number;
  /** Subida salarial automática (%) al ascender o clasificarse para Europa. */
  autoRaisePct?: number;
  /** Bajada salarial automática (%) tras un descenso. */
  autoCutPct?: number;
}

export type NegotiationStage = 'enquiry' | 'club' | 'player' | 'renegotiation' | 'agreed' | 'collapsed';

export interface Negotiation {
  id: Id;
  kind: 'transfer' | 'loan';
  playerId: Id;
  buyerClubId: Id;
  sellerClubId: Id | null;
  localSeller: boolean;
  stage: NegotiationStage;
  bid: ClubBid | null;
  loan: LoanTerms | null;
  sellerCounter: ClubBid | null;
  loanCounter: LoanTerms | null;
  contract: ContractOffer | null;
  playerCounter: ContractOffer | null;
  rounds: number;
  log: Msg[];
  season: number;
  day: number;
  incoming: boolean;
  /** Oferta del usuario enviada y aún sin respuesta: se resuelve el día `replyAbs`. */
  awaiting?: AwaitingReply | null;
  /** Medidor de tensión (0-100): al llegar a 100 el trato se rompe. */
  tension?: number;
  /** El jugador ya aceptó su contrato mientras el club aún negocia (conversaciones en paralelo). */
  playerAgreed?: boolean;
  /** Renegociación pendiente: otro club entra en la puja o el jugador exige más. */
  renegotiation?: Renegotiation | null;
  /** Día absoluto en que se ejecuta un traspaso pactado para la próxima ventana / temporada. */
  entryAbs?: number | null;
  /** El director de fútbol lleva la negociación. */
  delegated?: boolean;
  /** Ya hubo renegociación (sólo ocurre una vez). */
  renegotiated?: boolean;
  /** Ya se hizo la consulta inicial (la puerta está abierta). */
  enquired?: boolean;
  /** Rondas de contraoferta del usuario a una oferta entrante (máx. 3). */
  incomingRounds?: number;
}

export interface Renegotiation {
  reason: 'rival' | 'player';
  /** Subida del traspaso (%) y del salario (%) que se exige. */
  feeRaisePct: number;
  wageRaisePct: number;
  /** Último día absoluto para responder. */
  untilAbs: number;
}

/** Respuesta pendiente de una oferta (el club o el agente tardan en contestar). */
export interface AwaitingReply {
  kind: 'bid' | 'loan' | 'contract' | 'enquiry';
  /** Día absoluto (temporada × 400 + día) en que llega la respuesta. */
  replyAbs: number;
  sentAbs: number;
  /** En el Deadline Day en vivo la respuesta llega a esta hora (0-20) del mismo día. */
  replyHour?: number;
  bid?: ClubBid;
  loanFee?: number;
  loan?: LoanTerms;
  offer?: ContractOffer;
}

export type Decision = 'accept' | 'counter' | 'reject';

export function isWindowOpen(day: number): boolean {
  return (day >= CALENDAR.summerWindow[0] && day <= CALENDAR.summerWindow[1]) || (day >= CALENDAR.winterWindow[0] && day <= CALENDAR.winterWindow[1]);
}

export function isDeadlineDay(day: number): boolean {
  return day === CALENDAR.summerWindow[1] || day === CALENDAR.winterWindow[1];
}

/** En las últimas 24 h del mercado la IA rebaja un 15% sus exigencias para cerrar operaciones. */
export const DEADLINE_PANIC_DISCOUNT = 0.85;

/**
 * Día de pánico: factor que multiplica el precio exigido por el club propietario. Sólo se aplica el
 * último día de mercado y cuando el vendedor es un club de la IA (el usuario fija siempre sus precios).
 */
function deadlineDiscount(state: GameState, ownerId: Id | null): number {
  if (!isDeadlineDay(state.day)) return 1;
  if (ownerId && state.clubs[ownerId]?.isUser) return 1;
  return DEADLINE_PANIC_DISCOUNT;
}

function marketOfPlayer(state: GameState, p: Player): { econ: number; quality: number } {
  const code = p.clubId ? state.clubs[p.clubId].countryCode : p.nationality;
  const c = COUNTRY_BY_CODE[code];
  return { econ: c?.econ ?? 0.05, quality: c?.quality ?? 50 };
}

export function playerValue(state: GameState, p: Player): number {
  return marketValue(p, { econ: marketOfPlayer(state, p).econ, season: state.season });
}

function leagueRepOf(state: GameState, club: Club): number {
  return state.leagues[club.leagueId]?.reputation ?? 30;
}

/** El club "dueño" del jugador (el de origen si está cedido). */
export function ownerClubId(p: Player): Id | null {
  return p.loan ? p.loan.parentClubId : p.clubId;
}

/** Precio que pide el club propietario. */
export function askingPrice(state: GameState, p: Player): number {
  const value = playerValue(state, p);
  const owner = ownerClubId(p);
  if (!owner) return p.contract ? roundMoney(value) : 0;
  const seller = state.clubs[owner];
  const importance = { key: 1.6, first: 1.3, rotation: 1.1, backup: 0.9, youth: 1.25 }[p.squadStatus];
  const finances = seller.finances.balance < 0 ? 0.88 : 1.05;
  const wantsOut = p.wantsToLeave ? 0.85 : 1;
  const listed = p.listed === 'transfer' ? 0.85 : 1;
  let ask = value * importance * finances * wantsOut * listed;
  if (p.contract?.releaseClause) ask = Math.min(ask, p.contract.releaseClause);
  return roundMoney(ask);
}

/** Máximo de jugadores que un club puede incluir en una operación. */
export const MAX_PLAYERS_IN_DEAL = 3;

/** Lo que el club vendedor paga (en valor) por un jugador que le ofrecen como parte del trato. */
export function playerTradeValue(state: GameState, p: Player): number {
  const base = playerValue(state, p);
  const age = p.age >= 33 ? 0.45 : p.age >= 31 ? 0.7 : p.age <= 21 ? 1.05 : 0.9;
  const injured = p.injury && p.injury.daysOut > 30 ? 0.6 : 1;
  const wage = p.contract ? 1 : 0.8;
  return roundMoney(base * 0.85 * age * injured * wage);
}

/** Jugadores del comprador que sí se pueden ofrecer (propios, en plantilla y sin cesión). */
export function tradeablePlayers(state: GameState, buyerId: Id): Player[] {
  return clubPlayers(state, buyerId).filter((q) => !q.academy && !q.loan && q.clubId === buyerId && q.contract !== null);
}

/** Valor total de los jugadores incluidos en una oferta (los no válidos no cuentan). */
export function offeredPlayersValue(state: GameState, bid: ClubBid, buyerId: Id | undefined): number {
  if (!buyerId || !bid.playersOffered?.length) return 0;
  const valid = new Set(tradeablePlayers(state, buyerId).map((q) => q.id));
  return bid.playersOffered
    .slice(0, MAX_PLAYERS_IN_DEAL)
    .filter((id) => valid.has(id))
    .reduce((s, id) => s + playerTradeValue(state, state.players[id]), 0);
}

export function evaluateClubBid(state: GameState, p: Player, bid: ClubBid, buyerId?: Id): { decision: Decision; counter: ClubBid | null; message: Msg } {
  if (!ownerClubId(p) && !p.contract) return { decision: 'accept', counter: null, message: msg('neg.free') };
  const clause = p.contract?.releaseClause ?? null;
  if (clause !== null && bid.fee >= clause) return { decision: 'accept', counter: null, message: msg('neg.clause') };
  const ask = askingPrice(state, p) * deadlineDiscount(state, ownerClubId(p));
  const value = playerValue(state, p);
  const swap = offeredPlayersValue(state, bid, buyerId);
  // Los plazos valen menos que el pago inmediato (-4 % por cuota extra) y la prima sólo cuenta a medias.
  const timing = 1 - 0.04 * (Math.max(1, bid.instalments ?? 1) - 1);
  const effective = bid.fee * timing + swap + (bid.bonus ?? 0) * 0.5 + (bid.sellOnPercent / 100) * value * 0.25;
  if (effective >= ask) return { decision: 'accept', counter: null, message: msg('neg.accepted') };
  if (effective >= ask * 0.7) {
    const counter: ClubBid = {
      fee: roundMoney(Math.max(0, ask * 0.98 - swap)),
      sellOnPercent: Math.max(bid.sellOnPercent, effective < ask * 0.85 ? 15 : 10),
      playersOffered: bid.playersOffered,
      instalments: 1,
      entry: bid.entry,
    };
    return { decision: 'counter', counter, message: msg('neg.counter', { fee: counter.fee, pct: counter.sellOnPercent }) };
  }
  return { decision: 'reject', counter: null, message: msg('neg.reject') };
}

/** ¿Cede el club al jugador? Más fácil si es joven o suplente y si el otro paga el salario. */
export function evaluateLoanBid(state: GameState, p: Player, fee: number, terms: LoanTerms): { decision: Decision; counter: LoanTerms | null; message: Msg } {
  const owner = ownerClubId(p);
  if (!owner) return { decision: 'reject', counter: null, message: msg('neg.loan.free') };
  if (p.loan) return { decision: 'reject', counter: null, message: msg('neg.loan.alreadyOnLoan') };
  const important = p.squadStatus === 'key' || (p.squadStatus === 'first' && p.age > 22);
  if (important && p.listed !== 'loan') return { decision: 'reject', counter: null, message: msg('neg.loan.reject') };
  const value = playerValue(state, p);
  const panic = deadlineDiscount(state, owner);
  const minShare = p.listed === 'loan' ? 40 : p.age <= 21 ? 50 : 70;
  const minFee = value * (p.listed === 'loan' ? 0 : 0.03) * panic;
  if (terms.buyOption !== null && terms.buyOption < value * 0.9 * panic) return { decision: 'counter', counter: { ...terms, buyOption: roundMoney(value * 1.1 * panic) }, message: msg('neg.loan.option', { fee: roundMoney(value * 1.1 * panic) }) };
  if (terms.wageShare >= minShare && fee >= minFee) return { decision: 'accept', counter: null, message: msg('neg.loan.accepted') };
  return { decision: 'counter', counter: { ...terms, wageShare: Math.max(minShare, terms.wageShare) }, message: msg('neg.loan.counter', { share: Math.max(minShare, terms.wageShare) }) };
}

export interface PlayerExpectations {
  minWage: number;
  idealWage: number;
  years: number;
  interest: number;
  willNegotiate: boolean;
  agentFee: number;
  prestigeGap: number;
  revenueShare: number;
  reasons: Msg[];
}

/**
 * Lo que exige un jugador para fichar. Si el club/liga está por debajo de su reputación,
 * el salario requerido crece de forma explosiva (ambición oculta), hasta desestabilizar al comprador.
 */
export function playerExpectations(state: GameState, p: Player, buyer: Club): PlayerExpectations {
  const ca = overall(p);
  const market = marketOfPlayer(state, p);
  const refWage = Math.max(p.contract?.wage ?? 0, wageForQuality(ca, market.econ, p.reputation, market.quality));
  const destination = 0.5 * buyer.reputation + 0.5 * leagueRepOf(state, buyer);
  const prestigeGap = p.reputation - destination;
  const ambition = p.hidden.ambition / 100;
  const veteran = p.age >= 32 ? 0.5 : 1;
  const reasons: Msg[] = [];
  let mult: number;
  if (prestigeGap > 0) {
    mult = 1 + Math.pow(prestigeGap / 10, 1.6) * (0.4 + ambition * 1.2) * veteran;
    if (prestigeGap > 12) reasons.push(msg('reason.belowLevel'));
  } else {
    mult = Math.max(0.75, 1 + prestigeGap / 100);
    reasons.push(msg('reason.stepUp'));
  }
  const buyerCountry = COUNTRY_BY_CODE[buyer.countryCode];
  const localFair = wageForQuality(ca, buyerCountry.econ, p.reputation, buyerCountry.quality) * tierWageFactor(state.leagues[buyer.leagueId]?.tier ?? 1);
  const base = Math.max(refWage * mult, localFair * (prestigeGap > 0 ? mult : 1));
  const minWage = roundMoney(base * 0.92);
  const idealWage = roundMoney(base * 1.1);
  let interest = clamp(55 - prestigeGap * 1.6 + (p.wantsToLeave ? 20 : 0) - (p.happiness - 50) * 0.3, 0, 100);
  const willNegotiate = !(prestigeGap > 30 && ambition > 0.75 && p.age < 30) || p.wantsToLeave;
  if (!willNegotiate) {
    reasons.push(msg('reason.ambition'));
    interest = Math.min(interest, 10);
  }
  if (p.hidden.loyalty > 75 && p.clubId && !p.wantsToLeave) {
    interest -= 15;
    reasons.push(msg('reason.loyalty'));
  }
  const years = p.age <= 23 ? 5 : p.age <= 28 ? 4 : p.age <= 31 ? 3 : p.age <= 33 ? 2 : 1;
  const agentGreed = 0.05 + (p.id.charCodeAt(p.id.length - 1) % 10) / 100;
  const agentFee = roundMoney(idealWage * 52 * years * agentGreed);
  return {
    minWage,
    idealWage,
    years,
    interest: Math.round(clamp(interest, 0, 100)),
    willNegotiate,
    agentFee,
    prestigeGap,
    revenueShare: wageShareOfRevenue(buyer, idealWage, state.leagues[buyer.leagueId]?.tier ?? 1),
    reasons,
  };
}

function expectedGoalsPerSeason(p: Player): number {
  const g = { ST: 0.45, RW: 0.25, LW: 0.25, AM: 0.22, CM: 0.08, DM: 0.04, RB: 0.03, LB: 0.03, CB: 0.04, GK: 0 }[p.position];
  return g * 34 * (overall(p) / 75);
}

export function offerWorth(p: Player, o: ContractOffer): number {
  const goals = expectedGoalsPerSeason(p);
  const cleanSheets = p.position === 'GK' || ['CB', 'RB', 'LB'].includes(p.position) ? 10 : 0;
  const apps = (o.appearanceBonus ?? 0) * 30;
  const clauses = 1 + (o.autoRaisePct ?? 0) / 400 - (o.autoCutPct ?? 0) / 200;
  return (o.wage + (o.goalBonus * goals + o.cleanSheetBonus * cleanSheets + apps) / 52 + o.signingBonus / (52 * Math.max(1, o.years))) * clauses;
}

const ROLE_RANK: Record<SquadStatus, number> = { key: 4, first: 3, rotation: 2, backup: 1, youth: 0 };

/** Rol que el jugador espera en el equipo comprador según su nivel frente al plantel. */
export function expectedRole(state: GameState, p: Player, buyer: Club): SquadStatus {
  const mates = clubPlayers(state, buyer.id).filter((q) => !q.academy && q.position === p.position && q.id !== p.id);
  const better = mates.filter((q) => overall(q) >= overall(p)).length;
  if (better === 0) return overall(p) >= 78 ? 'key' : 'first';
  if (better === 1) return 'first';
  if (better === 2) return 'rotation';
  return p.age <= 21 ? 'youth' : 'backup';
}

export function evaluateContractOffer(state: GameState, p: Player, buyer: Club, offer: ContractOffer, round: number): { decision: Decision; counter: ContractOffer | null; message: Msg } {
  const ex = playerExpectations(state, p, buyer);
  const worth = offerWorth(p, offer);
  const pName = `${p.firstName} ${p.lastName}`;
  if (!ex.willNegotiate && worth < ex.idealWage * 2) return { decision: 'reject', counter: null, message: msg('neg.notInterested', { p: pName, club: buyer.name }) };
  let need = ex.minWage;
  const value = playerValue(state, p);
  if (offer.releaseClause !== null && offer.releaseClause < value * 1.5) need *= 0.96;
  if (offer.releaseClause !== null && offer.releaseClause > value * 4 && p.hidden.ambition > 70) need *= 1.06;
  if (Math.abs(offer.years - ex.years) >= 2) need *= 1.05;
  // Rol prometido: si es inferior al que espera, pide más; uno superior le anima.
  if (offer.role) {
    const gap = ROLE_RANK[expectedRole(state, p, buyer)] - ROLE_RANK[offer.role];
    if (gap > 0) need *= 1 + 0.05 * gap;
    else if (gap < 0) need *= 0.98;
  }
  const agentOk = offer.agentFee >= ex.agentFee * 0.8;
  if (worth >= need && agentOk) return { decision: 'accept', counter: null, message: msg('neg.playerAccepts', { p: pName }) };
  if (round >= 5) return { decision: 'reject', counter: null, message: msg('neg.agentBroke') };
  const counter: ContractOffer = {
    wage: roundMoney(Math.max(offer.wage, ex.idealWage * (1 - round * 0.03))),
    years: ex.years,
    releaseClause: p.hidden.ambition > 65 ? roundMoney(value * 2) : offer.releaseClause,
    goalBonus: offer.goalBonus,
    cleanSheetBonus: offer.cleanSheetBonus,
    signingBonus: offer.signingBonus,
    agentFee: Math.max(offer.agentFee, ex.agentFee),
    role: offer.role,
    appearanceBonus: offer.appearanceBonus,
    autoRaisePct: offer.autoRaisePct,
    autoCutPct: offer.autoCutPct,
  };
  return { decision: 'counter', counter, message: !agentOk ? msg('neg.agentFee', { fee: ex.agentFee }) : msg('neg.wantsWage', { wage: counter.wage, years: counter.years }) };
}

export function startNegotiation(state: GameState, playerId: Id, buyerClubId: Id, incoming = false, kind: 'transfer' | 'loan' = 'transfer'): Negotiation {
  const p = state.players[playerId];
  if (!p) throw new Error('err.playerMissing');
  if (p.clubId === buyerClubId) throw new Error('err.alreadyInClub');
  const buyer = state.clubs[buyerClubId];
  if (buyer.finances.fpf.transferEmbargo) throw new Error('err.embargo');
  // AI deals resolve on the spot, so only the user's side can have an open negotiation to resume.
  if (incoming || buyer.isUser) {
    const existing = Object.values(state.negotiations).find((n) => n.playerId === playerId && n.buyerClubId === buyerClubId && (n.stage === 'club' || n.stage === 'player'));
    if (existing) return existing;
  }
  const free = !ownerClubId(p) && !p.contract;
  const n: Negotiation = {
    id: newId(state, 'ng'),
    kind: free ? 'transfer' : kind,
    playerId,
    buyerClubId,
    sellerClubId: ownerClubId(p),
    localSeller: !p.clubId && !!p.contract,
    stage: free ? 'player' : 'club',
    bid: free ? { fee: 0, sellOnPercent: 0 } : null,
    loan: null,
    sellerCounter: null,
    loanCounter: null,
    contract: null,
    playerCounter: null,
    rounds: 0,
    log: [],
    season: state.season,
    day: state.day,
    incoming,
  };
  state.negotiations[n.id] = n;
  return n;
}

export function submitBid(state: GameState, negId: Id, bid: ClubBid): { decision: Decision; message: Msg } {
  const n = state.negotiations[negId];
  if (!n || n.stage !== 'club') throw new Error('err.negotiation');
  const buyer = state.clubs[n.buyerClubId];
  if (bid.fee > buyer.finances.transferBudget) return { decision: 'reject', message: msg('neg.budget', { budget: buyer.finances.transferBudget }) };
  const p = state.players[n.playerId];
  n.rounds++;
  const res = evaluateClubBid(state, p, bid, n.buyerClubId);
  n.log.push(msg('neg.log.bid', { fee: bid.fee, pct: bid.sellOnPercent, res: res.message }));
  if (bid.playersOffered?.length) n.log.push(msg('neg.log.swap', { n: bid.playersOffered.length }));
  if (res.decision === 'accept') {
    n.bid = bid;
    n.stage = 'player';
    addTension(n, -15);
    // Conversaciones en paralelo: si el jugador ya había aceptado sus condiciones, el trato está cerrado.
    if (n.playerAgreed && n.contract) {
      n.stage = 'agreed';
      finalizeDeal(state, n);
    }
  } else if (res.decision === 'counter') {
    n.sellerCounter = res.counter;
    addTension(n, 10);
    if (n.rounds >= 4) {
      n.stage = 'collapsed';
      n.log.push(msg('neg.sellerTired'));
    }
  } else {
    addTension(n, 25);
    n.stage = n.rounds >= 2 ? 'collapsed' : 'club';
  }
  if (n.stage === 'club' && (n.tension ?? 0) >= 100) {
    n.stage = 'collapsed';
    n.log.push(msg('neg.tensionBreak'));
  }
  return { decision: res.decision, message: res.message };
}

/** Sube o baja el medidor de tensión (0-100). */
export function addTension(n: Negotiation, delta: number): void {
  n.tension = clamp((n.tension ?? 0) + delta, 0, 100);
}

/** Oferta de cesión: tasa de cesión + condiciones. Si el club acepta y el jugador también, se cierra. */
export function submitLoanBid(state: GameState, negId: Id, fee: number, terms: LoanTerms): { decision: Decision; message: Msg } {
  const n = state.negotiations[negId];
  if (!n || n.stage !== 'club') throw new Error('err.negotiation');
  const buyer = state.clubs[n.buyerClubId];
  if (fee > buyer.finances.transferBudget) return { decision: 'reject', message: msg('neg.budget', { budget: buyer.finances.transferBudget }) };
  const p = state.players[n.playerId];
  n.rounds++;
  const res = evaluateLoanBid(state, p, fee, terms);
  n.log.push(msg('neg.log.loan', { fee, share: terms.wageShare, res: res.message }));
  if (res.decision === 'accept') {
    // El jugador acepta si gana minutos o el club es atractivo.
    const ex = playerExpectations(state, p, buyer);
    const wantsMinutes = p.squadStatus === 'youth' || p.squadStatus === 'backup' || p.squadStatus === 'rotation' || p.listed === 'loan';
    if (!wantsMinutes && ex.prestigeGap > 15) {
      n.stage = 'collapsed';
      const m = msg('neg.loan.playerNo', { p: `${p.firstName} ${p.lastName}` });
      n.log.push(m);
      return { decision: 'reject', message: m };
    }
    n.bid = { fee, sellOnPercent: 0 };
    n.loan = terms;
    completeLoan(state, n);
    return { decision: 'accept', message: res.message };
  }
  if (res.decision === 'counter') n.loanCounter = res.counter;
  else n.stage = 'collapsed';
  if (n.rounds >= 4 && n.stage === 'club') n.stage = 'collapsed';
  return { decision: res.decision, message: res.message };
}

export function submitContract(state: GameState, negId: Id, offer: ContractOffer, rng?: Rng): { decision: Decision; message: Msg } {
  const n = state.negotiations[negId];
  if (!n || (n.stage !== 'player' && n.stage !== 'club')) throw new Error('err.negotiation');
  const buyer = state.clubs[n.buyerClubId];
  const p = state.players[n.playerId];
  const bill = weeklyWageBill(clubPlayers(state, buyer.id), buyer.id);
  if (buyer.isUser && bill + offer.wage > buyer.finances.wageBudget) return { decision: 'reject', message: msg('neg.wageBudget', { budget: buyer.finances.wageBudget }) };
  n.rounds++;
  const res = evaluateContractOffer(state, p, buyer, offer, n.rounds);
  n.log.push(msg('neg.log.contract', { wage: offer.wage, years: offer.years, res: res.message }));
  if (res.decision === 'accept') {
    n.contract = offer;
    if (n.stage === 'player') {
      n.stage = 'agreed';
      finalizeDeal(state, n, rng);
    } else {
      // El club aún no cerró su parte: el jugador queda a la espera.
      n.playerAgreed = true;
      n.log.push(msg('neg.playerReady'));
    }
  } else if (res.decision === 'counter') n.playerCounter = res.counter;
  else n.stage = 'collapsed';
  return { decision: res.decision, message: res.message };
}

function removeFromClub(state: GameState, club: Club, playerId: Id): void {
  club.playerIds = club.playerIds.filter((id) => id !== playerId);
  club.tactic.lineup = club.tactic.lineup.map((id) => (id === playerId ? '' : id));
  club.tactic.bench = club.tactic.bench.filter((id) => id !== playerId);
  assignSquadStatuses(clubPlayers(state, club.id), true);
}

/** Ejecuta el traspaso: pagos, cláusulas de futura venta, comisiones y cambio de club. */
export function completeTransfer(state: GameState, n: Negotiation, rng?: Rng): void {
  const p = state.players[n.playerId];
  const buyer = state.clubs[n.buyerClubId];
  const offer = n.contract;
  const bid = n.bid ?? { fee: 0, sellOnPercent: 0 };
  if (!offer) throw new Error('err.negotiation');
  const fee = bid.fee;
  // Cuotas y primas: sólo se paga ahora la primera parte; el resto queda como compromiso futuro.
  const payNow = scheduleFee(state, buyer, n.sellerClubId, p.id, fee, bid.instalments ?? 1, bid.bonus ?? 0);
  record(buyer.finances, 'playerPurchases', payNow);
  record(buyer.finances, 'agentFees', offer.agentFee);
  record(buyer.finances, 'bonuses', offer.signingBonus);
  buyer.finances.transferBudget = Math.max(0, buyer.finances.transferBudget - payNow - offer.agentFee - offer.signingBonus);
  const seller = n.sellerClubId ? state.clubs[n.sellerClubId] : null;
  // Si estaba cedido en otro club, sale de allí también.
  if (p.loan && p.clubId && p.clubId !== seller?.id) removeFromClub(state, state.clubs[p.clubId], p.id);
  p.loan = null;
  if (seller) {
    if (fee > 0) {
      let paidOut = 0;
      for (const clause of p.sellOnClauses) {
        const beneficiary = state.clubs[clause.clubId];
        if (!beneficiary || beneficiary.id === buyer.id) continue;
        const cut = fee * (clause.percent / 100);
        record(beneficiary.finances, 'playerSales', cut);
        creditSale(beneficiary, cut);
        paidOut += cut;
        addNews(state, { category: 'transfer', title: msg('news.sellOn.t', { club: beneficiary.name, amount: Math.round(cut), p: `${p.firstName} ${p.lastName}` }), body: msg('news.sellOn.b', { pct: clause.percent, buyer: buyer.name }), clubIds: [beneficiary.id] });
      }
      record(seller.finances, 'playerSales', Math.max(0, payNow - paidOut));
      creditSale(seller, Math.max(0, payNow - paidOut));
    }
    removeFromClub(state, seller, p.id);
  }
  if (n.localSeller) {
    const rt = state.countries[p.nationality];
    if (rt) rt.poolPlayerIds = rt.poolPlayerIds.filter((id) => id !== p.id);
  }
  state.freeAgentIds = state.freeAgentIds.filter((id) => id !== p.id);
  p.sellOnClauses = seller && bid.sellOnPercent > 0 ? [{ clubId: seller.id, percent: bid.sellOnPercent }] : [];
  p.buyBack = seller?.isUser && bid.buyBack && bid.buyBack > 0 ? { clubId: seller.id, fee: bid.buyBack, untilSeason: state.season + 2 } : undefined;
  const contract: Contract = {
    wage: offer.wage,
    signedSeason: state.season,
    expiresSeason: state.season + offer.years - (state.day >= CALENDAR.winterWindow[0] ? 0 : 1),
    releaseClause: offer.releaseClause,
    goalBonus: offer.goalBonus,
    cleanSheetBonus: offer.cleanSheetBonus,
    signingBonus: offer.signingBonus,
    ...(offer.appearanceBonus ? { appearanceBonus: offer.appearanceBonus } : {}),
    ...(offer.autoRaisePct ? { autoRaisePct: offer.autoRaisePct } : {}),
    ...(offer.autoCutPct ? { autoCutPct: offer.autoCutPct } : {}),
    ...(offer.role ? { role: offer.role } : {}),
  };
  p.contract = contract;
  p.clubId = buyer.id;
  p.listed = null;
  p.academy = false;
  p.prospect = undefined;
  p.statusLocked = false;
  p.promise = buyer.isUser && (offer.role === 'key' || offer.role === 'first') ? { kind: 'starter', season: state.season, untilDay: state.day + 70 } : null;
  p.happiness = 75;
  p.morale = clamp(p.morale + 10, 0, 100);
  p.wantsToLeave = false;
  buyer.playerIds.push(p.id);
  // Jugadores incluidos en la operación: pasan del comprador al vendedor.
  if (seller && bid.playersOffered?.length) {
    const ok = new Set(tradeablePlayers(state, buyer.id).map((q) => q.id));
    for (const id of bid.playersOffered.slice(0, MAX_PLAYERS_IN_DEAL)) {
      const q = state.players[id];
      if (!q || q.id === p.id || q.clubId !== buyer.id || !ok.has(id)) continue;
      removeFromClub(state, buyer, q.id);
      q.clubId = seller.id;
      q.listed = null;
      q.promise = null;
      q.statusLocked = false;
      q.happiness = clamp(q.happiness - 5, 0, 100);
      seller.playerIds.push(q.id);
      state.transfers.push({ season: state.season, day: state.day, playerId: q.id, fromClubId: buyer.id, toClubId: seller.id, fee: 0, wage: q.contract?.wage ?? 0 });
      addNews(state, {
        category: 'transfer',
        title: msg('news.swap.t', { p: `${q.firstName} ${q.lastName}`, club: seller.name }),
        body: msg('news.swap.b', { target: `${p.firstName} ${p.lastName}`, buyer: buyer.name }),
        clubIds: [buyer.id, seller.id],
        playerId: q.id,
      });
    }
    assignSquadStatuses(clubPlayers(state, seller.id), true);
  }
  assignSquadStatuses(clubPlayers(state, buyer.id), true);
  state.transfers.push({ season: state.season, day: state.day, playerId: p.id, fromClubId: seller?.id ?? null, toClubId: buyer.id, fee, wage: offer.wage });
  const share = wageShareOfRevenue(buyer, offer.wage, state.leagues[buyer.leagueId]?.tier ?? 1);
  addNews(state, {
    category: 'transfer',
    title: fee > 0 ? msg('news.transfer.t', { p: `${p.firstName} ${p.lastName}`, club: buyer.name, fee }) : msg('news.transferFree.t', { p: `${p.firstName} ${p.lastName}`, club: buyer.name }),
    body: msg(share > 0.15 ? 'news.transfer.bBig' : 'news.transfer.b', { year: contract.expiresSeason + 1, wage: offer.wage, share: Math.round(share * 100), from: seller?.name ?? '-' }),
    clubIds: [buyer.id, ...(seller ? [seller.id] : [])],
    playerId: p.id,
    importance: fee > 20e6 || share > 0.15 ? 3 : 2,
  });
  if (rng && (buyer.isUser || buyer.reputation >= 75)) postSigning(state, rng, buyer, p, fee);
  if (buyer.isUser) {
    // Revelación de fichaje (carta) y logros de mercado.
    unlockAchievement(state, 'firstSigning');
    if (fee >= 10_000_000) unlockAchievement(state, 'bigSigning');
    // Presentación del fichaje: aquí (y no antes) se ve cómo lo recibe la afición y la prensa.
    const mood = signingMood(state, p, buyer.id, fee);
    pushReveal(state, {
      kind: 'signing',
      playerId: p.id,
      title: msg('ui.reveal.signT', { p: `${p.firstName} ${p.lastName}` }),
      body: msg(fee > 0 ? 'ui.reveal.signB' : 'ui.reveal.signFreeB', { fee, ovr: overall(p) }),
      extra: [msg(`ui.pres.fan.${mood}`, { p: p.lastName }), msg(`ui.pres.press.${mood}`, { p: p.lastName }), msg(`ui.pres.board.${mood}`)],
    });
  }
  n.stage = 'agreed';
}

/** Cierra una cesión: el jugador pasa al club que lo recibe hasta final de temporada. */
export function completeLoan(state: GameState, n: Negotiation): void {
  const p = state.players[n.playerId];
  const buyer = state.clubs[n.buyerClubId];
  const parent = n.sellerClubId ? state.clubs[n.sellerClubId] : null;
  const terms = n.loan;
  if (!parent || !terms) throw new Error('err.negotiation');
  const fee = n.bid?.fee ?? 0;
  if (fee > 0) {
    record(buyer.finances, 'loanFeesOut', fee);
    record(parent.finances, 'loanFeesIn', fee);
    creditSale(parent, fee);
    buyer.finances.transferBudget = Math.max(0, buyer.finances.transferBudget - fee);
  }
  removeFromClub(state, parent, p.id);
  p.loan = { parentClubId: parent.id, untilSeason: state.season, wageShare: terms.wageShare, buyOption: terms.buyOption, obligatory: terms.obligatory };
  p.clubId = buyer.id;
  p.listed = null;
  p.happiness = clamp(p.happiness + 8, 0, 100);
  buyer.playerIds.push(p.id);
  assignSquadStatuses(clubPlayers(state, buyer.id), true);
  state.transfers.push({ season: state.season, day: state.day, playerId: p.id, fromClubId: parent.id, toClubId: buyer.id, fee, wage: p.contract?.wage ?? 0, loan: true });
  addNews(state, {
    category: 'transfer',
    title: msg('news.loan.t', { p: `${p.firstName} ${p.lastName}`, club: buyer.name, from: parent.name }),
    body: msg(terms.buyOption ? 'news.loan.bOption' : 'news.loan.b', { share: terms.wageShare, option: terms.buyOption ?? 0 }),
    clubIds: [buyer.id, parent.id],
    playerId: p.id,
    importance: buyer.isUser || parent.isUser ? 2 : 1,
  });
  n.stage = 'agreed';
}

/** Ejecuta la opción de compra de un cedido (el usuario o la IA durante la temporada). */
export function exerciseBuyOption(state: GameState, playerId: Id): boolean {
  const p = state.players[playerId];
  if (!p?.loan || p.loan.buyOption === null || !p.clubId) return false;
  const buyer = state.clubs[p.clubId];
  const parent = state.clubs[p.loan.parentClubId];
  const fee = p.loan.buyOption;
  if (buyer.finances.transferBudget < fee && !p.loan.obligatory) return false;
  record(buyer.finances, 'playerPurchases', fee);
  record(parent.finances, 'playerSales', fee);
  creditSale(parent, fee);
  buyer.finances.transferBudget = Math.max(0, buyer.finances.transferBudget - fee);
  p.loan = null;
  state.transfers.push({ season: state.season, day: state.day, playerId: p.id, fromClubId: parent.id, toClubId: buyer.id, fee, wage: p.contract?.wage ?? 0 });
  addNews(state, { category: 'transfer', title: msg('news.buyOption.t', { p: `${p.firstName} ${p.lastName}`, club: buyer.name, fee }), body: msg('news.buyOption.b', { from: parent.name }), clubIds: [buyer.id, parent.id], playerId: p.id, importance: 2 });
  return true;
}

/** Final de temporada: vuelven los cedidos (o se ejecutan las obligaciones de compra). */
export function endLoans(state: GameState): void {
  for (const p of Object.values(state.players)) {
    if (!p.loan || p.loan.untilSeason > state.season) continue;
    if (p.loan.obligatory && p.loan.buyOption !== null && exerciseBuyOption(state, p.id)) continue;
    const borrower = p.clubId ? state.clubs[p.clubId] : null;
    const parent = state.clubs[p.loan.parentClubId];
    const wasAcademy = !!p.loan.wasAcademy;
    if (borrower) removeFromClub(state, borrower, p.id);
    p.loan = null;
    if (parent) {
      p.clubId = parent.id;
      if (wasAcademy) p.academy = true;
      parent.playerIds.push(p.id);
    } else {
      p.clubId = null;
      state.freeAgentIds.push(p.id);
    }
  }
}

/** Respuesta del usuario a una puja entrante de la IA por uno de sus jugadores. */
export function respondToIncomingBid(state: GameState, negId: Id, accept: boolean, rng: Rng): Msg {
  const n = state.negotiations[negId];
  if (!n || !n.incoming || n.stage !== 'club' || !n.bid) throw new Error('err.negotiation');
  const p = state.players[n.playerId];
  const pName = `${p.firstName} ${p.lastName}`;
  if (!accept) {
    n.stage = 'collapsed';
    p.happiness = clamp(p.happiness - (p.wantsToLeave ? 15 : 3), 0, 100);
    return msg('neg.inc.rejected');
  }
  const buyer = state.clubs[n.buyerClubId];
  if (n.kind === 'loan' && n.loan) {
    completeLoan(state, n);
    return msg('neg.inc.loaned', { p: pName, club: buyer.name });
  }
  n.stage = 'player';
  const ex = playerExpectations(state, p, buyer);
  const offer: ContractOffer = { wage: ex.idealWage, years: ex.years, releaseClause: null, goalBonus: 0, cleanSheetBonus: 0, signingBonus: 0, agentFee: ex.agentFee };
  const res = evaluateContractOffer(state, p, buyer, offer, 1);
  if (res.decision === 'accept' || (res.decision === 'counter' && rng.chance(0.7))) {
    n.contract = res.counter ?? offer;
    completeTransfer(state, n, rng);
    return msg('neg.inc.leaves', { p: pName, club: buyer.name });
  }
  n.stage = 'collapsed';
  return msg('neg.inc.stays', { p: pName, club: buyer.name });
}

/** Techo oculto de efectivo que el comprador de una oferta entrante está dispuesto a pagar. */
function incomingCeiling(state: GameState, n: Negotiation): number {
  const p = state.players[n.playerId];
  const buyer = state.clubs[n.buyerClubId];
  const factor = 0.95 + (hashString(`${n.id}:ceil`) % 41) / 100;
  const swap = n.bid ? offeredPlayersValue(state, n.bid, buyer.id) : 0;
  return Math.max(0, Math.min(buyer.finances.transferBudget, playerValue(state, p) * factor - swap));
}

/**
 * El usuario contesta una oferta entrante con su precio (y % de futura venta / recompra): el club acepta si
 * cabe en su techo, contraoferta si está cerca (máx. 3 rondas) o se retira.
 */
export function counterIncomingBid(
  state: GameState,
  negId: Id,
  counter: { fee: number; sellOnPercent?: number; buyBack?: number | null },
  rng: Rng,
): { decision: Decision; message: Msg } {
  const n = state.negotiations[negId];
  if (!n || !n.incoming || n.stage !== 'club' || !n.bid || n.kind !== 'transfer') throw new Error('err.negotiation');
  const buyer = state.clubs[n.buyerClubId];
  n.incomingRounds = (n.incomingRounds ?? 0) + 1;
  const sellOn = clamp(counter.sellOnPercent ?? 0, 0, 50);
  const buyBack = counter.buyBack && counter.buyBack > 0 ? Math.round(counter.buyBack) : undefined;
  // Ceder un % de futura venta o una recompra resta atractivo a la operación.
  const ceiling = incomingCeiling(state, n) * (1 - sellOn * 0.004) * (buyBack ? 0.93 : 1);
  const fee = Math.max(0, Math.round(counter.fee));
  if (fee <= ceiling * 0.98) {
    n.bid = { ...n.bid, fee, sellOnPercent: sellOn, buyBack };
    return { decision: 'accept', message: respondToIncomingBid(state, negId, true, rng) };
  }
  if (fee <= ceiling * 1.12 && n.incomingRounds < 3) {
    const next = Math.max(n.bid.fee, roundMoney(ceiling * 0.98));
    n.bid = { ...n.bid, fee: next, sellOnPercent: sellOn, buyBack };
    addTension(n, 15);
    return { decision: 'counter', message: msg('neg.inc.counter', { club: buyer.name, fee: next }) };
  }
  n.stage = 'collapsed';
  return { decision: 'reject', message: msg('neg.inc.walks', { club: buyer.name }) };
}

/** Con cierta probabilidad la IA incluye a un jugador suyo (que cubra un hueco tuyo) y baja el efectivo. */
export function addSwapToOffer(state: GameState, n: Negotiation, rng: Rng): void {
  if (!n.bid || n.kind !== 'transfer' || !n.sellerClubId || !rng.chance(0.25)) return;
  const user = state.clubs[n.sellerClubId];
  const needs = weakestSlots(user, clubPlayers(state, user.id).filter((q) => !q.academy));
  const price = n.bid.fee;
  const cands = tradeablePlayers(state, n.buyerClubId)
    .filter((q) => {
      const v = playerTradeValue(state, q);
      return v <= price * 0.6 && v >= price * 0.1 && needs.some((nd) => overallAt(q, nd.pos) >= nd.level - 2);
    })
    .sort((a, b) => playerTradeValue(state, b) - playerTradeValue(state, a));
  const q = cands[0];
  if (!q) return;
  n.bid = { ...n.bid, fee: roundMoney(Math.max(0, price - playerTradeValue(state, q))), playersOffered: [q.id] };
}

/** Recompra de un jugador que vendiste con cláusula (dentro de su plazo y con presupuesto). */
export function exerciseBuyBack(state: GameState, playerId: Id): { ok: boolean; message: Msg } {
  const p = state.players[playerId];
  const uid = state.userClubId;
  const bb = p?.buyBack;
  if (!p || !uid || !bb || bb.clubId !== uid || state.season > bb.untilSeason || p.clubId === uid || p.retired) return { ok: false, message: msg('buyback.invalid') };
  const club = state.clubs[uid];
  if (bb.fee > club.finances.transferBudget) return { ok: false, message: msg('neg.budget', { budget: club.finances.transferBudget }) };
  const ex = playerExpectations(state, p, club);
  const bill = weeklyWageBill(clubPlayers(state, uid), uid);
  if (bill + ex.idealWage > club.finances.wageBudget) return { ok: false, message: msg('neg.wageBudget', { budget: club.finances.wageBudget }) };
  const n = startNegotiation(state, p.id, uid);
  n.bid = { fee: bb.fee, sellOnPercent: 0 };
  n.contract = { wage: ex.idealWage, years: ex.years, releaseClause: null, goalBonus: 0, cleanSheetBonus: 0, signingBonus: 0, agentFee: 0 };
  n.stage = 'player';
  completeTransfer(state, n);
  p.buyBack = undefined;
  return { ok: true, message: msg('buyback.done', { p: `${p.firstName} ${p.lastName}` }) };
}

// ───────────────────────── IA de mercado ─────────────────────────

export interface SlotNeed {
  /** Posición base objetivo del hueco (rejilla V2). */
  pos: Position;
  /** Nivel efectivo (media por puesto × encaje de estilo) del titular más flojo de ese hueco. */
  level: number;
}

/**
 * Los `count` peores huecos de la rejilla táctica V2 del club: la media efectiva del titular
 * (media por puesto × encaje de estilo) más baja. Nunca hay que reforzar un puesto ya cubierto.
 */
export function weakestSlots(club: Club, players: Player[], count = 3): SlotNeed[] {
  const slots = slotPositions(club.tactic.tactic);
  const style = nearestPreset(club.tactic.tactic.sliders);
  const counts = new Map<Position, number>();
  for (const pos of slots) counts.set(pos, (counts.get(pos) ?? 0) + 1);
  const fit = new Map(players.map((p) => [p.id, styleFit(p, style)]));
  const needs: SlotNeed[] = [];
  for (const [pos, needed] of counts) {
    const levels = players.map((p) => overallAt(p, pos) * (fit.get(p.id) as number)).sort((a, b) => b - a);
    const level = (levels[needed - 1] ?? 30) * 0.8 + (levels[needed] ?? 25) * 0.2;
    needs.push({ pos, level });
  }
  needs.sort((a, b) => a.level - b.level);
  return needs.slice(0, count);
}

/** Cupo blando: por encima de 30 jugadores la IA pone al excedente en la lista de transferibles. */
export const AI_SQUAD_SOFT_CAP = 30;
/** Por encima de este cupo la IA ni ficha ni renueva: primero debe vender. */
export const AI_SQUAD_BUY_CAP = 30;
/** Cupo duro: por encima de este número libera al excedente más débil para no inflar la plantilla. */
export const AI_SQUAD_HARD_CAP = 33;

/**
 * Venta de descontentos y excedentes: pone en la lista de transferibles a los jugadores que no caben
 * en la plantilla (por encima del cupo) o que están descontentos por minutos/prestigio.
 */
export function aiListSurplus(state: GameState, club: Club): void {
  if (club.isUser) return;
  const players = clubPlayers(state, club.id).filter((p) => !p.academy && !p.loan);
  if (players.length === 0) return;
  const surplus = players.length - AI_SQUAD_SOFT_CAP;
  if (surplus > 0) {
    const weakest = [...players].sort((a, b) => overall(a) - overall(b)).slice(0, surplus);
    for (const p of weakest) if (!p.listed) p.listed = 'transfer';
  }
  for (const p of players) {
    if ((p.wantsToLeave || p.happiness < 38) && !p.listed) p.listed = 'transfer';
  }
}

/** Salario escalonado por estatus que la IA está dispuesta a ofrecer al renovar. */
const RENEW_UPLIFT: Record<SquadStatus, number> = { key: 1.28, first: 1.18, rotation: 1.09, backup: 1.02, youth: 1 };
/** Probabilidad mensual de abrir la renovación de un jugador según su estatus. */
const RENEW_PROB: Record<SquadStatus, number> = { key: 0.5, first: 0.35, rotation: 0.2, backup: 0.1, youth: 0 };

/**
 * Renovaciones preventivas: la IA revisa a sus jugadores clave que entran en su último año de
 * contrato y les ofrece una renovación con salario escalonado por estatus, de modo que no se vayan
 * gratis al mercado. Devuelve cuántos contratos ha extendido.
 */
export function aiRenewContracts(state: GameState, club: Club, rng: Rng): number {
  if (club.isUser) return 0;
  const all = clubPlayers(state, club.id);
  const squad = all.filter((p) => !p.academy && !p.loan && p.contract);
  if (squad.length === 0) return 0;
  const avg = squad.reduce((s, p) => s + overall(p), 0) / squad.length;
  let renewed = 0;
  for (const p of squad) {
    const contract = p.contract;
    if (!contract || contract.expiresSeason > state.season) continue; // todavía hay margen
    if (p.age >= 34) continue; // veteranos: en general la IA prefiere dejarlos salir
    const wanted = p.squadStatus === 'key' || p.squadStatus === 'first' || (p.squadStatus === 'rotation' && overall(p) >= avg);
    if (!wanted || !rng.chance(RENEW_PROB[p.squadStatus])) continue;
    const wageRoom = club.finances.wageBudget - weeklyWageBill(all, club.id);
    const ex = playerExpectations(state, p, club);
    const wage = roundMoney(Math.max(contract.wage * RENEW_UPLIFT[p.squadStatus], ex.minWage * 0.95));
    if (wage - contract.wage > wageRoom) continue;
    const offer: ContractOffer = { wage, years: Math.max(2, ex.years - 1), releaseClause: contract.releaseClause, goalBonus: 0, cleanSheetBonus: 0, signingBonus: 0, agentFee: ex.agentFee };
    let res = renewContract(state, club.id, p.id, offer);
    if (res.decision === 'counter' && res.counter && res.counter.wage - contract.wage <= wageRoom) res = renewContract(state, club.id, p.id, res.counter);
    if (res.decision === 'accept') renewed++;
  }
  return renewed;
}

/**
 * Actividad semanal de la IA en ventana: tapa sus peores huecos V2 con jugadores que encajen en el
 * estilo de su mánager; si no encuentra traspaso asequible, intenta una cesión de un club grande.
 * En el día de pánico (últimas 24 h) es más agresiva y sus rivales venden más barato.
 */
export function aiTransferActivity(state: GameState, rng: Rng, clubId: Id, candidatePool: Id[], panic = isDeadlineDay(state.day)): void {
  const club = state.clubs[clubId];
  if (club.isUser || club.finances.fpf.transferEmbargo) return;
  const players = clubPlayers(state, clubId).filter((p) => !p.academy);
  aiListSurplus(state, club);
  if (players.length > AI_SQUAD_BUY_CAP) {
    // Plantilla inflada: primero vende (o libera sólo si está muy por encima del cupo duro).
    if (players.length > AI_SQUAD_HARD_CAP) {
      const sorted = [...players].filter((p) => !p.loan).sort((a, b) => overall(a) - overall(b));
      for (const p of sorted.slice(0, players.length - AI_SQUAD_BUY_CAP)) releasePlayer(state, club.id, p.id, false);
    }
    return;
  }
  const needs = weakestSlots(club, players);
  if (needs.length === 0 || candidatePool.length === 0) return;
  const worst = needs[0];
  const style = nearestPreset(club.tactic.tactic.sliders);
  const budget = club.finances.transferBudget;
  const wageRoom = club.finances.wageBudget - weeklyWageBill(players, club.id);
  const marginMin = panic ? 1 : 2;
  const fitMin = panic ? 0.85 : 0.9;
  let best: { p: Player; score: number; fee: number; loan: boolean } | null = null;
  for (let i = 0; i < 70; i++) {
    const id = candidatePool[Math.floor(rng.next() * candidatePool.length)];
    const p = state.players[id];
    if (!p || p.retired || p.clubId === clubId || p.injury || p.academy || p.prospect || p.loan) continue;
    const owner = ownerClubId(p);
    const ownerClub = owner ? state.clubs[owner] : null;
    if (ownerClub?.isUser && !p.wantsToLeave && !p.listed && rng.chance(0.85)) continue;
    // Filtro rápido por media en el puesto y por valor de mercado antes del (más caro) encaje de estilo.
    const raw = overallAt(p, worst.pos);
    if (raw * 1.1 < worst.level + marginMin) continue;
    // Cesión: jugador joven/suplente de un club claramente más grande.
    const loanable = !!ownerClub && ownerClub.reputation >= club.reputation + 8 && (p.listed === 'loan' || (p.age <= 22 && (p.squadStatus === 'youth' || p.squadStatus === 'backup')));
    const fee = askingPrice(state, p);
    if (!loanable && fee > budget) continue;
    const fitMult = styleFit(p, style);
    if (fitMult < fitMin) continue;
    // Hueco (de los peores) que mejor tapa el candidato.
    let margin = -Infinity;
    for (const n of needs) {
      const m = overallAt(p, n.pos) * fitMult - n.level;
      if (m > margin) margin = m;
    }
    if (margin < marginMin) continue;
    if (p.reputation > club.reputation + 20) continue;
    const ex = playerExpectations(state, p, club);
    if (!loanable && (!ex.willNegotiate || ex.idealWage > wageRoom || ex.revenueShare > 0.12)) continue;
    const ageBias = p.age <= 24 ? 2 : p.age >= 31 ? -3 : 0;
    const listedBias = p.listed ? 2 : 0;
    const score = margin + ageBias + listedBias - (loanable ? 0 : (fee / Math.max(1, budget)) * 3);
    if (!best || score > best.score) best = { p, score, fee, loan: loanable && fee > budget * 0.6 };
  }
  if (!best) return;
  const ownerClub = ownerClubId(best.p) ? state.clubs[ownerClubId(best.p) as Id] : null;
  const incoming = !!ownerClub?.isUser;
  const n = startNegotiation(state, best.p.id, clubId, incoming, best.loan ? 'loan' : 'transfer');
  if (rng.chance(0.4)) postRumour(state, rng, best.p, ownerClub, club);
  if (n.incoming) {
    // Puja por un jugador del usuario: queda pendiente de su decisión.
    if (n.kind === 'loan') n.loan = { wageShare: 100, buyOption: rng.chance(0.4) ? roundMoney(best.fee * 1.1) : null, obligatory: false };
    n.bid = { fee: n.kind === 'loan' ? roundMoney(best.fee * 0.05) : roundMoney(best.fee * rng.float(0.9, 1.05)), sellOnPercent: 0 };
    addSwapToOffer(state, n, rng);
    addNews(state, {
      category: 'transfer',
      title: msg(n.kind === 'loan' ? 'news.loanBid.t' : 'news.bid.t', { club: club.name, fee: n.bid.fee, p: `${best.p.firstName} ${best.p.lastName}` }),
      body: msg('news.bid.b'),
      clubIds: [clubId, state.userClubId ?? ''],
      playerId: best.p.id,
      importance: 3,
    });
    return;
  }
  if (n.kind === 'loan') {
    submitLoanBid(state, n.id, 0, { wageShare: 100, buyOption: null, obligatory: false });
    if (n.stage === 'club' && n.loanCounter) submitLoanBid(state, n.id, 0, n.loanCounter);
    delete state.negotiations[n.id];
    return;
  }
  if (n.stage === 'club') {
    const r = submitBid(state, n.id, { fee: roundMoney(best.fee * rng.float(0.92, 1.03)), sellOnPercent: rng.chance(0.3) ? 10 : 0 });
    if (r.decision === 'counter' && n.sellerCounter && n.sellerCounter.fee <= club.finances.transferBudget) submitBid(state, n.id, n.sellerCounter);
  }
  if (n.stage === 'player') {
    const ex = playerExpectations(state, best.p, club);
    const offer: ContractOffer = { wage: ex.idealWage, years: ex.years, releaseClause: null, goalBonus: 0, cleanSheetBonus: 0, signingBonus: 0, agentFee: ex.agentFee };
    const r = submitContract(state, n.id, offer);
    if (r.decision === 'counter' && n.playerCounter && n.playerCounter.wage <= wageRoom) submitContract(state, n.id, n.playerCounter);
  }
  // AI-to-AI deals are already applied (or failed): nothing to keep.
  delete state.negotiations[n.id];
}

/** Al empezar la temporada la IA pone en lista a veteranos suplentes y cede a sus jóvenes. */
export function aiListPlayers(state: GameState, club: Club): void {
  if (club.isUser) return;
  for (const p of clubPlayers(state, club.id)) {
    if (p.loan) continue;
    if (p.age >= 29 && p.squadStatus === 'backup') p.listed = 'transfer';
    else if (p.age <= 21 && (p.squadStatus === 'youth' || p.squadStatus === 'backup') && club.reputation >= 55) p.listed = 'loan';
    else p.listed = null;
  }
}

/** Rescinde un contrato pagando la mitad del salario restante. */
export function releasePlayer(state: GameState, clubId: Id, playerId: Id, payCompensation = true): number {
  const club = state.clubs[clubId];
  const p = state.players[playerId];
  if (!p || p.clubId !== clubId) throw new Error('err.notInClub');
  let comp = 0;
  if (payCompensation && p.contract) {
    const weeksLeft = Math.max(0, (p.contract.expiresSeason - state.season) * 52 + (365 - state.day) / 7);
    comp = p.contract.wage * weeksLeft * 0.5;
    record(club.finances, 'wages', comp);
  }
  club.playerIds = club.playerIds.filter((id) => id !== playerId);
  club.tactic.lineup = club.tactic.lineup.map((id) => (id === playerId ? '' : id));
  club.tactic.bench = club.tactic.bench.filter((id) => id !== playerId);
  p.clubId = null;
  p.contract = null;
  p.loan = null;
  p.listed = null;
  p.academy = false;
  p.sellOnClauses = [];
  state.freeAgentIds.push(p.id);
  return comp;
}

/** Renovación: el propio club negocia con las mismas reglas de ambición y mercado. */
export function renewContract(state: GameState, clubId: Id, playerId: Id, offer: ContractOffer): { decision: Decision; message: Msg; counter: ContractOffer | null } {
  const club = state.clubs[clubId];
  const p = state.players[playerId];
  if (p.clubId !== clubId || !p.contract) throw new Error('err.noContract');
  const res = evaluateContractOffer(state, p, club, offer, 1);
  if (res.decision === 'accept') {
    record(club.finances, 'agentFees', offer.agentFee);
    record(club.finances, 'bonuses', offer.signingBonus);
    p.contract = {
      wage: offer.wage,
      signedSeason: state.season,
      expiresSeason: state.season + offer.years,
      releaseClause: offer.releaseClause,
      goalBonus: offer.goalBonus,
      cleanSheetBonus: offer.cleanSheetBonus,
      signingBonus: offer.signingBonus,
    };
    p.happiness = clamp(p.happiness + 10, 0, 100);
    if (p.promise?.kind === 'newContract') p.promise = null;
  }
  return { decision: res.decision, message: res.message, counter: res.counter };
}

// ───────────────────────── Respuestas con espera ─────────────────────────

/** Día absoluto (temporada × 400 + día) usado para fechar las respuestas pendientes. */
export const absDayOf = (state: GameState): number => state.season * 400 + state.day;

/**
 * Días que tarda un club o un agente en contestar: 1-3 según la operación (determinista). Los clubes de
 * la IA aprietan el último día de mercado y los agentes libres contestan al día siguiente.
 */
export function replyDelayDays(state: GameState, n: Negotiation, kind: AwaitingReply['kind']): number {
  if (isDeadlineDay(state.day)) return 1;
  if (kind === 'contract' && !n.sellerClubId) return 1;
  return 1 + (hashString(`${n.id}:${n.rounds}:${kind}`) % 3);
}

function enqueue(state: GameState, n: Negotiation, a: Omit<AwaitingReply, 'replyAbs' | 'sentAbs'>): AwaitingReply {
  const sentAbs = absDayOf(state);
  const live = state.meta?.deadlineLive;
  // Deadline Day en vivo: contestan en 1-3 horas del mismo día (el mercado no espera a mañana).
  if (live && !live.finished && live.season === state.season && live.day === state.day) {
    const hour = live.hour + 1 + (hashString(`${n.id}:${n.rounds}:${a.kind}:h`) % 3);
    const awaitingLive: AwaitingReply = { ...a, sentAbs, replyAbs: sentAbs, replyHour: hour };
    n.awaiting = awaitingLive;
    return awaitingLive;
  }
  const awaiting: AwaitingReply = { ...a, sentAbs, replyAbs: sentAbs + replyDelayDays(state, n, a.kind) };
  n.awaiting = awaiting;
  return awaiting;
}

export type QueueResult = { queued: true; replyAbs: number } | { queued: false; message: Msg };

/** El usuario envía una oferta al club: la respuesta llega en 1-3 días. */
export function queueBid(state: GameState, negId: Id, bid: ClubBid): QueueResult {
  const n = state.negotiations[negId];
  if (!n || n.stage !== 'club' || n.awaiting) throw new Error('err.negotiation');
  const buyer = state.clubs[n.buyerClubId];
  if (bid.fee > buyer.finances.transferBudget) return { queued: false, message: msg('neg.budget', { budget: buyer.finances.transferBudget }) };
  return { queued: true, replyAbs: enqueue(state, n, { kind: 'bid', bid }).replyAbs };
}

export function queueLoanBid(state: GameState, negId: Id, fee: number, terms: LoanTerms): QueueResult {
  const n = state.negotiations[negId];
  if (!n || n.stage !== 'club' || n.awaiting) throw new Error('err.negotiation');
  const buyer = state.clubs[n.buyerClubId];
  if (fee > buyer.finances.transferBudget) return { queued: false, message: msg('neg.budget', { budget: buyer.finances.transferBudget }) };
  return { queued: true, replyAbs: enqueue(state, n, { kind: 'loan', loanFee: fee, loan: terms }).replyAbs };
}

export function queueContract(state: GameState, negId: Id, offer: ContractOffer): QueueResult {
  const n = state.negotiations[negId];
  // Conversaciones en paralelo: el jugador puede negociar mientras el club aún está en la mesa.
  if (!n || (n.stage !== 'player' && n.stage !== 'club') || n.awaiting) throw new Error('err.negotiation');
  const buyer = state.clubs[n.buyerClubId];
  const bill = weeklyWageBill(clubPlayers(state, buyer.id), buyer.id);
  if (buyer.isUser && bill + offer.wage > buyer.finances.wageBudget) return { queued: false, message: msg('neg.wageBudget', { budget: buyer.finances.wageBudget }) };
  return { queued: true, replyAbs: enqueue(state, n, { kind: 'contract', offer }).replyAbs };
}

/**
 * Resuelve las ofertas cuya respuesta ya llegó. Se llama una vez al día desde `advanceDay`; el
 * Deadline Day en vivo la llama cada hora con `liveHour` (sólo contesta lo que vence a esa hora).
 */
export function processNegotiations(state: GameState, liveHour?: number): number {
  const today = absDayOf(state);
  let resolved = 0;
  for (const n of Object.values(state.negotiations)) {
    const hourly = liveHour !== undefined;
    // Traspasos pactados para la próxima ventana / temporada.
    if (!hourly && n.stage === 'agreed' && n.entryAbs && n.entryAbs <= today) {
      n.entryAbs = null;
      try {
        const p = state.players[n.playerId];
        if (p && ownerClubId(p) === n.sellerClubId && n.contract) completeTransfer(state, n, new Rng((state.rngState ^ hashString(n.id)) >>> 0));
        else n.stage = 'collapsed';
      } catch {
        n.stage = 'collapsed';
      }
      resolved++;
      continue;
    }
    // Renegociación sin respuesta: el trato se cae.
    if (!hourly && n.stage === 'renegotiation' && n.renegotiation && n.renegotiation.untilAbs < today) {
      n.stage = 'collapsed';
      n.renegotiation = null;
      n.log.push(msg('neg.renegExpired'));
      continue;
    }
    const a = n.awaiting;
    if (!a || a.replyAbs > today) continue;
    if (hourly && a.replyAbs === today && (a.replyHour ?? 0) > liveHour) continue;
    n.awaiting = null;
    if (a.kind === 'enquiry') {
      if (n.stage === 'enquiry') {
        resolveEnquiry(state, n);
        resolved++;
      }
      continue;
    }
    let res: { decision: Decision; message: Msg } | null = null;
    try {
      if (a.kind === 'bid' && a.bid && n.stage === 'club') res = submitBid(state, n.id, a.bid);
      else if (a.kind === 'loan' && a.loan && n.stage === 'club') res = submitLoanBid(state, n.id, a.loanFee ?? 0, a.loan);
      else if (a.kind === 'contract' && a.offer && (n.stage === 'player' || n.stage === 'club')) res = submitContract(state, n.id, a.offer);
    } catch {
      res = null;
    }
    if (!res) continue;
    resolved++;
    const p = state.players[n.playerId];
    if (p && state.clubs[n.buyerClubId]?.isUser) {
      addNews(state, {
        category: 'transfer',
        title: msg('news.reply.t', { p: `${p.firstName} ${p.lastName}`, club: n.sellerClubId ? state.clubs[n.sellerClubId].name : '-' }),
        body: msg('news.reply.b', { res: res.message }),
        clubIds: [n.buyerClubId],
        playerId: p.id,
        importance: 2,
      });
    }
  }
  return resolved;
}

// ───────────────────────── Traspasos por fases (estilo FC 27) ─────────────────────────

/** Día absoluto en que entra el jugador según el momento pactado. */
export function entryAbsFor(state: GameState, entry: NonNullable<ClubBid['entry']>): number {
  if (entry === 'nextSeason') return (state.season + 1) * 400;
  return state.day < CALENDAR.winterWindow[0] ? state.season * 400 + CALENDAR.winterWindow[0] : (state.season + 1) * 400;
}

/** Cómo recibirá la afición el fichaje (se muestra DESPUÉS, en la presentación). */
export function signingMood(state: GameState, p: Player, buyerId: Id, fee: number): 'hype' | 'mixed' | 'doubt' {
  const mates = clubPlayers(state, buyerId).filter((q) => !q.academy && q.id !== p.id && q.position === p.position);
  const top = Math.max(0, ...mates.map((q) => overall(q)));
  const upgrade = mates.length ? overall(p) - top : 4;
  const value = Math.max(1, playerValue(state, p));
  const ratio = fee / value;
  const prospect = p.age <= 22 && p.potential - overall(p) >= 8 ? 5 : 0;
  const score = upgrade * 1.6 + (1 - ratio) * 10 + prospect + (p.reputation - 60) / 8;
  return score >= 6 ? 'hype' : score >= -3 ? 'mixed' : 'doubt';
}

/** Probabilidad (%) de que un acuerdo cerrado se reabra: sólo las estrellas atraen a rivales. */
export function renegotiationChance(p: Player): number {
  return clamp((p.reputation - 55) * 1.1, 0, 30);
}

/** Cierra un acuerdo: puede reabrirse (rival interesado), programarse para más tarde o completarse. */
export function finalizeDeal(state: GameState, n: Negotiation, rng?: Rng): void {
  const p = state.players[n.playerId];
  const buyer = state.clubs[n.buyerClubId];
  if (!p || !buyer) return;
  if (buyer.isUser && !n.renegotiated && n.kind === 'transfer' && hashString(`${n.id}:rv`) % 100 < renegotiationChance(p)) {
    const rival = hashString(`${n.id}:rk`) % 2 === 0;
    const bump = hashString(`${n.id}:rp`) % 8;
    n.renegotiated = true;
    n.renegotiation = { reason: rival ? 'rival' : 'player', feeRaisePct: rival ? 6 + bump : 0, wageRaisePct: rival ? 0 : 8 + bump, untilAbs: absDayOf(state) + 3 };
    n.stage = 'renegotiation';
    n.log.push(msg(rival ? 'neg.renegRival' : 'neg.renegPlayer', { p: `${p.firstName} ${p.lastName}` }));
    addNews(state, { category: 'transfer', title: msg('news.reneg.t', { p: `${p.firstName} ${p.lastName}` }), body: msg(rival ? 'news.reneg.rival' : 'news.reneg.player'), clubIds: [buyer.id], playerId: p.id, importance: 2 });
    return;
  }
  n.stage = 'agreed';
  const entry = n.bid?.entry ?? 'now';
  if (buyer.isUser && entry !== 'now') {
    n.entryAbs = entryAbsFor(state, entry);
    n.log.push(msg('neg.scheduled'));
    return;
  }
  completeTransfer(state, n, rng);
}

/** El usuario responde a una renegociación: acepta pagar más o se retira. */
export function resolveRenegotiation(state: GameState, negId: Id, accept: boolean, rng?: Rng): { ok: boolean; message: Msg } {
  const n = state.negotiations[negId];
  if (!n || n.stage !== 'renegotiation' || !n.renegotiation || !n.bid || !n.contract) return { ok: false, message: msg('err.negotiation') };
  const buyer = state.clubs[n.buyerClubId];
  const r = n.renegotiation;
  if (!accept) {
    n.stage = 'collapsed';
    n.renegotiation = null;
    n.log.push(msg('neg.withdrawn'));
    return { ok: true, message: msg('neg.withdrawn') };
  }
  const fee = roundMoney(n.bid.fee * (1 + r.feeRaisePct / 100));
  const wage = roundMoney(n.contract.wage * (1 + r.wageRaisePct / 100));
  if (fee - n.bid.fee > buyer.finances.transferBudget - n.bid.fee) return { ok: false, message: msg('neg.budget', { budget: buyer.finances.transferBudget }) };
  const bill = weeklyWageBill(clubPlayers(state, buyer.id), buyer.id);
  if (bill + wage > buyer.finances.wageBudget) return { ok: false, message: msg('neg.wageBudget', { budget: buyer.finances.wageBudget }) };
  n.bid = { ...n.bid, fee };
  n.contract = { ...n.contract, wage };
  n.renegotiation = null;
  finalizeDeal(state, n, rng);
  return { ok: true, message: msg('neg.accepted') };
}

/** Consulta inicial: el club o el jugador (o su agente) contestan en 1-3 días si hay puerta abierta. */
export function startEnquiry(state: GameState, playerId: Id, buyerClubId: Id, kind: 'transfer' | 'loan' = 'transfer'): Negotiation {
  const n = startNegotiation(state, playerId, buyerClubId, false, kind);
  if (n.enquired || n.rounds > 0 || n.log.length > 0 || n.awaiting) return n;
  n.enquired = true;
  n.stage = 'enquiry';
  enqueue(state, n, { kind: 'enquiry' });
  return n;
}

function resolveEnquiry(state: GameState, n: Negotiation): void {
  const p = state.players[n.playerId];
  const buyer = state.clubs[n.buyerClubId];
  if (!p || !buyer) return;
  const owner = ownerClubId(p);
  const seller = owner ? state.clubs[owner] : null;
  const free = !owner && !p.contract;
  const pName = `${p.firstName} ${p.lastName}`;
  const ex = playerExpectations(state, p, buyer);
  // El club se cierra si el jugador es clave, no está en venta y el comprador es claramente menor.
  const untouchable = !!seller && !free && p.squadStatus === 'key' && !p.listed && !p.wantsToLeave && buyer.reputation < seller.reputation - 8 && hashString(`${n.id}:cn`) % 100 < 70;
  let message: Msg;
  if (untouchable) {
    n.stage = 'collapsed';
    message = msg('neg.enquiry.clubNo', { club: seller?.name ?? '-', p: pName });
  } else if (!ex.willNegotiate || ex.interest < 12) {
    n.stage = 'collapsed';
    message = msg('neg.enquiry.playerNo', { p: pName });
  } else {
    n.stage = free || n.bid ? 'player' : 'club';
    message = msg('neg.enquiry.open', { p: pName, interest: ex.interest });
  }
  n.log.push(message);
  if (buyer.isUser) {
    addNews(state, { category: 'transfer', title: msg('news.enquiry.t', { p: pName }), body: message, clubIds: [buyer.id], playerId: p.id, importance: 2 });
  }
}

export interface DelegationLimits {
  maxFee: number;
  maxWage: number;
}

/** Director de fútbol: negocia por ti hasta tus límites. Devuelve si el trato quedó cerrado (o en renegociación). */
export function delegateNegotiation(state: GameState, negId: Id, limits: DelegationLimits, rng?: Rng): { ok: boolean; message: Msg } {
  const n = state.negotiations[negId];
  if (!n || n.awaiting || (n.stage !== 'club' && n.stage !== 'player')) return { ok: false, message: msg('err.negotiation') };
  const p = state.players[n.playerId];
  const buyer = state.clubs[n.buyerClubId];
  if (!p || !buyer || n.kind !== 'transfer') return { ok: false, message: msg('neg.delegate.loan') };
  n.delegated = true;
  if (n.stage === 'club') {
    const ask = askingPrice(state, p);
    for (let r = 0; r < 5 && n.stage === 'club'; r++) {
      const fee = Math.min(limits.maxFee, roundMoney(ask * (0.86 + 0.05 * r)));
      if (fee < ask * 0.62) break;
      submitBid(state, n.id, { fee, sellOnPercent: 0 });
    }
    if (n.stage === 'club') {
      n.stage = 'collapsed';
      n.log.push(msg('neg.delegate.fail'));
      return { ok: false, message: msg('neg.delegate.fail') };
    }
  }
  if (n.stage === 'player') {
    const ex = playerExpectations(state, p, buyer);
    for (let r = 0; r < 5 && n.stage === 'player'; r++) {
      const wage = Math.min(limits.maxWage, roundMoney(ex.idealWage * (0.94 + 0.03 * r)));
      if (wage < ex.minWage * 0.95) break;
      submitContract(state, n.id, { wage, years: ex.years, releaseClause: null, goalBonus: 0, cleanSheetBonus: 0, signingBonus: 0, agentFee: ex.agentFee }, rng);
    }
  }
  if (n.stage === 'player' || n.stage === 'club') {
    n.stage = 'collapsed';
    n.log.push(msg('neg.delegate.fail'));
    return { ok: false, message: msg('neg.delegate.fail') };
  }
  return { ok: n.stage !== 'collapsed', message: msg(n.stage === 'collapsed' ? 'neg.delegate.fail' : 'neg.delegate.ok') };
}