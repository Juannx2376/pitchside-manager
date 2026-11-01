// Gestión del club al estilo FIFA Manager: patrocinadores, entradas y abonos, préstamos,
// obras e instalaciones, aficionados y diseño de escudo. Todo escalado por la economía del país.
import type { Club } from './club';
import { COUNTRY_BY_CODE } from './data/countries';
import { domesticStature, record } from './finance';
import { msg } from './i18n';
import { roundMoney } from './player';
import type { Rng } from './rng';
import { addNews, newId, type GameState } from './state';
import { clamp, type Id } from './types';

// ───────────────────────── Tipos ─────────────────────────

export type SponsorSlot = 'shirt' | 'kit' | 'stadium' | 'sleeve';

export interface Sponsorship {
  id: Id;
  slot: SponsorSlot;
  brand: string;
  /** Pago fijo anual (EUR). */
  annual: number;
  /** Prima por título de liga. */
  titleBonus: number;
  /** Prima por victoria. */
  winBonus: number;
  /** Temporadas restantes (incluida la actual). */
  years: number;
}

export interface SponsorOffer extends Sponsorship {
  expiresDay: number;
}

export interface BankLoan {
  id: Id;
  principal: number;
  /** Interés anual (0.03 = 3%). */
  rate: number;
  weeksLeft: number;
  weeklyPayment: number;
  takenSeason: number;
}

export type ProjectType =
  | 'stadiumExpansion'
  | 'trainingGround'
  | 'youthAcademy'
  | 'medicalCenter'
  | 'fanShop'
  | 'parking'
  | 'vipBoxes'
  | 'pitchRenovation'
  // Ampliaciones jugables (árbol de instalaciones).
  | 'gym'
  | 'videoAnalysis'
  | 'recoveryPool'
  | 'youthDorm'
  | 'scoutingNetwork'
  | 'pitchTech';

/** Instalaciones ampliadas: todas empiezan en 0 y llegan a 5. */
export const EXTRA_PROJECTS = ['gym', 'videoAnalysis', 'recoveryPool', 'youthDorm', 'scoutingNetwork', 'pitchTech'] as const;
export type ExtraProject = (typeof EXTRA_PROJECTS)[number];

/** Requisito (otra instalación a cierto nivel) para empezar a construir. */
export const PROJECT_REQUIRES: Partial<Record<ProjectType, { type: ProjectType; level: number }>> = {
  gym: { type: 'trainingGround', level: 2 },
  videoAnalysis: { type: 'trainingGround', level: 3 },
  recoveryPool: { type: 'medicalCenter', level: 2 },
  youthDorm: { type: 'youthAcademy', level: 2 },
  scoutingNetwork: { type: 'youthAcademy', level: 1 },
  pitchTech: { type: 'trainingGround', level: 1 },
};

export interface ConstructionProject {
  id: Id;
  type: ProjectType;
  /** Nivel al que se lleva la instalación al terminar. */
  toLevel: number;
  cost: number;
  startSeason: number;
  startDay: number;
  /** Días totales y restantes. */
  days: number;
  daysLeft: number;
}

/** Niveles 0-5 de las instalaciones "de negocio" y médicas. */
export interface ClubFacilities {
  medical: number;
  fanShop: number;
  parking: number;
  vipBoxes: number;
  /** Instalaciones ampliadas (opcionales: las partidas antiguas no las traen). */
  gym?: number;
  videoAnalysis?: number;
  recoveryPool?: number;
  youthDorm?: number;
  scoutingNetwork?: number;
  pitchTech?: number;
}

export interface TicketPolicy {
  /** Multiplicador del precio base de la entrada (0.5 - 2.0). */
  priceMultiplier: number;
  /** Precio del abono como fracción del total de partidos en casa (0.4 - 1.0). */
  seasonTicketDiscount: number;
  /** Abonos vendidos esta temporada. */
  seasonTicketsSold: number;
  /** Multiplicador del precio del merchandising. */
  merchMultiplier: number;
}

export interface FanBase {
  /** 0-100 */
  satisfaction: number;
  /** Socios / abonados potenciales. */
  members: number;
}

