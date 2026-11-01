// Modelo de la cancha que se actualiza al instante con los ajustes de equipo (estilo Soccer Manager):
// flechas de ataque por banda, línea y ancho del bloque, zona de presión, salida de balón, marcaje,
// transición y, en balón parado, la jugada de córner o de falta. Es sólo una vista: lee la `Tactic`.
import { t, type Tactic } from '@pitchside/core';
import { Pitch } from './Pitch';

type Mode = 'team' | 'setpieces';

const BLUE = '#4f8cff';
const LANES = { left: 18, center: 50, right: 82 } as const;

function Arrow({ x1, y1, x2, y2, color = 'var(--accent)', w = 1.6, o = 1, dash }: { x1: number; y1: number; x2: number; y2: number; color?: string; w?: number; o?: number; dash?: string }) {
  return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={w} strokeOpacity={o} strokeDasharray={dash} strokeLinecap="round" markerEnd="url(#td-head)" style={{ color }} />;
}

export function TacticDiagram({ tactic, mode }: { tactic: Tactic; mode: Mode }) {
  const side = tactic.attackSide ?? 'balanced';
  const build = tactic.buildUpStyle ?? 'balanced';
  const approach = tactic.defensiveApproach ?? 'balanced';
  const marking = tactic.marking ?? 'zonal';
  const transition = tactic.transition ?? 'balanced';
  const depth = tactic.depth ?? tactic.sliders.defensiveLine;
  const amp = tactic.amplitude ?? tactic.sliders.width;
  const press = Math.min(100, tactic.sliders.pressing + (approach === 'aggressive_press' ? 15 : approach === 'low_block' ? -20 : 0));
  const lineY = 88 - depth * 0.43;
  const half = (28 + amp * 0.5) / 2;
  const sideW = (k: keyof typeof LANES) => (side === 'balanced' ? { w: 2.4, o: 0.75 } : side === k ? { w: 3.6, o: 1 } : { w: 1.2, o: 0.28 });

  return (
    <div className="td-wrap">
      <Pitch maxWidth={300} noLanes>
        <svg className="pitch-arrows" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <marker id="td-head" markerUnits="userSpaceOnUse" markerWidth="5" markerHeight="5" refX="2.5" refY="2.5" orient="auto">
              <path d="M0 0 L5 2.5 L0 5 Z" fill="currentColor" />
            </marker>
          </defs>

          {/* Zona de presión en campo rival */}
          <rect x="6" y="4" width="88" height={Math.max(4, 6 + press * 0.38)} fill="var(--warn)" opacity="0.13" />

          {/* Bloque: ancho y línea defensiva */}
          <rect x={50 - half} y={lineY} width={half * 2} height={94 - lineY} rx="3" fill={BLUE} opacity="0.1" />
          <line x1={50 - half} y1={lineY} x2={50 + half} y2={lineY} stroke={BLUE} strokeWidth="1" strokeDasharray="3 2" />

          {mode === 'team' && (
            <>
              {/* Ataque por bandas */}
              {(['left', 'center', 'right'] as const).map((k) => {
                const s = sideW(k);
                return <Arrow key={k} x1={LANES[k]} y1={Math.min(70, lineY - 4)} x2={LANES[k]} y2={16} w={s.w} o={s.o} />;
              })}

              {/* Salida de balón */}
              {build === 'short_pass' && (
                <g>
                  <Arrow x1={50} y1={91} x2={36} y2={80} color="#fff" w={0.9} o={0.8} />
                  <Arrow x1={36} y1={80} x2={50} y2={68} color="#fff" w={0.9} o={0.8} />
                  <Arrow x1={50} y1={68} x2={64} y2={56} color="#fff" w={0.9} o={0.8} />
                </g>
              )}
              {build === 'long_ball' && <Arrow x1={50} y1={91} x2={50} y2={12} color="#fff" w={1} o={0.85} dash="3 2" />}
              {build === 'counter' && (
                <g>
                  <Arrow x1={50} y1={72} x2={20} y2={24} color="#fff" w={1.1} o={0.9} />
                  <Arrow x1={50} y1={72} x2={80} y2={24} color="#fff" w={1.1} o={0.9} />
                </g>
              )}
              {build === 'balanced' && (
                <g>
                  <Arrow x1={50} y1={91} x2={50} y2={70} color="#fff" w={0.9} o={0.8} />
                  <Arrow x1={50} y1={70} x2={62} y2={46} color="#fff" w={0.9} o={0.8} />
                </g>
              )}

              {/* Marcaje */}
              {marking !== 'man' &&
                [24, 42, 58, 76].map((x) => <rect key={x} x={x - 7} y={Math.max(lineY + 3, 60)} width="14" height="18" rx="2" fill="none" stroke="#fff" strokeOpacity="0.45" strokeDasharray="2 2" strokeWidth="0.6" />)}
              {marking !== 'zonal' &&
                [28, 46, 64, 82].map((x) => (
                  <g key={x}>
                    <ellipse cx={x} cy={Math.max(lineY + 8, 66)} rx="1.8" ry="1.2" fill={BLUE} />
                    <ellipse cx={x + 4} cy={Math.max(lineY + 3, 61)} rx="1.8" ry="1.2" fill="var(--bad)" />
                    <line x1={x} y1={Math.max(lineY + 8, 66)} x2={x + 4} y2={Math.max(lineY + 3, 61)} stroke="#fff" strokeWidth="0.6" />
                  </g>
                ))}

              {/* Transición */}
              {transition === 'counterPress' && <ellipse cx="50" cy="46" rx="13" ry="8.4" fill="none" stroke="var(--warn)" strokeWidth="1.2" strokeDasharray="3 2" />}
              {transition === 'regroup' && (
                <g>
                  <Arrow x1={30} y1={40} x2={30} y2={lineY - 2} color={BLUE} w={1} o={0.8} />
                  <Arrow x1={70} y1={40} x2={70} y2={lineY - 2} color={BLUE} w={1} o={0.8} />
                </g>
              )}
            </>
          )}

          {mode === 'setpieces' && (
            <g>
              {/* Córner a favor (desde la esquina derecha) */}
              <ellipse cx="96" cy="4" rx="1.6" ry="1" fill="#fff" />
              {tactic.cornerStyle === 'near' && <Arrow x1={95} y1={5} x2={56} y2={13} w={2.4} />}
              {tactic.cornerStyle === 'far' && <Arrow x1={95} y1={5} x2={42} y2={13} w={2.4} />}
              {tactic.cornerStyle === 'short' && (
                <g>
                  <Arrow x1={95} y1={5} x2={84} y2={14} w={2} />
                  <Arrow x1={84} y1={14} x2={58} y2={14} w={2} />
                </g>
              )}
              {(tactic.cornerStyle ?? 'mixed') === 'mixed' && (
                <g>
                  <Arrow x1={95} y1={5} x2={56} y2={13} w={1.6} o={0.8} />
                  <Arrow x1={95} y1={5} x2={42} y2={13} w={1.6} o={0.8} />
                  <Arrow x1={95} y1={5} x2={84} y2={14} w={1.6} o={0.8} />
                </g>
              )}
              {/* Falta frontal */}
              <ellipse cx="32" cy="38" rx="1.6" ry="1" fill="#fff" />
              {tactic.freeKickStyle === 'shoot' && <Arrow x1={32} y1={38} x2={50} y2={5} w={2.6} color="var(--warn)" />}
              {tactic.freeKickStyle === 'cross' && <Arrow x1={32} y1={38} x2={58} y2={14} w={2.6} color="var(--warn)" />}
              {(tactic.freeKickStyle ?? 'mixed') === 'mixed' && (
                <g>
                  <Arrow x1={32} y1={38} x2={50} y2={5} w={1.6} color="var(--warn)" o={0.8} />
                  <Arrow x1={32} y1={38} x2={58} y2={14} w={1.6} color="var(--warn)" o={0.8} />
                </g>
              )}
            </g>
          )}
        </svg>
      </Pitch>
      <ul className="td-legend">
        {mode === 'team' ? (
          <>
            <li>
              <i style={{ background: 'var(--accent)' }} />
              {t('ui.tv3.attackSide')}: <b>{t(`ui.side.${side}`)}</b>
            </li>
            <li>
              <i style={{ background: '#fff' }} />
              {t('ui.v2.buildUpStyle')}: <b>{t(`ui.v2.buildup.${build}`)}</b>
            </li>
            <li>
              <i style={{ background: BLUE }} />
              {t('ui.v2.defensiveApproach')}: <b>{t(`ui.v2.approach.${approach}`)}</b>
            </li>
            <li>
              <i style={{ background: 'var(--warn)' }} />
              {t('ui.tv3.transition')}: <b>{t(`ui.trans.${transition}`)}</b> · {t('ui.tv3.marking')}: <b>{t(`ui.mark.${marking}`)}</b>
            </li>
          </>
        ) : (
          <>
            <li>
              <i style={{ background: 'var(--accent)' }} />
              {t('ui.tv3.corners')}: <b>{t(`ui.corner.${tactic.cornerStyle ?? 'mixed'}`)}</b>
            </li>
            <li>
              <i style={{ background: 'var(--warn)' }} />
              {t('ui.tv3.freeKicks')}: <b>{t(`ui.fk.${tactic.freeKickStyle ?? 'mixed'}`)}</b>
            </li>
          </>
        )}
      </ul>
    </div>
  );
}
