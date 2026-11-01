// Importadores de datos reales:
//  (a) CSV estilo SoFIFA / EA Sports FC (datasets de Kaggle) → atributos completos.
//  (b) JSON de API-Football (/players/squads) → plantillas reales sin atributos (se estiman).
//  (c) JSON canónico de Pitchside (export/import propio, editable a mano).
// Todo desemboca en un ImportBundle que world.ts usa para poblar los países cargados.
import { ATTRIBUTE_KEYS, type AttrKey, type Attributes } from './attributes';
import { COUNTRY_BY_CODE, resolveCountryCode } from './data/countries';
import type { Msg } from './i18n';
import type { GameState } from './state';
import { clamp, POSITIONS, type Foot, type Position } from './types';

export interface ImportedLeague {
  externalId: string;
  name: string;
  countryCode: string;
  tier: number;
  /** Tamaño oficial de la liga (si hay menos clubes importados, el resto se genera). */
  size?: number;
}

export interface ImportedClub {
  externalId: string;
  name: string;
  shortName?: string;
  countryCode: string;
  leagueExternalId: string | null;
  stadiumName?: string;
  capacity?: number;
  colors?: [string, string];
  reputation?: number;
  logo?: string;
  founded?: number;
  city?: string;
  /** QID de Wikidata del club emparejado (para enriquecer escudos). */
  wikidataId?: string;
}

export interface ImportedPlayer {
  externalId: string;
  firstName: string;
  lastName: string;
  nationality: string;
  age: number;
  heightCm?: number;
  foot?: Foot;
  position: Position;
  secondaryPositions: Position[];
  attrs?: Partial<Attributes>;
  overall?: number;
  potential?: number;
  wage?: number;
  contractUntil?: number;
  reputation?: number;
  clubExternalId: string | null;
  photo?: string;
  /** Plantilla de referencia (nombres reales, media estimada): no viene de FC 26. */
  curated?: boolean;
}

export interface ImportBundle {
  source: string;
  leagues: ImportedLeague[];
  clubs: ImportedClub[];
  players: ImportedPlayer[];
  warnings: string[];
}

export function emptyBundle(source: string): ImportBundle {
  return { source, leagues: [], clubs: [], players: [], warnings: [] };
}

/** Fusiona varios bundles (p. ej. CSV de EA FC + JSON de API-Football para ligas menores). */
export function mergeBundles(bundles: ImportBundle[]): ImportBundle {
  const out = emptyBundle(bundles.map((b) => b.source).join(' + '));
  const leagues = new Map<string, ImportedLeague>();
  const clubs = new Map<string, ImportedClub>();
  const players = new Map<string, ImportedPlayer>();
  for (const b of bundles) {
    for (const l of b.leagues) leagues.set(l.externalId, l);
    for (const c of b.clubs) clubs.set(c.externalId, c);
    for (const p of b.players) players.set(p.externalId, p);
    out.warnings.push(...b.warnings);
  }
  out.leagues = [...leagues.values()];
  out.clubs = [...clubs.values()];
  out.players = [...players.values()];
  return out;
}

// ───────────────────────── CSV ─────────────────────────

