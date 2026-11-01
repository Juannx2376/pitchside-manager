// Mapa mundial interactivo (d3-geo + atlas de Natural Earth 1:50m).
// Cada país del atlas se asocia a su federación FIFA; Reino Unido se asigna a Inglaterra
// (Escocia, Gales e Irlanda del Norte se eligen desde el panel lateral).
import { COUNTRIES } from '@pitchside/core';
import { geoNaturalEarth1, geoPath } from 'd3-geo';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import atlas from 'world-atlas/countries-50m.json';

const ALIASES: Record<string, string> = {
  'united kingdom': 'ENG',
  turkey: 'TUR',
  ireland: 'IRL',
  'bosnia and herz.': 'BIH',
  macedonia: 'MKD',
  'faeroe is.': 'FRO',
  'united states of america': 'USA',
  'dominican rep.': 'DOM',
  'antigua and barb.': 'ATG',
  'st. vin. and gren.': 'VIN',
  'st. kitts and nevis': 'SKN',
  'cayman is.': 'CAY',
  'turks and caicos is.': 'TCA',
  'british virgin is.': 'VGB',
  'u.s. virgin is.': 'VIR',
  "côte d'ivoire": 'CIV',
  'dem. rep. congo': 'COD',
  'cabo verde': 'CPV',
  'eq. guinea': 'EQG',
  'central african rep.': 'CTA',
  's. sudan': 'SSD',
  'são tomé and principe': 'STP',
  'south korea': 'KOR',
  china: 'CHN',
  iran: 'IRN',
  'north korea': 'PRK',
  kyrgyzstan: 'KGZ',
  'hong kong': 'HKG',
  taiwan: 'TPE',
  macao: 'MAC',
  brunei: 'BRU',
  'fr. polynesia': 'TAH',
  'solomon is.': 'SOL',
  'cook is.': 'COK',
  somaliland: 'SOM',
  'n. cyprus': 'CYP',
  eswatini: 'SWZ',
};

const NAME_TO_CODE = new Map<string, string>(COUNTRIES.map((c) => [c.nameEn.toLowerCase(), c.code]));
for (const [k, v] of Object.entries(ALIASES)) NAME_TO_CODE.set(k, v);

interface Shape {
  key: string;
  code: string | null;
  name: string;
  d: string;
  centroid: [number, number];
}

const W = 960;
const H = 500;

function useShapes(): Shape[] {
  return useMemo(() => {
    const topo = atlas as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>;
    const fc = feature(topo, topo.objects.countries) as FeatureCollection<Geometry, { name: string }>;
    const features = fc.features.filter((f) => f.properties.name !== 'Antarctica');
    const projection = geoNaturalEarth1().fitExtent(
      [
        [4, 4],
        [W - 4, H - 4],
      ],
      { type: 'FeatureCollection', features } as FeatureCollection,
    );
    const path = geoPath(projection);
    return features.map((f: Feature<Geometry, { name: string }>, i) => ({
      key: `${f.id ?? i}-${f.properties.name}`,
      code: NAME_TO_CODE.get(f.properties.name.toLowerCase()) ?? null,
      name: f.properties.name,
      d: path(f) ?? '',
      centroid: path.centroid(f) as [number, number],
    }));
  }, []);
}

export interface MapMarker {
  code: string;
  color: string;
  label: string;
}

