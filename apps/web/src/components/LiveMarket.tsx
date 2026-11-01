// Mercado con vida: día de cierre (oportunidades de última hora) y ofertas de agentes.
// No revela la media real: usa el informe del ojeador si existe (rango) o "??".
import { Rng, acceptAgentOffer, acceptDeadlineDeal, daysToDeadline, declineAgentOffer, fullName, guessRumour, isWindowOpen, overall, rumourSource, t, visibleAttributes, type DealResult, type GameState, type Player } from '@pitchside/core';import { useGame, useGameState } from '../store/game';
import { Face, Flag, Panel, PosBadge } from './ui';
import '../hooks.css';

const REASON_ERR: Record<string, string> = { budget: 'ui.deal.err.budget', wages: 'ui.deal.err.wages', gone: 'ui.deal.err.gone', closed: 'ui.deal.err.closed', embargo: 'ui.deal.err.embargo' };

function scoutedOvr(g: GameState, p: Player): string {
  const vis = visibleAttributes(g, p.id);
  if (!vis) return '??';
  const o = overall({ ...p, attrs: vis.attrs });
  return vis.margin ? `${Math.max(1, o - vis.margin)}–${Math.min(99, o + vis.margin)}` : `${o}`;
}

export function LiveMarket() {
  const g = useGameState();
  const { mutate, notify, openPlayer } = useGame();
  const club = g.clubs[g.userClubId as string];
  const open = isWindowOpen(g.day);
  const left = daysToDeadline(g.day);
  const deals = g.meta?.deadline?.deals ?? [];
  const offers = g.meta?.agentOffers ?? [];
  const rumours = g.meta?.rumours ?? [];
  const rng = () => new Rng((g.rngState ^ (g.day * 977) ^ deals.length) >>> 0);
  const report = (r: DealResult) => notify(r.ok ? t('ui.deal.signed') : t(REASON_ERR[r.reason]));

  const who = (p: Player, right: string) => (
    <div className="row nw link" style={{ flex: 1, minWidth: 0 }} onClick={() => openPlayer(p.id)}>
      <Face player={p} club={p.clubId ? g.clubs[p.clubId] : null} size={40} />
      <PosBadge pos={p.position} />
      <div style={{ minWidth: 0 }}>
        <div className="b ellipsis">{fullName(p)}</div>
        <div className="faint" style={{ fontSize: 12 }}>
          <Flag code={p.nationality} size={14} /> {t('ui.ageN', { n: p.age })} · {p.clubId ? g.clubs[p.clubId]?.name : t('ui.freeAgent')}
        </div>
      </div>
      <span className="tag">{right}</span>
    </div>
  );

  return (
    <div className="grid" style={{ gap: 12 }}>
      <Panel title={t('ui.deadline.title')} className={left !== null && left <= 1 ? 'deadline' : ''}>
        {!open ? (
          <p className="dim" style={{ margin: 0 }}>
            {t('ui.deadline.closed')}
          </p>
        ) : (
          <>
            <div className="row" style={{ alignItems: 'baseline' }}>
              <span className="clock" data-deadline-clock>
                {left === 0 ? t('ui.deadline.today') : t('ui.deadline.in', { n: left ?? 0 })}
              </span>
              <span className="spacer" />
              <span className="faint">{t('ui.deadline.budget', { budget: club.finances.transferBudget })}</span>
            </div>
            {left !== null && left > 1 && (
              <p className="dim" style={{ marginBottom: 0 }}>
                {t('ui.deadline.hint')}
              </p>
            )}
            {deals.length === 0 && left !== null && left <= 1 && <p className="dim">{t('ui.deadline.none')}</p>}
            {deals.map((d) => {
              const p = g.players[d.playerId];
              if (!p) return null;
              return (
                <div key={d.playerId} className="deal-row" data-deal={d.playerId}>
                  {who(p, scoutedOvr(g, p))}
                  <div className="faint" style={{ fontSize: 12, textAlign: 'right' }}>
                    {t(`ui.deadline.reason.${d.reason}`)}
                    <br />
                    {t('ui.deadline.price', { value: d.price })}
                  </div>
                  <button className="btn sm acc" onClick={() => report(mutate((s) => acceptDeadlineDeal(s, d.playerId, rng())))}>
                    {t('ui.deadline.sign')}
                  </button>
                </div>
              );
            })}
          </>
        )}
      </Panel>

      <Panel title={t('ui.agent.title', { n: offers.length })}>
        {offers.length === 0 && <p className="dim" style={{ margin: 0 }}>{t('ui.agent.none')}</p>}
        {offers.map((o) => {
          const p = g.players[o.playerId];
          if (!p) return null;
          return (
            <div key={o.id} className="deal-row" data-agent={o.id}>
              {who(p, `≈${o.claimedOvr}`)}
              <div className="faint" style={{ fontSize: 12, textAlign: 'right' }}>
                {t('ui.agent.terms', { fee: o.fee, wage: o.wage, amount: o.commission, days: Math.max(0, o.expiresDay - g.day) })}
                <br />
                <span>{t('ui.agent.maybe')}</span>
              </div>
              <button className="btn sm acc" onClick={() => report(mutate((s) => acceptAgentOffer(s, o.id, rng())))}>
                {t('ui.agent.accept')}
              </button>
              <button className="btn sm ghost" onClick={() => mutate((s) => declineAgentOffer(s, o.id))}>
                {t('ui.agent.decline')}
              </button>
            </div>
          );
        })}
        <p className="faint" style={{ fontSize: 12, marginBottom: 0 }}>
          {t('ui.agent.hint')}
        </p>
      </Panel>

      <Panel title={t('ui.rumour.title', { n: rumours.filter((r) => r.status === 'open').length })}>
        <p className="dim" style={{ marginTop: 0, fontSize: 13 }}>
          {t('ui.rumour.hint')}
        </p>
        {rumours.length === 0 && <p className="faint">{t('ui.rumour.none')}</p>}
        {[...rumours]
          .sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) || a.resolveDay - b.resolveDay)
          .map((r) => {
            const p = g.players[r.playerId];
            const to = g.clubs[r.toClubId];
            const src = rumourSource(r.sourceId);
            if (!p || !to) return null;
            const right = r.guess ? (r.guess === 'true') === (r.status === 'confirmed') : null;
            return (
              <div key={r.id} className="deal-row" data-rumour={r.id}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="b ellipsis">{t('ui.rumour.line', { p: fullName(p), club: to.name })}</div>
                  <div className="faint" style={{ fontSize: 12 }}>
                    {src.name} · {t('ui.rumour.reliability', { n: Math.round(src.reliability * 100) })}
                    {r.status === 'open' ? ` · ${t('ui.rumour.days', { n: Math.max(0, r.resolveDay - g.day) })}` : ''}
                  </div>
                </div>
                {r.status === 'open' ? (
                  <div className="row" style={{ gap: 4 }}>
                    <button className={`btn sm ${r.guess === 'true' ? 'acc' : ''}`} onClick={() => mutate((s) => guessRumour(s, r.id, r.guess === 'true' ? undefined : 'true'))}>
                      {t('ui.rumour.true')}
                    </button>
                    <button className={`btn sm ${r.guess === 'false' ? 'acc' : ''}`} onClick={() => mutate((s) => guessRumour(s, r.id, r.guess === 'false' ? undefined : 'false'))}>
                      {t('ui.rumour.false')}
                    </button>
                  </div>
                ) : (
                  <span className={`tag ${r.status === 'confirmed' ? 'good' : 'bad'}`}>
                    {t(`ui.rumour.${r.status}`)}
                    {right === null ? '' : right ? ' ✓' : ' ✗'}
                  </span>
                )}
              </div>
            );
          })}
        <div className="faint" style={{ fontSize: 12, marginTop: 6 }}>
          {t('ui.rumour.score', { right: g.meta?.rumourStats?.right ?? 0, wrong: g.meta?.rumourStats?.wrong ?? 0 })}
        </div>
      </Panel>
    </div>
  );
}
