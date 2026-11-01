// Construye la base de datos real por defecto del juego:
//   1º FC 26 (CSV SoFIFA): jugadores con atributos reales, clubes y ligas licenciadas.
//   2º Wikidata (data/wikidata): ligas y clubes reales de los 211 países, escudos, estadios,
//      aforos, colores y fundación.
// Reglas de fusión por país y división:
//   · Si FC 26 tiene la división completa, manda FC 26 (enriquecida con escudo/estadio de Wikidata).
//   · Si no, la lista de clubes es la de Wikidata y los clubes de FC 26 se emparejan por nombre.
//   · Los clubes reales sin jugadores en FC 26 reciben plantilla generada al crear el mundo.
// Salida: apps/web/public/data/world-db.json
// Uso: npx tsx scripts/buildDatabase.ts [ruta FC26.csv]
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  COUNTRIES,
  clubNameSimilarity,
  importSofifaCSV,
  toCompactDatabase,
  type ImportBundle,
  type ImportedClub,
  type ImportedLeague,
} from '../src';

const ROOT = join(process.cwd(), '..', '..');
const WD = join(ROOT, 'data', 'wikidata');
const DEFAULT_CSV = join(homedir(), '.cache', 'kagglehub', 'datasets', 'rovnez', 'fc-26-fifa-26-player-data', 'versions', '3', 'FC26_20250921.csv');
const csvPath = process.argv[2] ?? process.env.FC26_CSV ?? DEFAULT_CSV;

