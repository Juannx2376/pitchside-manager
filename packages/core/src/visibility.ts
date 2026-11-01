// Qué se le permite saber al usuario sobre el potencial de un jugador.
// Propio → exacto · ojeado → rango aproximado del informe · resto → oculto.
import type { GameState } from './state';
import type { Id } from './types';
import type { Player } from './player';
import { latestReportFor } from './signing';

export type PotentialView = { kind: 'hidden' } | { kind: 'range'; lo: number; hi: number } | { kind: 'exact'; value: number };

export function potentialView(state: GameState, p: Player, viewerClubId: Id | null | undefined = state.userClubId): PotentialView {
  if (!viewerClubId) return { kind: 'hidden' };
  if (p.clubId === viewerClubId) return { kind: 'exact', value: p.potential };
  const r = latestReportFor(state, p.id, viewerClubId);
  if (!r) return { kind: 'hidden' };
  return { kind: 'range', lo: r.potentialRange[0], hi: r.potentialRange[1] };
}

/** Texto corto "x–y" / "84" o null si está oculto. */
export function potentialLabel(v: PotentialView): string | null {
  if (v.kind === 'exact') return String(v.value);
  if (v.kind === 'range') return `${v.lo}–${v.hi}`;
  return null;
}

/** Estrellas (1-5) de margen de crecimiento; null si el usuario no puede saberlo. */
export function growthStars(p: Player, ovr: number, v: PotentialView): number | null {
  if (v.kind === 'hidden') return null;
  const pot = v.kind === 'exact' ? v.value : Math.round((v.lo + v.hi) / 2);
  const room = pot - ovr;
  return p.age >= 30 ? 1 : room >= 14 ? 5 : room >= 9 ? 4 : room >= 5 ? 3 : room >= 2 ? 2 : 1;
}
