// Match centre: pre-match, live match (step-by-step engine) and post-match review.
import {
  PASSING_RISKS,
  PLAYER_CHANNELS,
  PLAYER_INSTRUCTIONS,
  cloneTactic,
  ensureTacticV3,
  findFixture,
  formatGameDate,
  laneProfile,
  overallAt,
  positionShort,
  refereeName,
  rolesForPosition,
  shortName,
  t,
  tacticalPositionsOf,
  tm,
  TACTICAL_POSITION_BASE,
  type FreeKickChoice,
  type KeyMoment,
  type MatchEvent,
  type MomentChoice,
  type PassingRisk,
  type PenaltyStyle,
  type PlayerChannel,
  type PlayerFocus,
  type PlayerInstruction,
  type PlayerRole,
  type SideKey,
  type StoredMatch,
  type TeamStats,
  type TeamTalk,
} from '@pitchside/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MatchIntro } from '../components/MatchIntro';
import { MatchSummary } from '../components/MatchSummary';
import { Crest, Face, Panel, ViewHead, rateClass } from '../components/ui';
import { compName, tacticName } from '../lib/labels';
import { useGame, useGameState, type LiveMatch } from '../store/game';
import '../tactics.css';

/** Milliseconds per match minute: ×1 ≈ 2.5 real minutes per game. */
const SPEEDS = [1600, 750, 300, 80];
const KEY_EVENTS = new Set(['goal', 'red', 'second_yellow', 'penalty_awarded', 'penalty_missed', 'injury', 'controversy']);
const MENTALITY = [15, 35, 50, 68, 88];
/** Enfoques individuales para la gestión táctica rápida en directo. */
const FOCUS_KEYS: PlayerFocus[] = ['attack', 'balanced', 'defend'];
const LANE_NAMES = ['left', 'halfLeft', 'center', 'halfRight', 'right'] as const;

export function MatchView() {
  const g = useGameState();
  const live = useGame((s) => s.live);
  const lastMatch = useGame((s) => s.lastMatch);
  const [pickedId, setPickedId] = useState<string | null>(null);

  if (g.pendingFixtureId) {
    if (live && live.ctx.fixture.id === g.pendingFixtureId) return <LiveMatchView live={live} />;
    return <PreMatch />;
  }
  const match: StoredMatch | null = pickedId ? (g.userMatches.find((m) => m.fixtureId === pickedId) ?? null) : (lastMatch ?? g.userMatches[g.userMatches.length - 1] ?? null);
  if (!match) return <Panel title={t('ui.nav.match')}>{t('ui.match.none')}</Panel>;
  return (
    <>
      <ViewHead title={compName(match.competitionName)} meta={formatGameDate(match.season, match.day)} />
      <MatchReview key={match.fixtureId} match={match} justPlayed={!!lastMatch && lastMatch.fixtureId === match.fixtureId} />
      <Panel title={t('ui.match.previous')} style={{ marginTop: 12 }}>
        <div className="chips">
          {[...g.userMatches]
            .reverse()
            .slice(0, 20)
            .map((m) => (
              <button
                key={m.fixtureId}
                className={`chip ${m.fixtureId === match.fixtureId ? 'on' : ''}`}
                onClick={() => {
                  useGame.setState({ lastMatch: null });
                  setPickedId(m.fixtureId);
                }}
              >
                <Crest club={g.clubs[m.homeId]} size={16} />
                {m.result.homeGoals}-{m.result.awayGoals}
                <Crest club={g.clubs[m.awayId]} size={16} />
              </button>
            ))}
        </div>
      </Panel>
    </>
  );
}