interface WikiClub {
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
interface WikiWorld {
  countries: Record<string, { leagues: { qid: string; name: string; level: number; clubs: string[] }[] }>;
  clubs: Record<string, WikiClub>;
}

if (!existsSync(csvPath)) throw new Error(`No se encuentra el CSV de FC 26 en ${csvPath}`);
const fc = importSofifaCSV(readFileSync(csvPath, 'utf8'), 'EA SPORTS FC 26 (SoFIFA)');
console.log(`FC 26: ${fc.players.length} jugadores · ${fc.clubs.length} clubes · ${fc.leagues.length} ligas`);
const wiki: WikiWorld = existsSync(join(WD, 'world.json')) ? JSON.parse(readFileSync(join(WD, 'world.json'), 'utf8')) : { countries: {}, clubs: {} };
const allWikiClubs: Record<string, WikiClub> = existsSync(join(WD, 'clubs.json')) ? JSON.parse(readFileSync(join(WD, 'clubs.json'), 'utf8')) : wiki.clubs;
const extraLogos: Record<string, { logoUrl: string }> = existsSync(join(WD, 'fc-logos.json')) ? JSON.parse(readFileSync(join(WD, 'fc-logos.json'), 'utf8')) : {};
console.log(`Wikidata: ${Object.keys(wiki.clubs).length} clubes en ligas · ${Object.keys(allWikiClubs).length} fichas`);
// Tipo real de cada candidato y nombres en varios idiomas (scripts/fetchClubMeta.ts).
const meta: Record<string, { club: boolean; human: boolean; names: string[] }> = existsSync(join(WD, 'club-meta.json')) ? JSON.parse(readFileSync(join(WD, 'club-meta.json'), 'utf8')) : {};
// Fotos de jugadores emparejadas por fecha de nacimiento (scripts/fetchPhotos.ts).
const photos: Record<string, string> = existsSync(join(WD, 'photos.json')) ? JSON.parse(readFileSync(join(WD, 'photos.json'), 'utf8')) : {};
/** Sólo clubes de fútbol de verdad: fuera personas (p. ej. jugadores con "liga" P118) y otros objetos. */
const isRealClub = (qid: string) => {
  const m = meta[qid];
  return !m || (m.club && !m.human);
};
const namesOf = (w: WikiClub) => [w.name, ...(meta[w.qid]?.names ?? [])];
const similarity = (name: string, w: WikiClub) => Math.max(...namesOf(w).map((n) => clubNameSimilarity(name, n)));
console.log(`Metadatos: ${Object.keys(meta).length} · fotos: ${Object.keys(photos).length}`);

// Todos los clubes que Wikidata asocia a cada país (para buscar escudos aunque no estén en la liga elegida).
const poolByCountry = new Map<string, WikiClub[]>();
if (existsSync(join(WD, 'countries'))) {
  for (const f of readdirSync(join(WD, 'countries'))) {
    const code = f.replace('.json', '');
    const raw = JSON.parse(readFileSync(join(WD, 'countries', f), 'utf8')) as { leagues: { season: { teams: string[] } | null; members: string[] }[] };
    const ids = new Set(raw.leagues.flatMap((l) => [...(l.season?.teams ?? []), ...l.members]));
    poolByCountry.set(code, [...ids].map((id) => allWikiClubs[id]).filter((c): c is WikiClub => !!c && !c.dissolved && !c.women && isRealClub(c.qid)));
  }
}

const REGIONAL =
  /paulista|carioca|mineiro|ga[uú]cho|baiano|pernambucano|paranaense|catarinense|goiano|cearense|regionalliga|oberliga|verbandsliga|landesliga|berlin-liga|estadual|provincial|regional|\bgrupo\b|\bgroup\b|conference|metropolitana|gales|wales|escocia|scotland|irlanda|ireland/i;
/** URL directa de la miniatura en upload.wikimedia.org (sin redirección y con CORS, para leer sus colores). */
function commons(file?: string): string | undefined {
  // Los .jpg asociados como "logo" suelen ser fotos del estadio o del equipo.
  if (!file || /\.jpe?g$/i.test(file)) return undefined;
  const name = file.replace(/ /g, '_');
  const md5 = createHash('md5').update(name, 'utf8').digest('hex');
  const enc = encodeURIComponent(name);
  const dir = `${md5[0]}/${md5.slice(0, 2)}/${enc}`;
  // Wikimedia sólo genera miniaturas en anchos estándar; los SVG se rasterizan a 250 px y los PNG se usan tal cual.
  return /\.svg$/i.test(name)
    ? `https://thumb.wikimedia.org/wikipedia/commons/thumb/${dir}/250px-${enc}.png`
    : `https://upload.wikimedia.org/wikipedia/commons/${dir}`;
}
const colorsOf = (w?: Partial<WikiClub>): [string, string] | undefined =>
  w?.colors && w.colors.length >= 2 ? [w.colors[0], w.colors[1]] : w?.colors?.length === 1 ? [w.colors[0], '#ffffff'] : undefined;

function fromWiki(w: WikiClub, code: string, leagueId: string): ImportedClub {
  return {
    externalId: `wd:${w.qid}`,
    name: w.name,
    shortName: w.short?.toUpperCase(),
    countryCode: code,
    leagueExternalId: leagueId,
    stadiumName: w.stadium,
    capacity: w.capacity,
    colors: colorsOf(w),
    logo: commons(w.logo) ?? okLogo(extraLogos[`wd:${w.qid}`]?.logoUrl),
    founded: w.founded,
    city: w.city,
  };
}

function enrich(c: ImportedClub, w: WikiClub | undefined): ImportedClub {
  if (!w) return { ...c, logo: c.logo ?? okLogo(extraLogos[c.externalId]?.logoUrl) };
  return {
    ...c,
    wikidataId: w.qid,
    shortName: c.shortName ?? w.short?.toUpperCase(),
    stadiumName: c.stadiumName ?? w.stadium,
    capacity: c.capacity ?? w.capacity,
    colors: c.colors ?? colorsOf(w),
    // El escudo del artículo del club emparejado manda sobre la búsqueda por nombre (más fiable).
    logo: c.logo ?? commons(w.logo) ?? okLogo(extraLogos[`wd:${w.qid}`]?.logoUrl) ?? okLogo(extraLogos[c.externalId]?.logoUrl),
    founded: c.founded ?? w.founded,
    city: c.city ?? w.city,
  };
}

// Equipos femeninos, filiales y juveniles comparten nombre con el primer equipo (p. ej. "Liverpool F.C. Women").
const SECONDARY = /women|ladies|femen|femin|frauen|f[ée]minin|donne|wfc|\bw\.?f\.?c\b|reserv|\bii\b|\bb\b|u-?\d\d|sub-?\d\d|juvenil|youth|academy|primavera/i;
const isSecondary = (w: WikiClub) => SECONDARY.test(w.name) || (w.founded ?? 0) >= 1985 && namesOf(w).some((n) => SECONDARY.test(n));
/** Entre empates gana el club "senior": más aforo y más antiguo. */
const seniority = (w: WikiClub) => (w.capacity ?? 0) / 1e5 + (2100 - (w.founded ?? 2100)) / 1e4;

function bestMatch(name: string, pool: WikiClub[], taken: Set<string>, threshold = 0.8): WikiClub | null {
  let best: WikiClub | null = null;
  let score = 0;
  const wantSecondary = SECONDARY.test(name);
  for (const w of pool) {
    if (taken.has(w.qid) || (!wantSecondary && isSecondary(w))) continue;
    const s = similarity(name, w) + seniority(w) * 0.01;
    if (s > score) {
      score = s;
      best = w;
    }
  }
  return score >= threshold ? best : null;
}

/** Imágenes que no son escudos (fotos de plantilla, estadio, celebraciones). */
const BAD_LOGO = /women|team|squad|players|stadium|stadion|estadio|celebrat|_\d{4}[-_]\d{2}|lineup|kit_|jersey|photo/i;
const okLogo = (url?: string) => (url && !BAD_LOGO.test(decodeURIComponent(url).replace(/^.*\//, '')) ? url : undefined);

const out: ImportBundle = { source: 'FC 26 + Wikidata', leagues: [], clubs: [], players: [], warnings: [] };
const remap = new Map<string, string>();
const stats = { fcTiers: 0, wikiTiers: 0, matched: 0, wikiOnly: 0, withLogo: 0 };

for (const country of COUNTRIES) {
  const code = country.code;
  const fcLeagues = fc.leagues.filter((l) => l.countryCode === code).sort((a, b) => a.tier - b.tier);
  const fcClubs = fc.clubs.filter((c) => c.countryCode === code);
  const pool = poolByCountry.get(code) ?? [];
  const taken = new Set<string>();
  // Ligas de Wikidata válidas, renumeradas.
  const wLeagues = (wiki.countries[code]?.leagues ?? [])
    .filter((l) => !REGIONAL.test(l.name) && (l.level === 1 || l.clubs.length >= 10))
    .map((l, i) => ({ ...l, level: i + 1 }));
  const inLeagues = new Set(wLeagues.flatMap((l) => l.clubs));
  const leaguePool = pool.filter((w) => inLeagues.has(w.qid));
  const fcCountByTier = new Map<number, number>();
  for (const c of fcClubs) {
    const t = fc.leagues.find((l) => l.externalId === c.leagueExternalId)?.tier ?? 1;
    fcCountByTier.set(t, (fcCountByTier.get(t) ?? 0) + 1);
  }
  const fcTierComplete = (t: number) => {
    const n = fcCountByTier.get(t) ?? 0;
    const w = wLeagues.find((l) => l.level === t)?.clubs.length ?? 0;
    return n >= 10 && n >= w * 0.9;
  };
  const fcMax = Math.max(0, ...fcLeagues.map((l) => l.tier));
  const fcCompleteTiers = [...fcCountByTier.keys()].filter(fcTierComplete).length;
  // Si FC 26 cubre ya dos o más divisiones completas, Wikidata no añade divisiones por debajo (sus niveles inferiores son poco fiables).
  const maxTier = Math.min(4, fcCompleteTiers >= 2 ? fcMax : Math.max(fcMax, wLeagues.length));

  for (let t = 1; t <= maxTier; t++) {
    const fcL = fcLeagues.find((l) => l.tier === t);
    const wL = wLeagues.find((l) => l.level === t);
    if (!fcL && !wL) continue;
    const league: ImportedLeague = { externalId: wL ? `wd:${wL.qid}` : (fcL as ImportedLeague).externalId, name: fcL?.name ?? (wL as { name: string }).name, countryCode: code, tier: t };
    out.leagues.push(league);
    const tierFc = fcClubs.filter((c) => (fc.leagues.find((l) => l.externalId === c.leagueExternalId)?.tier ?? 1) === t);
    if (fcL && fcTierComplete(t)) {
      stats.fcTiers++;
      for (const c of tierFc) {
        // Primero entre los clubes de las ligas nacionales (evita homónimos de categorías regionales), luego en todo el país.
        const w = bestMatch(c.name, leaguePool, taken) ?? bestMatch(c.name, pool, taken, 0.9) ?? undefined;
        if (w) taken.add(w.qid);
        const club = enrich({ ...c, leagueExternalId: league.externalId }, w);
        out.clubs.push(club);
        remap.set(c.externalId, club.externalId);
      }
      continue;
    }
    stats.wikiTiers++;
    const list: ImportedClub[] = (wL?.clubs ?? [])
      .filter(isRealClub)
      .map((q) => allWikiClubs[q] ?? wiki.clubs[q])
      .filter(Boolean)
      .map((w) => fromWiki(w, code, league.externalId));
    for (const c of list) taken.add(c.externalId.slice(3));
    const target = list.length;
    for (const c of tierFc) {
      let idx = -1;
      let score = 0;
      list.forEach((w, i) => {
        const wq = allWikiClubs[w.externalId.slice(3)];
        const s = wq && !SECONDARY.test(c.name) && isSecondary(wq) ? 0 : wq ? similarity(c.name, wq) : clubNameSimilarity(c.name, w.name);
        if (s > score && !remapHasTarget(w.externalId)) {
          score = s;
          idx = i;
        }
      });
      if (idx >= 0 && score >= 0.8) {
        list[idx] = { ...list[idx], name: c.name };
        remap.set(c.externalId, list[idx].externalId);
        stats.matched++;
      } else {
        const w = bestMatch(c.name, pool, taken) ?? undefined;
        if (w) taken.add(w.qid);
        const club = enrich({ ...c, leagueExternalId: league.externalId }, w);
        list.push(club);
        remap.set(c.externalId, club.externalId);
      }
    }
    // Clubes de FC 26 añadidos de más desplazan a los clubes sólo-Wikidata menos notorios (al final).
    const withPlayers = new Set(remap.values());
    while (list.length > Math.max(target, 8)) {
      const i = list.map((c) => withPlayers.has(c.externalId)).lastIndexOf(false);
      if (i < 0) break;
      list.splice(i, 1);
    }
    stats.wikiOnly += list.filter((c) => !withPlayers.has(c.externalId)).length;
    out.clubs.push(...list);
  }
  // Clubes de FC 26 en divisiones que no se modelan: a la última división disponible.
  for (const c of fcClubs) {
    if (remap.has(c.externalId)) continue;
    const last = out.leagues.filter((l) => l.countryCode === code).sort((a, b) => b.tier - a.tier)[0];
    if (!last) continue;
    const club = enrich({ ...c, leagueExternalId: last.externalId }, bestMatch(c.name, pool, taken) ?? undefined);
    out.clubs.push(club);
    remap.set(c.externalId, club.externalId);
  }
}

function remapHasTarget(id: string): boolean {
  for (const v of remap.values()) if (v === id) return true;
  return false;
}

const finalIds = new Set(out.clubs.map((c) => c.externalId));
for (const p of fc.players) {
  const club = p.clubExternalId ? remap.get(p.clubExternalId) : undefined;
  // Las fotos de cdn.sofifa.net bloquean el enlace directo (403): se usan las de Wikimedia Commons.
  const photo = photos[p.externalId];
  out.players.push({ ...p, photo, clubExternalId: club && finalIds.has(club) ? club : null });
}
stats.withLogo = out.clubs.filter((c) => c.logo).length;

const db = toCompactDatabase(out, ['EA SPORTS FC 26 (SoFIFA)', 'Wikidata (CC0)']);
const dest = join(ROOT, 'apps', 'web', 'public', 'data');
mkdirSync(dest, { recursive: true });
writeFileSync(join(dest, 'world-db.json'), JSON.stringify(db));
// Lista de clubes FC 26 sin escudo, para scripts/fetchLogos.ts.
writeFileSync(
  join(WD, 'missing-logos.json'),
  JSON.stringify(out.clubs.filter((c) => !c.logo && !c.externalId.startsWith('wd:')).map((c) => ({ id: c.externalId, name: c.name, country: c.countryCode }))),
);
const countries = new Set(out.leagues.map((l) => l.countryCode)).size;
console.log(`\nBase de datos: ${out.leagues.length} ligas reales en ${countries} países · ${out.clubs.length} clubes reales · ${out.players.length} jugadores`);
console.log(`  Divisiones de FC 26: ${stats.fcTiers} · de Wikidata: ${stats.wikiTiers} · emparejados: ${stats.matched} · clubes sólo Wikidata: ${stats.wikiOnly}`);
console.log(`  Con escudo: ${stats.withLogo}/${out.clubs.length}`);
for (const code of ['ENG', 'ESP', 'GER', 'ITA', 'COL', 'BRA', 'ARG', 'MEX', 'JAM']) {
  const ls = out.leagues.filter((l) => l.countryCode === code);
  console.log(`  ${code}: ${ls.map((l) => `${l.name} (${out.clubs.filter((c) => c.leagueExternalId === l.externalId).length})`).join(' · ')}`);
}
