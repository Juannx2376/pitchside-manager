import { formatGameDate, t, tm, type NewsCategory, type NewsItem } from '@pitchside/core';
import { useState } from 'react';
import { SocialFeed } from '../components/Social';
import { Panel, SubTabs, ViewHead } from '../components/ui';
import { useGame, useGameState } from '../store/game';

const BAD: NewsCategory[] = ['leak', 'fpf', 'injury'];
const GOOD: NewsCategory[] = ['transfer', 'award', 'youth', 'career'];

/** News list rendered in the active language (items store translatable messages). */
export function NewsList({ filter, limit = 200, category }: { filter: 'club' | 'world'; limit?: number; category?: NewsCategory | 'all' }) {
  const g = useGameState();
  const mutate = useGame((s) => s.mutate);
  const openPlayer = useGame((s) => s.openPlayer);
  const [open, setOpen] = useState<string | null>(null);
  const clubId = g.userClubId;
  const news = g.news
    .filter((n) => filter === 'world' || !clubId || n.clubIds.includes(clubId) || n.importance === 3)
    .filter((n) => !category || category === 'all' || n.category === category)
    .slice(0, limit);
  const click = (n: NewsItem) => {
    mutate(() => (n.read = true));
    setOpen(open === n.id ? null : n.id);
  };
  if (news.length === 0) return <div className="dim" style={{ padding: 12 }}>{t('ui.inbox.empty')}</div>;
  return (
    <>
      {news.map((n) => (
        <div key={n.id} className={`mail ${n.read ? '' : 'unread'} ${open === n.id ? 'open' : ''}`} onClick={() => click(n)}>
          <div className="bar" />
          <div style={{ minWidth: 0 }}>
            <div className="row nw" style={{ gap: 8 }}>
              <span className={`tag ${BAD.includes(n.category) ? 'bad' : GOOD.includes(n.category) ? 'acc' : ''}`}>{t(`ui.newsCat.${n.category}`)}</span>
              <span className="t ellipsis">{tm(n.title)}</span>
            </div>
            <div className="b">{tm(n.body)}</div>
            {open === n.id && n.playerId && g.players[n.playerId] && (
              <button
                className="btn sm"
                style={{ marginTop: 6 }}
                onClick={(e) => {
                  e.stopPropagation();
                  openPlayer(n.playerId as string);
                }}
              >
                {t('ui.viewProfile')}
              </button>
            )}
          </div>
          <div className="when">{formatGameDate(n.season, n.day)}</div>
        </div>
      ))}
    </>
  );
}

const CATS: (NewsCategory | 'all')[] = ['all', 'match', 'transfer', 'board', 'finance', 'press', 'leak', 'injury', 'youth', 'scouting', 'staff', 'award', 'career', 'fpf', 'general'];

export function Inbox() {
  const g = useGameState();
  const mutate = useGame((s) => s.mutate);
  const [scope, setScope] = useState<'club' | 'world'>(g.userClubId ? 'club' : 'world');
  const [cat, setCat] = useState<NewsCategory | 'all'>('all');
  return (
    <>
      <ViewHead
        title={t('ui.nav.inbox')}
        meta={t('ui.inbox.unread', { n: g.news.filter((n) => !n.read).length })}
        tools={
          <>
            <SubTabs
              tabs={[
                { id: 'club', label: t('ui.inbox.myClub') },
                { id: 'world', label: t('ui.inbox.world') },
              ]}
              value={scope}
              onChange={setScope}
            />
            <select value={cat} onChange={(e) => setCat(e.target.value as NewsCategory | 'all')}>
              {CATS.map((c) => (
                <option key={c} value={c}>
                  {c === 'all' ? t('ui.all') : t(`ui.newsCat.${c}`)}
                </option>
              ))}
            </select>
            <button className="btn ghost" onClick={() => mutate((s) => s.news.forEach((n) => (n.read = true)))}>
              {t('ui.inbox.markRead')}
            </button>
          </>
        }
      />
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr) 360px' }}>
        <Panel flush>
          <div style={{ maxHeight: 'calc(100vh - 220px)', overflow: 'auto' }}>
            <NewsList filter={scope} category={cat} />
          </div>
        </Panel>
        <Panel title={t('ui.hub.social')}>
          <div style={{ maxHeight: 'calc(100vh - 260px)', overflow: 'auto' }}>
            <SocialFeed limit={60} clubId={scope === 'club' ? (g.userClubId ?? undefined) : undefined} />
          </div>
        </Panel>
      </div>
    </>
  );
}
