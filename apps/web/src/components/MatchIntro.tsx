// Presentación previa al partido: derbi, jugadores clave de ambos equipos y racha del usuario.
import { clubPlayers, currentStreaks, isDerby, overall, recentRuns, t, type Club } from '@pitchside/core';
import { useGame, useGameState } from '../store/game';
import { FcCard } from './FcCard';
import { Panel } from './ui';
import '../hooks.css';

export function MatchIntro({ home, away }: { home: Club; away: Club }) {
  const g = useGameState();
  const { openPlayer } = useGame();
  const derby = isDerby(g, home.id, away.id);
  const runs = recentRuns(g.userMatches, g.userClubId as string, 5);
  const streak = currentStreaks(recentRuns(g.userMatches, g.userClubId as string, 30));
  const star = (c: Club) =>
    clubPlayers(g, c.id)
      .filter((p) => !p.academy && !p.injury)
      .sort((a, b) => overall(b) - overall(a))
      .slice(0, 3);
  return (
    <Panel
      title={t('ui.intro.title')}
      actions={
        <span className="row" style={{ gap: 6 }}>
          {derby && <span className="tag warn">{t('ui.intro.derby')}</span>}
          {streak.win >= 2 && <span className="tag acc">{t('ui.intro.winStreak', { n: streak.win })}</span>}
          {streak.winless >= 3 && <span className="tag bad">{t('ui.intro.winless', { n: streak.winless })}</span>}
        </span>
      }
    >
      <div className="intro-teams">
        {[home, away].map((c) => (
          <div key={c.id}>
            <div className="dim" style={{ textAlign: 'center', marginBottom: 6, fontSize: 12 }}>
              {t('ui.intro.keyPlayers', { club: c.name })}
            </div>
            <div className="intro-row">
              {star(c).map((p) => (
                <FcCard key={p.id} p={p} club={c} size="sm" onClick={() => openPlayer(p.id)} />
              ))}
            </div>
          </div>
        ))}
      </div>
      {runs.length > 0 && (
        <div className="row" style={{ justifyContent: 'center', marginTop: 10, gap: 6 }}>
          <span className="faint" style={{ fontSize: 12 }}>
            {t('ui.intro.form')}
          </span>
          {[...runs].reverse().map((r, i) => (
            <span key={i} className={`form-chip ${r.result}`}>
              {t(`ui.form.${r.result}`)}
            </span>
          ))}
        </div>
      )}
    </Panel>
  );
}
