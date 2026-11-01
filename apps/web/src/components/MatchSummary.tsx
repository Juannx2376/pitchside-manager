// Resumen post-partido estilo FC: MVP, historia del partido, rueda de highlights con mini-repetición y notas.
import { buildHighlights, matchStory, shortName, t, tm, type Club, type StoredMatch } from '@pitchside/core';
import { useMemo, useState } from 'react';
import { useGame, useGameState } from '../store/game';
import { FcCard } from './FcCard';
import { MatchReplay } from './MatchReplay';
import { Panel, rateClass, RATE_COLOR } from './ui';
import '../hooks.css';

const ICON: Record<string, string> = { goal: '⚽', save: '🧤', miss: '❌', chance: '✨', penalty_missed: '🚫', penalty_awarded: '☝', red: '🟥', second_yellow: '🟨', controversy: '❗', injury: '✚' };

export function MatchSummary({ match, home, away }: { match: StoredMatch; home: Club; away: Club }) {
  const g = useGameState();
  const { openPlayer } = useGame();
  const { result } = match;
  const hl = useMemo(() => buildHighlights(result), [result]);
  const tags = useMemo(() => matchStory(result), [result]);
  const [sel, setSel] = useState(0);
  const cur = hl[Math.min(sel, hl.length - 1)];
  const motm = result.motmId ? g.players[result.motmId] : null;
  const motmClub = motm?.clubId ? g.clubs[motm.clubId] : motm && result.players[motm.id]?.side === 'home' ? home : away;
  const userSide = home.isUser ? 'home' : away.isUser ? 'away' : null;
  const rated = Object.values(result.players)
    .filter((s) => (userSide ? s.side === userSide : true) && s.minutes > 0)
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 7);
  const frames = result.frames.filter((_, i) => i % 2 === 0).slice(0, 60);

  return (
    <div className="grid" style={{ gap: 12, marginBottom: 12 }}>
      <Panel>
        <div className="ms-hero">
          {motm ? <FcCard p={motm} club={motmClub} size="md" badge={t('ui.sum.motm')} onClick={() => openPlayer(motm.id)} /> : <div />}
          <div>
            <div className="ms-tags">
              {tags.length === 0 && <span className="tag">{t('ui.sum.story.normal')}</span>}
              {tags.map((id) => (
                <span key={id} className={`tag ${id === 'robbed' || id === 'redCard' ? 'warn' : 'acc'}`}>
                  {t(`ui.sum.story.${id}`)}
                </span>
              ))}
            </div>
            <div className="dim" style={{ fontSize: 13, marginBottom: 6 }}>
              {t('ui.sum.xg', { h: result.stats.home.xg.toFixed(1), a: result.stats.away.xg.toFixed(1) })} · {t('ui.sum.shots', { h: result.stats.home.shots, a: result.stats.away.shots })}
            </div>
            <div className="ms-momentum" title={t('ui.sum.momentum')}>
              {frames.map((f, i) => (
                <i key={i} style={{ height: `${Math.max(6, Math.abs(f.momentum) * 0.9)}%`, background: f.momentum >= 0 ? home.colors[0] : away.colors[0], opacity: 0.85 }} />
              ))}
            </div>
            <div className="faint" style={{ fontSize: 11 }}>
              {home.name} ↔ {away.name}
            </div>
          </div>
        </div>
      </Panel>

      {hl.length > 0 && (
        <Panel title={t('ui.sum.highlights')}>
          <div className="ms-hl">
            <div className="ms-hl-list">
              {hl.map((h, i) => (
                <button key={i} className={`ms-hl-item ${i === sel ? 'on' : ''}`} onClick={() => setSel(i)}>
                  <span className="min">{h.minute}'</span>
                  <span className="ico">{ICON[h.type] ?? '•'}</span>
                  <span className="ellipsis">{tm(h.msg)}</span>
                  <span className="spacer" />
                  <span className="faint">
                    {h.score[0]}–{h.score[1]}
                  </span>
                  {h.xg > 0 && <span className="tag">{t('ui.sum.xgN', { n: h.xg.toFixed(2) })}</span>}
                </button>
              ))}
            </div>
            {cur && <MatchReplay h={cur} home={home} away={away} players={g.players} />}
          </div>
        </Panel>
      )}

      {rated.length > 0 && (
        <Panel title={t('ui.sum.ratings')}>
          {rated.map((s) => {
            const p = g.players[s.playerId];
            return (
              <div key={s.playerId} className="rating-row link" onClick={() => openPlayer(s.playerId)}>
                <span className={`v ${rateClass(s.rating * 10)}`}>{s.rating.toFixed(1)}</span>
                <div className="rating-bar">
                  <div style={{ width: `${Math.min(100, s.rating * 10)}%`, background: RATE_COLOR[rateClass(s.rating * 10)] }} />
                </div>
                <span className="ellipsis">{p ? shortName(p) : '?'}</span>
              </div>
            );
          })}
        </Panel>
      )}
    </div>
  );
}
