// Legado del club: leyendas, récords y rivalidades. Todo se deriva del estado (no se guarda nada nuevo).
import type { Player } from './player';
import type { GameState, StoredMatch } from './state';
import type { Id } from './types';

export interface LegendRow {
  playerId: Id;
  apps: number;
  goals: number;
  assists: number;
  seasons: number;
  active: boolean;
  score: number;
}

/** Jugadores con más historia en un club (partidos, goles y asistencias con esa camiseta). */
export function clubLegends(state: GameState, clubId: Id, limit = 10): LegendRow[] {
  const rows: LegendRow[] = [];
  for (const id in state.players) {
    const p: Player = state.players[id];
    let apps = 0;
    let goals = 0;
    let assists = 0;
    let seasons = 0;
    for (const c of p.career) {
      if (c.clubId !== clubId) continue;
      apps += c.apps;
      goals += c.goals;
      assists += c.assists;
      seasons++;
    }
    const active = p.clubId === clubId && !p.retired;
    if (active) {
      apps += p.stats.apps;
      goals += p.stats.goals;
      assists += p.stats.assists;
      seasons++;
    }
    if (apps < 20) continue;
    rows.push({ playerId: id, apps, goals, assists, seasons, active, score: apps + goals * 2.5 + assists * 1.2 + seasons * 6 });
  }
  return rows.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Es leyenda cuando acumula mucha historia en el club. */
export function isLegend(row: LegendRow): boolean {
  return row.apps >= 150 || row.score >= 260;
}

export interface ClubRecords {
  matches: number;
  wins: number;
  biggestWin: StoredMatch | null;
  heaviestLoss: StoredMatch | null;
  highestScoring: StoredMatch | null;
  longestWinStreak: number;
  longestUnbeaten: number;
}

/** Récords del club del usuario a partir de su historial de partidos. */
export function clubRecords(state: GameState): ClubRecords {
  const id = state.userClubId;
  const rec: ClubRecords = { matches: 0, wins: 0, biggestWin: null, heaviestLoss: null, highestScoring: null, longestWinStreak: 0, longestUnbeaten: 0 };
  if (!id) return rec;
  let win = 0;
  let unb = 0;
  let bestDiff = 0;
  let worstDiff = 0;
  let bestTotal = -1;
  for (const m of state.userMatches) {
    if (m.homeId !== id && m.awayId !== id) continue;
    rec.matches++;
    const home = m.homeId === id;
    const gf = home ? m.result.homeGoals : m.result.awayGoals;
    const ga = home ? m.result.awayGoals : m.result.homeGoals;
    const diff = gf - ga;
    if (diff > 0) {
      rec.wins++;
      win++;
    } else win = 0;
    unb = diff >= 0 ? unb + 1 : 0;
    rec.longestWinStreak = Math.max(rec.longestWinStreak, win);
    rec.longestUnbeaten = Math.max(rec.longestUnbeaten, unb);
    if (diff > bestDiff) {
      bestDiff = diff;
      rec.biggestWin = m;
    }
    if (diff < worstDiff) {
      worstDiff = diff;
      rec.heaviestLoss = m;
    }
    if (gf + ga > bestTotal) {
      bestTotal = gf + ga;
      rec.highestScoring = m;
    }
  }
  return rec;
}

/** Rivales naturales: misma ciudad primero y luego los clubes de la liga con nivel parecido. */
export function rivalsOf(state: GameState, clubId: Id, count = 3): Id[] {
  const club = state.clubs[clubId];
  const league = club ? state.leagues[club.leagueId] : null;
  if (!club || !league) return [];
  const met = new Map<Id, number>();
  if (clubId === state.userClubId) {
    for (const m of state.userMatches) {
      const other = m.homeId === clubId ? m.awayId : m.awayId === clubId ? m.homeId : null;
      if (other) met.set(other, (met.get(other) ?? 0) + 1);
    }
  }
  return league.clubIds
    .filter((id) => id !== clubId && state.clubs[id])
    .map((id) => {
      const c = state.clubs[id];
      const city = c.city && c.city === club.city ? 60 : 0;
      const sim = Math.max(0, 30 - Math.abs(c.reputation - club.reputation));
      return { id, score: city + sim + Math.min(10, (met.get(id) ?? 0) * 2) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map((r) => r.id);
}

/** Derbi: misma ciudad, o rivales mutuos de primer orden. */
export function isDerby(state: GameState, a: Id, b: Id): boolean {
  const ca = state.clubs[a];
  const cb = state.clubs[b];
  if (!ca || !cb || a === b) return false;
  if (ca.city && ca.city === cb.city) return true;
  return rivalsOf(state, a, 1)[0] === b && rivalsOf(state, b, 1)[0] === a;
}
