// Macroeconomía regional: todo ingreso y gasto se escala por el coeficiente económico
// del país del club. Incluye impuestos locales, Fair Play Financiero por confederación,
// patrocinios contratados, abonos, palcos VIP, tienda, préstamos y obras (FIFA Manager).
import type { Club } from './club';
import { weeklyFacilityMaintenance, weeklySponsorIncome } from './clubOps';
import { COUNTRY_BY_CODE, leagueReputation, type CountryDef } from './data/countries';
import { msg, type Msg } from './i18n';
import { roundMoney, type Player } from './player';
import type { Rng } from './rng';
import { clamp, type Confederation } from './types';

export const LEDGER_CATEGORIES = [
  'tv',
  'sponsorship',
  'matchday',
  'seasonTickets',
  'merchandising',
  'prizeMoney',
  'playerSales',
  'loanFeesIn',
  'loanIncome',
  'wages',
  'staffWages',
  'stadium',
  'maintenance',
  'youth',
  'playerPurchases',
  'loanFeesOut',
  'agentFees',
  'bonuses',
  'taxes',
  'fines',
  'loanRepayment',
  'construction',
] as const;
export type LedgerCategory = (typeof LEDGER_CATEGORIES)[number];
export type Ledger = Record<LedgerCategory, number>;

export const INCOME_CATEGORIES: LedgerCategory[] = ['tv', 'sponsorship', 'matchday', 'seasonTickets', 'merchandising', 'prizeMoney', 'playerSales', 'loanFeesIn', 'loanIncome'];
/** Categorías que no cuentan como ingreso/gasto operativo (financiación e infraestructura). */
const NON_OPERATING: LedgerCategory[] = ['loanIncome', 'loanRepayment', 'construction'];

export interface SeasonFinanceSummary {
  season: number;
  ledger: Ledger;
  revenue: number;
  expenses: number;
  net: number;
  /** Resultado computable para FPF (excluye cantera, infraestructura y financiación). */
  fpfNet: number;
  wageBill: number;
}

export interface MonthlySnapshot {
  season: number;
  month: number;
  income: number;
  expense: number;
  balance: number;
}

export interface FPFStatus {
  breaches: number;
  pointsDeducted: number;
  transferEmbargo: boolean;
  lastVerdict: Msg | null;
}

/** Pago futuro de un traspaso: cuota aplazada o prima condicionada a partidos del jugador. */
export interface Commitment {
  id: string;
  kind: 'instalment' | 'bonus';
  playerId: string;
  /** Club vendedor que cobra (null si no hay). */
  toClubId: string | null;
  amount: number;
  /** Temporada en que vence la cuota (o desde la que cuenta la prima). */
  dueSeason: number;
  /** Prima: partidos necesarios y última temporada en que puede cobrarse. */
  apps?: number;
  expiresSeason?: number;
}

export interface ClubFinances {
  balance: number;
  transferBudget: number;
  /** Cuotas y primas pendientes de traspasos (opcional en partidas antiguas). */
  commitments?: Commitment[];
  /** Tope de masa salarial semanal autorizado por la directiva. */
  wageBudget: number;
  ledger: Ledger;
  monthProfit: number;
  monthIncome: number;
  monthExpense: number;
  history: SeasonFinanceSummary[];
  monthly: MonthlySnapshot[];
  fpf: FPFStatus;
}

export interface FPFRegime {
  id: Confederation;
  windowSeasons: number;
  maxAggregateLoss: number;
  squadCostRatio: number;
  fineRate: number;
  pointsPenalty: number;
  embargoAfter: number;
}

