// Fotos de jugadores (Wikimedia Commons) para los jugadores de FC 26.
// Wikidata no guarda el ID de SoFIFA, así que se empareja por fecha de nacimiento + apellido:
// una consulta por año de nacimiento trae todos los futbolistas con foto (P18) y fecha (P569).
// Salida: data/wikidata/photos.json { sofifaId: url } (miniatura de 250 px en thumb.wikimedia.org).
// Uso: npx tsx scripts/fetchPhotos.ts [ruta FC26.csv]
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseCSV } from '../src';

const WD = join(process.cwd(), '..', '..', 'data', 'wikidata');
const OUT = join(WD, 'photos.json');
const DEFAULT_CSV = join(homedir(), '.cache', 'kagglehub', 'datasets', 'rovnez', 'fc-26-fifa-26-player-data', 'versions', '3', 'FC26_20250921.csv');
const csvPath = process.argv[2] ?? process.env.FC26_CSV ?? DEFAULT_CSV;
const UA = 'PitchsideManager/0.1 (videojuego personal; datos CC0 de Wikidata)';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);

function thumb(file: string): string {
  const name = decodeURIComponent(file).replace(/ /g, '_');
  const md5 = createHash('md5').update(name, 'utf8').digest('hex');
  const enc = encodeURIComponent(name);
  const ext = /\.(svg|tiff?)$/i.test(name) ? '.png' : '';
  return `https://thumb.wikimedia.org/wikipedia/commons/thumb/${md5[0]}/${md5.slice(0, 2)}/${enc}/250px-${enc}${ext}`;
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
    await sleep(4000 * (attempt + 1));
    return sparql(query, attempt + 1);
  }
}

const rows = parseCSV(readFileSync(csvPath, 'utf8'));
const h = rows[0];
const ix = (k: string) => h.indexOf(k);
const players = rows.slice(1).map((r) => ({ id: r[ix('player_id')], short: r[ix('short_name')], long: r[ix('long_name')], dob: r[ix('dob')] }));
const byDob = new Map<string, typeof players>();
for (const p of players) if (p.dob) byDob.set(p.dob, [...(byDob.get(p.dob) ?? []), p]);
const years = [...new Set(players.map((p) => Number(p.dob?.slice(0, 4))).filter((y) => y > 1970))].sort();
const photos: Record<string, string> = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
console.log(`Jugadores FC 26: ${players.length} · años de nacimiento ${years[0]}–${years[years.length - 1]}`);

for (const y of years) {
  const res = await sparql(`SELECT ?dob ?img ?label WHERE {
    ?x wdt:P106 wd:Q937857 ; wdt:P18 ?img ; wdt:P569 ?dob .
    FILTER(?dob >= "${y}-01-01T00:00:00Z"^^xsd:dateTime && ?dob < "${y + 1}-01-01T00:00:00Z"^^xsd:dateTime)
    ?x rdfs:label ?label . FILTER(LANG(?label) IN ("en", "es", "pt", "de", "fr"))
  }`);
  let matched = 0;
  for (const b of res) {
    const dob = b.dob.value.slice(0, 10);
    const cands = byDob.get(dob);
    if (!cands) continue;
    const label = norm(b.label.value);
    for (const p of cands) {
      if (photos[p.id]) continue;
      const surname = norm(p.short).filter((t) => !/^[a-z]$/.test(t));
      const full = norm(p.long);
      // El apellido "corto" de FC 26 debe aparecer en la etiqueta de Wikidata (o casi todo el nombre largo).
      const ok = surname.length > 0 && surname.every((t) => label.includes(t));
      const ok2 = full.filter((t) => label.includes(t)).length >= Math.min(2, full.length);
      if (ok || ok2) {
        photos[p.id] = thumb(b.img.value.split('/Special:FilePath/')[1] ?? '');
        matched++;
      }
    }
  }
  writeFileSync(OUT, JSON.stringify(photos));
  console.log(`  ${y}: ${res.length} futbolistas con foto · ${matched} emparejados`);
  await sleep(800);
}
console.log(`Fotos: ${Object.keys(photos).length}/${players.length} → ${OUT}`);
