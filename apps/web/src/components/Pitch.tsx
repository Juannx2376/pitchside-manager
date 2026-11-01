// Campo vertical compartido (pizarra táctica y mapa de posiciones de la ficha del jugador).
// Las coordenadas de los huecos del juego son x: 0 izquierda → 100 derecha, y: 0 portería rival (arriba)
// → 100 portería propia (abajo), así que aquí un hueco se coloca tal cual en left/top (en %).
import type { DragEventHandler, MouseEventHandler, ReactNode, Ref } from 'react';
import { usePrefs } from '../lib/prefs';

interface PitchProps {
  children?: ReactNode;
  /** Intensidad 0-1 por carril (izq → der): tiñe el carril. Si falta, sólo se dibujan las guías. */
  laneTint?: number[];
  /** Ancho máximo en px (por defecto 440). */
  maxWidth?: number;
  className?: string;
  innerRef?: Ref<HTMLDivElement>;
  onClick?: MouseEventHandler<HTMLDivElement>;
  onDragOver?: DragEventHandler<HTMLDivElement>;
  onDrop?: DragEventHandler<HTMLDivElement>;
  /** Fuerza ocultar las guías de carriles (p. ej. en el mapa de la ficha). */
  noLanes?: boolean;
}

export function Pitch({ children, laneTint, maxWidth = 440, className = '', innerRef, onClick, onDragOver, onDrop, noLanes }: PitchProps) {
  const lanes = usePrefs((s) => s.lanes) && !noLanes;
  return (
    <div className={`pitch-v ${className}`} style={{ maxWidth }} ref={innerRef} onClick={onClick} onDragOver={onDragOver} onDrop={onDrop}>
      {lanes && laneTint && (
        <div className="pitch-lanes" aria-hidden="true">
          {laneTint.map((v, i) => (
            <span key={i} style={{ background: `color-mix(in srgb, var(--accent) ${Math.round(Math.max(0, Math.min(1, v)) * 22)}%, transparent)` }} />
          ))}
        </div>
      )}
      <svg viewBox="0 0 68 105" className="pitch-lines" preserveAspectRatio="none" aria-hidden="true">
        <g fill="none" stroke="var(--pitch-line)" strokeWidth="0.45">
          <rect x="2" y="2" width="64" height="101" />
          <line x1="2" y1="52.5" x2="66" y2="52.5" />
          <circle cx="34" cy="52.5" r="9.15" />
          <rect x="13.85" y="2" width="40.3" height="16.5" />
          <rect x="24.85" y="2" width="18.3" height="5.5" />
          <path d="M26.7 18.5 A9.15 9.15 0 0 0 41.3 18.5" />
          <rect x="13.85" y="86.5" width="40.3" height="16.5" />
          <rect x="24.85" y="97.5" width="18.3" height="5.5" />
          <path d="M26.7 86.5 A9.15 9.15 0 0 1 41.3 86.5" />
          <rect x="29" y="0.4" width="10" height="1.6" />
          <rect x="29" y="103" width="10" height="1.6" />
        </g>
        {lanes && (
          <g stroke="var(--pitch-line)" strokeWidth="0.25" strokeDasharray="1.2 1.6" opacity="0.55">
            {[1, 2, 3, 4].map((k) => (
              <line key={k} x1={(68 * k) / 5} y1="2" x2={(68 * k) / 5} y2="103" />
            ))}
          </g>
        )}
      </svg>
      {children}
    </div>
  );
}
