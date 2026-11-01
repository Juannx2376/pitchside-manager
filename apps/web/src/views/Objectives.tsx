// Misiones, camino del mánager (recompensas por nivel), árbol de perks y legado del club.
import {
  MANAGER_SKILLS,
  PERKS,
  buyPerk,
  cumulativeXp,
  xpToNext,
  claimAllPass,
  claimPassReward,
  claimableLevels,
  clubLegends,
  clubRecords,
  formatGameDate,
  fullName,
  isLegend,
  objectiveProgress,
  passReward,
  perkStatus,
  rivalsOf,
  spendManagerPoint,
  t,
  userManager,
  type Objective,
  type PerkBranch,
} from '@pitchside/core';
import { useState } from 'react';
import { FcCard } from '../components/FcCard';
import { Crest, Meter, Panel, SubTabs, ViewHead } from '../components/ui';
import { useGame, useGameState } from '../store/game';
import '../hooks.css';

type Tab = 'missions' | 'path' | 'perks' | 'club';
const BRANCHES: PerkBranch[] = ['tactical', 'squad', 'business'];

export function Objectives() {
  const g = useGameState();
  const [tab, setTab] = useState<Tab>('missions');
  const m = userManager(g);
  const claimable = claimableLevels(g).length;
  const done = (g.objectives ?? []).filter((o) => o.status === 'done').length;
  return (
    <>
      <ViewHead title={t('ui.obj.title')} meta={t('ui.obj.meta', { done, level: m?.level ?? 0 })} />
      <SubTabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'missions', label: t('ui.path.tab.missions') },
          { id: 'path', label: `${t('ui.path.tab.path')}${claimable ? ` (${claimable})` : ''}` },
          { id: 'perks', label: `${t('ui.path.tab.perks')}${(m?.points ?? 0) > 0 ? ` (${m?.points})` : ''}` },
          { id: 'club', label: t('ui.path.tab.club') },
        ]}
      />
      <div style={{ marginTop: 12 }}>
        {tab === 'missions' && <Missions />}
        {tab === 'path' && <PathTab />}
        {tab === 'perks' && <PerksTab />}
        {tab === 'club' && <ClubTab />}
      </div>
    </>
  );
}

function Missions() {
  const g = useGameState();
  const { mutate, notify } = useGame();
  const m = userManager(g);
  const all = g.objectives ?? [];
  const active = (scope: Objective['scope']) => all.filter((o) => o.scope === scope && o.status === 'active');
  const history = all.filter((o) => o.status !== 'active').slice(-10).reverse();
  const xp = m?.xp ?? 0;
  const lvl = m?.level ?? 0;
  const next = cumulativeXp(lvl + 1);

  const card = (o: Objective) => {
    const p = Math.min(o.target, objectiveProgress(g, o));
    return (
      <div key={o.id} className="tv-row" data-objective={o.kind} style={{ cursor: 'default', alignItems: 'flex-start', flexDirection: 'column', gap: 4 }}>
        <div className="row nw" style={{ width: '100%' }}>
          <span className="b">{t(`obj.kind.${o.kind}`, { n: o.target })}</span>
          <span className="spacer" />
          <span className={`tag ${o.status === 'done' ? 'good' : o.status === 'failed' ? 'bad' : 'acc'}`}>{t(`ui.obj.status.${o.status}`)}</span>
        </div>
        <Meter value={(p / o.target) * 100} color={o.status === 'done' ? 'var(--good)' : o.status === 'failed' ? 'var(--bad)' : undefined} />
        <div className="row faint" style={{ fontSize: 12, width: '100%' }}>
          <span>{t('ui.obj.progress', { p, n: o.target })}</span>
          <span className="spacer" />
          <span>{t('ui.obj.reward', { budget: o.rewardBudget, xp: o.rewardXp })}</span>
        </div>
      </div>
    );
  };

  return (
    <>
      {all.length === 0 && (
        <Panel title={t('ui.obj.title')}>
          <p className="dim">{t('ui.obj.empty')}</p>
        </Panel>
      )}
      <div className="grid c-main" style={{ alignItems: 'start' }}>
        <div className="grid">
          <Panel title={t('ui.obj.week')} flush>
            {active('week').map(card)}
            {active('week').length === 0 && <div className="faint" style={{ padding: 12 }}>—</div>}
          </Panel>
          <Panel title={t('ui.obj.season')} flush>
            {active('season').map(card)}
            {active('season').length === 0 && <div className="faint" style={{ padding: 12 }}>—</div>}
          </Panel>
          {history.length > 0 && (
            <Panel title={t('ui.obj.history')} flush>
              {history.map(card)}
            </Panel>
          )}
        </div>
        <Panel title={t('ui.obj.skills')}>
          <div className="row" style={{ marginBottom: 6 }}>
            <span className="b">{t('ui.obj.points', { n: m?.points ?? 0 })}</span>
          </div>
          <Meter value={((xp - cumulativeXp(lvl)) / xpToNext(lvl)) * 100} />
          <div className="faint" style={{ fontSize: 12, marginBottom: 10 }}>
            {t('ui.obj.xp', { xp, next })}
          </div>
          {MANAGER_SKILLS.map((k) => (
            <div key={k} style={{ marginBottom: 8 }}>
              <div className="row nw">
                <span className="dim">{t(`ui.career.attr.${k}`)}</span>
                <span className="spacer" />
                <span className="b">{Math.round(m?.[k] ?? 0)}</span>
                <button
                  className="btn sm"
                  data-skill={k}
                  disabled={(m?.points ?? 0) <= 0 || (m?.[k] ?? 0) >= 99}
                  onClick={() => mutate((s) => (spendManagerPoint(s, k) ? undefined : notify('—')))}
                >
                  {t('ui.obj.spend')}
                </button>
              </div>
              <Meter value={m?.[k] ?? 0} />
            </div>
          ))}
        </Panel>
      </div>
    </>
  );
}

