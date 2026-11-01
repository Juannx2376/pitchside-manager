// Descarga de Wikidata (licencia CC0) la estructura real del fútbol de los 211 países FIFA.
//   1) Por país (en paralelo): ligas masculinas con artículos en Wikipedia, su nivel (P3983),
//      los equipos de su temporada más reciente (P1923, ≥2023) y, como plan B, los clubes
//      con afiliación P118 vigente.
//   2) En lote: etiquetas de ligas y ficha de cada club (nombre, abreviatura, escudo, estadio,
//      aforo, fundación, colores, ciudad, disuelto/femenino para descartar).
// Resultado: data/wikidata/world.json. Caché por país en data/wikidata/countries/ (reanudable).
// Uso: npx tsx scripts/fetchWikidata.ts [--refresh]
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { COUNTRIES, ISO2 } from '../src';

const OUT_DIR = join(process.cwd(), '..', '..', 'data', 'wikidata');
const COUNTRY_DIR = join(OUT_DIR, 'countries');
if (process.argv.includes('--refresh')) rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(COUNTRY_DIR, { recursive: true });
const ENDPOINT = 'https://query.wikidata.org/sparql';
const UA = 'PitchsideManager/0.1 (videojuego personal; datos CC0 de Wikidata)';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Binding = Record<string, { value: string; 'xml:lang'?: string } | undefined>;

async function sparql(query: string, attempt = 0): Promise<Binding[]> {
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ query }).toString(),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (JSON.parse(text) as { results: { bindings: Binding[] } }).results.bindings;
  } catch (e) {
    if (attempt >= 4) throw e;
    await sleep(3000 * (attempt + 1));
    return sparql(query, attempt + 1);
  }
}

const qid = (uri = '') => uri.replace('http://www.wikidata.org/entity/', '');
const val = (b: Binding, k: string) => b[k]?.value;
const num = (b: Binding, k: string) => {
  const n = Number(val(b, k));
  return Number.isFinite(n) ? n : null;
};
const WOMEN = /femen|women|feminin|frauen|ladies|dames|damallsvenskan|kvinn|girls|wsl\b/i;
const NON_SENIOR = /\bsub-?\d|\bu-?\d{2}\b|youth|juvenil|reserv|junior|primavera|academy|futsal|beach|playa|indoor|\bcup\b|copa\b|coupe|pokal|trophy|shield|super ?cup|supercopa|play-?off/i;

// ── Países ──────────────────────────────────────────────────────
const SPECIAL: Record<string, string[]> = { ENG: ['Q21', 'Q145'], SCO: ['Q22'], WAL: ['Q25'], NIR: ['Q26'], KVX: ['Q1246'], TPE: ['Q865'], PLE: ['Q219060', 'Q407199'] };
const EXCLUDE: Record<string, RegExp> = { ENG: /scot|welsh|wales|cymru|northern ireland|irish|nifl/i };

async function countryQids(): Promise<Record<string, string[]>> {
  const f = join(OUT_DIR, 'country-qids.json');
  if (existsSync(f)) return { ...JSON.parse(readFileSync(f, 'utf8')), ...SPECIAL };
  const rows = await sparql(`SELECT ?c ?iso WHERE { ?c wdt:P297 ?iso . FILTER NOT EXISTS { ?c wdt:P576 ?e } }`);
  const byIso = new Map<string, string[]>();
  for (const b of rows) {
    const iso = (val(b, 'iso') ?? '').toLowerCase();
    byIso.set(iso, [...(byIso.get(iso) ?? []), qid(val(b, 'c'))]);
  }
  const out: Record<string, string[]> = {};
  for (const c of COUNTRIES) out[c.code] = SPECIAL[c.code] ?? byIso.get(ISO2[c.code]) ?? [];
  writeFileSync(f, JSON.stringify(out));
  return out;
}

// ── Datos crudos por país ───────────────────────────────────────
interface RawCountry {
  leagues: { qid: string; level: number | null; links: number; season: { year: number; teams: string[] } | null; members: string[] }[];
  clubLinks: Record<string, number>;
}

