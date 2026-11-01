// Gala de fin de temporada: campeón, tu temporada, premios y el Once Ideal de tu liga.
import { CALENDAR, displayName, fullName, overall, positionShort, t, userManager } from '@pitchside/core';
import { Crest, Face, OvrChip, Panel, PosBadge, Stat, ViewHead } from '../components/ui';
import { useGame, useGameState } from '../store/game';

/** Temporada a la que corresponde la gala (la que acaba de terminar). */
export function galaSeason(season: number, day: number): number {
  return day > CALENDAR.seasonEndDay ? season : season - 1;
}

/** ¿Hay gala que ver? (premios de esa temporada y todavía en el cierre / arranque de la siguiente). */
export function galaAvailable(g: { season: number; day: number; awards: { season: number; kind: string }[] }): boolean {
  const s = galaSeason(g.season, g.day);
  if (!(g.day > CALENDAR.seasonEndDay || g.day < 45)) return false;
  return g.awards.some((a) => a.season === s && a.kind === 'goldenBall');
}

export function SeasonGala() {
  const g = useGameState();
  const { openPlayer, openClub } = useGame();
  const club = g.clubs[g.userClubId as string];
  const m = userManager(g);
  const season = galaSeason(g.season, g.day);
  const league = g.leagues[club.leagueId];
  const champion = league.champions.find((c) => c.season === season);
  const champ = champion ? g.clubs[champion.clubId] : null;
  const mine = m?.history.find((h) => h.season === season);
  const boot = g.awards.find((a) => a.season === season && a.kind === 'goldenBoot' && a.leagueId === league.id);
  const balls = g.awards.filter((a) => a.season === season && a.kind === 'goldenBall').sort((a, b) => (a.value ?? 0) - (b.value ?? 0)).slice(0, 3);
  const xi = g.awards.filter((a) => a.season === season && a.kind === 'teamOfSeason' && a.leagueId === league.id);
  const done = (g.objectives ?? []).filter((o) => o.season === season && o.status === 'done').length;
  const trophies = (m?.trophies ?? []).filter((x) => x.season === season);

  const playerRow = (pid: string, extra?: string) => {
    const p = g.players[pid];
    if (!p) return null;
    const pc = p.clubId ? g.clubs[p.clubId] : null;
    return (
      <div key={pid} className="tv-row" style={{ cursor: 'pointer' }} onClick={() => openPlayer(pid)}>
        <Face player={p} club={pc} size={26} />
        <PosBadge pos={p.position} />
        <span className="nm ellipsis">{fullName(p)}</span>
        {pc && <Crest club={pc} size={18} />}
        {extra && <span className="faint">{extra}</span>}
        <OvrChip v={overall(p)} />
      </div>
    );
  };

  return (
    <>
      <ViewHead title={t('ui.gala.title', { season })} meta={displayName(league.name)} />
      <div className="grid c-main" style={{ alignItems: 'start' }}>
        <div className="grid">
          <Panel title={t('ui.gala.champion')}>
            {champ ? (
              <div className="row nw link" onClick={() => openClub(champ.id)}>
                <Crest club={champ} size={56} />
                <div className="disp" style={{ fontSize: 28 }}>
                  {champ.name}
                </div>
                {champ.id === club.id && <span className="tag good">{t('ui.gala.itsYou')}</span>}
              </div>
            ) : (
              <span className="dim">—</span>
            )}
          </Panel>
          <Panel title={t('ui.gala.yourSeason')}>
            <div className="grid c3">
              <Stat k={t('ui.gala.position')} v={mine ? t('ui.ordinal', { n: mine.position }) : '—'} />
              <Stat k={t('ui.gala.missions')} v={done} tone={done > 0 ? 'good' : undefined} />
              <Stat k={t('ui.gala.trophies')} v={trophies.length} tone={trophies.length > 0 ? 'good' : undefined} />
            </div>
          </Panel>
          <Panel title={t('ui.gala.xi')} flush>
            {xi.length === 0 && <div className="dim" style={{ padding: 12 }}>—</div>}
            {xi.map((a) => (a.playerId ? playerRow(a.playerId, g.players[a.playerId] ? positionShort(g.players[a.playerId].position) : undefined) : null))}
          </Panel>
        </div>
        <div className="grid">
          <Panel title={t('ui.gala.goldenBoot')} flush>
            {boot?.playerId ? playerRow(boot.playerId, t('ui.gala.goals', { n: boot.value ?? 0 })) : <div className="dim" style={{ padding: 12 }}>—</div>}
          </Panel>
          <Panel title={t('ui.gala.goldenBall')} flush>
            {balls.length === 0 && <div className="dim" style={{ padding: 12 }}>—</div>}
            {balls.map((a, i) => (a.playerId ? playerRow(a.playerId, `#${i + 1}`) : null))}
          </Panel>
        </div>
      </div>
    </>
  );
}
