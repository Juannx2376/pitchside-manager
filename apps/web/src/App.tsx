import { countryName, displayName, formatGameDate, leagueOf, leaguePosition, managerName, t, userManager } from '@pitchside/core';
import { useEffect } from 'react';
import { RewardReveal } from './components/RewardReveal';
import { GlobalSearch } from './components/Search';
import { Icon } from './components/shell/Icon';
import { SectionTabs } from './components/shell/SectionTabs';
import { TopNav } from './components/shell/TopNav';
import { JOBLESS_SECTIONS, SECTIONS, sectionOf } from './components/shell/sections';
import { Tutorial } from './components/Tutorial';
import { Crest, Flag, Toast } from './components/ui';
import { accentFromClub } from './lib/colors';
import { usePrefs } from './lib/prefs';
import { useGame, windowLabel, type View } from './store/game';
import { Calendar } from './views/Calendar';
import { Career } from './views/Career';
import { ClubModal } from './views/ClubModal';
import { Competition } from './views/Competition';
import { DataImport } from './views/DataImport';
import { DeadlineDay } from './views/DeadlineDay';
import { Finances } from './views/Finances';
import { Help } from './views/Help';
import { Hub } from './views/Hub';
import { Inbox } from './views/Inbox';
import { MatchView } from './views/Match';
import { NewGame } from './views/NewGame';
import { PlayerModal } from './views/PlayerModal';
import { Objectives } from './views/Objectives';
import { Press } from './views/Press';
import { Scouting } from './views/Scouting';
import { SeasonGala } from './views/SeasonGala';
import { Settings } from './views/Settings';
import { Squad } from './views/Squad';
import { Staff } from './views/Staff';
import { Tactics } from './views/Tactics';
import { Training } from './views/Training';
import { Transfers } from './views/Transfers';
import { Unemployed } from './views/Unemployed';
import { World } from './views/World';

