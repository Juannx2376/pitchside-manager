// Competiciones continentales de clubes por confederación (copa de campeones y segunda copa).
// Formato: grupos de 4 a una vuelta de ida y vuelta (6 jornadas) + eliminatorias a partido único,
// o sólo eliminatorias para los torneos pequeños. Plazas por país según el nivel de su liga.
import { COUNTRY_BY_CODE } from './data/countries';
import { computeTable, roundName, type CupRound, type Fixture, type League, type TableRow } from './competition';
import { msg, type Msg } from './i18n';
import type { Rng } from './rng';
import { newId, type GameState } from './state';
import { type Confederation, type Id } from './types';

export interface ContinentalGroup {
  clubIds: Id[];
  fixtures: Fixture[];
}

export interface ContinentalComp {
  id: Id;
  confed: Confederation;
  tier: 1 | 2;
  name: Msg;
  season: number;
  clubIds: Id[];
  groups: ContinentalGroup[];
  knockout: CupRound[];
  aliveIds: Id[];
  winnerId: Id | null;
  phase: 'groups' | 'knockout' | 'done';
  history: { season: number; clubId: Id }[];
  /** Días de las jornadas de grupos y de cada ronda eliminatoria. */
  groupDays: number[];
  koDays: number[];
}

/** Tamaño de cada torneo (0 = no existe). */
const SIZES: Record<Confederation, [number, number]> = {
  UEFA: [32, 32],
  CONMEBOL: [32, 32],
  CONCACAF: [16, 0],
  CAF: [16, 16],
  AFC: [16, 16],
  OFC: [8, 0],
};

/** Premios en EUR (no se escalan por país: los paga la confederación). */
const PRIZES: Record<Confederation, [{ base: number; win: number; round: number }, { base: number; win: number; round: number }]> = {
  UEFA: [
    { base: 18e6, win: 2.8e6, round: 9e6 },
    { base: 4e6, win: 0.6e6, round: 1.5e6 },
  ],
  CONMEBOL: [
    { base: 3e6, win: 0.3e6, round: 1.2e6 },
    { base: 1e6, win: 0.12e6, round: 0.4e6 },
  ],
  CONCACAF: [
    { base: 0.6e6, win: 0.1e6, round: 0.5e6 },
    { base: 0, win: 0, round: 0 },
  ],
  CAF: [
    { base: 0.6e6, win: 0.08e6, round: 0.4e6 },
    { base: 0.3e6, win: 0.04e6, round: 0.15e6 },
  ],
  AFC: [
    { base: 1.5e6, win: 0.2e6, round: 0.8e6 },
    { base: 0.4e6, win: 0.05e6, round: 0.2e6 },
  ],
  OFC: [
    { base: 0.15e6, win: 0.02e6, round: 0.05e6 },
    { base: 0, win: 0, round: 0 },
  ],
};

const GROUP_DAYS = [80, 94, 108, 129, 143, 157];
const KO_DAYS = [222, 250, 278, 300, 318];

/** Plazas por país según su posición en el ranking de la confederación. */
function slotsByRank(rank: number, tier: 1 | 2, confed: Confederation): number {
  if (confed === 'UEFA') return tier === 1 ? [4, 4, 4, 4, 3, 3, 2, 2, 2, 2][rank] ?? 1 : [3, 3, 3, 3, 3, 2, 2, 2, 2, 2][rank] ?? 1;
  if (confed === 'CONMEBOL') return tier === 1 ? [6, 6, 3, 3, 3, 3, 3, 3, 3, 3][rank] ?? 2 : [6, 6, 4, 4, 4, 4, 4, 4, 4, 4][rank] ?? 2;
  return tier === 1 ? ([3, 3, 2, 2, 2][rank] ?? 1) : ([2, 2, 2, 2, 1][rank] ?? 1);
}

