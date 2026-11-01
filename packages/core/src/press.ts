// Prensa, moral del vestuario, charlas individuales, fugas de información y presión de la directiva.
import { managerName, type Club } from './club';
import { COUNTRY_BY_CODE, type CountryDef } from './data/countries';
import { generatePersonName } from './data/names';
import { msg, type Msg } from './i18n';
import type { Player, PlayerPromise } from './player';
import type { Rng } from './rng';
import { postLeak } from './social';
import { addNews, clubPlayers, newId, type GameState, type StoredMatch } from './state';
import { clamp, type Id } from './types';

export type JournalistPersonality = 'SENSATIONALIST' | 'ANALYTICAL' | 'HOSTILE' | 'OPTIMISTIC';

export interface Journalist {
  id: Id;
  firstName: string;
  lastName: string;
  outlet: string;
  countryCode: string;
  personality: JournalistPersonality;
  influence: number;
  relation: number;
}

export type QuestionTopic = 'result' | 'referee' | 'player_unhappy' | 'tactics' | 'board' | 'transfer_rumour' | 'form' | 'rival';
export type AnswerTone = 'calm' | 'confident' | 'aggressive' | 'evasive' | 'praise_players' | 'blame_players';

export interface PressEffects {
  morale: number;
  chemistry: number;
  pressRelation: number;
  board: number;
  targetHappiness: number;
}

export interface AnswerOption {
  tone: AnswerTone;
  text: Msg;
  effects: PressEffects;
}

export interface PressQuestion {
  id: Id;
  journalistId: Id;
  topic: QuestionTopic;
  text: Msg;
  targetPlayerId: Id | null;
  options: AnswerOption[];
}

export interface PressConference {
  id: Id;
  clubId: Id;
  season: number;
  day: number;
  questions: PressQuestion[];
  answered: Record<Id, AnswerTone>;
}

const OUTLETS: Record<string, string[]> = {
  es: ['Diario Gol', 'El Marcador', 'Radio Deportes', 'La Grada', 'Fútbol Total'],
  en: ['The Sporting Post', 'Matchday Mirror', 'Back Page', 'Football Weekly', 'The Terrace'],
  pt: ['Gazeta do Golo', 'Placar Hoje', 'Rádio Bola', 'Tribuna Esportiva'],
  fr: ['Le Ballon', 'Tribune Foot', 'Radio Stade'],
  it: ['Corriere del Calcio', 'Gazzetta del Pallone', 'Tuttogol'],
  de: ['Kicker Express', 'Fußball Bild', 'Sportschau Heute'],
  slav: ['Sport-Express', 'Futbol Today', 'Arena Sport'],
  default: ['Sports Daily', 'Football Network', 'Goal Radio', 'Stadium News'],
};

export function generateJournalist(rng: Rng, id: Id, country: CountryDef): Journalist {
  const outlets = OUTLETS[country.nameRegion] ?? OUTLETS.default;
  const personality = rng.weightedPick(['SENSATIONALIST', 'ANALYTICAL', 'HOSTILE', 'OPTIMISTIC'] as JournalistPersonality[], (p) => ({ SENSATIONALIST: 3, ANALYTICAL: 3, HOSTILE: 2, OPTIMISTIC: 2 })[p]);
  return {
    id,
    ...generatePersonName(rng, country.nameRegion),
    outlet: rng.pick(outlets),
    countryCode: country.code,
    personality,
    influence: Math.round(clamp(rng.gauss(50, 20), 5, 99)),
    relation: personality === 'HOSTILE' ? 35 : personality === 'OPTIMISTIC' ? 65 : 50,
  };
}

