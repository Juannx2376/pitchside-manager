// Construcción del mundo: países, ligas, clubes, plantillas, árbitros, periodistas, calendario,
// competiciones continentales y selecciones. Los datos importados (FC 26 + Wikidata) mandan;
// la generación sólo rellena los huecos.
import { aiChooseTactic, assignSquadStatuses, computeObjective, emptySetup, generateManager, pickLineup, assignTakers, randomColors, type Club } from './club';
import { aiSignSponsors, defaultFacilities, defaultFans, defaultTickets } from './clubOps';
import { createCup, cupRoundCount, cupRoundDays, generateLeagueFixtures, type Cup, type League } from './competition';
import { setupContinental } from './continental';
import { COUNTRIES, COUNTRY_BY_CODE, leagueReputation, type CountryDef } from './data/countries';
import { generateClubName, shortClubName } from './data/names';
import { reconcileDivisions } from './divisions';
import { blankFinances, initialFinances, setSeasonBudgets } from './finance';
import { msg } from './i18n';
import type { ImportBundle, ImportedClub, ImportedPlayer } from './importer';
import { emptyInternational, selectSquads } from './international';
import { generatePlayer, marketValue, overall, roundMoney, tierWageFactor, wageForQuality, type Player } from './player';
import { generateJournalist } from './press';
import { generateReferee } from './referee';
import { Rng } from './rng';
import { generateScout } from './scouting';
import { initialStaff, refreshStaffMarket } from './staff';
import { clubPlayers, newId, type GameState } from './state';
import { PRESETS, cloneTactic, makeTactic, nearestPreset, suggestRoles } from './tactics';
import { ATTRIBUTE_KEYS, POSITION_WEIGHTS } from './attributes';
import { clamp, type Formation, type Id, type Position, type TacticalStyle } from './types';

export interface WorldOptions {
  seed: number;
  season: number;
  loadedCountries: string[];
  bundle?: ImportBundle | null;
}

const SQUAD_TEMPLATE: Position[] = ['GK', 'GK', 'GK', 'RB', 'RB', 'CB', 'CB', 'CB', 'CB', 'LB', 'LB', 'DM', 'DM', 'CM', 'CM', 'CM', 'AM', 'AM', 'RW', 'RW', 'LW', 'LW', 'ST', 'ST', 'ST'];
/** Plantilla compacta (22) para clubes sin datos reales: con 211 países activos ahorra memoria. */
const COMPACT_TEMPLATE: Position[] = ['GK', 'GK', 'RB', 'RB', 'CB', 'CB', 'CB', 'LB', 'LB', 'DM', 'DM', 'CM', 'CM', 'AM', 'AM', 'RW', 'RW', 'LW', 'LW', 'ST', 'ST', 'ST'];
const DEPTH_PENALTY = [2, -3, -7, -9];

const CUP_NAMES: Record<string, string> = {
  ENG: 'FA Cup',
  ESP: 'Copa del Rey',
  GER: 'DFB-Pokal',
  ITA: 'Coppa Italia',
  FRA: 'Coupe de France',
  POR: 'Taça de Portugal',
  NED: 'KNVB Beker',
  BRA: 'Copa do Brasil',
  ARG: 'Copa Argentina',
  COL: 'Copa BetPlay DIMAYOR',
  MEX: 'Copa MX',
  USA: 'U.S. Open Cup',
  JPN: "Emperor's Cup",
  KSA: "King's Cup",
};