/** Parser CSV con soporte de comillas, comillas escapadas y saltos de línea dentro de campos. */
export function parseCSV(text: string, delimiter = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Alias de columnas: cubre los datasets SoFIFA (FIFA 15–FC 24) y los de EA FC 25/26. */
const COLUMN_ALIASES: Record<string, string[]> = {
  id: ['player_id', 'sofifa_id', 'id', 'ID'],
  shortName: ['short_name', 'Name', 'name', 'Known As'],
  longName: ['long_name', 'Full Name', 'full_name'],
  positions: ['player_positions', 'Positions', 'positions', 'Position', 'Best Position'],
  overall: ['overall', 'OVR', 'Overall'],
  potential: ['potential', 'POT', 'Potential'],
  wage: ['wage_eur', 'Wage', 'wage'],
  age: ['age', 'Age'],
  height: ['height_cm', 'Height', 'height'],
  club: ['club_name', 'Team', 'Club', 'club'],
  clubId: ['club_team_id', 'team_id', 'club_id'],
  league: ['league_name', 'League', 'league'],
  leagueId: ['league_id'],
  leagueLevel: ['league_level'],
  nationality: ['nationality_name', 'Nation', 'Nationality', 'nationality'],
  contract: ['club_contract_valid_until_year', 'Contract Valid Until', 'contract_until'],
  foot: ['preferred_foot', 'Preferred Foot', 'foot'],
  reputation: ['international_reputation', 'International Reputation'],
  workRate: ['work_rate', 'Work Rate'],
  crossing: ['attacking_crossing', 'Crossing'],
  finishing: ['attacking_finishing', 'Finishing'],
  heading: ['attacking_heading_accuracy', 'Heading Accuracy', 'Heading'],
  shortPassing: ['attacking_short_passing', 'Short Passing'],
  volleys: ['attacking_volleys', 'Volleys'],
  dribbling: ['skill_dribbling', 'Dribbling'],
  curve: ['skill_curve', 'Curve'],
  fk: ['skill_fk_accuracy', 'Free Kick Accuracy'],
  longPassing: ['skill_long_passing', 'Long Passing'],
  ballControl: ['skill_ball_control', 'Ball Control'],
  acceleration: ['movement_acceleration', 'Acceleration'],
  sprint: ['movement_sprint_speed', 'Sprint Speed'],
  agility: ['movement_agility', 'Agility'],
  reactions: ['movement_reactions', 'Reactions'],
  balance: ['movement_balance', 'Balance'],
  shotPower: ['power_shot_power', 'Shot Power'],
  jumping: ['power_jumping', 'Jumping'],
  stamina: ['power_stamina', 'Stamina'],
  strength: ['power_strength', 'Strength'],
  longShots: ['power_long_shots', 'Long Shots'],
  aggression: ['mentality_aggression', 'Aggression'],
  interceptions: ['mentality_interceptions', 'Interceptions'],
  positioningAtt: ['mentality_positioning', 'Att. Position', 'Positioning'],
  vision: ['mentality_vision', 'Vision'],
  penalties: ['mentality_penalties', 'Penalties'],
  composure: ['mentality_composure', 'Composure'],
  marking: ['defending_marking_awareness', 'defending_marking', 'Def. Awareness', 'Marking'],
  standingTackle: ['defending_standing_tackle', 'Standing Tackle'],
  slidingTackle: ['defending_sliding_tackle', 'Sliding Tackle'],
  gkDiving: ['goalkeeping_diving', 'GK Diving'],
  gkHandling: ['goalkeeping_handling', 'GK Handling'],
  gkKicking: ['goalkeeping_kicking', 'GK Kicking'],
  gkPositioning: ['goalkeeping_positioning', 'GK Positioning'],
  gkReflexes: ['goalkeeping_reflexes', 'GK Reflexes'],
  photo: ['player_face_url', 'photo'],
};

const POSITION_MAP: Record<string, Position> = {
  GK: 'GK',
  POR: 'GK',
  RB: 'RB',
  RWB: 'RB',
  LD: 'RB',
  LB: 'LB',
  LWB: 'LB',
  LI: 'LB',
  CB: 'CB',
  DFC: 'CB',
  CDM: 'DM',
  DM: 'DM',
  MCD: 'DM',
  CM: 'CM',
  MC: 'CM',
  CAM: 'AM',
  AM: 'AM',
  MCO: 'AM',
  RM: 'RW',
  RW: 'RW',
  ED: 'RW',
  MD: 'RW',
  LM: 'LW',
  LW: 'LW',
  EI: 'LW',
  MI: 'LW',
  ST: 'ST',
  CF: 'ST',
  DC: 'ST',
  SD: 'ST',
};

export function mapPosition(raw: string): Position | null {
  const k = raw.trim().toUpperCase();
  if (POSITION_MAP[k]) return POSITION_MAP[k];
  if ((POSITIONS as readonly string[]).includes(k)) return k as Position;
  return null;
}

/** Ligas conocidas → país y nivel (para datasets donde la liga no indica país). */
const KNOWN_LEAGUES: Record<string, [string, number]> = {
  'premier league': ['ENG', 1],
  'english premier league': ['ENG', 1],
  championship: ['ENG', 2],
  'efl championship': ['ENG', 2],
  'english league championship': ['ENG', 2],
  'league one': ['ENG', 3],
  'english league one': ['ENG', 3],
  'league two': ['ENG', 4],
  'english league two': ['ENG', 4],
  laliga: ['ESP', 1],
  'la liga': ['ESP', 1],
  'laliga ea sports': ['ESP', 1],
  'spain primera division': ['ESP', 1],
  'laliga hypermotion': ['ESP', 2],
  'laliga 2': ['ESP', 2],
  'spanish segunda división': ['ESP', 2],
  bundesliga: ['GER', 1],
  'german 1. bundesliga': ['GER', 1],
  '2. bundesliga': ['GER', 2],
  'german 2. bundesliga': ['GER', 2],
  '3. liga': ['GER', 3],
  'serie a': ['ITA', 1],
  'italian serie a': ['ITA', 1],
  'serie b': ['ITA', 2],
  'italian serie b': ['ITA', 2],
  'ligue 1': ['FRA', 1],
  'french ligue 1': ['FRA', 1],
  'ligue 2': ['FRA', 2],
  'french ligue 2': ['FRA', 2],
  'liga portugal': ['POR', 1],
  'portuguese liga zon sagres': ['POR', 1],
  'liga portugal 2': ['POR', 2],
  eredivisie: ['NED', 1],
  'holland eredivisie': ['NED', 1],
  'belgian jupiler pro league': ['BEL', 1],
  '1a pro league': ['BEL', 1],
  'jupiler pro league': ['BEL', 1],
  'süper lig': ['TUR', 1],
  'turkish süper lig': ['TUR', 1],
  'trendyol süper lig': ['TUR', 1],
  'scottish premiership': ['SCO', 1],
  'cinch premiership': ['SCO', 1],
  'austrian football bundesliga': ['AUT', 1],
  'swiss super league': ['SUI', 1],
  'danish superliga': ['DEN', 1],
  '3f superliga': ['DEN', 1],
  eliteserien: ['NOR', 1],
  allsvenskan: ['SWE', 1],
  'polish ekstraklasa': ['POL', 1],
  'pko bp ekstraklasa': ['POL', 1],
  'czech first league': ['CZE', 1],
  'greek super league': ['GRE', 1],
  'romanian liga i': ['ROU', 1],
  'croatian hnl': ['CRO', 1],
  'ukrainian premier league': ['UKR', 1],
  'russian premier league': ['RUS', 1],
  'liga profesional de fútbol': ['ARG', 1],
  'argentina primera división': ['ARG', 1],
  'liga profesional': ['ARG', 1],
  'campeonato brasileiro série a': ['BRA', 1],
  'brasileirão série a': ['BRA', 1],
  'liga betplay dimayor': ['COL', 1],
  'colombian liga postobón': ['COL', 1],
  'liga dimayor': ['COL', 1],
  'chilean primera división': ['CHI', 1],
  'liga de primera': ['CHI', 1],
  'ecuadorian serie a': ['ECU', 1],
  'liga mx': ['MEX', 1],
  'mexican liga mx': ['MEX', 1],
  'major league soccer': ['USA', 1],
  mls: ['USA', 1],
  'usa major league soccer': ['USA', 1],
  'saudi pro league': ['KSA', 1],
  'roshn saudi league': ['KSA', 1],
  'saudi abdul l. jameel league': ['KSA', 1],
  'j1 league': ['JPN', 1],
  'meiji yasuda j1 league': ['JPN', 1],
  'k league 1': ['KOR', 1],
  'korean k league 1': ['KOR', 1],
  'chinese super league': ['CHN', 1],
  'a-league men': ['AUS', 1],
  'australian hyundai a-league': ['AUS', 1],
  'isuzu ute a-league men': ['AUS', 1],
  'uae pro league': ['UAE', 1],
  'qatar stars league': ['QAT', 1],
  'south african premier division': ['RSA', 1],
  'dstv premiership': ['RSA', 1],
};

function header(rows: string[][]): Map<string, number> {
  const m = new Map<string, number>();
  rows[0].forEach((h, i) => m.set(h.trim(), i));
  return m;
}

function col(h: Map<string, number>, key: string): number {
  for (const alias of COLUMN_ALIASES[key] ?? [key]) {
    const idx = h.get(alias);
    if (idx !== undefined) return idx;
  }
  return -1;
}

function num(row: string[], idx: number): number | null {
  if (idx < 0) return null;
  const raw = (row[idx] ?? '').trim();
  if (!raw) return null;
  // Formatos tipo "€110.5M", "€120K", "80+3" (FIFA live ratings).
  const plus = raw.match(/^(\d+)\s*[+-]\s*\d+$/);
  if (plus) return Number(plus[1]);
  const money = raw.match(/^€?\s*([\d.,]+)\s*([MK])?$/i);
  if (money) {
    const v = Number(money[1].replace(/,/g, ''));
    const mult = money[2]?.toUpperCase() === 'M' ? 1e6 : money[2]?.toUpperCase() === 'K' ? 1e3 : 1;
    return Number.isFinite(v) ? v * mult : null;
  }
  const v = Number(raw);
  return Number.isFinite(v) ? v : null;
}

function str(row: string[], idx: number): string {
  return idx < 0 ? '' : (row[idx] ?? '').trim();
}

function mean(...vals: (number | null)[]): number | null {
  const ok = vals.filter((v): v is number => v !== null);
  return ok.length ? ok.reduce((s, v) => s + v, 0) / ok.length : null;
}

function splitName(shortName: string, longName: string): { firstName: string; lastName: string } {
  const full = longName || shortName;
  const parts = full.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { firstName: '', lastName: parts[0] };
  // Si el "short_name" es tipo "L. Messi", tomamos su apellido.
  const shortParts = shortName.split(/\s+/);
  const last = shortParts.length > 1 && /\.$/.test(shortParts[0]) ? shortParts.slice(1).join(' ') : parts[parts.length - 1];
  return { firstName: parts[0], lastName: last };
}

export function importSofifaCSV(text: string, source = 'CSV SoFIFA/EA FC'): ImportBundle {
  const bundle = emptyBundle(source);
  const rows = parseCSV(text.replace(/^﻿/, ''));
  if (rows.length < 2) {
    bundle.warnings.push('El CSV no contiene filas de datos.');
    return bundle;
  }
  const h = header(rows);
  const c = (k: string) => col(h, k);
  const required = ['shortName', 'positions', 'overall'];
  for (const r of required) if (c(r) < 0) bundle.warnings.push(`Falta la columna obligatoria "${r}" (alias: ${COLUMN_ALIASES[r].join(', ')}).`);
  if (bundle.warnings.length) return bundle;

  const leagues = new Map<string, ImportedLeague>();
  const clubs = new Map<string, ImportedClub>();
  const clubNatCount = new Map<string, Map<string, number>>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 3) continue;
    const posList = str(row, c('positions'))
      .split(/[,/]/)
      .map(mapPosition)
      .filter((p): p is Position => p !== null);
    if (posList.length === 0) {
      bundle.warnings.push(`Fila ${i + 1}: posición desconocida "${str(row, c('positions'))}".`);
      continue;
    }
    const nat = resolveCountryCode(str(row, c('nationality')));
    if (!nat) {
      bundle.warnings.push(`Fila ${i + 1}: nacionalidad no reconocida "${str(row, c('nationality'))}".`);
      continue;
    }
    const clubName = str(row, c('club'));
    const clubExt = clubName ? str(row, c('clubId')) || `club:${clubName}` : null;
    const leagueName = str(row, c('league'));
    if (clubExt && !clubs.has(clubExt)) {
      const leagueExt = leagueName ? str(row, c('leagueId')) || `league:${leagueName}` : null;
      clubs.set(clubExt, { externalId: clubExt, name: clubName, countryCode: '', leagueExternalId: leagueExt });
      if (leagueExt && !leagues.has(leagueExt)) {
        const known = KNOWN_LEAGUES[leagueName.toLowerCase()];
        const level = num(row, c('leagueLevel'));
        leagues.set(leagueExt, { externalId: leagueExt, name: leagueName, countryCode: known?.[0] ?? '', tier: level ?? known?.[1] ?? 1 });
      }
    }
    if (clubExt) {
      const m = clubNatCount.get(clubExt) ?? new Map<string, number>();
      m.set(nat, (m.get(nat) ?? 0) + 1);
      clubNatCount.set(clubExt, m);
    }

    const g = (k: string) => num(row, c(k));
    const attrs: Partial<Attributes> = {};
    const set = (k: AttrKey, v: number | null) => {
      if (v !== null) attrs[k] = Math.round(clamp(v, 1, 99));
    };
    set('finishing', g('finishing'));
    set('passing', mean(g('shortPassing'), g('longPassing')));
    set('dribbling', g('dribbling'));
    set('firstTouch', g('ballControl'));
    set('crossing', g('crossing'));
    set('tackling', mean(g('standingTackle'), g('slidingTackle')));
    set('marking', g('marking'));
    set('heading', g('heading'));
    set('longShots', g('longShots'));
    set('setPieces', mean(g('fk'), g('curve'), g('penalties')));
    set('pace', g('sprint'));
    set('acceleration', g('acceleration'));
    set('stamina', g('stamina'));
    set('strength', g('strength'));
    set('agility', mean(g('agility'), g('balance')));
    set('jumping', g('jumping'));
    set('vision', g('vision'));
    set('decisions', g('reactions'));
    const isDef = ['CB', 'RB', 'LB', 'DM'].includes(posList[0]);
    set('positioning', isDef ? mean(g('interceptions'), g('marking')) : g('positioningAtt'));
    set('composure', g('composure'));
    set('aggression', g('aggression'));
    set('reflexes', g('gkReflexes'));
    set('handling', g('gkHandling'));
    set('oneOnOnes', mean(g('gkDiving'), g('gkPositioning')));
    // Atributos derivados (no existen en EA FC): trabajo, juego en equipo, liderazgo, forma natural.
    const wr = str(row, c('workRate')).toLowerCase();
    const wrScore = (s: string) => (s.includes('high') ? 82 : s.includes('low') ? 45 : 65);
    const [wrA, wrD] = wr.split('/').map((s) => s.trim());
    const age = num(row, c('age')) ?? 25;
    if (wr) set('workRate', (wrScore(wrA ?? '') + wrScore(wrD ?? '')) / 2);
    const ovr = g('overall') ?? 60;
    set('teamwork', mean(attrs.vision ?? null, attrs.workRate ?? null, g('interceptions')));
    set('leadership', clamp(ovr - 25 + (age - 20) * 2.2 + (g('reputation') ?? 1) * 4, 10, 95));
    set('naturalFitness', mean(attrs.stamina ?? null, attrs.strength ?? null, 100 - Math.max(0, age - 28) * 4));

    const { firstName, lastName } = splitName(str(row, c('shortName')), str(row, c('longName')));
    const footRaw = str(row, c('foot')).toLowerCase();
    const wage = g('wage');
    bundle.players.push({
      externalId: str(row, c('id')) || `row${i}`,
      firstName,
      lastName,
      nationality: nat,
      age,
      heightCm: g('height') ?? undefined,
      foot: footRaw.startsWith('l') ? 'L' : footRaw.startsWith('r') ? 'R' : undefined,
      position: posList[0],
      secondaryPositions: [...new Set(posList.slice(1))].filter((p) => p !== posList[0]),
      attrs,
      overall: ovr,
      potential: g('potential') ?? undefined,
      wage: wage ?? undefined,
      contractUntil: g('contract') ?? undefined,
      reputation: g('reputation') !== null ? clamp((g('reputation') as number) * 18 + (ovr - 60), 1, 99) : undefined,
      clubExternalId: clubExt,
      photo: str(row, c('photo')) || undefined,
    });
  }

  // País de cada liga: nacionalidad mayoritaria de todos sus jugadores (los nombres son ambiguos:
  // "Super League" existe en Suiza, Grecia y China). El nombre conocido sólo se usa si no hay datos.
  const leagueNat = new Map<string, Map<string, number>>();
  for (const club of clubs.values()) {
    if (!club.leagueExternalId) continue;
    const m = leagueNat.get(club.leagueExternalId) ?? new Map<string, number>();
    for (const [code, k] of clubNatCount.get(club.externalId) ?? []) m.set(code, (m.get(code) ?? 0) + k);
    leagueNat.set(club.leagueExternalId, m);
  }
  const majority = (m: Map<string, number> | undefined) => {
    let best = '';
    let n = 0;
    for (const [code, k] of m ?? []) if (k > n) [best, n] = [code, k];
    return best;
  };
  for (const l of leagues.values()) {
    const fromPlayers = majority(leagueNat.get(l.externalId));
    if (fromPlayers) l.countryCode = fromPlayers;
  }
  for (const club of clubs.values()) {
    const league = club.leagueExternalId ? leagues.get(club.leagueExternalId) : undefined;
    club.countryCode = league?.countryCode || majority(clubNatCount.get(club.externalId));
  }
  for (const l of leagues.values()) {
    const known = KNOWN_LEAGUES[l.name.toLowerCase()];
    if (!known || known[0] !== l.countryCode) bundle.warnings.push(`Liga "${l.name}" asignada a ${COUNTRY_BY_CODE[l.countryCode]?.name ?? '?'} (nivel ${l.tier}) por la nacionalidad de sus jugadores.`);
  }
  bundle.leagues = [...leagues.values()];
  bundle.clubs = [...clubs.values()];
  return bundle;
}