function PreMatch() {
  const g = useGameState();
  const { startLiveMatch, quickSimMatch, setView, mutate, notify } = useGame();
  const ctx = findFixture(g, g.pendingFixtureId as string);
  if (!ctx) return null;
  const home = g.clubs[ctx.fixture.homeId];
  const away = g.clubs[ctx.fixture.awayId];
  const userClub = g.clubs[g.userClubId as string];
  const rival = home.id === userClub.id ? away : home;
  const lineupOk = userClub.tactic.lineup.filter(Boolean).length === 11;
  const lanesOf = (club: typeof userClub) => {
    const tc = club.tactic.tactic;
    const labels = tacticalPositionsOf(tc.slots);
    const ovr = labels.map((pos, i) => {
      const p = g.players[club.tactic.lineup[i]];
      return p ? overallAt(p, TACTICAL_POSITION_BASE[pos]) : 0;
    });
    return laneProfile(tc, ovr);
  };
  const mine = lanesOf(userClub);
  const theirs = lanesOf(rival);
  const weakest = (cover: number[]) => cover.indexOf(Math.min(...cover));
  const theirWeak = weakest(theirs.cover);
  const myWeak = weakest(mine.cover);
  const aimAttack = () =>
    mutate(() => {
      const next = ensureTacticV3(cloneTactic(userClub.tactic.tactic));
      next.attackSide = theirWeak <= 1 ? 'left' : theirWeak === 2 ? 'center' : 'right';
      userClub.tactic.tactic = next;
      notify(t('ui.tv3.scoutApplied'));
    });
  return (
    <>
      <ViewHead title={compName(ctx.competitionName)} meta={formatGameDate(g.season, Math.max(0, g.day - 1))} />
      <div className="scoreboard prematch" style={{ ['--home-c' as string]: home.colors[0], ['--away-c' as string]: away.colors[0] }}>
        <div className="team">
          <Crest club={home} size={72} /> {home.name}
        </div>
        <div className="mid">
          <div className="score">{t('ui.match.vs')}</div>
          <div className="clock ellipsis" style={{ maxWidth: 240 }}>{home.stadium.name}</div>
        </div>
        <div className="team away">
          {away.name} <Crest club={away} size={72} />
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <MatchIntro home={home} away={away} />
      </div>
      <div className="grid c3" style={{ marginTop: 12 }}>
        <Panel title={t('ui.match.yourTeam')}>
          <div className="dim">{t('ui.match.tactic', { name: tacticName(userClub.tactic.tactic) })}</div>
          {!lineupOk && <p className="bad">{t('ui.match.incomplete')}</p>}
          <button className="btn" style={{ marginTop: 8 }} onClick={() => setView('tactics')}>
            {t('ui.match.editTactics')}
          </button>
        </Panel>
        <Panel title={t('ui.match.rival')}>
          <div className="row nw">
            <Crest club={rival} size={34} />
            <div>
              <div className="b">{rival.name}</div>
              <div className="faint" style={{ fontSize: 12 }}>
                {t('ui.repN', { n: rival.reputation })} · {tacticName(rival.tactic.tactic)}
              </div>
            </div>
          </div>
        </Panel>
        <Panel title={t('ui.match.kickoff')}>
          <div className="grid">
            <button className="btn-go" onClick={() => startLiveMatch()}>
              {t('ui.match.playLive')}
            </button>
            <button className="btn" onClick={() => quickSimMatch()}>
              {t('ui.match.resultOnly')}
            </button>
          </div>
        </Panel>
      </div>
      <Panel title={t('ui.tv3.scoutTitle')} style={{ marginTop: 12 }}>
        <div className="tv-lanes">
          {LANE_NAMES.map((name, l) => (
            <div key={name} className="tv-lane" title={t(`ui.chan.${name}`)}>
              <div className="bars" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                <div className="bar t" style={{ height: `${Math.max(4, mine.threat[l] * 0.46)}px` }} />
                <div className="bar c" style={{ height: `${Math.max(4, mine.cover[l] * 0.46)}px` }} />
                <div className="bar" style={{ height: `${Math.max(4, theirs.threat[l] * 0.46)}px`, background: 'var(--bad)' }} />
                <div className="bar" style={{ height: `${Math.max(4, theirs.cover[l] * 0.46)}px`, background: 'var(--warn)' }} />
              </div>
              {t(`ui.chan.${name}`)}
            </div>
          ))}
        </div>
        <div className="tv-key" style={{ marginTop: 8 }}>
          <span>
            <i style={{ background: 'var(--accent)' }} />
            {t('ui.match.yourTeam')} · {t('ui.tv3.threat')}
          </span>
          <span>
            <i style={{ background: '#4f8cff' }} />
            {t('ui.match.yourTeam')} · {t('ui.tv3.cover')}
          </span>
          <span>
            <i style={{ background: 'var(--bad)' }} />
            {t('ui.match.rival')} · {t('ui.tv3.threat')}
          </span>
          <span>
            <i style={{ background: 'var(--warn)' }} />
            {t('ui.match.rival')} · {t('ui.tv3.cover')}
          </span>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <span className="good">{t('ui.tv3.scoutHint', { lane: t(`ui.chan.${LANE_NAMES[theirWeak]}`) })}</span>
          <span className="spacer" />
          <button className="btn sm" onClick={aimAttack}>
            {t('ui.tv3.scoutApply')}
          </button>
        </div>
        <div className="warn" style={{ marginTop: 6 }}>
          {t('ui.tv3.scoutWarn', { lane: t(`ui.chan.${LANE_NAMES[myWeak]}`) })}
        </div>
      </Panel>
    </>
  );
}