export const FPF_REGIMES: Record<Confederation, FPFRegime> = {
  UEFA: { id: 'UEFA', windowSeasons: 3, maxAggregateLoss: 60e6, squadCostRatio: 0.7, fineRate: 0.05, pointsPenalty: 6, embargoAfter: 3 },
  CONMEBOL: { id: 'CONMEBOL', windowSeasons: 3, maxAggregateLoss: 25e6, squadCostRatio: 0.8, fineRate: 0.03, pointsPenalty: 6, embargoAfter: 3 },
  CONCACAF: { id: 'CONCACAF', windowSeasons: 2, maxAggregateLoss: 15e6, squadCostRatio: 0.75, fineRate: 0.04, pointsPenalty: 5, embargoAfter: 2 },
  CAF: { id: 'CAF', windowSeasons: 2, maxAggregateLoss: 8e6, squadCostRatio: 0.85, fineRate: 0.02, pointsPenalty: 3, embargoAfter: 3 },
  AFC: { id: 'AFC', windowSeasons: 3, maxAggregateLoss: 30e6, squadCostRatio: 0.8, fineRate: 0.03, pointsPenalty: 6, embargoAfter: 3 },
  OFC: { id: 'OFC', windowSeasons: 2, maxAggregateLoss: 5e6, squadCostRatio: 0.9, fineRate: 0.02, pointsPenalty: 3, embargoAfter: 3 },
};

const TIER_TV = [1, 0.16, 0.045, 0.015];
const TIER_PRIZE = [1, 0.2, 0.06, 0.02];
const TV_TOP_PER_CLUB = 60e6;
const SPONSOR_TOP = 160e6;
const PRIZE_POOL_TOP = 45e6;
const TIER_COMMERCIAL = [1, 0.3, 0.12, 0.06];

export function emptyLedger(): Ledger {
  const l = {} as Ledger;
  for (const c of LEDGER_CATEGORIES) l[c] = 0;
  return l;
}

export function econOf(club: Club): number {
  return COUNTRY_BY_CODE[club.countryCode]?.econ ?? 0.02;
}

function tierIndex(tier: number): number {
  return clamp(tier - 1, 0, TIER_TV.length - 1);
}

/**
 * Estatura del club dentro de su país (0-100): la reputación reescalada para que el gigante local
 * de una liga pequeña tenga el peso comercial relativo de un gigante europeo.
 */
export function domesticStature(club: Club, country: CountryDef): number {
  return clamp(club.reputation + (88 - leagueReputation(country, 1)), 1, 100);
}

export function seasonTV(club: Club, country: CountryDef, tier: number): number {
  const s = domesticStature(club, country) / 100;
  return country.econ * TV_TOP_PER_CLUB * TIER_TV[tierIndex(tier)] * (0.4 + 0.9 * s * s);
}

/** Patrocinio genérico (sin contratos firmados): lo que pagaría el mercado sin negociar. */
export function seasonSponsorship(club: Club, country: CountryDef, tier: number): number {
  return country.econ * SPONSOR_TOP * TIER_COMMERCIAL[tierIndex(tier)] * Math.pow(domesticStature(club, country) / 100, 3.5) + 20_000 * country.econ;
}

export function seasonMerchandising(club: Club, country: CountryDef, tier: number): number {
  const shop = 0.8 + (club.facilities?.fanShop ?? 1) * 0.12;
  const m = club.tickets?.merchMultiplier ?? 1;
  const priceEffect = m * clamp(1.4 - 0.4 * m, 0.3, 1.2);
  const mood = 0.7 + (club.fans?.satisfaction ?? 60) / 200;
  return club.fanBase * 6 * country.econ * (0.5 + 0.5 * TIER_COMMERCIAL[tierIndex(tier)]) * shop * priceEffect * mood;
}

/** Precio base de la entrada: escala directamente con el coeficiente del país. */
export function ticketPrice(club: Club, country: CountryDef): number {
  return Math.max(1, 55 * country.econ * (0.6 + (0.8 * domesticStature(club, country)) / 100));
}

export function expectedAttendance(club: Club, rivalReputation: number, homeForm: number): number {
  const rate = 0.35 + 0.35 * (homeForm / 100) + 0.2 * (rivalReputation / 100) + 0.1 * (club.stadium.condition / 100);
  const pricePull = club.tickets ? clamp(1.45 - 0.45 * club.tickets.priceMultiplier, 0.25, 1.25) : 1;
  const mood = club.fans ? 0.75 + club.fans.satisfaction / 200 : 1;
  const walkIns = club.fanBase * clamp(rate, 0.15, 1) * pricePull * mood;
  const season = club.tickets?.seasonTicketsSold ?? 0;
  return Math.round(Math.min(club.stadium.capacity, season + walkIns * (1 - season / Math.max(1, club.stadium.capacity))));
}

