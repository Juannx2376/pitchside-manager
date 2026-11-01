// Formateadores dependientes del idioma: fechas de juego, países, posiciones, nombres de liga.
import { ISO2 } from '../data/countries';
import { gameDate, type Position } from '../types';
import { getLocale, intlLocale, registerResolver, t, tm, type Msg } from './index';

// msg('country', { code: 'COL' }) se traduce siempre al nombre del país en el idioma activo.
registerResolver('country', (p) => countryName(String(p?.code ?? '')));
registerResolver('pos', (p) => positionName(String(p?.p ?? 'CM') as Position));

const regionCache = new Map<string, Intl.DisplayNames>();
function regions(): Intl.DisplayNames {
  const l = intlLocale();
  let d = regionCache.get(l);
  if (!d) {
    d = new Intl.DisplayNames([l], { type: 'region' });
    regionCache.set(l, d);
  }
  return d;
}

/** Nombre del país en el idioma activo (las naciones del Reino Unido y Kosovo tienen claves propias). */
export function countryName(code: string): string {
  const special = t(`country.${code}`);
  if (special !== `country.${code}`) return special;
  const iso = ISO2[code];
  if (!iso) return code;
  try {
    return regions().of(iso.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

export function positionName(p: Position): string {
  return t(`pos.long.${p}`);
}

export function positionShort(p: Position): string {
  return t(`pos.short.${p}`);
}

/** "14 Aug 2026" / "14 ago 2026" / "14 авг. 2026". */
export function formatGameDate(season: number, day: number): string {
  return gameDate(season, day).toLocaleDateString(intlLocale(), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function formatGameDateLong(season: number, day: number): string {
  return gameDate(season, day).toLocaleDateString(intlLocale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** Nombre del mes de temporada (0 = julio). */
export function monthName(seasonMonth: number, season: number): string {
  const d = gameDate(season, 0);
  d.setUTCMonth(6 + seasonMonth);
  return d.toLocaleDateString(intlLocale(), { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function weekdayShort(i: number): string {
  // i = 0 lunes … 6 domingo (5 ene 2026 fue lunes).
  return new Date(Date.UTC(2026, 0, 5 + i)).toLocaleDateString(intlLocale(), { weekday: 'short', timeZone: 'UTC' });
}

/** Nombre a mostrar de cosas que pueden ser texto real o mensaje traducible (ligas genéricas, copas, estadios). */
export function displayName(name: string | Msg): string {
  return typeof name === 'string' ? name : tm(name);
}

export function isRussian(): boolean {
  return getLocale() === 'ru';
}
