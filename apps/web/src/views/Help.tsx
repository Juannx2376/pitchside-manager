// Centro de ayuda: primeros pasos, glosario buscable, atajos y acceso al tutorial guiado.
import { t } from '@pitchside/core';
import { useMemo, useState } from 'react';
import { useTour } from '../lib/tour';
import { useGame } from '../store/game';
import { Panel, ViewHead } from '../components/ui';
import '../hooks.css';

export const HELP_TERMS = [
  'ovr', 'potential', 'form', 'morale', 'chemistry', 'fitness', 'role', 'familiarity', 'mentality', 'xg',
  'scouting', 'margin', 'wage', 'clause', 'loan', 'window', 'board', 'fpf', 'growth', 'perk', 'path',
  'derby', 'rumour', 'agent', 'academy', 'sacking', 'timeout', 'promise',
] as const;

const QUICK = ['squad', 'tactics', 'train', 'scout', 'play', 'goals'] as const;

export function Help() {
  const [q, setQ] = useState('');
  const { setView } = useGame();
  const { start, reset } = useTour();
  const terms = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return HELP_TERMS.filter((id) => !needle || `${t(`ui.help.g.${id}.t`)} ${t(`ui.help.g.${id}.d`)}`.toLowerCase().includes(needle));
  }, [q]);

  return (
    <>
      <ViewHead
        title={t('ui.help.title')}
        meta={t('ui.help.meta')}
        tools={
          <button
            className="btn-go"
            data-help-tour
            onClick={() => {
              reset();
              start();
              setView('hub');
            }}
          >
            {t('ui.help.startTour')}
          </button>
        }
      />
      <div className="grid c-main" style={{ alignItems: 'start' }}>
        <Panel title={t('ui.help.quickTitle')}>
          <ol className="help-steps">
            {QUICK.map((id) => (
              <li key={id}>
                <div>
                  <b>{t(`ui.help.q.${id}.t`)}</b>
                  <span className="dim">{t(`ui.help.q.${id}.d`)}</span>
                </div>
              </li>
            ))}
          </ol>
        </Panel>
        <div className="grid">
          <Panel title={t('ui.help.keysTitle')}>
            <div className="week-card">
              {(['continue', 'tabs', 'search', 'close'] as const).map((k) => (
                <div key={k} className="week-item">
                  <span className="tag acc">{t(`ui.help.key.${k}.k`)}</span>
                  <span>{t(`ui.help.key.${k}.d`)}</span>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title={t('ui.help.honestTitle')}>
            <p className="dim" style={{ margin: 0, fontSize: 13 }}>
              {t('ui.help.honestBody')}
            </p>
          </Panel>
        </div>
      </div>
      <Panel title={t('ui.help.glossary', { n: terms.length })} style={{ marginTop: 12 }}>
        <input className="input" placeholder={t('ui.help.search')} value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 10, width: '100%' }} />
        <div className="help-grid">
          {terms.map((id) => (
            <div key={id} className="help-term" data-term={id}>
              <b>{t(`ui.help.g.${id}.t`)}</b>
              <span>{t(`ui.help.g.${id}.d`)}</span>
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}
