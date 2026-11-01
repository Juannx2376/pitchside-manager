# Architecture

Pitchside is an npm-workspaces monorepo with **no backend**.

```text
packages/core   pure TypeScript engines — no build step, `main` points at src/index.ts
apps/web        React 18 + Vite + Zustand UI, plain CSS; imports core source directly
```

`apps/web/tsconfig.json` includes `packages/core/src`, so **core is type-checked twice** (by both packages).
`npm run typecheck` is the only quality gate (strict, `noUnusedLocals` / `noUnusedParameters`); there is no
ESLint, Prettier or runtime dependency on a server.

## Core engines (`packages/core/src`)

| Area | Modules |
| --- | --- |
| World & state | `world.ts` (world creation, `loadCountry`, `ensureValues`), `state.ts` (`GameState`), `divisions.ts` + `data/americas.ts` (official league tiers), `importer.ts` (compact DB / CSV import), `save.ts` |
| Calendar & loop | `gameLoop.ts` (`advanceDay`, weekly/monthly steps, season rollover), `competition.ts`, `continental.ts`, `international.ts` |
| Match | `matchEngine.ts` (live `MatchSim`, quick sim, moments), `tactics.ts`, `replay.ts`, `highlights.ts`, `referee.ts` |
| Players | `player.ts`, `attributes.ts`, `profiles.ts` (dynamic rating, growth profiles), `cards.ts`, `visibility.ts` (potential rules), `growthPlans.ts` |
| Transfers | `transfers.ts` (staged negotiations), `dealTerms.ts` (instalments/bonuses), `signing.ts`, `scouting.ts`, `market.ts` (agents, rumours, listed-player offers), `deadlineDay.ts`, `budgetOutlook.ts` |
| Club | `club.ts`, `clubOps.ts` (facilities/sponsors), `finance.ts`, `facilities.ts`, `staff.ts`, `customClub.ts` |
| Development | `training.ts`, `youth.ts` |
| Career & meta | `career.ts`, `objectives.ts`, `perks.ts`, `meta.ts` (XP, reveals, achievements), `legacy.ts`, `awards.ts`, `press.ts`, `social.ts` |
| Infrastructure | `rng.ts` (seeded Mulberry32), `types.ts`, `i18n/` |

## State model

`GameState` is **one flat object**: collections are `Record<Id, T>` keyed by id (players, clubs, leagues,
negotiations, …). Do not nest entities — it keeps saves small and avoids cycles. Optional, lazily created
data lives in `GameState.meta` (`ensureMeta`) so it needs no save-version bump.

Saves are JSON, gzip-compressed with `CompressionStream` and stored in IndexedDB (`apps/web/src/store/idb.ts`).
`CURRENT_SAVE_VERSION` is in `save.ts`; any schema change requires a version bump plus a `migrateState` step.

## Determinism

All randomness goes through `Rng` (Mulberry32) seeded from `state.seed` / `state.rngState`.
**Never use `Math.random()` in core** — tests assert reproducibility, and headless simulations
(`npm run sim`) rely on it. Derived data (card rarity, highlights, legends, …) is recomputed, not stored.

## Information hiding

The UI must never reveal information the manager would not know:

- **Potential**: `visibility.ts: potentialView` → exact for own players, an `x–y` range after a scout report,
  hidden otherwise.
- **Value / attributes** of unscouted players: `apps/web/src/lib/value.ts: displayValue`, scouted views of attributes.
- **No pre-signing verdicts**: the quality of a signing is only shown at the presentation.

## Internationalisation

Text is **never stored rendered**. Core stores `msg('key', params)` (`{ k, p }`) and the UI renders it with
`t()` / `tm()`, so changing language retranslates history. Dictionaries live in `packages/core/src/i18n`
(`en`, `es`, `pt`, `ru`, split into `*.ui.ts`, `*.v3.ts` … `*.v8.ts`). Every key must exist in all four
languages and `{placeholder}` params must match English (`i18n.test.ts`). Money params (`fee`, `amount`,
`wage`, `budget`, `value`, `cost`, …) are auto-formatted. `scripts/checkUiKeys.ts` verifies that every `ui.*`
key used in the web exists; dynamic key families must be listed in its `expand` map.

## Web app (`apps/web/src`)

- `store/game.ts` — the Zustand store and the **only** place that mutates game state. Use `mutate` / `touch`
  so the `version` counter bumps and components re-render. In dev it exposes `window.__pitchside` for E2E tests.
- `App.tsx` + `components/shell/` — top navigation (`TopNav`), sub-menu pills (`SectionTabs`), section map
  (`sections.ts`). Add a screen by adding a `View` id and listing it in `sections.ts`.
- `views/` — one file per screen (Hub, Squad, Tactics, Transfers, Training, Finances, Deadline Day, …).
- `components/` — shared widgets (`FcCard`, `RewardReveal`, `MatchReplay`, `Pitch`, …).
- Styles: `theme.css` / `themes.css` (base and alternative themes), `design.css` (default flat dark shell),
  `hooks.css` (cards, reveals, deadline day), `tactics.css`, `mobile.css` (small screens).
  Per-viewer visual preferences live in `lib/prefs.ts` + localStorage, never in game state.

## Testing

- **Unit** (`packages/core/test`, Vitest): engines, transfers, finance, tactics, i18n, saves, determinism.
  `database.test.ts` and `americas.test.ts` use the optional world database and are skipped when it is absent.
- **E2E** (`apps/web/e2e`, Playwright): tactics board, gameplay hooks, staged transfers, Deadline Day, plus an
  **overflow audit** that visits every screen at several widths/locales and fails if text escapes its box.

## Conventions worth knowing

- `CHANCE_BASE` / `COUNTER_BASE` in `matchEngine.ts` are calibrated; re-run `engines.test.ts` and
  `liveTactics.test.ts` after changing role/zone weights.
- Per-slot arrays on `Tactic` are index-aligned with `slots`; go through `ensureTacticV3` / `cloneTactic`.
- Scouting is never instant and user negotiations go through `queueBid` / `queueContract` (replies in 1–3 days);
  the instant `submit*` functions exist for the AI and tests only.
