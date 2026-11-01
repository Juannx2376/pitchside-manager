// Cartas de jugador estilo FC: rareza, seis "caras" y rasgos (PlayStyles) derivados de los atributos.
import type { AttrKey } from './attributes';
import { overall, type Player } from './player';
import { dynamicOvr } from './profiles';
import { growthStars, type PotentialView } from './visibility';

export const CARD_TIERS = ['bronze', 'silver', 'gold', 'elite', 'rising'] as const;
export type CardTier = (typeof CARD_TIERS)[number];

export const OUTFIELD_FACES = ['PAC', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY'] as const;
export const KEEPER_FACES = ['DIV', 'HAN', 'KIC', 'REF', 'SPD', 'POS'] as const;
export type CardFace = (typeof OUTFIELD_FACES)[number] | (typeof KEEPER_FACES)[number];

export const TRAIT_IDS = [
  'rapid',
  'finesse',
  'longRange',
  'pinpoint',
  'tikiTaka',
  'technical',
  'trickster',
  'bruiser',
  'aerial',
  'anticipate',
  'engine',
  'dead',
  'composed',
  'crosser',
  'catlike',
  'sweeper',
] as const;
export type TraitId = (typeof TRAIT_IDS)[number];

export interface FcCardData {
  ovr: number;
  /** Valoración dinámica de hoy (forma, moral y preparación). */
  dyn: number;
  tier: CardTier;
  faces: { id: CardFace; value: number }[];
  traits: TraitId[];
  /** Estrellas de potencial (1-5); null si el usuario aún no puede saber el potencial. */
  stars: number | null;
}

function mean(p: Player, keys: AttrKey[]): number {
  return Math.round(keys.reduce((s, k) => s + p.attrs[k], 0) / keys.length);
}

export function cardTier(ovr: number, age: number, potential: number): CardTier {
  if (age <= 21 && potential >= 80 && potential - ovr >= 6) return 'rising';
  if (ovr >= 85) return 'elite';
  if (ovr >= 75) return 'gold';
  if (ovr >= 65) return 'silver';
  return 'bronze';
}

export function cardFaces(p: Player): { id: CardFace; value: number }[] {
  if (p.position === 'GK') {
    return [
      { id: 'DIV', value: mean(p, ['reflexes', 'agility']) },
      { id: 'HAN', value: mean(p, ['handling']) },
      { id: 'KIC', value: mean(p, ['passing', 'setPieces']) },
      { id: 'REF', value: mean(p, ['reflexes', 'oneOnOnes']) },
      { id: 'SPD', value: mean(p, ['pace', 'acceleration']) },
      { id: 'POS', value: mean(p, ['positioning', 'decisions']) },
    ];
  }
  return [
    { id: 'PAC', value: mean(p, ['pace', 'acceleration']) },
    { id: 'SHO', value: mean(p, ['finishing', 'longShots', 'composure']) },
    { id: 'PAS', value: mean(p, ['passing', 'vision', 'crossing']) },
    { id: 'DRI', value: mean(p, ['dribbling', 'agility', 'firstTouch']) },
    { id: 'DEF', value: mean(p, ['tackling', 'marking', 'positioning']) },
    { id: 'PHY', value: mean(p, ['strength', 'stamina', 'jumping', 'aggression']) },
  ];
}

const TRAIT_RULES: { id: TraitId; keeper?: boolean; score: (a: Player['attrs']) => number }[] = [
  { id: 'rapid', score: (a) => Math.min(a.pace, a.acceleration) - 80 },
  { id: 'finesse', score: (a) => Math.min(a.finishing, a.composure) - 78 },
  { id: 'longRange', score: (a) => a.longShots - 80 },
  { id: 'pinpoint', score: (a) => Math.min(a.passing, a.vision) - 78 },
  { id: 'tikiTaka', score: (a) => Math.min(a.firstTouch, a.passing, a.teamwork) - 76 },
  { id: 'technical', score: (a) => Math.min(a.dribbling, a.firstTouch) - 80 },
  { id: 'trickster', score: (a) => Math.min(a.dribbling, a.agility) - 82 },
  { id: 'bruiser', score: (a) => Math.min(a.strength, a.aggression) - 78 },
  { id: 'aerial', score: (a) => Math.min(a.heading, a.jumping) - 78 },
  { id: 'anticipate', score: (a) => Math.min(a.tackling, a.positioning, a.marking) - 77 },
  { id: 'engine', score: (a) => Math.min(a.stamina, a.workRate) - 82 },
  { id: 'dead', score: (a) => a.setPieces - 80 },
  { id: 'composed', score: (a) => Math.min(a.composure, a.decisions) - 80 },
  { id: 'crosser', score: (a) => Math.min(a.crossing, a.vision) - 79 },
  { id: 'catlike', keeper: true, score: (a) => Math.min(a.reflexes, a.agility) - 80 },
  { id: 'sweeper', keeper: true, score: (a) => Math.min(a.oneOnOnes, a.positioning) - 78 },
];

/** Hasta tres rasgos (los que más sobresalen). */
export function cardTraits(p: Player): TraitId[] {
  const gk = p.position === 'GK';
  return TRAIT_RULES.filter((r) => (gk ? r.keeper : !r.keeper))
    .map((r) => ({ id: r.id, s: r.score(p.attrs) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 3)
    .map((r) => r.id);
}

/**
 * `view` es lo que el usuario puede saber del potencial: sin él (o `hidden`) la carta no muestra
 * estrellas ni la rareza "rising", que delatarían el potencial.
 */
export function cardOf(p: Player, view: PotentialView = { kind: 'hidden' }): FcCardData {
  const ovr = overall(p);
  const stars = growthStars(p, ovr, view);
  const pot = view.kind === 'exact' ? view.value : view.kind === 'range' ? Math.round((view.lo + view.hi) / 2) : ovr;
  return { ovr, dyn: dynamicOvr(p), tier: cardTier(ovr, p.age, pot), faces: cardFaces(p), traits: cardTraits(p), stars };
}
