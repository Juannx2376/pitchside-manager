// Descarga equipos y plantillas reales de una liga desde API-Football (api-sports.io) y los guarda
// en data/imports/ en el formato que entiende importApiFootball().
//
// Uso:  set APIFOOTBALL_KEY=tu_clave   (PowerShell: $env:APIFOOTBALL_KEY="tu_clave")
//       npm run fetch:apifootball -- --league 239 --season 2025 --tier 1
// (239 = Liga BetPlay Colombia; consulta los IDs en https://dashboard.api-football.com)
// El plan gratuito permite 100 peticiones/día: 1 para equipos + 1 por plantilla.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const key = process.env.APIFOOTBALL_KEY;
const leagueId = arg('league');
const season = arg('season') ?? String(new Date().getFullYear() - 1);
const tier = Number(arg('tier') ?? '1');

if (!key || !leagueId) {
  console.error('Falta APIFOOTBALL_KEY (variable de entorno) o --league <id>.');
  process.exit(1);
}

async function get(path: string): Promise<unknown> {
  const res = await fetch(`https://v3.football.api-sports.io${path}`, { headers: { 'x-apisports-key': key as string } });
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${path}`);
  const json = (await res.json()) as { errors?: unknown };
  if (json.errors && Object.keys(json.errors as object).length) throw new Error(`API-Football: ${JSON.stringify(json.errors)}`);
  return json;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const leagueInfo = (await get(`/leagues?id=${leagueId}`)) as { response: { league: { id: number; name: string }; country: { name: string } }[] };
const meta = leagueInfo.response[0];
if (!meta) throw new Error(`Liga ${leagueId} no encontrada`);
const teams = (await get(`/teams?league=${leagueId}&season=${season}`)) as { response: { team: { id: number; name: string } }[] };
console.log(`${meta.league.name} (${meta.country.name}): ${teams.response.length} equipos`);
const squads: unknown[] = [];
for (const t of teams.response) {
  // Respeta el límite de 10 peticiones/minuto del plan gratuito.
  await sleep(6500);
  squads.push(await get(`/players/squads?team=${t.team.id}`));
  console.log(`  plantilla de ${t.team.name} descargada`);
}
const out = { league: { id: meta.league.id, name: meta.league.name, country: meta.country.name, tier }, teams, squads };
const dir = join(process.cwd(), '..', '..', 'data', 'imports');
mkdirSync(dir, { recursive: true });
const file = join(dir, `apifootball_${leagueId}_${season}.json`);
writeFileSync(file, JSON.stringify(out));
console.log(`Guardado en ${file}`);
