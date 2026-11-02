# AGENTS.md

Pitchside — a football manager. npm-workspaces monorepo, no backend: pure-TS engines plus a React UI.

## Layout

- `packages/core` — game engines. **No build step**: `package.json` `main` points at `src/index.ts`, and both the web app and scripts import the source directly.
- `apps/web` — React 18 + Vite + Zustand UI, plain CSS (no Tailwind). `apps/web/tsconfig.json` includes `packages/core/src`, so core is typechecked by *both* packages.
- `apps/web/public/data/world-db.json` (~6 MB) — optional real-world database, **git-ignored** (third-party data; see `docs/DATA.md`). Without it the game starts with a generated world.
- `docs/design/TACTICS_MASTER_PLAN.es.md` — design doc (Spanish) for Tactics V2/V3. **V2 and V3 are implemented** (27 positions, 33 roles, attacking channels, templates, team plan); section 5 has the real status and roadmap.

## Commands (from repo root)

- `npm install`
- `npm run dev` — web dev server on :5173
- `npm test` — core Vitest (**only core has unit tests**; 18 files in `packages/core/test`)
- `npm run typecheck` — core then web, both `tsc --noEmit`
- `npm run e2e -w @pitchside/web` — Playwright E2E for the tactics board (starts its own Vite on :5273; uses the dev-only `window.__pitchside` hook)
- `npm run sim -- --seasons 1 --user COL` — headless season simulation
- `npm run build` (web `dist/`) / `npm run build:public` (`dist-public/`)
- Single test: `npm run test -w @pitchside/core -- test/engines.test.ts` (or `npx vitest run <file>` inside `packages/core`)

- `npm run econ -w @pitchside/core -- --seasons 10 --countries ESP,COL,ENG --seed 7 --db no` — headless economy/balance report (`scripts/econSim.ts`). Re-run it after touching `finance.ts: setSeasonBudgets` (constants `BUDGET_REVENUE_CAP`, `BUDGET_FLOOR`, `OWNER_BAILOUT`, `AI_EMBARGO_WAGE_CUT`) or `player.ts: REGEN_POTENTIAL_OFFSET`; `test/economy.test.ts` pins the rules.
- `npx tsx scripts/auditI18n.ts` (cwd `packages/core`) lists es/pt/ru strings identical to English.

There is **no ESLint / Prettier** configured (GitHub Actions runs typecheck, tests, build and e2e). `typecheck` is the only local gate, and it is strict: `noUnusedLocals` / `noUnusedParameters` make unused vars fail — and `npm run build` runs that typecheck first for both packages.

## Core scripts and paths

- `packages/core/scripts/*` assume **cwd = `packages/core`** and resolve repo paths via `process.cwd()/../..`. Run them through workspace scripts (`npm run sim -w @pitchside/core -- ...`) or from that directory — not with bare `tsx` from the repo root.
- Data pipeline (needs network / Kaggle): `buildDatabase.ts` and `fetchPhotos.ts` read `FC26_CSV` (env or CLI arg) or a Kaggle cache path; `fetchApiFootball.ts` needs `APIFOOTBALL_KEY`.
- `npx tsx scripts/checkUiKeys.ts` verifies every `ui.*` key used in the web exists in the English dictionary and exits 1 if not. Dynamic key families must be listed in its `expand` map.

## State, saves, determinism

