// Crear tu propio club (Soccer Manager): ocupa la plaza del club más débil de la liga elegida
// (normalmente la última división), con nombre, colores, escudo, estadio y una plantilla modesta.
import { assignSquadStatuses, type Club } from './club';
import type { CrestDesign } from './clubOps';
import { COUNTRY_BY_CODE } from './data/countries';
import { setSeasonBudgets } from './finance';
import { generatePlayer, roundMoney, tierWageFactor, wageForQuality, overall } from './player';
import type { Rng } from './rng';
import { clubPlayers, newId, type GameState } from './state';
import { clamp, type Id, type Position } from './types';
import { squadStrength } from './club';
import { releasePlayer } from './transfers';

export interface CustomClubOptions {
  leagueId: Id;
  name: string;
  shortName: string;
  city: string;
  colors: [string, string];
  crest: CrestDesign;
  stadiumName: string;
  /** 1 = equipo débil, 2 = medio, 3 = candidato (ajusta plantilla y presupuesto). */
  ambition: 1 | 2 | 3;
}

const SQUAD: Position[] = ['GK', 'GK', 'RB', 'RB', 'CB', 'CB', 'CB', 'CB', 'LB', 'LB', 'DM', 'DM', 'CM', 'CM', 'CM', 'AM', 'AM', 'RW', 'RW', 'LW', 'LW', 'ST', 'ST', 'ST'];

/** Devuelve el id del club creado (reutiliza la plaza, así el calendario sigue siendo válido). */
export function createCustomClub(state: GameState, rng: Rng, o: CustomClubOptions): Id {
  const league = state.leagues[o.leagueId];
  const clubs = league.clubIds.map((id) => state.clubs[id]).filter((c) => !c.isUser);
  const weakest = clubs.sort((a, b) => squadStrength(clubPlayers(state, a.id)) - squadStrength(clubPlayers(state, b.id)))[0];
  if (!weakest) throw new Error('customClub.noSlot');
  const levels = clubs.map((c) => squadStrength(clubPlayers(state, c.id))).sort((a, b) => a - b);
  const target = levels[Math.round((levels.length - 1) * [0.1, 0.45, 0.8][o.ambition - 1])] ?? 55;
  const country = COUNTRY_BY_CODE[league.countryCode];

  for (const p of clubPlayers(state, weakest.id)) releasePlayer(state, weakest.id, p.id, false);
  const club: Club = weakest;
  club.name = o.name.trim();
  club.shortName = o.shortName.trim().toUpperCase().slice(0, 4);
  club.city = o.city.trim() || club.city;
  club.colors = o.colors;
  club.colorsKnown = true;
  club.crest = o.crest;
  club.logo = undefined;
  club.source = 'custom';
  club.founded = state.season;
  club.stadium = { name: o.stadiumName.trim() || `${club.city} Stadium`, capacity: Math.round(clamp(club.stadium.capacity * [0.6, 0.9, 1.1][o.ambition - 1], 2000, 90000)), condition: 85 };
  club.reputation = Math.round(clamp(league.reputation - 18 + o.ambition * 8, 5, 90));
  club.fanBase = Math.round(club.stadium.capacity * 0.9);
  club.fans = { satisfaction: 75, members: Math.round(club.stadium.capacity * 0.5) };
  club.chemistry = 60;
  club.leakPressure = 0;
  club.sponsors = [];

  for (let i = 0; i < SQUAD.length; i++) {
    const pos = SQUAD[i];
    const depth = SQUAD.slice(0, i).filter((x) => x === pos).length;
    const quality = target + (depth === 0 ? 2 : -3) + rng.gauss(0, 3);
    const p = generatePlayer(rng, { id: newId(state, 'p'), country, position: pos, quality, season: state.season, age: depth > 1 ? rng.int(17, 21) : undefined });
    p.clubId = club.id;
    p.contract = {
      // Same division wage scale as every other club in that league.
      wage: roundMoney(wageForQuality(overall(p), country.econ, p.reputation, country.quality) * tierWageFactor(league.tier) * 0.85),
      signedSeason: state.season,
      expiresSeason: state.season + rng.int(1, 3),
      releaseClause: null,
      goalBonus: 0,
      cleanSheetBonus: 0,
      signingBonus: 0,
    };
    state.players[p.id] = p;
    club.playerIds.push(p.id);
  }
  assignSquadStatuses(clubPlayers(state, club.id));
  club.finances.balance = roundMoney(club.finances.balance * [0.5, 1, 1.6][o.ambition - 1] + 200_000 * country.econ);
  setSeasonBudgets(club, clubPlayers(state, club.id), league.tier, league.clubIds.length - 1);
  // A newly founded club always starts with some money to build the squad.
  club.finances.transferBudget = Math.max(club.finances.transferBudget, roundMoney(club.finances.balance * 0.35));
  return club.id;
}