export interface CrestDesign {
  shape: 'shield' | 'round' | 'diamond' | 'classic' | 'modern';
  pattern: 'plain' | 'stripes' | 'hoops' | 'half' | 'sash' | 'quarters' | 'chevron';
  primary: string;
  secondary: string;
  accent: string;
  symbol: 'none' | 'star' | 'ball' | 'crown' | 'lion' | 'eagle' | 'castle' | 'bolt' | 'anchor' | 'tree';
  initials: string;
}

// ───────────────────────── Configuración ─────────────────────────

/** Coste base (economía 1.0), duración en días, efecto y mantenimiento semanal por nivel. */
export const PROJECTS: Record<ProjectType, { baseCost: number; days: number; maxLevel: number; maintenance: number }> = {
  stadiumExpansion: { baseCost: 28e6, days: 300, maxLevel: 99, maintenance: 0 },
  trainingGround: { baseCost: 12e6, days: 180, maxLevel: 5, maintenance: 18_000 },
  youthAcademy: { baseCost: 9e6, days: 160, maxLevel: 5, maintenance: 14_000 },
  medicalCenter: { baseCost: 6e6, days: 120, maxLevel: 5, maintenance: 5_000 },
  fanShop: { baseCost: 3e6, days: 90, maxLevel: 5, maintenance: 2_500 },
  parking: { baseCost: 4e6, days: 100, maxLevel: 5, maintenance: 1_500 },
  vipBoxes: { baseCost: 8e6, days: 150, maxLevel: 5, maintenance: 4_000 },
  pitchRenovation: { baseCost: 1.5e6, days: 30, maxLevel: 99, maintenance: 0 },
  gym: { baseCost: 5e6, days: 110, maxLevel: 5, maintenance: 6_000 },
  videoAnalysis: { baseCost: 4e6, days: 90, maxLevel: 5, maintenance: 4_500 },
  recoveryPool: { baseCost: 4.5e6, days: 100, maxLevel: 5, maintenance: 4_000 },
  youthDorm: { baseCost: 5.5e6, days: 120, maxLevel: 5, maintenance: 5_000 },
  scoutingNetwork: { baseCost: 3.5e6, days: 90, maxLevel: 5, maintenance: 5_500 },
  pitchTech: { baseCost: 3e6, days: 80, maxLevel: 5, maintenance: 3_000 },
};

/** Asientos que añade cada ampliación del estadio (proporcional al estadio actual). */
export function expansionSeats(club: Club): number {
  return Math.round(Math.max(2000, club.stadium.capacity * 0.15) / 500) * 500;
}

export function facilityLevel(club: Club, type: ProjectType): number {
  switch (type) {
    case 'trainingGround':
      return Math.round(club.trainingFacilities / 20);
    case 'youthAcademy':
      return Math.round(club.youthFacilities / 20);
    case 'medicalCenter':
      return club.facilities.medical;
    case 'fanShop':
      return club.facilities.fanShop;
    case 'parking':
      return club.facilities.parking;
    case 'vipBoxes':
      return club.facilities.vipBoxes;
    case 'gym':
    case 'videoAnalysis':
    case 'recoveryPool':
    case 'youthDorm':
    case 'scoutingNetwork':
    case 'pitchTech':
      return club.facilities[type] ?? 0;
    default:
      return 0;
  }
}

/** ¿Se cumple el requisito de otra instalación para construir esta? */
export function projectUnlocked(club: Club, type: ProjectType): boolean {
  const req = PROJECT_REQUIRES[type];
  return !req || facilityLevel(club, req.type) >= req.level;
}

export function projectCost(club: Club, type: ProjectType): number {
  const econ = COUNTRY_BY_CODE[club.countryCode]?.econ ?? 0.05;
  const lvl = facilityLevel(club, type);
  const scale = type === 'stadiumExpansion' ? expansionSeats(club) / 6000 : 1 + lvl * 0.6;
  // Las obras cuestan algo más que la economía local (materiales y técnicos importados).
  return roundMoney(PROJECTS[type].baseCost * scale * (0.15 + 0.85 * econ));
}

export function defaultFacilities(): ClubFacilities {
  return { medical: 1, fanShop: 1, parking: 1, vipBoxes: 0, gym: 0, videoAnalysis: 0, recoveryPool: 0, youthDorm: 0, scoutingNetwork: 0, pitchTech: 0 };
}