/** Efecto base de cada tono por tema. [moral, química, relación prensa, directiva, felicidad del aludido] */
const BASE: Record<QuestionTopic, Partial<Record<AnswerTone, [number, number, number, number, number]>>> = {
  result: { calm: [1, 1, 2, 1, 0], confident: [3, 1, 1, 1, 0], aggressive: [1, 0, -5, -2, 0], evasive: [0, 0, -3, -1, 0], praise_players: [4, 3, 0, 0, 0], blame_players: [-6, -6, 2, 1, 0] },
  referee: { calm: [0, 1, 2, 1, 0], aggressive: [3, 2, -3, -3, 0], evasive: [0, 0, -1, 0, 0], confident: [1, 1, 0, 0, 0] },
  player_unhappy: { calm: [0, 1, 1, 0, 4], praise_players: [1, 2, 0, 0, 8], blame_players: [-3, -5, 2, 0, -12], evasive: [0, -1, -2, 0, -3], aggressive: [-1, -3, -3, -1, -8] },
  tactics: { calm: [0, 0, 2, 1, 0], confident: [2, 1, 1, 2, 0], evasive: [0, 0, -3, -2, 0], aggressive: [0, 0, -4, -1, 0] },
  board: { calm: [0, 0, 1, 2, 0], confident: [1, 0, 0, 1, 0], aggressive: [1, 0, -3, -6, 0], evasive: [0, 0, -2, -1, 0] },
  transfer_rumour: { calm: [0, 1, 1, 0, 3], evasive: [0, 0, -1, 0, -2], confident: [1, 1, 0, 0, 5], aggressive: [0, 0, -3, 0, -2] },
  form: { calm: [1, 1, 1, 1, 0], confident: [3, 2, 1, 1, 0], praise_players: [4, 3, 0, 0, 0], blame_players: [-5, -5, 1, 1, 0], evasive: [0, 0, -2, 0, 0] },
  rival: { calm: [0, 0, 2, 1, 0], confident: [2, 1, 0, 0, 0], aggressive: [3, 2, -2, -1, 0], evasive: [0, 0, -1, 0, 0] },
};

function personalize(e: PressEffects, tone: AnswerTone, p: JournalistPersonality): PressEffects {
  const out = { ...e };
  switch (p) {
    case 'SENSATIONALIST':
      out.morale *= 1.5;
      out.chemistry *= 1.6;
      out.board *= 1.4;
      if (tone === 'aggressive' || tone === 'blame_players') out.pressRelation += 4;
      break;
    case 'ANALYTICAL':
      if (tone === 'calm' || tone === 'confident') out.pressRelation += 2;
      if (tone === 'evasive') out.pressRelation -= 3;
      out.chemistry *= 0.8;
      break;
    case 'HOSTILE':
      out.pressRelation -= 2;
      if (tone === 'aggressive') {
        out.pressRelation -= 5;
        out.morale += 1;
      }
      if (tone === 'blame_players') out.chemistry -= 3;
      break;
    case 'OPTIMISTIC':
      if (tone === 'praise_players' || tone === 'confident') {
        out.morale += 1.5;
        out.pressRelation += 2;
      }
      if (tone === 'aggressive') out.pressRelation -= 2;
      break;
  }
  return out;
}

function questionKey(topic: QuestionTopic, j: Journalist): string {
  if (topic === 'result') return j.personality === 'HOSTILE' ? 'press.q.result.hostile' : j.personality === 'SENSATIONALIST' ? 'press.q.result.sens' : 'press.q.result';
  if (topic === 'referee') return j.personality === 'SENSATIONALIST' ? 'press.q.referee.sens' : 'press.q.referee';
  if (topic === 'tactics') return j.personality === 'ANALYTICAL' ? 'press.q.tactics.analytical' : 'press.q.tactics';
  if (topic === 'form') return j.personality === 'OPTIMISTIC' ? 'press.q.form.optimistic' : 'press.q.form';
  return `press.q.${topic}`;
}