export function App() {
  const game = useGame((s) => s.game);
  useGame((s) => s.version);
  const locale = useGame((s) => s.locale);
  const theme = usePrefs((s) => s.theme);
  const view = useGame((s) => s.view);
  const setView = useGame((s) => s.setView);
  const busy = useGame((s) => s.busy);
  const toast = useGame((s) => s.toast);
  const playerId = useGame((s) => s.playerId);
  const clubModalId = useGame((s) => s.clubId);
  const continueGame = useGame((s) => s.continueGame);
  const loadBaseDb = useGame((s) => s.loadBaseDb);

  useEffect(() => {
    void loadBaseDb();
  }, [loadBaseDb]);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const club = game?.userClubId ? game.clubs[game.userClubId] : null;
  const manager = game ? userManager(game) : null;
  const sections = club ? SECTIONS : JOBLESS_SECTIONS;
  const section = sectionOf(view, sections);

  // Interface accent from the managed club's colours (the PES theme keeps its own yellow).
  useEffect(() => {
    const root = document.documentElement;
    if (!club || theme === 'pes') {
      root.style.removeProperty('--accent');
      root.style.removeProperty('--accent-ink');
      return;
    }
    const { accent, ink } = accentFromClub(club.colors);
    root.style.setProperty('--accent', accent);
    root.style.setProperty('--accent-ink', ink);
    root.style.setProperty('--club-1', club.colors[0]);
    root.style.setProperty('--club-2', club.colors[1]);
  }, [club, club?.colors, theme]);

  // Unemployed managers only see the career-related screens.
  useEffect(() => {
    if (game && manager && !club && !JOBLESS_SECTIONS.some((s) => s.views.includes(view))) setView('unemployed');
  }, [game, manager, club, view, setView]);

  // Q / E cambian de pestaña dentro de la sección; 1-6 saltan de sección; Ctrl+Espacio continúa.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) return;
      const st = useGame.getState();
      const list = st.game?.userClubId ? SECTIONS : JOBLESS_SECTIONS;
      const sec = sectionOf(st.view, list);
      const idx = sec.views.indexOf(st.view);
      if (e.key === 'q' || e.key === 'Q') setView(sec.views[(idx - 1 + sec.views.length) % sec.views.length]);
      else if (e.key === 'e' || e.key === 'E') setView(sec.views[(idx + 1) % sec.views.length]);
      else if (/^[1-6]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = list[Number(e.key) - 1];
        if (target) setView(target.views[0]);
      } else if (e.code === 'Space' && e.ctrlKey) {
        e.preventDefault();
        void continueGame();
      } else if (e.key === 'Escape') {
        useGame.setState({ playerId: null, clubId: null });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setView, continueGame]);

  if (!game || !manager) {
    return (
      <>
        <NewGame />
        {playerId && game && <PlayerModal id={playerId} />}
        {clubModalId && game && <ClubModal id={clubModalId} />}
        <Toast msg={toast} />
      </>
    );
  }

  const league = club ? leagueOf(game, club.id) : null;
  const pos = league && club ? leaguePosition(league, club.id) : 0;
  // Badge: unread news about your own club (or major stories while unemployed).
  const unread = game.news.filter((n) => !n.read && (club ? n.clubIds.includes(club.id) : n.importance === 3)).length;
  const badges: Partial<Record<View, number>> = {
    inbox: unread,
    transfers: club ? Object.values(game.negotiations).filter((n) => n.incoming && n.stage === 'club').length : 0,
    unemployed: game.jobOffers.length,
    career: game.jobOffers.length,
    finances: club ? game.sponsorOffers.length : 0,
    objectives: club ? (userManager(game)?.points ?? 0) : 0,
    training: club ? (game.trainingEvents ?? []).filter((e) => !e.resolved).length : 0,
  };
  const pendingMatch = !!game.pendingFixtureId;

  return (
    <div className="app shell" key={locale}>
      <header className="topbar">
        {club ? <Crest club={club} size={40} /> : <div className="mast-noclub">{manager.firstName.charAt(0)}</div>}
        <div className="top-club">
          <div className="name">{club ? club.name : managerName(manager)}</div>
          <div className="sub">
            {club ? (
              <>
                <Flag code={club.countryCode} size={16} />
                <span>{league ? displayName(league.name) : ''}</span>
                <span className="faint">·</span>
                <span className="b">{t('ui.ordinal', { n: pos })}</span>
                <span className="faint">·</span>
                <span>{managerName(manager)}</span>
              </>
            ) : (
              <span className="warn">{t('ui.unemployed')}</span>
            )}
          </div>
        </div>
        <TopNav sections={sections} current={section.id} badges={badges} onGo={setView} />
        <div className="top-right">
          <div className="date">
            <div className="d">{formatGameDate(game.season, game.day)}</div>
            <div className="s">
              {windowLabel(game.day)}
              {club ? ` · ${countryName(club.countryCode)}` : ''}
            </div>
          </div>
          <button className={`top-ico ${view === 'help' ? 'on' : ''}`} data-tour="nav-help" onClick={() => setView('help')} aria-label={t('ui.nav.help')} title={t('ui.nav.help')}>
            <Icon name="help" />
          </button>
          {busy ? (
            <button className="btn-go stop" onClick={() => useGame.setState({ stopRequested: true })}>
              {t('ui.stop')}
            </button>
          ) : (
            <button className="btn-go" data-tour="continue" disabled={!!game.gameOver} onClick={() => (pendingMatch ? setView('match') : void continueGame())} title="Ctrl+Space">
              <Icon name="play" size={18} />
              {pendingMatch ? t('ui.toMatch') : t('ui.continue')}
            </button>
          )}
        </div>
      </header>
      <div className="subbar">
        <SectionTabs section={section} view={view} badges={badges} onGo={setView} />
        <div className="top-search">
          <GlobalSearch />
        </div>
      </div>
      <main className="main">
        {game.gameOver && (
          <div className="panel" style={{ padding: 14, marginBottom: 14, borderColor: 'var(--bad)' }}>
            <span className="bad b">{t('ui.gameOver')} · </span>
            {t(game.gameOver.k, game.gameOver.p)}{' '}
            <button className="btn sm" onClick={() => useGame.getState().quit()}>
              {t('ui.mainMenu')}
            </button>
          </div>
        )}
        {pendingMatch && view !== 'match' && (
          <button className="match-banner" onClick={() => setView('match')}>
            <span className="live-dot" /> {t('ui.nav.match')} · {t('ui.toMatch')}
          </button>
        )}
        <div className="view" key={view}>
          {view === 'hub' && club && <Hub />}
          {view === 'inbox' && <Inbox />}
          {view === 'squad' && club && <Squad />}
          {view === 'tactics' && club && <Tactics />}
          {view === 'training' && club && <Training />}
          {view === 'objectives' && club && <Objectives />}
          {view === 'gala' && club && <SeasonGala />}
          {view === 'transfers' && club && <Transfers />}
          {view === 'scouting' && club && <Scouting />}
          {view === 'deadline' && club && <DeadlineDay />}
          {view === 'staff' && club && <Staff />}
          {view === 'finances' && club && <Finances />}
          {view === 'calendar' && club && <Calendar />}
          {view === 'press' && club && <Press />}
          {view === 'competition' && <Competition />}
          {view === 'world' && <World />}
          {view === 'career' && <Career />}
          {view === 'settings' && <Settings />}
          {view === 'help' && <Help />}
          {view === 'unemployed' && !club && <Unemployed />}
          {view === 'match' && <MatchView />}
          {view === 'data' && <DataImport />}
        </div>
      </main>
      {playerId && <PlayerModal id={playerId} />}
      {clubModalId && <ClubModal id={clubModalId} />}
      {club && <RewardReveal />}
      {club && <Tutorial />}
      <Toast msg={toast} />
    </div>
  );
}