export function defaultTickets(): TicketPolicy {
  return { priceMultiplier: 1, seasonTicketDiscount: 0.75, seasonTicketsSold: 0, merchMultiplier: 1 };
}

// ───────────────────────── Patrocinios ─────────────────────────

const BRANDS = [
  'Nordvia', 'Kestrel Air', 'Solaro Energy', 'Bancovia', 'Altamira Telecom', 'Pulsar Bet', 'Corvex', 'Mareo Motors', 'Helios Bank', 'Andes Cola',
  'Vantage Kits', 'Strata Sports', 'Orbis Insurance', 'Kumo Electronics', 'Brisa Air', 'Trident Oil', 'Zafra Foods', 'Lumen Cloud', 'Atlas Freight', 'Vela Mobile',
];
const KIT_BRANDS = ['Strata Sports', 'Vantage Kits', 'Kairo', 'Pumafield', 'Aerion', 'Tempo Athletic', 'Orla Sport'];
const SLOT_SHARE: Record<SponsorSlot, number> = { shirt: 0.5, kit: 0.3, stadium: 0.15, sleeve: 0.05 };

/** Valor de mercado anual de todo el patrocinio del club. */
export function sponsorPotential(club: Club, tier: number): number {
  const country = COUNTRY_BY_CODE[club.countryCode];
  const tierF = [1, 0.3, 0.12, 0.06][Math.min(3, tier - 1)];
  return country.econ * 160e6 * tierF * Math.pow(domesticStature(club, country) / 100, 3.5) + 20_000 * country.econ;
}

/** Tres ofertas por hueco libre: más fijo con menos primas, o al revés. */
export function generateSponsorOffers(state: GameState, club: Club, rng: Rng, tier: number): SponsorOffer[] {
  const potential = sponsorPotential(club, tier);
  const offers: SponsorOffer[] = [];
  for (const slot of ['shirt', 'kit', 'stadium', 'sleeve'] as SponsorSlot[]) {
    if (club.sponsors.some((s) => s.slot === slot && s.years > 0)) continue;
    if (slot === 'stadium' && club.stadium.capacity < 8000) continue;
    for (let i = 0; i < 3; i++) {
      const fixedShare = [0.85, 0.65, 0.45][i];
      const value = potential * SLOT_SHARE[slot] * rng.float(0.85, 1.15);
      offers.push({
        id: newId(state, 'sp'),
        slot,
        brand: rng.pick(slot === 'kit' ? KIT_BRANDS : BRANDS),
        annual: roundMoney(value * fixedShare),
        titleBonus: roundMoney(value * (1 - fixedShare) * 1.6),
        winBonus: roundMoney((value * (1 - fixedShare) * 0.9) / 19),
        years: rng.int(1, 4),
        expiresDay: state.day + 21,
      });
    }
  }
  return offers;
}

export function signSponsor(state: GameState, club: Club, offer: SponsorOffer): void {
  club.sponsors = club.sponsors.filter((s) => !(s.slot === offer.slot));
  const { expiresDay: _expires, ...sp } = offer;
  club.sponsors.push(sp);
  if (offer.slot === 'stadium') club.stadium.name = `${offer.brand} Arena`;
  addNews(state, {
    category: 'finance',
    title: msg('news.sponsorSigned.t', { brand: offer.brand, slot: msg(`sponsor.${offer.slot}`) }),
    body: msg('news.sponsorSigned.b', { annual: offer.annual, years: offer.years }),
    clubIds: [club.id],
    importance: 2,
  });
}

/** La IA firma la mejor oferta disponible por hueco. */
export function aiSignSponsors(state: GameState, club: Club, rng: Rng, tier: number): void {
  const offers = generateSponsorOffers(state, club, rng, tier);
  for (const slot of ['shirt', 'kit', 'stadium', 'sleeve'] as SponsorSlot[]) {
    const best = offers.filter((o) => o.slot === slot).sort((a, b) => b.annual + b.titleBonus * 0.2 - (a.annual + a.titleBonus * 0.2))[0];
    if (best) {
      const { expiresDay: _e, ...sp } = best;
      club.sponsors.push(sp);
    }
  }
}

export function weeklySponsorIncome(club: Club): number {
  return club.sponsors.reduce((s, sp) => s + sp.annual / 52, 0);
}