/** Rueda de prensa del club del usuario tras un partido. */
export function generatePressConference(state: GameState, clubId: Id, rng: Rng, lastMatch: StoredMatch | null): PressConference | null {
  const club = state.clubs[clubId];
  const journalists = state.countries[club.countryCode].journalistIds.map((id) => state.journalists[id]).filter(Boolean);
  if (journalists.length === 0) return null;
  const players = clubPlayers(state, clubId);
  const topics: { topic: QuestionTopic; target?: Player; rival?: string }[] = [];
  if (lastMatch) {
    const isHome = lastMatch.homeId === clubId;
    const gf = isHome ? lastMatch.result.homeGoals : lastMatch.result.awayGoals;
    const ga = isHome ? lastMatch.result.awayGoals : lastMatch.result.homeGoals;
    topics.push({ topic: gf < ga ? 'result' : 'form' });
    if (lastMatch.result.controversies.some((c) => (c.controversy ?? 0) > 0.45)) topics.push({ topic: 'referee' });
  }
  const unhappy = players.filter((p) => p.happiness < 40).sort((a, b) => a.happiness - b.happiness)[0];
  if (unhappy) topics.push({ topic: 'player_unhappy', target: unhappy });
  if (club.boardConfidence < 45) topics.push({ topic: 'board' });
  const star = [...players].sort((a, b) => b.reputation - a.reputation)[0];
  if (star && rng.chance(0.4)) topics.push({ topic: 'transfer_rumour', target: star });
  if (rng.chance(0.35)) topics.push({ topic: 'tactics' });
  if (topics.length < 3) topics.push({ topic: 'rival' });
  const questions: PressQuestion[] = topics.slice(0, 4).map(({ topic, target }) => {
    const j = rng.weightedPick(journalists, (x) => x.influence + (topic === 'result' && x.personality === 'HOSTILE' ? 40 : 0));
    const options: AnswerOption[] = (Object.keys(BASE[topic]) as AnswerTone[]).map((tone) => {
      const [m, c, pr, b, th] = BASE[topic][tone] as [number, number, number, number, number];
      return { tone, text: msg(`press.a.${tone}.${rng.int(0, 1)}`), effects: personalize({ morale: m, chemistry: c, pressRelation: pr, board: b, targetHappiness: th }, tone, j.personality) };
    });
    return { id: newId(state, 'q'), journalistId: j.id, topic, text: msg(questionKey(topic, j), { p: target ? `${target.firstName} ${target.lastName}` : '' }), targetPlayerId: target?.id ?? null, options };
  });
  return { id: newId(state, 'pc'), clubId, season: state.season, day: state.day, questions, answered: {} };
}

export function answerPressQuestion(state: GameState, conf: PressConference, questionId: Id, tone: AnswerTone): Msg | null {
  const q = conf.questions.find((x) => x.id === questionId);
  if (!q || conf.answered[questionId]) return null;
  const opt = q.options.find((o) => o.tone === tone);
  if (!opt) return null;
  const club = state.clubs[conf.clubId];
  const manager = club.managerId ? state.managers[club.managerId] : null;
  const j = state.journalists[q.journalistId];
  const e = opt.effects;
  const media = manager ? manager.mediaHandling / 100 : 0.5;
  const soften = (v: number) => (v < 0 ? v * (1.2 - media * 0.6) : v);
  for (const p of clubPlayers(state, club.id)) p.morale = clamp(p.morale + soften(e.morale), 0, 100);
  club.chemistry = clamp(club.chemistry + soften(e.chemistry), 0, 100);
  club.boardConfidence = clamp(club.boardConfidence + soften(e.board) * (0.5 + j.influence / 100), 0, 100);
  j.relation = clamp(j.relation + soften(e.pressRelation) * 2, 0, 100);
  if (manager) manager.pressRelation = clamp(manager.pressRelation + soften(e.pressRelation), 0, 100);
  if (q.targetPlayerId) {
    const t = state.players[q.targetPlayerId];
    if (t) t.happiness = clamp(t.happiness + e.targetHappiness, 0, 100);
  }
  conf.answered[questionId] = tone;
  let headline: Msg | null = null;
  if (j.personality === 'SENSATIONALIST' && (tone === 'aggressive' || tone === 'blame_players')) {
    headline = msg('news.pressFire.t', { quote: opt.text, manager: manager ? managerName(manager) : '' });
    addNews(state, { category: 'press', title: headline, body: msg('news.pressFire.b', { j: `${j.firstName} ${j.lastName}`, outlet: j.outlet, club: club.name }), clubIds: [club.id], importance: 2 });
  } else if (j.personality === 'HOSTILE' && tone === 'evasive') {
    headline = msg('news.pressHide.t', { outlet: j.outlet, club: club.name });
    addNews(state, { category: 'press', title: headline, body: msg('news.pressHide.b'), clubIds: [club.id] });
  }
  if (Object.keys(conf.answered).length === conf.questions.length) state.pendingPress = null;
  return headline;
}

