// "Social network" feed: fans, rival fans, journalists and players reacting to what happens.
import { formatGameDate, formatNumber, t, tm } from '@pitchside/core';
import { useGameState } from '../store/game';
import { Crest } from './ui';

const KIND_ICON: Record<string, string> = { fan: '♥', rivalFan: '⚑', journalist: '✎', player: '★', club: '◆', pundit: '◎' };

export function SocialFeed({ limit = 20, clubId }: { limit?: number; clubId?: string }) {
  const g = useGameState();
  const posts = g.social.filter((p) => !clubId || p.clubId === clubId).slice(0, limit);
  if (posts.length === 0) return <div className="dim">{t('ui.social.empty')}</div>;
  return (
    <div className="social">
      {posts.map((p) => {
        const club = p.clubId ? g.clubs[p.clubId] : null;
        return (
          <div key={p.id} className={`post mood${p.mood}`}>
            <div className={`av ${p.kind}`}>{KIND_ICON[p.kind] ?? '•'}</div>
            <div style={{ minWidth: 0 }}>
              <div className="row nw" style={{ gap: 6 }}>
                <span className="b ellipsis">{p.author}</span>
                <span className="faint ellipsis">@{p.handle}</span>
                {club && <Crest club={club} size={14} />}
                <span className="spacer" />
                <span className="faint" style={{ fontSize: 11 }}>
                  {formatGameDate(p.season, p.day)}
                </span>
              </div>
              <div className="txt">{tm(p.text)}</div>
              <div className="faint meta">
                ↻ {formatNumber(p.reposts)} · ♥ {formatNumber(p.likes)} · {t(`ui.social.kind.${p.kind}`)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
