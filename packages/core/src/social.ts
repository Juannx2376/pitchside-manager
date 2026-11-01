// Red social del juego: aficionados, periodistas, jugadores y clubes reaccionan a lo que pasa.
// Es la capa "viva" del mundo: cada resultado, fichaje o filtración genera conversación.
import type { Club } from './club';
import { generatePersonName } from './data/names';
import { COUNTRY_BY_CODE } from './data/countries';
import { msg, variantKey, type Msg } from './i18n';
import type { Player } from './player';
import type { Rng } from './rng';
import { newId, type GameState } from './state';
import type { Id } from './types';

export type AuthorKind = 'fan' | 'rivalFan' | 'journalist' | 'player' | 'club' | 'pundit';

export interface SocialPost {
  id: Id;
  season: number;
  day: number;
  kind: AuthorKind;
  author: string;
  handle: string;
  clubId?: Id;
  playerId?: Id;
  text: Msg;
  likes: number;
  reposts: number;
  /** -1 negativo · 0 neutro · 1 positivo */
  mood: -1 | 0 | 1;
}

function handleFor(name: string, rng: Rng): string {
  return `@${name.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '').slice(0, 12)}${rng.int(1, 99)}`;
}

function post(state: GameState, rng: Rng, p: Omit<SocialPost, 'id' | 'season' | 'day' | 'likes' | 'reposts' | 'handle'> & { handle?: string; reach?: number }): void {
  const reach = p.reach ?? 1;
  state.social.unshift({
    id: newId(state, 'sp'),
    season: state.season,
    day: state.day,
    kind: p.kind,
    author: p.author,
    handle: p.handle ?? handleFor(p.author, rng),
    clubId: p.clubId,
    playerId: p.playerId,
    text: p.text,
    likes: Math.round(rng.float(5, 400) * reach),
    reposts: Math.round(rng.float(0, 80) * reach),
    mood: p.mood,
  });
  if (state.social.length > 300) state.social.length = 300;
}

function fanName(rng: Rng, club: Club): string {
  const c = COUNTRY_BY_CODE[club.countryCode];
  const n = generatePersonName(rng, c.nameRegion);
  return `${n.firstName} ${n.lastName.charAt(0)}.`;
}

/** Reacciones tras un partido del usuario. */
export function postMatchReactions(state: GameState, rng: Rng, club: Club, rival: Club, gf: number, ga: number, star: Player | null): void {
  const reach = 1 + club.reputation / 40;
  const res = gf > ga ? 'win' : gf < ga ? 'loss' : 'draw';
  const big = Math.abs(gf - ga) >= 3;
  post(state, rng, {
    kind: 'club',
    author: club.name,
    handle: `@${club.shortName.toLowerCase()}`,
    clubId: club.id,
    text: msg('social.club.result', { gf, ga, rival: rival.name }),
    mood: res === 'win' ? 1 : res === 'loss' ? -1 : 0,
    reach: reach * 3,
  });
  for (let i = 0; i < rng.int(2, 4); i++) {
    const key = variantKey(`social.fan.${res}${big ? 'Big' : ''}`, rng.next() * 1000);
    post(state, rng, { kind: 'fan', author: fanName(rng, club), clubId: club.id, text: msg(key, { club: club.shortName, rival: rival.name, star: star ? star.lastName : '' }), mood: res === 'win' ? 1 : res === 'loss' ? -1 : 0, reach });
  }
  if (rng.chance(0.6)) {
    post(state, rng, { kind: 'rivalFan', author: fanName(rng, rival), clubId: rival.id, text: msg(variantKey(`social.rival.${res}`, rng.next() * 1000), { club: club.shortName }), mood: res === 'win' ? -1 : 1, reach: 0.7 });
  }
  if (star && rng.chance(0.7)) {
    post(state, rng, { kind: 'player', author: `${star.firstName} ${star.lastName}`, playerId: star.id, clubId: club.id, text: msg(variantKey(`social.player.${res}`, rng.next() * 1000)), mood: res === 'loss' ? 0 : 1, reach: reach * 2 });
  }
}

export function postSigning(state: GameState, rng: Rng, club: Club, player: Player, fee: number): void {
  const reach = 1 + club.reputation / 30;
  post(state, rng, { kind: 'club', author: club.name, handle: `@${club.shortName.toLowerCase()}`, clubId: club.id, playerId: player.id, text: msg('social.club.signing', { p: `${player.firstName} ${player.lastName}` }), mood: 1, reach: reach * 3 });
  post(state, rng, {
    kind: 'fan',
    author: fanName(rng, club),
    clubId: club.id,
    text: msg(variantKey(fee > 0 ? 'social.fan.signing' : 'social.fan.freeSigning', rng.next() * 1000), { p: player.lastName }),
    mood: 1,
    reach,
  });
}

export function postLeak(state: GameState, rng: Rng, club: Club, journalistName: string, player: Player): void {
  post(state, rng, { kind: 'journalist', author: journalistName, text: msg('social.journalist.leak', { club: club.name, p: player.lastName }), clubId: club.id, playerId: player.id, mood: -1, reach: 2 });
  post(state, rng, { kind: 'fan', author: fanName(rng, club), clubId: club.id, text: msg(variantKey('social.fan.leak', rng.next() * 1000), { p: player.lastName }), mood: -1 });
}

export function postAward(state: GameState, rng: Rng, title: Msg, player: Player, club: Club | null): void {
  post(state, rng, { kind: 'pundit', author: 'Pitchside Awards', handle: '@pitchsideawards', playerId: player.id, clubId: club?.id, text: msg('social.award', { award: title, p: `${player.firstName} ${player.lastName}` }), mood: 1, reach: 4 });
}

/** Rumor publicado por una fuente concreta (fiabilidad variable, ver `market.ts`). */
export function postSourcedRumour(state: GameState, rng: Rng, source: { name: string; handle: string }, player: Player, from: Club | null, to: Club): void {
  post(state, rng, {
    kind: 'journalist',
    author: source.name,
    handle: source.handle,
    playerId: player.id,
    clubId: to.id,
    text: msg(variantKey('social.rumour', rng.next() * 1000), { p: `${player.firstName} ${player.lastName}`, from: from?.name ?? '', to: to.name }),
    mood: 0,
    reach: 2,
  });
}

/** Rumores del mercado (día a día en ventana): dan vida a la red y a veces anticipan pujas reales. */
export function postRumour(state: GameState, rng: Rng, player: Player, from: Club | null, to: Club): void {
  post(state, rng, {
    kind: 'journalist',
    author: rng.pick(['Mercato Insider', 'Transfer Desk', 'Fichajes Hoy', 'Rádio Bola', 'Golazo News']),
    handle: '@rumours',
    playerId: player.id,
    clubId: to.id,
    text: msg(variantKey('social.rumour', rng.next() * 1000), { p: `${player.firstName} ${player.lastName}`, from: from?.name ?? '', to: to.name }),
    mood: 0,
    reach: 2,
  });
}