export function weeklyStaffWages(club: Club, country: CountryDef): number {
  return Math.pow(club.staffQuality, 1.6) * 90 * country.econ + 300 * country.econ;
}

export function weeklyStadiumCost(club: Club, country: CountryDef): number {
  return club.stadium.capacity * 2.2 * country.econ * (1.3 - (0.6 * club.stadium.condition) / 100);
}

export function weeklyYouthCost(club: Club, country: CountryDef): number {
  return (Math.pow(club.youthFacilities, 1.4) + Math.pow(club.youthRecruitment, 1.4)) * 35 * country.econ;
}

/** Salario semanal a cargo del club (las cesiones reparten el salario). */
export function weeklyWageBill(players: Player[], clubId?: string): number {
  let s = 0;
  for (const p of players) {
    if (!p.contract) continue;
    if (p.loan && clubId) s += p.contract.wage * (p.loan.wageShare / 100);
    else s += p.contract.wage;
  }
  return s;
}

export function estimateSeasonRevenue(club: Club, country: CountryDef, tier: number, homeGames: number): number {
  const matchday = homeGames * expectedAttendance(club, 50, 55) * ticketPrice(club, country) * (club.tickets?.priceMultiplier ?? 1);
  const sponsors = club.sponsors?.length ? weeklySponsorIncome(club) * 52 : seasonSponsorship(club, country, tier);
  return seasonTV(club, country, tier) + sponsors + seasonMerchandising(club, country, tier) + matchday;
}

export function record(fin: ClubFinances, cat: LedgerCategory, amount: number): void {
  const isIncome = INCOME_CATEGORIES.includes(cat);
  const v = Math.round(amount);
  fin.ledger[cat] += v;
  fin.balance += isIncome ? v : -v;
  if (!NON_OPERATING.includes(cat)) fin.monthProfit += isIncome ? v : -v;
  if (isIncome) fin.monthIncome = (fin.monthIncome ?? 0) + v;
  else fin.monthExpense = (fin.monthExpense ?? 0) + v;
}

/** Ingresos y gastos semanales recurrentes. `staffWages` = salarios reales del staff (club del usuario). */
export function processWeeklyFinances(club: Club, players: Player[], tier: number, staffWages?: number): void {
  const country = COUNTRY_BY_CODE[club.countryCode];
  const fin = club.finances;
  record(fin, 'tv', seasonTV(club, country, tier) / 52);
  record(fin, 'sponsorship', club.sponsors?.length ? weeklySponsorIncome(club) : seasonSponsorship(club, country, tier) / 52);
  record(fin, 'merchandising', seasonMerchandising(club, country, tier) / 52);
  record(fin, 'wages', weeklyWageBill(players, club.id));
  record(fin, 'staffWages', staffWages ?? weeklyStaffWages(club, country));
  record(fin, 'stadium', weeklyStadiumCost(club, country));
  record(fin, 'youth', weeklyYouthCost(club, country));
  if (club.facilities) record(fin, 'maintenance', weeklyFacilityMaintenance(club));
  for (const loan of club.loans ?? []) {
    record(fin, 'loanRepayment', loan.weeklyPayment);
    loan.weeksLeft--;
  }
  if (club.loans) club.loans = club.loans.filter((l) => l.weeksLeft > 0);
  club.stadium.condition = clamp(club.stadium.condition - 0.05, 20, 100);
}

export function processMatchdayIncome(home: Club, awayReputation: number, homeForm: number): { attendance: number; income: number } {
  const country = COUNTRY_BY_CODE[home.countryCode];
  const attendance = expectedAttendance(home, awayReputation, homeForm);
  const season = Math.min(attendance, home.tickets?.seasonTicketsSold ?? 0);
  const walkIns = attendance - season;
  const vip = (home.facilities?.vipBoxes ?? 0) * 40 * ticketPrice(home, country) * 12;
  const income = walkIns * ticketPrice(home, country) * (home.tickets?.priceMultiplier ?? 1) + vip;
  record(home.finances, 'matchday', income);
  return { attendance, income };
}