// ───────────────────────── API-Football ─────────────────────────

interface ApiFootballSquadResponse {
  response: {
    team: { id: number; name: string; logo?: string };
    players: { id: number; name: string; age: number | null; number: number | null; position: string; photo?: string }[];
  }[];
}

interface ApiFootballTeamsResponse {
  response: { team: { id: number; name: string; code?: string | null; country: string }; venue?: { name?: string; capacity?: number } }[];
}

const API_POS: Record<string, Position> = { Goalkeeper: 'GK', Defender: 'CB', Midfielder: 'CM', Attacker: 'ST' };

/**
 * Importa el JSON guardado por scripts/fetchApiFootball.ts:
 * { league: {id,name,country,tier}, teams: <respuesta /teams>, squads: <respuestas /players/squads> }.
 * API-Football no da atributos: se generan según la calidad de la liga en world.ts.
 */
export function importApiFootball(json: unknown): ImportBundle {
  const bundle = emptyBundle('API-Football');
  const data = json as { league: { id: number; name: string; country: string; tier?: number }; teams: ApiFootballTeamsResponse; squads: ApiFootballSquadResponse[] };
  if (!data?.league || !data?.teams?.response) {
    bundle.warnings.push('JSON de API-Football con formato inesperado (se espera {league, teams, squads}).');
    return bundle;
  }
  const countryCode = resolveCountryCode(data.league.country);
  if (!countryCode) {
    bundle.warnings.push(`País "${data.league.country}" no reconocido.`);
    return bundle;
  }
  const leagueExt = `apif:league:${data.league.id}`;
  bundle.leagues.push({ externalId: leagueExt, name: data.league.name, countryCode, tier: data.league.tier ?? 1 });
  for (const t of data.teams.response) {
    bundle.clubs.push({
      externalId: `apif:team:${t.team.id}`,
      name: t.team.name,
      shortName: t.team.code ?? undefined,
      countryCode,
      leagueExternalId: leagueExt,
      stadiumName: t.venue?.name,
      capacity: t.venue?.capacity,
    });
  }
  for (const sq of data.squads ?? []) {
    for (const entry of sq.response ?? []) {
      for (const pl of entry.players) {
        const parts = pl.name.split(/\s+/);
        bundle.players.push({
          externalId: `apif:player:${pl.id}`,
          firstName: parts.length > 1 ? parts[0] : '',
          lastName: parts.length > 1 ? parts.slice(1).join(' ') : parts[0],
          nationality: countryCode,
          age: pl.age ?? 25,
          position: API_POS[pl.position] ?? 'CM',
          secondaryPositions: [],
          clubExternalId: `apif:team:${entry.team.id}`,
        });
      }
    }
  }
  return bundle;
}

