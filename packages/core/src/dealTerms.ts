// Estructura financiera de los traspasos (estilo FC 27): cuotas aplazadas, primas condicionadas y
// cláusulas automáticas de contrato. No importa `transfers.ts` para evitar ciclos.
import type { Club } from './club';
import { creditSale, record, type Commitment } from './finance';
import { msg } from './i18n';
import { roundMoney } from './player';
import { addNews, newId, type GameState } from './state';
import type { Id } from './types';

/** Plazos máximos y reparto: primer pago ahora, el resto al inicio de las siguientes temporadas. */
export const MAX_INSTALMENTS = 4;
/** Partidos que debe jugar un fichaje para cobrar la prima condicionada. */
export const BONUS_APPS = 15;

export function addCommitment(state: GameState, club: Club, c: Omit<Commitment, 'id'>): Commitment {
  const full: Commitment = { ...c, id: newId(state, 'cm') };
  (club.finances.commitments ??= []).push(full);
  return full;
}

/** Reparte un traspaso en plazos: devuelve lo que se paga ahora y registra las cuotas siguientes. */
export function scheduleFee(state: GameState, buyer: Club, sellerId: Id | null, playerId: Id, fee: number, instalments: number, bonus: number): number {
  const n = Math.max(1, Math.min(MAX_INSTALMENTS, Math.round(instalments)));
  const part = n > 1 ? roundMoney(fee / n) : fee;
  const now = n > 1 ? fee - part * (n - 1) : fee;
  for (let i = 1; i < n; i++) addCommitment(state, buyer, { kind: 'instalment', playerId, toClubId: sellerId, amount: part, dueSeason: state.season + i });
  if (bonus > 0) addCommitment(state, buyer, { kind: 'bonus', playerId, toClubId: sellerId, amount: bonus, dueSeason: state.season, apps: BONUS_APPS, expiresSeason: state.season + 2 });
  return now;
}

/** Paga las cuotas que vencen en `season` (o antes). Se llama al empezar cada temporada. */
export function payInstalments(state: GameState, season: number): number {
  let total = 0;
  for (const club of Object.values(state.clubs)) {
    const list = club.finances.commitments;
    if (!list?.length) continue;
    const due = list.filter((c) => c.kind === 'instalment' && c.dueSeason <= season);
    if (!due.length) continue;
    for (const c of due) {
      record(club.finances, 'playerPurchases', c.amount);
      const seller = c.toClubId ? state.clubs[c.toClubId] : null;
      if (seller) {
        record(seller.finances, 'playerSales', c.amount);
        creditSale(seller, c.amount);
      }
      total += c.amount;
      if (club.isUser) {
        const p = state.players[c.playerId];
        addNews(state, { category: 'finance', title: msg('news.instalment.t', { p: p ? `${p.firstName} ${p.lastName}` : '?' }), body: msg('news.instalment.b', { amount: c.amount }), clubIds: [club.id], importance: 1 });
      }
    }
    club.finances.commitments = list.filter((c) => !due.includes(c));
  }
  return total;
}

/** Revisa las primas condicionadas: se cobran al llegar a los partidos pedidos y caducan a las 2 temporadas. */
export function checkBonusCommitments(state: GameState): void {
  for (const club of Object.values(state.clubs)) {
    const list = club.finances.commitments;
    if (!list?.length) continue;
    const keep: Commitment[] = [];
    for (const c of list) {
      if (c.kind !== 'bonus') {
        keep.push(c);
        continue;
      }
      const p = state.players[c.playerId];
      const apps = p && p.clubId === club.id ? p.stats.apps + (p.career ?? []).filter((e) => e.clubId === club.id && e.season >= c.dueSeason).reduce((s, e) => s + e.apps, 0) : 0;
      if (p && apps >= (c.apps ?? BONUS_APPS)) {
        record(club.finances, 'bonuses', c.amount);
        const seller = c.toClubId ? state.clubs[c.toClubId] : null;
        if (seller) {
          record(seller.finances, 'playerSales', c.amount);
          creditSale(seller, c.amount);
        }
        if (club.isUser) addNews(state, { category: 'finance', title: msg('news.bonusPaid.t', { p: `${p.firstName} ${p.lastName}` }), body: msg('news.bonusPaid.b', { amount: c.amount }), clubIds: [club.id], importance: 1 });
      } else if ((c.expiresSeason ?? state.season) < state.season || !p || p.clubId !== club.id) {
        // caducada o el jugador se fue: ya no se debe
      } else keep.push(c);
    }
    club.finances.commitments = keep;
  }
}

/** Aplica las cláusulas automáticas de salario del club tras un ascenso/clasificación (`raise`) o un descenso (`cut`). */
export function applyContractClauses(state: GameState, clubId: Id, event: 'raise' | 'cut'): number {
  const club = state.clubs[clubId];
  if (!club) return 0;
  let n = 0;
  for (const id of club.playerIds) {
    const c = state.players[id]?.contract;
    if (!c) continue;
    const pct = event === 'raise' ? c.autoRaisePct : c.autoCutPct;
    if (!pct) continue;
    c.wage = roundMoney(c.wage * (event === 'raise' ? 1 + pct / 100 : 1 - pct / 100));
    n++;
  }
  if (n && club.isUser) addNews(state, { category: 'finance', title: msg(event === 'raise' ? 'news.clauseRaise.t' : 'news.clauseCut.t', { n }), body: msg(event === 'raise' ? 'news.clauseRaise.b' : 'news.clauseCut.b'), clubIds: [clubId], importance: 1 });
  return n;
}
