import {
  COUNTRIES,
  COUNTRY_BY_CODE,
  computeTable,
  countryName,
  displayName,
  formatGameDate,
  fullName,
  groupTable,
  refereeName,
  t,
  tm,
  userManager,
  type ContinentalComp,
  type IntlFixture,
  type IntlTournament,
  type Player,
  type Referee,
  type TableRow,
} from '@pitchside/core';
import { useState } from 'react';
import { Attr, ClubName, Crest, Face, Flag, Panel, StatGrid, SubTabs, ViewHead } from '../components/ui';
import { useGame, useGameState } from '../store/game';

type Tab = 'table' | 'fixtures' | 'cup' | 'continental' | 'international' | 'stats' | 'awards' | 'referees' | 'honours';

export function Competition() {
  const g = useGameState();
  const openClub = useGame((s) => s.openClub);
  const me = g.userClubId ? g.clubs[g.userClubId] : null;
  const mgr = userManager(g);
  const startCountry = me?.countryCode ?? mgr?.nationality ?? 'ENG';
  const [country, setCountry] = useState(startCountry);
  const [leagueId, setLeagueId] = useState(me?.leagueId ?? g.countries[startCountry].leagueIds[0]);
  const [tab, setTab] = useState<Tab>('table');
  const rt = g.countries[country];
  const league = g.leagues[rt.leagueIds.includes(leagueId) ? leagueId : rt.leagueIds[0]];
  const table = computeTable(league);
  const size = table.length;
  const cup = rt.cupId ? g.cups[rt.cupId] : null;
  const zone = (i: number) =>
    league.promotionSlots && i <= league.promotionSlots ? 'var(--good)' : league.relegationSlots && i > size - league.relegationSlots ? 'var(--bad)' : i === 1 ? 'var(--gold)' : 'transparent';
  const confed = COUNTRY_BY_CODE[country].confederation;

  return (
    <>
      <ViewHead
        title={t('ui.nav.competition')}
        meta={
          <span className="row">
            <Flag code={country} size={16} /> {countryName(country)} · {t('ui.comp.leagueRep', { n: league.reputation })}
          </span>
        }
        tools={
          <>
            <select
              value={country}
              onChange={(e) => {
                setCountry(e.target.value);
                setLeagueId(g.countries[e.target.value].leagueIds[0]);
              }}
            >
              {[...COUNTRIES]
                .sort((a, b) => countryName(a.code).localeCompare(countryName(b.code)))
                .map((c) => (
                  <option key={c.code} value={c.code}>
                    {countryName(c.code)}
                  </option>
                ))}
            </select>
            <select value={league.id} onChange={(e) => setLeagueId(e.target.value)}>
              {rt.leagueIds.map((id) => (
                <option key={id} value={id}>
                  {displayName(g.leagues[id].name)}
                </option>
              ))}
            </select>
          </>
        }
      />
      <SubTabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'table', label: t('ui.comp.table') },
          { id: 'fixtures', label: t('ui.comp.fixtures') },
          { id: 'cup', label: cup ? displayName(cup.name) : t('ui.comp.cup') },
          { id: 'continental', label: t('ui.comp.continental', { confed }) },
          { id: 'international', label: t('ui.comp.international') },
          { id: 'stats', label: t('ui.comp.stats') },
          { id: 'awards', label: t('ui.comp.awards') },
          { id: 'referees', label: t('ui.comp.referees') },
          { id: 'honours', label: t('ui.comp.honours') },
        ]}
      />
      {tab === 'table' && (
        <Panel title={displayName(league.name)} flush>
          <StatGrid<TableRow>
            rows={table}
            rowKey={(r) => r.clubId}
            onOpen={(r) => openClub(r.clubId)}
            rowClass={(r) => (r.clubId === me?.id ? 'me' : '')}
            maxHeight="none"
            columns={[
              {
                key: 'pos',
                label: '#',
                num: true,
                render: (r) => {
                  const i = table.indexOf(r) + 1;
                  return <span style={{ boxShadow: `inset -3px 0 0 ${zone(i)}`, paddingRight: 8 }}>{i}</span>;
                },
              },
              { key: 'c', label: t('ui.col.club'), render: (r) => <ClubName club={g.clubs[r.clubId]} onOpen={openClub} /> },
              { key: 'pj', label: t('ui.tbl.p'), num: true, render: (r) => r.played },
              { key: 'g', label: t('ui.tbl.w'), num: true, render: (r) => r.won },
              { key: 'e', label: t('ui.tbl.d'), num: true, render: (r) => r.drawn },
              { key: 'p', label: t('ui.tbl.l'), num: true, render: (r) => r.lost },
              { key: 'gf', label: t('ui.tbl.gf'), num: true, render: (r) => r.gf },
              { key: 'gc', label: t('ui.tbl.ga'), num: true, render: (r) => r.ga },
              { key: 'dg', label: t('ui.tbl.gd'), num: true, render: (r) => (r.gd > 0 ? `+${r.gd}` : r.gd) },
              { key: 'pts', label: t('ui.tbl.pts'), num: true, render: (r) => <span className="b" style={{ fontSize: 15 }}>{r.points}</span> },
              { key: 'ded', label: t('ui.tbl.ded'), num: true, render: (r) => (r.deduction ? <span className="bad">-{r.deduction}</span> : '') },
              {
                key: 'form',
                label: t('ui.tbl.form'),
                render: (r) => (
                  <span className="row nw" style={{ gap: 3 }}>
                    {r.form.map((f, i) => (
                      <span key={i} className={`form-chip ${f}`}>
                        {t(`ui.form.${f}`)}
                      </span>
                    ))}
                  </span>
                ),
              },
            ]}
          />
          <div className="row faint" style={{ fontSize: 11, padding: 8, gap: 14 }}>
            <span>
              <span className="legend-dot" style={{ background: 'var(--good)' }} /> {t('ui.comp.promotion')}
            </span>
            <span>
              <span className="legend-dot" style={{ background: 'var(--bad)' }} /> {t('ui.comp.relegation')}
            </span>
          </div>
        </Panel>
      )}
      {tab === 'fixtures' && (
        <Panel title={t('ui.comp.fixtures')} flush>
          <StatGrid
            rows={league.fixtures}
            rowKey={(f) => f.id}
            rowClass={(f) => (f.homeId === me?.id || f.awayId === me?.id ? 'me' : '')}
            columns={[
              { key: 'r', label: t('ui.tbl.round'), num: true, render: (f) => f.round, sort: (f) => f.round },
              { key: 'd', label: t('ui.col.date'), render: (f) => formatGameDate(g.season, f.day), sort: (f) => f.day },
              { key: 'h', label: t('ui.col.home'), render: (f) => <ClubName club={g.clubs[f.homeId]} onOpen={openClub} size={18} /> },
              { key: 's', label: '', render: (f) => (f.played ? <span className="b">{f.homeGoals} – {f.awayGoals}</span> : <span className="faint">{t('ui.match.vs')}</span>) },
              { key: 'a', label: t('ui.col.away'), render: (f) => <ClubName club={g.clubs[f.awayId]} onOpen={openClub} size={18} /> },
              { key: 'ref', label: t('ui.col.referee'), render: (f) => (f.refereeId && g.referees[f.refereeId] ? refereeName(g.referees[f.refereeId]) : '') },
              { key: 'att', label: t('ui.col.attendance'), num: true, render: (f) => (f.attendance ? f.attendance.toLocaleString() : '') },
            ]}
          />
        </Panel>
      )}
      {tab === 'cup' && cup && (
        <div className="grid c3">
          {cup.rounds.length === 0 && <Panel title={displayName(cup.name)}>{t('ui.comp.cupDraw', { date: formatGameDate(g.season, cup.roundDays[0] ?? 0) })}</Panel>}
          {cup.rounds.map((r) => (
            <Panel key={r.day} title={`${tm(r.name)} · ${formatGameDate(g.season, r.day)}`}>
              {r.fixtures.map((f) => (
                <KoRow key={f.id} homeId={f.homeId} awayId={f.awayId} played={f.played} hg={f.homeGoals} ag={f.awayGoals} sw={f.shootoutWinnerId} />
              ))}
            </Panel>
          ))}
          {cup.winnerId && (
            <Panel title={t('ui.comp.champion')}>
              <ClubName club={g.clubs[cup.winnerId]} onOpen={openClub} size={40} />
            </Panel>
          )}
        </div>
      )}
      {tab === 'continental' && <Continental confed={confed} />}
      {tab === 'international' && <International />}
      {tab === 'stats' && <LeagueStats leagueId={league.id} />}
      {tab === 'awards' && <Awards leagueId={league.id} />}
      {tab === 'referees' && (
        <Panel title={t('ui.comp.refereeBody')} flush>
          <StatGrid<Referee>
            rows={rt.refereeIds.map((id) => g.referees[id]).filter(Boolean)}
            rowKey={(r) => r.id}
            initialSort={{ key: 'rep', dir: -1 }}
            columns={[
              { key: 'n', label: t('ui.col.referee'), render: (r) => refereeName(r), sort: (r) => r.lastName },
              { key: 'rep', label: t('ui.col.rep'), num: true, render: (r) => r.reputation, sort: (r) => r.reputation },
              { key: 'acc', label: t('ui.ref.accuracy'), num: true, render: (r) => <Attr v={r.accuracy} />, sort: (r) => r.accuracy },
              { key: 'rig', label: t('ui.ref.rigor'), num: true, render: (r) => r.rigor, sort: (r) => r.rigor },
              { key: 'per', label: t('ui.ref.lenient'), num: true, render: (r) => r.permissiveness, sort: (r) => r.permissiveness },
              { key: 'res', label: t('ui.ref.pressure'), num: true, render: (r) => <Attr v={r.homePressureResistance} />, sort: (r) => r.homePressureResistance },
              { key: 'pj', label: t('ui.col.apps'), num: true, render: (r) => r.stats.matches, sort: (r) => r.stats.matches },
              { key: 'y', label: t('ui.stat.yellows'), num: true, render: (r) => r.stats.yellows, sort: (r) => r.stats.yellows },
              { key: 'rd', label: t('ui.stat.reds'), num: true, render: (r) => r.stats.reds, sort: (r) => r.stats.reds },
              { key: 'pen', label: t('ui.ref.penalties'), num: true, render: (r) => r.stats.penalties, sort: (r) => r.stats.penalties },
              { key: 'err', label: t('ui.ref.errors'), num: true, render: (r) => r.stats.errors, sort: (r) => r.stats.errors },
              { key: 'pol', label: t('ui.ref.controversies'), num: true, render: (r) => <span className={r.stats.controversies > 3 ? 'bad' : ''}>{r.stats.controversies}</span>, sort: (r) => r.stats.controversies },
            ]}
          />
        </Panel>
      )}
      {tab === 'honours' && (
        <div className="grid c2">
          <Panel title={displayName(league.name)}>
            {league.champions.length === 0 && <span className="dim">{t('ui.comp.noChampions')}</span>}
            {[...league.champions].reverse().map((c) => (
              <div key={c.season} className="row" style={{ padding: '3px 0' }}>
                <span className="tag warn">{c.season}</span>
                <ClubName club={g.clubs[c.clubId]} onOpen={openClub} />
              </div>
            ))}
          </Panel>
          {cup && (
            <Panel title={displayName(cup.name)}>
              {cup.history.length === 0 && <span className="dim">{t('ui.comp.noChampions')}</span>}
              {[...cup.history].reverse().map((c) => (
                <div key={c.season} className="row" style={{ padding: '3px 0' }}>
                  <span className="tag warn">{c.season}</span>
                  <ClubName club={g.clubs[c.clubId]} onOpen={openClub} />
                </div>
              ))}
            </Panel>
          )}
          <Panel title={t('ui.comp.topScorers')}>
            {league.topScorers.length === 0 && <span className="dim">{t('ui.comp.noChampions')}</span>}
            {[...league.topScorers].reverse().map((s) => (
              <div key={s.season} className="row" style={{ padding: '3px 0' }}>
                <span className="tag">{s.season}</span>
                <span className="link" onClick={() => useGame.getState().openPlayer(s.playerId)}>
                  {g.players[s.playerId] ? fullName(g.players[s.playerId]) : '?'}
                </span>
                <span className="spacer" />
                <span className="b">{s.goals}</span>
              </div>
            ))}
          </Panel>
        </div>
      )}
    </>
  );
}