// ───────────────────────── Canónico ─────────────────────────

export function importCanonical(json: unknown): ImportBundle {
  const b = json as Partial<ImportBundle>;
  const bundle = emptyBundle(b.source ?? 'Pitchside JSON');
  if (!Array.isArray(b.leagues) || !Array.isArray(b.clubs) || !Array.isArray(b.players)) {
    bundle.warnings.push('El JSON canónico debe tener arrays "leagues", "clubs" y "players".');
    return bundle;
  }
  for (const l of b.leagues) {
    if (!COUNTRY_BY_CODE[l.countryCode]) bundle.warnings.push(`Liga ${l.name}: país ${l.countryCode} inválido.`);
    else bundle.leagues.push(l);
  }
  bundle.clubs = b.clubs.filter((c) => !!COUNTRY_BY_CODE[c.countryCode]);
  for (const p of b.players) {
    if (!(POSITIONS as readonly string[]).includes(p.position)) {
      bundle.warnings.push(`Jugador ${p.firstName} ${p.lastName}: posición inválida ${p.position}.`);
      continue;
    }
    if (p.attrs) for (const k of Object.keys(p.attrs)) if (!(ATTRIBUTE_KEYS as readonly string[]).includes(k)) delete (p.attrs as Record<string, number>)[k];
    bundle.players.push(p);
  }
  return bundle;
}