/** Impuesto local mensual sobre el beneficio y foto mensual para los gráficos. */
export function processMonthlyTaxes(club: Club, season?: number, month?: number): number {
  const country = COUNTRY_BY_CODE[club.countryCode];
  const fin = club.finances;
  let tax = 0;
  if (fin.monthProfit > 0) {
    tax = fin.monthProfit * country.taxRate;
    record(fin, 'taxes', tax);
  }
  if (season !== undefined && month !== undefined) {
    fin.monthly = fin.monthly ?? [];
    fin.monthly.push({ season, month, income: fin.monthIncome ?? 0, expense: fin.monthExpense ?? 0, balance: fin.balance });
    if (fin.monthly.length > 36) fin.monthly.shift();
  }
  fin.monthProfit = 0;
  fin.monthIncome = 0;
  fin.monthExpense = 0;
  return tax;
}

export function prizeMoney(country: CountryDef, tier: number, position: number, leagueSize: number): number {
  const pool = PRIZE_POOL_TOP * country.econ * TIER_PRIZE[tierIndex(tier)];
  const share = (2 * (leagueSize - position + 1)) / (leagueSize * (leagueSize + 1));
  return pool * share * 1.25;
}

export function summarizeLedger(season: number, ledger: Ledger): SeasonFinanceSummary {
  let revenue = 0;
  let expenses = 0;
  for (const c of LEDGER_CATEGORIES) {
    if (NON_OPERATING.includes(c)) continue;
    if (INCOME_CATEGORIES.includes(c)) revenue += ledger[c];
    else expenses += ledger[c];
  }
  const net = revenue - expenses;
  const fpfNet = net + ledger.youth + ledger.stadium * 0.5 + ledger.maintenance;
  return { season, ledger: { ...ledger }, revenue, expenses, net, fpfNet, wageBill: ledger.wages + ledger.staffWages };
}

export interface FPFVerdict {
  compliant: boolean;
  aggregateResult: number;
  allowedLoss: number;
  squadCostRatio: number;
  sanction: 'none' | 'warning' | 'fine' | 'points' | 'embargo';
  fine: number;
  points: number;
  message: Msg;
}

/** Evaluación de Fair Play Financiero: aviso → multa → resta de puntos → embargo de fichajes. */
export function evaluateFPF(club: Club): FPFVerdict {
  const country = COUNTRY_BY_CODE[club.countryCode];
  const regime = FPF_REGIMES[country.confederation];
  const fin = club.finances;
  const window = fin.history.slice(-regime.windowSeasons);
  const aggregate = window.reduce((s, h) => s + h.fpfNet, 0);
  const allowedLoss = regime.maxAggregateLoss * country.econ;
  const last = window[window.length - 1];
  const revenue = Math.max(1, last ? last.revenue - last.ledger.playerSales * 0.5 : 1);
  const amortization = last ? last.ledger.playerPurchases / 3 : 0;
  const ratio = last ? (last.wageBill + amortization) / revenue : 0;
  const lossBreach = aggregate < -allowedLoss;
  const ratioBreach = ratio > regime.squadCostRatio;
  const regimeName = msg(`fpf.regime.${regime.id}`);
  const verdict: FPFVerdict = { compliant: !lossBreach && !ratioBreach, aggregateResult: aggregate, allowedLoss, squadCostRatio: ratio, sanction: 'none', fine: 0, points: 0, message: msg('fpf.ok', { regime: regimeName, ratio: Math.round(ratio * 100) }) };
  if (verdict.compliant) {
    fin.fpf.breaches = Math.max(0, fin.fpf.breaches - 1);
    fin.fpf.transferEmbargo = false;
    fin.fpf.lastVerdict = verdict.message;
    return verdict;
  }
  fin.fpf.breaches += lossBreach && ratioBreach ? 2 : 1;
  const b = fin.fpf.breaches;
  const reason = lossBreach
    ? msg('fpf.reason.loss', { loss: Math.round(-aggregate), limitMoney: Math.round(allowedLoss) })
    : msg('fpf.reason.ratio', { ratio: Math.round(ratio * 100), limit: Math.round(regime.squadCostRatio * 100) });
  if (b === 1 && !lossBreach) verdict.sanction = 'warning';
  else if (b <= 2) {
    verdict.sanction = 'fine';
    verdict.fine = revenue * regime.fineRate * b;
  } else {
    verdict.sanction = 'points';
    verdict.fine = revenue * regime.fineRate * 2;
    verdict.points = regime.pointsPenalty;
    if (b >= regime.embargoAfter + 1) verdict.sanction = 'embargo';
  }
  if (verdict.fine > 0) record(fin, 'fines', verdict.fine);
  fin.fpf.pointsDeducted = verdict.points;
  fin.fpf.transferEmbargo = verdict.sanction === 'embargo';
  verdict.message = msg('fpf.breach', { regime: regimeName, reason, sanction: msg(`fpf.sanction.${verdict.sanction}`), fine: Math.round(verdict.fine), points: verdict.points });
  fin.fpf.lastVerdict = verdict.message;
  return verdict;
}

