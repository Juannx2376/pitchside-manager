// Configuración: apariencia (tema global, campo, marcadores, densidad, animaciones), idioma,
// partidos y datos. Las preferencias visuales son por espectador (localStorage) y no tocan la partida.
import { managerName, serializeGame, t, userManager } from '@pitchside/core';
import { LanguagePicker, Panel, SubTabs, ViewHead } from '../components/ui';
import { Pitch } from '../components/Pitch';
import { CHIP_STYLES, DENSITIES, MOTIONS, PITCH_STYLES, THEMES, usePrefs, type ThemeId } from '../lib/prefs';
import { useTour } from '../lib/tour';
import { useGame, useGameState } from '../store/game';
import '../tactics.css';

/** Paleta fija de cada tema para dibujar su miniatura (no depende del tema activo). */
const SWATCH: Record<ThemeId, { bg: string; panel: string; line: string; accent: string; ink: string; text: string; radius: number; font?: string }> = {
  classic: { bg: '#0b0c0f', panel: '#14171d', line: '#323a49', accent: '#00d27a', ink: '#06130d', text: '#eef0f3', radius: 2 },
  fc: { bg: '#060a14', panel: '#15213b', line: '#2b3c63', accent: '#2fe3a0', ink: '#03150e', text: '#ecf3ff', radius: 10 },
  pes: { bg: '#001552', panel: '#1450cf', line: '#9dbdff', accent: '#ffee55', ink: '#001a55', text: '#ffffff', radius: 0 },
};

function ThemeCard({ id, on, onPick }: { id: ThemeId; on: boolean; onPick: () => void }) {
  const s = SWATCH[id];
  return (
    <button type="button" data-theme-card={id} className={`set-theme ${on ? 'on' : ''}`} onClick={onPick} aria-pressed={on}>
      <span className="set-mini" style={{ background: s.bg, borderColor: s.line, borderRadius: s.radius }}>
        <span className="bar" style={{ background: s.panel, borderRadius: s.radius }} />
        <span className="tabs">
          <i style={{ background: s.accent }} />
          <i style={{ background: s.line }} />
          <i style={{ background: s.line }} />
        </span>
        <span className="card" style={{ background: s.panel, borderColor: s.line, borderRadius: s.radius }}>
          <b style={{ background: s.text }} />
          <b style={{ background: s.line, width: '60%' }} />
          <u style={{ background: s.accent, color: s.ink, borderRadius: Math.max(0, s.radius - 2) }} />
        </span>
      </span>
      <span className="b disp" style={{ fontSize: 17 }}>
        {t(`ui.set.theme.${id}`)}
      </span>
      <span className="faint" style={{ fontSize: 12 }}>
        {t(`ui.set.themeDesc.${id}`)}
      </span>
    </button>
  );
}

/** Tema, campo, marcadores, densidad y animaciones. No depende de la partida: sirve también en el menú. */
export function AppearanceForm() {
  const prefs = usePrefs();
  return (
    <>
      <div className="field">
        <label>{t('ui.set.theme')}</label>
        <div className="set-themes">
          {THEMES.map((id) => (
            <ThemeCard key={id} id={id} on={prefs.theme === id} onPick={() => prefs.set({ theme: id })} />
          ))}
        </div>
        <p className="faint" style={{ fontSize: 12, margin: '2px 0 0' }}>
          {t('ui.set.themeHelp')}
        </p>
      </div>
      <div className="set-grid">
        <div className="field">
          <label>{t('ui.set.pitch')}</label>
          <SubTabs tabs={PITCH_STYLES.map((id) => ({ id, label: t(`ui.set.pitch.${id}`) }))} value={prefs.pitch} onChange={(v) => prefs.set({ pitch: v })} />
        </div>
        <div className="field">
          <label>{t('ui.set.chips')}</label>
          <SubTabs tabs={CHIP_STYLES.map((id) => ({ id, label: t(`ui.set.chips.${id}`) }))} value={prefs.chips} onChange={(v) => prefs.set({ chips: v })} />
        </div>
        <div className="field">
          <label>{t('ui.set.density')}</label>
          <SubTabs tabs={DENSITIES.map((id) => ({ id, label: t(`ui.set.density.${id}`) }))} value={prefs.density} onChange={(v) => prefs.set({ density: v })} />
        </div>
        <div className="field">
          <label>{t('ui.set.motion')}</label>
          <SubTabs tabs={MOTIONS.map((id) => ({ id, label: t(`ui.set.motion.${id}`) }))} value={prefs.motion} onChange={(v) => prefs.set({ motion: v })} />
        </div>
      </div>
      <label className="toggle">
        <input type="checkbox" checked={prefs.lanes} onChange={(e) => prefs.set({ lanes: e.target.checked })} />
        <span>{t('ui.set.lanes')}</span>
      </label>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn sm" onClick={() => prefs.reset()}>
          {t('ui.set.resetPrefs')}
        </button>
      </div>
    </>
  );
}