// ───────────────────────── Base de datos compacta ─────────────────────────

/**
 * Formato compacto "pitchside-db": el que genera scripts/buildDatabase.ts (FC26 + Wikidata)
 * y carga la web por defecto. Los atributos van como arreglo en el orden de ATTRIBUTE_KEYS.
 */
export interface CompactDatabase {
  format: 'pitchside-db';
  version: 1;
  generatedAt: string;
  sources: string[];
  attrOrder: string[];
  leagues: ImportedLeague[];
  clubs: ImportedClub[];
  /** [id, nombre, apellido, nac, edad, altura, pie, posiciones "CM,CDM", media, potencial, salario, fin contrato, reputación, club, foto, atributos[]] */
  players: [string, string, string, string, number, number, string, string, number, number, number, number, number, string | null, string, number[]][];
}

export function toCompactDatabase(b: ImportBundle, sources: string[]): CompactDatabase {
  return {
    format: 'pitchside-db',
    version: 1,
    generatedAt: new Date().toISOString(),
    sources,
    attrOrder: [...ATTRIBUTE_KEYS],
    leagues: b.leagues,
    clubs: b.clubs,
    players: b.players.map((p) => [
      p.externalId,
      p.firstName,
      p.lastName,
      p.nationality,
      p.age,
      p.heightCm ?? 0,
      p.foot ?? '',
      [p.position, ...p.secondaryPositions].join(','),
      p.overall ?? 0,
      p.potential ?? 0,
      p.wage ?? 0,
      p.contractUntil ?? 0,
      Math.round(p.reputation ?? 0),
      p.clubExternalId,
      p.photo ?? '',
      ATTRIBUTE_KEYS.map((k) => p.attrs?.[k] ?? 0),
    ]),
  };
}

