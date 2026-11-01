# Contributing

Thanks for helping! This guide gets you productive quickly. Engineering notes in more depth are in
[AGENTS.md](AGENTS.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Setup

```bash
npm install
npm run dev            # http://localhost:5173
npm run typecheck      # strict tsc for core + web — must pass
npm test               # core unit tests
npm run e2e -w @pitchside/web   # Playwright (installs browsers on first run: npx playwright install chromium)
```

## Ground rules

1. **Determinism**: all randomness goes through `Rng`. Never use `Math.random()` in `packages/core`.
2. **Flat state**: keep `GameState` as `Record<Id, T>` collections. New optional data goes in `GameState.meta`
   or an optional field; a real schema change needs a `CURRENT_SAVE_VERSION` bump and a `migrateState` step.
3. **i18n**: never store rendered text. Use `msg('key', params)` in core and `t()` / `tm()` in the UI, and add the
   key to **all four** languages (`en`, `es`, `pt`, `ru`). Run `npx tsx scripts/checkUiKeys.ts` from `packages/core`.
4. **Hidden information**: do not show potential, true value or attributes of players the manager has not
   scouted. Use `potentialView` and `displayValue`.
5. **State changes in the web app** only through the Zustand store (`mutate` / `touch`).
6. **No unused variables**: `noUnusedLocals` / `noUnusedParameters` make `typecheck` fail.
7. **Layout**: new cards and rows need `min-width: 0` and sensible wrapping; the overflow audit
   (`apps/web/e2e/overflow.spec.ts`) will catch text escaping its box.

## Adding things

- **A screen**: create `views/Foo.tsx`, add the `View` id in `store/game.ts`, render it in `App.tsx` and list it
  in `components/shell/sections.ts`. Add `data-tour` attributes if a tutorial step should point at it.
- **An achievement**: add it to `ACHIEVEMENT_REWARDS` (`meta.ts`), the `ach.<id>.t/d` keys, `Career.tsx` and
  `scripts/checkUiKeys.ts`.
- **A system with player-visible money**: use the money param names (`fee`, `amount`, `wage`, `budget`, `value`,
  `cost`) so they are formatted automatically.
- **Tests**: unit tests for engine rules in `packages/core/test`; an E2E test (using the dev-only
  `window.__pitchside` hook in `store/game.ts`) for UI flows.

## Pull requests

- Keep changes focused; describe the *why* and how you verified it.
- Before opening a PR run `npm run typecheck`, `npm test`, `npm run build:public` and the relevant E2E specs.
- Do **not** commit third-party game data (EA SPORTS FC files, photos, crests) or API keys.
