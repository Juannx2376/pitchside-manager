// Bridge between the core (pure mutable state) and React. Every mutation bumps `version`
// so subscribed components re-render. Text is never stored rendered: views call t()/tm().
import {
  CALENDAR,
  LOCALES,
  advanceDay,
  clubPlayers,
  completeUserMatch,
  createWorld,
  createWorldAsync,
  cumulativeXp,
  deadlineLiveAvailable,
  deserializeGame,
  importCompactDatabase,
  mergeBundles,
  msg,
  playerValue,
  pushReveal,
  resign,
  Rng,
  startEnquiry,
  startNegotiation,
  prepareUserMatch,
  quickSimUserMatch,
  serializeGame,
  setLocale,
  setUserClub,
  startDeadlineLive,
  t,
  type CompactDatabase,
  type FixtureContext,
  type GameState,
  type ImportBundle,
  type Locale,
  type MatchInput,
  type MatchSim,
  type StopReason,
  type StoredMatch,
  type TacticalStyle,
} from '@pitchside/core';
import { create } from 'zustand';
import { usePrefs } from '../lib/prefs';
import { loadText, saveText } from './idb';

export type View =
  | 'hub'
  | 'inbox'
  | 'squad'
  | 'tactics'
  | 'transfers'
  | 'scouting'
  | 'deadline'
  | 'staff'
  | 'finances'
  | 'calendar'
  | 'competition'
  | 'world'
  | 'career'
  | 'settings'
  | 'training'
  | 'objectives'
  | 'gala'
  | 'help'
  | 'unemployed'
  | 'press'
  | 'match'
  | 'data';

/** Tabs shown in the top bar (match/press/data are reached from elsewhere). */
export const NAV: View[] = ['hub', 'inbox', 'squad', 'tactics', 'training', 'objectives', 'transfers', 'scouting', 'staff', 'finances', 'calendar', 'competition', 'world', 'career', 'settings'];

export interface LiveMatch {
  sim: MatchSim;
  ctx: FixtureContext;
  input: MatchInput;
}

export type ManagerInput = { firstName: string; lastName: string; nationality: string; style?: TacticalStyle; avatar?: number };

interface Store {
  game: GameState | null;
  version: number;
  locale: Locale;
  view: View;
  playerId: string | null;
  clubId: string | null;
  /** Country focused in the World view (from search or the map). */
  worldCountry: string | null;
  live: LiveMatch | null;
  /** Last finished user match (shown in the match centre). */
  lastMatch: StoredMatch | null;
  busy: boolean;
  /** Set to true to stop a running multi-day simulation. */
  stopRequested: boolean;
  progress: { label: string; value: number } | null;
  toast: string | null;
  baseDb: ImportBundle | null;
  baseDbStatus: 'idle' | 'loading' | 'ready' | 'missing';
  imports: ImportBundle[];
  setLanguage: (l: Locale) => void;
  setView: (v: View) => void;
  openPlayer: (id: string | null) => void;
  openClub: (id: string | null) => void;
  openCountry: (code: string) => void;
  notify: (msg: string) => void;
  mutate: <T>(fn: (g: GameState) => T) => T;
  touch: () => void;
  loadBaseDb: () => Promise<void>;
  addImport: (b: ImportBundle) => void;
  clearImports: () => void;
  newGame: (seed: number) => Promise<void>;
  pickClub: (clubId: string, manager: ManagerInput) => void;
  continueGame: () => Promise<StopReason>;
  simToDate: (season: number, day: number, stopAtOwnMatch: boolean) => Promise<StopReason>;
  startLiveMatch: () => LiveMatch | null;
  finishLiveMatch: () => void;
  quickSimMatch: () => void;
  save: (slot?: string) => Promise<void>;
  load: (slot?: string) => Promise<boolean>;
  loadFromText: (text: string) => void;
  closeMatch: () => void;
  quit: () => void;
}

const yieldToUi = () => new Promise<void>((r) => setTimeout(r, 0));

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem('pitchside.locale') as Locale | null;
    if (saved && LOCALES.some((l) => l.id === saved)) return saved;
  } catch {
    /* storage unavailable */
  }
  return 'en';
}

