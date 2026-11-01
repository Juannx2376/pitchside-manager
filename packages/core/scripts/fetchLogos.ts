// Escudos que no están en Wikimedia Commons (la mayoría tienen copyright y sólo existen en
// los artículos de Wikipedia). Se obtiene la imagen principal del artículo de cada club:
//   · clubes de Wikidata → título del artículo en en/es/pt/fr/de/it.wikipedia → PageImages (pilicense=any);
//   · clubes de FC 26 sin equivalente → búsqueda del nombre en en.wikipedia.
// Salida: data/wikidata/fc-logos.json { externalId: { logoUrl } }. Uso personal.
// Uso: npx tsx scripts/fetchLogos.ts   (después: npx tsx scripts/buildDatabase.ts)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { clubNameSimilarity, importCompactDatabase, type CompactDatabase } from '../src';

const ROOT = join(process.cwd(), '..', '..');
const WD = join(ROOT, 'data', 'wikidata');
const OUT = join(WD, 'fc-logos.json');
const UA = 'PitchsideManager/0.1 (videojuego personal)';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const logos: Record<string, { logoUrl: string }> = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};

async function getJson(url: string, init?: RequestInit, attempt = 0): Promise<unknown> {
  let wait = 3000 * (attempt + 1);
  try {
    const res = await fetch(url, { ...init, headers: { 'User-Agent': UA, Accept: 'application/json', ...(init?.headers ?? {}) } });
    if (res.status === 429) wait = Math.max(wait, Number(res.headers.get('retry-after') ?? 0) * 1000, 15000 * (attempt + 1));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    if (attempt >= 6) throw e;
    await sleep(wait);
    return getJson(url, init, attempt + 1);
  }
}

