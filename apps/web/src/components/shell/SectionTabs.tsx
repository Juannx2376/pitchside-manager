// Pestañas "pill" de la sección actual (sustituyen a las 15 pestañas globales).
import { t } from '@pitchside/core';
import type { View } from '../../store/game';
import type { Section } from './sections';

export function SectionTabs({ section, view, badges, onGo }: { section: Section; view: View; badges: Partial<Record<View, number>>; onGo: (v: View) => void }) {
  if (section.views.length < 2) return null;
  return (
    <div className="pills" role="tablist">
      {section.views.map((v) => (
        <button key={v} role="tab" aria-selected={view === v} className={`pill ${view === v ? 'on' : ''}`} data-tour={`nav-${v}`} onClick={() => onGo(v)}>
          {t(`ui.nav.${v}`)}
          {!!badges[v] && <span className="pill-dot">{badges[v]}</span>}
        </button>
      ))}
    </div>
  );
}
