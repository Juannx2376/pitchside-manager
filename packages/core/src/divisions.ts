// Corrige la base de datos importada con el registro oficial de divisiones (América):
//   · asigna cada club a su categoría real (descensos/ascensos incluidos),
//   · elimina duplicados (el mismo club con dos nombres),
//   · añade como clubes reales (con plantilla generada) los que faltan en FC26,
//   · fija el tamaño oficial de cada liga y separa ligas compartidas (MLS en EE. UU. y Canadá).
// Es una función pura: devuelve un bundle nuevo y no toca el original (la web lo cachea).
import { AMERICAS_DIVISIONS, type DivisionDef, type RegistryClub } from './data/americas';
import { CURATED_ROSTERS, type CuratedClub } from './data/curatedRosters';
import { clubNameSimilarity, clubNameTokens, type ImportBundle, type ImportedClub, type ImportedLeague } from './importer';
import { hashString } from './rng';
import type { Position } from './types';

const cache = new WeakMap<ImportBundle, ImportBundle>();

const strip = (name: string): string => name.replace(/\([^)]*\)/g, '').trim();
const keyOf = (name: string): string => [...new Set(clubNameTokens(strip(name)))].sort().join(' ');

/** Todas las formas de escribir un club del registro (nombre canónico + alias). */
function namesOf(r: RegistryClub): string[] {
  return [r.name, ...r.aliases];
}

/** Empareja un club del registro con uno del dataset (null si no hay). */
function matchClub(r: RegistryClub, pool: ImportedClub[], used: Set<string>): ImportedClub | null {
  const free = pool.filter((c) => !used.has(c.externalId));
  if (r.ext) {
    const byExt = free.find((c) => c.externalId === r.ext);
    if (byExt) return byExt;
  }
  const keys = new Set(namesOf(r).map(keyOf).filter(Boolean));
  const exact = free.filter((c) => keys.has(keyOf(c.name)));
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    // Varios con el mismo nombre normalizado: el que esté en la ciudad del registro, si no el primero.
    const city = r.city?.toLowerCase();
    return exact.find((c) => city && c.city?.toLowerCase() === city) ?? exact[0];
  }
  // Los nombres con calificativo «(LP)» son ambiguos a propósito: sólo valen exactos o por id.
  if (r.name.includes('(')) {
    const aliasKeys = r.aliases.map(keyOf);
    return free.find((c) => aliasKeys.includes(keyOf(c.name))) ?? null;
  }
  let best: ImportedClub | null = null;
  let bestScore = 0.86;
  for (const c of free) {
    for (const n of namesOf(r)) {
      const s = clubNameSimilarity(strip(n), c.name);
      if (s > bestScore) {
        bestScore = s;
        best = c;
      }
    }
  }
  return best;
}

const slug = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export function reconcileDivisions(bundle: ImportBundle, registry: DivisionDef[] = AMERICAS_DIVISIONS): ImportBundle {
  const cached = cache.get(bundle);
  if (cached) return cached;
  const countries = [...new Set(registry.map((d) => d.country))];
  const outLeagues: ImportedLeague[] = bundle.leagues.filter((l) => !countries.includes(l.countryCode));
  const outClubs: ImportedClub[] = bundle.clubs.filter((c) => !countries.includes(c.countryCode));
  const warnings = [...bundle.warnings];
  /** clubExternalId descartado → club que lo sustituye (los jugadores se reasignan). */
  const merged = new Map<string, string>();

  for (const code of countries) {
    const divs = registry.filter((d) => d.country === code).sort((a, b) => a.tier - b.tier);
    const maxTier = divs[divs.length - 1].tier;
    const pool = bundle.clubs.filter((c) => c.countryCode === code);
    // Datos propios del usuario (CSV de otra liga o de prueba): si casi ninguno de sus clubes figura en la
    // lista oficial se respeta el país tal cual, sin reordenarlo.
    const top = divs[0];
    const topKeys = new Set(top.clubs.flatMap((r) => namesOf(r).map(keyOf)));
    const recognised = pool.filter((c) => topKeys.has(keyOf(c.name))).length;
    if (pool.length > 0 && recognised < Math.min(3, Math.ceil(top.clubs.length * 0.2))) {
      outLeagues.push(...bundle.leagues.filter((l) => l.countryCode === code));
      outClubs.push(...pool);
      continue;
    }
    const used = new Set<string>();
    const registered: ImportedClub[] = [];
    for (const d of divs) {
      const leagueId = `reg:${code}:${d.tier}`;
      outLeagues.push({ externalId: leagueId, name: d.name, countryCode: code, tier: d.tier, size: d.size });
      for (const r of d.clubs) {
        const hit = matchClub(r, pool, used);
        let club: ImportedClub;
        if (hit) {
          used.add(hit.externalId);
          club = { ...hit, name: r.name, countryCode: code, leagueExternalId: leagueId, city: r.city ?? hit.city };
        } else {
          club = { externalId: `reg:${code}:${d.tier}:${slug(r.name)}`, name: r.name, countryCode: code, leagueExternalId: leagueId, city: r.city };
        }
        registered.push(club);
      }
    }
    outClubs.push(...registered);

    // Clubes del dataset que no están en ninguna lista oficial.
    const leftovers = pool.filter((c) => !used.has(c.externalId));
    const origLeague = new Map(bundle.leagues.filter((l) => l.countryCode === code).map((l) => [l.externalId, l]));
    const rest: { club: ImportedClub; tier: number }[] = [];
    for (const c of leftovers) {
      // Duplicado de un club ya registrado (p. ej. «Tigre» y «Club Atlético Tigre»): se fusiona.
      const dup = registered.find((r) => {
        if (!keyOf(r.name)) return false;
        if (clubNameSimilarity(strip(r.name), c.name) >= 0.9) return true;
        // «Club Atlético Tigre» ⊃ «Tigre»: sólo con nombres del registro sin calificativo (los «(LP)» son ambiguos).
        if (r.name.includes('(')) return false;
        const a = keyOf(r.name).split(' ');
        const b = keyOf(c.name).split(' ');
        const [small, big] = a.length <= b.length ? [a, b] : [b, a];
        return small.every((t) => big.includes(t)) && small.some((t) => t.length >= 4);
      });
      if (dup) {
        merged.set(c.externalId, dup.externalId);
        continue;
      }
      const t = c.leagueExternalId ? (origLeague.get(c.leagueExternalId)?.tier ?? maxTier + 1) : maxTier + 1;
      // Un club que el dataset tenía en una categoría que la lista oficial ya cubre baja al primer escalón libre.
      rest.push({ club: c, tier: Math.max(t, maxTier + 1) });
    }
    // Ligas de debajo del registro: se conservan y se renumeran seguidas.
    const lowerTiers = [...new Set(rest.map((x) => x.tier))].sort((a, b) => a - b);
    lowerTiers.forEach((tier, i) => {
      const newTier = maxTier + 1 + i;
      const leagueId = `reg:${code}:${newTier}`;
      const members = rest.filter((x) => x.tier === tier);
      outLeagues.push({
        externalId: leagueId,
        // Nombre genérico localizado («Nivel 3 de Argentina»): los nombres del dataset de estas categorías
        // no son fiables (repiten la competición de arriba o la numeran distinto).
        name: '',
        countryCode: code,
        tier: newTier,
        size: Math.max(members.length, newTier <= 4 ? 10 : 0),
      });
      for (const m of members) outClubs.push({ ...m.club, leagueExternalId: leagueId });
    });
  }

  const players = merged.size ? bundle.players.map((p) => (p.clubExternalId && merged.has(p.clubExternalId) ? { ...p, clubExternalId: merged.get(p.clubExternalId) as string } : p)) : [...bundle.players];
  const out: ImportBundle = { source: bundle.source, leagues: outLeagues, clubs: outClubs, players, warnings };
  if (registry === AMERICAS_DIVISIONS) applyCuratedRosters(out);
  cache.set(bundle, out);
  return out;
}