const db = importCompactDatabase(JSON.parse(readFileSync(join(ROOT, 'apps', 'web', 'public', 'data', 'world-db.json'), 'utf8')) as CompactDatabase);
// Descarta entradas guardadas que en realidad son fotos (p. ej. la plantilla femenina del PSG).
for (const [k, v] of Object.entries(logos)) if (/women|team|squad|players|stadium|celebrat|lineup|photo/i.test(decodeURIComponent(v.logoUrl).replace(/^.*\//, ''))) delete logos[k];
const missing = db.clubs.filter((c) => !c.logo && !logos[c.externalId]);
// --fc-only: salta la fase por artículos de Wikidata (ya hecha) y sólo busca los clubes de FC 26.
const wdMissing = process.argv.includes('--fc-only') ? [] : missing.filter((c) => c.externalId.startsWith('wd:'));
// Clubes de FC 26 emparejados con Wikidata: su escudo se busca por el artículo del club (clave wd:QID),
// que tiene prioridad sobre la búsqueda por nombre.
{
  // Siempre: clubes de FC 26 emparejados con Wikidata y aún sin escudo (Real Madrid no tiene logo libre en Commons).
  for (const c of db.clubs) {
    if (c.wikidataId && !logos[`wd:${c.wikidataId}`] && !c.externalId.startsWith('wd:')) wdMissing.push({ ...c, externalId: `wd:${c.wikidataId}` });
  }
}
const fcMissing = missing.filter((c) => !c.externalId.startsWith('wd:') && !c.wikidataId);
console.log(`Clubes sin escudo: ${missing.length} (Wikidata ${wdMissing.length}, FC 26 ${fcMissing.length})`);

// 1. Títulos de artículos por idioma (prioridad en > es > pt > fr > de > it).
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const titles = new Map<string, { lang: string; title: string }[]>();
for (let i = 0; i < wdMissing.length; i += 150) {
  const batch = wdMissing.slice(i, i + 150).map((c) => c.externalId.slice(3));
  const query = `SELECT ?club ?lang ?title WHERE {
    VALUES ?club { ${batch.map((q) => `wd:${q}`).join(' ')} }
    ?a schema:about ?club ; schema:inLanguage ?lang ; schema:name ?title ; schema:isPartOf ?site .
    FILTER(?lang IN (${LANGS.map((l) => `"${l}"`).join(',')}))
    FILTER(CONTAINS(STR(?site), "wikipedia.org"))
  }`;
  const json = (await getJson('https://query.wikidata.org/sparql', {
    method: 'POST',
    headers: { Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ query }).toString(),
  })) as { results: { bindings: Record<string, { value: string }>[] } };
  for (const b of json.results.bindings) {
    const id = `wd:${b.club.value.split('/').pop()}`;
    titles.set(id, [...(titles.get(id) ?? []), { lang: b.lang.value, title: b.title.value }]);
  }
  process.stdout.write(`  artículos ${Math.min(i + 150, wdMissing.length)}/${wdMissing.length}\r`);
  await sleep(500);
}
console.log(`\nClubes con artículo en Wikipedia: ${titles.size}`);

// 2. PageImages por idioma, 50 títulos por petición.
async function pageImages(lang: string, list: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < list.length; i += 50) {
    const batch = list.slice(i, i + 50);
    const url = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&piprop=thumbnail&pithumbsize=128&pilicense=any&redirects=1&titles=${encodeURIComponent(batch.join('|'))}`;
    const json = (await getJson(url)) as {
      query?: { pages?: Record<string, { title: string; thumbnail?: { source: string } }>; redirects?: { from: string; to: string }[]; normalized?: { from: string; to: string }[] };
    };
    const back = new Map<string, string>();
    for (const r of [...(json.query?.normalized ?? []), ...(json.query?.redirects ?? [])]) back.set(r.to, back.get(r.from) ?? r.from);
    for (const p of Object.values(json.query?.pages ?? {})) {
      if (!p.thumbnail?.source) continue;
      // Descartar fotos de estadios o mapas: los escudos suelen ser SVG/PNG.
      if (/\.(jpe?g)\//i.test(p.thumbnail.source) && !/logo|crest|escudo|badge|emblem/i.test(p.thumbnail.source)) continue;
      if (/women|team|squad|players|stadium|stadion|estadio|celebrat|lineup|photo/i.test(decodeURIComponent(p.thumbnail.source).replace(/^.*\//, ''))) continue;
      out.set(back.get(p.title) ?? p.title, p.thumbnail.source);
    }
    await sleep(1100);
  }
  return out;
}

for (const lang of LANGS) {
  const want = [...titles].filter(([id, ts]) => !logos[id] && ts.some((t) => t.lang === lang));
  if (want.length === 0) continue;
  const byTitle = new Map(want.map(([id, ts]) => [ts.find((t) => t.lang === lang)!.title, id]));
  const imgs = await pageImages(lang, [...byTitle.keys()]);
  for (const [title, src] of imgs) {
    const id = byTitle.get(title);
    if (id) logos[id] = { logoUrl: src };
  }
  console.log(`  ${lang}.wikipedia: ${imgs.size} escudos`);
  writeFileSync(OUT, JSON.stringify(logos));
}

// 3. Clubes de FC 26 sin equivalente: por país, todos los clubes de Wikidata con artículo en
//    en.wikipedia (una consulta), emparejo por nombre en local y PageImages en lotes de 50.
const qidsByCountry: Record<string, string[]> = existsSync(join(WD, 'country-qids.json')) ? JSON.parse(readFileSync(join(WD, 'country-qids.json'), 'utf8')) : {};
qidsByCountry.ENG = ['Q21', 'Q145'];
qidsByCountry.SCO = ['Q22', 'Q145'];
qidsByCountry.WAL = ['Q25', 'Q145'];
qidsByCountry.NIR = ['Q26', 'Q145'];
qidsByCountry.NED = ['Q55', 'Q29999'];
let found = 0;
const fcByCountry = new Map<string, typeof fcMissing>();
for (const c of fcMissing) fcByCountry.set(c.countryCode, [...(fcByCountry.get(c.countryCode) ?? []), c]);
for (const [code, list] of fcByCountry) {
  const qids = qidsByCountry[code];
  if (!qids?.length) continue;
  const query = `SELECT ?club ?label ?title WHERE {
    VALUES ?country { ${qids.map((q) => `wd:${q}`).join(' ')} }
    ?club wdt:P17 ?country ; wdt:P31/wdt:P279? wd:Q476028 .
    ?a schema:about ?club ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?title .
    OPTIONAL { ?club rdfs:label ?label . FILTER(LANG(?label) IN ("en","de","es","fr","it","pt","nl")) }
  }`;
  let rows: { club: { value: string }; label?: { value: string }; title: { value: string } }[] = [];
  try {
    const json = (await getJson('https://query.wikidata.org/sparql', {
      method: 'POST',
      headers: { Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ query }).toString(),
    })) as { results: { bindings: typeof rows } };
    rows = json.results.bindings;
  } catch (e) {
    console.log(`  ${code}: ${(e as Error).message}`);
    continue;
  }
  // Una fila por etiqueta e idioma: se agrupan por artículo ("FC Bayern Munich" en inglés, "FC Bayern München" en alemán).
  const byTitle = new Map<string, Set<string>>();
  for (const r of rows) {
    const set = byTitle.get(r.title.value) ?? new Set([r.title.value.replace(/\s*\(.*\)$/, '')]);
    if (r.label?.value) set.add(r.label.value);
    byTitle.set(r.title.value, set);
  }
  const candidates = [...byTitle]
    .filter(([title]) => !/women|ladies|femen|frauen|reserve|\bII\b|U-?\d\d/i.test(title))
    .map(([title, names]) => ({ title, names: [...names] }));
  const wanted = new Map<string, string>(); // título → externalId
  for (const c of list) {
    let best = '';
    let score = 0;
    for (const cand of candidates) {
      const s = Math.max(...cand.names.filter(Boolean).map((nm) => clubNameSimilarity(c.name, nm)));
      if (s > score) {
        score = s;
        best = cand.title;
      }
    }
    if (best && score >= 0.8 && !wanted.has(best)) wanted.set(best, c.externalId);
  }
  const imgs = await pageImages('en', [...wanted.keys()]);
  for (const [title, src] of imgs) {
    const id = wanted.get(title);
    if (id) {
      logos[id] = { logoUrl: src };
      found++;
    }
  }
  writeFileSync(OUT, JSON.stringify(logos));
  console.log(`  ${code}: ${wanted.size}/${list.length} emparejados, ${imgs.size} escudos`);
  await sleep(800);
}
console.log(`  clubes FC 26: ${found}/${fcMissing.length}`);
writeFileSync(OUT, JSON.stringify(logos));
console.log(`Total de escudos adicionales: ${Object.keys(logos).length} → ${OUT}`);
