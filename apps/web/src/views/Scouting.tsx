import {
  COUNTRIES,
  COUNTRY_BY_CODE,
  POSITIONS,
  Rng,
  countryName,
  errorMarginFor,
  formatMoney,
  fullName,
  knowledgeOf,
  positionName,
  reportDurationFor,
  startAssignment,
  t,
  tm,
  type Position,
  type ScoutReport,
} from '@pitchside/core';
import { useState } from 'react';
import { mix, WorldMap } from '../components/WorldMap';
import { Attr, Flag, Meter, Panel, PosBadge, StatGrid, ViewHead } from '../components/ui';
import { useGame, useGameState } from '../store/game';

const UK = ['ENG', 'SCO', 'WAL', 'NIR'];

export function Scouting() {
  const g = useGameState();
  const { mutate, notify, openPlayer } = useGame();
  const club = g.clubs[g.userClubId as string];
  const scouts = club.scoutIds.map((id) => g.scouts[id]).filter(Boolean);
  const [scoutId, setScoutId] = useState(scouts[0]?.id ?? '');
  const [country, setCountry] = useState(club.countryCode);
  const [position, setPosition] = useState<Position>('ST');
  const [maxAge, setMaxAge] = useState<number | ''>('');
  const scout = g.scouts[scoutId];
  const assignments = Object.values(g.scoutAssignments).filter((a) => a.clubId === club.id);
  const active = assignments.filter((a) => !a.done);
  const reports = Object.values(g.scoutReports).filter((r) => assignments.some((a) => a.id === r.assignmentId) && g.players[r.playerId]);
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#00d27a';
  const busyScout = (id: string) => active.some((a) => a.scoutId === id);
  const c = COUNTRY_BY_CODE[country];
  const rt = g.countries[country];
  const clubsIn = rt.leagueIds.reduce((s, id) => s + g.leagues[id].clubIds.length, 0);

  const send = () => {
    try {
      mutate((s) => startAssignment(s, new Rng(s.rngState ^ 0xabc ^ s.day), { scoutId, clubId: club.id, countryCode: country, position, maxAge: maxAge === '' ? null : maxAge }));
      notify(t('ui.sc.sent', { scout: `${scout.firstName} ${scout.lastName}`, country: countryName(country), pos: positionName(position) }));
    } catch (e) {
      notify(t((e as Error).message));
    }
  };

  return (
    <>
      <ViewHead
        title={t('ui.sc.title')}
        meta={t('ui.sc.meta', { scouts: scouts.length, active: active.length, reports: reports.length })}
        tools={
          <select value={scoutId} onChange={(e) => setScoutId(e.target.value)}>
            {scouts.map((s) => (
              <option key={s.id} value={s.id}>
                {t('ui.sc.mapOf', { scout: `${s.firstName} ${s.lastName}` })}
              </option>
            ))}
          </select>
        }
      />
      <div className="grid c-main" style={{ marginBottom: 12 }}>
        <WorldMap
          height={540}
          selected={UK.includes(country) ? 'ENG' : country}
          onSelect={setCountry}
          fill={(code) => {
            const k = scout ? knowledgeOf(scout, code) : 0;
            return k > 0 ? mix('#1f2a2a', accent, 0.25 + (k / 100) * 0.75) : '#1b1f27';
          }}
          markers={active.map((a) => ({ code: UK.includes(a.countryCode) ? 'ENG' : a.countryCode, color: '#ffb547', label: a.kind === 'player' ? '★' : a.position }))}
          tooltip={(code) => (
            <div className="row nw">
              <Flag code={code} size={18} />
              <span className="b">{countryName(code)}</span>
              {scout && <span className="dim">{t('ui.sc.tooltip', { k: knowledgeOf(scout, code), m: errorMarginFor(scout, code) })}</span>}
            </div>
          )}
          legend={
            <>
              <div>{t('ui.sc.legend')}</div>
              <div className="ramp" style={{ background: `linear-gradient(90deg, #1b1f27, ${accent})` }} />
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span>{t('ui.sc.legendLo')}</span>
                <span>{t('ui.sc.legendHi')}</span>
              </div>
            </>
          }
        />
        <Panel title={t('ui.sc.mission')}>
          <div className="row nw" style={{ marginBottom: 10 }}>
            <Flag code={country} size={42} />
            <div style={{ minWidth: 0 }}>
              <div className="disp ellipsis" style={{ fontSize: 24, fontStyle: 'italic' }}>
                {countryName(country)}
              </div>
              <div className="dim" style={{ fontSize: 12 }}>
                {t('ui.sc.countryInfo', { conf: c.confederation, div: rt.leagueIds.length, clubs: clubsIn, q: c.quality })}
              </div>
            </div>
          </div>
          {UK.includes(country) ? (
            <div className="chips" style={{ marginBottom: 10 }}>
              {UK.map((u) => (
                <button key={u} className={`chip ${country === u ? 'on' : ''}`} onClick={() => setCountry(u)}>
                  <Flag code={u} size={16} /> {countryName(u)}
                </button>
              ))}
            </div>
          ) : null}
          <div className="grid">
            <div className="field">
              <label>{t('ui.sc.scout')}</label>
              <select value={scoutId} onChange={(e) => setScoutId(e.target.value)}>
                {scouts.map((s) => (
                  <option key={s.id} value={s.id} disabled={busyScout(s.id)}>
                    {s.firstName} {s.lastName} {busyScout(s.id) ? `(${t('ui.busy')})` : `· ${knowledgeOf(s, country)}%`}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid c2">
              <div className="field">
                <label>{t('ui.col.pos')}</label>
                <select value={position} onChange={(e) => setPosition(e.target.value as Position)}>
                  {POSITIONS.map((p) => (
                    <option key={p} value={p}>
                      {positionName(p)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>{t('ui.tr.maxAge')}</label>
                <input type="number" placeholder={t('ui.sc.noLimit')} value={maxAge} onChange={(e) => setMaxAge(e.target.value === '' ? '' : Number(e.target.value))} />
              </div>
            </div>
            {scout && (
              <div className="grid c3" style={{ background: 'var(--panel-2)', padding: 10 }}>
                <div>
                  <div className="faint" style={{ fontSize: 11 }}>
                    {t('ui.sc.knowledge')}
                  </div>
                  <div className="disp" style={{ fontSize: 22 }}>
                    {knowledgeOf(scout, country)}%
                  </div>
                </div>
                <div>
                  <div className="faint" style={{ fontSize: 11 }}>
                    {t('ui.sc.margin')}
                  </div>
                  <div className="disp" style={{ fontSize: 22 }}>
                    ±{errorMarginFor(scout, country)}
                  </div>
                </div>
                <div>
                  <div className="faint" style={{ fontSize: 11 }}>
                    {t('ui.sc.report')}
                  </div>
                  <div className="disp" style={{ fontSize: 22 }}>
                    {t('ui.daysShort', { n: reportDurationFor(scout, country) })}
                  </div>
                </div>
              </div>
            )}
            <div className="faint" style={{ fontSize: 12 }}>
              {t('ui.sc.profile', { profile: t(`ui.region.${c.profile}`) })}
            </div>
            <button className="btn primary" disabled={!scout || busyScout(scoutId)} onClick={send}>
              {t('ui.sc.send')}
            </button>
            <select value={country} onChange={(e) => setCountry(e.target.value)}>
              {[...COUNTRIES]
                .sort((a, b) => countryName(a.code).localeCompare(countryName(b.code)))
                .map((x) => (
                  <option key={x.code} value={x.code}>
                    {countryName(x.code)}
                  </option>
                ))}
            </select>
          </div>
        </Panel>
      </div>
      <div className="grid c3" style={{ marginBottom: 12 }}>
        {scouts.map((s) => {
          const mission = active.find((a) => a.scoutId === s.id);
          const top = Object.entries(s.countryKnowledge)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
          return (
            <Panel
              key={s.id}
              title={`${s.firstName} ${s.lastName}`}
              actions={mission ? <span className="tag warn">{t('ui.sc.inCountry', { country: countryName(mission.countryCode) })}</span> : <span className="tag good">{t('ui.available')}</span>}
            >
              <div className="grid c2" style={{ marginBottom: 8 }}>
                <div className="row">
                  <span className="dim">{t('ui.sc.judgeAbility')}</span>
                  <span className="spacer" />
                  <Attr v={s.judgeAbility} />
                </div>
                <div className="row">
                  <span className="dim">{t('ui.sc.judgePotential')}</span>
                  <span className="spacer" />
                  <Attr v={s.judgePotential} />
                </div>
              </div>
              {mission && (
                <div style={{ marginBottom: 8 }}>
                  <div className="row" style={{ fontSize: 12 }}>
                    {mission.kind === 'player' && mission.targetPlayerId ? (
                      <span className="link" onClick={() => openPlayer(mission.targetPlayerId as string)}>
                        ★ {g.players[mission.targetPlayerId] ? fullName(g.players[mission.targetPlayerId]) : '?'}
                      </span>
                    ) : (
                      <PosBadge pos={mission.position} />
                    )}
                    <span className="dim">±{mission.errorMargin}</span>
                    <span className="spacer" />
                    {t('ui.sc.progress', { a: mission.daysElapsed, b: mission.durationDays })}
                  </div>
                  <Meter value={(mission.daysElapsed / mission.durationDays) * 100} color="var(--warn)" />
                </div>
              )}
              {top.map(([code, k]) => (
                <div key={code} className="row nw" style={{ fontSize: 12, padding: '2px 0' }}>
                  <Flag code={code} size={16} />
                  <span className="ellipsis" style={{ width: 120 }}>
                    {countryName(code)}
                  </span>
                  <div style={{ flex: 1 }}>
                    <Meter value={k} />
                  </div>
                  <span style={{ width: 34, textAlign: 'right' }}>{k}%</span>
                </div>
              ))}
            </Panel>
          );
        })}
      </div>
      <Panel title={t('ui.sc.reports')} flush>
        <StatGrid<ScoutReport>
          rows={reports}
          rowKey={(r) => r.id}
          onOpen={(r) => openPlayer(r.playerId)}
          initialSort={{ key: 'ovr', dir: -1 }}
          columns={[
            {
              key: 'rec',
              label: t('ui.col.rec'),
              render: (r) => <span className={`tag ${r.recommendation === 'A' ? 'good' : r.recommendation === 'B' ? 'acc' : r.recommendation === 'C' ? 'warn' : 'bad'}`}>{r.recommendation}</span>,
              sort: (r) => r.recommendation,
            },
            { key: 'pos', label: t('ui.col.pos'), render: (r) => <PosBadge pos={r.position} /> },
            {
              key: 'name',
              label: t('ui.col.player'),
              render: (r) => (
                <span className="link b" onClick={() => openPlayer(r.playerId)}>
                  {fullName(g.players[r.playerId])}
                  {r.analysis ? ' ★' : ''}
                </span>
              ),
              sort: (r) => g.players[r.playerId].lastName,
            },
            { key: 'age', label: t('ui.col.age'), num: true, render: (r) => g.players[r.playerId].age, sort: (r) => g.players[r.playerId].age },
            {
              key: 'ctry',
              label: t('ui.col.country'),
              render: (r) => (
                <span className="row nw">
                  <Flag code={r.countryCode} size={16} />
                  {countryName(r.countryCode)}
                </span>
              ),
            },
            { key: 'ovr', label: t('ui.col.estOvr'), num: true, render: (r) => <Attr v={r.estimatedOverall} margin={r.errorMargin} />, sort: (r) => r.estimatedOverall },
            { key: 'pot', label: t('ui.col.potential'), num: true, render: (r) => `${r.potentialRange[0]}–${r.potentialRange[1]}`, sort: (r) => r.potentialRange[1] },
            { key: 'val', label: t('ui.col.estValue'), num: true, render: (r) => formatMoney(r.estimatedValue), sort: (r) => r.estimatedValue },
            { key: 'notes', label: t('ui.col.notes'), render: (r) => <span className="faint" style={{ fontSize: 12 }}>{tm(r.notes)}</span> },
          ]}
        />
      </Panel>
    </>
  );
}