const OUTFIELD_CYCLE: Record<'D' | 'M' | 'F', Position[]> = {
  D: ['CB', 'RB', 'CB', 'LB', 'CB', 'RB', 'LB'],
  M: ['CM', 'DM', 'AM', 'CM', 'CM', 'DM', 'AM'],
  F: ['ST', 'RW', 'LW', 'ST', 'ST', 'RW', 'LW'],
};

/** Edad estable (22-31) para quien la fuente no informa. */
const fallbackAge = (name: string): number => 22 + (hashString(name) % 10);

/**
 * Añade las plantillas reales de referencia (`data/curatedRosters.ts`) a los clubes del registro que no traen
 * jugadores de FC 26. Muta el bundle (ya es una copia propia). La media y el potencial quedan sin fijar: se
 * estiman al crear el mundo según el nivel de la liga y del club, y los jugadores se marcan como `curated`.
 */
export function applyCuratedRosters(bundle: ImportBundle, rosters: CuratedClub[] = CURATED_ROSTERS): void {
  const withPlayers = new Map<string, number>();
  for (const p of bundle.players) if (p.clubExternalId) withPlayers.set(p.clubExternalId, (withPlayers.get(p.clubExternalId) ?? 0) + 1);
  const byName = new Map<string, ImportedClub>();
  for (const c of bundle.clubs) byName.set(`${c.countryCode}|${c.name}`, c);
  for (const r of rosters) {
    const club = byName.get(`${r.country}|${r.club}`);
    if (!club || (withPlayers.get(club.externalId) ?? 0) >= 8) continue;
    const cycleStart = hashString(r.club);
    const idx = { D: cycleStart, M: cycleStart + 2, F: cycleStart + 4 };
    r.squad.split(';').filter(Boolean).forEach((s, i) => {
      const [pos, nat, ...rest] = s.split(':');
      const ageRaw = Number(rest.pop());
      const full = rest.join(':').trim();
      if (!full || !['G', 'D', 'M', 'F'].includes(pos)) return;
      const space = full.indexOf(' ');
      const firstName = space > 0 ? full.slice(0, space) : '';
      const lastName = space > 0 ? full.slice(space + 1) : full;
      const position: Position = pos === 'G' ? 'GK' : OUTFIELD_CYCLE[pos as 'D' | 'M' | 'F'][idx[pos as 'D' | 'M' | 'F']++ % 7];
      bundle.players.push({
        externalId: `cur:${r.country}:${slug(r.club)}:${i}`,
        firstName,
        lastName,
        nationality: nat,
        age: ageRaw >= 15 && ageRaw <= 45 ? ageRaw : fallbackAge(full),
        position,
        secondaryPositions: [],
        clubExternalId: club.externalId,
        curated: true,
      });
    });
  }
}
