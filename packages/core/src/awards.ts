// Premios: jugador del mes (por liga de primera división), pichichi, equipo de la temporada
// y la gala del Balón de Oro al final de cada temporada.
import { msg } from './i18n';
import { averageRating, overall, type Player } from './player';
import type { Rng } from './rng';
import { postAward } from './social';
import { addNews, unlockAchievement, type GameState } from './state';
import { type Id, type Position } from './types';

/** Jugador del mes en cada primera división (sólo países con datos reales o del usuario, para no saturar). */
export function monthlyAwards(state: GameState, rng: Rng, seasonMonth: number): void {
  const userLeague = state.userClubId ? state.clubs[state.userClubId].leagueId : null;
  for (const rt of Object.values(state.countries)) {
    const lid = rt.leagueIds[0];
    if (!lid) continue;
    const league = state.leagues[lid];
    if (league.id !== userLeague && league.reputation < 70) continue;
    let best: { p: Player; score: number } | null = null;
    for (const cid of league.clubIds) {
      for (const pid of state.clubs[cid].playerIds) {
        const m = state.monthlyRatings[pid];
        if (!m || m.n < 2) continue;
        const score = m.sum / m.n + m.goals * 0.15;
        if (!best || score > best.score) best = { p: state.players[pid], score };
      }
    }
    if (!best) continue;
    const club = best.p.clubId ? state.clubs[best.p.clubId] : null;
    state.awards.push({ season: state.season, kind: 'month', month: seasonMonth, leagueId: lid, playerId: best.p.id, clubId: club?.id });
    const isUserPlayer = club?.isUser;
    if (league.id === userLeague || league.reputation >= 85) {
      addNews(state, {
        category: 'award',
        title: msg('news.potm.t', { p: `${best.p.firstName} ${best.p.lastName}`, league: typeof league.name === 'string' ? league.name : league.name }),
        body: msg('news.potm.b', { club: club?.name ?? '' }),
        clubIds: club ? [club.id] : [],
        playerId: best.p.id,
        importance: isUserPlayer ? 3 : 1,
      });
      if (isUserPlayer) {
        best.p.morale = Math.min(100, best.p.morale + 8);
        postAward(state, rng, msg('award.potm'), best.p, club);
      }
    }
  }
}

/** Gala de fin de temporada: pichichis, equipo del año y Balón de Oro. */
export function seasonAwards(state: GameState, rng: Rng): void {
  // Pichichi de cada liga.
  for (const league of Object.values(state.leagues)) {
    let top: Player | null = null;
    for (const cid of league.clubIds) for (const pid of state.clubs[cid].playerIds) {
      const p = state.players[pid];
      if (p && (!top || p.stats.goals > top.stats.goals)) top = p;
    }
    if (top && top.stats.goals > 0) {
      league.topScorers.push({ season: state.season, playerId: top.id, clubId: top.clubId, goals: top.stats.goals });
      state.awards.push({ season: state.season, kind: 'goldenBoot', leagueId: league.id, playerId: top.id, clubId: top.clubId ?? undefined, value: top.stats.goals });
    }
  }
  // Balón de Oro: rendimiento, goles, nivel y éxitos colectivos.
  const candidates = Object.values(state.players).filter((p) => !p.retired && p.stats.apps >= 15);
  const score = (p: Player) => {
    const club = p.clubId ? state.clubs[p.clubId] : null;
    const champion = club ? Object.values(state.leagues).some((l) => l.champions.some((c) => c.season === state.season && c.clubId === club.id) && l.tier === 1) : false;
    const continental = club ? Object.values(state.continental).some((c) => c.season === state.season && c.winnerId === club.id && c.tier === 1) : false;
    const leagueRep = club ? state.leagues[club.leagueId].reputation : 30;
    return averageRating(p) * 8 + p.stats.goals * 0.8 + p.stats.assists * 0.4 + overall(p) * 0.6 + (champion ? 6 : 0) + (continental ? 12 : 0) + leagueRep * 0.15;
  };
  const ranked = candidates.map((p) => ({ p, s: score(p) })).sort((a, b) => b.s - a.s).slice(0, 3);
  ranked.forEach(({ p }, i) => {
    state.awards.push({ season: state.season, kind: 'goldenBall', playerId: p.id, clubId: p.clubId ?? undefined, value: i + 1 });
  });
  if (ranked[0]) {
    const w = ranked[0].p;
    const club = w.clubId ? state.clubs[w.clubId] : null;
    addNews(state, {
      category: 'award',
      title: msg('news.goldenBall.t', { p: `${w.firstName} ${w.lastName}` }),
      body: msg('news.goldenBall.b', { club: club?.name ?? '', second: ranked[1] ? `${ranked[1].p.firstName} ${ranked[1].p.lastName}` : '', third: ranked[2] ? `${ranked[2].p.firstName} ${ranked[2].p.lastName}` : '' }),
      clubIds: club ? [club.id] : [],
      playerId: w.id,
      importance: 3,
    });
    postAward(state, rng, msg('award.goldenBall'), w, club);
    if (club?.isUser) unlockAchievement(state, 'goldenBall');
  }
  // Equipo de la temporada de la liga del usuario.
  const ul = state.userClubId ? state.leagues[state.clubs[state.userClubId].leagueId] : null;
  if (ul) {
    const team = teamOfSeason(state, ul.clubIds);
    state.awards.push(...team.map((id) => ({ season: state.season, kind: 'teamOfSeason', leagueId: ul.id, playerId: id })));
  }
}

const TOTS_SHAPE: Position[] = ['GK', 'RB', 'CB', 'CB', 'LB', 'CM', 'CM', 'AM', 'RW', 'ST', 'LW'];

export function teamOfSeason(state: GameState, clubIds: Id[]): Id[] {
  const pool = clubIds.flatMap((cid) => state.clubs[cid].playerIds.map((id) => state.players[id])).filter((p) => p && p.stats.apps >= 10);
  const used = new Set<Id>();
  const out: Id[] = [];
  for (const pos of TOTS_SHAPE) {
    const best = pool.filter((p) => !used.has(p.id) && (p.position === pos || p.secondaryPositions.includes(pos))).sort((a, b) => averageRating(b) - averageRating(a))[0];
    if (best) {
      used.add(best.id);
      out.push(best.id);
    }
  }
  return out;
}
