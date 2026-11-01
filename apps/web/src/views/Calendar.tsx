// Monthly calendar (July–June) with every fixture of your club and "sim to this date".
import {
  CALENDAR,
  MONTH_LENGTHS,
  clubFixtures,
  cupDaysFor,
  formatGameDateLong,
  gameDate,
  monthName,
  monthOfDay,
  monthStartDay,
  t,
  weekdayShort,
  type Fixture,
} from '@pitchside/core';
import { useState } from 'react';
import { Crest, Panel, ViewHead } from '../components/ui';
import { compName } from '../lib/labels';
import { useGame, useGameState } from '../store/game';

export function Calendar() {
  const g = useGameState();
  const { simToDate, busy } = useGame();
  const club = g.clubs[g.userClubId as string];
  const [month, setMonth] = useState(monthOfDay(Math.min(g.day, 364)));
  const [picked, setPicked] = useState<number | null>(null);
  const [stopAtMatch, setStopAtMatch] = useState(true);

  const fixtures = clubFixtures(g, club.id);
  const byDay = new Map<number, { fixture: Fixture; competitionName: ReturnType<typeof clubFixtures>[number]['competitionName']; kind: string }[]>();
  for (const f of fixtures) byDay.set(f.fixture.day, [...(byDay.get(f.fixture.day) ?? []), f]);
  const cupDays = new Set(cupDaysFor(g, club.id));
  const start = monthStartDay(month);
  const len = MONTH_LENGTHS[month];
  // Monday-based offset of the first day of the month.
  const firstWeekday = (gameDate(g.season, start).getUTCDay() + 6) % 7;
  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: len }, (_, i) => start + i)];
  while (cells.length % 7) cells.push(null);

  const monthFixtures = fixtures.filter((f) => f.fixture.day >= start && f.fixture.day < start + len);
  const inWindow = (d: number) => (d >= CALENDAR.summerWindow[0] && d <= CALENDAR.summerWindow[1]) || (d >= CALENDAR.winterWindow[0] && d <= CALENDAR.winterWindow[1]);

  const resultClass = (f: Fixture) => {
    if (!f.played) return '';
    const us = f.homeId === club.id ? f.homeGoals : f.awayGoals;
    const them = f.homeId === club.id ? f.awayGoals : f.homeGoals;
    const sw = f.shootoutWinnerId;
    if (us > them || (us === them && sw === club.id)) return 'w';
    if (us < them || (us === them && sw && sw !== club.id)) return 'l';
    return 'd';
  };

  return (
    <>
      <ViewHead
        title={t('ui.cal.title')}
        meta={t('ui.cal.meta', { n: fixtures.filter((f) => !f.fixture.played).length })}
        tools={
          <>
            <button className="btn" disabled={month === 0} onClick={() => setMonth((m) => m - 1)}>
              ‹
            </button>
            <span className="disp" style={{ fontSize: 20, minWidth: 180, textAlign: 'center', textTransform: 'capitalize' }}>
              {monthName(month, g.season)}
            </span>
            <button className="btn" disabled={month === 11} onClick={() => setMonth((m) => m + 1)}>
              ›
            </button>
            <button className="btn ghost" onClick={() => setMonth(monthOfDay(Math.min(g.day, 364)))}>
              {t('ui.cal.today')}
            </button>
          </>
        }
      />
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr) 300px' }}>
        <div className="cal">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="cal-h">
              {weekdayShort(i)}
            </div>
          ))}
          {cells.map((d, i) => {
            if (d === null) return <div key={`e${i}`} className="cal-cell empty" />;
            const fx = byDay.get(d) ?? [];
            const past = d < g.day;
            return (
              <div
                key={d}
                className={`cal-cell ${past ? 'past' : ''} ${d === g.day ? 'today' : ''} ${picked === d ? 'picked' : ''} ${inWindow(d) ? 'window' : ''}`}
                onClick={() => !past && setPicked(d)}
              >
                <div className="cal-d">{d - start + 1}</div>
                {fx.map(({ fixture: f, competitionName, kind }) => {
                  const rival = g.clubs[f.homeId === club.id ? f.awayId : f.homeId];
                  return (
                    <div key={f.id} className={`cal-fx ${kind} ${resultClass(f)}`} title={compName(competitionName)}>
                      <Crest club={rival} size={20} />
                      <span className="ha">{f.homeId === club.id ? t('ui.cal.home') : t('ui.cal.away')}</span>
                      {f.played ? (
                        <span className="b">
                          {f.homeId === club.id ? f.homeGoals : f.awayGoals}-{f.homeId === club.id ? f.awayGoals : f.homeGoals}
                        </span>
                      ) : (
                        <span className="ellipsis faint">{rival.shortName}</span>
                      )}
                    </div>
                  );
                })}
                {fx.length === 0 && cupDays.has(d) && <div className="cal-tag">{t('ui.cal.cupDay')}</div>}
                {d === CALENDAR.summerWindow[1] || d === CALENDAR.winterWindow[1] ? <div className="cal-tag warn">{t('ui.cal.deadline')}</div> : null}
                {d === CALENDAR.seasonEndDay && <div className="cal-tag">{t('ui.cal.seasonEnd')}</div>}
              </div>
            );
          })}
        </div>
        <div className="grid" style={{ alignContent: 'start' }}>
          <Panel title={t('ui.cal.jump')}>
            {picked !== null ? (
              <>
                <div className="b" style={{ textTransform: 'capitalize' }}>
                  {formatGameDateLong(g.season, picked)}
                </div>
                <label className="toggle" style={{ margin: '8px 0' }}>
                  <input type="checkbox" checked={stopAtMatch} onChange={(e) => setStopAtMatch(e.target.checked)} />
                  <span>{t('ui.cal.stopAtMatch')}</span>
                </label>
                <button className="btn-go" disabled={busy} onClick={() => void simToDate(g.season, picked, stopAtMatch).then(() => setPicked(null))}>
                  {t('ui.cal.simTo')}
                </button>
              </>
            ) : (
              <div className="dim">{t('ui.cal.pickDay')}</div>
            )}
          </Panel>
          <Panel title={t('ui.cal.thisMonth')} flush>
            {monthFixtures.length === 0 && <div className="dim" style={{ padding: 10 }}>{t('ui.cal.noMatches')}</div>}
            {monthFixtures.map(({ fixture: f, competitionName }) => {
              const rival = g.clubs[f.homeId === club.id ? f.awayId : f.homeId];
              return (
                <div key={f.id} className={`row nw cal-list ${resultClass(f)}`}>
                  <span className="faint" style={{ width: 22 }}>
                    {f.day - start + 1}
                  </span>
                  <Crest club={rival} size={20} />
                  <span className="ellipsis link" onClick={() => useGame.getState().openClub(rival.id)}>
                    {rival.name}
                  </span>
                  <span className="spacer" />
                  <span className="faint ellipsis" style={{ fontSize: 11, maxWidth: 90 }}>
                    {compName(competitionName)}
                  </span>
                  <span className="b">{f.played ? `${f.homeId === club.id ? f.homeGoals : f.awayGoals}-${f.homeId === club.id ? f.awayGoals : f.homeGoals}` : f.homeId === club.id ? t('ui.cal.home') : t('ui.cal.away')}</span>
                </div>
              );
            })}
          </Panel>
          <Panel title={t('ui.cal.legend')}>
            <div className="row" style={{ flexWrap: 'wrap', fontSize: 12, gap: 8 }}>
              <span className="cal-fx league">{t('ui.cal.league')}</span>
              <span className="cal-fx cup">{t('ui.cal.cup')}</span>
              <span className="cal-fx continental">{t('ui.cal.continental')}</span>
              <span className="cal-cell window legend">{t('ui.cal.window')}</span>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
