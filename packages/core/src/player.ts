// Jugador: atributos, generación procedural, regens, desarrollo, valor de mercado y lesiones.
import {
  ATTRIBUTE_KEYS,
  GOALKEEPING,
  HIDDEN_KEYS,
  PHYSICAL,
  POSITION_WEIGHTS,
  REGION_PROFILES,
  weightedAttrAvg,
  type AttrKey,
  type Attributes,
  type HiddenAttributes,
  type RegionProfile,
} from './attributes';
import type { CountryDef } from './data/countries';
import type { ProspectInfo } from './youth';
import type { GrowthPlan } from './growthPlans';
import { profileMods, type GrowthProfile } from './profiles';
import { generatePersonName } from './data/names';
import type { Rng } from './rng';
import { culturalFamiliarity, styleAttributeFit } from './tactics';
import {
  ADJACENT_POSITIONS,
  TACTICAL_STYLES,
  clamp,
  type Contract,
  type Foot,
  type Id,
  type Position,
  type SellOnClause,
  type TacticalStyle,
} from './types';

export interface Injury {
  name: string;
  daysOut: number;
  /** Merma permanente aplicada a atributos físicos tras lesiones graves. */
  severe: boolean;
}

/** Registro histórico de una lesión (V2). */
export interface InjuryRecord {
  /** Clave de traducción del tipo de lesión (injury.<type>). */
  type: string;
  durationDays: number;
  /** Temporada en la que se produjo, p. ej. "2026". */
  season: string;
}

export interface SeasonStats {
  apps: number;
  minutes: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  yellow: number;
  red: number;
  ratingSum: number;
}

export interface CareerEntry {
  season: number;
  clubId: Id | null;
  apps: number;
  goals: number;
  assists: number;
  avgRating: number;
}

export type PlayerSource = 'real' | 'curated' | 'generated' | 'regen';
export type SquadStatus = 'key' | 'first' | 'rotation' | 'backup' | 'youth';
export type TrainingFocus = 'balanced' | 'attacking' | 'defending' | 'physical' | 'technical' | 'mental' | 'goalkeeping';

/** Cesión en curso: el jugador juega en `clubId` y vuelve a `parentClubId` al final. */
export interface LoanInfo {
  parentClubId: Id;
  untilSeason: number;
  /** % del salario que paga el club de destino. */
  wageShare: number;
  /** Opción de compra (EUR) o null. */
  buyOption: number | null;
  /** Obligación de compra al terminar. */
  obligatory: boolean;
  /** Canterano cedido para ganar minutos: al volver regresa a la academia. */
  wasAcademy?: boolean;
}

export interface PlayerPromise {
  kind: 'starter' | 'minutes' | 'newContract';
  season: number;
  /** Día límite para cumplirla. */
  untilDay: number;
}

export const FOCUS_ATTRS: Record<TrainingFocus, AttrKey[]> = {
  balanced: [],
  attacking: ['finishing', 'dribbling', 'firstTouch', 'longShots', 'composure'],
  defending: ['tackling', 'marking', 'positioning', 'heading', 'decisions'],
  physical: ['pace', 'acceleration', 'stamina', 'strength', 'agility', 'jumping'],
  technical: ['passing', 'firstTouch', 'dribbling', 'crossing', 'setPieces', 'vision'],
  mental: ['decisions', 'composure', 'vision', 'teamwork', 'leadership', 'positioning'],
  goalkeeping: ['reflexes', 'handling', 'oneOnOnes', 'positioning', 'jumping'],
};

