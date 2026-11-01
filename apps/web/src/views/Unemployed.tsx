// Desempleo: balance de la etapa que terminó, ofertas, candidaturas a clubes y espera de llamadas.
import {
  Rng,
  acceptJob,
  advanceUntilOffer,
  applicationOdds,
  applyForJob,
  countryName,
  displayName,
  formatMoney,
  openApplications,
  t,
  userManager,
} from '@pitchside/core';
import { useMemo, useState } from 'react';
import { Crest, Flag, Meter, Panel, Stat, ViewHead } from '../components/ui';
import { useGame, useGameState } from '../store/game';
import '../hooks.css';

export function Unemployed() {
  const g = useGameState();
  const { mutate, notify, openClub, setView } = useGame();
  const [busy, setBusy] = useState(false);
  const m = userManager(g);
  const stint = g.meta?.lastStint ?? null;
  const old = stint ? g.clubs[stint.clubId] : null;
  const apps = g.meta?.applications ?? [];

  const targets = useMemo(() => {
    if (!m) return [];
    return Object.values(g.clubs)
      .filter((c) => !c.isUser && c.reputation <= m.reputation + 12 && c.reputation >= m.reputation - 30 && c.id !== stint?.clubId)
      .sort((a, b) => b.reputation - a.reputation)
      .slice(0, 12);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.season, m?.reputation, stint?.clubId]);

  if (!m) return null;

  const wait = () => {
    setBusy(true);
    window.setTimeout(() => {
      const days = mutate((s) => advanceUntilOffer(s, 14));
      setBusy(false);
      notify(t('ui.unemp.waited', { n: days }));
    }, 30);
  };

  return (
    <>
      <ViewHead title={t('ui.unemp.title')} meta={t('ui.unemp.meta', { rep: Math.round(m.reputation) })} />
      <div className="grid c-main" style={{ alignItems: 'start' }}>
        <div className="grid">
          {stint && old && (
            <Panel title={t('ui.unemp.stint')}>
              <div className="row nw" style={{ marginBottom: 8 }}>
                <Crest club={old} size={46} />
                <div>
                  <div className="disp" style={{ fontSize: 20 }}>
                    {old.name}
                  </div>
                  <div className="faint">{t('ui.unemp.years', { a: stint.fromSeason, b: stint.toSeason })}</div>
                </div>
                <span className="spacer" />
                <span className={`tag ${stint.reason === 'sacked' ? 'bad' : 'warn'}`}>{t(`ui.unemp.reason.${stint.reason}`)}</span>
              </div>
              <p className="dim" style={{ marginTop: 0 }}>
                {t(`ui.unemp.letter.${stint.reason}`, { club: old.name, conf: stint.confidence })}
              </p>
              <div className="grid c3">
                <Stat k={t('ui.unemp.record')} v={`${stint.wins}-${stint.draws}-${stint.losses}`} />
                <Stat k={t('ui.unemp.best')} v={stint.bestPosition ? t('ui.ordinal', { n: stint.bestPosition }) : '—'} />
                <Stat k={t('ui.unemp.trophies')} v={stint.trophies} />
                <Stat k={t('ui.unemp.signings')} v={stint.signings} />
                <Stat k={t('ui.unemp.legends')} v={stint.legends} />
                <Stat k={t('ui.unemp.compensation')} v={formatMoney(stint.compensation)} />
              </div>
            </Panel>
          )}
          <Panel title={t('ui.career.offers', { n: g.jobOffers.length })} flush>
            {g.jobOffers.length === 0 && <div className="dim" style={{ padding: 12 }}>{t('ui.unemp.noOffers')}</div>}
            {g.jobOffers.map((o) => {
              const oc = o.clubId ? g.clubs[o.clubId] : null;
              return (
                <div key={o.id} className="row nw" style={{ padding: '10px 12px', borderBottom: '1px solid var(--line)' }}>
                  {oc ? <Crest club={oc} size={34} /> : <Flag code={o.nationalTeam ?? ''} size={34} />}
                  <div style={{ minWidth: 0 }}>
                    <div className="b ellipsis link" onClick={() => oc && openClub(oc.id)}>
                      {oc ? oc.name : t('ui.career.nationalTeam', { team: countryName(o.nationalTeam ?? '') })}
                    </div>
                    <div className="faint" style={{ fontSize: 12 }}>
                      {oc ? `${displayName(g.leagues[oc.leagueId].name)} · ${t('ui.repN', { n: oc.reputation })}` : t('ui.career.ntHint')} · {t('ui.career.expires', { n: Math.max(0, o.expiresDay - g.day) })}
                    </div>
                  </div>
                  <span className="spacer" />
                  <button
                    className="btn sm acc"
                    data-accept-offer
                    onClick={() => {
                      mutate((s) => acceptJob(s, o.id, new Rng(s.rngState ^ 0x10b)));
                      notify(oc ? t('ui.career.welcome', { club: oc.name }) : t('ui.career.ntAccepted'));
                      setView('hub');
                    }}
                  >
                    {t('ui.accept')}
                  </button>
                  <button className="btn sm ghost" onClick={() => mutate((s) => (s.jobOffers = s.jobOffers.filter((x) => x.id !== o.id)))}>
                    {t('ui.reject')}
                  </button>
                </div>
              );
            })}
            <div className="row" style={{ padding: 12 }}>
              <button className="btn" disabled={busy} data-wait-offers onClick={wait}>
                {busy ? t('ui.simulating') : t('ui.unemp.wait')}
              </button>
              <span className="faint" style={{ fontSize: 12 }}>
                {t('ui.unemp.waitHint')}
              </span>
            </div>
          </Panel>
        </div>
        <div className="grid">
          <Panel title={t('ui.unemp.apply', { n: openApplications(g) })}>
            <p className="dim" style={{ marginTop: 0, fontSize: 13 }}>
              {t('ui.unemp.applyHint')}
            </p>
            {apps.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                {apps.map((a) => (
                  <div key={a.id} className="week-item" style={{ fontSize: 13 }}>
                    <span className="ico">⏳</span>
                    <span>{t('ui.unemp.pending', { club: g.clubs[a.clubId]?.name ?? '?', n: Math.max(0, a.replyDay - g.day) })}</span>
                  </div>
                ))}
              </div>
            )}
            {targets.map((c) => {
              const odds = applicationOdds(g, c.id);
              const sent = apps.some((a) => a.clubId === c.id);
              return (
                <div key={c.id} className="deal-row" data-apply={c.id}>
                  <Crest club={c} size={26} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="ellipsis b link" onClick={() => openClub(c.id)}>
                      {c.name}
                    </div>
                    <div className="faint" style={{ fontSize: 11 }}>
                      {displayName(g.leagues[c.leagueId].name)} · {t('ui.unemp.odds', { n: Math.round(odds * 100) })}
                    </div>
                    <Meter value={odds * 100} />
                  </div>
                  <button
                    className="btn sm"
                    disabled={sent}
                    onClick={() => {
                      const r = mutate((s) => applyForJob(s, c.id, new Rng(s.rngState ^ (s.day * 31))));
                      notify(r.ok ? t('ui.unemp.sent', { club: c.name }) : t(`ui.unemp.err.${r.reason ?? 'noClub'}`));
                    }}
                  >
                    {sent ? t('ui.unemp.sentShort') : t('ui.unemp.applyBtn')}
                  </button>
                </div>
              );
            })}
          </Panel>
          <Panel title={t('ui.unemp.tipsTitle')}>
            <p className="dim" style={{ margin: 0, fontSize: 13 }}>
              {t('ui.unemp.tips')}
            </p>
          </Panel>
        </div>
      </div>
    </>
  );
}