/** Decisión en directo: quién lanza y cómo (penalti: potencia/colocado/panenka; falta: tirar/centrar). */
function KeyMomentPanel({ moment, onResolve }: { moment: KeyMoment; onResolve: (c: MomentChoice) => void }) {
  const g = useGameState();
  const [taker, setTaker] = useState(moment.defaultTakerId);
  const [style, setStyle] = useState<PenaltyStyle>('placed');
  const [fk, setFk] = useState<FreeKickChoice>('shoot');
  const isPen = moment.kind === 'penalty';
  return (
    <Panel title={isPen ? t('ui.moment.penalty.title', { min: moment.minute }) : t('ui.moment.freeKick.title', { min: moment.minute })}>
      <p className="dim" style={{ marginTop: 0 }}>
        {isPen ? t('ui.moment.penalty.help') : t('ui.moment.freeKick.help')}
      </p>
      <div className="field">
        <label>{t('ui.moment.taker')}</label>
        <div className="tv-seg wrap">
          {moment.candidates.map((c) => {
            const p = g.players[c.playerId];
            return (
              <button key={c.playerId} type="button" data-taker={c.playerId} className={taker === c.playerId ? 'on' : ''} onClick={() => setTaker(c.playerId)}>
                {p ? p.lastName : c.playerId} · {c.score}
              </button>
            );
          })}
        </div>
      </div>
      <div className="field" style={{ marginTop: 10 }}>
        <label>{t('ui.moment.how')}</label>
        <div className="tv-seg wrap">
          {isPen
            ? (['power', 'placed', 'panenka'] as PenaltyStyle[]).map((s) => (
                <button key={s} type="button" data-style={s} className={style === s ? 'on' : ''} title={t(`ui.moment.styleHelp.${s}`)} onClick={() => setStyle(s)}>
                  {t(`ui.moment.style.${s}`)}
                </button>
              ))
            : (['shoot', 'cross'] as FreeKickChoice[]).map((s) => (
                <button key={s} type="button" data-style={s} className={fk === s ? 'on' : ''} onClick={() => setFk(s)}>
                  {t(`ui.moment.fk.${s}`)}
                </button>
              ))}
        </div>
        {isPen && <p className="tv-help">{t(`ui.moment.styleHelp.${style}`)}</p>}
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <span className="spacer" />
        <button className="btn-go" data-take onClick={() => onResolve({ takerId: taker, penalty: style, freeKick: fk })}>
          {t('ui.moment.go')}
        </button>
      </div>
    </Panel>
  );
}

