// Ligas (todos contra todos a doble vuelta, ascensos/descensos) y copas nacionales eliminatorias.
import { msg, type Msg } from './i18n';
import type { Rng } from './rng';
import { CALENDAR, type Id } from './types';

export interface Fixture {
  id: Id;
  competitionId: Id;
  day: number;
  round: number;
  homeId: Id;
  awayId: Id;
  played: boolean;
  homeGoals: number;
  awayGoals: number;
  /** Ganador por penaltis en eliminatorias. */
  shootoutWinnerId: Id | null;
  refereeId: Id | null;
  attendance: number;
}

export interface League {
  id: Id;
  countryCode: string;
  /** Nombre real o mensaje traducible (ligas genéricas). */
  name: string | Msg;
  tier: number;
  clubIds: Id[];
  reputation: number;
  promotionSlots: number;
  relegationSlots: number;
  fixtures: Fixture[];
  pointsDeductions: Record<Id, number>;
  champions: { season: number; clubId: Id }[];
  /** Pichichi de cada temporada. */
  topScorers: { season: number; playerId: Id; clubId: Id | null; goals: number }[];
}

export interface CupRound {
  name: Msg;
  day: number;
  fixtures: Fixture[];
}

export interface Cup {
  id: Id;
  countryCode: string;
  name: string | Msg;
  rounds: CupRound[];
  /** Día de cada ronda (se sortea el mismo día en que se juega). */
  roundDays: number[];
  aliveClubIds: Id[];
  winnerId: Id | null;
  history: { season: number; clubId: Id }[];
}

export interface TableRow {
  clubId: Id;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
  deduction: number;
  form: ('W' | 'D' | 'L')[];
}

function makeFixture(id: Id, competitionId: Id, day: number, round: number, homeId: Id, awayId: Id): Fixture {
  return { id, competitionId, day, round, homeId, awayId, played: false, homeGoals: 0, awayGoals: 0, shootoutWinnerId: null, refereeId: null, attendance: 0 };
}

/** Calendario por método del círculo, ida y vuelta, repartido entre el inicio y fin de liga. */
/** Desfase (0-6 días) de las jornadas de un país: cada federación juega en días distintos. */
export function countryMatchdayOffset(countryCode: string): number {
  let h = 0;
  for (let i = 0; i < countryCode.length; i++) h = (h * 31 + countryCode.charCodeAt(i)) >>> 0;
  return h % 7;
}

export function generateLeagueFixtures(league: League, rng: Rng, nextId: () => Id): Fixture[] {
  const teams = rng.shuffle([...league.clubIds]) as (Id | null)[];
  if (teams.length % 2 === 1) teams.push(null);
  const n = teams.length;
  const roundsPerHalf = n - 1;
  const totalRounds = roundsPerHalf * 2;
  // Las divisiones inferiores juegan un día después que la primera del mismo país.
  const start = CALENDAR.leagueStartDay + ((countryMatchdayOffset(league.countryCode) + (league.tier - 1)) % 7);
  const span = CALENDAR.leagueEndDay - start;
  const interval = Math.max(3, Math.floor(span / totalRounds));
  const fixtures: Fixture[] = [];
  const rotation = [...teams];
  for (let r = 0; r < roundsPerHalf; r++) {
    for (let i = 0; i < n / 2; i++) {
      const a = rotation[i];
      const b = rotation[n - 1 - i];
      if (a === null || b === null) continue;
      // Alternar localía para evitar rachas largas en casa o fuera.
      const [home, away] = (r + i) % 2 === 0 ? [a, b] : [b, a];
      fixtures.push(makeFixture(nextId(), league.id, start + r * interval, r + 1, home, away));
      fixtures.push(
        makeFixture(nextId(), league.id, start + (r + roundsPerHalf) * interval, r + 1 + roundsPerHalf, away, home),
      );
    }
    // Rotación: el primero queda fijo.
    rotation.splice(1, 0, rotation.pop() as Id | null);
  }
  return fixtures.sort((x, y) => x.day - y.day);
}

