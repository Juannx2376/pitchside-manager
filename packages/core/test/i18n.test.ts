import { describe, expect, it } from 'vitest';
import { missingKeys, setLocale, t, tm, msg } from '../src';
import { en } from '../src/i18n/en';
import { es } from '../src/i18n/es';
import { pt } from '../src/i18n/pt';
import { ru } from '../src/i18n/ru';

const params = (s: string) => new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));

describe('idiomas', () => {
  it('español, portugués y ruso tienen todas las claves del inglés', () => {
    const missing = missingKeys();
    expect(missing.es).toEqual([]);
    expect(missing.pt).toEqual([]);
    expect(missing.ru).toEqual([]);
  });

  it('las traducciones usan los mismos parámetros que el inglés', () => {
    const bad: string[] = [];
    for (const [name, dict] of [['es', es], ['pt', pt], ['ru', ru]] as const) {
      for (const [k, v] of Object.entries(en)) {
        const want = params(v);
        const got = params(dict[k] ?? v);
        for (const p of got) if (!want.has(p)) bad.push(`${name}:${k} usa {${p}}`);
        for (const p of want) if (!got.has(p)) bad.push(`${name}:${k} omite {${p}}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('cambiar de idioma retraduce los mensajes guardados', () => {
    const m = msg('news.injury.t', { p: 'Juan', injury: msg('injury.acl') });
    setLocale('en');
    expect(tm(m)).toBe('Juan injured: Torn cruciate ligament');
    setLocale('es');
    expect(tm(m)).toContain('Rotura del ligamento cruzado');
    setLocale('ru');
    expect(t('ui.nav.squad')).toBe('Состав');
    setLocale('en');
  });
});