export interface Player {
  id: Id;
  firstName: string;
  lastName: string;
  nationality: string;
  regionProfile: RegionProfile;
  birthYear: number;
  age: number;
  heightCm: number;
  foot: Foot;
  position: Position;
  secondaryPositions: Position[];
  attrs: Attributes;
  hidden: HiddenAttributes;
  potential: number;
  styleFamiliarity: Record<TacticalStyle, number>;
  clubId: Id | null;
  contract: Contract | null;
  sellOnClauses: SellOnClause[];
  squadStatus: SquadStatus;
  /** 0-100 */
  morale: number;
  /** 0-100: forma reciente derivada de las últimas notas. */
  form: number;
  /** 0-100: condición física para el próximo partido. */
  fitness: number;
  injury: Injury | null;
  /** Historial médico (V2): lesiones pasadas, de más antigua a más reciente. */
  injuryHistory: InjuryRecord[];
  suspendedMatches: number;
  yellowAccumulation: number;
  /** 0-100: reputación mundial. */
  reputation: number;
  /** 0-100: satisfacción con su situación (minutos, salario, club). */
  happiness: number;
  wantsToLeave: boolean;
  lastRatings: number[];
  stats: SeasonStats;
  career: CareerEntry[];
  source: PlayerSource;
  /** URL de la foto (FC 26) si existe. */
  photo?: string;
  /** Valor de mercado cacheado (EUR), se recalcula mensualmente. */
  value: number;
  retired: boolean;
  /** Canterano en la academia (no cuenta para el primer equipo). */
  academy?: boolean;
  /** El usuario fijó a mano su rol en la plantilla. */
  statusLocked?: boolean;
  loan?: LoanInfo | null;
  /** En lista de transferibles / cedibles del club. */
  listed?: 'transfer' | 'loan' | null;
  /** Reconversión a una nueva posición (progreso 0-100). */
  retraining?: { position: Position; progress: number } | null;
  trainingFocus?: TrainingFocus;
  /** Mejora acumulada por las sesiones semanales (puntos de media, para informes). */
  trainingXp?: number;
  /** Familiaridad (0-100) con cada rol táctico: sube con sesiones tácticas y partidos. */
  roleFamiliarity?: Partial<Record<string, number>>;
  /** Refuerzo temporal de entrenamiento individual (evento semanal). */
  trainingBoost?: { untilWeek: number; mult: number } | null;
  /** Veterano que lo tutela (evento semanal). */
  mentorId?: Id | null;
  promise?: PlayerPromise | null;
  /** Promesa localizada por un ojeador juvenil, pendiente de firmar. */
  prospect?: ProspectInfo;
  /** Plan de crecimiento activo (objetivo de desarrollo elegido por el usuario). */
  growthPlan?: GrowthPlan | null;
  /** Perfil de crecimiento (se deriva del id si falta). */
  growthProfile?: GrowthProfile;
  /** Ya se le mostró la revelación de potencial. */
  revealed?: boolean;
  /** Partidos y goles con su selección. */
  caps?: number;
  intGoals?: number;
  /** Cláusula de recompra que se guardó el club que lo vendió (el usuario). */
  buyBack?: { clubId: Id; fee: number; untilSeason: number };
  /** Evolución de la media (club del usuario): un punto por mes, máx. 12. */
  ovrHistory?: { season: number; day: number; ovr: number }[];
}

export function emptyStats(): SeasonStats {
  return { apps: 0, minutes: 0, goals: 0, assists: 0, cleanSheets: 0, yellow: 0, red: 0, ratingSum: 0 };
}

export function fullName(p: Player): string {
  return p.firstName ? `${p.firstName} ${p.lastName}` : p.lastName;
}

export function shortName(p: Player): string {
  return p.firstName ? `${p.firstName.charAt(0)}. ${p.lastName}` : p.lastName;
}

/** Media del jugador en una posición concreta (1-99), con penalización fuera de sitio. */
export function overallAt(p: Player, pos: Position = p.position): number {
  const base = weightedAttrAvg(p.attrs, POSITION_WEIGHTS[pos]);
  if (pos === p.position) return Math.round(base);
  if (p.secondaryPositions.includes(pos)) return Math.round(base * 0.96);
  if (ADJACENT_POSITIONS[p.position].includes(pos)) return Math.round(base * 0.88);
  if (pos === 'GK' || p.position === 'GK') return Math.round(base * 0.45);
  return Math.round(base * 0.75);
}

export function overall(p: Player): number {
  return overallAt(p, p.position);
}

const HEIGHT_BY_POS: Record<Position, number> = {
  GK: 190,
  CB: 187,
  RB: 177,
  LB: 177,
  DM: 181,
  CM: 179,
  AM: 176,
  RW: 175,
  LW: 175,
  ST: 182,
};

export interface GeneratePlayerOptions {
  id: Id;
  country: CountryDef;
  position: Position;
  /** Media objetivo en su posición. */
  quality: number;
  age?: number;
  season: number;
  potential?: number;
  source?: PlayerSource;
}

function randomAge(rng: Rng): number {
  // Distribución realista de plantillas profesionales (pico 23-28).
  return Math.round(clamp(rng.gauss(25.5, 4.2), 17, 37));
}