async function fetchCountry(code: string, qids: string[]): Promise<RawCountry> {
  const f = join(COUNTRY_DIR, `${code}.json`);
  if (existsSync(f)) return JSON.parse(readFileSync(f, 'utf8'));
  const L = `VALUES ?country { ${qids.map((q) => `wd:${q}`).join(' ')} }
    { ?league wdt:P31 wd:Q15991303 } UNION { ?league wdt:P31 wd:Q623109 ; wdt:P641 wd:Q2736 }
    ?league wdt:P17 ?country ; wikibase:sitelinks ?ll . FILTER(?ll >= 3)
    FILTER NOT EXISTS { ?league wdt:P576 ?ld }`;
  const leagueRows = await sparql(`SELECT ?league ?ll ?level WHERE { ${L} OPTIONAL { ?league wdt:P3983 ?level } }`);
  const raw: RawCountry = { leagues: [], clubLinks: {} };
  const byId = new Map<string, RawCountry['leagues'][number]>();
  for (const b of leagueRows) {
    const id = qid(val(b, 'league'));
    if (byId.has(id)) continue;
    const lg = { qid: id, level: num(b, 'level'), links: num(b, 'll') ?? 0, season: null, members: [] as string[] };
    byId.set(id, lg);
    raw.leagues.push(lg);
  }
  if (raw.leagues.length === 0) {
    writeFileSync(f, JSON.stringify(raw));
    return raw;
  }
  const seasonRows = await sparql(`
    SELECT ?league ?season ?start ?sl ?team ?tl WHERE { ${L}
      ?season wdt:P3450 ?league ; wdt:P1923 ?team .
      ?team wikibase:sitelinks ?tl .
      OPTIONAL { ?season wdt:P580 ?start }
      OPTIONAL { ?season rdfs:label ?sl . FILTER(LANG(?sl) = "en") }
    }`);
  const seasons = new Map<string, { league: string; year: number; teams: Set<string> }>();
  for (const b of seasonRows) {
    const s = qid(val(b, 'season'));
    const start = val(b, 'start');
    const years = (val(b, 'sl') ?? '').match(/20\d\d/g);
    const year = start ? Number(start.slice(0, 4)) : years ? Math.max(...years.map(Number)) : 0;
    const e = seasons.get(s) ?? { league: qid(val(b, 'league')), year, teams: new Set() };
    const team = qid(val(b, 'team'));
    e.teams.add(team);
    raw.clubLinks[team] = num(b, 'tl') ?? 0;
    seasons.set(s, e);
  }
  for (const s of seasons.values()) {
    const lg = byId.get(s.league);
    if (!lg || s.year < 2023 || s.teams.size < 8) continue;
    if (!lg.season || s.year > lg.season.year || (s.year === lg.season.year && s.teams.size > lg.season.teams.length)) {
      lg.season = { year: s.year, teams: [...s.teams] };
    }
  }
  const needMembers = raw.leagues.filter((l) => !l.season);
  if (needMembers.length) {
    const memberRows = await sparql(`
      SELECT ?league ?club ?cl WHERE {
        VALUES ?league { ${needMembers.map((l) => `wd:${l.qid}`).join(' ')} }
        ?club p:P118 ?st . ?st ps:P118 ?league .
        FILTER NOT EXISTS { ?st pq:P582 ?end }
        ?club wikibase:sitelinks ?cl .
      }`);
    for (const b of memberRows) {
      const lg = byId.get(qid(val(b, 'league')));
      const club = qid(val(b, 'club'));
      if (!lg) continue;
      lg.members.push(club);
      raw.clubLinks[club] = num(b, 'cl') ?? 0;
    }
  }
  writeFileSync(f, JSON.stringify(raw));
  return raw;
}

// ── Fichas en lote ──────────────────────────────────────────────
export interface WikiClub {
  qid: string;
  name: string;
  short?: string;
  logo?: string;
  stadium?: string;
  capacity?: number;
  founded?: number;
  colors?: string[];
  city?: string;
  dissolved?: boolean;
  women?: boolean;
}

async function fetchLabels(ids: string[]): Promise<Record<string, string>> {
  const f = join(OUT_DIR, 'league-labels.json');
  const out: Record<string, string> = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {};
  const pending = ids.filter((id) => !out[id]);
  for (let i = 0; i < pending.length; i += 200) {
    const batch = pending.slice(i, i + 200);
    const rows = await sparql(`
      SELECT ?x ?l WHERE { VALUES ?x { ${batch.map((q) => `wd:${q}`).join(' ')} }
        ?x rdfs:label ?l . FILTER(LANG(?l) IN ("es", "en")) }`);
    for (const b of rows) {
      const id = qid(val(b, 'x'));
      // Preferir español.
      if (!out[id] || b.l?.['xml:lang'] === 'es') out[id] = val(b, 'l') ?? id;
    }
    for (const id of batch) out[id] ??= id;
  }
  writeFileSync(f, JSON.stringify(out));
  return out;
}