export function importCompactDatabase(db: CompactDatabase): ImportBundle {
  const bundle = emptyBundle(db.sources.join(' + '));
  bundle.leagues = db.leagues;
  bundle.clubs = db.clubs;
  const order = db.attrOrder as AttrKey[];
  for (const r of db.players) {
    const [externalId, firstName, lastName, nationality, age, heightCm, foot, posStr, overall, potential, wage, contractUntil, reputation, club, photo, attrArr] = r;
    const pos = posStr.split(',') as Position[];
    const attrs: Partial<Attributes> = {};
    order.forEach((k, i) => {
      if (attrArr[i]) attrs[k] = attrArr[i];
    });
    bundle.players.push({
      externalId,
      firstName,
      lastName,
      nationality,
      age,
      heightCm: heightCm || undefined,
      foot: (foot || undefined) as Foot | undefined,
      position: pos[0],
      secondaryPositions: pos.slice(1),
      attrs,
      overall: overall || undefined,
      potential: potential || undefined,
      wage: wage || undefined,
      contractUntil: contractUntil || undefined,
      reputation: reputation || undefined,
      clubExternalId: club,
      photo: photo || undefined,
    });
  }
  return bundle;
}

const CLUB_NOISE = new Set([
  'fc', 'cf', 'sc', 'ac', 'as', 'cd', 'ud', 'sd', 'rc', 'afc', 'club', 'de', 'del', 'la', 'el', 'futbol', 'football', 'calcio',
  'sv', 'vfl', 'vfb', 'tsv', 'fk', 'sk', 'if', 'bk', 'ca', 'cp', 'sad', 'sa', 'clube', 'esporte', 'and', 'the', '1', 'ssc',
  'ss', 'us', 'bv', 'tsg', 'rcd', 'cda', 'ec', 'se', 'fbc', 'kv', 'kaa', 'krc', 'rsc', 'ogc', 'ol', 'og', 'asociacion', 'corporacion',
]);