export function emptyState(seed: number, season: number): GameState {
  return {
    version: 4,
    seed,
    rngState: seed,
    season,
    day: 0,
    countries: {},
    leagues: {},
    cups: {},
    continental: {},
    international: emptyInternational(),
    clubs: {},
    players: {},
    managers: {},
    referees: {},
    journalists: {},
    scouts: {},
    scoutAssignments: {},
    scoutReports: {},
    staff: {},
    staffMarket: [],
    sponsorOffers: [],
    shortlist: [],
    negotiations: {},
    news: [],
    social: [],
    transfers: [],
    awards: [],
    achievements: [],
    jobOffers: [],
    freeAgentIds: [],
    userClubId: null,
    userManagerId: null,
    nextId: 0,
    userMatches: [],
    pendingFixtureId: null,
    pendingPress: null,
    gameOver: null,
    settings: { matchMode: 'live', matchSpeed: 1, autoPress: false },
    monthlyMinutes: {},
    monthlyClubMatches: {},
    monthlyRatings: {},
    trainingEvents: [],
    objectives: [],
  };
}

export const ALL_COUNTRY_CODES = COUNTRIES.map((c) => c.code);

function initWorld(opts: WorldOptions): { state: GameState; rng: Rng; codes: string[] } {
  const state = emptyState(opts.seed, opts.season);
  const rng = new Rng(opts.seed);
  for (const c of COUNTRIES) {
    state.countries[c.code] = { code: c.code, loaded: false, leagueIds: [], cupId: null, refereeIds: [], journalistIds: [], poolPlayerIds: [] };
  }
  const codes = opts.loadedCountries.length ? opts.loadedCountries : ALL_COUNTRY_CODES;
  for (const code of codes) if (!COUNTRY_BY_CODE[code]) throw new Error(`unknown country ${code}`);
  return { state, rng, codes };
}

function finishWorld(state: GameState, rng: Rng): void {
  setupContinental(state, rng);
  selectSquads(state);
  refreshStaffMarket(state, rng);
  ensureValues(state);
}

/**
 * Los jugadores nacen con `value = 0` y sólo se tasaban en el desarrollo mensual: durante el primer mes
 * (y en partidas antiguas) el precio aparecía a 0. Esto lo calcula al crear/cargar el mundo.
 */
export function ensureValues(state: GameState): void {
  for (const p of Object.values(state.players)) {
    if (p.retired || p.value > 0) continue;
    const code = p.clubId ? (state.clubs[p.clubId]?.countryCode ?? p.nationality) : p.nationality;
    p.value = marketValue(p, { econ: COUNTRY_BY_CODE[code]?.econ ?? 0.05, season: state.season });
  }
}

/** Crea el mundo. `loadedCountries` vacío = los 211 países activos. */
export function createWorld(opts: WorldOptions): GameState {
  const { state, rng, codes } = initWorld(opts);
  for (const code of codes) loadCountry(state, rng, code, opts.bundle ?? null);
  finishWorld(state, rng);
  state.rngState = rng.state;
  return state;
}

/** Igual que createWorld pero cede el hilo entre países (la interfaz muestra el progreso). */
export async function createWorldAsync(opts: WorldOptions, onProgress?: (done: number, total: number, code: string) => void): Promise<GameState> {
  const { state, rng, codes } = initWorld(opts);
  for (let i = 0; i < codes.length; i++) {
    loadCountry(state, rng, codes[i], opts.bundle ?? null);
    onProgress?.(i + 1, codes.length, codes[i]);
    if (i % 4 === 3) await new Promise((r) => setTimeout(r, 0));
  }
  finishWorld(state, rng);
  state.rngState = rng.state;
  return state;
}

/** Reputación global (1-99) a partir del nivel de la plantilla: los gigantes quedan arriba en todo el mundo. */
export function reputationFromLevel(level: number, leagueRep: number): number {
  return Math.round(clamp((level - 45) * 2.1 + leagueRep * 0.15, 1, 99));
}

