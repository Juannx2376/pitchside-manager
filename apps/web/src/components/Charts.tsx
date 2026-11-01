// Minimal SVG charts (no dependencies): balance line and income/expense bars by month.
import { formatMoney } from '@pitchside/core';

export function LineChart({ points, labels, height = 160, color = 'var(--accent)' }: { points: number[]; labels: string[]; height?: number; color?: string }) {
  if (points.length < 2) return <div className="faint" style={{ height, display: 'grid', placeItems: 'center' }}>—</div>;
  const w = 600;
  const min = Math.min(0, ...points);
  const max = Math.max(1, ...points);
  const x = (i: number) => 30 + (i / (points.length - 1)) * (w - 40);
  const y = (v: number) => 10 + (1 - (v - min) / (max - min || 1)) * (height - 34);
  const d = points.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} className="chart">
      {min < 0 && <line x1={30} x2={w - 10} y1={y(0)} y2={y(0)} stroke="var(--line-2)" strokeDasharray="3 3" />}
      <path d={`${d} L${x(points.length - 1)},${y(min)} L${x(0)},${y(min)} Z`} fill={color} opacity="0.12" />
      <path d={d} fill="none" stroke={color} strokeWidth="2.5" />
      {points.map((v, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(v)} r="3" fill={color}>
            <title>
              {labels[i]}: {formatMoney(v)}
            </title>
          </circle>
          {(points.length <= 12 || i % 2 === 0) && (
            <text x={x(i)} y={height - 6} textAnchor="middle" fontSize="10" fill="var(--faint)">
              {labels[i]}
            </text>
          )}
        </g>
      ))}
      <text x={4} y={y(max) + 4} fontSize="10" fill="var(--faint)">
        {formatMoney(max)}
      </text>
    </svg>
  );
}

export function BarPairs({ income, expense, labels, height = 160 }: { income: number[]; expense: number[]; labels: string[]; height?: number }) {
  const w = 600;
  const n = Math.max(1, income.length);
  const max = Math.max(1, ...income, ...expense);
  const bw = (w - 40) / n;
  const h = (v: number) => (v / max) * (height - 30);
  return (
    <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} className="chart">
      {income.map((v, i) => (
        <g key={i}>
          <rect x={30 + i * bw + bw * 0.12} y={height - 20 - h(v)} width={bw * 0.36} height={h(v)} fill="var(--good)" opacity="0.85">
            <title>+{formatMoney(v)}</title>
          </rect>
          <rect x={30 + i * bw + bw * 0.5} y={height - 20 - h(expense[i] ?? 0)} width={bw * 0.36} height={h(expense[i] ?? 0)} fill="var(--bad)" opacity="0.85">
            <title>−{formatMoney(expense[i] ?? 0)}</title>
          </rect>
          <text x={30 + i * bw + bw / 2} y={height - 6} textAnchor="middle" fontSize="10" fill="var(--faint)">
            {labels[i]}
          </text>
        </g>
      ))}
    </svg>
  );
}
