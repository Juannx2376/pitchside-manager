// Comprueba que todas las claves 'ui.*' usadas por la web existen en el diccionario inglés.
// Uso: npx tsx scripts/checkUiKeys.ts
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  GROWTH_PLAN_IDS,
  KEEPER_FACES,
  OUTFIELD_FACES,
  PERKS,
  TRAIT_IDS,
  LEADING_PLANS,
  TRAILING_PLANS,
  OBJECTIVE_KINDS,
  EXTRA_PROJECTS,
  SESSION_FOCUSES,
  TRAINING_GROUPS,
  TRAINING_INTENSITIES,
  ATTACK_SIDES,
  ATTRIBUTE_KEYS,
  CORNER_STYLES,
  FREEKICK_STYLES,
  HIDDEN_KEYS,
  LEDGER_CATEGORIES,
  MARKING_STYLES,
  PASSING_RISKS,
  PLAYER_CHANNELS,
  PLAYER_INSTRUCTIONS,
  PLAYER_ROLES,
  POSITIONS,
  STAFF_ROLES,
  TACTICAL_STYLES,
  TACTIC_TEMPLATES,
  TRANSITION_STYLES,
} from '../src';
import { en } from '../src/i18n/en';

const root = join(process.cwd(), '..', '..', 'apps', 'web', 'src');
const files: string[] = [];
const walk = (d: string) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(f)) files.push(p);
  }
};
walk(root);
const used = new Set<string>();
for (const f of files) {
  const s = readFileSync(f, 'utf8');
  for (const m of s.matchAll(/['"`]((?:ui|attr|attrShort|hidden|ledger|staff|sponsor|project|weather|objective|ach|pos)\.[A-Za-z0-9_.]+)['"`]/g)) used.add(m[1]);
}
// Expansiones de claves dinámicas.
const expand: Record<string, readonly string[]> = {
  'ui.analysis.verdict': ['sign', 'consider', 'avoid'],
  'ui.award': ['month', 'goldenBoot', 'goldenBall', 'teamOfSeason'],
  'ui.career.attr': ['tacticalKnowledge', 'manManagement', 'mediaHandling', 'adaptability', 'pressRelation'],
  'ui.fin.effect': ['stadiumExpansion', 'trainingGround', 'youthAcademy', 'medicalCenter', 'fanShop', 'parking', 'vipBoxes', 'pitchRenovation', ...EXTRA_PROJECTS],
  'ui.focus': ['balanced', 'attacking', 'defending', 'physical', 'technical', 'mental', 'goalkeeping'],
  'ui.foot': ['R', 'L', 'B'],
  'ui.form': ['W', 'D', 'L'],
  'ui.fpf': ['UEFA', 'CONMEBOL', 'CONCACAF', 'CAF', 'AFC', 'OFC'],
  'ui.listed': ['transfer', 'loan'],
  'ui.nav': ['hub', 'inbox', 'squad', 'tactics', 'transfers', 'scouting', 'staff', 'finances', 'calendar', 'competition', 'world', 'career', 'settings', 'training', 'objectives', 'press', 'match', 'data'],
  'ui.obj.status': ['active', 'done', 'failed'],
  'ui.moment.style': ['power', 'placed', 'panenka'],
  'ui.moment.styleHelp': ['power', 'placed', 'panenka'],
  'ui.moment.fk': ['shoot', 'cross'],
  'ui.plan.lead': LEADING_PLANS,
  'ui.plan.trail': TRAILING_PLANS,
  'ui.tr.tag': ['upgrade', 'depth', 'bargain', 'overpay', 'prospect', 'wageHeavy', 'fits', 'poorFit', 'veteran'],
  'obj.kind': OBJECTIVE_KINDS,
  'ui.train.group': TRAINING_GROUPS,
  'ui.train.focus': SESSION_FOCUSES,
  'ui.train.focusHelp': SESSION_FOCUSES,
  'ui.train.int': TRAINING_INTENSITIES,
  'ui.train.camp': ['fitness', 'tactical', 'technical', 'fitness.d', 'tactical.d', 'technical.d'],
  'ui.train.camp.err': ['window', 'active', 'broke'],
  'ui.academy.policy': ['balanced', 'potential', 'ready', 'balanced.d', 'potential.d', 'ready.d'],
  'ui.train.intHelp': TRAINING_INTENSITIES,
  'ui.tev.title': ['clash', 'mentor', 'extraTraining', 'coachRaise'],
  'ui.tev.desc': ['clash', 'mentor', 'extraTraining', 'coachRaise'],
  'ui.tev.choice': ['mediate', 'punish', 'ignore', 'accept', 'decline', 'grant', 'refuse', 'pay'],
  'ui.tev.res': ['mediated', 'failed', 'punished', 'ignored', 'accepted', 'declined', 'granted', 'refused', 'paid', 'quit', 'stayed'],
  'ui.fac.eff': ['training', 'recovery', 'injury', 'video', 'youth', 'scouting'],
  'news.tev': ['clash.t', 'clash.b', 'mentor.t', 'mentor.b', 'extraTraining.t', 'extraTraining.b', 'coachRaise.t', 'coachRaise.b'],
  'ui.chan': PLAYER_CHANNELS,
  'ui.pass': PASSING_RISKS,
  'ui.side': ATTACK_SIDES,
  'ui.mark': MARKING_STYLES,
  'ui.trans': TRANSITION_STYLES,
  'ui.corner': CORNER_STYLES,
  'ui.fk': FREEKICK_STYLES,
  'ui.tpl': TACTIC_TEMPLATES.map((x) => x.id),
  'ui.tplDesc': TACTIC_TEMPLATES.map((x) => x.id),
  'ui.tv3.fit': ['great', 'good', 'ok', 'poor'],
  'ui.set.theme': ['classic', 'fc', 'pes'],
  'ui.set.themeDesc': ['classic', 'fc', 'pes'],
  'ui.set.pitch': ['stripes', 'plain', 'night'],
  'ui.set.chips': ['card', 'disc'],
  'ui.set.density': ['comfortable', 'compact'],
  'ui.set.motion': ['on', 'off'],
  'ui.newsCat': ['match', 'transfer', 'finance', 'press', 'leak', 'board', 'scouting', 'injury', 'youth', 'fpf', 'general', 'award', 'staff', 'career'],
  'ui.press.pers': ['SENSATIONALIST', 'ANALYTICAL', 'HOSTILE', 'OPTIMISTIC'],
  'ui.press.tone': ['calm', 'confident', 'aggressive', 'evasive', 'praise_players', 'blame_players'],
  'ui.promise': ['starter', 'minutes', 'newContract'],
  'ui.role': PLAYER_ROLES,
  'ui.roleShort': PLAYER_ROLES,
  'ui.roleHelp': PLAYER_ROLES,
  'ui.search': ['country', 'club', 'player'],
  'ui.social.kind': ['fan', 'rivalFan', 'journalist', 'player', 'club', 'pundit'],
  'ui.source': ['real', 'generated', 'custom'],
  'ui.stat': ['possession', 'shots', 'onTarget', 'xg', 'passes', 'corners', 'fouls', 'yellows', 'reds', 'offsides'],
  'ui.status': ['key', 'first', 'rotation', 'backup', 'youth'],
  'ui.style': TACTICAL_STYLES,
  'ui.styleDesc': TACTICAL_STYLES,
  'ui.v2.focus': ['attack', 'balanced', 'defend'],
  'ui.v2.instr': PLAYER_INSTRUCTIONS,
  'ui.v2.buildup': ['balanced', 'short_pass', 'long_ball', 'counter'],
  'ui.v2.approach': ['low_block', 'balanced', 'high_block', 'aggressive_press'],
  'ui.tac.eff': ['possession', 'chances', 'quality', 'counter', 'defence', 'fatigue', 'fouls'],
  'ui.talk': ['calm', 'motivate', 'demand', 'praise'],
  'ui.talkTo': ['praise', 'criticise', 'reassure', 'promiseStarter', 'promiseMinutes', 'promiseContract'],
  'ui.tr.kind': ['transfer', 'loan'],
  'ui.tr.stage': ['club', 'player', 'agreed', 'collapsed'],
  'ui.world.metric': ['reputation', 'econ', 'clubs'],
  'ui.slider': ['mentality', 'tempo', 'width', 'pressing', 'defensiveLine', 'directness', 'tackling'],
  'ui.toggle': ['offsideTrap', 'counterAttack', 'timeWasting'],
  'ui.create': ['primary', 'secondary', 'accent'],
  'ui.fin.w': ['squadWages', 'staffWages', 'stadiumUpkeep', 'youth', 'loans'],
  'ui.club': ['market', 'transferBudget', 'wageBill', 'facilities', 'fans'],
  'ui.hub': ['chemistry', 'morale', 'happiness'],
  'ui.tac': ['captainId', 'penaltyTakerId', 'freeKickTakerId', 'cornerTakerId'],
  attr: ATTRIBUTE_KEYS,
  attrShort: ATTRIBUTE_KEYS,
  hidden: HIDDEN_KEYS,
  ledger: LEDGER_CATEGORIES,
  'staff.role': STAFF_ROLES,
  'pos.long': POSITIONS,
  'pos.short': POSITIONS,
  sponsor: ['shirt', 'kit', 'stadium', 'sleeve'],
  project: ['stadiumExpansion', 'trainingGround', 'youthAcademy', 'medicalCenter', 'fanShop', 'parking', 'vipBoxes', 'pitchRenovation', ...EXTRA_PROJECTS],
  weather: ['sunny', 'cloudy', 'rain', 'snow', 'wind', 'hot'],
};
for (const [prefix, list] of Object.entries(expand)) for (const k of list) used.add(`${prefix}.${k}`);
for (const k of TACTICAL_STYLES) used.add(`ui.styleDesc.${k}`);
// Ganchos FC: cartas, rasgos, resumen, perks, planes de crecimiento y revelaciones.
for (const k of [...OUTFIELD_FACES, ...KEEPER_FACES]) used.add(`ui.card.face.${k}`);
for (const k of TRAIT_IDS) used.add(`ui.trait.${k}`);
for (const k of ['comeback', 'thriller', 'lateWinner', 'dominant', 'robbed', 'redCard', 'cleanSheet', 'goalless', 'rout', 'normal']) used.add(`ui.sum.story.${k}`);
for (const k of ['signing', 'achievement', 'milestone', 'potential', 'pass', 'legend']) used.add(`ui.reveal.kind.${k}`);
for (const k of ['tactical', 'squad', 'business']) used.add(`ui.perk.branch.${k}`);
for (const p of PERKS) {
  used.add(`ui.perk.${p.id}`);
  used.add(`ui.perk.${p.id}.d`);
}
for (const k of GROWTH_PLAN_IDS) used.add(`ui.plan.${k}`);
for (const k of ['full', 'position', 'noPlayer', 'old']) used.add(`ui.plan.err.${k}`);
for (const k of ['listed', 'free', 'expiring', 'price']) {
  used.add(`news.wish.${k}.t`);
  used.add(`news.wish.${k}.b`);
}
for (const k of ['hatTrick', 'comeback', 'derbyWin', 'winStreak5', 'unbeaten10', 'firstSigning', 'bigSigning', 'growthPlanDone', 'perkBought', 'passTier10', 'legendMade', 'deadlineDeal']) {
  used.add(`ach.${k}.t`);
  used.add(`ach.${k}.d`);
}
for (const k of ['expiring', 'listed', 'panic']) used.add(`ui.deadline.reason.${k}`);
// Fase 6: repetición, rumores, desempleo, tutorial y ayuda.
for (const k of ['goal', 'save', 'miss']) used.add(`ui.replay.${k}`);
for (const k of ['confirmed', 'denied']) used.add(`ui.rumour.${k}`);
for (const k of ['employed', 'limit', 'duplicate', 'noClub']) used.add(`ui.unemp.err.${k}`);
for (const k of ['sacked', 'resigned']) {
  used.add(`ui.unemp.reason.${k}`);
  used.add(`ui.unemp.letter.${k}`);
}
for (const k of ['welcome', 'hub', 'continue', 'week', 'squad', 'tactics', 'training', 'missions', 'scouting', 'transfers', 'staff', 'finances', 'calendar', 'matchday', 'inbox', 'career', 'done']) {
  used.add(`ui.tour.${k}.t`);
  used.add(`ui.tour.${k}.b`);
}
for (const k of ['squad', 'tactics', 'train', 'scout', 'play', 'goals']) {
  used.add(`ui.help.q.${k}.t`);
  used.add(`ui.help.q.${k}.d`);
}
for (const k of ['continue', 'tabs', 'search', 'close']) {
  used.add(`ui.help.key.${k}.k`);
  used.add(`ui.help.key.${k}.d`);
}
for (const k of ['ovr', 'potential', 'form', 'morale', 'chemistry', 'fitness', 'role', 'familiarity', 'mentality', 'xg', 'scouting', 'margin', 'wage', 'clause', 'loan', 'window', 'board', 'fpf', 'growth', 'perk', 'path', 'derby', 'rumour', 'agent', 'academy', 'sacking', 'timeout', 'promise']) {
  used.add(`ui.help.g.${k}.t`);
  used.add(`ui.help.g.${k}.d`);
}
// Fase 7: shell nuevo, traspasos por fases, finanzas, perfiles de crecimiento.
for (const k of ['home', 'squad', 'market', 'club', 'compete', 'career', 'jobs']) used.add(`ui.sec.${k}`);
for (const k of ['earlyBloomer', 'lateBloomer', 'steady', 'explosive', 'shortPeak', 'longevity']) {
  used.add(`ui.profile.${k}`);
  used.add(`ui.profile.${k}.d`);
}
for (const k of ['enquiry', 'talks', 'agreement', 'presented']) used.add(`ui.neg.step.${k}`);
for (const k of ['rival', 'player']) used.add(`ui.neg.reneg.${k}`);
for (const k of ['now', 'nextWindow', 'nextSeason']) used.add(`ui.neg.entry.${k}`);
for (const k of ['enquiry', 'club', 'player', 'renegotiation', 'agreed', 'collapsed']) used.add(`ui.tr.stage.${k}`);
for (const k of ['instalment', 'bonus']) used.add(`ui.con.kind.${k}`);
for (const k of ['tactical', 'future', 'finance', 'status']) used.add(`ui.phase.${k}`);
for (const k of ['hype', 'mixed', 'doubt']) {
  used.add(`ui.pres.fan.${k}`);
  used.add(`ui.pres.press.${k}`);
  used.add(`ui.pres.board.${k}`);
}
for (const k of ['key', 'first', 'rotation', 'backup', 'youth']) used.add(`ui.status.${k}`);
for (const k of ['goodNose', 'deadlineSprint', 'deadlineHero']) {
  used.add(`ach.${k}.t`);
  used.add(`ach.${k}.d`);
}
// Fase 8: Deadline Day en vivo y panorama del dinero.
for (const k of ['enquiry', 'club', 'player', 'renegotiation', 'agreed', 'collapsed']) used.add(`ui.dl.stage.${k}`);
for (const k of ['offsideTrap', 'counterAttack', 'timeWasting']) used.add(`ui.toggle.${k}.hint`);
for (const k of ['mentality', 'tempo', 'width', 'pressing', 'defensiveLine', 'directness', 'tackling']) {
  used.add(`ui.slider.${k}.lo`);
  used.add(`ui.slider.${k}.hi`);
}
for (let i = 0; i < 5; i++) used.add(`ui.match.ment${i}`);
for (let i = 1; i <= 4; i++) used.add(`ui.match.speed${i}`);
const prefixesOnly = new Set(Object.keys(expand));
const missing = [...used].filter((k) => !prefixesOnly.has(k) && en[k] === undefined).sort();
console.log(`Claves usadas: ${used.size} · faltan en inglés: ${missing.length}`);
if (missing.length) console.log(missing.join('\n'));
process.exit(missing.length ? 1 : 0);