export function loadCountry(state: GameState, rng: Rng, code: string, rawBundle: ImportBundle | null): void {
  // Divisiones oficiales de América (ascensos, descensos, duplicados y clubes que faltan en FC26).
  const bundle = rawBundle ? reconcileDivisions(rawBundle) : null;
  const country = COUNTRY_BY_CODE[code];
  const rt = state.countries[code];
  if (rt.loaded) return;
  rt.loaded = true;
  const usedNames = new Set<string>();
  const importedLeagues = (bundle?.leagues ?? []).filter((l) => l.countryCode === code);
  const playersByClub = new Map<string, ImportedPlayer[]>();
  for (const p of bundle?.players ?? []) {
    if (!p.clubExternalId) continue;
    const arr = playersByClub.get(p.clubExternalId) ?? [];
    arr.push(p);
    playersByClub.set(p.clubExternalId, arr);
  }

  const realTiers = importedLeagues.length ? Math.min(4, Math.max(...importedLeagues.map((l) => l.tier))) : 0;
  const tiers = realTiers || country.tiers;
  for (let t = 1; t <= tiers; t++) {
    const imp = importedLeagues.find((l) => l.tier === t);
    const size = imp ? 0 : (country.teamsPerTier[t - 1] ?? country.teamsPerTier[country.teamsPerTier.length - 1]);
    const realName = imp?.name ?? country.leagueNames[t - 1];
    const league: League = {
      id: newId(state, 'l'),
      countryCode: code,
      name: realName || msg('league.generic', { tier: t, country: msg('country', { code }) }),
      tier: t,
      clubIds: [],
      reputation: leagueReputation(country, t),
      promotionSlots: 0,
      relegationSlots: 0,
      fixtures: [],
      pointsDeductions: {},
      champions: [],
      topScorers: [],
    };
    state.leagues[league.id] = league;
    rt.leagueIds.push(league.id);
    const importedClubs: { club: ImportedClub; players: ImportedPlayer[]; level: number }[] = imp
      ? (bundle?.clubs ?? [])
          .filter((c) => c.leagueExternalId === imp.externalId)
          .map((club) => {
            const players = playersByClub.get(club.externalId) ?? [];
            const ovs = players.map((p) => p.overall ?? 0).filter((v) => v > 0).sort((a, b) => b - a).slice(0, 16);
            return { club, players, level: ovs.length ? ovs.reduce((s, v) => s + v, 0) / ovs.length : 0 };
          })
          .sort((a, b) => b.level - a.level)
      : [];
    const total = imp ? Math.max(importedClubs.length, imp.size ?? 0, 4) : size;
    for (let rank = 0; rank < total; rank++) {
      const ic = importedClubs[rank];
      const club = buildClub(state, rng, { country, league, tier: t, rank, size: total, usedNames, imported: ic?.club ?? null, importedPlayers: ic?.players ?? [] });
      league.clubIds.push(club.id);
    }
    league.fixtures = generateLeagueFixtures(league, rng, () => newId(state, 'f'));
    for (const cid of league.clubIds) {
      const club = state.clubs[cid];
      club.objective = computeObjective(club, league.clubIds.map((id) => state.clubs[id]), t);
      club.objectives.league = club.objective;
      setSeasonBudgets(club, clubPlayers(state, cid), t, total - 1);
    }
  }
  for (let i = 0; i + 1 < rt.leagueIds.length; i++) {
    const upper = state.leagues[rt.leagueIds[i]];
    const lower = state.leagues[rt.leagueIds[i + 1]];
    const n = Math.min(upper.clubIds.length, lower.clubIds.length) <= 12 ? 2 : 3;
    upper.relegationSlots = n;
    lower.promotionSlots = n;
  }
  const allClubIds = rt.leagueIds.flatMap((lid) => state.leagues[lid].clubIds).sort((a, b) => state.clubs[b].reputation - state.clubs[a].reputation);
  const cup: Cup = createCup(newId(state, 'cup'), code, CUP_NAMES[code] ?? msg('cup.generic', { country: msg('country', { code }) }), allClubIds);
  state.cups[cup.id] = cup;
  rt.cupId = cup.id;
  const refCount = clamp(Math.round(allClubIds.length / 2.5), 6, 24);
  for (let i = 0; i < refCount; i++) {
    const r = generateReferee(rng, newId(state, 'r'), country);
    state.referees[r.id] = r;
    rt.refereeIds.push(r.id);
  }
  for (let i = 0; i < 6; i++) {
    const j = generateJournalist(rng, newId(state, 'j'), country);
    state.journalists[j.id] = j;
    rt.journalistIds.push(j.id);
  }
  for (const ip of bundle?.players ?? []) {
    if (ip.clubExternalId || ip.nationality !== code) continue;
    const p = playerFromImport(state, rng, ip, country.quality, country, 1);
    p.contract = null;
    state.players[p.id] = p;
    state.freeAgentIds.push(p.id);
  }
  for (let i = 0; i < 8; i++) {
    const position = rng.pick(SQUAD_TEMPLATE);
    const p = generatePlayer(rng, { id: newId(state, 'p'), country, position, quality: country.quality - 8 + rng.gauss(0, 5), season: state.season, age: rng.int(24, 34) });
    state.players[p.id] = p;
    state.freeAgentIds.push(p.id);
  }
}

