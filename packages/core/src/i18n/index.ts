// Internacionalización: inglés (por defecto), español, portugués (Brasil) y ruso.
// El núcleo nunca guarda texto renderizado: guarda mensajes { k, p } que se traducen al mostrarlos,
// así que cambiar de idioma retraduce también el historial de noticias, partidos y prensa.
import { en } from './en';
import { es } from './es';
import { pt } from './pt';
import { ru } from './ru';
import { formatMoney } from '../types';

export type Locale = 'en' | 'es' | 'pt' | 'ru';
export const LOCALES: { id: Locale; name: string; flag: string }[] = [
  { id: 'en', name: 'English', flag: 'ENG' },
  { id: 'es', name: 'Español', flag: 'ESP' },
  { id: 'pt', name: 'Português', flag: 'BRA' },
  { id: 'ru', name: 'Русский', flag: 'RUS' },
];

export type Dict = Record<string, string>;
const DICTS: Record<Locale, Dict> = { en, es, pt, ru };

let current: Locale = 'en';
export function setLocale(l: Locale): void {
  current = l;
}
export function getLocale(): Locale {
  return current;
}

/** Mensaje traducible. Los parámetros pueden ser a su vez mensajes. */
export interface Msg {
  k: string;
  p?: Record<string, string | number | Msg>;
}

export function msg(k: string, p?: Msg['p']): Msg {
  return p ? { k, p } : { k };
}

export function isMsg(v: unknown): v is Msg {
  return typeof v === 'object' && v !== null && typeof (v as Msg).k === 'string';
}

/** Parámetros numéricos que son importes en EUR (se formatean como €12.5M). */
const MONEY_PARAMS = new Set(['fee', 'amount', 'wage', 'budget', 'annual', 'option', 'loss', 'limitMoney', 'fine', 'wages', 'value', 'cost', 'maxFee', 'maxWage', 'weekly', 'titleBonus', 'winBonus', 'minWage']);

/** Claves especiales calculadas (p. ej. "country" → nombre del país en el idioma activo). */
const resolvers = new Map<string, (p: Msg['p']) => string>();
export function registerResolver(key: string, fn: (p: Msg['p']) => string): void {
  resolvers.set(key, fn);
}

/** Traduce una clave. Si falta en el idioma activo se usa el inglés y, en último caso, la clave. */
export function t(key: string, params?: Msg['p']): string {
  const resolver = resolvers.get(key);
  if (resolver) return resolver(params);
  const raw = DICTS[current][key] ?? en[key] ?? key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, name: string) => {
    const v = params[name];
    if (v === undefined) return '';
    if (isMsg(v)) return tm(v);
    if (typeof v === 'number') return MONEY_PARAMS.has(name) ? formatMoney(v) : formatNumber(v);
    return v;
  });
}

/** Renderiza un mensaje (o deja pasar un texto ya hecho, p. ej. de partidas antiguas). */
export function tm(m: Msg | string | undefined | null): string {
  if (!m) return '';
  if (typeof m === 'string') return m;
  return t(m.k, m.p);
}

/** Variante elegida de forma determinista entre varias plantillas "clave.0", "clave.1"… */
export function variantKey(base: string, seed: number): string {
  let n = 0;
  while (en[`${base}.${n}`] !== undefined) n++;
  return n === 0 ? base : `${base}.${Math.abs(Math.floor(seed)) % n}`;
}

const INTL_LOCALE: Record<Locale, string> = { en: 'en-GB', es: 'es-ES', pt: 'pt-BR', ru: 'ru-RU' };
export function intlLocale(): string {
  return INTL_LOCALE[current];
}

export function formatNumber(v: number): string {
  return Number.isInteger(v) ? v.toLocaleString(intlLocale()) : v.toLocaleString(intlLocale(), { maximumFractionDigits: 2 });
}

/** Comprueba que todas las claves del inglés existen en los demás idiomas (para tests). */
export function missingKeys(): Record<Locale, string[]> {
  const out = {} as Record<Locale, string[]>;
  for (const l of Object.keys(DICTS) as Locale[]) out[l] = Object.keys(en).filter((k) => DICTS[l][k] === undefined);
  return out;
}
