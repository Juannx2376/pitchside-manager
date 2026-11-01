import {
  COUNTRIES,
  COUNTRY_BY_CODE,
  Rng,
  clubPlayers,
  countryName,
  createCustomClub,
  displayName,
  formatMoney,
  formatNumber,
  squadStrength,
  t,
  type CrestDesign,
} from '@pitchside/core';
import { useEffect, useMemo, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { CrestSvg, Crest, Flag, LanguagePicker, OvrChip, Panel, SubTabs } from '../components/ui';
import { saveKeys } from '../store/idb';
import { useGame, type ManagerInput } from '../store/game';
import { DataImport } from './DataImport';
import { AppearanceForm } from './Settings';

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export function NewGame() {
  const game = useGame((s) => s.game);
  useGame((s) => s.version);
  if (game && !game.userManagerId) return <ClubPicker />;
  return <Splash />;
}

function Splash() {
  const { newGame, load, loadFromText, notify, busy, progress, baseDb, baseDbStatus } = useGame();
  useGame((s) => s.locale);
  const [hasSave, setHasSave] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  useEffect(() => {
    saveKeys()
      .then((k) => setHasSave(k.includes('autosave')))
      .catch(() => setHasSave(false));
  }, []);
  const stats = useMemo(() => {
    if (!baseDb) return null;
    return { leagues: baseDb.leagues.length, clubs: baseDb.clubs.length, players: baseDb.players.length };
  }, [baseDb]);

  return (
    <div className="splash">
      <div className="splash-art">
        <svg viewBox="0 0 600 600" style={{ position: 'absolute', right: -80, top: -60, width: 620, opacity: 0.08 }}>
          <circle cx="300" cy="300" r="240" fill="none" stroke="#fff" strokeWidth="3" />
          <circle cx="300" cy="300" r="70" fill="none" stroke="#fff" strokeWidth="3" />
          <line x1="300" y1="0" x2="300" y2="600" stroke="#fff" strokeWidth="3" />
          <rect x="190" y="0" width="220" height="90" fill="none" stroke="#fff" strokeWidth="3" />
          <rect x="190" y="510" width="220" height="90" fill="none" stroke="#fff" strokeWidth="3" />
        </svg>
        <div className="title">
          <h1>
            Pitch<span>side</span>
          </h1>
          <div className="stats">
            <div>
              <b>211</b>
              <span>{t('ui.splash.federations')}</span>
            </div>
            <div>
              <b>{stats ? stats.leagues : '—'}</b>
              <span>{t('ui.splash.leagues')}</span>
            </div>
            <div>
              <b>{stats ? formatNumber(stats.clubs) : '—'}</b>
              <span>{t('ui.splash.clubs')}</span>
            </div>
            <div>
              <b>{stats ? formatNumber(stats.players) : '—'}</b>
              <span>{t('ui.splash.players')}</span>
            </div>
          </div>
        </div>
      </div>
      <div className="splash-side">
        <div className="faint" style={{ fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 8 }}>
          {t('ui.splash.menu')}
        </div>
        <button className="menu-item" disabled={busy || baseDbStatus === 'loading'} onClick={() => void newGame(Math.floor(Math.random() * 1e9)).catch((e) => notify((e as Error).message))}>
          <div>
            {t('ui.splash.new')}
            <small>
              {baseDbStatus === 'loading'
                ? t('ui.splash.dbLoading')
                : baseDbStatus === 'missing'
                  ? t('ui.splash.dbMissing')
                  : t('ui.splash.newHint')}
            </small>
          </div>
        </button>
        <button className="menu-item" disabled={!hasSave || busy} onClick={() => void load('autosave').then((ok) => !ok && notify(t('ui.splash.loadFailed')))}>
          <div>
            {t('ui.splash.continue')}
            <small>{hasSave ? t('ui.splash.lastSave') : t('ui.splash.noSave')}</small>
          </div>
        </button>
        <label className="menu-item" style={{ cursor: 'pointer' }}>
          <div>
            {t('ui.splash.loadFile')}
            <small>{t('ui.splash.loadFileHint')}</small>
          </div>
          <input
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                loadFromText(await f.text());
              } catch (err) {
                notify((err as Error).message);
              }
            }}
          />
        </label>
        <button className="menu-item" onClick={() => setShowImport((s) => !s)}>
          <div>
            {t('ui.splash.import')}
            <small>{t('ui.splash.importHint')}</small>
          </div>
        </button>
        {progress && (
          <div className="panel" style={{ padding: 12 }}>
            <div className="row" style={{ marginBottom: 6 }}>
              <span className="dim">{progress.label}</span>
              <span className="spacer" />
              <span className="b">{Math.round(progress.value * 100)}%</span>
            </div>
            <div className="progress">
              <div style={{ width: `${progress.value * 100}%` }} />
            </div>
          </div>
        )}
        <button className="menu-item" onClick={() => setShowSettings((s) => !s)}>
          <div>{t('ui.nav.settings')}</div>
        </button>
        {showSettings && (
          <div className="panel" style={{ padding: 12 }}>
            <div className="field" style={{ marginBottom: 12 }}>
              <label>{t('ui.language')}</label>
              <LanguagePicker />
            </div>
            <AppearanceForm />
          </div>
        )}
        {showImport && <DataImport compact />}
        <div className="faint" style={{ fontSize: 11, marginTop: 'auto' }}>
          {t('ui.splash.disclaimer')}
        </div>
      </div>
    </div>
  );
}

