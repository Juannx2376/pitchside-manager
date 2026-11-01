import { countryName, coverageReport, displayName, formatNumber, importAuto, t, tm } from '@pitchside/core';
import { Flag, Meter, Panel, PUBLIC_BUILD, ViewHead } from '../components/ui';
import { useGame } from '../store/game';

export function DataImport({ compact = false }: { compact?: boolean }) {
  const game = useGame((s) => s.game);
  useGame((s) => s.version);
  const { imports, addImport, clearImports, notify, baseDb, baseDbStatus } = useGame();

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files)) {
      try {
        const bundle = importAuto(f.name, await f.text());
        addImport(bundle);
        notify(t('ui.data.imported', { file: f.name, players: bundle.players.length, clubs: bundle.clubs.length, warnings: bundle.warnings.length }));
      } catch (e) {
        notify(`${f.name}: ${t((e as Error).message)}`);
      }
    }
  };

  const importer = (
    <Panel
      title={t('ui.data.importTitle')}
      actions={
        imports.length > 0 && (
          <button className="btn sm" onClick={clearImports}>
            {t('ui.data.clear')}
          </button>
        )
      }
    >
      <p className="dim" style={{ marginTop: 0, fontSize: 13 }}>
        {t('ui.data.importHelp')}
      </p>
      {PUBLIC_BUILD && (
        <p className="faint" style={{ fontSize: 12 }}>
          {t('ui.data.publicNote')}
        </p>
      )}
      <label className="btn" style={{ display: 'inline-block' }}>
        {t('ui.data.choose')}
        <input type="file" multiple accept=".csv,.json" style={{ display: 'none' }} onChange={(e) => void onFiles(e.target.files)} />
      </label>
      {imports.map((b, i) => (
        <div key={i} style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
          <div className="b">{b.source}</div>
          <div className="dim" style={{ fontSize: 13 }}>
            {t('ui.data.counts', { leagues: b.leagues.length, clubs: b.clubs.length, players: b.players.length })}
          </div>
          {b.warnings.slice(0, 4).map((w, j) => (
            <div key={j} className="faint" style={{ fontSize: 12 }}>
              ⚠ {tm(w)}
            </div>
          ))}
        </div>
      ))}
    </Panel>
  );
  if (compact) return importer;

  const coverage = game ? coverageReport(game) : [];
  const totals = coverage.reduce(
    (s, c) => {
      for (const l of c.leagues) {
        s.clubs += l.totalClubs;
        s.real += l.realClubs;
        s.players += l.totalPlayers;
        s.realPlayers += l.realPlayers;
      }
      return s;
    },
    { clubs: 0, real: 0, players: 0, realPlayers: 0 },
  );

  return (
    <>
      <ViewHead title={t('ui.data.title')} meta={t('ui.data.meta')} />
      <div className="grid c3" style={{ marginBottom: 12 }}>
        <Panel title={t('ui.data.base')}>
          <div className="b">{baseDb?.source ?? (baseDbStatus === 'missing' ? t('ui.data.notFound') : t('ui.loading'))}</div>
          <div className="dim" style={{ fontSize: 13 }}>
            {baseDb ? t('ui.data.counts', { leagues: baseDb.leagues.length, clubs: baseDb.clubs.length, players: baseDb.players.length }) : ''}
          </div>
          <p className="faint" style={{ fontSize: 12, marginBottom: 0 }}>
            {t('ui.data.sources')}
          </p>
        </Panel>
        <Panel title={t('ui.data.realClubs')}>
          <div className="disp" style={{ fontSize: 30 }}>
            {formatNumber(totals.real)} / {formatNumber(totals.clubs)}
          </div>
          <Meter value={(totals.real / Math.max(1, totals.clubs)) * 100} />
        </Panel>
        <Panel title={t('ui.data.realPlayers')}>
          <div className="disp" style={{ fontSize: 30 }}>
            {formatNumber(totals.realPlayers)} / {formatNumber(totals.players)}
          </div>
          <Meter value={(totals.realPlayers / Math.max(1, totals.players)) * 100} />
        </Panel>
      </div>
      <div className="grid c-main">
        <Panel title={t('ui.data.coverage')} flush>
          <div className="grid-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t('ui.col.country')}</th>
                  <th>{t('ui.data.league')}</th>
                  <th className="n">{t('ui.data.realClubs')}</th>
                  <th className="n">{t('ui.data.realPlayers')}</th>
                </tr>
              </thead>
              <tbody>
                {[...coverage]
                  .sort((a, b) => b.leagues.reduce((s, l) => s + l.realClubs, 0) - a.leagues.reduce((s, l) => s + l.realClubs, 0))
                  .flatMap((c) =>
                    c.leagues.map((l, i) => (
                      <tr key={c.countryCode + i}>
                        <td>
                          {i === 0 && (
                            <span className="row nw">
                              <Flag code={c.countryCode} size={16} /> {countryName(c.countryCode)}
                            </span>
                          )}
                        </td>
                        <td>{displayName(l.name)}</td>
                        <td className={`n ${l.realClubs === l.totalClubs ? 'good' : l.realClubs === 0 ? 'faint' : ''}`}>
                          {l.realClubs}/{l.totalClubs}
                        </td>
                        <td className="n">
                          {l.realPlayers}/{l.totalPlayers}
                        </td>
                      </tr>
                    )),
                  )}
              </tbody>
            </table>
          </div>
        </Panel>
        {importer}
      </div>
    </>
  );
}