- `GameState` (`packages/core/src/state.ts`) is **one flat object**: collections are `Record<Id, T>` keyed by id. Keep that shape (no nesting) to keep saves small and avoid cycles.
- Save schema is `CURRENT_SAVE_VERSION = 4` in `save.ts`; `migrateState` upgrades v2/v3 saves idempotently (tactics get V3 defaults via `ensureTacticV3`; v4 adds `trainingEvents`, `objectives` and the extra facilities at level 0). Schema changes ⇒ bump the version and extend the migration.
- Training (`training.ts`): each club has an optional `trainingPlan` (coach + focus per group, intensity). `weeklyTraining` runs from `gameLoop.weeklyUserClub` for the user's club only and is deliberately slow (`WEEKLY_POINTS`). Facility bonuses are centralised in `facilities.ts: facilityEffects`; new facility types live in `clubOps.ts` (`EXTRA_PROJECTS`, `PROJECT_REQUIRES`).
- Transfers: `ClubBid.playersOffered` lets the user include squad players in a deal (`tradeablePlayers`, `playerTradeValue`, max `MAX_PLAYERS_IN_DEAL`); `signing.ts` has the pre-deal `signingVerdict` and post-deal `signingOutcome`. `scripts/playthrough.ts` plays N seasons headlessly to gauge pacing.
- Scouting is never instant: `signingVerdictFromReport` returns `null` without a `ScoutReport` (estimated attrs + `errorMargin`), so the UI must order `startPlayerAnalysis` and wait. User bids/contracts go through `queueBid` / `queueLoanBid` / `queueContract` (reply 1–3 days later via `Negotiation.awaiting`, resolved by `processNegotiations` in `advanceDay`); the old instant `submit*` calls are for AI/tests only.
- Americas divisions: `data/americas.ts` is the registry (official size + real clubs per tier, 2026) and `divisions.ts: reconcileDivisions` (pure, memoized) re-assigns clubs to their tier, merges duplicates, adds synthetic real clubs with generated squads and sets `ImportedLeague.size`; `loadCountry` calls it. Countries absent from the registry are left untouched. Audit with `npx tsx scripts/auditAmericas.ts` (cwd `packages/core`); `test/americas.test.ts` guards it.
- Tactics also carry `leadingPlan` / `trailingPlan` (applied from minute 55 via `planFactor`) and each side has 1 tactical timeout per half (`callTimeout`). `SeasonGala.tsx` shows the end-of-season awards.
- `npx tsx scripts/playthrough.ts [seasons] [country] [seed]` plays a mid-table club with a scripted scout→bid→contract cycle and renewals.
- FC-style hooks live in optional `GameState.meta` (`meta.ts: ensureMeta`, no save-version bump): `reveals` queue (shown by `components/RewardReveal.tsx` — push with `pushReveal`), agent offers, deadline deals, perks, path claims, legends. Achievements go through `unlockAchievement`, which also grants XP/budget (`ACHIEVEMENT_REWARDS`) and queues a reveal; add new ones to that map, `ach.<id>.t/d` keys and `Career.tsx`/`checkUiKeys.ts` lists. Manager XP must go through `addManagerXp` (level → perk points).
- Derived-only modules (nothing stored): `cards.ts` (rarity/faces/traits), `highlights.ts` (highlights, story tags, streaks), `legacy.ts` (legends, records, rivals, `isDerby`). Stored per player: `Player.growthPlan` / `revealed`; `growthPlans.ts` hooks into `weeklyTraining` (pool + small bonus) and `gameLoop.weeklyUserClub`. Perks (`perks.ts: perkEffects`) are read by training, scouting, objectives, match engine (`MatchSide.extraTimeouts`) and `userMatchHooks`.
- Market life (`market.ts`): `processMarketDay` runs daily from `advanceDay` (agent offers, deadline deals in the last 2 window days, wishlist alerts on `state.shortlist`). Never reveal real attributes in the UI for unscouted players (see `components/LiveMarket.tsx: scoutedOvr`).
- Manager XP uses a progressive curve (`meta.ts: cumulativeXp / levelFromXp / xpToNext`); never divide by `XP_PER_POINT` directly. Perks have a 3rd "expert" tier (cost 3).
- Curated rosters: `data/curatedRosters.ts` holds real names/nationality/position/age (Wikipedia squad lists, es/en) for American clubs missing from FC 26; `divisions.ts: applyCuratedRosters` adds them only to registry clubs with < 8 FC players. Ratings are *estimated* at world creation (no `overall` set) and the players get `source: 'curated'` (tag "Estimated"). Regenerate by scraping the lists again; do not hand-edit big blocks.
- `replay.ts: buildReplay` produces deterministic 2D frames for a highlight (`MatchReplay.tsx` plays them). Rumours (`meta.rumours`, `market.ts: processRumours`) have a hidden `reliable` flag per source reliability; the user can guess true/false for XP (`goodNose`). Unemployment: `career.ts: recordStint / applyForJob / processApplications / ensureFallbackOffer` + `gameLoop.advanceUntilOffer`; there is no "game over" on sacking any more.
- Shell/UI ("Pitchside 27"): navigation is 6 sections (`components/shell/sections.ts`: Home, Squad, Transfers, Club, Competitions, Career) shown as an EA-style top horizontal menu (`TopNav`; below 1560 px only the active section shows its label) + a second `.subbar` with pill tabs (`SectionTabs`) and search; `View` ids are unchanged, so `setView('finances')` etc. still work. Styles live in `design.css` (loaded after `theme.css`/`themes.css`; the default theme is `fc`). Home = task bar + hero + 4 action tiles (`views/Hub.tsx`). Add new screens to a section in `sections.ts`.
- Transfers are staged like FC 27: `startEnquiry` → `enquiry` stage (reply in 1–3 days) → `club`/`player` talks **in parallel** (`queueBid` / `queueContract`, `Negotiation.playerAgreed`) → `finalizeDeal` (may reopen once as `renegotiation` for stars, schedule entry for `nextWindow`/`nextSeason` via `entryAbs`, or complete). Bid terms: `instalments`, `bonus`, `entry`; contract terms: `role`, `appearanceBonus`, `autoRaisePct`, `autoCutPct`. Deferred money is stored in `finances.commitments` (`dealTerms.ts`: `scheduleFee`, `payInstalments` at season start, `checkBonusCommitments` monthly, `applyContractClauses` on promotion/relegation). `delegateNegotiation` is the director of football. **Never show a pre-signing "good/bad deal" verdict**: scouting reports are 4-phase info (`AnalysisReport`), and the mood of the signing appears only in the presentation (`signingMood` → `RewardReveal` extra reactions).
- Transfer money: sales return `SALE_REINVEST` (80%) of the fee to `transferBudget` via `finance.ts: creditSale` (transfers, loan fees, buy options, instalments, bonuses); `setSeasonBudgets` adds `SEASON_CARRY` (60%) of the unspent budget and `PRIZE_REINVEST` (25%) of last season's prize, capped at 70% of cash, and `startNewSeason` posts `news.budget.*`. `budgetOutlook.ts` (`transferOutlook`, `suggestSales`, `fundingOptions`) feeds the "Your money" panel and the "you are short" assistant in `Transfers.tsx`; `market.ts: generateOffersForListed` makes AI clubs bid for players the user lists (window only, deterministic).
- Values: `Player.value` starts at 0 and is only refreshed monthly, so `world.ts: ensureValues` fills it at world creation and in `deserializeGame`; the UI must show `playerValue(g, p)` for own players and `lib/value.ts: displayValue` (scout estimate or "?") for others — never raw `p.value`.
- Incoming offers: `transfers.ts: counterIncomingBid` (hidden buyer ceiling, max 3 rounds, sell-on % and buy-back lower it), `addSwapToOffer` (AI adds a player of theirs via `bid.playersOffered`), `ClubBid.buyBack` → `Player.buyBack` → `exerciseBuyBack`. UI: `IncomingRow` / `BuyBacks` in `Transfers.tsx`.
- Training: `TrainingPlan.camp` (pre-season camp, first `CAMP_DAYS`, `startCamp` pays `campCost`), `autoMatchWeek` (`effectiveIntensity` eases off before matches; `weeklyTraining` takes `ctx.nextMatchInDays` from `gameLoop`), academy players now train weekly with the youth group, and `Player.ovrHistory` (monthly, user club) feeds `ovrTrend`, the Progress tab and `Spark`.
- Academy (`youth.ts`): `academyCapacity`, `Club.youthPolicy` (`applyYouthPolicy`/`intakeCount`), the user's yearly intake is **prospects** (`makeIntakeProspects`, `INTAKE_DAYS`) signed with `signProspect`/`signBestProspects`, `sendOnYouthLoan` (`LoanInfo.wasAcademy`, restored in `endLoans`), `readyToPromote`.
- Mobile / APK: `apps/web/src/mobile.css` (loaded last) turns the top menu into a bottom bar at ≤ 760 px, makes modals full-screen and collapses grids; `e2e/overflow.spec.ts` audits 390 px too. The Android wrapper is Capacitor 6 (`apps/web/capacitor.config.ts`, `apps/web/android/`); `npm run apk` runs `scripts/build-apk.ps1` (web build → `cap sync` → Gradle `assembleDebug` → `release/Pitchside-Manager-debug.apk`) using the local toolchain in `.android-tools/` (JDK 17 + Android SDK 34, git-ignored; recreate by downloading Temurin 17 and the Android command-line tools and installing `platforms;android-34`, `build-tools;34.0.0`). Fonts are bundled with `@fontsource`.
- Visual language: flat dark surfaces (solid `--panel`, 1 px borders, 10–12 px radii), one accent from the club colours, no glows/gradients; icons come from `components/shell/Icon.tsx` (add a path there instead of using emoji). Player cards (`FcCard`, CSS in `hooks.css`) are collector cards: material per tier (`bronze/silver/gold/elite/rising`), club two-tone portrait via `--k1/--k2`, side strip with rating/position/flag/crest, name plate.
- Potential visibility (`visibility.ts: potentialView`): own players → exact, players with a scout report → the report's `potentialRange` "x–y", everyone else → hidden. Never read `p.potential` in the UI for non-own players; `cardOf(p, view)` needs the view (no stars / no "rising" tier when hidden).
- Deadline Day live (`deadlineDay.ts`, `views/DeadlineDay.tsx`): the last window day is played hour by hour (`meta.deadlineLive`, hours 0–20 = 04:00–24:00). The store's `run()` stops with `StopReason 'deadline'` and opens the view; replies queued that day carry `AwaitingReply.replyHour` and `processNegotiations(state, liveHour)` resolves them hourly. Named rivals raise the price or snipe the player (`rivalSigns` mimics `aiTransferActivity`), `rushDeal` closes on the spot with a premium, `finishDeadlineLive` publishes the summary and `deadlineSprint`/`deadlineHero` achievements. `e2e/overflow.spec.ts` audits text overflow across views/locales; keep new cards `min-width: 0`.
- Dynamic rating: `profiles.ts: ovrBreakdown / dynamicOvr` (form, morale, readiness — same factors the match engine already uses); growth profiles (`growthProfileOf`, 6 profiles) modulate `developMonthly`; sustained form moves potential slightly.
- Tutorial/help: `lib/tour.ts` (steps, localStorage `pitchside.tour`), `components/Tutorial.tsx` highlights elements by `data-tour="…"`, `views/Help.tsx` (glossary keys `ui.help.g.*`). Add a `data-tour` attribute when a new step needs a target. E2E specs set `pitchside.tour` seen in `boot()`.
- Avatars: `components/PlayerAvatar.tsx` is a deterministic SVG face (hash of `player.id`) used by `Face` when there is no photo (public build too).
- The world map tooltip derives the country from `data-code` on mousemove (never from stale hover state).
- Missions (`objectives.ts`) are derived from `state.userMatches`; interactive live moments (`MatchSim.momentSide` / `pendingMoment` / `resolveMoment`) pause `step()` until the UI decides — `runToEnd` resolves them automatically.
- All randomness goes through `Rng` (mulberry32) seeded from `state.seed` / `state.rngState`. **Never use `Math.random`** — sims must stay reproducible (tests assert it).
- The web mutates state only through the Zustand store (`apps/web/src/store/game.ts`). Use `mutate` / `touch` so the `version` counter bumps and components re-render; direct mutation won't. Per-viewer visual prefs (theme, pitch, density…) live in `lib/prefs.ts` + localStorage, never in the game state.
- Saves live in IndexedDB, gzip-compressed via `CompressionStream` (`store/idb.ts`).
- A user's own match stays pending (`state.pendingFixtureId`) for live play; `advanceDay(state, true)` auto-plays it (headless sims use this). Live flow: `prepareUserMatch` / `completeUserMatch` / `quickSimUserMatch`.