const startLocale = initialLocale();
setLocale(startLocale);

/** Absolute day index for comparing (season, day) pairs. */
export const absDay = (season: number, day: number) => season * 400 + day;

export const useGame = create<Store>((set, get) => {
  /** Shared day loop for "Continue" and "Sim to date". */
  async function run(limitDays: number, target: { season: number; day: number } | null, stopAtOwnMatch: boolean): Promise<StopReason> {
    const g = get().game;
    if (!g || get().busy) return 'max_days';
    if (g.pendingFixtureId) {
      set({ view: 'match' });
      return 'live_match';
    }
    set({ busy: true, stopRequested: false });
    const seen = new Set([...Object.values(g.negotiations).filter((n) => n.incoming && n.stage === 'club').map((n) => n.id), ...g.jobOffers.map((o) => o.id)]);
    let stop: StopReason = 'max_days';
    const quick = g.settings.matchMode === 'quick';
    try {
      for (let i = 0; i < limitDays; i++) {
        if (target && absDay(g.season, g.day) >= absDay(target.season, target.day)) {
          stop = 'date_reached';
          break;
        }
        // Último día de la ventana: se juega hora a hora en la pantalla de Deadline Day.
        if (deadlineLiveAvailable(g)) {
          startDeadlineLive(g);
          stop = 'deadline';
          set({ view: 'deadline', version: get().version + 1 });
          break;
        }
        // While jumping to a date without stopping, own matches are simulated instantly.
        const r = advanceDay(g, quick || (!!target && !stopAtOwnMatch));
        if (i % 3 === 0 || r.userMatch || r.pendingUserMatch) {
          set({ version: get().version + 1 });
          await yieldToUi();
        }
        if (g.gameOver) {
          stop = 'game_over';
          break;
        }
        if (r.pendingUserMatch) {
          stop = 'live_match';
          set({ view: 'match', lastMatch: null });
          break;
        }
        if (r.userMatch) {
          stop = 'user_match';
          set({ lastMatch: r.userMatch, view: 'match' });
          if (!target || stopAtOwnMatch) break;
        }
        if (r.seasonEnded) {
          stop = 'season_end';
          get().notify(t('ui.toast.seasonEnd'));
          break;
        }
        if (Object.values(g.negotiations).some((n) => n.incoming && n.stage === 'club' && !seen.has(n.id))) {
          stop = 'incoming_bid';
          get().notify(t('ui.toast.incomingBid'));
          break;
        }
        if (g.jobOffers.some((o) => !seen.has(o.id))) {
          stop = 'job_offer';
          get().notify(t('ui.toast.jobOffer'));
          break;
        }
        if (get().stopRequested) break;
        // Unemployed managers keep simulating until something happens.
        if (!g.userClubId && i > 120) break;
      }
    } finally {
      set({ busy: false, version: get().version + 1 });
    }
    void get().save('autosave');
    return stop;
  }

  return {
    game: null,
    version: 0,
    locale: startLocale,
    view: 'hub',
    playerId: null,
    clubId: null,
    worldCountry: null,
    live: null,
    lastMatch: null,
    busy: false,
    stopRequested: false,
    progress: null,
    toast: null,
    baseDb: null,
    baseDbStatus: 'idle',
    imports: [],
    setLanguage: (l) => {
      setLocale(l);
      try {
        localStorage.setItem('pitchside.locale', l);
      } catch {
        /* ignore */
      }
      document.documentElement.lang = l;
      set({ locale: l, version: get().version + 1 });
    },
    setView: (view) => set({ view }),
    openPlayer: (playerId) => set({ playerId }),
    openClub: (clubId) => set({ clubId }),
    openCountry: (worldCountry) => set({ worldCountry, view: 'world', playerId: null, clubId: null }),
    notify: (toast) => {
      set({ toast });
      setTimeout(() => {
        if (get().toast === toast) set({ toast: null });
      }, 4000);
    },
    mutate: (fn) => {
      const g = get().game;
      if (!g) throw new Error('No game');
      const r = fn(g);
      set({ version: get().version + 1 });
      return r;
    },
    touch: () => set({ version: get().version + 1 }),
    loadBaseDb: async () => {
      if (get().baseDbStatus !== 'idle') return;
      // Public build: no third-party data is shipped; players import their own files.
      if (import.meta.env.VITE_PUBLIC_BUILD === '1') {
        set({ baseDbStatus: 'missing' });
        return;
      }
      set({ baseDbStatus: 'loading' });
      try {
        const res = await fetch('/data/world-db.json');
        if (!res.ok) throw new Error(String(res.status));
        const db = (await res.json()) as CompactDatabase;
        set({ baseDb: importCompactDatabase(db), baseDbStatus: 'ready' });
      } catch {
        set({ baseDbStatus: 'missing' });
      }
    },
    addImport: (b) => set({ imports: [...get().imports, b] }),
    clearImports: () => set({ imports: [] }),
    newGame: async (seed) => {
      const { baseDb, imports } = get();
      const bundles = [...(baseDb ? [baseDb] : []), ...imports];
      const bundle = bundles.length ? mergeBundles(bundles) : null;
      set({ busy: true, progress: { label: t('ui.progress.world'), value: 0 } });
      try {
        const game = await createWorldAsync({ seed, season: 2026, loadedCountries: [], bundle }, (done, total, code) =>
          set({ progress: { label: t('ui.progress.country', { country: code }), value: done / total } }),
        );
        set({ game, version: get().version + 1, view: 'hub', live: null, lastMatch: null });
      } finally {
        set({ busy: false, progress: null });
      }
    },
    pickClub: (clubId, manager) => {
      const g = get().game;
      if (!g) return;
      setUserClub(g, clubId, manager);
      set({ version: get().version + 1, view: 'hub' });
      void get().save('autosave');
    },
    continueGame: () => run(60, null, true),
    simToDate: (season, day, stopAtOwnMatch) => run(400, { season, day }, stopAtOwnMatch),
    startLiveMatch: () => {
      const g = get().game;
      if (!g) return null;
      const existing = get().live;
      if (existing && existing.ctx.fixture.id === g.pendingFixtureId) return existing;
      const live = prepareUserMatch(g);
      set({ live, version: get().version + 1 });
      return live;
    },
    finishLiveMatch: () => {
      const g = get().game;
      const live = get().live;
      if (!g || !live) return;
      const stored = completeUserMatch(g, live);
      set({ live: null, lastMatch: stored, version: get().version + 1 });
      void get().save('autosave');
    },
    quickSimMatch: () => {
      const g = get().game;
      if (!g) return;
      const stored = quickSimUserMatch(g);
      set({ live: null, lastMatch: stored, version: get().version + 1 });
      void get().save('autosave');
    },
    save: async (slot = 'autosave') => {
      const g = get().game;
      if (!g) return;
      try {
        await saveText(slot, serializeGame(g, slot));
      } catch (e) {
        get().notify(t('ui.toast.saveFailed', { error: (e as Error).message }));
      }
    },
    load: async (slot = 'autosave') => {
      set({ busy: true, progress: { label: t('ui.progress.loading'), value: 0.5 } });
      try {
        const text = await loadText(slot);
        if (!text) return false;
        const file = deserializeGame(text);
        set({ game: file.state, version: get().version + 1, view: file.state.pendingFixtureId ? 'match' : 'hub', live: null, lastMatch: null });
        return true;
      } catch (e) {
        console.error('Load failed', e);
        return false;
      } finally {
        set({ busy: false, progress: null });
      }
    },
    loadFromText: (text) => {
      const file = deserializeGame(text);
      set({ game: file.state, version: get().version + 1, view: 'hub', live: null, lastMatch: null });
    },
    closeMatch: () => set({ lastMatch: null, view: get().game?.pendingPress && !get().game?.settings.autoPress ? 'press' : 'hub' }),
    quit: () => set({ game: null, view: 'hub', live: null, lastMatch: null }),
  };
});

