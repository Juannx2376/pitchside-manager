// Carta de jugador (cromo de coleccionista): material por rareza, retrato sobre los colores del club,
// media a la izquierda, placa con el apellido, seis valores y rasgos. El potencial sólo se insinúa si es visible.
import { cardOf, positionShort, potentialView, t, type Club, type Player } from '@pitchside/core';
import { useGame } from '../store/game';
import { Crest, Face, Flag } from './ui';
import '../hooks.css';

export function FcCard({ p, club, size = 'md', onClick, badge }: { p: Player; club?: Club | null; size?: 'sm' | 'md' | 'lg'; onClick?: () => void; badge?: string }) {
  const g = useGame((s) => s.game);
  const view = g ? potentialView(g, p) : ({ kind: 'hidden' } as const);
  const c = cardOf(p, view);
  const potTip = view.kind === 'exact' ? String(view.value) : view.kind === 'range' ? `${view.lo}–${view.hi}` : null;
  const photo = size === 'sm' ? 64 : size === 'md' ? 96 : 132;
  const k1 = club?.colors[0] ?? '#3a4252';
  const k2 = club?.colors[1] ?? '#cfd6e3';
  return (
    <div className={`fc-card ${c.tier} ${size} ${onClick ? 'click' : ''}`} onClick={onClick} data-tier={c.tier} style={{ ['--k1' as string]: k1, ['--k2' as string]: k2 }}>
      <div className="fc-art">
        <div className="fc-photo">
          <Face player={p} club={club} size={photo} />
        </div>
        <div className="fc-side">
          <div className="fc-ovr" title={t('ui.card.dynTip', { base: c.ovr, now: c.dyn })}>
            <b>{c.dyn}</b>
            {c.dyn !== c.ovr && <em className={c.dyn > c.ovr ? 'up' : 'down'}>{c.dyn > c.ovr ? '▲' : '▼'}</em>}
          </div>
          <span className="fc-pos">{positionShort(p.position)}</span>
          {size !== 'sm' && <Flag code={p.nationality} size={16} />}
          {club && size !== 'sm' && <Crest club={club} size={size === 'lg' ? 24 : 18} />}
        </div>
      </div>
      <div className="fc-plate ellipsis">{p.lastName}</div>
      {size !== 'sm' && (
        <div className="fc-faces">
          {c.faces.map((f) => (
            <div key={f.id}>
              <b>{f.value}</b>
              <span>{t(`ui.card.face.${f.id}`)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="fc-foot">
        {c.stars !== null ? (
          <span className="fc-stars" title={t('ui.card.potential', { n: potTip ?? '' })}>
            {'★'.repeat(c.stars)}
            <i>{'★'.repeat(5 - c.stars)}</i>
          </span>
        ) : (
          <span className="fc-stars unknown" title={t('ui.card.potentialUnknown')}>
            <i>★★★★★</i>
          </span>
        )}
        {size !== 'sm' && c.traits.length > 0 && (
          <span className="fc-traits">
            {c.traits.map((id) => (
              <em key={id} title={t(`ui.trait.${id}`)}>
                {t(`ui.trait.${id}`).slice(0, 1)}
              </em>
            ))}
          </span>
        )}
      </div>
      {badge && <div className="fc-badge">{badge}</div>}
    </div>
  );
}
