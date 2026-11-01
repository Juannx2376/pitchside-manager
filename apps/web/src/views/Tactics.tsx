// Táctica V3 — pizarra vertical al estilo Soccer Manager / EA FC.
//   · Los once se dibujan en sus coordenadas reales (x, y): nada se solapa ni se «encaja» en una rejilla.
//   · Dos modos de arrastre: intercambiar jugadores o mover libremente las posiciones del campo.
//   · Por jugador: rol (con encaje 0-100), carril de ataque, enfoque, riesgo de pase e instrucciones.
//   · Por equipo: salida, bloque, lado de ataque, marcaje, transición, córners, faltas y lanzadores.
//   · Plantillas de un clic, tácticas guardadas y un informe de amenaza/cobertura por carril.
// Todo el texto sale de los diccionarios i18n; el estado sólo guarda ids y claves.
import {
  ATTACK_SIDES,
  CORNER_STYLES,
  FORMATION_LIST,
  FREEKICK_STYLES,
  LEADING_PLANS,
  MARKING_STYLES,
  TRAILING_PLANS,
  PASSING_RISKS,
  PLAYER_INSTRUCTIONS,
  PRESETS,
  TACTICAL_POSITION_BASE,
  TACTICAL_STYLES,
  TACTIC_TEMPLATES,
  TRANSITION_STYLES,
  ZONE_LANES,
  applyTemplate,
  assignTakers,
  cloneTactic,
  describeFormation,
  ensureTacticV3,
  firstTeam,
  formationSlots,
  isAvailable,
  laneProfile,
  nearestPreset,
  overallAt,
  pickLineup,
  roleFit,
  rolesForPosition,
  suggestRoles,
  t,
  tacticMods,
  tacticalPositionsOf,
  teamStyleCohesion,
  replaceUnavailable,
  unavailableInLineup,
  type AttackSide,
  type BuildUpStyle,
  type CornerStyle,
  type DefensiveApproach,
  type Formation,
  type FreeKickStyle,
  type LeadingPlan,
  type TrailingPlan,
  type MarkingStyle,
  type PassingRisk,
  type Player,
  type PlayerChannel,
  type PlayerFocus,
  type PlayerInstruction,
  type PlayerRole,
  type Tactic,
  type TacticalStyle,
  type TacticTemplate,
  type TransitionStyle,
} from '@pitchside/core';
import { useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { TacticDiagram } from '../components/TacticDiagram';
import { Face, Meter, OvrChip, Panel, PosBadge, RATE_COLOR, SubTabs, ViewHead, rateClass } from '../components/ui';
import { Pitch } from '../components/Pitch';
import { pct, tacticName } from '../lib/labels';
import { usePrefs } from '../lib/prefs';
import { useGame, useGameState } from '../store/game';
import '../tactics.css';

type Tab = 'board' | 'team' | 'setpieces' | 'templates' | 'saved';
type Mode = 'players' | 'positions';

const BUILDUPS: BuildUpStyle[] = ['balanced', 'short_pass', 'long_ball', 'counter'];
const APPROACHES: DefensiveApproach[] = ['low_block', 'balanced', 'high_block', 'aggressive_press'];
const FOCUSES: PlayerFocus[] = ['attack', 'balanced', 'defend'];
const LEGACY_SLIDERS = ['mentality', 'tempo', 'width', 'pressing', 'defensiveLine', 'directness', 'tackling'] as const;
const LEGACY_TOGGLES = ['offsideTrap', 'counterAttack', 'timeWasting'] as const;
const LANE_SYMBOL = ['◀◀', '◀', '●', '▶', '▶▶'];
const LANE_CHANNEL: Exclude<PlayerChannel, 'auto'>[] = ['left', 'halfLeft', 'center', 'halfRight', 'right'];
const BENCH_SIZE = 9;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Etiqueta cualitativa del encaje de un jugador en un rol. */
function fitKey(fit: number): 'great' | 'good' | 'ok' | 'poor' {
  if (fit >= 76) return 'great';
  if (fit >= 66) return 'good';
  if (fit >= 56) return 'ok';
  return 'poor';
}

/** Color de la línea: portero, defensa, medio, ataque (modo «discos»). */
function groupColor(base: string): string {
  if (base === 'GK') return '#e69a12';
  if (['CB', 'LB', 'RB'].includes(base)) return '#2563eb';
  if (['DM', 'CM', 'AM'].includes(base)) return '#16a34a';
  return '#dc2626';
}

/** Quita roles que dejaron de tener sentido tras mover una posición o cambiar de formación. */
function sanitize(tc: Tactic): Tactic {
  ensureTacticV3(tc);
  const labels = tacticalPositionsOf(tc.slots);
  labels.forEach((pos, i) => {
    if (!rolesForPosition(pos).includes(tc.roles[i])) tc.roles[i] = 'default';
  });
  tc.formation = describeFormation(tc.slots);
  return tc;
}

export function Tactics() {
  const g = useGameState();
  const { mutate, openPlayer, notify } = useGame();
  const prefs = usePrefs();
  const club = g.clubs[g.userClubId as string];
  const manager = g.managers[club.managerId as string];
  const players = firstTeam(g, club.id);
  const setup = club.tactic;
  const tactic = setup.tactic;

  const [tab, setTab] = useState<Tab>('board');
  const [mode, setMode] = useState<Mode>('players');
  const [sel, setSel] = useState<number | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [benchHot, setBenchHot] = useState(false);
  const [saveName, setSaveName] = useState('');
  const pitchRef = useRef<HTMLDivElement>(null);

  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const labels = tacticalPositionsOf(tactic.slots);
  const lineup = Array.from({ length: tactic.slots.length }, (_, i) => setup.lineup[i] ?? '');
  const starters = lineup.map((id) => byId.get(id)).filter((p): p is Player => !!p);
  const preset = nearestPreset(tactic.sliders);
  const cohesion = teamStyleCohesion(starters, preset);
  const mods = tacticMods(tactic);
  const reserves = players.filter((p) => !lineup.includes(p.id) && !setup.bench.includes(p.id)).sort((a, b) => overallAt(b, b.position) - overallAt(a, a.position));
  const bench = setup.bench.map((id) => byId.get(id)).filter((p): p is Player => !!p);
  const selPlayer = sel !== null ? byId.get(lineup[sel]) ?? null : null;

  const lanes = useMemo(() => {
    const ovr = lineup.map((id, i) => {
      const p = byId.get(id);
      return p ? overallAt(p, TACTICAL_POSITION_BASE[labels[i]]) : 0;
    });
    return laneProfile(tactic, ovr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tactic, lineup.join('|'), byId]);

  // ─── Cambios sobre la táctica (siempre sobre una copia para que React lo vea) ───
  const edit = (fn: (tc: Tactic) => void) =>
    mutate(() => {
      const next = ensureTacticV3(cloneTactic(club.tactic.tactic));
      fn(next);
      club.tactic.tactic = next;
    });
  const setRole = (i: number, r: PlayerRole) => edit((tc) => (tc.roles[i] = r));
  const setChannel = (i: number, c: PlayerChannel) => edit((tc) => (tc.channels![i] = c));
  const setFocus = (i: number, f: PlayerFocus) => edit((tc) => (tc.focus![i] = f));
  const setPassing = (i: number, p: PassingRisk) => edit((tc) => (tc.passing![i] = p));
  const toggleInstruction = (i: number, ins: PlayerInstruction) =>
    edit((tc) => {
      const cur = tc.instructions![i];
      tc.instructions![i] = cur.includes(ins) ? cur.filter((x) => x !== ins) : [...cur, ins];
    });
  /** Cambia el dibujo y vuelve a elegir once y roles para él (si no, hay jugadores fuera de sitio). */
  const setFormation = (f: Formation) => {
    mutate(() => {
      const next = ensureTacticV3(cloneTactic(club.tactic.tactic));
      next.formation = f;
      next.slots = formationSlots(f);
      const n = next.slots.length;
      next.channels = new Array<PlayerChannel>(n).fill('auto');
      next.passing = new Array<PassingRisk>(n).fill('mixed');
      next.focus = new Array<PlayerFocus>(n).fill('balanced');
      next.instructions = Array.from({ length: n }, (): PlayerInstruction[] => []);
      const auto = pickLineup(players, next);
      club.tactic.lineup = auto.lineup;
      club.tactic.bench = auto.bench;
      next.roles = suggestRoles(
        next,
        auto.lineup.map((id) => byId.get(id)),
      );
      club.tactic.tactic = next;
      refreshTakers();
    });
    setSel(null);
    notify(t('ui.tv4.formationRepicked'));
  };
  const badSlots = unavailableInLineup(setup, players);
  const fixLineup = () =>
    mutate(() => {
      const n = replaceUnavailable(club.tactic, club.tactic.tactic, players);
      notify(t('ui.tv4.replaced', { n }));
    });
  const setPreset = (s: TacticalStyle) => edit((tc) => ((tc.preset = s), (tc.sliders = { ...PRESETS[s].sliders }), (tc.amplitude = PRESETS[s].sliders.width)));
  const autoRoles = () => {
    edit((tc) => {
      tc.roles = suggestRoles(tc, lineup.map((id) => byId.get(id)));
    });
    notify(t('ui.tv3.autoRolesDone'));
  };
  const clearRoles = () => edit((tc) => (tc.roles = new Array<PlayerRole>(tc.slots.length).fill('default')));

  const refreshTakers = () => assignTakers(club.tactic, players);
  const autoPick = () =>
    mutate(() => {
      const auto = pickLineup(players, club.tactic.tactic);
      club.tactic.lineup = auto.lineup;
      club.tactic.bench = auto.bench;
      club.tactic.captainId = null;
      club.tactic.penaltyTakerId = null;
      club.tactic.freeKickTakerId = null;
      club.tactic.cornerTakerId = null;
      refreshTakers();
    });

  /** Coloca a un jugador en un hueco: intercambia si ya estaba en el once, o entra desde banquillo/reservas. */
  const putPlayer = (pid: string, slot: number) => {
    setPicked(null);
    mutate(() => {
      const lu = [...lineup];
      const bn = [...setup.bench];
      const prev = lu[slot];
      if (prev === pid) return;
      const fromSlot = lu.indexOf(pid);
      const fromBench = bn.indexOf(pid);
      lu[slot] = pid;
      if (fromSlot >= 0) lu[fromSlot] = prev;
      else if (fromBench >= 0) {
        if (prev) bn[fromBench] = prev;
        else bn.splice(fromBench, 1);
      }
      club.tactic.lineup = lu;
      club.tactic.bench = bn.filter((x) => !lu.includes(x));
      refreshTakers();
    });
  };
  const sendOut = (pid: string) =>
    mutate(() => {
      const lu = [...lineup];
      const from = lu.indexOf(pid);
      if (from < 0) return;
      if (setup.bench.length >= BENCH_SIZE) {
        notify(t('ui.tac.benchFull', { n: BENCH_SIZE }));
        return;
      }
      lu[from] = '';
      club.tactic.lineup = lu;
      club.tactic.bench = [...setup.bench, pid];
      refreshTakers();
    });
  const moveSlot = (i: number, clientX: number, clientY: number) => {
    const r = pitchRef.current?.getBoundingClientRect();
    if (!r || i === 0) return;
    const x = Math.round(clamp(((clientX - r.left) / r.width) * 100, 6, 94));
    const y = Math.round(clamp(((clientY - r.top) / r.height) * 100, 8, 84));
    edit((tc) => {
      tc.slots[i] = { x, y };
      sanitize(tc);
    });
  };

  // ─── Arrastrar y soltar ───
  const dragStart = (payload: string) => (e: DragEvent) => {
    e.dataTransfer.setData('text/plain', payload);
    e.dataTransfer.effectAllowed = 'move';
  };
  const dropOnChip = (e: DragEvent, slot: number) => {
    const data = e.dataTransfer.getData('text/plain');
    setOver(null);
    if (!data || data.startsWith('slot:')) return; // el movimiento libre lo resuelve el campo
    e.preventDefault();
    e.stopPropagation();
    putPlayer(data, slot);
  };
  const dropOnPitch = (e: DragEvent) => {
    e.preventDefault();
    const data = e.dataTransfer.getData('text/plain');
    if (mode === 'positions' && data.startsWith('slot:')) moveSlot(Number(data.slice(5)), e.clientX, e.clientY);
  };
  const dropOnBench = (e: DragEvent) => {
    e.preventDefault();
    setBenchHot(false);
    const data = e.dataTransfer.getData('text/plain');
    if (data.startsWith('slot:')) {
      const pid = lineup[Number(data.slice(5))];
      if (pid) sendOut(pid);
    } else if (lineup.includes(data)) sendOut(data);
  };

  const onChipClick = (i: number) => {
    if (picked) putPlayer(picked, i);
    setSel(i);
    // En pantallas estrechas el panel cae debajo del campo: se lleva a la vista.
    if (window.innerWidth < 1280) setTimeout(() => document.getElementById('tv-editor')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
  };

  // ─── Marcador de jugador en el campo ───
  const chip = (i: number) => {
    const slot = tactic.slots[i];
    const pid = lineup[i];
    const p = byId.get(pid);
    const pos = labels[i];
    const base = TACTICAL_POSITION_BASE[pos];
    const style = { left: `${slot.x}%`, top: `${slot.y}%` };
    const commonDrop = {
      onDragOver: (e: DragEvent) => {
        e.preventDefault();
        if (mode === 'players') setOver(i);
      },
      onDragLeave: () => setOver((o) => (o === i ? null : o)),
      onDrop: (e: DragEvent) => dropOnChip(e, i),
    };
    if (!p) {
      return (
        <button key={i} type="button" data-slot={i} className={`tv-chip ${sel === i ? 'sel' : ''} ${over === i ? 'over' : ''}`} style={style} onClick={(e) => (e.stopPropagation(), onChipClick(i))} {...commonDrop}>
          <span className="tv-empty">+</span>
        </button>
      );
    }
    const ovr = Math.round(overallAt(p, base));
    const role = tactic.roles[i] ?? 'default';
    const fit = role === 'default' ? 0 : roleFit(p, role);
    const fitColor = role === 'default' ? undefined : RATE_COLOR[rateClass(fit)];
    const out = !isAvailable(p);
    return (
      <button
        key={i}
        type="button"
        data-slot={i}
        data-pid={p.id}
        draggable={mode === 'players' || i > 0}
        onDragStart={dragStart(mode === 'positions' ? `slot:${i}` : p.id)}
        onClick={(e) => (e.stopPropagation(), onChipClick(i))}
        onDoubleClick={(e) => (e.stopPropagation(), openPlayer(p.id))}
        className={`tv-chip ${sel === i ? 'sel' : ''} ${over === i ? 'over' : ''} ${out ? 'dim' : ''}`}
        style={style}
        title={`${p.firstName} ${p.lastName} · ${pos} · ${ovr}`}
        {...commonDrop}
      >
        {prefs.chips === 'card' ? (
          <span className="tv-card">
            <span className="ovr">{ovr}</span>
            <span style={{ display: 'block' }}>
              <Face player={p} club={club} size={26} />
            </span>
            <span className="nm">{p.lastName}</span>
            <span className="pp">{pos}</span>
            {fitColor && <span className="tv-fit" style={{ ['--fit' as string]: fitColor }} />}
          </span>
        ) : (
          <>
            <span className="tv-disc" style={{ ['--g' as string]: groupColor(base) }}>
              <b>{pos.slice(0, 3)}</b>
              <i>{ovr}</i>
            </span>
            <span className="tv-discname">{p.lastName}</span>
          </>
        )}
        {role !== 'default' && <span className="tv-badge role">{t(`ui.roleShort.${role}`)}</span>}
        {setup.captainId === p.id && <span className="tv-badge cap">{t('ui.tv3.captainShort')}</span>}
        {(p.injury || p.suspendedMatches > 0) && <span className="tv-badge bad">!</span>}
      </button>
    );
  };

  // ─── Fila de lista (banquillo / reservas) ───
  const listRow = (p: Player, where: 'bench' | 'reserve') => (
    <div
      key={p.id}
      data-pid={p.id}
      data-where={where}
      draggable
      onDragStart={dragStart(p.id)}
      onClick={() => setPicked(picked === p.id ? null : p.id)}
      onDoubleClick={() => openPlayer(p.id)}
      className={`tv-row ${picked === p.id ? 'picked' : ''} ${!isAvailable(p) ? 'unavail' : ''}`}
    >
      <Face player={p} club={club} size={26} />
      <PosBadge pos={p.position} />
      <span className="nm ellipsis">{p.lastName}</span>
      {p.injury && <span className="tag bad">{t('ui.injuredShort')}</span>}
      {p.suspendedMatches > 0 && <span className="tag bad">{t('ui.suspendedShort')}</span>}
      <span className="faint">{Math.round(p.fitness)}%</span>
      <OvrChip v={overallAt(p, p.position)} />
    </div>
  );

  const seg = <T extends string>(items: readonly T[], value: T, onPick: (v: T) => void, label: (v: T) => string, wrap = false) => (
    <div className={`tv-seg ${wrap ? 'wrap' : ''}`}>
      {items.map((v) => (
        <button key={v} type="button" className={value === v ? 'on' : ''} onClick={() => onPick(v)}>
          {label(v)}
        </button>
      ))}
    </div>
  );

  // ─── Panel del jugador seleccionado ───
  const editor = () => {
    if (sel === null || !selPlayer) {
      return (
        <Panel title={t('ui.tv3.selectTitle')}>
          <p className="tv-help" style={{ marginBottom: 10 }}>
            {t('ui.tv3.selectHelp')}
          </p>
          <div className="row" style={{ fontSize: 12 }}>
            <span className="dim">{t('ui.tac.cohesion')}</span>
            <span className="spacer" />
            <span className={`b ${cohesion < 0.85 ? 'bad' : ''}`}>{pct(cohesion)}</span>
          </div>
          <Meter value={((cohesion - 0.6) / 0.5) * 100} color={cohesion < 0.85 ? 'var(--bad)' : undefined} />
          {cohesion < 0.85 && <p className="bad" style={{ fontSize: 12, marginBottom: 0 }}>{t('ui.tac.lowCohesion')}</p>}
          <div className="tv-sec">
            <h5>{t('ui.tv3.profile')}</h5>
            <div className="tv-effects">
              {(
                [
                  ['possession', mods.possession],
                  ['chances', mods.chanceRate],
                  ['quality', mods.chanceQuality],
                  ['counter', mods.counterThreat],
                  ['defence', mods.defensiveSolidity],
                  ['fatigue', mods.fatigue],
                  ['fouls', mods.foulRate],
                ] as [string, number][]
              ).map(([k, v]) => (
                <div key={k}>
                  <span>{t(`ui.tac.eff.${k}`)}</span>
                  <b>{v.toFixed(2)}</b>
                </div>
              ))}
            </div>
          </div>
          <div className="tv-sec">
            <h5>{t('ui.v2.formations')}</h5>
            <div className="tv-seg wrap">
              {FORMATION_LIST.map((f) => (
                <button key={f} type="button" className={tactic.formation === f ? 'on' : ''} onClick={() => setFormation(f)}>
                  {f}
                </button>
              ))}
            </div>
          </div>
        </Panel>
      );
    }
    const pos = labels[sel];
    const base = TACTICAL_POSITION_BASE[pos];
    const role = tactic.roles[sel] ?? 'default';
    const fit = role === 'default' ? null : roleFit(selPlayer, role);
    const channel = tactic.channels?.[sel] ?? 'auto';
    const focus = tactic.focus?.[sel] ?? 'balanced';
    const passing = tactic.passing?.[sel] ?? 'mixed';
    const instr = tactic.instructions?.[sel] ?? [];
    return (
      <Panel
        title={t('ui.v2.panel.title')}
        actions={
          <button className="btn sm ghost" onClick={() => setSel(null)} aria-label="close">
            ✕
          </button>
        }
      >
        <div className="tv-who">
          <Face player={selPlayer} club={club} size={46} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="nm ellipsis">{selPlayer.lastName}</div>
            <div className="row nw" style={{ gap: 6 }}>
              <PosBadge pos={selPlayer.position} />
              <span className="tag acc">{pos}</span>
              {setup.captainId === selPlayer.id && <span className="tag">C</span>}
            </div>
          </div>
          <OvrChip v={overallAt(selPlayer, base)} />
        </div>

        <div className="tv-sec">
          <h5>{t('ui.v2.role')}</h5>
          <div className="tv-roles">
            {rolesForPosition(pos).map((r) => {
              const f = r === 'default' ? null : roleFit(selPlayer, r);
              return (
                <button key={r} type="button" data-role={r} className={`tv-role ${role === r ? 'on' : ''}`} title={t(`ui.roleHelp.${r}`)} onClick={() => setRole(sel, r)}>
                  <span className="ellipsis">{t(`ui.role.${r}`)}</span>
                  {f !== null && (
                    <span className="f" style={{ color: RATE_COLOR[rateClass(f)] }}>
                      {f}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="tv-roledesc">
            {t(`ui.roleHelp.${role}`)}
            {fit !== null && (
              <>
                {' '}
                <b style={{ color: RATE_COLOR[rateClass(fit)] }}>
                  {t('ui.tv3.fit')}: {t(`ui.tv3.fit.${fitKey(fit)}`)} ({fit})
                </b>
              </>
            )}
          </p>
        </div>

        <div className="tv-sec">
          <h5>{t('ui.chan.title')}</h5>
          <div className="tv-chan">
            <button type="button" className={channel === 'auto' ? 'on' : ''} onClick={() => setChannel(sel, 'auto')}>
              {t('ui.chan.auto')}
            </button>
            {LANE_CHANNEL.map((c, k) => (
              <button key={c} type="button" data-channel={c} className={channel === c ? 'on' : ''} title={t(`ui.chan.${c}`)} onClick={() => setChannel(sel, c)}>
                {LANE_SYMBOL[k]}
              </button>
            ))}
          </div>
          <p className="tv-help" style={{ marginTop: 4 }}>
            {channel === 'auto' ? t('ui.chan.help') : t(`ui.chan.${channel}`)}
          </p>
        </div>

        <div className="tv-sec">
          <h5>{t('ui.v2.focusLabel')}</h5>
          {seg(FOCUSES, focus, (f) => setFocus(sel, f), (f) => t(`ui.v2.focus.${f}`))}
        </div>

        <div className="tv-sec">
          <h5>{t('ui.pass.title')}</h5>
          {seg(PASSING_RISKS, passing, (p) => setPassing(sel, p), (p) => t(`ui.pass.${p}`))}
        </div>

        <div className="tv-sec">
          <h5>{t('ui.v2.instructions')}</h5>
          <div className="tv-seg wrap">
            {PLAYER_INSTRUCTIONS.map((ins) => (
              <button key={ins} type="button" data-instr={ins} className={instr.includes(ins) ? 'on' : ''} onClick={() => toggleInstruction(sel, ins)}>
                {t(`ui.v2.instr.${ins}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn sm" onClick={() => openPlayer(selPlayer.id)}>
            {t('ui.viewProfile')}
          </button>
          <button
            className="btn sm danger"
            onClick={() => {
              sendOut(selPlayer.id);
              setSel(null);
            }}
          >
            {t('ui.v2.toBench')}
          </button>
        </div>
      </Panel>
    );
  };

  const teamTab = () => (
    <div className="grid c2">
      <div className="grid" style={{ alignContent: 'start' }}>
        <Panel title={t('ui.v2.teamTitle')}>
          <div className="tv-sec" style={{ marginTop: 0 }}>
            <h5>{t('ui.v2.buildUpStyle')}</h5>
            {seg(BUILDUPS, tactic.buildUpStyle ?? 'balanced', (v) => edit((tc) => (tc.buildUpStyle = v)), (v) => t(`ui.v2.buildup.${v}`))}
          </div>
          <div className="tv-sec">
            <h5>{t('ui.v2.defensiveApproach')}</h5>
            {seg(APPROACHES, tactic.defensiveApproach ?? 'balanced', (v) => edit((tc) => (tc.defensiveApproach = v)), (v) => t(`ui.v2.approach.${v}`))}
          </div>
          <div className="tv-sec">
            <h5>{t('ui.tv3.attackSide')}</h5>
            {seg<AttackSide>(ATTACK_SIDES, tactic.attackSide ?? 'balanced', (v) => edit((tc) => (tc.attackSide = v)), (v) => t(`ui.side.${v}`))}
            <p className="tv-help">{t('ui.tv3.attackSideHint')}</p>
          </div>
          <div className="tv-sec">
            <h5>{t('ui.tv3.marking')}</h5>
            {seg<MarkingStyle>(MARKING_STYLES, tactic.marking ?? 'zonal', (v) => edit((tc) => (tc.marking = v)), (v) => t(`ui.mark.${v}`))}
            <p className="tv-help">{t('ui.tv3.markingHint')}</p>
          </div>
          <div className="tv-sec">
            <h5>{t('ui.tv3.transition')}</h5>
            {seg<TransitionStyle>(TRANSITION_STYLES, tactic.transition ?? 'balanced', (v) => edit((tc) => (tc.transition = v)), (v) => t(`ui.trans.${v}`))}
            <p className="tv-help">{t('ui.tv3.transitionHint')}</p>
          </div>
          <div className="tv-sec">
            <h5>{t('ui.plan.leading')}</h5>
            {seg<LeadingPlan>(LEADING_PLANS, tactic.leadingPlan ?? 'normal', (v) => edit((tc) => (tc.leadingPlan = v)), (v) => t(`ui.plan.lead.${v}`))}
          </div>
          <div className="tv-sec">
            <h5>{t('ui.plan.trailing')}</h5>
            {seg<TrailingPlan>(TRAILING_PLANS, tactic.trailingPlan ?? 'normal', (v) => edit((tc) => (tc.trailingPlan = v)), (v) => t(`ui.plan.trail.${v}`))}
            <p className="tv-help">{t('ui.plan.hint')}</p>
          </div>
          <div className="tv-sec">
            <div className="row">
              <h5 style={{ margin: 0 }}>{t('ui.v2.amplitude')}</h5>
              <span className="spacer" />
              <b>{tactic.amplitude ?? 50}</b>
            </div>
            <input type="range" min={1} max={100} value={tactic.amplitude ?? 50} onChange={(e) => edit((tc) => (tc.amplitude = Number(e.target.value)))} />
          </div>
          <div className="tv-sec">
            <div className="row">
              <h5 style={{ margin: 0 }}>{t('ui.v2.depth')}</h5>
              <span className="spacer" />
              <b>{tactic.depth ?? 50}</b>
            </div>
            <input type="range" min={1} max={100} value={tactic.depth ?? 50} onChange={(e) => edit((tc) => (tc.depth = Number(e.target.value)))} />
          </div>
        </Panel>
      </div>
      <div className="grid" style={{ alignContent: 'start' }}>
        <Panel title={t('ui.tac.tab.instructions')}>
          {LEGACY_SLIDERS.map((k) => (
            <div key={k} className="slider-row">
              <div className="row">
                <span>{t(`ui.slider.${k}`)}</span>
                <span className="spacer" />
                <b>{tactic.sliders[k]}</b>
              </div>
              <input type="range" min={0} max={100} value={tactic.sliders[k]} onChange={(e) => edit((tc) => (tc.sliders[k] = Number(e.target.value)))} />
              <div className="row faint" style={{ fontSize: 11, justifyContent: 'space-between' }}>
                <span>{t(`ui.slider.${k}.lo`)}</span>
                <span>{t(`ui.slider.${k}.hi`)}</span>
              </div>
            </div>
          ))}
          <div className="row">
            {LEGACY_TOGGLES.map((k) => (
              <label key={k} className="toggle" title={t(`ui.toggle.${k}.hint`)}>
                <input type="checkbox" checked={tactic.sliders[k]} onChange={(e) => edit((tc) => (tc.sliders[k] = e.target.checked))} />
                <span>{t(`ui.toggle.${k}`)}</span>
              </label>
            ))}
          </div>
          <p className="faint" style={{ fontSize: 12 }}>
            {t('ui.tac.closestPreset', { style: t(`ui.style.${preset}`) })}
          </p>
        </Panel>
      </div>
    </div>
  );

  const takerSelect = (label: string, key: 'captainId' | 'penaltyTakerId' | 'freeKickTakerId' | 'cornerTakerId') => (
    <label className="field" key={key}>
      <label>{label}</label>
      <select
        value={setup[key] ?? ''}
        onChange={(e) =>
          mutate(() => {
            club.tactic[key] = e.target.value || null;
            refreshTakers();
          })
        }
      >
        <option value="">{t('ui.tv3.takerAuto')}</option>
        {players.map((p) => (
          <option key={p.id} value={p.id}>
            {p.lastName} · {Math.round(overallAt(p, p.position))}
          </option>
        ))}
      </select>
    </label>
  );

  const setPiecesTab = () => (
    <div className="grid c2">
      <Panel title={t('ui.tv3.tab.setpieces')}>
        <div className="tv-sec" style={{ marginTop: 0 }}>
          <h5>{t('ui.tv3.corners')}</h5>
          {seg<CornerStyle>(CORNER_STYLES, tactic.cornerStyle ?? 'mixed', (v) => edit((tc) => (tc.cornerStyle = v)), (v) => t(`ui.corner.${v}`))}
        </div>
        <div className="tv-sec">
          <h5>{t('ui.tv3.freeKicks')}</h5>
          {seg<FreeKickStyle>(FREEKICK_STYLES, tactic.freeKickStyle ?? 'mixed', (v) => edit((tc) => (tc.freeKickStyle = v)), (v) => t(`ui.fk.${v}`))}
        </div>
      </Panel>
      <Panel title={t('ui.tv3.takers')}>
        <p className="tv-help" style={{ marginBottom: 10 }}>
          {t('ui.tv3.takersHelp')}
        </p>
        <div className="grid c2">
          {takerSelect(t('ui.tac.captainId'), 'captainId')}
          {takerSelect(t('ui.tac.penaltyTakerId'), 'penaltyTakerId')}
          {takerSelect(t('ui.tac.freeKickTakerId'), 'freeKickTakerId')}
          {takerSelect(t('ui.tac.cornerTakerId'), 'cornerTakerId')}
        </div>
      </Panel>
    </div>
  );

  const applyTpl = (tpl: TacticTemplate) =>
    mutate(() => {
      const next = applyTemplate(club.tactic.tactic, tpl);
      sanitize(next);
      club.tactic.tactic = next;
      const auto = pickLineup(players, next);
      club.tactic.lineup = auto.lineup;
      club.tactic.bench = auto.bench;
      refreshTakers();
      notify(t('ui.tv3.templateApplied', { name: t(`ui.tpl.${tpl.id}`) }));
      setSel(null);
      setTab('board');
    });

  const templatesTab = () => (
    <>
      <p className="tv-help" style={{ marginBottom: 10 }}>
        {t('ui.tv3.templatesHelp')}
      </p>
      <div className="tv-tpls">
        {TACTIC_TEMPLATES.map((tpl) => {
          const slots = formationSlots(tpl.formation);
          const pos = tacticalPositionsOf(slots);
          const roles = pos.map((p) => tpl.roles[p]).filter((r): r is PlayerRole => !!r && r !== 'default');
          return (
            <div key={tpl.id} className="tv-tpl" data-template={tpl.id}>
              <div className="row nw">
                <h4>{t(`ui.tpl.${tpl.id}`)}</h4>
                <span className="spacer" />
                <span className="tag acc">{tpl.formation}</span>
              </div>
              <div className="tv-mini">
                {slots.map((s, i) => (
                  <i key={i} style={{ left: `${s.x}%`, top: `${s.y * 0.96}%` }} />
                ))}
              </div>
              <p>{t(`ui.tplDesc.${tpl.id}`)}</p>
              <div className="chips">
                {[...new Set(roles)].slice(0, 5).map((r) => (
                  <span key={r} className="tag">
                    {t(`ui.role.${r}`)}
                  </span>
                ))}
              </div>
              <div className="row">
                <span className="faint" style={{ fontSize: 12 }}>
                  {t(`ui.style.${tpl.preset}`)}
                </span>
                <span className="spacer" />
                <button className="btn sm primary" onClick={() => applyTpl(tpl)}>
                  {t('ui.tv3.applyTemplate')}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );

  const saveCurrent = () =>
    mutate(() => {
      const name = saveName.trim() || `${t('ui.tac.myTactic')} ${club.savedTactics.length + 1}`;
      const existing = club.savedTactics.findIndex((x) => x.name === name);
      const copy = cloneTactic(tactic, `user-${g.nextId++}`, name);
      if (existing >= 0) club.savedTactics[existing] = copy;
      else if (club.savedTactics.length >= 5) {
        notify(t('ui.tac.savedFull'));
        return;
      } else club.savedTactics.push(copy);
      club.tactic.tactic = cloneTactic(copy);
      setSaveName('');
    });

  const savedTab = () => (
    <Panel title={t('ui.tac.tab.saved', { n: club.savedTactics.length })}>
      <div className="row" style={{ marginBottom: 8 }}>
        <input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder={t('ui.tac.saveName')} maxLength={24} style={{ flex: 1 }} />
        <button className="btn primary" onClick={saveCurrent}>
          {t('ui.tac.save')}
        </button>
      </div>
      {club.savedTactics.map((st) => (
        <div key={st.id} className="row nw" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
          <span className="b ellipsis">{tacticName(st)}</span>
          <span className="tag">{describeFormation(st.slots)}</span>
          <span className="spacer" />
          <button className="btn sm" onClick={() => mutate(() => (club.tactic.tactic = ensureTacticV3(cloneTactic(st))))}>
            {t('ui.tac.load')}
          </button>
          <button className="btn sm ghost" onClick={() => mutate(() => (club.savedTactics = club.savedTactics.filter((x) => x.id !== st.id)))}>
            ✕
          </button>
        </div>
      ))}
      <p className="faint" style={{ fontSize: 12 }}>
        {t('ui.tac.savedHelp')}
      </p>
    </Panel>
  );

  /** Controles a la izquierda y, a su lado, el modelo de la cancha que refleja cada cambio. */
  const withDiagram = (controls: ReactNode, mode: 'team' | 'setpieces') => (
    <div className="td-split">
      <div style={{ minWidth: 0 }}>{controls}</div>
      <div className="td-sticky">
        <Panel title={t('ui.tv3.diagram')}>
          <TacticDiagram tactic={tactic} mode={mode} />
        </Panel>
      </div>
    </div>
  );

  const customFormation = !FORMATION_LIST.includes(tactic.formation as Formation);

  return (
    <>
      <ViewHead
        title={t('ui.tac.title')}
        meta={t('ui.tac.meta', { style: t(`ui.style.${manager.preferredStyle}`), formation: describeFormation(tactic.slots) })}
        tools={
          <>
            <select value={customFormation ? '' : tactic.formation} onChange={(e) => setFormation(e.target.value as Formation)}>
              {customFormation && <option value="">{t('ui.tac.custom', { f: describeFormation(tactic.slots) })}</option>}
              {FORMATION_LIST.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <button className="btn" onClick={autoPick}>
              {t('ui.tac.auto')}
            </button>
            <button className="btn" onClick={autoRoles}>
              {t('ui.tv3.autoRoles')}
            </button>
          </>
        }
      />

      <div className="preset-row">
        {TACTICAL_STYLES.map((s) => (
          <button key={s} className={`preset ${tactic.preset === s ? 'on' : ''}`} onClick={() => setPreset(s)} title={t(`ui.styleDesc.${s}`)}>
            <span className="b">{t(`ui.style.${s}`)}</span>
            <small>{PRESETS[s].formations.join(' · ')}</small>
          </button>
        ))}
      </div>

      <SubTabs
        tabs={[
          { id: 'board', label: t('ui.tv3.tab.board') },
          { id: 'team', label: t('ui.tv3.tab.team') },
          { id: 'setpieces', label: t('ui.tv3.tab.setpieces') },
          { id: 'templates', label: t('ui.tv3.tab.templates') },
          { id: 'saved', label: t('ui.tac.tab.saved', { n: club.savedTactics.length }) },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'board' && badSlots.length > 0 && (
        <div className="tv-warn" role="alert">
          <span>{t('ui.tv4.unavailable', { n: badSlots.length })}</span>
          <button className="btn sm primary" onClick={fixLineup}>
            {t('ui.tv4.replace')}
          </button>
        </div>
      )}

      {tab === 'board' && (
        <div className="tv-board">
          <div className="tv-pitchcol">
            <div className="tv-modebar">
              {seg<Mode>(['players', 'positions'], mode, setMode, (m) => t(`ui.tv3.mode.${m}`))}
            </div>
            <Pitch
              innerRef={pitchRef}
              laneTint={lanes.threat.map((v) => v / 100)}
              onClick={(e) => {
                if (mode === 'positions' && sel !== null && e.target === e.currentTarget) moveSlot(sel, e.clientX, e.clientY);
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={dropOnPitch}
            >
              {sel !== null && selPlayer && (tactic.channels?.[sel] ?? 'auto') !== 'auto' && (
                <svg className="pitch-arrows" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  <defs>
                    <marker id="tv-arrow" markerUnits="userSpaceOnUse" markerWidth="3" markerHeight="3" refX="1.5" refY="1.5" orient="auto">
                      <path d="M0 0 L3 1.5 L0 3 Z" fill="var(--accent)" />
                    </marker>
                  </defs>
                  <line
                    x1={tactic.slots[sel].x}
                    y1={tactic.slots[sel].y - 5}
                    x2={10 + 20 * LANE_CHANNEL.indexOf(tactic.channels![sel] as Exclude<PlayerChannel, 'auto'>)}
                    y2={Math.max(6, tactic.slots[sel].y - 24)}
                    stroke="var(--accent)"
                    strokeWidth="0.7"
                    strokeDasharray="1.6 1.2"
                    markerEnd="url(#tv-arrow)"
                  />
                </svg>
              )}
              {tactic.slots.map((_, i) => chip(i))}
            </Pitch>
            <p className="tv-help">{t(`ui.tv3.modeHelp.${mode}`)}</p>
            <Panel title={t('ui.tv3.lanes')}>
              <div className="tv-lanes">
                {Array.from({ length: ZONE_LANES }, (_, l) => (
                  <div key={l} className="tv-lane" title={t(`ui.chan.${LANE_CHANNEL[l]}`)}>
                    <div className="bars">
                      <div className="bar t" style={{ height: `${Math.max(4, lanes.threat[l] * 0.46)}px` }} />
                      <div className="bar c" style={{ height: `${Math.max(4, lanes.cover[l] * 0.46)}px` }} />
                    </div>
                    {LANE_SYMBOL[l]}
                  </div>
                ))}
              </div>
              <div className="tv-key" style={{ marginTop: 6 }}>
                <span>
                  <i style={{ background: 'var(--accent)' }} />
                  {t('ui.tv3.threat')}
                </span>
                <span>
                  <i style={{ background: '#4f8cff' }} />
                  {t('ui.tv3.cover')}
                </span>
              </div>
              <p className="tv-help" style={{ marginTop: 6 }}>
                {t('ui.tv3.lanesHelp')}
              </p>
            </Panel>
          </div>

          <div id="tv-editor" style={{ minWidth: 0 }}>
            {editor()}
          </div>

          <div className="tv-lists grid" style={{ alignContent: 'start' }}>
            <Panel title={t('ui.tac.bench', { n: setup.bench.length, max: BENCH_SIZE })} flush>
              <div className={`tv-drop ${benchHot ? 'hot' : ''}`} onDragOver={(e) => (e.preventDefault(), setBenchHot(true))} onDragLeave={() => setBenchHot(false)} onDrop={dropOnBench}>
                {bench.length === 0 && (
                  <div className="faint" style={{ padding: 12, fontSize: 12 }}>
                    {t('ui.tac.dropHere')}
                  </div>
                )}
                {bench.map((p) => listRow(p, 'bench'))}
              </div>
            </Panel>
            <Panel title={t('ui.tac.reserves', { n: reserves.length })} flush>
              {reserves.map((p) => listRow(p, 'reserve'))}
            </Panel>
            {tab === 'board' && (
              <div className="row">
                <button className="btn sm" onClick={clearRoles}>
                  {t('ui.tv3.resetRoles')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'team' && withDiagram(teamTab(), 'team')}
      {tab === 'setpieces' && withDiagram(setPiecesTab(), 'setpieces')}
      {tab === 'templates' && templatesTab()}
      {tab === 'saved' && savedTab()}
    </>
  );
}