function setAttr(attrs: Attributes, k: AttrKey, v: number) {
  attrs[k] = Math.round(clamp(v, 1, 99));
}

export function generatePlayer(rng: Rng, opts: GeneratePlayerOptions): Player {
  const { country, position } = opts;
  const quality = clamp(opts.quality, 15, 97);
  const age = opts.age ?? randomAge(rng);
  const weights = POSITION_WEIGHTS[position];
  const bias = REGION_PROFILES[country.profile];
  const isGK = position === 'GK';
  const heightCm = Math.round(clamp(rng.gauss(HEIGHT_BY_POS[position], 5.5), 160, 206));
  const heightDelta = heightCm - 180;

  const attrs = {} as Attributes;
  for (const k of ATTRIBUTE_KEYS) {
    const isGkAttr = (GOALKEEPING as readonly string[]).includes(k);
    const w = weights[k] ?? 0;
    let v: number;
    if (isGK && !isGkAttr && w === 0) v = quality - 28 + rng.gauss(0, 7);
    else if (!isGK && isGkAttr) v = rng.gauss(14, 5);
    else if (w > 0) v = quality + (w - 2.5) * 1.6 + rng.gauss(0, 4.5);
    else v = quality - 10 + rng.gauss(0, 7);
    if (!isGkAttr) v += bias[k] ?? 0;
    setAttr(attrs, k, v);
  }
  // Correlación altura ↔ físico aéreo.
  setAttr(attrs, 'heading', attrs.heading + heightDelta * 0.35);
  setAttr(attrs, 'jumping', attrs.jumping + heightDelta * 0.25);
  setAttr(attrs, 'strength', attrs.strength + heightDelta * 0.3);
  setAttr(attrs, 'agility', attrs.agility - heightDelta * 0.25);

  // Efecto de la edad en el físico.
  if (age > 29) {
    const decline = (age - 29) * 1.6;
    for (const k of ['pace', 'acceleration', 'agility', 'stamina'] as const) setAttr(attrs, k, attrs[k] - decline);
    for (const k of ['decisions', 'positioning', 'composure', 'leadership'] as const) setAttr(attrs, k, attrs[k] + decline * 0.5);
  } else if (age < 21) {
    setAttr(attrs, 'strength', attrs.strength - (21 - age) * 2);
    setAttr(attrs, 'composure', attrs.composure - (21 - age) * 1.5);
    setAttr(attrs, 'leadership', attrs.leadership - (21 - age) * 3);
  }

  const hidden = {} as HiddenAttributes;
  for (const k of HIDDEN_KEYS) hidden[k] = Math.round(clamp(rng.gauss(55, 17), 1, 99));
  hidden.consistency = Math.round(clamp(rng.gauss(40 + quality * 0.3, 14), 1, 99));
  hidden.bigMatches = Math.round(clamp(rng.gauss(35 + quality * 0.3, 15), 1, 99));
  hidden.injuryProneness = Math.round(clamp(rng.gauss(35, 18), 1, 99));

  const p: Player = {
    id: opts.id,
    ...generatePersonName(rng, country.nameRegion),
    nationality: country.code,
    regionProfile: country.profile,
    birthYear: opts.season - age,
    age,
    heightCm,
    foot: pickFoot(rng, position),
    position,
    secondaryPositions: pickSecondaries(rng, position),
    attrs,
    hidden,
    potential: 0,
    styleFamiliarity: {} as Record<TacticalStyle, number>,
    clubId: null,
    contract: null,
    sellOnClauses: [],
    squadStatus: 'rotation',
    morale: 65,
    form: 60,
    fitness: 100,
    injury: null,
    injuryHistory: [],
    suspendedMatches: 0,
    yellowAccumulation: 0,
    reputation: 0,
    happiness: 65,
    wantsToLeave: false,
    lastRatings: [],
    stats: emptyStats(),
    career: [],
    source: opts.source ?? 'generated',
    value: 0,
    retired: false,
  };

  calibrateToOverall(p, quality);
  p.potential = opts.potential ?? rollPotential(rng, overall(p), age);
  p.potential = Math.max(p.potential, overall(p));
  p.styleFamiliarity = initialFamiliarity(rng, p);
  p.reputation = Math.round(clamp((overall(p) - 40) * 1.6 + rng.gauss(0, 5), 1, 99));
  return p;
}