function PathTab() {
  const g = useGameState();
  const { mutate } = useGame();
  const m = userManager(g);
  const level = m?.level ?? 0;
  const claimable = new Set(claimableLevels(g));
  const claimed = new Set(g.meta?.passClaimed ?? []);
  const start = Math.max(1, level - 3);
  const nodes = Array.from({ length: 16 }, (_, i) => start + i);
  const xp = m?.xp ?? 0;
  return (
    <Panel
      title={t('ui.path.title')}
      actions={
        claimable.size > 0 ? (
          <button className="btn sm" data-claim-all onClick={() => mutate((s) => void claimAllPass(s))}>
            {t('ui.path.claimAll', { n: claimable.size })}
          </button>
        ) : undefined
      }
    >
      <div className="row" style={{ marginBottom: 6 }}>
        <span className="disp" style={{ fontSize: 22 }}>
          {t('ui.path.level', { n: level })}
        </span>
        <span className="spacer" />
        <span className="faint">{t('ui.obj.xp', { xp, next: cumulativeXp(level + 1) })}</span>
      </div>
      <Meter value={((xp - cumulativeXp(level)) / xpToNext(level)) * 100} />
      <div className="path-track">
        {nodes.map((l) => {
          const r = passReward(l);
          const ready = claimable.has(l);
          const got = claimed.has(l);
          return (
            <div key={l} className={`path-node ${r.big ? 'big' : ''} ${got ? 'done' : ''} ${ready ? 'ready' : ''}`} data-level={l}>
              <div className="lv">{l}</div>
              <div className="rw">
                {t('ui.path.reward', { budget: r.budget })}
                {r.points > 0 ? ` · +${r.points} ${t('ui.path.point')}` : ''}
              </div>
              {ready ? (
                <button className="btn sm" onClick={() => mutate((s) => void claimPassReward(s, l))}>
                  {t('ui.path.claim')}
                </button>
              ) : got ? (
                <span className="good">✓</span>
              ) : (
                <span className="faint">🔒</span>
              )}
            </div>
          );
        })}
      </div>
      <p className="faint" style={{ fontSize: 12 }}>
        {t('ui.path.hint')}
      </p>
    </Panel>
  );
}