/** Subscription that re-renders on every game mutation. */
export function useGameState(): GameState {
  const game = useGame((s) => s.game);
  useGame((s) => s.version);
  if (!game) throw new Error('Game not started');
  return game;
}

/** True between the season's transfer windows. */
export function windowLabel(day: number): string {
  if (day <= CALENDAR.summerWindow[1]) return t('ui.window.summer');
  if (day >= CALENDAR.winterWindow[0] && day <= CALENDAR.winterWindow[1]) return t('ui.window.winter');
  if (day > CALENDAR.seasonEndDay) return t('ui.window.offseason');
  return t('ui.window.closed');
}

// ─── Hook de pruebas E2E (solo `vite dev`) ───────────────────────────────────────────
// Siembra una partida mínima (un solo país, sin la BD de 6 MB) y expone lecturas del
// estado para que Playwright verifique la pizarra. Se elimina en la build de producción.
if (import.meta.env.DEV) {
  const hook = {
    setView: (v: View) => useGame.getState().setView(v),
    setLanguage: (l: Locale) => useGame.getState().setLanguage(l),
    /** Abre la ficha de un jugador propio (`own`) o de otro club (pruebas de desbordes). */
    openPlayer: (own: boolean) => {
      const g = useGame.getState().game;
      if (!g?.userClubId) return;
      const p = Object.values(g.players).find((x) => (own ? x.clubId === g.userClubId : x.clubId && x.clubId !== g.userClubId));
      if (p) useGame.getState().openPlayer(p.id);
    },
    closeModals: () => useGame.setState({ playerId: null, clubId: null }),
    /** Crea una oferta entrante de otro club por un jugador del usuario (pruebas de negociación). */
    incomingOffer: () => {
      const g = useGame.getState().game;
      if (!g?.userClubId) return null;
      const buyer = Object.values(g.clubs).find((c) => !c.isUser && c.countryCode === g.clubs[g.userClubId as string].countryCode);
      const p = clubPlayers(g, g.userClubId).find((x) => !x.academy && x.squadStatus !== 'key');
      if (!buyer || !p) return null;
      buyer.finances.transferBudget = 5e9;
      const n = startNegotiation(g, p.id, buyer.id, true);
      n.bid = { fee: Math.round(playerValue(g, p) * 0.8), sellOnPercent: 0 };
      useGame.getState().touch();
      return n.id;
    },
    /** Salta al último día de la temporada y avanza uno (cosecha de la cantera). */
    newSeason: () => {
      const g = useGame.getState().game;
      if (!g) return;
      g.day = 364;
      advanceDay(g, true);
      useGame.getState().touch();
    },
    /** Fija el presupuesto de fichajes del usuario (pruebas del asistente de dinero). */
    setBudget: (v: number) => {
      const g = useGame.getState().game;
      if (!g?.userClubId) return;
      g.clubs[g.userClubId].finances.transferBudget = v;
      useGame.getState().touch();
    },
    /** Salta al último día de la ventana de verano (pruebas del Deadline Day). */
    toDeadline: () => {
      const g = useGame.getState().game;
      if (!g) return;
      g.day = CALENDAR.summerWindow[1];
      useGame.getState().touch();
    },
    /** Avanza (sin auto-jugar) hasta que haya un partido propio pendiente (pruebas del marcador). */
    toPrematch: () => {
      const g = useGame.getState().game;
      if (!g) return false;
      for (let i = 0; i < 120 && !g.pendingFixtureId; i++) advanceDay(g, false);
      useGame.getState().touch();
      return !!g.pendingFixtureId;
    },
    seed: (seed = 41, code = 'ENG') => {
      const g = createWorld({ seed, season: 2026, loadedCountries: [code] });
      const club = Object.values(g.clubs).find((c) => c.countryCode === code && !c.isUser);
      if (!club) throw new Error(`no-club:${code}`);
      setUserClub(g, club.id, { firstName: 'QA', lastName: 'Bot', nationality: code });
      useGame.setState({ game: g, version: useGame.getState().version + 1, view: 'tactics', live: null, lastMatch: null });
      return club.id;
    },
    /** Da nivel y puntos al mánager (pruebas del camino y los perks). */
    giveLevels: (level: number, points: number) => {
      const g = useGame.getState().game;
      const m = g?.userManagerId ? g.managers[g.userManagerId] : null;
      if (!g || !m) return;
      m.level = level;
      m.xp = cumulativeXp(level);
      m.points = points;
      useGame.getState().touch();
    },
    /** Encola una revelación de fichaje con el primer jugador del club. */
    reveal: () => {
      const g = useGame.getState().game;
      if (!g || !g.userClubId) return;
      const p = g.players[g.clubs[g.userClubId].playerIds[0]];
      pushReveal(g, { kind: 'signing', playerId: p.id, title: msg('ui.reveal.signT', { p: `${p.firstName} ${p.lastName}` }), body: msg('ui.reveal.signFreeB', { fee: 0, ovr: 70 }) });
      useGame.getState().touch();
    },
    /** Abre una consulta de traspaso por un jugador modesto de otro club (pruebas de negociación por fases). */
    enquire: () => {
      const g = useGame.getState().game;
      if (!g || !g.userClubId) return null;
      const club = g.clubs[g.userClubId];
      club.finances.transferBudget = Math.max(club.finances.transferBudget, 200e6);
      club.finances.wageBudget = Math.max(club.finances.wageBudget, 5e9);
      const p = Object.values(g.players).find((x) => x.clubId && x.clubId !== club.id && !x.academy && !x.loan && x.reputation <= 55 && x.contract && x.squadStatus !== 'key');
      if (!p) return null;
      startEnquiry(g, p.id, club.id);
      useGame.getState().touch();
      return p.id;
    },
    /** Dimite del club actual (pruebas de la pantalla de desempleo). */
    resign: () => {
      const g = useGame.getState().game;
      if (!g) return;
      resign(g, new Rng(1));
      useGame.getState().touch();
    },
    /** Avanza N días con el partido propio auto-jugado. */
    advance: (days: number) => {
      const g = useGame.getState().game;
      if (!g) return;
      for (let i = 0; i < days; i++) advanceDay(g, true);
      useGame.getState().touch();
    },
    meta: () => {
      const g = useGame.getState().game;
      const m = g?.userManagerId ? g.managers[g.userManagerId] : null;
      return { reveals: g?.meta?.reveals.length ?? 0, perks: [...(g?.meta?.perks ?? [])], claimed: [...(g?.meta?.passClaimed ?? [])], level: m?.level ?? 0, points: m?.points ?? 0 };
    },
    snapshot: () => {
      const g = useGame.getState().game;
      if (!g || !g.userClubId) return null;
      const club = g.clubs[g.userClubId];
      const tac = club.tactic.tactic;
      return {
        view: useGame.getState().view,
        playerId: useGame.getState().playerId,
        clubId: useGame.getState().clubId,
        theme: usePrefs.getState().theme,
        channels: [...(tac.channels ?? [])],
        passing: [...(tac.passing ?? [])],
        attackSide: tac.attackSide ?? null,
        marking: tac.marking ?? null,
        transition: tac.transition ?? null,
        cornerStyle: tac.cornerStyle ?? null,
        freeKickStyle: tac.freeKickStyle ?? null,
        lineup: [...club.tactic.lineup],
        bench: [...club.tactic.bench],
        slots: tac.slots.map((s) => ({ x: s.x, y: s.y })),
        formation: tac.formation,
        focus: [...(tac.focus ?? [])],
        instructions: (tac.instructions ?? []).map((a) => [...a]),
        roles: [...tac.roles],
        preset: tac.preset,
        sliders: { ...tac.sliders },
        amplitude: tac.amplitude ?? null,
        depth: tac.depth ?? null,
        buildUpStyle: tac.buildUpStyle ?? null,
        defensiveApproach: tac.defensiveApproach ?? null,
        savedCount: club.savedTactics.length,
      };
    },
  };
  (window as unknown as { __pitchside?: typeof hook }).__pitchside = hook;
}
