// Metadatos en lote de todos los clubes candidatos de Wikidata:
//   · tipo: ¿es realmente un club de fútbol? (descarta personas como jugadores con P118)
//   · nombres y alias en en/es/de/fr/it/pt/nl para emparejar con FC 26 ("Bayern München" ≈ "Bayern Munich").
// Salida: data/wikidata/club-meta.json  { qid: { club: boolean, human: boolean, names: string[] } }
// Uso: npx tsx scripts/fetchClubMeta.ts
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const WD = join(process.cwd(), '..', '..', 'data', 'wikidata');
const OUT = join(WD, 'club-meta.json');
const UA = 'PitchsideManager/0.1 (videojuego personal; datos CC0 de Wikidata)';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface ClubMeta {
  club: boolean;
  human: boolean;
  names: string[];
}

async function sparql(query: string, attempt = 0): Promise<Record<string, { value: string }>[]> {
  try {
    const res = await fetch('https://query.wikidata.org/sparql', {
      method: 'POST',
      headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ query }).toString(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return ((await res.json()) as { results: { bindings: Record<string, { value: string }>[] } }).results.bindings;
  } catch (e) {
    if (attempt >= 4) throw e;
    await sleep(3000 * (attempt + 1));
    return sparql(query, attempt + 1);
  }
}

const meta: Record<string, ClubMeta> = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
const ids = new Set<string>();
for (const f of readdirSync(join(WD, 'countries'))) {
  const raw = JSON.parse(readFileSync(join(WD, 'countries', f), 'utf8')) as { leagues: { season: { teams: string[] } | null; members: string[] }[] };
  for (const l of raw.leagues) for (const id of [...(l.season?.teams ?? []), ...l.members]) ids.add(id);
}
const pending = [...ids].filter((id) => !meta[id]);
console.log(`Candidatos: ${ids.size} · pendientes: ${pending.length}`);

const qid = (u: string) => u.replace('http://www.wikidata.org/entity/', '');
for (let i = 0; i < pending.length; i += 200) {
  const batch = pending.slice(i, i + 200);
  const values = batch.map((q) => `wd:${q}`).join(' ');
  const types = await sparql(`SELECT ?x ?club ?human WHERE { VALUES ?x { ${values} }
      OPTIONAL { ?x wdt:P31/wdt:P279* wd:Q476028 . BIND(true AS ?club) }
      OPTIONAL { ?x wdt:P31 wd:Q5 . BIND(true AS ?human) } }`);
  const names = await sparql(`SELECT ?x ?n WHERE { VALUES ?x { ${values} }
      { ?x rdfs:label ?n } UNION { ?x skos:altLabel ?n }
      FILTER(LANG(?n) IN ("en","es","de","fr","it","pt","nl")) }`);
  for (const id of batch) meta[id] = { club: false, human: false, names: [] };
  for (const b of types) {
    const m = meta[qid(b.x.value)];
    if (b.club) m.club = true;
    if (b.human) m.human = true;
  }
  for (const b of names) {
    const m = meta[qid(b.x.value)];
    if (!m.names.includes(b.n.value)) m.names.push(b.n.value);
  }
  if ((i / 200) % 10 === 0) writeFileSync(OUT, JSON.stringify(meta));
  process.stdout.write(`  ${Math.min(i + 200, pending.length)}/${pending.length}\r`);
  await sleep(400);
}
writeFileSync(OUT, JSON.stringify(meta));
const all = Object.values(meta);
console.log(`\nClubes: ${all.filter((m) => m.club).length} · personas: ${all.filter((m) => m.human).length} · otros: ${all.filter((m) => !m.club && !m.human).length}`);