## Tactics engine notes

- Per-slot arrays on `Tactic` (`roles`, `focus`, `instructions`, `channels`, `passing`) are index-aligned with `slots`; `tacticalPositionsOf(slots)` labels positions by row. Always go through `ensureTacticV3` / `cloneTactic` when editing.
- `CHANCE_BASE` / `COUNTER_BASE` in `matchEngine.ts` are calibrated against lane variance. After changing role/zone weights, re-run `engines.test.ts` and `liveTactics.test.ts`.

## i18n

- Never store rendered text. Store `msg('key', params)` (`Msg { k, p }`) and render with `t()` / `tm()`, so switching language also retranslates history.
- Core keys live in `src/i18n/en.ts`; `ui.*` keys live in `en.ui.ts` and `en.v3.ts` (Tactics V3 + Settings), merged via `...enUi, ...enV3` (same for es/pt/ru). Every key must exist in en/es/pt/ru or `i18n.test.ts` fails, and `{placeholder}` params must match English.

## Distribution

- The default DB bundles third-party assets (EA FC 26 attributes, crests, photos). `npm run build:public` sets `VITE_PUBLIC_BUILD=1` and strips `data/` (see `stripThirdPartyData` in `apps/web/vite.config.ts`).
- `packages/core/test/database.test.ts` is `describe.skipIf` when `world-db.json` is absent.
