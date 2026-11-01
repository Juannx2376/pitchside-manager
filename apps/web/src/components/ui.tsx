import { LOCALES, POSITION_GROUP, flagUrl, overall, positionName, positionShort, t, type Club, type CrestDesign, type Player, type Position } from '@pitchside/core';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { dominantColors, initials } from '../lib/colors';
import { useGame } from '../store/game';
import { PlayerAvatar } from './PlayerAvatar';

/** Public build: no third-party images (crests, photos) are loaded. */
export const PUBLIC_BUILD = import.meta.env.VITE_PUBLIC_BUILD === '1';

export function Panel(props: { title?: string; actions?: ReactNode; children: ReactNode; flush?: boolean; className?: string; style?: CSSProperties }) {
  return (
    <section className={`panel ${props.className ?? ''}`} style={props.style}>
      {props.title !== undefined && (
        <div className="panel-h">
          <span className="tick" />
          <h3>{props.title}</h3>
          {props.actions && <div className="actions">{props.actions}</div>}
        </div>
      )}
      <div className={`panel-b ${props.flush ? 'flush' : ''}`}>{props.children}</div>
    </section>
  );
}

export function ViewHead({ title, meta, tools }: { title: string; meta?: ReactNode; tools?: ReactNode }) {
  return (
    <div className="view-head">
      <h1>{title}</h1>
      {meta && <div className="meta">{meta}</div>}
      {tools && <div className="tools">{tools}</div>}
    </div>
  );
}

export function rateClass(v: number): string {
  if (v >= 85) return 'r1';
  if (v >= 75) return 'r2';
  if (v >= 65) return 'r3';
  if (v >= 55) return 'r4';
  return 'r5';
}
export const RATE_COLOR: Record<string, string> = { r1: 'var(--r1)', r2: 'var(--r2)', r3: 'var(--r3)', r4: 'var(--r4)', r5: 'var(--r5)' };

export function Attr({ v, margin = 0 }: { v: number; margin?: number }) {
  const r = Math.round(v);
  return (
    <span className={`v ${rateClass(r)}`} title={margin ? t('ui.scoutEstimate', { n: margin }) : undefined}>
      {margin ? `${Math.max(1, r - margin)}–${Math.min(99, r + margin)}` : r}
    </span>
  );
}

export function OvrChip({ v }: { v: number }) {
  return (
    <span className="ovr-chip" style={{ background: RATE_COLOR[rateClass(v)] }}>
      {Math.round(v)}
    </span>
  );
}

export function AttrBar({ label, v, margin = 0 }: { label: string; v: number; margin?: number }) {
  const r = Math.round(v);
  return (
    <div className="abar">
      <span className="l">{label}</span>
      <span className="n">
        <Attr v={r} margin={margin} />
      </span>
      <div className="t">
        <div style={{ width: `${r}%`, background: RATE_COLOR[rateClass(r)], opacity: margin ? 0.45 : 0.9 }} />
      </div>
    </div>
  );
}

export function PosBadge({ pos }: { pos: Position }) {
  return (
    <span className={`pos ${POSITION_GROUP[pos]}`} title={positionName(pos)}>
      {positionShort(pos)}
    </span>
  );
}

export function Stat({ k, v, tone }: { k: string; v: ReactNode; tone?: 'good' | 'bad' }) {
  return (
    <div className="statbig">
      <div className="k">{k}</div>
      <div className={`v2 ${tone ?? ''}`}>{v}</div>
    </div>
  );
}

export function Meter({ value, color }: { value: number; color?: string }) {
  return (
    <div className="meter">
      <div style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
    </div>
  );
}

