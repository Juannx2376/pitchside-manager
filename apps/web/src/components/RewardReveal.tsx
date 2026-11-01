// Pantalla de revelación (fichaje, logro, hito de plan, joya, nivel del camino). Usa la cola `meta.reveals` del core.
// Las revelaciones con jugador empiezan con un sobre sellado que se abre con un destello del color de la rareza.
import { cardOf, dismissReveal, potentialView, t, tm } from '@pitchside/core';
import { useEffect, useState } from 'react';
import { useGame } from '../store/game';
import { FcCard } from './FcCard';
import { Icon } from './shell/Icon';
import '../hooks.css';

const ICON: Record<string, string> = { signing: 'pen', achievement: 'trophy', milestone: 'check', potential: 'star', pass: 'gift', legend: 'star' };

export function RewardReveal() {
  const g = useGame((s) => s.game);
  useGame((s) => s.version);
  const { mutate } = useGame();
  const meta = g?.userClubId ? g.meta : undefined;
  const reveal = meta?.reveals?.[0];
  const id = reveal?.id;
  const hasCard = !!reveal?.playerId && !!g?.players[reveal.playerId];
  // `opened` guarda el id de la revelación ya abierta; así cada revelación nueva vuelve a empezar sellada.
  const [opened, setOpened] = useState<string | null>(null);
  const isOpen = !hasCard || opened === id;

  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
        e.preventDefault();
        if (!isOpen && e.key !== 'Escape') setOpened(id);
        else mutate((s) => dismissReveal(s, id));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id, isOpen, mutate]);

  if (!g || !reveal) return null;
  const p = reveal.playerId ? g.players[reveal.playerId] : null;
  const club = p?.clubId ? g.clubs[p.clubId] : null;
  const more = (meta?.reveals.length ?? 1) - 1;
  const tier = p ? cardOf(p, g ? potentialView(g, p) : undefined).tier : 'gold';

  if (!isOpen) {
    return (
      <div className="reveal-wrap" data-reveal={reveal.kind} data-stage="pack" onClick={() => setOpened(reveal.id)}>
        <div className={`reveal-pack ${tier}`}>
          <div className="pack-shine" />
          <div className="pack-badge"><Icon name={ICON[reveal.kind] ?? 'star'} size={54} /></div>
          <div className="pack-title">{t(`ui.reveal.kind.${reveal.kind}`)}</div>
          <div className="pack-hint">{t('ui.reveal.openPack')}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="reveal-wrap" data-reveal={reveal.kind} data-stage="open">
      <div className={`reveal-box ${reveal.kind} tier-${tier}`}>
        <div className="reveal-glow" />
        {hasCard && (
          <div className="reveal-burst" aria-hidden>
            {Array.from({ length: 14 }, (_, i) => (
              <i key={i} style={{ ['--a' as string]: `${i * (360 / 14)}deg`, ['--d' as string]: `${i % 3}` }} />
            ))}
          </div>
        )}
        <div className="reveal-kind">
          <Icon name={ICON[reveal.kind] ?? 'star'} size={16} /> {t(`ui.reveal.kind.${reveal.kind}`)}
        </div>
        {p ? (
          <div className="reveal-card">
            <FcCard p={p} club={club} size="lg" />
          </div>
        ) : (
          <div className="reveal-trophy"><Icon name={ICON[reveal.kind] ?? 'star'} size={64} /></div>
        )}
        <h2>{tm(reveal.title)}</h2>
        <p>{tm(reveal.body)}</p>
        {reveal.kind === 'signing' && (tier === 'elite' || tier === 'rising') && <div className="reveal-stage">{t('ui.pres.stadium')}</div>}
        {reveal.extra && reveal.extra.length > 0 && (
          <ul className="reveal-react" data-reactions>
            {reveal.extra.map((m, i) => (
              <li key={i}>
                <span>{['“', '¶', '§'][i] ?? '•'}</span>
                {tm(m)}
              </li>
            ))}
          </ul>
        )}
        <button className="btn-go" onClick={() => mutate((s) => dismissReveal(s, reveal.id))}>
          {t('ui.reveal.continue')}
          {more > 0 ? ` (+${more})` : ''}
        </button>
      </div>
    </div>
  );
}
