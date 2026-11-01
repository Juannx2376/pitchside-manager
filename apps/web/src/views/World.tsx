import { COUNTRIES, COUNTRY_BY_CODE, clubPlayers, computeTable, countryName, displayName, squadStrength, t, userManager } from '@pitchside/core';
import { useEffect, useMemo, useState } from 'react';
import { mix, WorldMap } from '../components/WorldMap';
import { ClubName, Crest, Flag, OvrChip, Panel, StatGrid, ViewHead } from '../components/ui';
import { useGame, useGameState } from '../store/game';

type Metric = 'reputation' | 'econ' | 'clubs';
const UK = ['ENG', 'SCO', 'WAL', 'NIR'];

export function World() {
  const g = useGameState();
  const openClub = useGame((s) => s.openClub);
  const focus = useGame((s) => s.worldCountry);
  const me = g.userClubId ? g.clubs[g.userClubId] : null;
  const [country, setCountry] = useState(focus ?? me?.countryCode ?? userManager(g)?.nationality ?? 'ENG');
  const [metric, setMetric] = useState<Metric>('reputation');
  const [leagueId, setLeagueId] = useState<string | null>(null);
  useEffect(() => {
    if (focus) {
      setCountry(focus);
      setLeagueId(null);
      useGame.setState({ worldCountry: null });
    }
  }, [focus]);
  const rt = g.countries[country];
  const leagues = rt.leagueIds.map((id) => g.leagues[id]);
  const league = leagues.find((l) => l.id === leagueId) ?? leagues[0];
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#00d27a';

  const values = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of COUNTRIES) {
      const r = g.countries[c.code];
      const top = r.leagueIds[0] ? g.leagues[r.leagueIds[0]] : null;
      const v = metric === 'reputation' ? (top?.reputation ?? 0) / 100 : metric === 'econ' ? Math.sqrt(c.econ) : Math.min(1, r.leagueIds.reduce((s, id) => s + g.leagues[id].clubIds.length, 0) / 80);
      m.set(c.code, v);
    }
    return m;
  }, [g, metric]);

  const table = league ? computeTable(league) : [];
  const c = COUNTRY_BY_CODE[country];
  const pick = (code: string) => {
    setCountry(code);
    setLeagueId(null);
  };

  return (
    <>
      <ViewHead
        title={t('ui.nav.world')}
        meta={t('ui.world.meta')}
        tools={
          <div className="row">
            {(['reputation', 'econ', 'clubs'] as const).map((k) => (
              <button key={k} className={`btn sm ${metric === k ? 'on' : ''}`} onClick={() => setMetric(k)}>
                {t(`ui.world.metric.${k}`)}
              </button>
            ))}
          </div>
        }
      />
      <div className="grid c-main" style={{ marginBottom: 12 }}>
        <WorldMap
          height={480}
          selected={UK.includes(country) ? 'ENG' : country}
          onSelect={pick}
          fill={(code) => mix('#1b1f27', accent, 0.12 + (values.get(code) ?? 0) * 0.88)}
          tooltip={(code) => {
            const r = g.countries[code];
            const top = r.leagueIds[0] ? g.leagues[r.leagueIds[0]] : null;
            return (
              <div className="row nw">
                <Flag code={code} size={18} />
                <span className="b">{countryName(code)}</span>
                <span className="dim">{top ? `${displayName(top.name)} · ${t('ui.repN', { n: top.reputation })}` : ''}</span>
              </div>
            );
          }}
        />
        <Panel title={t('ui.world.federation')}>
          <div className="row nw" style={{ marginBottom: 10 }}>
            <Flag code={country} size={46} />
            <div>
              <div className="disp" style={{ fontSize: 26, fontStyle: 'italic' }}>
                {countryName(country)}
              </div>
              <div className="dim" style={{ fontSize: 12 }}>
                {t('ui.world.info', { conf: c.confederation, econ: c.econ, tax: (c.taxRate * 100).toFixed(0) })}
              </div>
            </div>
          </div>
          {UK.includes(country) && (
            <div className="chips" style={{ marginBottom: 10 }}>
              {UK.map((u) => (
                <button key={u} className={`chip ${country === u ? 'on' : ''}`} onClick={() => pick(u)}>
                  <Flag code={u} size={16} /> {countryName(u)}
                </button>
              ))}
            </div>
          )}
          {leagues.map((l) => {
            const real = l.clubIds.filter((id) => g.clubs[id].source === 'real').length;
            return (
              <div key={l.id} className="row nw link" style={{ padding: '7px 0', borderBottom: '1px solid var(--line)' }} onClick={() => setLeagueId(l.id)}>
                <span className="tag">{t('ui.world.tier', { n: l.tier })}</span>
                <span className={`ellipsis ${league?.id === l.id ? 'b' : ''}`}>{displayName(l.name)}</span>
                <span className="spacer" />
                <span className="faint" style={{ fontSize: 12 }}>
                  {t('ui.world.clubsN', { n: l.clubIds.length })}
                  {real < l.clubIds.length ? ` · ${t('ui.world.realN', { n: real })}` : ''}
                </span>
              </div>
            );
          })}
          <select style={{ marginTop: 10, width: '100%' }} value={country} onChange={(e) => pick(e.target.value)}>
            {[...COUNTRIES]
              .sort((a, b) => countryName(a.code).localeCompare(countryName(b.code)))
              .map((x) => (
                <option key={x.code} value={x.code}>
                  {countryName(x.code)}
                </option>
              ))}
          </select>
        </Panel>
      </div>
      {league && (
        <div className="grid c-main">
          <Panel title={t('ui.world.standings', { league: displayName(league.name) })} flush>
            <StatGrid
              rows={table}
              rowKey={(r) => r.clubId}
              onOpen={(r) => openClub(r.clubId)}
              rowClass={(r) => (r.clubId === me?.id ? 'me' : '')}
              columns={[
                { key: 'p', label: '#', num: true, render: (r) => table.indexOf(r) + 1 },
                { key: 'c', label: t('ui.col.club'), render: (r) => <ClubName club={g.clubs[r.clubId]} onOpen={openClub} /> },
                { key: 'pj', label: t('ui.tbl.p'), num: true, render: (r) => r.played },
                { key: 'dg', label: t('ui.tbl.gd'), num: true, render: (r) => r.gd },
                { key: 'pts', label: t('ui.tbl.pts'), num: true, render: (r) => <span className="b">{r.points}</span> },
                { key: 'lvl', label: t('ui.col.level'), num: true, render: (r) => <OvrChip v={squadStrength(clubPlayers(g, r.clubId))} /> },
              ]}
            />
          </Panel>
          <Panel title={t('ui.world.clubs')}>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))' }}>
              {league.clubIds.map((id) => {
                const cl = g.clubs[id];
                return (
                  <div key={id} className="tile click" style={{ padding: 10, textAlign: 'center' }} onClick={() => openClub(id)}>
                    <div style={{ display: 'grid', placeItems: 'center' }}>
                      <Crest club={cl} size={48} />
                    </div>
                    <div className="ellipsis" style={{ fontSize: 12, marginTop: 6 }}>
                      {cl.name}
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>
      )}
    </>
  );
}