interface BuildClubOpts {
  country: CountryDef;
  league: League;
  tier: number;
  rank: number;
  size: number;
  usedNames: Set<string>;
  imported: ImportedClub | null;
  importedPlayers: ImportedPlayer[];
}

const NEIGHBOURS = new Map<string, CountryDef[]>();

/** Un país de la misma confederación (para los extranjeros de las plantillas generadas). */
function neighbourCountry(country: CountryDef, rng: Rng): CountryDef {
  let list = NEIGHBOURS.get(country.confederation);
  if (!list) {
    list = COUNTRIES.filter((c) => c.confederation === country.confederation && c.quality >= 45);
    NEIGHBOURS.set(country.confederation, list);
  }
  const others = list.filter((c) => c.code !== country.code);
  return others.length ? rng.pick(others) : country;
}

function buildClub(state: GameState, rng: Rng, o: BuildClubOpts): Club {
  const { country, league, tier, rank, size } = o;
  const leagueQuality = country.quality - (tier - 1) * 5.5;
  const spread = ((size / 2 - rank) / size) * 9;
  let clubQuality = leagueQuality + spread + rng.gauss(0, 1.2);
  const importedLevels = o.importedPlayers.map((p) => p.overall ?? 0).filter((v) => v > 0).sort((a, b) => b - a).slice(0, 16);
  if (importedLevels.length >= 8) clubQuality = importedLevels.reduce((s, v) => s + v, 0) / importedLevels.length;
  const reputation = o.imported?.reputation ?? reputationFromLevel(clubQuality + rng.gauss(0, 1), league.reputation);
  const named = o.imported ? { name: o.imported.name, city: o.imported.city ?? o.imported.name } : generateClubName(rng, country.nameRegion, o.usedNames);
  const capacity = o.imported?.capacity ?? Math.round(3000 + reputation * reputation * 5 * (0.5 + 0.5 * Math.min(1, country.econ * 1.5)) * rng.float(0.8, 1.2));
  const id = newId(state, 'c');
  const facilityLevel = Math.round(clamp(reputation / 22, 0, 4));
  const club: Club = {
    id,
    name: named.name,
    shortName: o.imported?.shortName ?? shortClubName(named.name),
    city: named.city,
    countryCode: country.code,
    leagueId: league.id,
    reputation,
    colors: o.imported?.colors ?? randomColors(rng),
    stadium: { name: o.imported?.stadiumName ?? `Arena ${named.city}`, capacity, condition: Math.round(clamp(rng.gauss(70, 12), 30, 100)) },
    fanBase: Math.round(capacity * rng.float(0.9, 1.7)),
    youthFacilities: Math.round(clamp(reputation + rng.gauss(0, 12), 5, 99)),
    youthRecruitment: Math.round(clamp(reputation + rng.gauss(0, 14), 5, 99)),
    trainingFacilities: Math.round(clamp(reputation + rng.gauss(0, 10), 5, 99)),
    staffQuality: Math.round(clamp(reputation * 0.9 + rng.gauss(0, 8), 5, 99)),
    managerId: null,
    playerIds: [],
    scoutIds: [],
    staffIds: [],
    tactic: emptySetup(makeTactic(`ai-${id}`, 'BALANCED', 'BALANCED')),
    savedTactics: [],
    tacticFamiliarity: 70,
    chemistry: Math.round(clamp(rng.gauss(62, 10), 30, 90)),
    boardConfidence: 60,
    objective: 'mid_table',
    objectives: { league: 'mid_table', cupRound: 0, financeTarget: 0, youthMinutes: 0, brandReputation: reputation },
    finances: blankFinances(),
    sponsors: [],
    loans: [],
    projects: [],
    facilities: { ...defaultFacilities(), medical: facilityLevel, fanShop: facilityLevel, parking: Math.max(1, facilityLevel - 1), vipBoxes: Math.max(0, facilityLevel - 1) },
    tickets: defaultTickets(),
    fans: { satisfaction: 60, members: 0 },
    isUser: false,
    source: o.imported ? 'real' : 'generated',
    leakPressure: 0,
    cupProgress: 0,
    logo: o.imported?.logo,
    colorsKnown: !!o.imported?.colors,
    founded: o.imported?.founded,
  };
  club.fans = defaultFans(club);
  club.finances = initialFinances(club, country, tier, rng);
  state.clubs[id] = club;
  aiSignSponsors(state, club, rng, tier);

  const manager = generateManager(rng, newId(state, 'm'), country, clubQuality);
  manager.clubId = id;
  state.managers[manager.id] = manager;
  club.managerId = manager.id;

  const squad: Player[] = [];
  for (const ip of o.importedPlayers) squad.push(playerFromImport(state, rng, ip, clubQuality, country, tier));
  const have = new Map<Position, number>();
  for (const p of squad) have.set(p.position, (have.get(p.position) ?? 0) + 1);
  const needed = new Map<Position, number>();
  for (const pos of o.importedPlayers.length ? SQUAD_TEMPLATE : COMPACT_TEMPLATE) needed.set(pos, (needed.get(pos) ?? 0) + 1);
  for (const [pos, n] of needed) {
    const start = have.get(pos) ?? 0;
    // Con plantilla importada completa no se rellena, salvo que falte un portero (siempre debe haber dos).
    if (squad.length >= 22 && o.importedPlayers.length > 0 && !(pos === 'GK' && start < 2)) break;
    for (let depth = start; depth < n; depth++) {
      const quality = clubQuality + (DEPTH_PENALTY[depth] ?? -10) + rng.gauss(0, 2.5);
      const age = depth >= 2 && rng.chance(0.5) ? rng.int(17, 20) : undefined;
      // ~12 % de extranjeros del mismo continente (los clubes con plantilla real ya traen los suyos).
      const origin = rng.chance(0.12) ? neighbourCountry(country, rng) : country;
      squad.push(generatePlayer(rng, { id: newId(state, 'p'), country: origin, position: pos, quality, age, season: state.season }));
    }
  }
  for (const p of squad) {
    p.clubId = id;
    if (!p.contract) {
      p.contract = {
        wage: roundMoney(wageForQuality(overall(p), country.econ, p.reputation, country.quality) * tierWageFactor(tier) * rng.float(0.75, 1.25)),
        signedSeason: state.season - rng.int(0, 3),
        expiresSeason: state.season + rng.int(0, 4),
        releaseClause: country.code === 'ESP' ? roundMoney(Math.max(1e6, overall(p) ** 3 * 120 * rng.float(1, 3))) : null,
        goalBonus: 0,
        cleanSheetBonus: 0,
        signingBonus: 0,
      };
    }
    state.players[p.id] = p;
    club.playerIds.push(p.id);
  }
  assignSquadStatuses(squad);
  aiChooseTactic(state, club.id, rng);
  const style = nearestPreset(club.tactic.tactic.sliders);
  for (const p of squad) p.styleFamiliarity[style] = Math.min(100, (p.styleFamiliarity[style] ?? 40) + 18);
  return club;
}

