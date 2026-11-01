import {
  POSITIONS,
  YOUTH_POLICIES,
  academyCapacity,
  clubPlayers,
  dynamicOvr,
  formatMoney,
  nearestPreset,
  overall,
  ovrTrend,
  playerValue,
  positionName,
  promoteToFirstTeam,
  prospectsFor,
  readyToPromote,
  releaseFromAcademy,
  sendOnYouthLoan,
  signBestProspects,
  signProspect,
  styleFit,
  t,
  type AttrKey,
  type Player,
  type Position,
  type TrainingFocus,
  type YouthPolicy,
} from '@pitchside/core';
import { useState } from 'react';
import { Attr, Face, Flag, Meter, OvrChip, Panel, PlayerCard, PosBadge, StatGrid, SubTabs, ViewHead, type Column } from '../components/ui';
import { FcCard } from '../components/FcCard';
import { pct } from '../lib/labels';
import { useGame, useGameState } from '../store/game';

type Mode = 'general' | 'cards' | 'technical' | 'physical' | 'mental' | 'contracts' | 'development' | 'academy';

const TECH: AttrKey[] = ['finishing', 'passing', 'dribbling', 'firstTouch', 'crossing', 'tackling', 'marking', 'heading', 'longShots', 'setPieces'];
const PHYS: AttrKey[] = ['pace', 'acceleration', 'stamina', 'strength', 'agility', 'jumping', 'naturalFitness'];
const MENT: AttrKey[] = ['vision', 'decisions', 'positioning', 'composure', 'workRate', 'teamwork', 'aggression', 'leadership'];
const FOCUS: TrainingFocus[] = ['balanced', 'attacking', 'defending', 'physical', 'technical', 'mental', 'goalkeeping'];
const ORDER = 'GK RB CB LB DM CM AM RW LW ST';