export function WorldMap(props: {
  fill: (code: string) => string;
  selected?: string | null;
  onSelect?: (code: string) => void;
  tooltip?: (code: string) => ReactNode;
  markers?: MapMarker[];
  height?: number | string;
  legend?: ReactNode;
}) {
  const shapes = useShapes();
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const [hover, setHover] = useState<{ code: string; x: number; y: number } | null>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);

  const zoomAt = (factor: number, cx = W / 2, cy = H / 2) =>
    setView((v) => {
      const k = Math.min(14, Math.max(1, v.k * factor));
      const f = k / v.k;
      return { k, x: cx - (cx - v.x) * f, y: cy - (cy - v.y) * f };
    });

  const toSvg = (clientX: number, clientY: number) => {
    const r = wrap.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return { x: ((clientX - r.left) / r.width) * W, y: ((clientY - r.top) / r.height) * H };
  };

  const byCode = useMemo(() => {
    const m = new Map<string, Shape>();
    for (const s of shapes) if (s.code && !m.has(s.code)) m.set(s.code, s);
    return m;
  }, [shapes]);

  return (
    <div
      ref={wrap}
      className={`map-wrap ${drag.current ? 'drag' : ''}`}
      style={{ height: props.height ?? 520 }}
      onWheel={(e) => {
        const p = toSvg(e.clientX, e.clientY);
        zoomAt(e.deltaY < 0 ? 1.25 : 0.8, p.x, p.y);
      }}
      onMouseDown={(e) => (drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false })}
      onMouseMove={(e) => {
        if (drag.current) {
          const r = wrap.current!.getBoundingClientRect();
          const dx = ((e.clientX - drag.current.x) / r.width) * W;
          const dy = ((e.clientY - drag.current.y) / r.height) * H;
          if (Math.abs(dx) + Math.abs(dy) > 3) drag.current.moved = true;
          setView((v) => ({ ...v, x: drag.current!.vx + dx, y: drag.current!.vy + dy }));
        }
        // El país bajo el ratón sale del propio elemento (data-code): así el tooltip nunca se queda
        // en el país anterior por usar un estado de un render viejo.
        const r = wrap.current!.getBoundingClientRect();
        const code = (e.target as Element).getAttribute?.('data-code') ?? null;
        const x = e.clientX - r.left;
        const y = e.clientY - r.top;
        setHover(code ? { code, x, y } : null);
      }}
      onMouseUp={() => setTimeout(() => (drag.current = null), 0)}
      onMouseLeave={() => {
        drag.current = null;
        setHover(null);
      }}
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
        <rect width={W} height={H} fill="#0d1016" />
        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          {shapes.map((s) => (
            <path
              key={s.key}
              className={`country ${s.code && s.code === props.selected ? 'sel' : ''}`}
              d={s.d}
              data-code={s.code ?? undefined}
              fill={s.code ? props.fill(s.code) : '#1a1e26'}
              onClick={() => {
                if (drag.current?.moved) return;
                if (s.code) props.onSelect?.(s.code);
              }}
            />
          ))}
          {props.markers?.map((m, i) => {
            const s = byCode.get(m.code);
            if (!s) return null;
            return (
              <g key={`${m.code}-${i}`} transform={`translate(${s.centroid[0]},${s.centroid[1]}) scale(${1 / view.k})`} style={{ pointerEvents: 'none' }}>
                <circle r="9" fill={m.color} opacity="0.25">
                  <animate attributeName="r" values="6;13;6" dur="2.2s" repeatCount="indefinite" />
                </circle>
                <circle r="4.5" fill={m.color} stroke="#0b0c0f" strokeWidth="1.5" />
              </g>
            );
          })}
        </g>
      </svg>
      {hover && props.tooltip && (
        <div className="map-tip" style={{ left: hover.x + 14, top: hover.y + 10 }}>
          {props.tooltip(hover.code)}
        </div>
      )}
      <div className="map-zoom">
        <button className="btn sm" onClick={() => zoomAt(1.5)}>
          +
        </button>
        <button className="btn sm" onClick={() => zoomAt(1 / 1.5)}>
          −
        </button>
        <button className="btn sm" onClick={() => setView({ k: 1, x: 0, y: 0 })}>
          ⟲
        </button>
      </div>
      {props.legend && <div className="map-legend">{props.legend}</div>}
    </div>
  );
}

/** Interpola entre dos colores hex (t ∈ [0,1]). */
export function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (p: number, s: number) => (p >> s) & 255;
  const c = [16, 8, 0].map((s) => Math.round(ch(pa, s) + (ch(pb, s) - ch(pa, s)) * Math.max(0, Math.min(1, t))));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