/** Ajusta los atributos relevantes de la posición hasta que la media coincida con el objetivo. */
export function calibrateToOverall(p: Player, target: number): void {
  const weights = POSITION_WEIGHTS[p.position];
  for (let i = 0; i < 4; i++) {
    const delta = target - weightedAttrAvg(p.attrs, weights);
    if (Math.abs(delta) < 0.5) break;
    for (const k in weights) {
      const key = k as AttrKey;
      p.attrs[key] = Math.round(clamp(p.attrs[key] + delta, 1, 99));
    }
  }
}

function rollPotential(rng: Rng, ca: number, age: number): number {
  if (age <= 23) return Math.round(clamp(ca + Math.max(0, rng.gauss(3 + (23 - age) * 2.4, 5)), ca, 97));
  if (age <= 27) return Math.round(clamp(ca + Math.max(0, rng.gauss(1.5, 2)), ca, 97));
  return ca;
}

function pickFoot(rng: Rng, pos: Position): Foot {
  if (rng.chance(0.06)) return 'B';
  const leftBias = pos === 'LB' ? 0.7 : pos === 'LW' ? 0.4 : pos === 'RW' ? 0.35 : 0.2;
  return rng.chance(leftBias) ? 'L' : 'R';
}

function pickSecondaries(rng: Rng, pos: Position): Position[] {
  const adj = [...ADJACENT_POSITIONS[pos]];
  const n = pos === 'GK' ? 0 : rng.weightedPick([0, 1, 2], (x) => [0.35, 0.45, 0.2][x]);
  rng.shuffle(adj);
  return adj.slice(0, n);
}

function initialFamiliarity(rng: Rng, p: Player): Record<TacticalStyle, number> {
  const res = {} as Record<TacticalStyle, number>;
  const experience = (p.age - 16) * 1.3;
  for (const s of TACTICAL_STYLES) {
    const fit = styleAttributeFit(p.attrs, s);
    res[s] = Math.round(clamp(fit * 0.4 + culturalFamiliarity(p.regionProfile, s) + experience + rng.gauss(8, 9), 0, 100));
  }
  return res;
}

/** Juvenil generado por la cantera: hereda el nivel y el perfil del país. */
export function generateRegen(
  rng: Rng,
  opts: { id: Id; country: CountryDef; season: number; youthFacilities: number; youthRecruitment: number },
): Player {
  const position = rng.weightedPick(
    ['GK', 'RB', 'CB', 'LB', 'DM', 'CM', 'AM', 'RW', 'LW', 'ST'] as Position[],
    (p) => ({ GK: 0.8, RB: 1, CB: 1.6, LB: 1, DM: 1, CM: 1.5, AM: 0.9, RW: 1, LW: 1, ST: 1.4 })[p],
  );
  const age = rng.int(15, 17);
  const { country } = opts;
  // El techo del juvenil gira alrededor de la calidad del país; las instalaciones lo empujan.
  // La mayoría de canteranos no llegan al nivel del primer equipo; unos pocos lo superan.
  let potential = country.quality - 11 + rng.gauss(0, 8) + (opts.youthRecruitment - 50) * 0.08 + (opts.youthFacilities - 50) * 0.06;
  if (rng.chance(0.012 + country.quality / 5000)) potential += rng.float(10, 20); // "wonderkid"
  potential = clamp(potential, 30, 96);
  const quality = clamp(potential - rng.float(18, 30), 22, 70);
  const p = generatePlayer(rng, { id: opts.id, country, position, quality, age, season: opts.season, potential: Math.round(potential), source: 'regen' });
  p.squadStatus = 'youth';
  p.reputation = Math.round(clamp(p.reputation * 0.3, 1, 40));
  return p;
}

export interface DevelopmentContext {
  trainingFacilities: number;
  /** Fracción de minutos jugados respecto a los posibles en el último mes (0-1). */
  minutesShare: number;
  /** Multiplicador por calidad del cuerpo técnico. */
  coachingQuality: number;
}

function bumpWeighted(p: Player, amount: number, rng: Rng, keys?: readonly AttrKey[]) {
  const weights = POSITION_WEIGHTS[p.position];
  const pool = keys ?? (Object.keys(weights) as AttrKey[]);
  for (const k of pool) {
    const w = keys ? 1 : (weights[k] ?? 0) / 3;
    const delta = amount * w * rng.float(0.6, 1.4);
    p.attrs[k] = clamp(p.attrs[k] + delta, 1, 99);
  }
}

