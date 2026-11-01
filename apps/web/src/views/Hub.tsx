// Inicio estilo FC 27 / Soccer Manager 2026: barra de tareas, héroe del próximo partido y cuatro accesos grandes.
import {
  claimableLevels,
  clubPlayers,
  computeTable,
  currentStreaks,
  daysToDeadline,
  displayName,
  formatGameDate,
  formatMoney,
  isWindowOpen,
  leagueOf,
  nextFixtureFor,
  objectiveTargetPosition,
  playerValue,
  recentRuns,
  t,
  transferOutlook,
  userManager,
  weeklyWageBill,
} from '@pitchside/core';
import { FcCard } from '../components/FcCard';
import { Icon } from '../components/shell/Icon';
import { Crest, Meter } from '../components/ui';
import { galaAvailable } from './SeasonGala';
import { NewsList } from './Inbox';
import { compName } from '../lib/labels';
import { useGame, useGameState, type View } from '../store/game';
import '../hooks.css';

interface Task {
  id: string;
  ico: string;
  title: string;
  desc?: string;
  tone?: 'hot' | 'warn';
  go: View;
}

export function Hub() {
  const g = useGameState();
  const { setView, openPlayer, openClub, continueGame, busy } = useGame();
  const club = g.clubs[g.userClubId as string];
  const league = leagueOf(g, club.id);
  const table = league ? computeTable(league) : [];
  const pos = table.findIndex((r) => r.clubId === club.id);
  const next = nextFixtureFor(g, club.id);
  const players = clubPlayers(g, club.id).filter((p) => !p.academy);
  const inForm = [...players].sort((a, b) => b.form - a.form).slice(0, 4);
  const home = next ? g.clubs[next.fixture.homeId] : null;
  const away = next ? g.clubs[next.fixture.awayId] : null;
  const rowOf = (id: string) => table.findIndex((r) => r.clubId === id);
  const m = userManager(g);
  const runs = recentRuns(g.userMatches, club.id, 5);
  const streak = currentStreaks(recentRuns(g.userMatches, club.id, 30));
  const target = league ? objectiveTargetPosition(club.objectives?.league ?? club.objective, league.clubIds.length) : 1;
  const windowRows = table.slice(Math.max(0, Math.min(pos - 3, table.length - 7)), Math.max(7, Math.min(table.length, pos + 4)));

  // ── Tareas pendientes ──
  const tasks: Task[] = [];
  if (g.pendingFixtureId) tasks.push({ id: 'match', ico: 'ball', title: t('ui.task.match'), desc: t('ui.task.matchD'), tone: 'hot', go: 'match' });
  if (g.pendingPress) tasks.push({ id: 'press', ico: 'mic', title: t('ui.task.press'), desc: t('ui.task.pressD'), tone: 'hot', go: 'press' });
  const bids = Object.values(g.negotiations).filter((n) => n.incoming && n.stage === 'club');
  if (bids.length) tasks.push({ id: 'bids', ico: 'cash', title: t('ui.task.bids', { n: bids.length }), desc: t('ui.task.bidsD'), tone: 'hot', go: 'transfers' });
  const events = (g.trainingEvents ?? []).filter((e) => !e.resolved).length;
  if (events) tasks.push({ id: 'events', ico: 'alert', title: t('ui.task.events', { n: events }), desc: t('ui.task.eventsD'), tone: 'warn', go: 'training' });
  const reports = Object.values(g.scoutReports).filter((r) => r.analysis && g.scoutAssignments[r.assignmentId]?.clubId === club.id && r.season === g.season && g.day - r.day <= 3).length;
  if (reports) tasks.push({ id: 'reports', ico: 'search', title: t('ui.task.reports', { n: reports }), desc: t('ui.task.reportsD'), go: 'scouting' });
  const unavailable = club.tactic.lineup.map((id) => g.players[id]).filter((p) => p && (p.injury || p.suspendedMatches > 0)).length;
  if (unavailable) tasks.push({ id: 'lineup', ico: 'cross', title: t('ui.task.lineup', { n: unavailable }), desc: t('ui.task.lineupD'), tone: 'warn', go: 'tactics' });
  const expiring = players.filter((p) => p.contract && p.contract.expiresSeason <= g.season && g.day > 180 && !p.loan).length;
  if (expiring) tasks.push({ id: 'expiring', ico: 'pen', title: t('ui.task.expiring', { n: expiring }), desc: t('ui.task.expiringD'), tone: 'warn', go: 'squad' });
  const left = daysToDeadline(g.day);
  if (left !== null && left <= 3) tasks.push({ id: 'deadline', ico: 'clock', title: left === 0 ? t('ui.task.deadlineToday') : t('ui.task.deadline', { n: left }), desc: t('ui.task.deadlineD'), tone: 'warn', go: 'transfers' });
  // Ventana abierta y presupuesto casi vacío frente al valor de la plantilla: avisar y proponer salidas.
  const squadValue = players.reduce((s, p) => s + playerValue(g, p), 0);
  if (isWindowOpen(g.day) && transferOutlook(g, club.id).available < squadValue * 0.02) tasks.push({ id: 'lowBudget', ico: 'cash', title: t('ui.task.lowBudget'), desc: t('ui.task.lowBudgetD'), tone: 'warn', go: 'transfers' });
  const offers = (g.meta?.agentOffers?.length ?? 0) + (g.meta?.deadline?.deals.length ?? 0);
  if (offers) tasks.push({ id: 'offers', ico: 'market', title: t('ui.task.offers', { n: offers }), desc: t('ui.task.offersD'), go: 'transfers' });
  if (g.sponsorOffers.length) tasks.push({ id: 'sponsor', ico: 'megaphone', title: t('ui.task.sponsor', { n: g.sponsorOffers.length }), go: 'finances' });
  const claim = claimableLevels(g).length;
  if (claim || (m?.points ?? 0) > 0) tasks.push({ id: 'path', ico: 'gift', title: claim ? t('ui.task.claim', { n: claim }) : t('ui.task.points', { n: m?.points ?? 0 }), desc: t('ui.task.claimD'), go: 'objectives' });
  if (galaAvailable(g)) tasks.push({ id: 'gala', ico: 'star', title: t('ui.task.gala'), tone: 'hot', go: 'gala' });
  for (const o of g.jobOffers) tasks.push({ id: o.id, ico: 'jobs', title: t('ui.task.job'), desc: o.clubId ? g.clubs[o.clubId]?.name : undefined, go: 'career' });
  if (!tasks.length) tasks.push({ id: 'quiet', ico: 'check', title: t('ui.task.quiet'), desc: t('ui.task.quietD'), go: 'hub' });

  // ── Accesos grandes ──
  const wages = weeklyWageBill(players, club.id);
  const overBudget = wages > club.finances.wageBudget;
  const activeNegs = Object.values(g.negotiations).filter((n) => !n.incoming && (n.stage === 'club' || n.stage === 'player')).length;
  const tiles: { id: string; view: View; ico: string; title: string; sub: string; flag?: { text: string; tone: 'ok' | 'todo' } }[] = [
    { id: 'squad', view: 'tactics', ico: 'squad', title: t('ui.home.squad'), sub: t('ui.home.squadS', { n: players.length }), flag: unavailable ? { text: `${unavailable}`, tone: 'todo' } : { text: '✓', tone: 'ok' } },
    { id: 'training', view: 'training', ico: 'club', title: t('ui.home.training'), sub: events ? t('ui.home.trainingS', { n: events }) : t('ui.home.trainingOk'), flag: events ? { text: `${events}`, tone: 'todo' } : { text: '✓', tone: 'ok' } },
    { id: 'market', view: 'transfers', ico: 'market', title: t('ui.home.market'), sub: isWindowOpen(g.day) ? t('ui.home.marketOpen', { n: activeNegs }) : t('ui.home.marketClosed'), flag: bids.length ? { text: `${bids.length}`, tone: 'todo' } : undefined },
    { id: 'club', view: 'finances', ico: 'compete', title: t('ui.home.club'), sub: overBudget ? t('ui.home.clubOver') : t('ui.home.clubOk', { n: Math.round(club.boardConfidence) }), flag: overBudget ? { text: '!', tone: 'todo' } : { text: '✓', tone: 'ok' } },
  ];

  return (
    <>
      <div className="taskbar" data-tour="hub-week" aria-label={t('ui.task.title')}>
        {tasks.map((k) => (
          <button key={k.id} className={`task-chip ${k.tone ?? ''}`} onClick={() => setView(k.go)}>
            <span className="ic"><Icon name={k.ico} size={20} /></span>
            <span>
              <div className="tt">{k.title}</div>
              {k.desc && <div className="dd">{k.desc}</div>}
            </span>
          </button>
        ))}
      </div>

      <div className="home">
        <div className="stack">
          <div className="home-hero" data-tour="hub-match" style={{ ['--home-c' as string]: home?.colors[0], ['--away-c' as string]: away?.colors[0] }}>
            {next && home && away ? (
              <>
                <div className="kick">
                  {compName(next.competitionName)} · {formatGameDate(g.season, next.fixture.day)}
                </div>
                <div className="teams">
                  <div className="team link" onClick={() => openClub(home.id)}>
                    <Crest club={home} size={96} />
                    <div className="n">{home.name}</div>
                    <div className="dim">{rowOf(home.id) >= 0 ? t('ui.ordinal', { n: rowOf(home.id) + 1 }) : ''}</div>
                  </div>
                  <div className="vs">{t('ui.match.vs')}</div>
                  <div className="team link" onClick={() => openClub(away.id)}>
                    <Crest club={away} size={96} />
                    <div className="n">{away.name}</div>
                    <div className="dim">{rowOf(away.id) >= 0 ? t('ui.ordinal', { n: rowOf(away.id) + 1 }) : ''}</div>
                  </div>
                </div>
                <div className="meta">
                  <span>{home.stadium.name}</span>
                  {runs.length > 0 && (
                    <span className="row" style={{ gap: 4 }}>
                      {[...runs].reverse().map((r, i) => (
                        <span key={i} className={`form-chip ${r.result}`}>
                          {t(`ui.form.${r.result}`)}
                        </span>
                      ))}
                    </span>
                  )}
                  {streak.win >= 2 && <span className="good b">{t('ui.intro.winStreak', { n: streak.win })}</span>}
                </div>
                <div className="cta">
                  <button className="btn" onClick={() => setView('tactics')}>
                    {t('ui.hub.prepare')}
                  </button>
                  <button className="btn-go" disabled={busy} onClick={() => (g.pendingFixtureId ? setView('match') : void continueGame())}>
                    <Icon name="play" size={18} />
                    {busy ? t('ui.simulating') : g.pendingFixtureId ? t('ui.toMatch') : t('ui.hub.advance')}
                  </button>
                </div>
              </>
            ) : (
              <div className="dim" style={{ padding: 30, textAlign: 'center' }}>
                {t('ui.hub.noMatches')}
              </div>
            )}
          </div>

          <div className="action-tiles">
            {tiles.map((k) => (
              <button key={k.id} className="action-tile" onClick={() => setView(k.view)} data-home-tile={k.id}>
                {k.flag && <span className={`at-flag ${k.flag.tone}`}>{k.flag.text}</span>}
                <span className="at-ico">
                  <Icon name={k.ico} size={28} />
                </span>
                <span className="at-t">{k.title}</span>
                <span className="at-s">{k.sub}</span>
              </button>
            ))}
          </div>

          <div className="panel">
            <div className="panel-h">
              <span className="tick" />
              <h3>{t('ui.hub.inForm')}</h3>
            </div>
            <div className="panel-b">
              <div className="cards-grid" style={{ justifyContent: 'center', padding: 0 }}>
                {inForm.map((p) => (
                  <FcCard key={p.id} p={p} club={club} size="sm" badge={`${Math.round(p.form)}`} onClick={() => openPlayer(p.id)} />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="stack">
          <div className="panel click" onClick={() => setView('competition')}>
            <div className="panel-h">
              <span className="tick" />
              <h3>{league ? displayName(league.name) : ''}</h3>
            </div>
            <div className="panel-b flush">
              <table className="tbl mini-table">
                <tbody>
                  {windowRows.map((r) => {
                    const i = table.indexOf(r) + 1;
                    const c = g.clubs[r.clubId];
                    return (
                      <tr key={r.clubId} className={r.clubId === club.id ? 'sel' : ''}>
                        <td className="n faint" style={{ width: 28 }}>
                          {i}
                        </td>
                        <td>
                          <span className="row nw" style={{ gap: 6 }}>
                            <Crest club={c} size={20} />
                            <span className="ellipsis" style={{ maxWidth: 150 }}>
                              {c.name}
                            </span>
                          </span>
                        </td>
                        <td className="n dim">{r.played}</td>
                        <td className="n b">{r.points}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel">
            <div className="panel-h">
              <span className="tick" />
              <h3>{t('ui.hub.board')}</h3>
            </div>
            <div className="panel-b">
              <div className="row" style={{ fontSize: 13, marginBottom: 4 }}>
                <span className="dim">{t('ui.hub.confidence')}</span>
                <span className="spacer" />
                <span className={`b ${club.boardConfidence < 30 ? 'bad' : ''}`}>{Math.round(club.boardConfidence)}%</span>
              </div>
              <Meter value={club.boardConfidence} color={club.boardConfidence < 30 ? 'var(--bad)' : undefined} />
              <div className="row" style={{ marginTop: 10, fontSize: 13 }}>
                <span className={pos + 1 <= target ? 'good' : 'warn'}>{t(`objective.${club.objectives?.league ?? club.objective}`)}</span>
                <span className="spacer" />
                <span className="faint">{t('ui.hub.posNow', { target, now: pos + 1 })}</span>
              </div>
              <div className="row" style={{ marginTop: 8, fontSize: 13 }}>
                <span className="dim">{t('ui.fin.balance')}</span>
                <span className="spacer" />
                <span className={club.finances.balance < 0 ? 'bad b' : 'b'}>{formatMoney(club.finances.balance)}</span>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-h">
              <span className="tick" />
              <h3>{t('ui.nav.inbox')}</h3>
              <div className="actions">
                <button className="btn sm ghost" onClick={() => setView('inbox')}>
                  {t('ui.hub.openInbox')}
                </button>
              </div>
            </div>
            <div className="panel-b flush" style={{ maxHeight: 360, overflow: 'auto' }}>
              <NewsList filter="club" limit={7} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
