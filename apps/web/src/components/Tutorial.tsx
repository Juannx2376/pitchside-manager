// Tutorial guiado: resalta partes de la pantalla y explica el juego paso a paso en lenguaje llano.
import { t } from '@pitchside/core';
import { useEffect, useState, type CSSProperties } from 'react';
import { TOUR_STEPS, useTour } from '../lib/tour';
import { useGame } from '../store/game';
import '../hooks.css';

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function Tutorial() {
  const { seen, active, step, start, next, prev, close } = useTour();
  const setView = useGame((s) => s.setView);
  const hasClub = useGame((s) => !!s.game?.userClubId);
  const [box, setBox] = useState<Box | null>(null);
  const cur = TOUR_STEPS[step];

  // Cambia a la vista del paso y localiza el elemento resaltado (se reintenta porque la vista tarda en montarse).
  useEffect(() => {
    if (!active || !cur) return;
    setView(cur.view);
    let tries = 0;
    const find = () => {
      const el = cur.target ? document.querySelector<HTMLElement>(`[data-tour="${cur.target}"]`) : null;
      if (!el) {
        setBox(null);
        if (cur.target && tries++ < 12) timer = window.setTimeout(find, 120);
        return;
      }
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      const r = el.getBoundingClientRect();
      setBox({ left: r.left, top: r.top, width: r.width, height: r.height });
    };
    let timer = window.setTimeout(find, 150);
    const onResize = () => find();
    window.addEventListener('resize', onResize);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', onResize);
    };
  }, [active, step, cur, setView]);

  // Teclado: → siguiente, ← anterior, Esc cierra.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, next, prev, close]);

  if (!hasClub) return null;

  if (!active) {
    if (seen) return null;
    return (
      <div className="tour-offer" role="dialog" aria-label={t('ui.tour.offerTitle')} data-tour-offer>
        <h3>{t('ui.tour.offerTitle')}</h3>
        <p>{t('ui.tour.offerBody')}</p>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn-go" onClick={start}>
            {t('ui.tour.start')}
          </button>
          <button className="btn ghost" onClick={close}>
            {t('ui.tour.later')}
          </button>
        </div>
      </div>
    );
  }

  const pad = 8;
  const style = box
    ? { left: Math.max(10, Math.min(window.innerWidth - 380, box.left)), top: Math.min(window.innerHeight - 250, box.top + box.height + pad + 8) }
    : { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };

  return (
    <div className="tour" data-tour-active data-tour-step={cur.id}>
      {box ? (
        <div className="tour-hole" style={{ left: box.left - pad, top: box.top - pad, width: box.width + pad * 2, height: box.height + pad * 2 }} />
      ) : (
        <div className="tour-dim" />
      )}
      <div className="tour-card" style={style as CSSProperties}>
        <div className="tour-count">
          {t('ui.tour.stepOf', { n: step + 1, total: TOUR_STEPS.length })}
        </div>
        <h3>{t(`ui.tour.${cur.id}.t`)}</h3>
        <p>{t(`ui.tour.${cur.id}.b`)}</p>
        <div className="row" style={{ gap: 8, marginTop: 10 }}>
          <button className="btn sm ghost" onClick={close}>
            {t('ui.tour.skip')}
          </button>
          <span className="spacer" />
          {step > 0 && (
            <button className="btn sm" onClick={prev}>
              {t('ui.tour.prev')}
            </button>
          )}
          <button className="btn-go" onClick={next} data-tour-next>
            {step === TOUR_STEPS.length - 1 ? t('ui.tour.finish') : t('ui.tour.next')}
          </button>
        </div>
      </div>
    </div>
  );
}