/** Desarrollo mensual: crecimiento hacia el potencial o declive por edad. */
export function developMonthly(p: Player, rng: Rng, ctx: DevelopmentContext): void {
  if (p.retired) return;
  const ca = weightedAttrAvg(p.attrs, POSITION_WEIGHTS[p.position]);
  const gap = p.potential - ca;
  const prof = p.hidden.professionalism / 100;
  const training = 0.6 + 0.4 * (ctx.trainingFacilities / 100);
  const minutes = 0.55 + 0.65 * clamp(ctx.minutesShare, 0, 1);
  const mods = profileMods(p);
  let rate = 0;
  if (p.age < 21) rate = 0.03 * mods.young;
  else if (p.age < 24) rate = 0.024 * mods.mid;
  else if (p.age < mods.growUntil) rate = 0.012 * mods.late;
  // Potencial dinámico: rendir por encima de lo esperado eleva el techo; una mala racha lo frena.
  if (p.lastRatings.length >= 5 && p.age <= 27) {
    const recent = p.lastRatings.slice(-6).reduce((s, r) => s + r, 0) / Math.min(6, p.lastRatings.length);
    if (recent >= 7.2) p.potential = Math.min(99, p.potential + 0.2);
    else if (recent <= 5.6) p.potential = Math.max(ca, p.potential - 0.15);
  }
  if (gap > 0 && rate > 0) {
    const growth = gap * rate * (0.5 + prof) * training * minutes * ctx.coachingQuality;
    // Con un foco de entrenamiento, un 40% del crecimiento va a esos atributos.
    const focus = FOCUS_ATTRS[p.trainingFocus ?? 'balanced'];
    if (focus.length) {
      bumpWeighted(p, growth * 0.6, rng);
      bumpWeighted(p, growth * 0.4 * 1.6, rng, focus);
    } else bumpWeighted(p, growth, rng);
  }
  if (p.age >= mods.declineFrom) {
    const fitnessShield = 1.25 - p.attrs.naturalFitness / 100;
    const decline = (p.age - (mods.declineFrom - 1)) * 0.16 * fitnessShield * mods.declineMult;
    bumpWeighted(p, -decline, rng, ['pace', 'acceleration', 'agility', 'stamina', 'jumping']);
    bumpWeighted(p, decline * 0.25, rng, ['decisions', 'positioning', 'composure', 'vision']);
    if (p.position === 'GK') bumpWeighted(p, -decline * 0.4, rng, ['reflexes']);
  }
  for (const k of ATTRIBUTE_KEYS) p.attrs[k] = Math.round(p.attrs[k] * 10) / 10;
  const newCa = weightedAttrAvg(p.attrs, POSITION_WEIGHTS[p.position]);
  if (p.potential < newCa) p.potential = Math.round(newCa);
}

/** Se ejecuta al iniciar temporada. Devuelve true si el jugador se retira. */
export function ageOneYear(p: Player, rng: Rng): boolean {
  p.age += 1;
  if (p.age < 33) return false;
  const ca = overall(p);
  const retireChance = clamp((p.age - 32) * 0.16 - (ca - 60) * 0.006, 0.02, 0.97);
  if (p.age >= 41 || rng.chance(retireChance)) {
    p.retired = true;
    return true;
  }
  return false;
}

/** Media de la valoración reciente → forma 0-100. */
export function recomputeForm(p: Player): void {
  if (p.lastRatings.length === 0) return;
  const recent = p.lastRatings.slice(-5);
  const a = recent.reduce((s, r) => s + r, 0) / recent.length;
  p.form = Math.round(clamp((a - 5) * 25 + 15, 0, 100));
}

const INJURIES: { name: string; min: number; max: number; weight: number; severe?: boolean }[] = [
  // `name` es una clave de traducción (injury.<name>).
  { name: 'strain', min: 3, max: 8, weight: 30 },
  { name: 'ankle', min: 7, max: 25, weight: 18 },
  { name: 'hamstring', min: 18, max: 45, weight: 14 },
  { name: 'bruise', min: 5, max: 14, weight: 14 },
  { name: 'groin', min: 10, max: 28, weight: 10 },
  { name: 'meniscus', min: 35, max: 90, weight: 5, severe: true },
  { name: 'metatarsal', min: 50, max: 100, weight: 4, severe: true },
  { name: 'acl', min: 180, max: 280, weight: 2, severe: true },
  { name: 'concussion', min: 7, max: 15, weight: 3 },
];