/** Suma de lo que el club debe pagar en el futuro por cuotas y (como máximo) primas pendientes. */
export function pendingCommitments(fin: ClubFinances): { instalments: number; bonuses: number } {
  let instalments = 0;
  let bonuses = 0;
  for (const c of fin.commitments ?? []) {
    if (c.kind === 'instalment') instalments += c.amount;
    else bonuses += c.amount;
  }
  return { instalments, bonuses };
}

/** Cuotas que vencen en `season` (o antes). */
function dueInstalments(fin: ClubFinances, season: number | null): Commitment[] {
  const list = (fin.commitments ?? []).filter((c) => c.kind === 'instalment');
  if (season !== null) return list.filter((c) => c.dueSeason <= season);
  const next = Math.min(...list.map((c) => c.dueSeason), Infinity);
  return list.filter((c) => c.dueSeason === next);
}

/** Presupuestos de inicio de temporada según caja, ingresos previstos y reglas FPF. */
export function setSeasonBudgets(club: Club, players: Player[], tier: number, homeGames: number, season: number | null = null): void {
  const country = COUNTRY_BY_CODE[club.countryCode];
  const regime = FPF_REGIMES[country.confederation];
  const revenue = estimateSeasonRevenue(club, country, tier, homeGames);
  const fin = club.finances;
  // Un club de la IA embargado reestructura su masa salarial: sin esto se quedaba años atascado sobre el límite del FPF.
  if (!club.isUser && fin.fpf.transferEmbargo) {
    for (const p of players) if (p.contract) p.contract.wage = Math.round(p.contract.wage * AI_EMBARGO_WAGE_CUT);
  }
  const currentWages = weeklyWageBill(players, club.id);
  const staff = weeklyStaffWages(club, country);
  // El FPF cuenta salarios + amortización de fichajes: el presupuesto salarial descuenta lo que ya se debe amortizar.
  const lastSeason = fin.history[fin.history.length - 1];
  const amortization = lastSeason ? lastSeason.ledger.playerPurchases / 3 : 0;
  const maxWeekly = (revenue * regime.squadCostRatio * 0.92 - amortization) / 52 - staff;
  fin.wageBudget = roundMoney(Math.max(currentWages * 1.02, maxWeekly));
  const fixedCosts = (currentWages + staff + weeklyStadiumCost(club, country) + weeklyYouthCost(club, country)) * 52;
  const loans = (club.loans ?? []).reduce((s, l) => s + l.weeklyPayment * Math.min(52, l.weeksLeft), 0);
  // Las cuotas aplazadas que vencen esta temporada reducen lo que queda para fichar.
  const instalments = dueInstalments(fin, season).reduce((s, c) => s + c.amount, 0);
  const surplus = revenue - fixedCosts - loans - instalments;
  const fromCash = fin.balance > 0 ? fin.balance * 0.4 : 0;
  const base = Math.max(0, fromCash + surplus * 0.5);
  // Lo que sobró del presupuesto anterior se arrastra en parte y el premio de la liga se reinvierte,
  // con un tope para que la caja no se infle sin fin.
  const carry = (fin.transferBudget ?? 0) * SEASON_CARRY;
  const prize = (fin.history[fin.history.length - 1]?.ledger.prizeMoney ?? 0) * PRIZE_REINVEST;
  // Los clubes de la IA con la caja en rojo reciben una inyección del propietario: sin ella quedaban
  // sin presupuesto de fichajes para siempre y las divisiones bajas se estancaban.
  if (!club.isUser && fin.balance < 0) fin.balance = Math.round(revenue * OWNER_BAILOUT);
  // El tope sigue a la caja pero nunca supera una fracción de los ingresos: sin esto los grandes acumulaban cientos de millones.
  const cap = Math.min(Math.max(base, fin.balance > 0 ? fin.balance * 0.7 : 0), revenue * BUDGET_REVENUE_CAP);
  // Un club con caja sana siempre puede mover una pequeña parte de sus ingresos.
  const floor = fin.balance >= 0 ? revenue * BUDGET_FLOOR : 0;
  fin.transferBudget = fin.fpf.transferEmbargo ? 0 : roundMoney(Math.max(floor, Math.min(base + carry + prize, cap)));
}