const DEFAULT_CREST: CrestDesign = { shape: 'shield', pattern: 'stripes', primary: '#1d4ed8', secondary: '#ffffff', accent: '#facc15', symbol: 'star', initials: '' };

function ClubPicker() {
  const game = useGame((s) => s.game);
  const pickClub = useGame((s) => s.pickClub);
  const openClub = useGame((s) => s.openClub);
  const mutate = useGame((s) => s.mutate);
  const notify = useGame((s) => s.notify);
  const [mode, setMode] = useState<'pick' | 'create'>('pick');
  const [query, setQuery] = useState('');
  const [country, setCountry] = useState('ENG');
  const [tier, setTier] = useState(1);
  const [clubId, setClubId] = useState('');
  const [mgr, setMgr] = useState<ManagerInput>({ firstName: '', lastName: '', nationality: 'ENG', style: 'BALANCED', avatar: 0 });
  // Custom club (Soccer Manager style).
  const [cName, setCName] = useState('');
  const [cShort, setCShort] = useState('');
  const [cCity, setCCity] = useState('');
  const [cStadium, setCStadium] = useState('');
  const [ambition, setAmbition] = useState<1 | 2 | 3>(1);
  const [crest, setCrest] = useState<CrestDesign>(DEFAULT_CREST);

  const q = norm(query.trim());
  const countries = useMemo(
    () =>
      COUNTRIES.filter((c) => !q || norm(countryName(c.code)).includes(q) || norm(c.name).includes(q) || norm(c.nameEn).includes(q)).sort((a, b) =>
        countryName(a.code).localeCompare(countryName(b.code)),
      ),
    [q],
  );
  if (!game) return null;
  // Countries first, then clubs worldwide.
  const clubHits = q.length >= 3 ? Object.values(game.clubs).filter((c) => norm(c.name).includes(q)).sort((a, b) => b.reputation - a.reputation).slice(0, 30) : [];
  const leagues = game.countries[country]?.leagueIds.map((id) => game.leagues[id]) ?? [];
  const league = leagues.find((l) => l.tier === tier) ?? leagues[0];
  const clubs = league ? league.clubIds.map((id) => game.clubs[id]).sort((a, b) => b.reputation - a.reputation) : [];
  const chosen = clubId ? game.clubs[clubId] : null;
  const select = (id: string) => {
    setClubId(id);
    const c = game.clubs[id];
    if (c && c.countryCode !== country) {
      setCountry(c.countryCode);
      setTier(game.leagues[c.leagueId].tier);
    }
  };
  const managerOk = mgr.firstName.trim() && mgr.lastName.trim();
  const managerData = { ...mgr, firstName: mgr.firstName.trim(), lastName: mgr.lastName.trim() };

  const createAndSign = () => {
    if (!league || !cName.trim()) return;
    try {
      const id = mutate((g) =>
        createCustomClub(g, new Rng(g.rngState ^ 0xc1ab), {
          leagueId: league.id,
          name: cName,
          shortName: cShort || cName.slice(0, 3),
          city: cCity,
          colors: [crest.primary, crest.secondary],
          crest: { ...crest, initials: crest.initials || (cShort || cName).slice(0, 3).toUpperCase() },
          stadiumName: cStadium,
          ambition,
        }),
      );
      pickClub(id, managerData);
    } catch (e) {
      notify(t((e as Error).message));
    }
  };

  return (
    <div style={{ height: '100vh', display: 'grid', gridTemplateRows: 'auto 1fr' }}>
      <header className="masthead">
        <div className="mast-club">
          <div className="name">{mode === 'pick' ? t('ui.pick.title') : t('ui.create.title')}</div>
          <div className="sub">{t('ui.pick.sub', { clubs: Object.keys(game.clubs).length, players: Object.keys(game.players).length })}</div>
        </div>
        <SubTabs
          tabs={[
            { id: 'pick', label: t('ui.pick.tab') },
            { id: 'create', label: t('ui.create.tab') },
          ]}
          value={mode}
          onChange={setMode}
        />
      </header>
      <div className="grid picker-grid" style={{ gridTemplateColumns: '260px minmax(0,1fr) 330px', minHeight: 0, padding: 14 }}>
        <Panel title={t('ui.pick.federations')} flush style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: 8 }}>
            <input placeholder={t('ui.search.placeholder')} value={query} onChange={(e) => setQuery(e.target.value)} style={{ width: '100%' }} />
          </div>
          <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 190px)' }}>
            {countries.map((c) => (
              <div
                key={c.code}
                className="row nw link"
                style={{ padding: '6px 10px', background: c.code === country ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : undefined }}
                onClick={() => {
                  setCountry(c.code);
                  // New clubs usually start in the lowest division.
                  const ids = game.countries[c.code].leagueIds;
                  setTier(mode === 'create' && ids.length ? game.leagues[ids[ids.length - 1]].tier : 1);
                }}
              >
                <Flag code={c.code} />
                <span className="ellipsis">{countryName(c.code)}</span>
                <span className="spacer" />
                <span className="faint" style={{ fontSize: 12 }}>
                  {game.countries[c.code].leagueIds.reduce((s, id) => s + game.leagues[id].clubIds.length, 0)}
                </span>
              </div>
            ))}
            {clubHits.length > 0 && <div className="gs-h">{t('ui.search.club')}</div>}
            {clubHits.map((c) => (
              <div key={c.id} className="row nw link" style={{ padding: '6px 10px' }} onClick={() => select(c.id)}>
                <Crest club={c} size={20} />
                <span className="ellipsis">{c.name}</span>
                <span className="spacer" />
                <Flag code={c.countryCode} size={16} />
              </div>
            ))}
          </div>
        </Panel>
        <div style={{ minWidth: 0, overflow: 'auto', maxHeight: 'calc(100vh - 92px)' }}>
          <div className="row" style={{ marginBottom: 10 }}>
            <Flag code={country} size={34} />
            <div className="disp" style={{ fontSize: 28, fontStyle: 'italic' }}>
              {countryName(country)}
            </div>
            <span className="tag">{COUNTRY_BY_CODE[country].confederation}</span>
            <span className="tag">{t('ui.pick.economy', { n: COUNTRY_BY_CODE[country].econ })}</span>
          </div>
          <div className="subtabs">
            {leagues.map((l) => (
              <button key={l.id} className={`subtab ${league?.id === l.id ? 'on' : ''}`} onClick={() => setTier(l.tier)}>
                {displayName(l.name)}
              </button>
            ))}
          </div>
          {mode === 'pick' ? (
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
              {clubs.map((c) => {
                const lvl = squadStrength(clubPlayers(game, c.id));
                return (
                  <div
                    key={c.id}
                    className="tile click"
                    style={{
                      padding: 12,
                      borderTopWidth: 3,
                      borderTopStyle: 'solid',
                      borderTopColor: c.colors[0],
                      borderRightColor: c.id === clubId ? 'var(--accent)' : undefined,
                      borderBottomColor: c.id === clubId ? 'var(--accent)' : undefined,
                      borderLeftColor: c.id === clubId ? 'var(--accent)' : undefined,
                    }}
                    onClick={() => select(c.id)}
                    onDoubleClick={() => openClub(c.id)}
                  >
                    <div className="row nw">
                      <Crest club={c} size={46} />
                      <div style={{ minWidth: 0 }}>
                        <div className="b ellipsis" style={{ fontSize: 15 }}>
                          {c.name}
                        </div>
                        <div className="faint" style={{ fontSize: 12 }}>
                          {t(`ui.source.${c.source}`)}
                        </div>
                      </div>
                    </div>
                    <div className="row" style={{ marginTop: 10, fontSize: 12 }}>
                      <OvrChip v={lvl} />
                      <span className="dim">{t('ui.repN', { n: c.reputation })}</span>
                      <span className="spacer" />
                      <span className="dim">{formatMoney(c.finances.transferBudget)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <CreateClubForm
              {...{ cName, setCName, cShort, setCShort, cCity, setCCity, cStadium, setCStadium, ambition, setAmbition, crest, setCrest }}
              leagueName={league ? displayName(league.name) : ''}
            />
          )}
        </div>
        <Panel title={t('ui.pick.manager')}>
          <div className="grid">
            {mode === 'pick' ? (
              chosen ? (
                <div className="row nw" style={{ padding: 10, background: 'var(--panel-2)', borderLeft: `3px solid ${chosen.colors[0]}` }}>
                  <Crest club={chosen} size={52} />
                  <div style={{ minWidth: 0 }}>
                    <div className="disp ellipsis" style={{ fontSize: 20 }}>
                      {chosen.name}
                    </div>
                    <div className="dim" style={{ fontSize: 12 }}>
                      {displayName(game.leagues[chosen.leagueId].name)} · {t('ui.stadiumN', { n: chosen.stadium.capacity })}
                    </div>
                    <button className="btn sm ghost" style={{ marginTop: 4 }} onClick={() => openClub(chosen.id)}>
                      {t('ui.viewProfile')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="dim">{t('ui.pick.selectClub')}</div>
              )
            ) : (
              <div className="row nw" style={{ padding: 10, background: 'var(--panel-2)', borderLeft: `3px solid ${crest.primary}` }}>
                <CrestSvg design={{ ...crest, initials: crest.initials || (cShort || cName).slice(0, 3).toUpperCase() }} size={46} />
                <div style={{ minWidth: 0 }}>
                  <div className="disp ellipsis" style={{ fontSize: 20 }}>
                    {cName || t('ui.create.namePh')}
                  </div>
                  <div className="dim" style={{ fontSize: 12 }}>
                    {league ? displayName(league.name) : ''}
                  </div>
                </div>
              </div>
            )}
            <ManagerForm mgr={mgr} setMgr={setMgr} />
            {mode === 'pick' ? (
              <button className="btn-go" disabled={!chosen || !managerOk} onClick={() => pickClub(clubId, managerData)}>
                {t('ui.pick.sign')}
              </button>
            ) : (
              <button className="btn-go" disabled={!cName.trim() || !managerOk || !league} onClick={createAndSign}>
                {t('ui.create.found')}
              </button>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

export function ManagerForm({ mgr, setMgr }: { mgr: ManagerInput; setMgr: (m: ManagerInput) => void }) {
  return (
    <>
      <div className="field">
        <label>{t('ui.mgr.avatar')}</label>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          {Array.from({ length: 8 }, (_, i) => (
            <button key={i} className={`avatar-btn ${mgr.avatar === i ? 'on' : ''}`} onClick={() => setMgr({ ...mgr, avatar: i })}>
              <Avatar index={i} size={34} />
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label>{t('ui.mgr.firstName')}</label>
        <input value={mgr.firstName} onChange={(e) => setMgr({ ...mgr, firstName: e.target.value })} />
      </div>
      <div className="field">
        <label>{t('ui.mgr.lastName')}</label>
        <input value={mgr.lastName} onChange={(e) => setMgr({ ...mgr, lastName: e.target.value })} />
      </div>
      <div className="field">
        <label>{t('ui.mgr.nationality')}</label>
        <select value={mgr.nationality} onChange={(e) => setMgr({ ...mgr, nationality: e.target.value })}>
          {[...COUNTRIES]
            .sort((a, b) => countryName(a.code).localeCompare(countryName(b.code)))
            .map((c) => (
              <option key={c.code} value={c.code}>
                {countryName(c.code)}
              </option>
            ))}
        </select>
      </div>
    </>
  );
}

const SHAPES: CrestDesign['shape'][] = ['shield', 'classic', 'modern', 'round', 'diamond'];
const PATTERNS: CrestDesign['pattern'][] = ['plain', 'stripes', 'hoops', 'half', 'sash', 'quarters', 'chevron'];
const SYMBOLS: CrestDesign['symbol'][] = ['none', 'star', 'ball', 'crown', 'lion', 'eagle', 'castle', 'bolt', 'anchor', 'tree'];
const PALETTE = ['#ffffff', '#111827', '#dc2626', '#1d4ed8', '#16a34a', '#facc15', '#f97316', '#7c3aed', '#0ea5e9', '#be123c', '#065f46', '#a16207', '#64748b', '#ec4899'];

function CreateClubForm(p: {
  cName: string;
  setCName: (v: string) => void;
  cShort: string;
  setCShort: (v: string) => void;
  cCity: string;
  setCCity: (v: string) => void;
  cStadium: string;
  setCStadium: (v: string) => void;
  ambition: 1 | 2 | 3;
  setAmbition: (v: 1 | 2 | 3) => void;
  crest: CrestDesign;
  setCrest: (c: CrestDesign) => void;
  leagueName: string;
}) {
  const { crest, setCrest } = p;
  const colorRow = (key: 'primary' | 'secondary' | 'accent') => (
    <div className="field">
      <label>{t(`ui.create.${key}`)}</label>
      <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
        {PALETTE.map((c) => (
          <button key={c} className={`swatch ${crest[key] === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setCrest({ ...crest, [key]: c })} aria-label={c} />
        ))}
        <input type="color" value={crest[key]} onChange={(e) => setCrest({ ...crest, [key]: e.target.value })} />
      </div>
    </div>
  );
  return (
    <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr) 240px' }}>
      <Panel title={t('ui.create.identity')}>
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="field">
            <label>{t('ui.create.name')}</label>
            <input value={p.cName} maxLength={32} placeholder={t('ui.create.namePh')} onChange={(e) => p.setCName(e.target.value)} />
          </div>
          <div className="field">
            <label>{t('ui.create.short')}</label>
            <input value={p.cShort} maxLength={4} onChange={(e) => p.setCShort(e.target.value.toUpperCase())} />
          </div>
          <div className="field">
            <label>{t('ui.create.city')}</label>
            <input value={p.cCity} maxLength={28} onChange={(e) => p.setCCity(e.target.value)} />
          </div>
          <div className="field">
            <label>{t('ui.create.stadium')}</label>
            <input value={p.cStadium} maxLength={32} onChange={(e) => p.setCStadium(e.target.value)} />
          </div>
        </div>
        <div className="field" style={{ marginTop: 10 }}>
          <label>{t('ui.create.ambition')}</label>
          <SubTabs
            tabs={[
              { id: '1', label: t('ui.create.amb1') },
              { id: '2', label: t('ui.create.amb2') },
              { id: '3', label: t('ui.create.amb3') },
            ]}
            value={String(p.ambition) as '1' | '2' | '3'}
            onChange={(v) => p.setAmbition(Number(v) as 1 | 2 | 3)}
          />
          <span className="faint" style={{ fontSize: 12 }}>
            {t('ui.create.replaces', { league: p.leagueName })}
          </span>
        </div>
        <div className="field" style={{ marginTop: 10 }}>
          <label>{t('ui.create.shape')}</label>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {SHAPES.map((s) => (
              <button key={s} className={`crest-opt ${crest.shape === s ? 'on' : ''}`} onClick={() => setCrest({ ...crest, shape: s })}>
                <CrestSvg design={{ ...crest, shape: s, symbol: 'none', initials: '' }} size={30} />
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>{t('ui.create.pattern')}</label>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {PATTERNS.map((s) => (
              <button key={s} className={`crest-opt ${crest.pattern === s ? 'on' : ''}`} onClick={() => setCrest({ ...crest, pattern: s })}>
                <CrestSvg design={{ ...crest, pattern: s, symbol: 'none', initials: '' }} size={30} />
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>{t('ui.create.symbol')}</label>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {SYMBOLS.map((s) => (
              <button key={s} className={`crest-opt ${crest.symbol === s ? 'on' : ''}`} onClick={() => setCrest({ ...crest, symbol: s })}>
                <CrestSvg design={{ ...crest, symbol: s, initials: '' }} size={30} />
              </button>
            ))}
          </div>
        </div>
        {colorRow('primary')}
        {colorRow('secondary')}
        {colorRow('accent')}
        <div className="field">
          <label>{t('ui.create.initials')}</label>
          <input value={crest.initials} maxLength={4} onChange={(e) => setCrest({ ...crest, initials: e.target.value.toUpperCase() })} />
        </div>
      </Panel>
      <div className="crest-preview">
        <CrestSvg design={{ ...crest, initials: crest.initials || (p.cShort || p.cName).slice(0, 3).toUpperCase() }} size={200} />
        <div className="disp" style={{ fontSize: 22, textAlign: 'center' }}>
          {p.cName || t('ui.create.namePh')}
        </div>
      </div>
    </div>
  );
}