async function fetchClubDetails(ids: string[]): Promise<Record<string, WikiClub>> {
  const f = join(OUT_DIR, 'clubs.json');
  const out: Record<string, WikiClub> = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {};
  const pending = ids.filter((id) => !out[id]);
  const batches: string[][] = [];
  for (let i = 0; i < pending.length; i += 150) batches.push(pending.slice(i, i + 150));
  let done = 0;
  await pool(batches, 3, async (batch) => {
    const rows = await sparql(`
      SELECT ?club ?label ?short ?logo ?venueLabel ?cap ?inception ?hex ?cityLabel ?dissolved ?women WHERE {
        VALUES ?club { ${batch.map((q) => `wd:${q}`).join(' ')} }
        OPTIONAL { ?club rdfs:label ?label . FILTER(LANG(?label) IN ("es", "en")) }
        OPTIONAL { ?club wdt:P1813 ?short }
        OPTIONAL { ?club wdt:P154 ?logo }
        OPTIONAL { ?club wdt:P115 ?venue . OPTIONAL { ?venue wdt:P1083 ?cap } OPTIONAL { ?venue rdfs:label ?venueLabel . FILTER(LANG(?venueLabel) = "en") } }
        OPTIONAL { ?club wdt:P571 ?inception }
        OPTIONAL { ?club wdt:P6364 ?color . ?color wdt:P465 ?hex }
        OPTIONAL { ?club wdt:P159 ?city . ?city rdfs:label ?cityLabel . FILTER(LANG(?cityLabel) = "en") }
        OPTIONAL { ?club wdt:P576 ?dissolved }
        OPTIONAL { ?club wdt:P2094 wd:Q606060 . BIND(true AS ?women) }
      }`);
    for (const b of rows) {
      const id = qid(val(b, 'club'));
      const c: WikiClub = out[id] ?? { qid: id, name: id };
      const label = val(b, 'label');
      if (label && (c.name === id || b.label?.['xml:lang'] === 'es')) c.name = label;
      const short = val(b, 'short');
      if (short && short.length <= 5 && (!c.short || short.length < c.short.length)) c.short = short;
      const logo = val(b, 'logo');
      if (logo && !c.logo) c.logo = decodeURIComponent(logo.split('/Special:FilePath/')[1] ?? '');
      if (val(b, 'venueLabel') && !c.stadium) c.stadium = val(b, 'venueLabel');
      const cap = num(b, 'cap');
      if (cap && cap > 0) c.capacity = Math.max(c.capacity ?? 0, Math.round(cap));
      const inc = val(b, 'inception');
      if (inc && !c.founded) c.founded = Number(inc.slice(0, 4)) || undefined;
      const hex = val(b, 'hex');
      if (hex) c.colors = [...new Set([...(c.colors ?? []), `#${hex}`])].slice(0, 2);
      if (val(b, 'cityLabel') && !c.city) c.city = val(b, 'cityLabel');
      if (val(b, 'dissolved')) c.dissolved = true;
      if (val(b, 'women')) c.women = true;
      out[id] = c;
    }
    for (const id of batch) out[id] ??= { qid: id, name: id };
    done += batch.length;
    process.stdout.write(`  fichas de clubes ${done}/${pending.length}\r`);
  });
  writeFileSync(f, JSON.stringify(out));
  return out;
}

async function pool<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (i < items.length) {
        const item = items[i++];
        await fn(item);
        await sleep(300);
      }
    }),
  );
}

// ── Ejecución ───────────────────────────────────────────────────
const cq = await countryQids();
const raw: Record<string, RawCountry> = {};
let n = 0;
await pool(COUNTRIES, 4, async (c) => {
  const qids = cq[c.code];
  if (!qids?.length) return;
  try {
    raw[c.code] = await fetchCountry(c.code, qids);
  } catch (e) {
    console.log(`  ${c.code}: error ${(e as Error).message}`);
  }
  n++;
  const r = raw[c.code];
  console.log(`[${n}/${COUNTRIES.length}] ${c.code}: ${r?.leagues.length ?? 0} ligas, ${r?.leagues.filter((l) => l.season).length ?? 0} con temporada`);
});

const leagueIds = Object.values(raw).flatMap((r) => r.leagues.map((l) => l.qid));
const allClubs = [...new Set(Object.values(raw).flatMap((r) => r.leagues.flatMap((l) => (l.season ? l.season.teams : l.members))))];
console.log(`Ligas: ${leagueIds.length} · clubes candidatos: ${allClubs.length}`);
const labels = await fetchLabels(leagueIds);
const clubs = await fetchClubDetails(allClubs);

