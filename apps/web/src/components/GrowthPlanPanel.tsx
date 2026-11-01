// Plan de crecimiento de un jugador del club del usuario: elegir objetivo, ver hitos y cancelar.
import { GROWTH_PLANS, MAX_ACTIVE_PLANS, PLAN_GOAL_POINTS, activePlans, cancelGrowthPlan, plansForPosition, planProgress, startGrowthPlan, t, type GrowthPlanId, type Player } from '@pitchside/core';
import { useGame, useGameState } from '../store/game';
import { FcCard } from './FcCard';
import { Meter, Panel } from './ui';
import '../hooks.css';

export function GrowthPlanPanel({ p }: { p: Player }) {
  const g = useGameState();
  const { mutate, notify } = useGame();
  const club = g.clubs[g.userClubId as string];
  const prog = planProgress(p);
  const used = activePlans(g, club.id).length;
  const options = plansForPosition(p.position);

  const start = (id: GrowthPlanId) =>
    mutate((s) => {
      const r = startGrowthPlan(s, p.id, id);
      if (!r.ok) notify(t(`ui.plan.err.${r.reason}`));
    });

  return (
    <div className="grid c-main" style={{ alignItems: 'start' }}>
      <Panel title={t('ui.plan.title')}>
        {p.growthPlan && prog ? (
          <>
            <div className="row" style={{ marginBottom: 6 }}>
              <span className="disp" style={{ fontSize: 20 }}>
                {t(`ui.plan.${p.growthPlan.plan}`)}
              </span>
              <span className="spacer" />
              <span className="tag acc">{t('ui.plan.milestones', { n: prog.milestone })}</span>
            </div>
            <Meter value={prog.pct * 100} color="var(--accent)" />
            <div style={{ marginTop: 10 }}>
              {prog.rows.map((r) => (
                <div key={r.key} className="plan-row">
                  <span className="dim">{t(`attr.${r.key}`)}</span>
                  <Meter value={Math.max(0, Math.min(100, ((r.now - r.start) / PLAN_GOAL_POINTS) * 100))} />
                  <span className="b">
                    {Math.round(r.now)} <span className="faint">/ {Math.round(r.goal)}</span>
                  </span>
                </div>
              ))}
            </div>
            <button className="btn sm" style={{ marginTop: 10 }} onClick={() => mutate(() => cancelGrowthPlan(p))}>
              {t('ui.plan.cancel')}
            </button>
          </>
        ) : (
          <>
            <p className="dim" style={{ marginTop: 0 }}>
              {t('ui.plan.pick', { used, max: MAX_ACTIVE_PLANS })}
            </p>
            <div className="grid">
              {options.map((id) => (
                <div key={id} className="perk" data-plan={id}>
                  <div className="row nw">
                    <span className="n">{t(`ui.plan.${id}`)}</span>
                    <span className="spacer" />
                    <button className="btn sm" disabled={used >= MAX_ACTIVE_PLANS || p.age >= 32} onClick={() => start(id)}>
                      {t('ui.plan.start')}
                    </button>
                  </div>
                  <div className="d">{GROWTH_PLANS[id].targets.map((k) => t(`attr.${k}`)).join(' · ')}</div>
                </div>
              ))}
            </div>
          </>
        )}
        <p className="faint" style={{ fontSize: 12, marginBottom: 0 }}>
          {t('ui.plan.hint', { pts: PLAN_GOAL_POINTS })}
        </p>
      </Panel>
      <FcCard p={p} club={g.clubs[p.clubId ?? ''] ?? null} size="lg" />
    </div>
  );
}