export function Settings() {
  const g = useGameState();
  const { mutate, notify, save, quit } = useGame();
  const prefs = usePrefs();
  const m = userManager(g);

  const exportSave = () => {
    const blob = new Blob([serializeGame(g, 'export')], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pitchside-${m ? managerName(m).replace(/\s+/g, '_') : 'save'}-${g.season}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // Mini-pizarra de ejemplo para ver el efecto de campo + marcadores sin salir de la pantalla.
  const sample = [
    { x: 50, y: 88, p: 'POR', o: 78 },
    { x: 22, y: 66, p: 'LI', o: 74 },
    { x: 40, y: 70, p: 'DFC', o: 80 },
    { x: 60, y: 70, p: 'DFC', o: 79 },
    { x: 78, y: 66, p: 'LD', o: 75 },
    { x: 34, y: 46, p: 'MC', o: 82 },
    { x: 66, y: 46, p: 'MC', o: 81 },
    { x: 50, y: 28, p: 'MCO', o: 85 },
    { x: 20, y: 24, p: 'EI', o: 83 },
    { x: 80, y: 24, p: 'ED', o: 84 },
    { x: 50, y: 12, p: 'DC', o: 88 },
  ];
  const lineColor = (p: string) => (p === 'POR' ? '#e69a12' : /^(L|DF)/.test(p) ? '#2563eb' : /^(MC|MCO)$/.test(p) ? '#16a34a' : '#dc2626');

  return (
    <>
      <ViewHead title={t('ui.nav.settings')} meta={m ? managerName(m) : undefined} />
      <div className="grid c-main">
        <div className="grid" style={{ alignContent: 'start' }}>
          <Panel title={t('ui.set.appearance')}>
            <AppearanceForm />
          </Panel>
        </div>

        <div className="grid" style={{ alignContent: 'start' }}>
          <Panel title={t('ui.set.preview')}>
            <Pitch maxWidth={300} laneTint={[0.2, 0.55, 0.9, 0.5, 0.25]}>
              {sample.map((s, i) => (
                <span key={i} className="tv-chip" style={{ left: `${s.x}%`, top: `${s.y}%`, cursor: 'default' }}>
                  {prefs.chips === 'card' ? (
                    <span className="tv-card">
                      <span className="ovr">{s.o}</span>
                      <span style={{ display: 'block', height: 24 }} />
                      <span className="nm">{s.p}</span>
                    </span>
                  ) : (
                    <span className="tv-disc" style={{ ['--g' as string]: lineColor(s.p) }}>
                      <b>{s.p.slice(0, 3)}</b>
                      <i>{s.o}</i>
                    </span>
                  )}
                </span>
              ))}
            </Pitch>
          </Panel>
          <Panel title={t('ui.help.title')}>
            <div className="row">
              <button
                className="btn"
                data-reopen-tour
                onClick={() => {
                  useTour.getState().reset();
                  useTour.getState().start();
                }}
              >
                {t('ui.help.startTour')}
              </button>
              <button className="btn ghost" onClick={() => useGame.getState().setView('help')}>
                {t('ui.nav.help')}
              </button>
            </div>
          </Panel>
          <Panel title={t('ui.set.account')}>
            <LanguagePicker />
          </Panel>
          <Panel title={t('ui.set.gameplay')}>
            <div className="field">
              <label>{t('ui.settings.matchMode')}</label>
              <SubTabs
                tabs={[
                  { id: 'live', label: t('ui.settings.live') },
                  { id: 'quick', label: t('ui.settings.quick') },
                ]}
                value={g.settings.matchMode}
                onChange={(v) => mutate((s) => (s.settings.matchMode = v))}
              />
            </div>
            <div className="field">
              <label>{t('ui.settings.speed')}</label>
              <SubTabs
                tabs={[0, 1, 2, 3].map((i) => ({ id: String(i) as '0' | '1' | '2' | '3', label: t(`ui.match.speed${i + 1}`) }))}
                value={String(g.settings.matchSpeed ?? 1) as '0' | '1' | '2' | '3'}
                onChange={(v) => mutate((s) => (s.settings.matchSpeed = Number(v)))}
              />
            </div>
            <label className="toggle">
              <input type="checkbox" checked={g.settings.autoPress} onChange={(e) => mutate((s) => (s.settings.autoPress = e.target.checked))} />
              <span>{t('ui.press.autoSetting')}</span>
            </label>
          </Panel>
          <Panel title={t('ui.set.dataTitle')}>
            <div className="row">
              <button className="btn" onClick={() => void save('autosave').then(() => notify(t('ui.settings.saved')))}>
                {t('ui.settings.save')}
              </button>
              <button className="btn" onClick={exportSave}>
                {t('ui.settings.export')}
              </button>
              <button className="btn" onClick={() => useGame.setState({ view: 'data' })}>
                {t('ui.settings.data')}
              </button>
              <button className="btn danger" onClick={() => void save('autosave').then(() => quit())}>
                {t('ui.mainMenu')}
              </button>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