function KoRow({ homeId, awayId, played, hg, ag, sw }: { homeId: string; awayId: string; played: boolean; hg: number; ag: number; sw: string | null }) {
  const g = useGameState();
  const home = g.clubs[homeId];
  const away = g.clubs[awayId];
  if (!home || !away) return null;
  const hw = hg > ag || sw === homeId;
  return (
    <div className="row nw" style={{ padding: '3px 0', fontSize: 13 }}>
      <Crest club={home} size={18} />
      <span className={`ellipsis ${played && hw ? 'b' : 'dim'}`} style={{ flex: 1 }}>
        {home.name}
      </span>
      <span className="b">
        {played ? `${hg}-${ag}` : t('ui.match.vs')}
        {sw ? ` (${t('ui.comp.pens')})` : ''}
      </span>
      <span className={`ellipsis ${played && !hw ? 'b' : 'dim'}`} style={{ flex: 1, textAlign: 'right' }}>
        {away.name}
      </span>
      <Crest club={away} size={18} />
    </div>
  );
}

function Continental({ confed }: { confed: string }) {
  const g = useGameState();
  const openClub = useGame((s) => s.openClub);
  const comps = Object.values(g.continental).filter((c) => c.confed === confed);
  const [id, setId] = useState(comps[0]?.id ?? '');
  const comp: ContinentalComp | undefined = g.continental[id] ?? comps[0];
  if (!comp) return <Panel title={t('ui.comp.continental', { confed })}>{t('ui.comp.noContinental')}</Panel>;
  return (
    <>
      <div className="chips" style={{ marginBottom: 10 }}>
        {comps.map((c) => (
          <button key={c.id} className={`chip ${c.id === comp.id ? 'on' : ''}`} onClick={() => setId(c.id)}>
            {tm(c.name)}
          </button>
        ))}
      </div>
      {comp.winnerId && (
        <Panel title={t('ui.comp.champion')} style={{ marginBottom: 10 }}>
          <ClubName club={g.clubs[comp.winnerId]} onOpen={openClub} size={40} />
        </Panel>
      )}
      <div className="grid c4">
        {comp.groups.map((gr, i) => (
          <Panel key={i} title={t('ui.comp.group', { g: String.fromCharCode(65 + i) })} flush>
            <table className="tbl">
              <tbody>
                {groupTable(gr).map((r, idx) => (
                  <tr key={r.clubId} className={g.clubs[r.clubId]?.isUser ? 'me' : ''}>
                    <td className="n faint" style={{ width: 20 }}>
                      {idx + 1}
                    </td>
                    <td>{g.clubs[r.clubId] && <ClubName club={g.clubs[r.clubId]} onOpen={openClub} size={16} />}</td>
                    <td className="n dim">{r.played}</td>
                    <td className="n b">{r.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        ))}
      </div>
      <div className="grid c3" style={{ marginTop: 10 }}>
        {comp.knockout.map((r) => (
          <Panel key={r.day} title={`${tm(r.name)} · ${formatGameDate(g.season, r.day)}`}>
            {r.fixtures.map((f) => (
              <KoRow key={f.id} homeId={f.homeId} awayId={f.awayId} played={f.played} hg={f.homeGoals} ag={f.awayGoals} sw={f.shootoutWinnerId} />
            ))}
          </Panel>
        ))}
      </div>
      {comp.history.length > 0 && (
        <Panel title={t('ui.comp.honours')} style={{ marginTop: 10 }}>
          {[...comp.history].reverse().map((h) => (
            <div key={h.season} className="row" style={{ padding: '3px 0' }}>
              <span className="tag warn">{h.season}</span>
              {g.clubs[h.clubId] && <ClubName club={g.clubs[h.clubId]} onOpen={openClub} />}
            </div>
          ))}
        </Panel>
      )}
    </>
  );
}

function IntlRow({ f }: { f: IntlFixture }) {
  const hw = f.hg > f.ag || f.shootoutWinner === f.home;
  return (
    <div className="row nw" style={{ padding: '3px 0', fontSize: 13 }}>
      <Flag code={f.home} size={18} />
      <span className={`ellipsis ${f.played && hw ? 'b' : 'dim'}`} style={{ flex: 1 }}>
        {countryName(f.home)}
      </span>
      <span className="b">
        {f.played ? `${f.hg}-${f.ag}` : t('ui.match.vs')}
        {f.shootoutWinner ? ` (${t('ui.comp.pens')})` : ''}
      </span>
      <span className={`ellipsis ${f.played && !hw ? 'b' : 'dim'}`} style={{ flex: 1, textAlign: 'right' }}>
        {countryName(f.away)}
      </span>
      <Flag code={f.away} size={18} />
    </div>
  );
}

function International() {
  const g = useGameState();
  const list = [...g.international.tournaments].reverse();
  const [id, setId] = useState(list[0]?.id ?? '');
  const tour: IntlTournament | undefined = list.find((x) => x.id === id) ?? list[0];
  const ranking = Object.entries(g.international.teams)
    .sort((a, b) => b[1].rating - a[1].rating)
    .slice(0, 30);
  return (
    <div className="grid c-main">
      <div>
        {!tour ? (
          <Panel title={t('ui.comp.international')}>{t('ui.comp.noIntl')}</Panel>
        ) : (
          <>
            <div className="chips" style={{ marginBottom: 10 }}>
              {list.slice(0, 8).map((x) => (
                <button key={x.id} className={`chip ${x.id === tour.id ? 'on' : ''}`} onClick={() => setId(x.id)}>
                  {tm(x.name)} {x.season + 1}
                </button>
              ))}
            </div>
            {tour.winner && (
              <Panel title={t('ui.comp.champion')} style={{ marginBottom: 10 }}>
                <div className="row">
                  <Flag code={tour.winner} size={40} />
                  <span className="disp" style={{ fontSize: 26 }}>
                    {countryName(tour.winner)}
                  </span>
                </div>
              </Panel>
            )}
            <div className="grid c3">
              {tour.groups.map((gr, i) => (
                <Panel key={i} title={t('ui.comp.group', { g: String.fromCharCode(65 + i) })}>
                  {gr.fixtures.map((f) => (
                    <IntlRow key={f.id} f={f} />
                  ))}
                </Panel>
              ))}
              {tour.knockout.map((r) => (
                <Panel key={r.day} title={tm(r.name)}>
                  {r.fixtures.map((f) => (
                    <IntlRow key={f.id} f={f} />
                  ))}
                </Panel>
              ))}
            </div>
          </>
        )}
      </div>
      <Panel title={t('ui.comp.ranking')} flush>
        {ranking.map(([code, info], i) => (
          <div key={code} className="row nw" style={{ padding: '4px 10px', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
            <span className="faint" style={{ width: 22 }}>
              {i + 1}
            </span>
            <Flag code={code} size={18} />
            <span className="ellipsis">{countryName(code)}</span>
            {info.userManaged && <span className="tag acc">{t('ui.comp.yours')}</span>}
            <span className="spacer" />
            <span className="b">{Math.round(info.rating)}</span>
          </div>
        ))}
      </Panel>
    </div>
  );
}

function LeagueStats({ leagueId }: { leagueId: string }) {
  const g = useGameState();
  const openPlayer = useGame((s) => s.openPlayer);
  const league = g.leagues[leagueId];
  const players: Player[] = league.clubIds.flatMap((cid) => g.clubs[cid].playerIds.map((id) => g.players[id])).filter((p) => p && !p.retired && p.stats.apps > 0);
  const top = (score: (p: Player) => number, n = 10) => [...players].sort((a, b) => score(b) - score(a)).slice(0, n);
  const avg = (p: Player) => (p.stats.apps >= 5 ? p.stats.ratingSum / p.stats.apps : 0);
  const list = (title: string, rows: Player[], val: (p: Player) => string) => (
    <Panel title={title} flush>
      {rows.map((p, i) => (
        <div key={p.id} className="row nw link" style={{ padding: '4px 10px', borderBottom: '1px solid var(--line)', fontSize: 13 }} onClick={() => openPlayer(p.id)}>
          <span className="faint" style={{ width: 18 }}>
            {i + 1}
          </span>
          <Face player={p} size={22} club={p.clubId ? g.clubs[p.clubId] : null} />
          <span className="ellipsis">{fullName(p)}</span>
          {p.clubId && <Crest club={g.clubs[p.clubId]} size={16} />}
          <span className="spacer" />
          <span className="b">{val(p)}</span>
        </div>
      ))}
    </Panel>
  );
  return (
    <div className="grid c4">
      {list(t('ui.comp.goals'), top((p) => p.stats.goals), (p) => String(p.stats.goals))}
      {list(t('ui.comp.assists'), top((p) => p.stats.assists), (p) => String(p.stats.assists))}
      {list(t('ui.comp.ratings'), top(avg), (p) => avg(p).toFixed(2))}
      {list(t('ui.comp.cleanSheets'), top((p) => (p.position === 'GK' ? p.stats.cleanSheets : -1)), (p) => String(p.stats.cleanSheets))}
    </div>
  );
}

function Awards({ leagueId }: { leagueId: string }) {
  const g = useGameState();
  const { openPlayer, openClub } = useGame();
  const awards = [...g.awards].filter((a) => !a.leagueId || a.leagueId === leagueId).reverse().slice(0, 80);
  if (awards.length === 0) return <Panel title={t('ui.comp.awards')}>{t('ui.comp.noAwards')}</Panel>;
  return (
    <Panel title={t('ui.comp.awards')} flush>
      {awards.map((a, i) => {
        const p = a.playerId ? g.players[a.playerId] : null;
        const c = a.clubId ? g.clubs[a.clubId] : null;
        const m = a.managerId ? g.managers[a.managerId] : null;
        return (
          <div key={i} className="row nw" style={{ padding: '6px 10px', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
            <span className="tag warn">{a.season}</span>
            <span className="b">{t(`ui.award.${a.kind}`, { month: a.month !== undefined ? a.month : '' })}</span>
            {p && (
              <span className="row nw link" onClick={() => openPlayer(p.id)}>
                <Face player={p} size={22} club={c} /> {fullName(p)}
              </span>
            )}
            {m && (
              <span>
                {m.firstName} {m.lastName}
              </span>
            )}
            {c && (
              <span className="link" onClick={() => openClub(c.id)}>
                <Crest club={c} size={18} />
              </span>
            )}
            <span className="spacer" />
            {a.value !== undefined && <span className="b">{Math.round(a.value * 100) / 100}</span>}
          </div>
        );
      })}
    </Panel>
  );
}