function playerFromImport(state: GameState, rng: Rng, ip: ImportedPlayer, clubQuality: number, market: CountryDef, tier: number): Player {
  const country = COUNTRY_BY_CODE[ip.nationality] ?? COUNTRY_BY_CODE.ENG;
  const quality = ip.overall ?? clamp(clubQuality + rng.gauss(0, 4), 25, 92);
  const p = generatePlayer(rng, { id: newId(state, 'p'), country, position: ip.position, quality, age: clamp(Math.round(ip.age), 15, 45), season: state.season, potential: ip.potential, source: ip.curated ? 'curated' : 'real' });
  p.firstName = ip.firstName;
  p.lastName = ip.lastName;
  p.photo = ip.photo;
  p.secondaryPositions = ip.secondaryPositions.slice(0, 3);
  if (ip.heightCm) p.heightCm = ip.heightCm;
  if (ip.foot) p.foot = ip.foot;
  if (ip.attrs) for (const k of ATTRIBUTE_KEYS) if (ip.attrs[k] !== undefined) p.attrs[k] = ip.attrs[k] as number;
  if (ip.attrs && ip.position === 'GK') {
    // En la base de datos la "colocación" de los porteros es la de campo (muy baja): usa la de portero.
    p.attrs.positioning = Math.max(p.attrs.positioning, p.attrs.oneOnOnes);
  }
  if (ip.attrs && ip.overall !== undefined) {
    // La media oficial manda: si los atributos importados dan una media distinta, se corrige el desfase
    // en los atributos que pesan en su posición (así un portero de 89 no aparece como un 73).
    const diff = Math.round(ip.overall - overall(p));
    if (Math.abs(diff) >= 2) {
      for (const k of Object.keys(POSITION_WEIGHTS[p.position]) as (keyof typeof p.attrs)[]) p.attrs[k] = clamp(p.attrs[k] + diff, 1, 99);
    }
  }
  if (ip.reputation !== undefined) p.reputation = Math.round(ip.reputation);
  p.potential = Math.max(ip.potential ?? p.potential, overall(p));
  if (ip.wage !== undefined || ip.contractUntil !== undefined) {
    p.contract = {
      wage: roundMoney(ip.wage ?? wageForQuality(overall(p), market.econ, p.reputation, market.quality) * tierWageFactor(tier)),
      signedSeason: state.season - 1,
      expiresSeason: ip.contractUntil ? Math.max(state.season, ip.contractUntil - 1) : state.season + rng.int(0, 3),
      releaseClause: null,
      goalBonus: 0,
      cleanSheetBonus: 0,
      signingBonus: 0,
    };
  }
  return p;
}

