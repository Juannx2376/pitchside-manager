// Menú superior horizontal estilo EA: seis secciones grandes con icono; en pantallas estrechas sólo iconos.
import { t } from '@pitchside/core';
import type { View } from '../../store/game';
import { Icon } from './Icon';
import type { Section } from './sections';

export function TopNav({ sections, current, badges, onGo }: { sections: Section[]; current: string; badges: Partial<Record<View, number>>; onGo: (view: View) => void }) {
  return (
    <nav className="topnav" aria-label={t('ui.menu.title')}>
      {sections.map((s) => {
        const n = s.views.reduce((sum, v) => sum + (badges[v] ?? 0), 0);
        return (
          <button key={s.id} className={`nav-btn ${current === s.id ? 'on' : ''}`} data-tour={`sec-${s.id}`} data-section={s.id} onClick={() => onGo(s.views[0])} title={t(`ui.sec.${s.id}`)}>
            <span className="nav-ico">
              <Icon name={s.icon} />
              {n > 0 && <span className="nav-dot">{n > 99 ? '99+' : n}</span>}
            </span>
            <span className="nav-label">{t(`ui.sec.${s.id}`)}</span>
          </button>
        );
      })}
    </nav>
  );
}