// ── Selección final por país ────────────────────────────────────
interface OutLeague {
  qid: string;
  name: string;
  level: number;
  clubs: string[];
  source: 'season' | 'members';
}
const countries: Record<string, { leagues: OutLeague[] }> = {};
for (const c of COUNTRIES) {
  const r = raw[c.code];
  if (!r) continue;
  const valid = (id: string) => {
    const w = clubs[id];
    return !!w && !w.dissolved && !w.women && !WOMEN.test(w.name);
  };
  const cands = r.leagues
    .map((l) => {
      const name = labels[l.qid] ?? l.qid;
      if (WOMEN.test(name) || NON_SENIOR.test(name) || EXCLUDE[c.code]?.test(name)) return null;
      const ids = (l.season ? l.season.teams : l.members).filter(valid).sort((a, b) => (r.clubLinks[b] ?? 0) - (r.clubLinks[a] ?? 0));
      // Las afiliaciones vigentes pueden arrastrar históricos: se recorta a un tamaño de liga plausible.
      const clubIds = l.season ? ids : ids.slice(0, 20);
      const fame = clubIds.slice(0, 12).reduce((s, id) => s + (r.clubLinks[id] ?? 0), 0) / Math.max(1, Math.min(12, clubIds.length));
      return { qid: l.qid, name, level: l.level, clubIds, fame, season: !!l.season };
    })
    .filter((x): x is NonNullable<typeof x> => !!x && x.clubIds.length >= 6);
  // Nivel: el declarado (P3983) si existe; si no, por notoriedad de sus clubes. A igual nivel, la que tenga temporada y más clubes.
  cands.sort((a, b) => (a.level ?? 50 - Math.min(49, a.fame / 4)) - (b.level ?? 50 - Math.min(49, b.fame / 4)));
  const byFame = [...cands].sort((a, b) => b.fame - a.fame);
  const chosen: typeof cands = [];
  const used = new Set<string>();
  // Primero las de nivel declarado, una por nivel.
  for (const lv of [1, 2, 3, 4]) {
    const opts = cands.filter((x) => x.level === lv).sort((a, b) => Number(b.season) - Number(a.season) || b.clubIds.length - a.clubIds.length);
    if (opts[0]) chosen.push(opts[0]);
  }
  // Huecos (p. ej. ninguna liga con P3983=1): se rellenan con las más notorias sin nivel.
  for (const x of byFame) {
    if (chosen.length >= 4) break;
    if (x.level !== null || chosen.includes(x)) continue;
    chosen.push(x);
  }
  chosen.sort((a, b) => (a.level ?? 99) - (b.level ?? 99) || b.fame - a.fame);
  // Si la de nivel declarado 1 es menos notoria que una sin nivel, la sin nivel es la primera división real.
  chosen.sort((a, b) => {
    if (a.level !== null && b.level !== null) return a.level - b.level;
    return b.fame - a.fame;
  });
  const out: OutLeague[] = [];
  for (const x of chosen) {
    const ids = x.clubIds.filter((id) => !used.has(id));
    if (ids.length < 6) continue;
    ids.forEach((id) => used.add(id));
    out.push({ qid: x.qid, name: x.name, level: out.length + 1, clubs: ids, source: x.season ? 'season' : 'members' });
  }
  countries[c.code] = { leagues: out };
}
const usedIds = [...new Set(Object.values(countries).flatMap((x) => x.leagues.flatMap((l) => l.clubs)))];
const usedClubs: Record<string, WikiClub> = {};
for (const id of usedIds) usedClubs[id] = clubs[id];
writeFileSync(join(OUT_DIR, 'world.json'), JSON.stringify({ generatedAt: new Date().toISOString(), countries, clubs: usedClubs }));
console.log(`\nGuardado data/wikidata/world.json · ${Object.values(countries).filter((x) => x.leagues.length).length} países con ligas · ${usedIds.length} clubes`);
for (const code of ['ENG', 'ESP', 'GER', 'COL', 'ARG', 'BRA', 'JAM', 'JPN', 'NGA', 'FIJ']) {
  console.log(`  ${code}: ${(countries[code]?.leagues ?? []).map((l) => `N${l.level} ${l.name} (${l.clubs.length}, ${l.source})`).join(' · ') || '—'}`);
}
