// Centro de entrenamiento: entrenadores por grupo, enfoque de sesión, intensidad, informe semanal,
// eventos que piden decisión y el árbol de instalaciones. Todo el texto sale de i18n.
import {
  PROJECTS,
  PROJECT_REQUIRES,
  Rng,
  SESSION_FOCUSES,
  TRAINING_GROUPS,
  CAMP_DAYS,
  TRAINING_CAMPS,
  TRAINING_INTENSITIES,
  activeCamp,
  assignCoach,
  campCost,
  canBuild,
  coachAffinity,
  coachLoad,
  ensureTrainingPlan,
  facilityEffects,
  facilityLevel,
  facilityUpkeepPerLevel,
  firstTeam,
  formatMoney,
  groupOfPlayer,
  hashString,
  isTrainer,
  overall,
  pendingTrainingEvents,
  projectCost,
  projectUnlocked,
  resolveTrainingEvent,
  ovrTrend,
  sessionEfficiency,
  setIntensity,
  setSessionFocus,
  startCamp,
  startProject,
  t,
  weeklyGainEstimate,
  EVENT_CHOICES,
  type ProjectType,
  type SessionFocus,
  type StaffMember,
  type TrainingCamp,
  type TrainingGroup,
  type TrainingIntensity,
} from '@pitchside/core';
import { useState } from 'react';
import { Spark } from '../components/Spark';
import { Face, Meter, OvrChip, Panel, SubTabs, ViewHead } from '../components/ui';
import { useGame, useGameState } from '../store/game';
import '../tactics.css';

type Tab = 'sessions' | 'progress' | 'report' | 'events' | 'facilities';

/** Instalaciones del árbol de entrenamiento (las de negocio siguen en Finanzas). */
const TREE: ProjectType[] = ['trainingGround', 'gym', 'videoAnalysis', 'medicalCenter', 'recoveryPool', 'youthAcademy', 'youthDorm', 'scoutingNetwork', 'pitchTech'];

const fmt1 = (n: number) => n.toFixed(2);