/** Asigna el club al usuario: mánager humano, táctica propia, staff y red de ojeadores. */
export function setUserClub(
  state: GameState,
  clubId: Id,
  manager: { firstName: string; lastName: string; nationality: string; style?: TacticalStyle; formation?: Formation; avatar?: number },
): void {
  const club = state.clubs[clubId];
  if (!club) throw new Error('club.missing');
  const rng = new Rng(state.rngState ^ 0x51ed);
  if (club.managerId) {
    const old = state.managers[club.managerId];
    if (old) old.clubId = null;
  }
  const country = COUNTRY_BY_CODE[manager.nationality] ?? COUNTRY_BY_CODE[club.countryCode];
  const m = generateManager(rng, newId(state, 'm'), country, 60);
  m.firstName = manager.firstName;
  m.lastName = manager.lastName;
  m.isHuman = true;
  m.clubId = clubId;
  m.avatar = manager.avatar ?? 0;
  m.reputation = Math.max(20, Math.round(club.reputation * 0.6));
  if (manager.style) m.preferredStyle = manager.style;
  m.preferredFormation = manager.formation ?? PRESETS[m.preferredStyle].formations[0];
  state.managers[m.id] = m;
  club.managerId = m.id;
  club.isUser = true;
  club.boardConfidence = 60;
  state.userClubId = clubId;
  state.userManagerId = m.id;
  const tactic = makeTactic('user-1', m.preferredStyle, m.preferredStyle, m.preferredFormation);
  const players = clubPlayers(state, clubId);
  club.tactic = emptySetup(tactic);
  const { lineup, bench } = pickLineup(players, tactic);
  club.tactic.lineup = lineup;
  club.tactic.bench = bench;
  // Roles iniciales del ayudante (el usuario puede cambiarlos; la IA parte igual).
  const byPid = new Map(players.map((p) => [p.id, p]));
  tactic.roles = suggestRoles(
    tactic,
    lineup.map((id) => byPid.get(id ?? '') ?? null),
  );
  assignTakers(club.tactic, players);
  club.savedTactics = [cloneTactic(tactic)];
  const clubCountry = COUNTRY_BY_CODE[club.countryCode];
  const scoutQuality = clamp(club.reputation - 5, 30, 85);
  const homeScout = generateScout(rng, newId(state, 's'), clubCountry, scoutQuality);
  const sameConfed = COUNTRIES.filter((c) => c.confederation === clubCountry.confederation && c.code !== clubCountry.code);
  const regionalScout = generateScout(rng, newId(state, 's'), sameConfed.length ? rng.pick(sameConfed) : clubCountry, scoutQuality - 5);
  const abroad = COUNTRIES.filter((c) => c.confederation !== clubCountry.confederation && c.quality >= 60);
  const foreignScout = generateScout(rng, newId(state, 's'), rng.pick(abroad), scoutQuality - 5);
  for (const s of [homeScout, regionalScout, foreignScout]) {
    s.clubId = clubId;
    state.scouts[s.id] = s;
    club.scoutIds.push(s.id);
  }
  if (club.staffIds.length === 0) initialStaff(state, rng, club);
  if (state.staffMarket.length === 0) refreshStaffMarket(state, rng);
  state.rngState = rng.state;
}

