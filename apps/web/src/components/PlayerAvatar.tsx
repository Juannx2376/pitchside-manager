// Avatar procedural determinista (sin fotos de terceros): piel, peinado, barba y camiseta del club.
import { hashString, type Club, type Player } from '@pitchside/core';

const SKIN = ['#f3d2b3', '#e8b98f', '#d19a6c', '#b57a50', '#8d5a36', '#5e3b22'];
const HAIR = ['#14110f', '#2b1d12', '#4a2f1b', '#7a5230', '#b8863b', '#d8cfc4', '#7d2f1f'];
const HAIR_STYLES = 7;

/** Número pseudoaleatorio estable en [0, 1) para cada rasgo del avatar. */
function pick(seed: number, salt: number): number {
  let x = (seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

export function avatarTraits(id: string): { skin: string; hair: string; style: number; beard: number; brows: number } {
  const seed = hashString(id);
  return {
    skin: SKIN[Math.floor(pick(seed, 1) * SKIN.length)],
    hair: HAIR[Math.floor(pick(seed, 2) * HAIR.length)],
    style: Math.floor(pick(seed, 3) * HAIR_STYLES),
    beard: pick(seed, 4) < 0.28 ? 1 : pick(seed, 4) < 0.4 ? 2 : 0,
    brows: Math.floor(pick(seed, 5) * 3),
  };
}

function hairShape(style: number, c: string): JSX.Element | null {
  switch (style) {
    case 0: // rapado
      return <path d="M12.5 15 C12.5 8 27.5 8 27.5 15 C25 11.5 15 11.5 12.5 15Z" fill={c} opacity="0.75" />;
    case 1: // corto
      return <path d="M12 16 C11 6 29 6 28 16 C26 11 14 11 12 16Z" fill={c} />;
    case 2: // tupé
      return <path d="M12 16 C10 4 30 3 28 16 C27 10 22 8 12 16Z" fill={c} />;
    case 3: // largo
      return (
        <>
          <path d="M11.5 18 C9 4 31 4 28.5 18 L28.5 24 L26 18 C24 11 16 11 14 18 L11.5 24Z" fill={c} />
        </>
      );
    case 4: // rizado
      return (
        <>
          <circle cx="14" cy="11" r="3.2" fill={c} />
          <circle cx="20" cy="9" r="3.6" fill={c} />
          <circle cx="26" cy="11" r="3.2" fill={c} />
          <circle cx="12.5" cy="15" r="2.4" fill={c} />
          <circle cx="27.5" cy="15" r="2.4" fill={c} />
        </>
      );
    case 5: // melena de lado
      return <path d="M12 17 C10 5 30 5 28 15 C26 9 17 9 12 17Z M12 17 L11 22 L14 17Z" fill={c} />;
    default: // calvo con orla
      return <path d="M12.3 16 C12.5 13 14 12 15 12.5 L15 15Z M27.7 16 C27.5 13 26 12 25 12.5 L25 15Z" fill={c} />;
  }
}

export function PlayerAvatar({ player, club, size = 40 }: { player: Player; club?: Club | null; size?: number }) {
  const a = avatarTraits(player.id);
  const kit = club?.colors[0] ?? '#3a4252';
  const trim = club?.colors[1] ?? '#cfd6e3';
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ flex: 'none', background: '#1d222b' }} role="img" aria-label={player.lastName}>
      <path d="M4 40 C5 29 12 26 20 26 C28 26 35 29 36 40Z" fill={kit} />
      <path d="M16.5 26 L20 31 L23.5 26Z" fill={trim} />
      <rect x="17.2" y="21" width="5.6" height="6" rx="2" fill={a.skin} />
      <ellipse cx="20" cy="16" rx="8" ry="9.2" fill={a.skin} />
      {hairShape(a.style, a.hair)}
      <circle cx="16.6" cy="16.2" r="0.9" fill="#1b1410" />
      <circle cx="23.4" cy="16.2" r="0.9" fill="#1b1410" />
      <rect x={15.3} y={13.6 - a.brows * 0.2} width="2.8" height="0.8" rx="0.4" fill={a.hair} opacity="0.85" />
      <rect x={21.9} y={13.6 - a.brows * 0.2} width="2.8" height="0.8" rx="0.4" fill={a.hair} opacity="0.85" />
      <path d="M17.8 21 Q20 22.4 22.2 21" stroke="#8a4b3a" strokeWidth="0.8" fill="none" strokeLinecap="round" />
      {a.beard === 1 && <path d="M12.5 17 C12.5 26 27.5 26 27.5 17 C25 22 15 22 12.5 17Z" fill={a.hair} opacity="0.85" />}
      {a.beard === 2 && <path d="M15 21.3 Q20 24 25 21.3 Q20 22.4 15 21.3Z" fill={a.hair} opacity="0.8" />}
    </svg>
  );
}