export function computeTable(league: League): TableRow[] {
  const rows = new Map<Id, TableRow>();
  for (const id of league.clubIds) {
    const ded = league.pointsDeductions[id] ?? 0;
    rows.set(id, { clubId: id, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: -ded, deduction: ded, form: [] });
  }
  const played = league.fixtures.filter((f) => f.played).sort((a, b) => a.day - b.day);
  for (const f of played) {
    const h = rows.get(f.homeId);
    const a = rows.get(f.awayId);
    if (!h || !a) continue;
    h.played++;
    a.played++;
    h.gf += f.homeGoals;
    h.ga += f.awayGoals;
    a.gf += f.awayGoals;
    a.ga += f.homeGoals;
    if (f.homeGoals > f.awayGoals) {
      h.won++;
      a.lost++;
      h.points += 3;
      h.form.push('W');
      a.form.push('L');
    } else if (f.homeGoals < f.awayGoals) {
      a.won++;
      h.lost++;
      a.points += 3;
      h.form.push('L');
      a.form.push('W');
    } else {
      h.drawn++;
      a.drawn++;
      h.points++;
      a.points++;
      h.form.push('D');
      a.form.push('D');
    }
  }
  const list = [...rows.values()];
  for (const r of list) {
    r.gd = r.gf - r.ga;
    r.form = r.form.slice(-5);
  }
  return list.sort((x, y) => y.points - x.points || y.gd - x.gd || y.gf - x.gf || x.clubId.localeCompare(y.clubId));
}

export function leaguePosition(league: League, clubId: Id): number {
  return computeTable(league).findIndex((r) => r.clubId === clubId) + 1;
}

const CUP_ROUND_NAMES = ['final', 'semi', 'quarter', 'r16', 'r32', 'r64', 'prelim', 'first'];

export function roundName(remainingRounds: number): Msg {
  return msg(`round.${CUP_ROUND_NAMES[Math.min(CUP_ROUND_NAMES.length - 1, remainingRounds - 1)]}`);
}

/** Crea la copa: si el número de clubes no es potencia de 2, los de mayor reputación tienen ronda libre. */
export function createCup(id: Id, countryCode: string, name: string | Msg, clubIdsByReputation: Id[]): Cup {
  return {
    id,
    countryCode,
    name,
    rounds: [],
    roundDays: cupRoundDays(cupRoundCount(clubIdsByReputation.length)),
    aliveClubIds: [...clubIdsByReputation],
    winnerId: null,
    history: [],
  };
}

export function cupRoundCount(clubCount: number): number {
  return Math.ceil(Math.log2(Math.max(2, clubCount)));
}

/** Días de copa: entre semana, repartidos a lo largo de la temporada. */
export function cupRoundDays(totalRounds: number): number[] {
  const first = 52;
  const last = 325;
  const days: number[] = [];
  for (let i = 0; i < totalRounds; i++) {
    const d = totalRounds === 1 ? last : first + Math.round(((last - first) * i) / (totalRounds - 1));
    // Forzar mitad de semana (desplazamiento de 3 días respecto a la jornada liguera).
    days.push(d + ((d - CALENDAR.leagueStartDay) % 7 === 0 ? 3 : 0));
  }
  return days;
}

/** Sortea la siguiente ronda con los clubes vivos. */
export function drawCupRound(cup: Cup, day: number, rng: Rng, nextId: () => Id): CupRound {
  const alive = [...cup.aliveClubIds];
  const remainingRounds = cupRoundCount(alive.length);
  const target = 2 ** (remainingRounds - 1);
  // Exentos: los primeros (mejor reputación) si hay que ajustar a potencia de 2.
  const byes = alive.length > target ? 2 * target - alive.length : 0;
  const exempt = alive.slice(0, byes);
  const playing = rng.shuffle(alive.slice(byes));
  const fixtures: Fixture[] = [];
  for (let i = 0; i + 1 < playing.length; i += 2) {
    fixtures.push(makeFixture(nextId(), cup.id, day, cup.rounds.length + 1, playing[i], playing[i + 1]));
  }
  const round: CupRound = { name: roundName(remainingRounds), day, fixtures };
  cup.rounds.push(round);
  // Los exentos siguen vivos; los que juegan se resuelven al disputar el partido.
  cup.aliveClubIds = [...exempt, ...playing];
  return round;
}

export function resolveCupFixture(cup: Cup, f: Fixture): Id {
  const winner =
    f.homeGoals > f.awayGoals ? f.homeId : f.awayGoals > f.homeGoals ? f.awayId : (f.shootoutWinnerId ?? f.homeId);
  const loser = winner === f.homeId ? f.awayId : f.homeId;
  cup.aliveClubIds = cup.aliveClubIds.filter((id) => id !== loser);
  if (cup.aliveClubIds.length === 1) cup.winnerId = cup.aliveClubIds[0];
  return winner;
}