/** Clasificación final (o, si no hay partidos jugados, ranking por reputación). */
function standings(state: GameState, league: League): Id[] {
  const table: TableRow[] = computeTable(league);
  if (table.some((r) => r.played > 0)) return table.map((r) => r.clubId);
  return [...league.clubIds].sort((a, b) => state.clubs[b].reputation - state.clubs[a].reputation);
}

/** Crea (o recrea cada temporada) los torneos continentales con los clasificados. */
export function setupContinental(state: GameState, rng: Rng): void {
  const byConfed = new Map<Confederation, string[]>();
  for (const rt of Object.values(state.countries)) {
    if (!rt.loaded || !rt.leagueIds.length) continue;
    const c = COUNTRY_BY_CODE[rt.code];
    byConfed.set(c.confederation, [...(byConfed.get(c.confederation) ?? []), rt.code]);
  }
  for (const [confed, codes] of byConfed) {
    const ranked = [...codes].sort((a, b) => state.leagues[state.countries[b].leagueIds[0]].reputation - state.leagues[state.countries[a].leagueIds[0]].reputation);
    const orders = new Map(ranked.map((code) => [code, standings(state, state.leagues[state.countries[code].leagueIds[0]])]));
    const used = new Set<Id>();
    for (const tier of [1, 2] as const) {
      const size = SIZES[confed][tier - 1];
      if (!size) continue;
      const picks: Id[] = [];
      // Varias pasadas por el ranking hasta llenar el cupo.
      for (let pass = 0; picks.length < size && pass < 6; pass++) {
        ranked.forEach((code, rank) => {
          const quota = pass === 0 ? slotsByRank(rank, tier, confed) : 1;
          const order = orders.get(code) ?? [];
          let added = 0;
          for (const id of order) {
            if (picks.length >= size || added >= quota) break;
            if (used.has(id)) continue;
            picks.push(id);
            used.add(id);
            added++;
          }
        });
      }
      if (picks.length < 4) continue;
      const key = `${confed}-${tier}`;
      const existing = Object.values(state.continental).find((c) => `${c.confed}-${c.tier}` === key);
      const comp: ContinentalComp = existing ?? {
        id: newId(state, 'cc'),
        confed,
        tier,
        name: msg(`comp.${confed}.${tier}`),
        season: state.season,
        clubIds: [],
        groups: [],
        knockout: [],
        aliveIds: [],
        winnerId: null,
        phase: 'groups',
        history: [],
        groupDays: GROUP_DAYS,
        koDays: KO_DAYS,
      };
      comp.season = state.season;
      comp.clubIds = picks;
      comp.knockout = [];
      comp.winnerId = null;
      comp.groups = [];
      // Con 16 o más equipos hay fase de grupos; si no, eliminatorias directas.
      const pow = 2 ** Math.floor(Math.log2(picks.length));
      const field = picks.slice(0, pow);
      comp.clubIds = field;
      if (field.length >= 16) {
        comp.phase = 'groups';
        const pots = [0, 1, 2, 3].map((p) => rng.shuffle(field.filter((_, i) => Math.floor(i / (field.length / 4)) === p)));
        const nGroups = field.length / 4;
        for (let g = 0; g < nGroups; g++) {
          const ids = pots.map((pot) => pot[g]).filter(Boolean);
          comp.groups.push({ clubIds: ids, fixtures: groupFixtures(state, comp, ids) });
        }
      } else {
        comp.phase = 'knockout';
        comp.aliveIds = rng.shuffle([...field]);
      }
      state.continental[comp.id] = comp;
    }
  }
}

function groupFixtures(state: GameState, comp: ContinentalComp, ids: Id[]): Fixture[] {
  // Calendario de 4 equipos a doble vuelta: (0-1,2-3) (0-2,1-3) (0-3,1-2) y vuelta.
  const pairs: [number, number][][] = [
    [[0, 1], [2, 3]],
    [[2, 0], [3, 1]],
    [[0, 3], [1, 2]],
    [[1, 0], [3, 2]],
    [[0, 2], [1, 3]],
    [[3, 0], [2, 1]],
  ];
  const out: Fixture[] = [];
  pairs.forEach((md, r) =>
    md.forEach(([h, a]) => {
      if (!ids[h] || !ids[a]) return;
      out.push({ id: newId(state, 'f'), competitionId: comp.id, day: comp.groupDays[r], round: r + 1, homeId: ids[h], awayId: ids[a], played: false, homeGoals: 0, awayGoals: 0, shootoutWinnerId: null, refereeId: null, attendance: 0 });
    }),
  );
  return out;
}

