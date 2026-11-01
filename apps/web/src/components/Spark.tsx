// Mini gráfica de la evolución de la media de un jugador (histórico mensual).
export function Spark({ values, width = 84, height = 24 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return <span className="faint">–</span>;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = Math.max(1, hi - lo);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * (width - 4) + 2},${height - 3 - ((v - lo) / span) * (height - 6)}`).join(' ');
  const up = values[values.length - 1] >= values[0];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-hidden>
      <polyline points={pts} fill="none" stroke={up ? 'var(--good)' : 'var(--bad)'} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
