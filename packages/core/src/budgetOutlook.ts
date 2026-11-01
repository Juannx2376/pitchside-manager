// Panorama del dinero para fichar: cuánto tienes de verdad, qué está reservado y cómo cubrir lo que falta.
import { PRIZE_REINVEST, SALE_REINVEST, SEASON_CARRY, pendingCommitments, weeklyWageBill } from './finance';
import { overall, type Player } from './player';
import { clubPlayers, type GameState } from './state';
import { askingPrice } from './transfers';
import { SEASON_LENGTH_DAYS, type Id } from './types';

export interface TransferOutlook {
  budget: number;
  /** Dinero ya comprometido en negociaciones (club aceptado, entrada pactada para más tarde). */
  reserved: number;
  /** Lo que de verdad puedes gastar ahora (presupuesto − reservado). */
  available: number;
  instalments: number;
  wageRoom: number;
  listedValue: number;
  /** Lo que volvería al presupuesto si se vendieran los jugadores en venta. */
  expectedSales: number;
  daysToNewSeason: number;
  /** Parte del presupuesto sin gastar que pasaría a la temporada siguiente. */
  carryEstimate: number;
  /** Premio de liga del año pasado que se reinvertirá. */
  prizeEstimate: number;
}

export function transferOutlook(state: GameState, clubId: Id): TransferOutlook {
  const club = state.clubs[clubId];
  const fin = club.finances;
  let reserved = 0;
  for (const n of Object.values(state.negotiations)) {
    if (n.incoming || n.buyerClubId !== clubId || !n.bid) continue;
    if (n.stage === 'player' || (n.stage === 'agreed' && n.entryAbs)) reserved += n.bid.fee;
  }
  const players = clubPlayers(state, clubId);
  const listedValue = players.filter((p) => p.listed === 'transfer' && !p.loan).reduce((s, p) => s + askingPrice(state, p), 0);
  const available = Math.max(0, fin.transferBudget - reserved);
  return {
    budget: fin.transferBudget,
    reserved,
    available,
    instalments: pendingCommitments(fin).instalments,
    wageRoom: fin.wageBudget - weeklyWageBill(players, clubId),
    listedValue,
    expectedSales: Math.round(listedValue * SALE_REINVEST),
    daysToNewSeason: Math.max(0, SEASON_LENGTH_DAYS - state.day),
    carryEstimate: Math.round(available * SEASON_CARRY),
    prizeEstimate: Math.round((fin.history[fin.history.length - 1]?.ledger.prizeMoney ?? 0) * PRIZE_REINVEST),
  };
}

export interface SaleSuggestion {
  player: Player;
  /** Lo que volvería al presupuesto si se vende por su precio. */
  income: number;
}

/**
 * Jugadores que menos daño hacen a la plantilla y que, vendidos, cubren `needed`: no son clave, ni cedidos ni
 * de la cantera. Se prefiere el mayor ingreso por punto de media perdido.
 */
export function suggestSales(state: GameState, clubId: Id, needed: number): { picks: SaleSuggestion[]; covered: number } {
  const cands = clubPlayers(state, clubId)
    .filter((p) => !p.academy && !p.loan && !p.retired && p.squadStatus !== 'key' && p.contract)
    .map((p) => ({ player: p, income: Math.round(askingPrice(state, p) * SALE_REINVEST * 0.95) }))
    .filter((c) => c.income > 0)
    // Los que ya están en venta van primero (ya cuentan); después, mayor ingreso por punto de media perdido.
    .sort((a, b) => Number(!!b.player.listed) - Number(!!a.player.listed) || b.income / Math.pow(Math.max(40, overall(b.player)), 2) - a.income / Math.pow(Math.max(40, overall(a.player)), 2));
  const picks: SaleSuggestion[] = [];
  let covered = 0;
  for (const c of cands) {
    if (covered >= needed || picks.length >= 4) break;
    picks.push(c);
    covered += c.income;
  }
  return { picks, covered };
}

export interface FundingOptions {
  shortfall: number;
  sales: { picks: SaleSuggestion[]; covered: number };
  /** Cuánto se podría mover de la masa salarial libre al presupuesto de fichajes. */
  fromWages: number;
}

/** Opciones para cubrir lo que falta de una oferta de `fee`. */
export function fundingOptions(state: GameState, clubId: Id, fee: number): FundingOptions {
  const o = transferOutlook(state, clubId);
  const shortfall = Math.max(0, fee - o.available);
  return { shortfall, sales: suggestSales(state, clubId, shortfall), fromWages: Math.max(0, Math.round(o.wageRoom * 52 * 0.9)) };
}