/** Factor aplicado a los salarios de un club de la IA embargado al empezar la temporada. */
export const AI_EMBARGO_WAGE_CUT = 0.92;
/** Techo del presupuesto de fichajes como fracción de los ingresos anuales previstos. */
export const BUDGET_REVENUE_CAP = 0.9;
/** Mínimo del presupuesto de fichajes (fracción de ingresos) para un club con la caja en positivo. */
export const BUDGET_FLOOR = 0.06;
/** Caja con la que el propietario rescata a un club de la IA que termina la temporada en negativo. */
export const OWNER_BAILOUT = 0.08;

/** Parte del presupuesto de fichajes sin gastar que pasa a la temporada siguiente. */
export const SEASON_CARRY = 0.6;
/** Parte del premio de liga del año anterior que se suma al presupuesto de fichajes. */
export const PRIZE_REINVEST = 0.25;
/** Parte de lo cobrado por una venta que vuelve al presupuesto de fichajes. */
export const SALE_REINVEST = 0.8;

/** Una venta (traspaso, cesión, cuota o prima cobrada) devuelve parte del dinero al presupuesto de fichajes. */
export function creditSale(club: Club, amount: number): void {
  if (amount <= 0 || club.finances.fpf.transferEmbargo) return;
  club.finances.transferBudget = roundMoney(club.finances.transferBudget + amount * SALE_REINVEST);
}

/** Mover dinero entre presupuesto de fichajes y salarial (como en EA FC): 1 € de fichajes = 1/52 € semanal. */
export function rebalanceBudgets(club: Club, deltaTransfer: number): void {
  const fin = club.finances;
  const d = clamp(deltaTransfer, -fin.transferBudget, fin.wageBudget * 52);
  fin.transferBudget = roundMoney(fin.transferBudget + d);
  fin.wageBudget = roundMoney(fin.wageBudget - d / 52);
}

export function blankFinances(): ClubFinances {
  return {
    balance: 0,
    transferBudget: 0,
    wageBudget: 0,
    ledger: emptyLedger(),
    monthProfit: 0,
    monthIncome: 0,
    monthExpense: 0,
    history: [],
    monthly: [],
    fpf: { breaches: 0, pointsDeducted: 0, transferEmbargo: false, lastVerdict: null },
  };
}

export function initialFinances(club: Club, country: CountryDef, tier: number, rng: Rng): ClubFinances {
  const revenue = estimateSeasonRevenue(club, country, tier, 17);
  const fin = blankFinances();
  fin.balance = roundMoney(revenue * rng.float(0.05, 0.6) + 50_000 * country.econ);
  return fin;
}

export function closeSeasonLedger(club: Club, season: number): SeasonFinanceSummary {
  const summary = summarizeLedger(season, club.finances.ledger);
  club.finances.history.push(summary);
  if (club.finances.history.length > 10) club.finances.history.shift();
  club.finances.ledger = emptyLedger();
  return summary;
}

export function wageShareOfRevenue(club: Club, weeklyWage: number, tier: number): number {
  const country = COUNTRY_BY_CODE[club.countryCode];
  const revenue = estimateSeasonRevenue(club, country, tier, 17);
  return (weeklyWage * 52) / Math.max(1, revenue);
}