function PerksTab() {
  const g = useGameState();
  const { mutate, notify } = useGame();
  const m = userManager(g);
  return (
    <>
      <div className="row" style={{ marginBottom: 10 }}>
        <span className="b">{t('ui.obj.points', { n: m?.points ?? 0 })}</span>
        <span className="faint">{t('ui.perk.hint')}</span>
      </div>
      <div className="perk-grid">
        {BRANCHES.map((b) => (
          <div key={b} className="perk-col">
            <h4>{t(`ui.perk.branch.${b}`)}</h4>
            {PERKS.filter((p) => p.branch === b).map((p) => {
              const st = perkStatus(g, p);
              return (
                <div key={p.id} className={`perk ${st}`} data-perk={p.id}>
                  <div className="row nw">
                    <span className="n">{t(`ui.perk.${p.id}`)}</span>
                    <span className="spacer" />
                    <span className="tag">{t('ui.perk.cost', { n: p.cost })}</span>
                  </div>
                  <div className="d">{t(`ui.perk.${p.id}.d`)}</div>
                  {st === 'owned' ? (
                    <span className="good">✓ {t('ui.perk.owned')}</span>
                  ) : st === 'locked' ? (
                    <span className="faint">{t('ui.perk.requires', { name: t(`ui.perk.${p.requires}`) })}</span>
                  ) : (
                    <button className="btn sm" disabled={st !== 'available'} onClick={() => mutate((s) => (buyPerk(s, p.id) ? undefined : notify('—')))}>
                      {t('ui.perk.buy')}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}

function ClubTab() {
  const g = useGameState();
  const { openPlayer, openClub } = useGame();
  const club = g.clubs[g.userClubId as string];
  const legends = clubLegends(g, club.id, 8);
  const rec = clubRecords(g);
  const rivals = rivalsOf(g, club.id, 3);
  const matchLine = (m: typeof rec.biggestWin) =>
    m ? `${g.clubs[m.homeId].name} ${m.result.homeGoals}–${m.result.awayGoals} ${g.clubs[m.awayId].name} · ${formatGameDate(m.season, m.day)}` : '—';
  return (
    <div className="grid c-main" style={{ alignItems: 'start' }}>
      <Panel title={t('ui.club.legends')}>
        {legends.length === 0 && <p className="dim">{t('ui.club.noLegends')}</p>}
        <div className="cards-grid">
          {legends.slice(0, 6).map((l) => {
            const p = g.players[l.playerId];
            return <FcCard key={l.playerId} p={p} club={club} size="md" badge={isLegend(l) ? t('ui.club.legend') : undefined} onClick={() => openPlayer(l.playerId)} />;
          })}
        </div>
        {legends.map((l) => (
          <div key={l.playerId} className="row nw link" style={{ fontSize: 13, padding: '3px 0' }} onClick={() => openPlayer(l.playerId)}>
            <span className="ellipsis">{fullName(g.players[l.playerId])}</span>
            <span className="spacer" />
            <span className="faint">{t('ui.club.legendLine', { a: l.apps, g: l.goals, s: l.assists })}</span>
          </div>
        ))}
      </Panel>
      <div className="grid">
        <Panel title={t('ui.club.records')}>
          <div className="week-card">
            <div className="week-item">
              <span className="ico">🔥</span>
              <span>{t('ui.club.recWin', { n: rec.longestWinStreak })}</span>
            </div>
            <div className="week-item">
              <span className="ico">🛡</span>
              <span>{t('ui.club.recUnbeaten', { n: rec.longestUnbeaten })}</span>
            </div>
            <div className="week-item">
              <span className="ico">💥</span>
              <span>{t('ui.club.recBiggest', { m: matchLine(rec.biggestWin) })}</span>
            </div>
            <div className="week-item">
              <span className="ico">⚽</span>
              <span>{t('ui.club.recGoals', { m: matchLine(rec.highestScoring) })}</span>
            </div>
            <div className="week-item">
              <span className="ico">😬</span>
              <span>{t('ui.club.recWorst', { m: matchLine(rec.heaviestLoss) })}</span>
            </div>
          </div>
        </Panel>
        <Panel title={t('ui.club.rivals')}>
          {rivals.map((id) => (
            <div key={id} className="row nw link" style={{ padding: '4px 0' }} onClick={() => openClub(id)}>
              <Crest club={g.clubs[id]} size={22} />
              <span className="ellipsis">{g.clubs[id].name}</span>
            </div>
          ))}
        </Panel>
      </div>
    </div>
  );
}