/** Normaliza un nombre de club para emparejar fuentes distintas ("Real Madrid CF" ≈ "Real Madrid"). */
export function clubNameTokens(name: string): string[] {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !CLUB_NOISE.has(t));
}

export function clubNameSimilarity(a: string, b: string): number {
  const ta = new Set(clubNameTokens(a));
  const tb = new Set(clubNameTokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  // Coincidencia por contención ("Man Utd" no, pero "Bayern" ⊂ "Bayern München" sí).
  return inter / Math.min(ta.size, tb.size) * 0.7 + (inter / Math.max(ta.size, tb.size)) * 0.3;
}

/** Detecta el formato por contenido y delega en el importador adecuado. */
export function importAuto(fileName: string, text: string): ImportBundle {
  if (fileName.toLowerCase().endsWith('.csv')) return importSofifaCSV(text, fileName);
  const json = JSON.parse(text) as Record<string, unknown>;
  if (json?.format === 'pitchside-db') return importCompactDatabase(json as unknown as CompactDatabase);
  if (json && 'teams' in json && 'league' in json) return importApiFootball(json);
  return importCanonical(json);
}

// ───────────────────────── Cobertura ─────────────────────────

export interface CoverageRow {
  countryCode: string;
  countryName: string;
  leagues: { name: string | Msg; tier: number; realClubs: number; totalClubs: number; realPlayers: number; totalPlayers: number }[];
  realPct: number;
}

/** Qué parte del mundo cargado procede de datos reales y cuál es generada. */
export function coverageReport(state: GameState): CoverageRow[] {
  const rows: CoverageRow[] = [];
  for (const rt of Object.values(state.countries)) {
    if (!rt.loaded) continue;
    let real = 0;
    let total = 0;
    const leagues = rt.leagueIds.map((lid) => {
      const l = state.leagues[lid];
      let rc = 0;
      let rp = 0;
      let tp = 0;
      for (const cid of l.clubIds) {
        const club = state.clubs[cid];
        if (club.source === 'real') rc++;
        for (const pid of club.playerIds) {
          tp++;
          if (state.players[pid]?.source === 'real') rp++;
        }
      }
      real += rp;
      total += tp;
      return { name: l.name, tier: l.tier, realClubs: rc, totalClubs: l.clubIds.length, realPlayers: rp, totalPlayers: tp };
    });
    rows.push({ countryCode: rt.code, countryName: COUNTRY_BY_CODE[rt.code].name, leagues, realPct: total ? Math.round((100 * real) / total) : 0 });
  }
  return rows.sort((a, b) => b.realPct - a.realPct);
}
