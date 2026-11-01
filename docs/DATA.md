# Data

## What is (and is not) in this repository

| Included | Excluded (git-ignored) |
| --- | --- |
| All game code, tests and docs | `apps/web/public/data/world-db.json` — the real-world database |
| `sample-data/sample_players.csv` — a tiny **synthetic** CSV used by the importer test | `data/` — raw inputs (Wikidata dumps, logo/photo maps, CSVs) |
| Procedural name pools and country definitions (`packages/core/src/data`) | `data/raw/`, `data/imports/*.json` |
| Curated roster lists for some American clubs (`data/curatedRosters.ts`, from public squad lists) | Any EA SPORTS FC attribute, photo or crest file |

The default database used by the author bundles third-party material (EA SPORTS FC attributes, club crests and
player photos). It is **not redistributed here**. Anyone can build their own copy for personal use.

## Running without the database

If `/data/world-db.json` is missing (or you build with `npm run build:public`), the game starts with a
**fully generated world** and lets you import your own bundle from the main menu. Tests that require the
database are skipped automatically.

## Building your own database

The pipeline lives in `packages/core/scripts` and **assumes the current directory is `packages/core`**
(run it through the workspace scripts or `cd` there first).

1. `fetchWikidata.ts` — leagues, clubs, stadiums and countries from Wikidata → `data/wikidata/`.
2. `fetchClubMeta.ts`, `fetchLogos.ts`, `fetchPhotos.ts` — optional metadata, logo and photo maps.
3. `buildDatabase.ts` — merges your player CSV (set `FC26_CSV` or pass it as an argument) with the Wikidata
   files into `apps/web/public/data/world-db.json`.
4. `inspectCsv.ts` — checks the columns of a CSV; `auditAmericas.ts` checks the Americas league registry.

`fetchApiFootball.ts` needs an `APIFOOTBALL_KEY` environment variable. **Never commit keys** — `.env` files are
git-ignored.

## CSV import format

The importer accepts the column layout shown in `sample-data/sample_players.csv`
(`short_name`, `player_positions`, `overall`, `potential`, `value_eur`, `club_name`, the individual attribute
columns, …). Imported players keep their data; anything missing is generated.

## Rating of curated clubs

For American clubs absent from the main database, `divisions.ts: applyCuratedRosters` adds real names, positions
and ages from `curatedRosters.ts`. Their ratings are **estimated** at world creation and the players are tagged
*Estimated* in the UI. Regenerate those lists by scraping again; do not hand-edit large blocks.