// ───────────────────────── Préstamos ─────────────────────────

/** Máximo que presta el banco: ~40% de los ingresos anuales, menos la deuda viva. */
export function maxLoan(club: Club, seasonRevenue: number): number {
  const debt = club.loans.reduce((s, l) => s + l.weeklyPayment * l.weeksLeft, 0);
  return roundMoney(Math.max(0, seasonRevenue * 0.4 - debt));
}

export function loanRate(club: Club): number {
  const econ = COUNTRY_BY_CODE[club.countryCode]?.econ ?? 0.05;
  // Economías débiles = tipos más altos; un club saneado consigue mejores condiciones.
  const base = 0.035 + (1 - Math.sqrt(econ)) * 0.09;
  const risk = club.finances.balance < 0 ? 0.03 : 0;
  return Math.round((base + risk) * 1000) / 1000;
}

export function takeLoan(state: GameState, club: Club, amount: number, years: number): BankLoan {
  const rate = loanRate(club);
  const weeks = years * 52;
  const r = rate / 52;
  const weeklyPayment = roundMoney((amount * r) / (1 - Math.pow(1 + r, -weeks)));
  const loan: BankLoan = { id: newId(state, 'ln'), principal: amount, rate, weeksLeft: weeks, weeklyPayment, takenSeason: state.season };
  club.loans.push(loan);
  record(club.finances, 'loanIncome', amount);
  club.finances.transferBudget += amount;
  return loan;
}

export function repayLoanEarly(club: Club, loanId: Id): number {
  const loan = club.loans.find((l) => l.id === loanId);
  if (!loan) return 0;
  // Se paga el principal pendiente (aprox.) con un 2% de penalización.
  const r = loan.rate / 52;
  const pending = loan.weeklyPayment * ((1 - Math.pow(1 + r, -loan.weeksLeft)) / r) * 1.02;
  record(club.finances, 'loanRepayment', pending);
  club.loans = club.loans.filter((l) => l.id !== loanId);
  return pending;
}

// ───────────────────────── Obras ─────────────────────────

export function canBuild(club: Club, type: ProjectType): boolean {
  if (club.projects.some((p) => p.type === type)) return false;
  if (!projectUnlocked(club, type)) return false;
  return facilityLevel(club, type) < PROJECTS[type].maxLevel;
}

export function startProject(state: GameState, club: Club, type: ProjectType): ConstructionProject {
  if (!canBuild(club, type)) throw new Error('project.unavailable');
  const cost = projectCost(club, type);
  // Las obras se pagan con el presupuesto de fichajes; si no llega, con caja (y la directiva lo nota).
  const fromBudget = Math.min(cost, club.finances.transferBudget);
  club.finances.transferBudget -= fromBudget;
  record(club.finances, 'construction', cost);
  const days = PROJECTS[type].days;
  const p: ConstructionProject = { id: newId(state, 'pj'), type, toLevel: facilityLevel(club, type) + 1, cost, startSeason: state.season, startDay: state.day, days, daysLeft: days };
  club.projects.push(p);
  if (cost > fromBudget) club.boardConfidence = clamp(club.boardConfidence - 4, 0, 100);
  return p;
}

/** Avanza las obras un día; aplica el efecto de las que terminan. */
export function progressProjects(state: GameState, club: Club): void {
  for (const p of club.projects) p.daysLeft--;
  const done = club.projects.filter((p) => p.daysLeft <= 0);
  if (!done.length) return;
  club.projects = club.projects.filter((p) => p.daysLeft > 0);
  for (const p of done) {
    switch (p.type) {
      case 'stadiumExpansion':
        club.stadium.capacity += expansionSeats(club);
        club.fanBase = Math.round(club.fanBase * 1.08);
        break;
      case 'trainingGround':
        club.trainingFacilities = clamp(club.trainingFacilities + 20, 0, 100);
        break;
      case 'youthAcademy':
        club.youthFacilities = clamp(club.youthFacilities + 20, 0, 100);
        break;
      case 'medicalCenter':
        club.facilities.medical++;
        break;
      case 'fanShop':
        club.facilities.fanShop++;
        break;
      case 'parking':
        club.facilities.parking++;
        break;
      case 'vipBoxes':
        club.facilities.vipBoxes++;
        break;
      case 'pitchRenovation':
        club.stadium.condition = 100;
        break;
      case 'gym':
      case 'videoAnalysis':
      case 'recoveryPool':
      case 'youthDorm':
      case 'scoutingNetwork':
      case 'pitchTech':
        club.facilities[p.type] = Math.min(5, (club.facilities[p.type] ?? 0) + 1);
        break;
    }
    if (club.isUser) {
      addNews(state, { category: 'finance', title: msg('news.projectDone.t', { project: msg(`project.${p.type}`) }), body: msg('news.projectDone.b'), clubIds: [club.id], importance: 2 });
    }
  }
}

