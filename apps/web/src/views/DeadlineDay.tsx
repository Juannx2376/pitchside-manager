// Deadline Day en vivo: reloj 04:00 → 24:00, ticker de noticias, tus tratos con "cerrar ya" y rivales con nombre.
import {
  DEADLINE_HOURS,
  RUSH_FEE_PREMIUM,
  advanceDeadlineHours,
  askingPrice,
  daysToDeadline,
  deadlineLive,
  finishDeadlineLive,
  formatMoney,
  isWindowOpen,
  ownerClubId,
  rushDeal,
  startDeadlineLive,
  startEnquiry,
  t,
  tm,
  userDeals,
  type Negotiation,
} from '@pitchside/core';
import { Icon } from '../components/shell/Icon';
import { Crest, Face, Panel, ViewHead } from '../components/ui';
import { useGame, useGameState } from '../store/game';
import '../hooks.css';

const clock = (hour: number): string => `${String((4 + hour) % 24).padStart(2, '0')}:00`;

export function DeadlineDay() {
  const g = useGameState();
  const mutate = useGame((s) => s.mutate);
  const setView = useGame((s) => s.setView);
  const notify = useGame((s) => s.notify);
  const openPlayer = useGame((s) => s.openPlayer);
  const continueGame = useGame((s) => s.continueGame);
  const live = deadlineLive(g);
  const left = daysToDeadline(g.day);
  const club = g.clubs[g.userClubId as string];

  if (!live) {
    return (
      <>
        <ViewHead title={t('ui.dl.title')} />
        <div className="dl-idle panel">
          <div className="dl-idle-ico"><Icon name="clock" size={40} /></div>
          <div className="dl-idle-t">{isWindowOpen(g.day) && left !== null ? t('ui.dl.opensIn', { n: left }) : t('ui.dl.closed')}</div>
          <p className="dim">{t('ui.dl.explain')}</p>
          {isWindowOpen(g.day) && (
            <button className="btn acc" onClick={() => mutate((s) => startDeadlineLive(s))} disabled={left !== 0}>
              {t('ui.dl.enter')}
            </button>
          )}
        </div>
      </>
    );
  }

  const deals = userDeals(g);
  const dealIds = new Set(deals.map((d) => d.playerId));
  const wishlist = g.shortlist.map((id) => g.players[id]).filter((p) => p && !dealIds.has(p.id) && p.clubId !== club.id).slice(0, 6);
  const pct = Math.round((live.hour / DEADLINE_HOURS) * 100);
  const act = (hours: number) => mutate((s) => advanceDeadlineHours(s, hours));

  const stageLabel = (n: Negotiation): string => t(`ui.dl.stage.${n.stage}`);

  return (
    <>
      <ViewHead title={t('ui.dl.title')} meta={<span className="faint">{t('ui.dl.sub', { club: club.name })}</span>} />
      <div className="dl-top panel" data-deadline-live>
        <div className="dl-clock">
          <div className="dl-time" data-dl-time>
            {clock(live.hour)}
          </div>
          <div className="dl-hint">{live.finished ? t('ui.dl.closedNow') : t('ui.dl.hoursLeft', { n: DEADLINE_HOURS - live.hour })}</div>
        </div>
        <div className="dl-bar-wrap">
          <div className="dl-bar">
            <div style={{ width: `${pct}%` }} />
          </div>
          <div className="dl-stats">
            <span className="tag good">{t('ui.dl.signed', { n: live.stats.signed })}</span>
            <span className="tag bad">{t('ui.dl.lost', { n: live.stats.lost })}</span>
            <span className="tag warn">{t('ui.dl.rivals', { n: live.stats.rivalMoves })}</span>
          </div>
        </div>
        <div className="dl-ctrl">
          {!live.finished ? (
            <>
              <button className="btn acc" data-dl-advance="1" onClick={() => act(1)}>
                +1 h
              </button>
              <button className="btn" data-dl-advance="2" onClick={() => act(2)}>
                +2 h
              </button>
              <button className="btn" data-dl-finish onClick={() => mutate((s) => finishDeadlineLive(s))}>
                {t('ui.dl.toClose')}
              </button>
            </>
          ) : (
            <button
              className="btn acc"
              data-dl-done
              onClick={() => {
                setView('hub');
                void continueGame();
              }}
            >
              {t('ui.dl.done')}
            </button>
          )}
        </div>
      </div>

      <div className="dl-grid">
        <Panel title={t('ui.dl.yourDeals', { n: deals.length })} flush>
          {deals.length === 0 && <div className="dim" style={{ padding: 14 }}>{t('ui.dl.noDeals')}</div>}
          {deals.map((n) => {
            const p = g.players[n.playerId];
            if (!p) return null;
            const owner = ownerClubId(p);
            const wait = n.awaiting?.replyHour;
            return (
              <div key={n.id} className="dl-deal" data-dl-deal>
                <Face player={p} size={36} />
                <div className="dl-deal-main">
                  <div className="b link ellipsis" onClick={() => openPlayer(p.id)}>
                    {p.firstName} {p.lastName}
                  </div>
                  <div className="faint dl-deal-sub">
                    {owner ? g.clubs[owner]?.name : t('ui.freeAgent')} · {stageLabel(n)}
                    {wait !== undefined && ` · ${t('ui.dl.replyAt', { h: clock(wait) })}`}
                  </div>
                </div>
                <div className="dl-deal-act">
                  {!live.finished && (n.stage === 'club' || n.stage === 'player') && n.kind === 'transfer' && (
                    <button
                      className="btn sm acc"
                      title={t('ui.dl.rushTip', { pct: Math.round(RUSH_FEE_PREMIUM * 100) })}
                      onClick={() => {
                        const r = mutate((s) => rushDeal(s, n.id));
                        notify(tm(r.message));
                      }}
                    >
                      {t('ui.dl.rush')} · {formatMoney(askingPrice(g, p))}
                    </button>
                  )}
                  <button className="btn sm" onClick={() => setView('transfers')}>
                    {t('ui.dl.open')}
                  </button>
                </div>
              </div>
            );
          })}
          {!live.finished && wishlist.length > 0 && (
            <>
              <div className="dl-sub">{t('ui.dl.wishlist')}</div>
              {wishlist.map((p) => (
                <div key={p.id} className="dl-deal">
                  <Face player={p} size={30} />
                  <div className="dl-deal-main">
                    <div className="b ellipsis">
                      {p.firstName} {p.lastName}
                    </div>
                    <div className="faint dl-deal-sub">{p.clubId ? g.clubs[p.clubId]?.name : t('ui.freeAgent')}</div>
                  </div>
                  <button
                    className="btn sm"
                    onClick={() =>
                      mutate((s) => {
                        try {
                          startEnquiry(s, p.id, club.id);
                        } catch {
                          /* ya hay un trato */
                        }
                      })
                    }
                  >
                    {t('ui.dl.enquire')}
                  </button>
                </div>
              ))}
            </>
          )}
        </Panel>

        <Panel title={t('ui.dl.ticker')} flush>
          <div className="dl-feed" data-dl-feed>
            {live.feed.map((e) => (
              <div key={e.id} className={`dl-ev i${e.importance} k-${e.kind}`}>
                <span className="dl-ev-h">{clock(e.hour)}</span>
                <span className="dl-ev-t">{tm(e.text)}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <div className="dl-foot">
        <Crest club={club} size={20} /> <span className="faint">{t('ui.dl.foot')}</span>
      </div>
    </>
  );
}
