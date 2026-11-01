// Manager avatar presets (stylised SVG faces; no real likenesses).
const SKIN = ['#f1c7a5', '#e0ac85', '#c68a62', '#8d5a3b', '#f5d6bc', '#b07650', '#6b4329', '#d9a27c'];
const HAIR = ['#2b1d14', '#1a1a1a', '#6b4423', '#c9a15b', '#8a8a8a', '#3b2a1e', '#0f0f0f', '#a0522d'];
const SUIT = ['#1f2937', '#0f172a', '#334155', '#1e3a8a', '#3f3f46', '#111827', '#374151', '#4b5563'];

export function Avatar({ index = 0, size = 40 }: { index?: number; size?: number }) {
  const i = Math.abs(index) % SKIN.length;
  const bald = i === 4;
  const beard = i % 3 === 1;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ flex: 'none', background: '#1d222b', borderRadius: 4 }}>
      <path d="M4 40 C5 30 12 27 20 27 C28 27 35 30 36 40 Z" fill={SUIT[i]} />
      <path d="M17 27 L20 33 L23 27 Z" fill="#e5e7eb" />
      <path d="M19.2 29 L20 34 L20.8 29 Z" fill="#b91c1c" />
      <ellipse cx="20" cy="17" rx="7.5" ry="8.5" fill={SKIN[i]} />
      {!bald && <path d={i % 2 ? 'M12.5 15 C12 7 28 6 27.5 15 C26 11 14 11 12.5 15 Z' : 'M12.4 16 C11 6 29 6 27.6 16 L26 12 C22 9 17 10 14 12 Z'} fill={HAIR[i]} />}
      {beard && <path d="M13.5 19 C14 26 26 26 26.5 19 C25 23 15 23 13.5 19 Z" fill={HAIR[i]} opacity="0.85" />}
      <circle cx="17" cy="17" r="0.9" fill="#1f2937" />
      <circle cx="23" cy="17" r="0.9" fill="#1f2937" />
    </svg>
  );
}