function LiveMatchView({ live }: { live: LiveMatch }) {
  const g = useGameState();
  const { finishLiveMatch, notify } = useGame();
  const { sim, ctx, input } = live;
  const [, setTick] = useState(0);
  const [speed, setSpeed] = useState(Math.min(SPEEDS.length - 1, Math.max(0, g.settings.matchSpeed ?? 1)));
  const [paused, setPaused] = useState(false);
  const [pauseOnKey, setPauseOnKey] = useState(false);
  const [talkResult, setTalkResult] = useState<string | null>(null);
  const [subOut, setSubOut] = useState<string | null>(null);
  const [tacSel, setTacSel] = useState<string | null>(null);
  const [flash, setFlash] = useState<MatchEvent | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const userSide: SideKey = ctx.fixture.homeId === g.userClubId ? 'home' : 'away';
  const home = g.clubs[ctx.fixture.homeId];
  const away = g.clubs[ctx.fixture.awayId];
  const halftime = sim.halftimePending;
  const moment = sim.pendingMoment;
  const running = !paused && !halftime && !sim.finished && !moment;

  // Penaltis y faltas del usuario se deciden en directo (el reloj se detiene).
  useEffect(() => {
    sim.momentSide = userSide;
    return () => {
      sim.momentSide = null;
    };
  }, [sim, userSide]);

  useEffect(() => {
    if (!running) return;
    const id = setTimeout(() => {
      const evs = sim.step();
      const key = evs.find((e) => KEY_EVENTS.has(e.type));
      if (key) {
        setFlash(key);
        if (pauseOnKey) setPaused(true);
      }
      setTick((x) => x + 1);
    }, SPEEDS[speed]);
    return () => clearTimeout(id);
  });
  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' });
  });
  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), 2600);
    return () => clearTimeout(id);
  }, [flash]);

  const score = sim.currentScore;
  const frame = sim.frames[sim.frames.length - 1];
  const ballX = frame?.ballX ?? 50;
  const ballY = frame?.ballY ?? 50;
  const momentum = frame?.momentum ?? 0;
  const statsH = sim.teamStats('home');
  const statsA = sim.teamStats('away');

  const doSub = (inId: string) => {
    if (!subOut) return;
    if (sim.substitute(userSide, subOut, inId)) {
      setSubOut(null);
      setTick((x) => x + 1);
    } else notify(t('ui.match.subFailed'));
  };
  const setMentality = (m: number) => {
    const tc = cloneTactic(input[userSide].tactic);
    tc.sliders = { ...tc.sliders, mentality: m };
    sim.setTactic(userSide, tc);
    input[userSide].tactic = tc;
    setTick((x) => x + 1);
  };
  const loadTactic = (id: string) => {
    const club = g.clubs[g.userClubId as string];
    const st = club.savedTactics.find((x) => x.id === id);
    if (!st) return;
    const tc = cloneTactic(st);
    sim.setTactic(userSide, tc);
    input[userSide].tactic = tc;
    setTick((x) => x + 1);
  };
  const talk = (k: TeamTalk) => {
    setTalkResult(tm(sim.teamTalk(userSide, k)));
  };
  /** Cambio táctico en caliente de un jugador: se aplica ya en el sim y se refleja en la táctica del input. */
  const applyTac = (pid: string, focus: PlayerFocus, instructions: PlayerInstruction[], extra: { role?: PlayerRole; channel?: PlayerChannel; passing?: PassingRisk } = {}) => {
    if (sim.finished || !sim.setPlayerTactics(userSide, pid, focus, instructions, extra)) return;
    const tactic = ensureTacticV3(input[userSide].tactic);
    const slot = input[userSide].players.findIndex((p) => p.id === pid);
    if (slot >= 0) {
      tactic.focus![slot] = focus;
      tactic.instructions![slot] = [...instructions];
      if (extra.role) tactic.roles[slot] = extra.role;
      if (extra.channel) tactic.channels![slot] = extra.channel;
      if (extra.passing) tactic.passing![slot] = extra.passing;
    }
    setTick((x) => x + 1);
  };

  // Players on the 2D pitch: each team keeps its tactic shape and shifts with the ball.
  const shape = (side: SideKey) => {
    const slots = input[side].tactic.slots;
    const shift = (ballX - 50) * 0.28;
    return sim.onPitch(side).map((op, i) => {
      const s = slots[i] ?? { x: 50, y: 50 };
      const depth = 3 + (100 - s.y) * 0.45;
      const x = side === 'home' ? depth + shift : 100 - depth + shift;
      return { id: op.player.id, x: Math.max(2, Math.min(98, x)), y: side === 'home' ? s.x : 100 - s.x, num: i + 1 };
    });
  };
  const savedTactics = g.clubs[g.userClubId as string].savedTactics;
  const mentalityNow = input[userSide].tactic.sliders.mentality;
  const onPitchList = sim.onPitch(userSide);
  const tacPlayer = tacSel ? (onPitchList.find((op) => op.player.id === tacSel) ?? null) : null;

  return (
    <div style={{ ['--home-c' as string]: home.colors[0], ['--away-c' as string]: away.colors[0] }}>
      <div className="scoreboard">
        <div className="team">
          <Crest club={home} size={60} /> {home.name}
        </div>
        <div className="mid">
          <div className="score">
            {score[0]}–{score[1]}
          </div>
          <div className="clock">{sim.finished ? t('ui.match.ft') : halftime ? t('ui.match.ht') : `${sim.displayMinute}'`}</div>
        </div>
        <div className="team away">
          {away.name} <Crest club={away} size={60} />
        </div>
      </div>
      <div className="momentum">
        <div style={{ width: `${50 + momentum / 2}%`, background: home.colors[0] }} />
        <div style={{ flex: 1, background: away.colors[0] }} />
      </div>
      <div className="row" style={{ margin: '10px 0', flexWrap: 'wrap' }}>
        {SPEEDS.map((_, i) => (
          <button key={i} className={`btn sm ${speed === i ? 'on' : ''}`} onClick={() => setSpeed(i)}>
            {t(`ui.match.speed${i + 1}`)}
          </button>
        ))}
        <button className="btn sm" disabled={sim.finished || halftime} onClick={() => setPaused((p) => !p)}>
          {paused ? t('ui.match.resume') : t('ui.match.pause')}
        </button>
        <button
          className="btn sm"
          data-timeout
          disabled={sim.finished || halftime || !!moment || sim.timeoutsLeft(userSide) <= 0}
          onClick={() => {
            if (sim.callTimeout(userSide)) setTick((x) => x + 1);
          }}
        >
          {t('ui.match.timeout', { n: sim.timeoutsLeft(userSide) })}
        </button>
        <label className="toggle" style={{ fontSize: 12 }}>
          <input type="checkbox" checked={pauseOnKey} onChange={(e) => setPauseOnKey(e.target.checked)} />
          <span>{t('ui.match.pauseOnKey')}</span>
        </label>
        <span className="spacer" />
        <span className="faint" style={{ fontSize: 12 }}>
          {t(`weather.${sim.weather}`)} · {t('ui.match.ref', { name: refereeName(input.referee) })}
          {input.attendance ? ` · ${t('ui.match.attendance', { n: input.attendance })}` : ''}
        </span>
        {!sim.finished && (
          <button className="btn sm ghost" onClick={() => finishLiveMatch()}>
            {t('ui.match.skip')}
          </button>
        )}
        {sim.finished && (
          <button className="btn-go" onClick={() => finishLiveMatch()}>
            {t('ui.match.finish')}
          </button>
        )}
      </div>
      {moment && (
        <KeyMomentPanel
          key={`${moment.kind}-${moment.minute}`}
          moment={moment}
          onResolve={(choice) => {
            const evs = sim.resolveMoment(choice);
            const key = evs.find((e) => KEY_EVENTS.has(e.type));
            if (key) setFlash(key);
            setTick((x) => x + 1);
          }}
        />
      )}
      {halftime && (
        <Panel title={t('ui.match.teamTalk')} className="talk-panel">
          <p className="dim" style={{ marginTop: 0 }}>
            {t('ui.match.teamTalkHint')}
          </p>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {(['calm', 'motivate', 'demand', 'praise'] as TeamTalk[]).map((k) => (
              <button key={k} className="btn" disabled={!!talkResult} onClick={() => talk(k)}>
                {t(`ui.talk.${k}`)}
              </button>
            ))}
            <span className="spacer" />
            <button
              className="btn-go"
              onClick={() => {
                sim.halftimePending = false;
                setTalkResult(null);
                setTick((x) => x + 1);
              }}
            >
              {t('ui.match.secondHalf')}
            </button>
          </div>
          {talkResult && <p className="b">{talkResult}</p>}
        </Panel>
      )}
      <div className="grid live-grid">
        <div className="grid" style={{ alignContent: 'start' }}>
          <div className="pitch2d">
            <div className="ln mid" />
            <div className="ln circle" />
            <div className="ln box l" />
            <div className="ln box r" />
            {shape('home').map((p) => (
              <div key={p.id} className="pdot home" style={{ left: `${p.x}%`, top: `${p.y}%` }} />
            ))}
            {shape('away').map((p) => (
              <div key={p.id} className="pdot away" style={{ left: `${p.x}%`, top: `${p.y}%` }} />
            ))}
            <div className="ball" style={{ left: `${ballX}%`, top: `${Math.max(4, Math.min(96, ballY))}%` }} />
            {flash && (
              <div className={`flash ${flash.type}`}>
                <span className="m">{flash.minute}'</span> {tm(flash.msg)}
              </div>
            )}
          </div>
          <Panel title={t('ui.match.commentary')} flush>
            <div className="feed" ref={feedRef} style={{ maxHeight: 260 }}>
              {sim.events.map((e, i) => (
                <div key={i} className={`ev ${e.type} ${e.side ?? ''}`}>
                  <span className="m">{e.minute}'</span>
                  <span className="tx">{tm(e.msg)}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
        <div className="grid" style={{ alignContent: 'start' }}>
          <Panel title={t('ui.match.stats')}>
            <StatLines h={statsH} a={statsA} hc={home.colors[0]} ac={away.colors[0]} />
          </Panel>
          <Panel title={t('ui.match.touchline')}>
            <div className="field">
              <label>{t('ui.slider.mentality')}</label>
              <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                {MENTALITY.map((m, i) => (
                  <button key={m} className={`btn sm ${Math.abs(mentalityNow - m) < 10 ? 'on' : ''}`} disabled={sim.finished} onClick={() => setMentality(m)}>
                    {t(`ui.match.ment${i}`)}
                  </button>
                ))}
              </div>
            </div>
            {savedTactics.length > 0 && (
              <div className="field">
                <label>{t('ui.match.switchTactic')}</label>
                <select value="" disabled={sim.finished} onChange={(e) => loadTactic(e.target.value)}>
                  <option value="">—</option>
                  {savedTactics.map((st) => (
                    <option key={st.id} value={st.id}>
                      {tacticName(st)}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </Panel>
          <Panel title={t('ui.match.quickTac')} flush>
            <div style={{ padding: '4px 8px' }}>
              <p className="dim" style={{ marginTop: 4, fontSize: 12 }}>
                {t('ui.match.quickTacHint')}
              </p>
              {onPitchList.map((op) => (
                <div
                  key={op.player.id}
                  className={`row nw sub-row ${tacSel === op.player.id ? 'picked' : ''}`}
                  onClick={() => !sim.finished && setTacSel(tacSel === op.player.id ? null : op.player.id)}
                >
                  <span className="faint" style={{ width: 26 }}>
                    {positionShort(op.pos)}
                  </span>
                  <span className="ellipsis">{shortName(op.player)}</span>
                  <span className="spacer" />
                  {op.instructions.length > 0 && (
                    <span className="faint" style={{ fontSize: 11 }}>
                      {'+' + op.instructions.length}
                    </span>
                  )}
                  <span className={`tag ${op.focus === 'attack' ? 'good' : op.focus === 'defend' ? 'bad' : ''}`} style={{ fontSize: 11 }}>
                    {t(`ui.v2.focus.${op.focus}`)}
                  </span>
                </div>
              ))}
              {tacPlayer && (
                <div style={{ borderTop: '1px solid var(--line)', margin: '6px -8px 0', padding: '6px 8px 2px', background: 'var(--panel-2)' }}>
                  <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                    {FOCUS_KEYS.map((f) => (
                      <button
                        key={f}
                        className={`btn sm ${tacPlayer.focus === f ? 'on' : ''}`}
                        disabled={sim.finished}
                        onClick={() => applyTac(tacPlayer.player.id, f, tacPlayer.instructions)}
                      >
                        {t(`ui.v2.focus.${f}`)}
                      </button>
                    ))}
                    <span className="spacer" />
                    <span className="faint" style={{ fontSize: 11 }}>
                      {t('ui.match.quickTacLive')}
                    </span>
                  </div>
                  <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                    <select
                      value={tacPlayer.role}
                      disabled={sim.finished}
                      title={t('ui.v2.role')}
                      onChange={(e) => applyTac(tacPlayer.player.id, tacPlayer.focus, tacPlayer.instructions, { role: e.target.value as PlayerRole })}
                    >
                      {rolesForPosition(tacPlayer.tacticalPos).map((r) => (
                        <option key={r} value={r}>
                          {t(`ui.role.${r}`)}
                        </option>
                      ))}
                    </select>
                    <select
                      value={tacPlayer.channel}
                      disabled={sim.finished}
                      title={t('ui.chan.title')}
                      onChange={(e) => applyTac(tacPlayer.player.id, tacPlayer.focus, tacPlayer.instructions, { channel: e.target.value as PlayerChannel })}
                    >
                      {PLAYER_CHANNELS.map((c) => (
                        <option key={c} value={c}>
                          {t(`ui.chan.${c}`)}
                        </option>
                      ))}
                    </select>
                    <select
                      value={tacPlayer.passing}
                      disabled={sim.finished}
                      title={t('ui.pass.title')}
                      onChange={(e) => applyTac(tacPlayer.player.id, tacPlayer.focus, tacPlayer.instructions, { passing: e.target.value as PassingRisk })}
                    >
                      {PASSING_RISKS.map((p) => (
                        <option key={p} value={p}>
                          {t(`ui.pass.${p}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="row" style={{ gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                    {PLAYER_INSTRUCTIONS.map((ins) => {
                      const on = tacPlayer.instructions.includes(ins);
                      return (
                        <button
                          key={ins}
                          className={`btn sm ${on ? 'on' : ''}`}
                          disabled={sim.finished}
                          onClick={() => applyTac(tacPlayer.player.id, tacPlayer.focus, on ? tacPlayer.instructions.filter((x) => x !== ins) : [...tacPlayer.instructions, ins])}
                        >
                          {t(`ui.v2.instr.${ins}`)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </Panel>
          <Panel title={t('ui.match.subs', { n: sim.subsLeft(userSide) })} flush>
            <div style={{ padding: '4px 8px' }}>
              {onPitchList.map((op) => (
                <div
                  key={op.player.id}
                  className={`row nw sub-row ${subOut === op.player.id ? 'picked' : ''}`}
                  onClick={() => !sim.finished && setSubOut(op.player.id === subOut ? null : op.player.id)}
                >
                  <span className="faint" style={{ width: 26 }}>
                    {positionShort(op.pos)}
                  </span>
                  <span className="ellipsis">{shortName(op.player)}</span>
                  {op.yellow && <span className="card y" />}
                  <span className="spacer" />
                  <div className="fatigue" title={t('ui.fitness')}>
                    <div style={{ width: `${op.fatigue}%`, background: op.fatigue < 55 ? 'var(--bad)' : op.fatigue < 70 ? 'var(--warn)' : 'var(--good)' }} />
                  </div>
                  <span className={`v ${rateClass(op.rating * 10)}`}>{op.rating.toFixed(1)}</span>
                </div>
              ))}
              {subOut && (
                <>
                  <div className="gs-h">{t('ui.match.bringOn')}</div>
                  {sim.benchOf(userSide).map((p) => (
                    <div key={p.id} className="row nw sub-row in" onClick={() => doSub(p.id)}>
                      <span className="faint" style={{ width: 26 }}>
                        {positionShort(p.position)}
                      </span>
                      <span className="ellipsis">{shortName(p)}</span>
                      <span className="spacer" />
                      <span className="faint">{Math.round(p.fitness)}%</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function StatLines({ h, a, hc, ac }: { h: TeamStats; a: TeamStats; hc: string; ac: string }) {
  const rows: [keyof TeamStats, (v: number) => string][] = [
    ['possession', (v) => `${v}%`],
    ['shots', String],
    ['onTarget', String],
    ['xg', (v) => v.toFixed(2)],
    ['passes', String],
    ['corners', String],
    ['fouls', String],
    ['yellows', String],
    ['reds', String],
    ['offsides', String],
  ];
  return (
    <>
      {rows.map(([k, fmt]) => {
        const total = h[k] + a[k] || 1;
        return (
          <div className="statline" key={k}>
            <span className="b">{fmt(h[k])}</span>
            <span className="lbl">{t(`ui.stat.${k}`)}</span>
            <span className="b" style={{ textAlign: 'right' }}>
              {fmt(a[k])}
            </span>
            <div className="bar">
              <div style={{ width: `${(h[k] / total) * 100}%`, background: hc }} />
              <div style={{ width: `${(a[k] / total) * 100}%`, background: ac }} />
            </div>
          </div>
        );
      })}
    </>
  );
}

function MatchReview({ match, justPlayed }: { match: StoredMatch; justPlayed: boolean }) {
  const g = useGameState();
  const { closeMatch } = useGame();
  const { result } = match;
  const home = g.clubs[match.homeId];
  const away = g.clubs[match.awayId];
  const players = useMemo(() => Object.values(result.players), [result]);
  const motm = result.motmId ? g.players[result.motmId] : null;

  const lineup = (side: 'home' | 'away') =>
    players
      .filter((p) => p.side === side)
      .sort((a, b) => Number(b.started) - Number(a.started))
      .map((st) => {
        const p = g.players[st.playerId];
        return (
          <div key={st.playerId} className="row nw link" style={{ fontSize: 13, padding: '3px 0', opacity: st.started ? 1 : 0.7 }} onClick={() => useGame.getState().openPlayer(st.playerId)}>
            {p && <Face player={p} size={22} club={side === 'home' ? home : away} />}
            <span className="faint" style={{ width: 26 }}>
              {positionShort(st.position)}
            </span>
            <span className="ellipsis">{p ? shortName(p) : '?'}</span>
            {st.goals > 0 && <span>{'⚽'.repeat(st.goals)}</span>}
            {st.yellow > 0 && <span className="card y" />}
            {st.red && <span className="card r" />}
            {st.injured && <span className="bad">✚</span>}
            <span className="spacer" />
            <span className={`v ${rateClass(st.rating * 10)}`}>{st.rating.toFixed(1)}</span>
          </div>
        );
      });

  return (
    <div style={{ ['--home-c' as string]: home.colors[0], ['--away-c' as string]: away.colors[0] }}>
      <div className="scoreboard">
        <div className="team">
          <Crest club={home} size={60} /> {home.name}
        </div>
        <div className="mid">
          <div className="score">
            {result.homeGoals}–{result.awayGoals}
          </div>
          <div className="clock">{t('ui.match.ft')}</div>
        </div>
        <div className="team away">
          {away.name} <Crest club={away} size={60} />
        </div>
      </div>
      <div className="row" style={{ margin: '10px 0' }}>
        {result.shootout && <span className="tag warn">{t('ui.match.shootout', { h: result.shootout.home, a: result.shootout.away })}</span>}
        {motm && <span className="tag acc">{t('ui.match.motm', { name: shortName(motm) })}</span>}
        <span className="faint" style={{ fontSize: 12 }}>
          {t(`weather.${result.weather}`)} · {t('ui.match.attendance', { n: result.attendance })}
        </span>
        <span className="spacer" />
        {justPlayed && (
          <button className="btn-go" onClick={closeMatch}>
            {g.pendingPress && !g.settings.autoPress ? t('ui.match.toPress') : t('ui.back')}
          </button>
        )}
      </div>
      <MatchSummary match={match} home={home} away={away} />
      <div className="grid c3">
        <Panel title={home.name}>{lineup('home')}</Panel>
        <Panel title={t('ui.match.commentary')} flush>
          <div className="feed">
            {result.events.map((e, i) => (
              <div key={i} className={`ev ${e.type} ${e.side ?? ''}`}>
                <span className="m">{e.minute}'</span>
                <span className="tx">{tm(e.msg)}</span>
              </div>
            ))}
          </div>
        </Panel>
        <div className="grid" style={{ alignContent: 'start' }}>
          <Panel title={t('ui.match.stats')}>
            <StatLines h={result.stats.home} a={result.stats.away} hc={home.colors[0]} ac={away.colors[0]} />
          </Panel>
          <Panel title={away.name}>{lineup('away')}</Panel>
          {result.controversies.length > 0 && (
            <Panel title={t('ui.match.controversies')}>
              {result.controversies.map((c, i) => (
                <div key={i} style={{ fontSize: 13, marginBottom: 4 }}>
                  <span className="b">{c.minute}'</span> {tm(c.msg)}
                </div>
              ))}
              <div className="faint" style={{ fontSize: 12 }}>
                {t('ui.match.ref', { name: g.referees[result.refereeId] ? refereeName(g.referees[result.refereeId]) : '–' })}
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