export function SubTabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="subtabs">
      {tabs.map((t) => (
        <button key={t.id} className={`subtab ${value === t.id ? 'on' : ''}`} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** Escudo real (Wikipedia/Commons) o, si no hay o falla, un escudo vectorial con los colores del club. */
export function Crest({ club, size = 32 }: { club: Club; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (club.crest) return <CrestSvg design={club.crest} size={size} label={club.name} />;
  if (club.logo && !failed && !PUBLIC_BUILD) {
    return (
      <img
        className="crest-img"
        src={club.logo}
        alt={club.name}
        width={size}
        height={size}
        loading="lazy"
        crossOrigin="anonymous"
        onError={() => setFailed(true)}
        onLoad={(e) => {
          // Clubes sin colores oficiales en los datos: se toman del escudo (una sola vez).
          if (club.colorsKnown) return;
          const cols = dominantColors(e.currentTarget);
          if (cols) {
            club.colors = cols;
            club.colorsKnown = true;
            if (club.isUser) useGame.setState((s) => ({ version: s.version + 1 }));
          }
        }}
      />
    );
  }
  const [c1, c2] = club.colors;
  const id = `cg-${club.id}`;
  return (
    <svg width={size} height={size} viewBox="0 0 40 46" style={{ flex: 'none' }} aria-label={club.name}>
      <defs>
        <clipPath id={id}>
          <path d="M20 1 L38 6 V22 C38 34 30 41 20 45 C10 41 2 34 2 22 V6 Z" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>
        <rect width="40" height="46" fill={c1} />
        <path d="M0 30 L40 14 V46 H0 Z" fill={c2} opacity="0.9" />
      </g>
      <path d="M20 1 L38 6 V22 C38 34 30 41 20 45 C10 41 2 34 2 22 V6 Z" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="1.5" />
      <text x="20" y="27" textAnchor="middle" fontFamily="Barlow Condensed, sans-serif" fontWeight="800" fontSize="15" fill="#fff" stroke="rgba(0,0,0,.45)" strokeWidth="0.6">
        {initials(club.name)}
      </text>
    </svg>
  );
}

const SHAPES: Record<CrestDesign['shape'], string> = {
  shield: 'M50 4 L94 16 V54 C94 82 74 100 50 112 C26 100 6 82 6 54 V16 Z',
  classic: 'M8 6 H92 V58 C92 86 72 104 50 112 C28 104 8 86 8 58 Z',
  modern: 'M14 6 H86 L94 20 V70 L50 112 L6 70 V20 Z',
  round: 'M50 6 A53 53 0 1 1 49.9 6 Z',
  diamond: 'M50 2 L96 58 L50 114 L4 58 Z',
};

const SYMBOLS: Record<Exclude<CrestDesign['symbol'], 'none'>, string> = {
  star: 'M50 30 L56 47 L74 47 L60 58 L65 76 L50 65 L35 76 L40 58 L26 47 L44 47 Z',
  ball: 'M50 34 A22 22 0 1 1 49.9 34 Z M50 46 L58 52 L55 62 L45 62 L42 52 Z',
  crown: 'M28 70 L30 42 L41 54 L50 36 L59 54 L70 42 L72 70 Z',
  lion: 'M36 72 C30 60 32 44 44 38 C50 30 62 32 66 42 C74 46 72 58 66 62 L68 74 L58 70 L52 76 L46 70 Z',
  eagle: 'M50 36 L56 46 L80 40 L66 56 L72 60 L58 62 L54 78 L50 70 L46 78 L42 62 L28 60 L34 56 L20 40 L44 46 Z',
  castle: 'M30 76 V48 H36 V42 H42 V48 H47 V40 H53 V48 H58 V42 H64 V48 H70 V76 H56 V64 C56 58 44 58 44 64 V76 Z',
  bolt: 'M56 30 L36 60 H50 L44 82 L66 50 H52 Z',
  anchor: 'M48 32 H52 V38 H60 V42 H52 V72 C60 70 66 64 68 58 L64 58 L70 50 L74 60 L71 58 C68 70 60 78 50 78 C40 78 32 70 29 58 L26 60 L30 50 L36 58 L32 58 C34 64 40 70 48 72 V42 H40 V38 H48 Z',
  tree: 'M50 28 L70 56 H60 L72 70 H54 V80 H46 V70 H28 L40 56 H30 Z',
};

/** Vector crest from the custom-club designer. */
export function CrestSvg({ design, size = 32, label }: { design: CrestDesign; size?: number; label?: string }) {
  const id = useMemo(() => `cr-${Math.random().toString(36).slice(2, 9)}`, []);
  const { primary: p, secondary: s, accent: a } = design;
  const pattern = (() => {
    switch (design.pattern) {
      case 'stripes':
        return [18, 42, 66, 90].map((x) => <rect key={x} x={x - 6} y={0} width={12} height={120} fill={s} />);
      case 'hoops':
        return [20, 50, 80, 110].map((y) => <rect key={y} x={0} y={y - 8} width={100} height={14} fill={s} />);
      case 'half':
        return <rect x={50} y={0} width={50} height={120} fill={s} />;
      case 'sash':
        return <path d="M0 20 L20 0 L100 90 L100 120 L80 120 L0 30 Z" fill={s} />;
      case 'quarters':
        return (
          <>
            <rect x={50} y={0} width={50} height={58} fill={s} />
            <rect x={0} y={58} width={50} height={62} fill={s} />
          </>
        );
      case 'chevron':
        return <path d="M0 40 L50 72 L100 40 L100 62 L50 94 L0 62 Z" fill={s} />;
      default:
        return null;
    }
  })();
  return (
    <svg width={size} height={size * 1.16} viewBox="0 0 100 116" style={{ flex: 'none' }} aria-label={label}>
      <defs>
        <clipPath id={id}>
          <path d={SHAPES[design.shape]} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>
        <rect width="100" height="120" fill={p} />
        {pattern}
      </g>
      <path d={SHAPES[design.shape]} fill="none" stroke={a} strokeWidth="5" />
      {design.symbol !== 'none' && <path d={SYMBOLS[design.symbol]} fill={a} stroke="rgba(0,0,0,.35)" strokeWidth="1.2" />}
      {design.initials && (
        <text x="50" y={design.symbol === 'none' ? 66 : 100} textAnchor="middle" fontFamily="Barlow Condensed, sans-serif" fontWeight="800" fontSize={design.symbol === 'none' ? 30 : 15} fill={a} stroke="rgba(0,0,0,.4)" strokeWidth="0.8">
          {design.initials.slice(0, 4)}
        </text>
      )}
    </svg>
  );
}

/** Language selector with flags (English default, Spanish, Portuguese-Brazil, Russian). */
export function LanguagePicker({ compact = false }: { compact?: boolean }) {
  const locale = useGame((s) => s.locale);
  const setLanguage = useGame((s) => s.setLanguage);
  return (
    <div className="lang-pick" role="radiogroup" aria-label={t('ui.language')}>
      {LOCALES.map((l) => (
        <button key={l.id} className={`lang-btn ${locale === l.id ? 'on' : ''}`} onClick={() => setLanguage(l.id)} title={l.name} role="radio" aria-checked={locale === l.id}>
          <Flag code={l.flag} size={compact ? 18 : 22} />
          {!compact && <span>{l.name}</span>}
        </button>
      ))}
    </div>
  );
}

export function Flag({ code, size = 20 }: { code: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const url = flagUrl(code, size >= 30 ? 80 : 40);
  if (!url || failed) return <span className="tag" style={{ fontSize: 9, padding: '0 3px' }}>{code}</span>;
  return <img className="flag" src={url} alt={code} width={size} height={Math.round(size * 0.7)} loading="lazy" onError={() => setFailed(true)} />;
}

/** Foto del jugador (FC 26) o silueta con los colores de su club. */
export function Face({ player, size = 40, club }: { player: Player; size?: number; club?: Club | null }) {
  const [failed, setFailed] = useState(false);
  if (player.photo && !failed && !PUBLIC_BUILD) {
    return <img className="face" src={player.photo} alt="" width={size} height={size} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
  }
  return <PlayerAvatar player={player} club={club} size={size} />;
}

export interface Column<T> {
  key: string;
  label: string;
  num?: boolean;
  render: (row: T) => ReactNode;
  sort?: (row: T) => number | string;
  width?: number;
}

/** Tabla densa: ordenable por columna y navegable con ↑/↓, Enter abre la ficha. */
export function StatGrid<T>(props: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (r: T) => string;
  onOpen?: (r: T) => void;
  rowClass?: (r: T) => string;
  initialSort?: { key: string; dir: 1 | -1 };
  maxHeight?: string;
  limit?: number;
}) {
  const [sort, setSort] = useState(props.initialSort ?? null);
  const [sel, setSel] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const sorted = useMemo(() => {
    let rows = props.rows;
    const col = sort ? props.columns.find((c) => c.key === sort.key) : undefined;
    if (sort && col?.sort) {
      const get = col.sort;
      rows = [...rows].sort((a, b) => {
        const x = get(a);
        const y = get(b);
        return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
      });
    }
    return props.limit ? rows.slice(0, props.limit) : rows;
  }, [props.rows, props.columns, sort, props.limit]);

  useEffect(() => {
    if (sel >= sorted.length) setSel(Math.max(0, sorted.length - 1));
  }, [sorted.length, sel]);
  useEffect(() => {
    wrapRef.current?.querySelector('tr.sel')?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      setSel((s) => Math.min(sorted.length - 1, s + 1));
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      setSel((s) => Math.max(0, s - 1));
      e.preventDefault();
    } else if (e.key === 'Enter' && sorted[sel]) props.onOpen?.(sorted[sel]);
  };

  return (
    <div className="grid-wrap" tabIndex={0} onKeyDown={onKey} ref={wrapRef} style={{ maxHeight: props.maxHeight }}>
      <table className="tbl">
        <thead>
          <tr>
            {props.columns.map((c) => (
              <th
                key={c.key}
                className={`${c.num ? 'n' : ''} ${c.sort ? 'sortable' : ''}`}
                style={{ width: c.width }}
                onClick={() => c.sort && setSort((s) => ({ key: c.key, dir: s?.key === c.key ? ((-s.dir) as 1 | -1) : c.num ? -1 : 1 }))}
              >
                {c.label}
                {sort?.key === c.key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={props.rowKey(r)} className={`${i === sel ? 'sel' : ''} ${props.rowClass?.(r) ?? ''}`} onClick={() => setSel(i)} onDoubleClick={() => props.onOpen?.(r)}>
              {props.columns.map((c) => (
                <td key={c.key} className={c.num ? 'n' : ''}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PlayerCard({ p, club, onClick, right }: { p: Player; club?: Club | null; onClick?: () => void; right?: ReactNode }) {
  return (
    <div className="pcard" onClick={onClick}>
      <Face player={p} club={club} size={46} />
      <div style={{ minWidth: 0 }}>
        <div className="nm ellipsis">{p.lastName}</div>
        <div className="meta">
          <PosBadge pos={p.position} /> <Flag code={p.nationality} size={16} /> {t('ui.ageN', { n: p.age })}
        </div>
      </div>
      <div className="row nw">
        {right}
        <OvrChip v={overall(p)} />
      </div>
    </div>
  );
}

export function Toast({ msg }: { msg: string | null }) {
  return msg ? <div className="toast">{msg}</div> : null;
}

export function ClubName({ club, onOpen, size = 20 }: { club: Club; onOpen?: (id: string) => void; size?: number }) {
  return (
    <span className={`row nw ${onOpen ? 'link' : ''}`} style={{ gap: 7 }} onClick={onOpen ? () => onOpen(club.id) : undefined}>
      <Crest club={club} size={size} />
      <span className="ellipsis">{club.name}</span>
    </span>
  );
}
