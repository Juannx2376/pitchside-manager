// Valor de mercado que el usuario puede ver: el real sólo para los suyos; los ajenos, la estimación del ojeador.
import { latestReportFor, playerValue, type GameState, type Player } from '@pitchside/core';

/** null = desconocido (jugador ajeno sin informe de ojeo). */
export function displayValue(g: GameState, p: Player): number | null {
  const uid = g.userClubId;
  if (uid && p.clubId === uid) return playerValue(g, p);
  if (!uid) return null;
  const r = latestReportFor(g, p.id, uid);
  return r ? r.estimatedValue : null;
}