export function Squad() {
  const g = useGameState();
  const { openPlayer, mutate, notify } = useGame();
  const [mode, setMode] = useState<Mode>('general');
  const club = g.clubs[g.userClubId as string];
  const all = clubPlayers(g, club.id);
  const players = all.filter((p) => !p.academy);
  const academy = all.filter((p) => p.academy);
  const prospects = prospectsFor(g, club.id);
  const capacity = academyCapacity(club);
  const loanedAcademy = Object.values(g.players).filter((p) => p.loan?.parentClubId === club.id && p.loan.wasAcademy);
  const full = academy.length >= capacity;
  const wageBill = players.reduce((s, p) => s + (p.contract?.wage ?? 0), 0);
  const stars = [...players].sort((a, b) => overall(b) - overall(a)).slice(0, 4);
  const style = nearestPreset(club.tactic.tactic.sliders);

  const base: Column<Player>[] = [
    { key: 'face', label: '', render: (p) => <Face player={p} club={club} size={26} /> },
    { key: 'pos', label: t('ui.col.pos'), render: (p) => <PosBadge pos={p.position} />, sort: (p) => ORDER.indexOf(p.position) },
    {
      key: 'name',
      label: t('ui.col.name'),
      render: (p) => (
        <span className="b link" onClick={() => openPlayer(p.id)}>
          {p.firstName ? `${p.firstName.charAt(0)}. ` : ''}
          {p.lastName}
          {p.loan && <span className="tag" style={{ marginLeft: 6 }}>{t('ui.onLoan')}</span>}
          {p.listed && <span className="tag warn" style={{ marginLeft: 6 }}>{t(`ui.listed.${p.listed}`)}</span>}
        </span>
      ),
      sort: (p) => p.lastName,
    },
    { key: 'nat', label: '', render: (p) => <Flag code={p.nationality} size={16} />, sort: (p) => p.nationality },
    { key: 'age', label: t('ui.col.age'), num: true, render: (p) => p.age, sort: (p) => p.age },
    {
      key: 'ovr',
      label: t('ui.col.ovr'),
      num: true,
      render: (p) => {
        const d = dynamicOvr(p);
        const delta = d - overall(p);
        return (
          <span className="row nw" style={{ justifyContent: 'flex-end', gap: 4 }} title={t('ui.card.dynTip', { base: overall(p), now: d })}>
            {delta !== 0 && <span className={delta > 0 ? 'good' : 'bad'} style={{ fontSize: 10 }}>{delta > 0 ? `▲${delta}` : `▼${-delta}`}</span>}
            <OvrChip v={d} />
          </span>
        );
      },
      sort: (p) => dynamicOvr(p),
    },
  ];
  const attrCols = (keys: AttrKey[]): Column<Player>[] => keys.map((k) => ({ key: k, label: t(`attrShort.${k}`), num: true, render: (p: Player) => <Attr v={p.attrs[k]} />, sort: (p: Player) => p.attrs[k] }));
  const general: Column<Player>[] = [
    {
      key: 'fit',
      label: t('ui.col.styleFit'),
      num: true,
      render: (p) => {
        const f = styleFit(p, style);
        return <span className={f < 0.85 ? 'bad' : f > 1 ? 'good' : ''}>{pct(f)}</span>;
      },
      sort: (p) => styleFit(p, style),
    },
    {
      key: 'cond',
      label: t('ui.col.fitness'),
      render: (p) => (
        <div style={{ width: 56 }}>
          <Meter value={p.fitness} color={p.fitness < 70 ? 'var(--warn)' : undefined} />
        </div>
      ),
      sort: (p) => p.fitness,
    },
    { key: 'mor', label: t('ui.col.morale'), num: true, render: (p) => Math.round(p.morale), sort: (p) => p.morale },
    { key: 'hap', label: t('ui.col.happiness'), num: true, render: (p) => <span className={p.happiness < 38 ? 'bad' : ''}>{Math.round(p.happiness)}</span>, sort: (p) => p.happiness },
    { key: 'form', label: t('ui.col.form'), num: true, render: (p) => p.form, sort: (p) => p.form },
    { key: 'apps', label: t('ui.col.apps'), num: true, render: (p) => p.stats.apps, sort: (p) => p.stats.apps },
    { key: 'gls', label: t('ui.col.goals'), num: true, render: (p) => p.stats.goals, sort: (p) => p.stats.goals },
    { key: 'ast', label: t('ui.col.assists'), num: true, render: (p) => p.stats.assists, sort: (p) => p.stats.assists },
    { key: 'avg', label: t('ui.col.rating'), num: true, render: (p) => (p.stats.apps ? (p.stats.ratingSum / p.stats.apps).toFixed(2) : '–'), sort: (p) => (p.stats.apps ? p.stats.ratingSum / p.stats.apps : 0) },
    {
      key: 'st',
      label: t('ui.col.status'),
      render: (p) =>
        p.injury ? (
          <span className="tag bad">{t('ui.injuredDays', { n: Math.ceil(p.injury.daysOut) })}</span>
        ) : p.suspendedMatches ? (
          <span className="tag warn">{t('ui.suspendedN', { n: p.suspendedMatches })}</span>
        ) : (
          <span className="tag">{t(`ui.status.${p.squadStatus}`)}</span>
        ),
      sort: (p) => (p.injury ? 2 : p.suspendedMatches ? 1 : 0),
    },
  ];
  const contracts: Column<Player>[] = [
    { key: 'wage', label: t('ui.col.wage'), num: true, render: (p) => formatMoney(p.contract?.wage ?? 0), sort: (p) => p.contract?.wage ?? 0 },
    { key: 'exp', label: t('ui.col.until'), num: true, render: (p) => (p.contract ? t('ui.juneN', { n: p.contract.expiresSeason + 1 }) : '–'), sort: (p) => p.contract?.expiresSeason ?? 0 },
    { key: 'cl', label: t('ui.col.clause'), num: true, render: (p) => (p.contract?.releaseClause ? formatMoney(p.contract.releaseClause) : '–'), sort: (p) => p.contract?.releaseClause ?? 0 },
    { key: 'val', label: t('ui.col.value'), num: true, render: (p) => formatMoney(playerValue(g, p)), sort: (p) => playerValue(g, p) },
    { key: 'son', label: t('ui.col.sellOn'), render: (p) => p.sellOnClauses.map((c) => `${g.clubs[c.clubId]?.shortName ?? '?'} ${c.percent}%`).join(', ') || '–' },
    { key: 'prom', label: t('ui.col.promise'), render: (p) => (p.promise ? <span className="tag acc">{t(`ui.promise.${p.promise.kind}`)}</span> : '') },
    { key: 'leave', label: '', render: (p) => (p.wantsToLeave ? <span className="tag bad">{t('ui.wantsOut')}</span> : '') },
  ];
  const development: Column<Player>[] = [
    { key: 'pot', label: t('ui.col.potential'), num: true, render: (p) => <b>{p.potential}</b>, sort: (p) => p.potential },
    { key: 'trend', label: t('ui.col.trend'), num: true, render: (p) => { const d = ovrTrend(p, 3); return d === null ? <span className="faint">–</span> : <span className={d > 0 ? 'good b' : d < 0 ? 'bad b' : 'faint'}>{d > 0 ? `+${d}` : d}</span>; }, sort: (p) => ovrTrend(p, 3) ?? -99 },
    {
      key: 'focus',
      label: t('ui.col.focus'),
      render: (p) => (
        <select value={p.trainingFocus ?? 'balanced'} onChange={(e) => mutate(() => (p.trainingFocus = e.target.value as TrainingFocus))}>
          {FOCUS.filter((f) => (p.position === 'GK' ? ['balanced', 'goalkeeping', 'physical', 'mental'].includes(f) : f !== 'goalkeeping')).map((f) => (
            <option key={f} value={f}>
              {t(`ui.focus.${f}`)}
            </option>
          ))}
        </select>
      ),
    },
    {
      key: 'retrain',
      label: t('ui.col.retrain'),
      render: (p) =>
        p.retraining ? (
          <span className="row nw" style={{ gap: 6 }}>
            <PosBadge pos={p.retraining.position} />
            <div style={{ width: 60 }}>
              <Meter value={p.retraining.progress} />
            </div>
            <button className="btn sm ghost" onClick={() => mutate(() => (p.retraining = null))}>
              ✕
            </button>
          </span>
        ) : p.position === 'GK' ? (
          '–'
        ) : (
          <select
            value=""
            onChange={(e) => {
              const pos = e.target.value as Position;
              if (!pos) return;
              mutate(() => (p.retraining = { position: pos, progress: 0 }));
              notify(t('ui.retrainStarted', { p: p.lastName, pos: positionName(pos) }));
            }}
          >
            <option value="">{t('ui.retrainPick')}</option>
            {POSITIONS.filter((x) => x !== 'GK' && x !== p.position && !p.secondaryPositions.includes(x)).map((x) => (
              <option key={x} value={x}>
                {positionName(x)}
              </option>
            ))}
          </select>
        ),
    },
    { key: 'sec', label: t('ui.col.secondary'), render: (p) => <span className="row nw" style={{ gap: 3 }}>{p.secondaryPositions.map((x) => <PosBadge key={x} pos={x} />)}</span> },
    {
      key: 'role',
      label: t('ui.col.squadRole'),
      render: (p) => (
        <select
          value={p.squadStatus}
          onChange={(e) =>
            mutate(() => {
              p.squadStatus = e.target.value as Player['squadStatus'];
              p.statusLocked = true;
            })
          }
        >
          {(['key', 'first', 'rotation', 'backup', 'youth'] as const).map((s) => (
            <option key={s} value={s}>
              {t(`ui.status.${s}`)}
            </option>
          ))}
        </select>
      ),
    },
  ];
  const columns =
    mode === 'general'
      ? [...base, ...general]
      : mode === 'technical'
        ? [...base, ...attrCols(TECH)]
        : mode === 'physical'
          ? [...base, ...attrCols(PHYS)]
          : mode === 'mental'
            ? [...base, ...attrCols(MENT)]
            : mode === 'development'
              ? [...base, ...development]
              : [...base, ...contracts];

  return (
    <>
      <ViewHead title={t('ui.nav.squad')} meta={t('ui.squad.meta', { n: players.length, wages: wageBill, budget: club.finances.wageBudget })} />
      <div className="grid c4" style={{ marginBottom: 12 }}>
        {stars.map((p) => (
          <PlayerCard key={p.id} p={p} club={club} onClick={() => openPlayer(p.id)} right={<span className="dim" style={{ fontSize: 12 }}>{formatMoney(playerValue(g, p))}</span>} />
        ))}
      </div>
      <SubTabs<Mode>
        value={mode}
        onChange={setMode}
        tabs={[
          { id: 'general', label: t('ui.squad.general') },
          { id: 'cards', label: t('ui.squad.cards') },
          { id: 'technical', label: t('ui.squad.technical') },
          { id: 'physical', label: t('ui.squad.physical') },
          { id: 'mental', label: t('ui.squad.mental') },
          { id: 'contracts', label: t('ui.squad.contracts') },
          { id: 'development', label: t('ui.squad.development') },
          { id: 'academy', label: t('ui.squad.academy', { n: academy.length + prospects.length }) },
        ]}
      />
      {mode === 'cards' ? (
        <div className="cards-grid" data-squad-cards>
          {[...players]
            .sort((a, b) => overall(b) - overall(a))
            .map((p) => (
              <FcCard key={p.id} p={p} club={club} size="md" badge={p.growthPlan ? '▲' : p.injury ? '✚' : undefined} onClick={() => openPlayer(p.id)} />
            ))}
        </div>
      ) : mode !== 'academy' ? (
        <Panel title={t('ui.squad.hint')} flush>
          <StatGrid rows={players} columns={columns} rowKey={(p) => p.id} onOpen={(p) => openPlayer(p.id)} initialSort={{ key: 'pos', dir: 1 }} />
        </Panel>
      ) : (
        <>
        <Panel title={t('ui.academy.office')} className="academy-office">
          <div className="academy-head" data-academy-head>
            <div>
              <div className="faint">{t('ui.academy.capacity')}</div>
              <div className="disp" style={{ fontSize: 26 }}>
                {academy.length + loanedAcademy.length}/{capacity}
              </div>
            </div>
            <div className="field">
              <label>{t('ui.academy.policy')}</label>
              <div className="tv-seg wrap">
                {YOUTH_POLICIES.map((k: YouthPolicy) => (
                  <button key={k} type="button" data-policy={k} className={(club.youthPolicy ?? 'balanced') === k ? 'on' : ''} title={t(`ui.academy.policy.${k}.d`)} onClick={() => mutate(() => (club.youthPolicy = k))}>
                    {t(`ui.academy.policy.${k}`)}
                  </button>
                ))}
              </div>
            </div>
            <button className="btn acc" data-sign-best disabled={prospects.length === 0 || full} onClick={() => mutate((s) => signBestProspects(s, club))}>
              {t('ui.academy.signBest')}
            </button>
          </div>
          <p className="faint" style={{ margin: '8px 0 0', fontSize: 12 }}>{t('ui.academy.officeHelp')}</p>
        </Panel>
        <div className="grid c2" style={{ marginTop: 12 }}>
          <Panel title={t('ui.academy.prospects', { n: prospects.length })} flush>
            {prospects.length === 0 && <div className="dim" style={{ padding: 12 }}>{t('ui.academy.noProspects')}</div>}
            {prospects.map((p) => (
              <div key={p.id} className="row nw" style={{ padding: '8px 10px', borderBottom: '1px solid var(--line)' }}>
                <Face player={p} size={30} />
                <PosBadge pos={p.position} />
                <div style={{ minWidth: 0 }}>
                  <div className="b link ellipsis" onClick={() => openPlayer(p.id)}>
                    {p.firstName} {p.lastName}
                  </div>
                  <div className="faint" style={{ fontSize: 12 }}>
                    <Flag code={p.nationality} size={14} /> {t('ui.ageN', { n: p.age })} · {t('ui.academy.range', { lo: Math.max(overall(p), p.potential - 8), hi: Math.min(99, p.potential + 6) })}
                  </div>
                </div>
                <span className="spacer" />
                <span className="faint" style={{ fontSize: 11 }}>
                  {t('ui.academy.expires', { n: Math.max(0, (p.prospect?.expiresDay ?? 0) - g.day) })}
                </span>
                <button className="btn sm acc" disabled={full} data-sign-prospect={p.id} onClick={() => mutate((s) => signProspect(s, club, p.id))}>
                  {t('ui.academy.sign')}
                </button>
              </div>
            ))}
          </Panel>
          <Panel title={t('ui.academy.players', { n: academy.length })} flush>
            {academy.length === 0 && <div className="dim" style={{ padding: 12 }}>{t('ui.academy.empty')}</div>}
            {academy.map((p) => (
              <div key={p.id} className="row nw" style={{ padding: '8px 10px', borderBottom: '1px solid var(--line)' }}>
                <Face player={p} club={club} size={30} />
                <PosBadge pos={p.position} />
                <span className="b link ellipsis" onClick={() => openPlayer(p.id)}>
                  {p.firstName} {p.lastName}
                </span>
                <span className="faint">{t('ui.ageN', { n: p.age })}</span>
                {readyToPromote(g, club, p) && <span className="tag good">{t('ui.academy.ready')}</span>}
                <span className="spacer" />
                {ovrTrend(p, 3) !== null && <span className={(ovrTrend(p, 3) ?? 0) >= 0 ? 'good' : 'bad'}>{(ovrTrend(p, 3) ?? 0) > 0 ? `+${ovrTrend(p, 3)}` : ovrTrend(p, 3)}</span>}
                <OvrChip v={overall(p)} />
                <button className="btn sm" data-youth-loan={p.id} title={t('ui.academy.loanTip')} onClick={() => notify(mutate((s) => sendOnYouthLoan(s, club, p.id)).ok ? t('ui.academy.loaned') : t('ui.academy.loanFail'))}>
                  {t('ui.academy.loan')}
                </button>
                <button className="btn sm acc" onClick={() => mutate(() => promoteToFirstTeam(club, p))}>
                  {t('ui.academy.promote')}
                </button>
                <button className="btn sm ghost" onClick={() => mutate((s) => releaseFromAcademy(s, club, p))}>
                  {t('ui.academy.release')}
                </button>
              </div>
            ))}
            {loanedAcademy.map((p) => (
              <div key={p.id} className="row nw" style={{ padding: '8px 10px', borderBottom: '1px solid var(--line)' }}>
                <Face player={p} size={30} />
                <PosBadge pos={p.position} />
                <span className="b link ellipsis" onClick={() => openPlayer(p.id)}>
                  {p.firstName} {p.lastName}
                </span>
                <span className="spacer" />
                <span className="tag">{t('ui.academy.onLoan', { club: p.clubId ? (g.clubs[p.clubId]?.name ?? '?') : '?' })}</span>
                <span className="faint" style={{ fontSize: 12 }}>{t('ui.tr.loanApps', { n: p.stats.apps, g: p.stats.goals })}</span>
              </div>
            ))}
          </Panel>
        </div>
        </>
      )}
    </>
  );
}