export function autoAnswerPress(state: GameState, conf: PressConference): void {
  for (const q of conf.questions) {
    if (conf.answered[q.id]) continue;
    const tone: AnswerTone = q.options.some((o) => o.tone === 'calm') ? 'calm' : q.options[0].tone;
    answerPressQuestion(state, conf, q.id, tone);
  }
  state.pendingPress = null;
}

// ───────────────────────── Charlas individuales (EA FC / FIFA Manager) ─────────────────────────

export type PlayerTalk = 'praise' | 'criticise' | 'promiseStarter' | 'promiseMinutes' | 'promiseContract' | 'reassure';

/** Habla con un jugador. El resultado depende de su forma, su personalidad oculta y la gestión del mánager. */
export function talkToPlayer(state: GameState, playerId: Id, talk: PlayerTalk, rng: Rng): Msg {
  const p = state.players[playerId];
  const club = p.clubId ? state.clubs[p.clubId] : null;
  const manager = club?.managerId ? state.managers[club.managerId] : null;
  const mm = (manager?.manManagement ?? 50) / 100;
  const prof = p.hidden.professionalism / 100;
  const name = `${p.firstName} ${p.lastName}`;
  const roll = rng.next();
  switch (talk) {
    case 'praise': {
      const deserved = p.form >= 55;
      p.morale = clamp(p.morale + (deserved ? 8 : -2) * (0.6 + mm), 0, 100);
      return msg(deserved ? 'talk.praise.good' : 'talk.praise.bad', { p: name });
    }
    case 'criticise': {
      const reacts = roll < 0.35 + prof * 0.5;
      p.morale = clamp(p.morale + (reacts ? 3 : -8), 0, 100);
      p.happiness = clamp(p.happiness - (reacts ? 2 : 8), 0, 100);
      if (reacts) p.form = clamp(p.form + 6, 0, 100);
      return msg(reacts ? 'talk.criticise.good' : 'talk.criticise.bad', { p: name });
    }
    case 'reassure':
      p.morale = clamp(p.morale + 4 * (0.6 + mm), 0, 100);
      p.happiness = clamp(p.happiness + 3, 0, 100);
      return msg('talk.reassure', { p: name });
    case 'promiseStarter':
    case 'promiseMinutes':
    case 'promiseContract': {
      const kind: PlayerPromise['kind'] = talk === 'promiseStarter' ? 'starter' : talk === 'promiseMinutes' ? 'minutes' : 'newContract';
      p.promise = { kind, season: state.season, untilDay: Math.min(330, state.day + (kind === 'newContract' ? 60 : 90)) };
      p.happiness = clamp(p.happiness + 15, 0, 100);
      p.wantsToLeave = false;
      return msg('talk.promise', { p: name, promise: msg(`promise.${kind}`) });
    }
  }
}

/** Comprueba promesas vencidas: si se rompen, el jugador se enfada y quiere salir. */
export function checkPromises(state: GameState, club: Club): void {
  for (const p of clubPlayers(state, club.id)) {
    const pr = p.promise;
    if (!pr || pr.untilDay > state.day) continue;
    const share = p.stats.apps > 0 ? p.stats.minutes / Math.max(1, p.stats.apps * 90) : 0;
    const kept = pr.kind === 'starter' ? share >= 0.7 && p.stats.apps >= 6 : pr.kind === 'minutes' ? p.stats.minutes >= 600 : false;
    p.promise = null;
    if (kept) {
      p.happiness = clamp(p.happiness + 8, 0, 100);
      continue;
    }
    p.happiness = clamp(p.happiness - 25, 0, 100);
    p.wantsToLeave = true;
    club.chemistry = clamp(club.chemistry - 3, 0, 100);
    addNews(state, { category: 'leak', title: msg('news.promiseBroken.t', { p: `${p.firstName} ${p.lastName}` }), body: msg('news.promiseBroken.b'), clubIds: [club.id], playerId: p.id, importance: 2 });
  }
}

// ───────────────────────── Vestuario, filtraciones y directiva ─────────────────────────

