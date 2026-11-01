// "Tu semana": resumen accionable del Hub (siguiente partido, rachas, recompensas, planes, mercado).
import { activePlans, claimableLevels, currentStreaks, daysToDeadline, isDerby, nextFixtureFor, planProgress, recentRuns, t, userManager } from '@pitchside/core';
import { useGame, useGameState } from '../store/game';
import '../hooks.css';

export function WeekTile() {
  const g = useGameState();
  const { setView } = useGame();
  const club = g.clubs[g.userClubId as string];
  const next = nextFixtureFor(g, club.id);
  const streak = currentStreaks(recentRuns(g.userMatches, club.id, 30));
  const claim = claimableLevels(g).length;
  const plans = activePlans(g, club.id);
  const ready = plans.filter((p) => (planProgress(p)?.milestone ?? 0) > (p.growthPlan?.done ?? 0)).length;
  const left = daysToDeadline(g.day);
  const offers = g.meta?.agentOffers?.length ?? 0;
  const points = userManager(g)?.points ?? 0;
  const items: { ico: string; text: string; go?: () => void; tone?: string }[] = [];

  if (next) {
    const opp = g.clubs[next.fixture.homeId === club.id ? next.fixture.awayId : next.fixture.homeId];
    const days = Math.max(0, next.fixture.day - g.day);
    items.push({ ico: '⚽', text: t(days <= 0 ? 'ui.week.matchToday' : 'ui.week.matchIn', { club: opp.name, n: days }), go: () => setView('tactics') });
    if (isDerby(g, club.id, opp.id)) items.push({ ico: '🔥', text: t('ui.week.derby', { club: opp.name }), tone: 'warn' });
  }
  if (streak.win >= 2) items.push({ ico: '📈', text: t('ui.week.winStreak', { n: streak.win }), tone: 'good' });
  else if (streak.winless >= 3) items.push({ ico: '📉', text: t('ui.week.winless', { n: streak.winless }), tone: 'bad' });
  if (claim > 0) items.push({ ico: '🎁', text: t('ui.week.claim', { n: claim }), go: () => setView('objectives'), tone: 'acc' });
  if (points > 0) items.push({ ico: '🧠', text: t('ui.week.points', { n: points }), go: () => setView('objectives') });
  if (plans.length > 0) items.push({ ico: '▲', text: t(ready > 0 ? 'ui.week.planReady' : 'ui.week.plans', { n: ready > 0 ? ready : plans.length }), go: () => setView('squad') });
  if (left !== null && left <= 6) items.push({ ico: '⏰', text: t(left === 0 ? 'ui.week.deadlineToday' : 'ui.week.deadline', { n: left }), go: () => setView('transfers'), tone: 'warn' });
  if (offers > 0) items.push({ ico: '🤝', text: t('ui.week.agents', { n: offers }), go: () => setView('transfers') });
  if (items.length === 0) items.push({ ico: '✔', text: t('ui.week.quiet') });

  return (
    <div className="tile s12" data-week data-tour="hub-week">
      <span className="tile-label">{t('ui.week.title')}</span>
      <div className="tile-body week-card" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
        {items.map((it, i) => (
          <div key={i} className={`week-item ${it.go ? 'link' : ''}`} onClick={it.go}>
            <span className="ico">{it.ico}</span>
            <span className={it.tone ?? ''}>{it.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
