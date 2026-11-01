// Utilidades de color: el acento de la interfaz sale de los colores del club del usuario.

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0').slice(0, 6);
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function saturation(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

function lighten(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex).map((v) => Math.round(v + (255 - v) * amount));
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** Elige el color del club más vistoso y lo aclara hasta que contraste sobre fondo oscuro. */
export function accentFromClub(colors: [string, string]): { accent: string; ink: string } {
  const candidates = colors.filter((c) => /^#[0-9a-f]{3,6}$/i.test(c));
  let best = candidates.sort((a, b) => saturation(b) * 2 + luminance(b) - (saturation(a) * 2 + luminance(a)))[0] ?? '#00d27a';
  // Blanco/negro puros no sirven como acento: se usa un verde neutro de marca.
  if (saturation(best) < 0.18) best = '#00d27a';
  let steps = 0;
  while (luminance(best) < 0.18 && steps < 8) {
    best = lighten(best, 0.15);
    steps++;
  }
  return { accent: best, ink: luminance(best) > 0.4 ? '#0b0c0f' : '#ffffff' };
}

/**
 * Dos colores dominantes de un escudo ya cargado (con CORS). Ignora transparencias,
 * agrupa por cubetas de color y prioriza los tonos saturados; el blanco/negro sólo entra
 * como segundo color si no hay otro.
 */
export function dominantColors(img: HTMLImageElement): [string, string] | null {
  const size = 28;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, size, size);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, size, size).data;
  } catch {
    return null;
  }
  const buckets = new Map<string, { n: number; r: number; g: number; b: number; sat: number }>();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const key = `${r >> 5}-${g >> 5}-${b >> 5}`;
    const max = Math.max(r, g, b);
    const sat = max === 0 ? 0 : (max - Math.min(r, g, b)) / max;
    const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0, sat: 0 };
    e.n++;
    e.r += r;
    e.g += g;
    e.b += b;
    e.sat += sat;
    buckets.set(key, e);
  }
  const cols = [...buckets.values()]
    .filter((e) => e.n >= 4)
    .map((e) => ({ n: e.n, sat: e.sat / e.n, hex: toHex(e.r / e.n, e.g / e.n, e.b / e.n) }))
    .sort((a, b) => b.n * (0.35 + b.sat) - a.n * (0.35 + a.sat));
  if (cols.length === 0) return null;
  const vivid = cols.filter((c) => c.sat > 0.3);
  const first = (vivid[0] ?? cols[0]).hex;
  const second = cols.find((c) => c.hex !== first && colorDistance(c.hex, first) > 90)?.hex ?? '#ffffff';
  return [first, second];
}

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

function colorDistance(a: string, b: string): number {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

export function initials(name: string): string {
  const words = name.replace(/[^\p{L}\s]/gu, '').split(/\s+/).filter((w) => w.length > 2);
  return (words.length >= 2 ? words[0][0] + words[1][0] : (words[0] ?? name).slice(0, 2)).toUpperCase();
}