export function weeklyFacilityMaintenance(club: Club): number {
  const econ = COUNTRY_BY_CODE[club.countryCode]?.econ ?? 0.05;
  const f = club.facilities;
  const lv = { medical: f.medical, fanShop: f.fanShop, parking: f.parking, vipBoxes: f.vipBoxes };
  const extras = EXTRA_PROJECTS.reduce((s, k) => s + (f[k] ?? 0) * PROJECTS[k].maintenance, 0);
  return (
    (lv.medical * PROJECTS.medicalCenter.maintenance +
      lv.fanShop * PROJECTS.fanShop.maintenance +
      lv.parking * PROJECTS.parking.maintenance +
      lv.vipBoxes * PROJECTS.vipBoxes.maintenance +
      extras) *
    Math.sqrt(econ) *
    // Smaller clubs run smaller facilities: upkeep follows the club's stature.
    (0.2 + (0.8 * club.reputation) / 100)
  );
}

/** Weekly upkeep per level shown in the UI (matches weeklyFacilityMaintenance). */
export function facilityUpkeepPerLevel(club: Club, type: ProjectType): number {
  const econ = COUNTRY_BY_CODE[club.countryCode]?.econ ?? 0.05;
  return PROJECTS[type].maintenance * Math.sqrt(econ) * (0.2 + (0.8 * club.reputation) / 100);
}

// ───────────────────────── Entradas y aficionados ─────────────────────────

/** Demanda relativa según precio (elasticidad) y satisfacción de la afición. */
export function ticketDemandFactor(club: Club): number {
  const p = club.tickets.priceMultiplier;
  const elastic = clamp(1.45 - 0.45 * p - Math.max(0, p - 1.3) * 0.4, 0.25, 1.25);
  const mood = 0.75 + club.fans.satisfaction / 200;
  const parking = 1 + club.facilities.parking * 0.015;
  return elastic * mood * parking;
}

/** Venta de abonos al inicio de temporada: ingreso adelantado, asistencia garantizada. */
export function sellSeasonTickets(club: Club, homeGames: number, basePrice: number): number {
  const demand = clamp(0.35 + club.fans.satisfaction / 250 - (club.tickets.priceMultiplier - 1) * 0.2 - (club.tickets.seasonTicketDiscount - 0.75) * 0.6, 0.05, 0.8);
  const sold = Math.round(Math.min(club.stadium.capacity * 0.8, club.fans.members * demand));
  club.tickets.seasonTicketsSold = sold;
  const revenue = sold * basePrice * club.tickets.priceMultiplier * homeGames * club.tickets.seasonTicketDiscount;
  record(club.finances, 'seasonTickets', revenue);
  return revenue;
}

/** Actualiza la satisfacción de la afición tras un partido y por los precios. */
export function updateFans(club: Club, outcome: 1 | 0 | -1, expectedWin: boolean): void {
  const priceMood = (1 - club.tickets.priceMultiplier) * 1.5;
  const result = outcome === 1 ? (expectedWin ? 1.5 : 3.5) : outcome === 0 ? (expectedWin ? -1.5 : 0.5) : expectedWin ? -3.5 : -1.5;
  club.fans.satisfaction = clamp(club.fans.satisfaction * 0.97 + (50 + priceMood * 10) * 0.03 + result, 0, 100);
  club.fans.members = Math.max(500, Math.round(club.fans.members * (1 + (club.fans.satisfaction - 55) / 20000)));
}

export function defaultFans(club: Club): FanBase {
  return { satisfaction: 60, members: Math.round(club.fanBase * 0.6) };
}