export function rollInjury(rng: Rng, p: Player): Injury {
  const proneBias = p.hidden.injuryProneness / 50;
  const inj = rng.weightedPick(INJURIES, (i) => i.weight * (i.severe ? proneBias : 1));
  const recovery = 1.15 - p.attrs.naturalFitness / 250;
  return { name: inj.name, daysOut: Math.round(rng.int(inj.min, inj.max) * recovery), severe: !!inj.severe };
}

export function applyInjury(p: Player, injury: Injury, rng: Rng): void {
  p.injury = injury;
  // `birthYear + age` equivale a la temporada en curso (ambos avanzan cada año).
  (p.injuryHistory ??= []).push({ type: injury.name, durationDays: injury.daysOut, season: String(p.birthYear + p.age) });
  p.fitness = Math.min(p.fitness, 40);
  if (injury.severe) {
    for (const k of PHYSICAL) {
      if (k === 'strength') continue;
      p.attrs[k] = clamp(p.attrs[k] - rng.float(0.5, 3), 1, 99);
    }
  }
}

/** Valor de mercado (EUR). Curva exponencial por media, edad, potencial, contrato y economía de la liga. */
export function marketValue(p: Player, ctx: { econ: number; season: number }): number {
  if (p.retired) return 0;
  const ca = overall(p);
  let v = 150e6 * Math.exp((ca - 90) * 0.21);
  // Edad: jóvenes con margen valen más; veteranos se deprecian.
  let ageF = 1;
  if (p.age <= 21) ageF = 1.25 + Math.max(0, p.potential - ca) * 0.035;
  else if (p.age <= 25) ageF = 1.15 + Math.max(0, p.potential - ca) * 0.02;
  else if (p.age <= 28) ageF = 1.0;
  else if (p.age <= 31) ageF = 0.75 - (p.age - 29) * 0.08;
  else ageF = Math.max(0.08, 0.5 - (p.age - 31) * 0.1);
  v *= ageF;
  // Contrato: sin contrato largo el club vendedor pierde poder.
  const yearsLeft = p.contract ? p.contract.expiresSeason - ctx.season : 0;
  v *= yearsLeft <= 0 ? 0.35 : yearsLeft === 1 ? 0.7 : yearsLeft === 2 ? 0.9 : 1;
  // Mercado local: un jugador en una liga pobre se tasa más bajo en términos absolutos.
  v *= 0.3 + 0.7 * Math.sqrt(clamp(ctx.econ, 0.01, 1.2));
  v *= 0.85 + p.reputation / 330;
  if (p.injury && p.injury.daysOut > 60) v *= 0.75;
  return roundMoney(v);
}

/**
 * Salario semanal "justo" en un mercado (coeficiente econ, calidad media de su liga).
 * La calidad se mide relativa al mercado: el titular medio de Colombia cobra respecto a su liga
 * lo mismo que el titular medio de España respecto a la suya, escalado por la economía del país.
 */
export function wageForQuality(ca: number, econ: number, reputation: number, marketQuality = 75): number {
  const relative = ca + (75 - marketQuality) * 0.85;
  const elite = 500_000 * Math.exp((relative - 90) * 0.12);
  const repF = 0.8 + reputation / 250;
  return roundMoney(Math.max(150 * econ + 80, elite * econ * repF));
}

/** En divisiones inferiores el mercado paga menos por la misma calidad. */
const TIER_WAGE_FACTOR = [1, 0.62, 0.42, 0.3];

export function tierWageFactor(tier: number): number {
  return TIER_WAGE_FACTOR[Math.max(0, Math.min(TIER_WAGE_FACTOR.length - 1, tier - 1))];
}

export function roundMoney(v: number): number {
  if (v >= 1e7) return Math.round(v / 1e5) * 1e5;
  if (v >= 1e6) return Math.round(v / 1e4) * 1e4;
  if (v >= 1e4) return Math.round(v / 100) * 100;
  return Math.round(v / 10) * 10;
}

export function isAvailable(p: Player): boolean {
  return !p.retired && !p.injury && p.suspendedMatches === 0;
}

export function averageRating(p: Player): number {
  return p.stats.apps > 0 ? p.stats.ratingSum / p.stats.apps : 0;
}