export function processDressingRoomLeaks(state: GameState, clubId: Id, rng: Rng): number {
  const club = state.clubs[clubId];
  const manager = club.managerId ? state.managers[club.managerId] : null;
  const pressRel = manager?.pressRelation ?? 50;
  if (club.chemistry >= 55 && pressRel >= 40) return 0;
  const journalists = state.countries[club.countryCode].journalistIds.map((id) => state.journalists[id]).filter(Boolean);
  if (journalists.length === 0) return 0;
  let leaks = 0;
  for (const p of clubPlayers(state, clubId)) {
    if (p.happiness >= 38) continue;
    const discontent = (38 - p.happiness) / 38;
    const indiscretion = 1 - p.hidden.professionalism / 100;
    const climate = 1 + Math.max(0, 55 - club.chemistry) / 40 + Math.max(0, 40 - pressRel) / 50;
    if (!rng.chance(0.05 * discontent * (0.3 + indiscretion * 1.4) * climate)) continue;
    leaks++;
    const j = rng.weightedPick(journalists, (x) => (x.personality === 'SENSATIONALIST' || x.personality === 'HOSTILE' ? 3 : 1) * (x.influence + 10));
    addNews(state, {
      category: 'leak',
      title: msg('news.leak.t', { club: club.name, p: `${p.firstName} ${p.lastName}`, complaint: msg(`leak.${rng.int(0, 4)}`) }),
      body: msg('news.leak.b', { outlet: j.outlet, j: `${j.firstName} ${j.lastName}` }),
      clubIds: [club.id],
      playerId: p.id,
      importance: 2,
    });
    if (club.isUser) postLeak(state, rng, club, `${j.firstName} ${j.lastName}`, p);
    club.boardConfidence = clamp(club.boardConfidence - (2 + j.influence / 20), 0, 100);
    club.chemistry = clamp(club.chemistry - 2, 0, 100);
    club.leakPressure += j.influence / 10;
    if (manager) manager.pressRelation = clamp(manager.pressRelation - 2, 0, 100);
    for (const o of clubPlayers(state, clubId)) if (o.id !== p.id) o.morale = clamp(o.morale - 1, 0, 100);
  }
  return leaks;
}

export function updateHappiness(p: Player, ctx: { minutesShare: number; fairWage: number; clubReputation: number }): void {
  const expected = { key: 0.85, first: 0.65, rotation: 0.35, backup: 0.12, youth: 0.05 }[p.squadStatus];
  const minutesTerm = clamp((ctx.minutesShare - expected) * 40, -18, 8);
  const wageRatio = p.contract ? p.contract.wage / Math.max(1, ctx.fairWage) : 1;
  const wageTerm = clamp((wageRatio - 1) * 12, -10, 5);
  const ambitionTerm = p.hidden.ambition > 70 && p.reputation > ctx.clubReputation + 10 ? -(p.hidden.ambition - 70) / 6 : 0;
  const moraleTerm = (p.morale - 55) / 10;
  const promiseTerm = p.promise ? 6 : 0;
  const target = clamp(60 + minutesTerm + wageTerm + ambitionTerm + moraleTerm + promiseTerm, 0, 100);
  p.happiness = Math.round(p.happiness * 0.6 + target * 0.4);
  p.wantsToLeave = p.happiness < 30 || (p.hidden.ambition > 80 && p.reputation > ctx.clubReputation + 18);
}

/** Revisión mensual de la directiva: objetivos por áreas, finanzas, afición y filtraciones. */
export function boardReview(
  state: GameState,
  clubId: Id,
  ctx: { position: number; targetPosition: number; leagueSize: number; gamesPlayed: number },
): 'ok' | 'warning' | 'sacked' {
  const club = state.clubs[clubId];
  const country: CountryDef = COUNTRY_BY_CODE[club.countryCode];
  let delta = 0;
  if (ctx.gamesPlayed >= 4) delta += clamp((ctx.targetPosition - ctx.position) / Math.max(1, ctx.leagueSize / 10), -6, 4);
  if (club.finances.balance < 0) delta -= 2 + Math.min(4, -club.finances.balance / Math.max(1, 5e6 * country.econ));
  if (club.fans) delta += (club.fans.satisfaction - 55) / 30;
  delta -= club.leakPressure / 6;
  club.leakPressure *= 0.5;
  club.boardConfidence = clamp(club.boardConfidence + delta, 0, 100);
  if (club.boardConfidence < 12 && ctx.gamesPlayed >= 6) return 'sacked';
  if (club.boardConfidence < 30) return 'warning';
  return 'ok';
}