export function hireAiManager(state: GameState, clubId: Id, rng: Rng): void {
  const club = state.clubs[clubId];
  const country = COUNTRY_BY_CODE[club.countryCode];
  const pool = Object.values(state.managers).filter((m) => !m.clubId && !m.isHuman && Math.abs(m.reputation - club.reputation) < 25);
  const m = pool.length ? rng.pick(pool) : generateManager(rng, newId(state, 'm'), country, clamp(club.reputation * 0.5 + 35, 30, 90));
  state.managers[m.id] = m;
  m.clubId = clubId;
  club.managerId = m.id;
  club.boardConfidence = 65;
  aiChooseTactic(state, clubId, rng);
}

export function resetCup(cup: Cup, clubIdsByReputation: Id[]): void {
  cup.rounds = [];
  cup.aliveClubIds = [...clubIdsByReputation];
  cup.roundDays = cupRoundDays(cupRoundCount(clubIdsByReputation.length));
  cup.winnerId = null;
}

/** Todos los jugadores fichables (clubes, agentes libres y reservas de scouting). */
export function transferPool(state: GameState): Id[] {
  const ids: Id[] = [...state.freeAgentIds];
  for (const rt of Object.values(state.countries)) {
    ids.push(...rt.poolPlayerIds);
    if (!rt.loaded) continue;
    for (const lid of rt.leagueIds) for (const cid of state.leagues[lid].clubIds) ids.push(...state.clubs[cid].playerIds);
  }
  return ids;
}
