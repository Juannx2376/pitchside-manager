// Cuerpo técnico (FIFA Manager / EA FC): cada miembro tiene un rol, una calidad y un salario.
// Su calidad afecta al desarrollo (entrenadores), a las lesiones (fisio y preparador físico),
// a la familiaridad táctica (asistente / analista) y a la cantera (entrenador juvenil y ojeadores juveniles).
import type { Club } from './club';
import { COUNTRIES, COUNTRY_BY_CODE } from './data/countries';
import { generatePersonName } from './data/names';
import { facilityEffects } from './facilities';
import { msg } from './i18n';
import { roundMoney } from './player';
import type { Rng } from './rng';
import { addNews, newId, type GameState } from './state';
import type { SessionFocus } from './training';
import { clamp, type Id } from './types';

export const STAFF_ROLES = ['assistant', 'gkCoach', 'fitnessCoach', 'attackCoach', 'defenceCoach', 'physio', 'analyst', 'youthCoach', 'youthScout'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export interface StaffMember {
  id: Id;
  firstName: string;
  lastName: string;
  nationality: string;
  role: StaffRole;
  /** 0-100 */
  ability: number;
  age: number;
  wage: number;
  clubId: Id | null;
  contractUntil: number;
  /** Región que cubre un ojeador juvenil (código FIFA). */
  region?: string;
  /** Enfoque de sesión en el que destaca (+15 % si coincide con el del grupo que dirige). */
  focusStyle?: SessionFocus;
  /** Experiencia como entrenador: cada 14 semanas de sesiones sube 1 punto de calidad. */
  xp?: number;
}

/** Cuántos de cada rol puede tener un club. */
export const STAFF_LIMITS: Record<StaffRole, number> = {
  assistant: 1,
  gkCoach: 1,
  fitnessCoach: 2,
  attackCoach: 1,
  defenceCoach: 1,
  physio: 3,
  analyst: 1,
  youthCoach: 2,
  youthScout: 3,
};

export function staffWageFor(ability: number, econ: number): number {
  return roundMoney(Math.max(200, 9000 * Math.exp((ability - 80) * 0.05) * (0.15 + 0.85 * econ)));
}

export function generateStaff(rng: Rng, id: Id, role: StaffRole, countryCode: string, quality: number, season: number): StaffMember {
  const c = COUNTRY_BY_CODE[countryCode];
  const ability = Math.round(clamp(rng.gauss(quality, 11), 15, 95));
  return {
    id,
    ...generatePersonName(rng, c.nameRegion),
    nationality: c.code,
    role,
    ability,
    age: rng.int(30, 64),
    wage: staffWageFor(ability, c.econ),
    clubId: null,
    contractUntil: season + rng.int(1, 3),
    region: role === 'youthScout' ? c.code : undefined,
    focusStyle: COACH_ROLES.includes(role) ? FOCUS_STYLES[rng.int(0, FOCUS_STYLES.length - 1)] : undefined,
  };
}

const COACH_ROLES: StaffRole[] = ['assistant', 'gkCoach', 'fitnessCoach', 'attackCoach', 'defenceCoach', 'youthCoach'];
const FOCUS_STYLES: SessionFocus[] = ['technical', 'tactical', 'physical', 'mental', 'setPieces'];

export function clubStaff(state: GameState, club: Club): StaffMember[] {
  return (club.staffIds ?? []).map((id) => state.staff[id]).filter(Boolean);
}

/** Calidad media de un rol (0-100); sin nadie contratado = 25. */
export function roleQuality(state: GameState, club: Club, role: StaffRole): number {
  const list = clubStaff(state, club).filter((s) => s.role === role);
  if (!list.length) return club.isUser ? 25 : club.staffQuality;
  return list.reduce((s, m) => s + m.ability, 0) / list.length;
}

/** Multiplicador de desarrollo (0.8–1.25) a partir de los entrenadores. */
export function coachingFactor(state: GameState, club: Club, isGK: boolean): number {
  if (!club.isUser) return 0.8 + club.staffQuality / 250;
  const coaches = isGK ? roleQuality(state, club, 'gkCoach') : (roleQuality(state, club, 'attackCoach') + roleQuality(state, club, 'defenceCoach') + roleQuality(state, club, 'fitnessCoach')) / 3;
  return 0.8 + coaches / 220;
}

/** Recuperación diaria extra de lesiones (0–1.5 días por día). */
export function physioBoost(state: GameState, club: Club): number {
  const q = club.isUser ? roleQuality(state, club, 'physio') : club.staffQuality;
  const medical = club.facilities?.medical ?? 1;
  return (q / 140 + medical * 0.08) * facilityEffects(club).recovery;
}

export function weeklyStaffCost(state: GameState, club: Club): number {
  return clubStaff(state, club).reduce((s, m) => s + m.wage, 0);
}

/** Mercado de técnicos libres (se regenera cada temporada). */
export function refreshStaffMarket(state: GameState, rng: Rng): void {
  for (const id of state.staffMarket) {
    const m = state.staff[id];
    if (m && !m.clubId) delete state.staff[id];
  }
  state.staffMarket = [];
  const popular = COUNTRIES.filter((c) => c.quality >= 55);
  for (const role of STAFF_ROLES) {
    for (let i = 0; i < 10; i++) {
      const country = rng.pick(popular);
      const m = generateStaff(rng, newId(state, 'st'), role, country.code, rng.float(35, 88), state.season);
      state.staff[m.id] = m;
      state.staffMarket.push(m.id);
    }
  }
}

export function hireStaff(state: GameState, club: Club, staffId: Id): void {
  const m = state.staff[staffId];
  if (!m || m.clubId) throw new Error('staff.unavailable');
  const current = clubStaff(state, club).filter((s) => s.role === m.role).length;
  if (current >= STAFF_LIMITS[m.role]) throw new Error('staff.limit');
  m.clubId = club.id;
  m.contractUntil = state.season + 2;
  club.staffIds.push(m.id);
  state.staffMarket = state.staffMarket.filter((id) => id !== staffId);
  addNews(state, { category: 'staff', title: msg('news.staffHired.t', { name: `${m.firstName} ${m.lastName}`, role: msg(`staff.role.${m.role}`) }), body: msg('news.staffHired.b', { ability: m.ability }), clubIds: [club.id] });
}

/** Despido: se paga el 50% del salario restante. */
export function fireStaff(state: GameState, club: Club, staffId: Id): number {
  const m = state.staff[staffId];
  if (!m || m.clubId !== club.id) return 0;
  const weeks = Math.max(0, (m.contractUntil - state.season) * 52 + (365 - state.day) / 7);
  const comp = roundMoney(m.wage * weeks * 0.5);
  club.finances.balance -= comp;
  club.finances.ledger.staffWages += comp;
  m.clubId = null;
  club.staffIds = club.staffIds.filter((id) => id !== staffId);
  return comp;
}

/** Staff inicial del club del usuario acorde a su nivel. */
export function initialStaff(state: GameState, rng: Rng, club: Club): void {
  const q = clamp(club.staffQuality, 25, 85);
  for (const role of ['assistant', 'gkCoach', 'fitnessCoach', 'attackCoach', 'defenceCoach', 'physio', 'youthCoach', 'youthScout'] as StaffRole[]) {
    const m = generateStaff(rng, newId(state, 'st'), role, club.countryCode, q, state.season);
    m.clubId = club.id;
    state.staff[m.id] = m;
    club.staffIds.push(m.id);
  }
}
