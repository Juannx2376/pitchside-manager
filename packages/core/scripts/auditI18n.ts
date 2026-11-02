// Auditoría de traducciones: `npx tsx scripts/auditI18n.ts` (cwd packages/core).
// Lista textos de es/pt/ru idénticos al inglés (posible sin traducir) y claves con longitud sospechosa.
import { en as enDict } from '../src/i18n/en';
import { es } from '../src/i18n/es';
import { pt } from '../src/i18n/pt';
import { ru } from '../src/i18n/ru';

const dictionaries: Record<string, Record<string, string>> = { en: enDict, es, pt, ru };
const en = dictionaries.en;
const langs = ['es', 'pt', 'ru'] as const;
// Siglas, nombres propios y términos que se escriben igual en todos los idiomas.
const SAME_OK = /^(?:[\d\s.,:%+\-–—/€$£·×()'"!?]|\{[a-zA-Z]+\}|[A-Z]{1,5}|FC|VS|OVR|XP|KO|PK|xG|GK|CB|RB|LB|DM|CM|AM|RW|LW|ST|CF|WB|[A-Z]{2,4}\d?)+$/;

let total = 0;
for (const lang of langs) {
  const d = dictionaries[lang] as Record<string, string>;
  const same: string[] = [];
  const long: string[] = [];
  for (const [k, v] of Object.entries(en)) {
    const tr = d[k];
    if (typeof v !== 'string' || typeof tr !== 'string') continue;
    if (tr === v && v.length > 3 && !SAME_OK.test(v)) same.push(k);
    if (v.length > 12 && tr.length > v.length * 2.2) long.push(k);
  }
  total += same.length;
  console.log(`\n[${lang}] iguales al inglés: ${same.length} · demasiado largos: ${long.length}`);
  for (const k of same.slice(0, 60)) console.log(`  = ${k}: ${JSON.stringify(en[k])}`);
  for (const k of long.slice(0, 20)) console.log(`  ↔ ${k}: ${JSON.stringify(d[k])}`);
}
console.log(`\nTotal sin traducir probables: ${total}`);