export function Training() {
  const g = useGameState();
  const { mutate, notify, openPlayer } = useGame();
  const club = g.clubs[g.userClubId as string];
  const plan = ensureTrainingPlan(g, club);
  const fx = facilityEffects(club);
  const camp = activeCamp(g, plan);
  const [tab, setTab] = useState<Tab>('sessions');

  const players = firstTeam(g, club.id);
  const trainers = (club.staffIds ?? []).map((id) => g.staff[id]).filter((m): m is StaffMember => !!m && isTrainer(m));
  const load = coachLoad(plan);
  const pending = pendingTrainingEvents(g);
  const report = plan.lastReport;
  const gainOf = new Map(report?.rows.map((r) => [r.playerId, r.gain]) ?? []);

  const effAvg = (() => {
    const e = TRAINING_GROUPS.map((k) => sessionEfficiency(g, club, plan, k));
    return Math.round((e.reduce((s, v) => s + v, 0) / e.length) * 100);
  })();

  const groupCard = (group: TrainingGroup) => {
    const gp = plan.groups[group];
    const coach = gp.coachId ? g.staff[gp.coachId] : undefined;
    const eff = sessionEfficiency(g, club, plan, group);
    const members = players.filter((p) => groupOfPlayer(p) === group).sort((a, b) => overall(b) - overall(a));
    const expected = members.length ? members.reduce((s, p) => s + weeklyGainEstimate(p, eff, plan.intensity, fx.training), 0) / members.length : 0;
    return (
      <Panel key={group} title={`${t(`ui.train.group.${group}`)} · ${t('ui.train.players', { n: members.length })}`}>
        <div className="field">
          <label>{t('ui.train.coach')}</label>
          <select
            data-group={group}
            value={gp.coachId ?? ''}
            onChange={(e) => {
              const id = e.target.value || null;
              const ok = assignCoach(g, club, group, id);
              if (!ok) notify(t('ui.train.assignFail'));
              mutate(() => undefined);
            }}
          >
            <option value="">{t('ui.train.noCoach')}</option>
            {trainers.map((m) => (
              <option key={m.id} value={m.id}>
                {t('ui.train.coachOption', { name: `${m.firstName.charAt(0)}. ${m.lastName}`, role: t(`staff.role.${m.role}`), ability: m.ability })}
              </option>
            ))}
          </select>
        </div>
        {coach && (
          <div className="faint" style={{ fontSize: 12, marginTop: 4 }}>
            {t('ui.train.coachAffinity', { n: Math.round(coachAffinity(coach, group) * 100) })} · {t('ui.train.coachLoad', { n: load.get(coach.id)?.length ?? 1 })}
            {coach.focusStyle && (
              <>
                {' · '}
                <span className={coach.focusStyle === gp.focus ? 'good' : ''}>
                  {t('ui.train.spec', { focus: t(`ui.train.focus.${coach.focusStyle}`) })}
                  {coach.focusStyle === gp.focus ? ` (${t('ui.train.specMatch')})` : ''}
                </span>
              </>
            )}
          </div>
        )}
        <div className="field" style={{ marginTop: 10 }}>
          <label>{t('ui.train.focus')}</label>
          <div className="tv-seg wrap">
            {SESSION_FOCUSES.map((f: SessionFocus) => (
              <button key={f} type="button" data-focus={f} className={gp.focus === f ? 'on' : ''} title={t(`ui.train.focusHelp.${f}`)} onClick={() => mutate(() => setSessionFocus(g, club, group, f))}>
                {t(`ui.train.focus.${f}`)}
              </button>
            ))}
          </div>
          <p className="tv-help" style={{ marginTop: 4 }}>
            {t(`ui.train.focusHelp.${gp.focus}`)}
          </p>
        </div>
        <div style={{ marginTop: 8 }}>
          <div className="row" style={{ fontSize: 12 }}>
            <span className="dim">{t('ui.train.efficiency')}</span>
            <span className="spacer" />
            <span className="b">{Math.round(eff * 100)}%</span>
          </div>
          <Meter value={(eff / 1.25) * 100} color={eff < 0.5 ? 'var(--warn)' : undefined} />
          <div className="row" style={{ fontSize: 12, marginTop: 4 }}>
            <span className="dim">{t('ui.train.expected')}</span>
            <span className="spacer" />
            <span className="b">{t('ui.train.perWeek', { n: fmt1(expected) })}</span>
          </div>
        </div>
        <div style={{ marginTop: 10, maxHeight: 220, overflow: 'auto', borderTop: '1px solid var(--line)' }}>
          {members.length === 0 && <div className="faint" style={{ padding: 8, fontSize: 12 }}>{t('ui.train.noPlayers')}</div>}
          {members.map((p) => (
            <div key={p.id} className="tv-row" style={{ cursor: 'pointer' }} onClick={() => openPlayer(p.id)}>
              <Face player={p} club={club} size={22} />
              <span className="nm ellipsis">{p.lastName}</span>
              <span className="faint" style={{ fontSize: 11 }}>
                {p.age}
              </span>
              <span className="faint" style={{ fontSize: 11 }} title={t('ui.train.thisWeek')}>
                {gainOf.get(p.id) ? `+${gainOf.get(p.id)}` : ''}
              </span>
              <OvrChip v={overall(p)} />
              <span className="faint" style={{ width: 28, textAlign: 'right' }}>
                {p.potential}
              </span>
            </div>
          ))}
        </div>
      </Panel>
    );
  };

  const sessionsTab = () => (
    <>
      <Panel title={t('ui.train.intensity')}>
        <div className="tv-seg">
          {TRAINING_INTENSITIES.map((i: TrainingIntensity) => (
            <button key={i} type="button" data-intensity={i} className={plan.intensity === i ? 'on' : ''} onClick={() => mutate(() => setIntensity(g, club, i))}>
              {t(`ui.train.int.${i}`)}
            </button>
          ))}
        </div>
        <p className="tv-help" style={{ marginTop: 6 }}>
          {t(`ui.train.intHelp.${plan.intensity}`)}
        </p>
      </Panel>
      <div className="grid c2" style={{ marginTop: 12, alignItems: 'start' }}>
        <Panel title={t('ui.train.camp.title')}>
          {camp ? (
            <p data-camp-active>{t('ui.train.camp.active', { camp: t(`ui.train.camp.${camp}`) })}</p>
          ) : g.day <= CAMP_DAYS && !(plan.camp && plan.campSeason === g.season) ? (
            <>
              <p className="tv-help">{t('ui.train.camp.help', { cost: campCost(g, club), days: CAMP_DAYS - g.day })}</p>
              <div className="tv-seg wrap">
                {TRAINING_CAMPS.map((k: TrainingCamp) => (
                  <button
                    key={k}
                    type="button"
                    data-camp={k}
                    title={t(`ui.train.camp.${k}.d`)}
                    onClick={() => {
                      const r = mutate((s) => startCamp(s, club, k));
                      notify(r.ok ? t('ui.train.camp.started') : t(`ui.train.camp.err.${r.reason}`));
                    }}
                  >
                    {t(`ui.train.camp.${k}`)}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="faint">{t('ui.train.camp.closed')}</p>
          )}
        </Panel>
        <Panel title={t('ui.train.matchWeek.title')}>
          <label className="row" style={{ cursor: 'pointer' }}>
            <input type="checkbox" data-match-week checked={plan.autoMatchWeek !== false} onChange={(e) => mutate(() => (plan.autoMatchWeek = e.target.checked))} />
            <span>{t('ui.train.matchWeek.label')}</span>
          </label>
          <p className="tv-help" style={{ marginTop: 6 }}>
            {t('ui.train.matchWeek.help')}
          </p>
        </Panel>
      </div>
      {trainers.length < 4 && (
        <p className="faint" style={{ margin: '10px 0 0', fontSize: 12 }}>
          {t('ui.train.hireHint')}
        </p>
      )}
      <div className="grid c3" style={{ marginTop: 12, alignItems: 'start' }}>
        {TRAINING_GROUPS.map((k) => groupCard(k))}
      </div>
    </>
  );

  const progressTab = () => {
    const squad = [...players, ...Object.values(g.players).filter((p) => p.clubId === club.id && p.academy)];
    const rows = squad
      .map((p) => ({ p, d: ovrTrend(p, 3) }))
      .filter((r): r is { p: (typeof squad)[number]; d: number } => r.d !== null)
      .sort((a, b) => b.d - a.d);
    const row = (r: { p: (typeof squad)[number]; d: number }) => (
      <div key={r.p.id} className="tv-row" style={{ cursor: 'pointer' }} onClick={() => openPlayer(r.p.id)}>
        <Face player={r.p} club={club} size={24} />
        <span className="nm ellipsis">{r.p.lastName}</span>
        <span className="faint" style={{ fontSize: 11 }}>{r.p.age}</span>
        <Spark values={(r.p.ovrHistory ?? []).map((h) => h.ovr)} />
        <span className={r.d > 0 ? 'good b' : r.d < 0 ? 'bad b' : 'faint'}>{r.d > 0 ? `+${r.d}` : r.d}</span>
        <OvrChip v={overall(r.p)} />
      </div>
    );
    if (rows.length === 0) {
      return (
        <Panel title={t('ui.train.tab.progress')}>
          <p className="dim">{t('ui.train.progressEmpty')}</p>
        </Panel>
      );
    }
    return (
      <div className="grid c2" style={{ alignItems: 'start' }} data-progress>
        <Panel title={t('ui.train.progressUp')} flush>
          {rows.filter((r) => r.d > 0).slice(0, 10).map(row)}
        </Panel>
        <Panel title={t('ui.train.progressDown')} flush>
          {[...rows].reverse().filter((r) => r.d < 0).slice(0, 10).map(row)}
        </Panel>
      </div>
    );
  };

  const reportTab = () => {
    if (!report) {
      return (
        <Panel title={t('ui.train.tab.report')}>
          <p className="dim">{t('ui.train.reportEmpty')}</p>
        </Panel>
      );
    }
    return (
      <div className="grid c2" style={{ alignItems: 'start' }}>
        <Panel title={t('ui.train.reportTop')} flush>
          {report.rows.length === 0 && <div className="dim" style={{ padding: 12 }}>{t('ui.train.reportNone')}</div>}
          {report.rows.slice(0, 12).map((r) => {
            const p = g.players[r.playerId];
            if (!p) return null;
            return (
              <div key={r.playerId} className="tv-row" style={{ cursor: 'pointer' }} onClick={() => openPlayer(p.id)}>
                <Face player={p} club={club} size={24} />
                <span className="nm ellipsis">{p.lastName}</span>
                <span className="tag">{t(`ui.train.group.${r.group}`)}</span>
                <span className="good b">+{r.gain.toFixed(2)}</span>
                <OvrChip v={overall(p)} />
              </div>
            );
          })}
        </Panel>
        <Panel title={t('ui.train.tab.report')}>
          <p>{t('ui.train.reportEff', { n: Math.round(report.efficiency * 100) })}</p>
          <h5 className="tv-sec" style={{ margin: '12px 0 6px' }}>
            {t('ui.train.reportInjured')}
          </h5>
          {report.injured.length === 0 ? <span className="faint">—</span> : null}
          {report.injured.map((id) => (
            <div key={id} className="bad">
              {g.players[id] ? `${g.players[id].firstName} ${g.players[id].lastName}` : id}
            </div>
          ))}
        </Panel>
      </div>
    );
  };

  const eventsTab = () => (
    <div className="grid" style={{ maxWidth: 760 }}>
      {pending.length === 0 && (
        <Panel title={t('ui.train.tab.events', { n: 0 })}>
          <p className="dim">{t('ui.tev.empty')}</p>
        </Panel>
      )}
      {pending.map((ev) => {
        const a = ev.playerId ? g.players[ev.playerId] : null;
        const b = ev.otherPlayerId ? g.players[ev.otherPlayerId] : null;
        const staff = ev.staffId ? g.staff[ev.staffId] : null;
        const nameA = a ? `${a.firstName} ${a.lastName}` : staff ? `${staff.firstName} ${staff.lastName}` : '';
        const nameB = b ? `${b.firstName} ${b.lastName}` : '';
        return (
          <Panel key={ev.id} title={t(`ui.tev.title.${ev.kind}`)}>
            <p style={{ marginTop: 0 }}>{t(`ui.tev.desc.${ev.kind}`, { a: nameA, b: nameB })}</p>
            <div className="row">
              {EVENT_CHOICES[ev.kind].map((c) => (
                <button
                  key={c}
                  className="btn"
                  data-choice={c}
                  onClick={() =>
                    mutate((s) => {
                      const res = resolveTrainingEvent(s, ev.id, c, new Rng(hashString(ev.id) ^ s.rngState));
                      notify(t(`ui.tev.res.${res}`));
                    })
                  }
                >
                  {t(`ui.tev.choice.${c}`)}
                </button>
              ))}
            </div>
          </Panel>
        );
      })}
    </div>
  );

  /** Mejor siguiente obra: la más barata que se pueda empezar ya y no esté en curso (con presupuesto). */
  const recommended = TREE.filter((ty) => canBuild(club, ty) && projectCost(club, ty) <= club.finances.transferBudget).sort((a, b) => projectCost(club, a) - projectCost(club, b))[0];

  const facilitiesTab = () => (
    <>
      <Panel title={t('ui.fac.effects')}>
        <div className="grid c3">
          {(
            [
              ['training', fx.training - 1],
              ['recovery', fx.recovery - 1],
              ['injury', fx.injuryMult - 1],
              ['video', fx.video - 1],
              ['youth', fx.youth - 1],
              ['scouting', fx.scouting - 1],
            ] as [string, number][]
          ).map(([k, v]) => (
            <div key={k} className="row" style={{ justifyContent: 'space-between' }}>
              <span className="dim">{t(`ui.fac.eff.${k}`)}</span>
              <span className={`b ${v > 0 && k !== 'injury' ? 'good' : v < 0 && k === 'injury' ? 'good' : ''}`}>
                {v >= 0 ? '+' : ''}
                {Math.round(v * 100)}%
              </span>
            </div>
          ))}
        </div>
      </Panel>
      <div className="tv-tpls" style={{ marginTop: 12 }}>
        {TREE.map((type) => {
          const lvl = facilityLevel(club, type);
          const max = PROJECTS[type].maxLevel;
          const building = club.projects.find((p) => p.type === type);
          const unlocked = projectUnlocked(club, type);
          const req = PROJECT_REQUIRES[type];
          const cost = projectCost(club, type);
          const ok = canBuild(club, type);
          return (
            <div key={type} className="tv-tpl" data-facility={type} style={{ opacity: unlocked ? 1 : 0.7 }}>
              <div className="row nw">
                <h4>{t(`project.${type}`)}</h4>
                <span className="spacer" />
                {recommended === type && <span className="tag good">{t('ui.fac.recommended')}</span>}
                <span className="tag acc">{t('ui.fac.level', { n: lvl, max })}</span>
              </div>
              <div className="pips">
                {Array.from({ length: max }, (_, i) => (
                  <i key={i} className={i < lvl ? 'on' : ''} />
                ))}
              </div>
              <p>{t(`ui.fin.effect.${type}`)}</p>
              {req && !unlocked && (
                <div className="warn" style={{ fontSize: 12 }}>
                  {t('ui.fac.requires', { what: t(`project.${req.type}`), n: req.level })}
                </div>
              )}
              {building ? (
                <div>
                  <div className="faint" style={{ fontSize: 12 }}>
                    {t('ui.fac.inProgress')} · {t('ui.fin.daysLeft', { n: building.daysLeft })}
                  </div>
                  <Meter value={((building.days - building.daysLeft) / building.days) * 100} />
                </div>
              ) : (
                <div className="faint" style={{ fontSize: 12 }}>
                  {t('ui.fac.cost', { cost: formatMoney(cost), days: PROJECTS[type].days })}
                  {PROJECTS[type].maintenance ? ` · ${t('ui.fac.upkeep', { amount: formatMoney(facilityUpkeepPerLevel(club, type)) })}` : ''}
                </div>
              )}
              <div className="row">
                <span className="spacer" />
                <button
                  className="btn sm primary"
                  disabled={!ok}
                  onClick={() => {
                    if (!window.confirm(t('ui.fin.buildConfirm', { project: t(`project.${type}`), cost }))) return;
                    try {
                      mutate((s) => startProject(s, club, type));
                      notify(t('ui.fin.buildStarted', { project: t(`project.${type}`) }));
                    } catch (e) {
                      notify(t((e as Error).message));
                    }
                  }}
                >
                  {lvl >= max ? t('ui.fac.maxed') : !unlocked ? t('ui.fac.locked') : t('ui.fac.build')}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );

  return (
    <>
      <ViewHead title={t('ui.train.title')} meta={t('ui.train.meta', { intensity: t(`ui.train.int.${plan.intensity}`), eff: effAvg })} />
      <SubTabs
        tabs={[
          { id: 'sessions', label: t('ui.train.tab.sessions') },
          { id: 'progress', label: t('ui.train.tab.progress') },
          { id: 'report', label: t('ui.train.tab.report') },
          { id: 'events', label: t('ui.train.tab.events', { n: pending.length }) },
          { id: 'facilities', label: t('ui.train.tab.facilities') },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'sessions' && sessionsTab()}
      {tab === 'progress' && progressTab()}
      {tab === 'report' && reportTab()}
      {tab === 'events' && eventsTab()}
      {tab === 'facilities' && facilitiesTab()}
    </>
  );
}