export function groupTable(group: ContinentalGroup): TableRow[] {
  return computeTable({ id: 'g', countryCode: '', name: '', tier: 1, clubIds: group.clubIds, reputation: 0, promotionSlots: 0, relegationSlots: 0, fixtures: group.fixtures, pointsDeductions: {}, champions: [], topScorers: [] });
}

/** Partidos de un torneo para hoy (grupos o ronda eliminatoria, sorteada al llegar el día). */
export function continentalFixturesToday(state: GameState, comp: ContinentalComp, rng: Rng): { fixtures: Fixture[]; knockout: boolean } {
  const day = state.day;
  if (comp.phase === 'groups') {
    const fx = comp.groups.flatMap((g) => g.fixtures.filter((f) => f.day === day && !f.played));
    // Tras la última jornada se pasa a eliminatorias con los dos primeros de cada grupo.
    if (day > comp.groupDays[comp.groupDays.length - 1] && comp.groups.every((g) => g.fixtures.every((f) => f.played))) {
      const winners = comp.groups.map((g) => groupTable(g)[0].clubId);
      const runners = comp.groups.map((g) => groupTable(g)[1].clubId);
      // Cruce: primero de un grupo contra segundo de otro.
      const order: Id[] = [];
      winners.forEach((w, i) => order.push(w, runners[(i + 1) % runners.length]));
      comp.aliveIds = order;
      comp.phase = 'knockout';
    }
    return { fixtures: fx, knockout: false };
  }
  if (comp.phase === 'knockout' && comp.aliveIds.length > 1) {
    const roundsLeft = Math.log2(comp.aliveIds.length);
    const koIdx = comp.koDays.length - roundsLeft;
    if (comp.koDays[Math.max(0, koIdx)] !== day) return { fixtures: [], knockout: true };
    const fixtures: Fixture[] = [];
    for (let i = 0; i + 1 < comp.aliveIds.length; i += 2) {
      fixtures.push({ id: newId(state, 'f'), competitionId: comp.id, day, round: comp.knockout.length + 1, homeId: comp.aliveIds[i], awayId: comp.aliveIds[i + 1], played: false, homeGoals: 0, awayGoals: 0, shootoutWinnerId: null, refereeId: null, attendance: 0 });
    }
    rng.next();
    comp.knockout.push({ name: roundName(roundsLeft), day, fixtures });
    return { fixtures, knockout: true };
  }
  return { fixtures: [], knockout: true };
}

/** Tras jugar una eliminatoria: avanzan los ganadores en el mismo orden (cuadro). */
export function advanceKnockout(comp: ContinentalComp, fixtures: Fixture[]): Id | null {
  const winners = fixtures.map((f) => (f.homeGoals > f.awayGoals ? f.homeId : f.awayGoals > f.homeGoals ? f.awayId : (f.shootoutWinnerId ?? f.homeId)));
  comp.aliveIds = winners;
  if (winners.length === 1) {
    comp.winnerId = winners[0];
    comp.phase = 'done';
    comp.history.push({ season: comp.season, clubId: winners[0] });
    return winners[0];
  }
  return null;
}

export function continentalPrize(comp: ContinentalComp, kind: 'base' | 'win' | 'round'): number {
  return PRIZES[comp.confed][comp.tier - 1][kind];
}

/** Competiciones continentales en las que está un club esta temporada. */
export function clubContinental(state: GameState, clubId: Id): ContinentalComp[] {
  return Object.values(state.continental).filter((c) => c.season === state.season && c.clubIds.includes(clubId));
}
