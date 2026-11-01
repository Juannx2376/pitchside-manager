import {
  GOALKEEPING,
  HIDDEN_KEYS,
  MENTAL,
  PHYSICAL,
  Rng,
  TACTICAL_POSITIONS,
  TACTICAL_POSITION_BASE,
  TACTICAL_STYLES,
  TECHNICAL,
  ZONE_GRID,
  ZONE_HEIGHTS,
  ZONE_LANES,
  countryName,
  exerciseBuyOption,
  formatMoney,
  growthProfileOf,
  fullName,
  ovrBreakdown,
  overall,
  overallAt,
  playerExpectations,
  positionName,
  positionShort,
  releasePlayer,
  renewContract,
  startEnquiry,
  startPlayerAnalysis,
  styleFit,
  t,
  talkToPlayer,
  tm,
  visibleAttributes,
  type AttrKey,
  type PlayerTalk,
  type ScoutReport,
  type TacticalPosition,
} from '@pitchside/core';
import { useState, type ReactNode } from 'react';
import { GrowthPlanPanel } from '../components/GrowthPlanPanel';
import { Pitch } from '../components/Pitch';
import { Spark } from '../components/Spark';
import { AttrBar, Crest, Face, Flag, Meter, OvrChip, Panel, PosBadge, SubTabs } from '../components/ui';
import { pct } from '../lib/labels';
import { displayValue } from '../lib/value';
import { useGame } from '../store/game';
import '../tactics.css';

/** Las 27 posiciones de la rejilla V2, con su carril y altura para dibujar el mapa. */
const POSITION_ZONES: { pos: TacticalPosition; lane: number; height: number }[] = TACTICAL_POSITIONS.map((pos) => ({ pos, ...ZONE_GRID[pos] }));

/** Color de eficacia (rojo ≈ 45 → verde ≈ 85) para el mapa de adaptabilidad. */
function ovrColor(v: number): string {
  const k = Math.max(0, Math.min(1, (v - 45) / 40));
  return `hsl(${Math.round(120 * k)} 58% 38%)`;
}

/** One talk per player per week (persisted only for the session). */
const lastTalk = new Map<string, string>();

function hiddenWord(v: number): string {
  if (v >= 80) return t('ui.level.veryHigh');
  if (v >= 62) return t('ui.level.high');
  if (v >= 40) return t('ui.level.medium');
  if (v >= 22) return t('ui.level.low');
  return t('ui.level.veryLow');
}

const TALKS: PlayerTalk[] = ['praise', 'criticise', 'reassure', 'promiseStarter', 'promiseMinutes', 'promiseContract'];

export function PlayerModal({ id }: { id: string }) {
  const g = useGame((s) => s.game);
  useGame((s) => s.version);
  const { openPlayer, openClub, mutate, notify, setView } = useGame();
  const [wage, setWage] = useState<number | null>(null);
  const [tab, setTab] = useState<'attributes' | 'positions' | 'medical' | 'analysis' | 'career' | 'growth'>('attributes');
  const [scoutId, setScoutId] = useState('');
  if (!g) return null;
  const p = g.players[id];
  if (!p) return null;
  const club = p.clubId ? g.clubs[p.clubId] : null;
  const userClub = g.userClubId ? g.clubs[g.userClubId] : null;
  const mine = !!userClub && p.clubId === userClub.id;
  const loanedToUs = !!userClub && !!p.loan && p.clubId === userClub.id;
  const vis = visibleAttributes(g, id);
  const attrs = vis?.attrs;
  const margin = vis?.margin ?? 0;
  const ex = mine && userClub ? playerExpectations(g, p, userClub) : null;
  const shortlisted = g.shortlist.includes(id);
  const shownOvr = attrs ? overall({ ...p, attrs }) : null;
  const shownValue = displayValue(g, p);
  const report: ScoutReport | undefined = Object.values(g.scoutReports)
    .filter((r) => r.playerId === id && r.analysis)
    .sort((a, b) => b.season * 400 + b.day - (a.season * 400 + a.day))[0];
  const running = Object.values(g.scoutAssignments).find((a) => a.kind === 'player' && a.targetPlayerId === id && !a.done && a.clubId === userClub?.id);
  const scouts = userClub ? userClub.scoutIds.map((sid) => g.scouts[sid]).filter(Boolean) : [];
  const busy = new Set(Object.values(g.scoutAssignments).filter((a) => !a.done).map((a) => a.scoutId));
  const weekKey = `${g.season}-${Math.floor(g.day / 7)}`;

  const group = (title: string, keys: readonly AttrKey[]) => (
    <Panel title={title}>
      {attrs ? (
        keys.map((k) => <AttrBar key={k} label={t(`attr.${k}`)} v={attrs[k]} margin={margin} />)
      ) : (
        <p className="dim" style={{ margin: 0 }}>
          {t('ui.player.noReport')}
        </p>
      )}
    </Panel>
  );

  const renew = () => {
    if (!ex || !userClub) return;
    const offer = { wage: wage ?? ex.idealWage, years: ex.years, releaseClause: null, goalBonus: 0, cleanSheetBonus: 0, signingBonus: 0, agentFee: ex.agentFee };
    const r = mutate((s) => renewContract(s, userClub.id, p.id, offer));
    notify(tm(r.message));
    if (r.counter) setWage(r.counter.wage);
  };
  const talk = (k: PlayerTalk) => {
    if (lastTalk.get(id) === weekKey) {
      notify(t('ui.player.talkedAlready'));
      return;
    }
    lastTalk.set(id, weekKey);
    const m = mutate((s) => talkToPlayer(s, id, k, new Rng((s.rngState ^ s.day ^ id.length) >>> 0)));
    notify(tm(m));
  };
  const negotiate = (kind: 'transfer' | 'loan') => {
    if (!userClub) return;
    try {
      mutate((s) => startEnquiry(s, p.id, userClub.id, kind));
      openPlayer(null);
      setView('transfers');
    } catch (e) {
      notify(t((e as Error).message));
    }
  };
  const analyse = () => {
    if (!userClub || !scoutId) return;
    try {
      mutate((s) => startPlayerAnalysis(s, { scoutId, clubId: userClub.id, playerId: id }));
      notify(t('ui.player.analysisStarted'));
    } catch (e) {
      notify(t((e as Error).message));
    }
  };

  return (
    <div className="modal-back" onClick={() => openPlayer(null)}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ ['--club-1' as string]: club?.colors[0] ?? '#333' }}>
        <div className="modal-hero">
          <Face player={p} club={club} size={110} />
          <div style={{ minWidth: 0 }}>
            <div className="row" style={{ gap: 8 }}>
              <PosBadge pos={p.position} />
              <span className="dim">{positionName(p.position)}</span>
              {p.secondaryPositions.length > 0 && <span className="faint">· {p.secondaryPositions.map(positionShort).join(' · ')}</span>}
            </div>
            <div className="big">{fullName(p)}</div>
            <div className="row dim" style={{ marginTop: 6 }}>
              <Flag code={p.nationality} size={18} />
              <span>{countryName(p.nationality)}</span>
              <span>· {t('ui.player.bio', { age: p.age, cm: p.heightCm, foot: t(`ui.foot.${p.foot}`) })}</span>
              {p.caps ? <span>· {t('ui.player.caps', { n: p.caps, g: p.intGoals ?? 0 })}</span> : null}
            </div>
            <div className="row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
              {club ? (
                <span className="row nw link" onClick={() => openClub(club.id)}>
                  <Crest club={club} size={22} /> <span className="b">{club.name}</span>
                </span>
              ) : (
                <span className="tag">{t('ui.freeAgent')}</span>
              )}
              {p.loan && <span className="tag">{t('ui.player.loanFrom', { club: g.clubs[p.loan.parentClubId]?.name ?? '?' })}</span>}
              <span className="tag">{shownValue === null ? t('ui.player.valueUnknown') : t('ui.player.value', { value: shownValue })}</span>
              {p.contract && <span className="tag">{t('ui.player.contract', { wage: p.contract.wage, year: p.contract.expiresSeason + 1 })}</span>}
              {p.source === 'real' && <span className="tag good">FC 26</span>}
              {p.source === 'curated' && <span className="tag warn" title={t('ui.player.estimatedHint')}>{t('ui.player.estimated')}</span>}
              {p.source === 'regen' && <span className="tag acc">{t('ui.player.regen')}</span>}
              {p.listed && <span className="tag warn">{t(`ui.listed.${p.listed}`)}</span>}
              {margin > 0 && <span className="tag warn">{t('ui.player.reportMargin', { n: margin })}</span>}
            </div>
          </div>
          <div className="spacer" />
          <div style={{ textAlign: 'center' }}>
            <div className="faint" style={{ fontSize: 11, letterSpacing: '0.12em' }}>
              {t('ui.col.ovr').toUpperCase()}
            </div>
            {shownOvr !== null ? (
              <div style={{ transform: 'scale(2)', transformOrigin: 'top center', margin: '4px auto 0', width: 60, height: 50, display: 'flex', justifyContent: 'center' }}>
                <OvrChip v={shownOvr} />
              </div>
            ) : (
              <div className="disp" style={{ fontSize: 40 }}>
                ??
              </div>
            )}
            {mine && (
              <div className="ovr-break" data-ovr-breakdown>
                {(() => {
                  const b = ovrBreakdown(p);
                  const row = (k: string, v: number) => (
                    <div key={k} className="row" style={{ fontSize: 11, gap: 6 }}>
                      <span className="faint">{t(`ui.dyn.${k}`)}</span>
                      <span className="spacer" />
                      <span className={v > 0.4 ? 'good b' : v < -0.4 ? 'bad b' : 'faint'}>{v > 0 ? `+${v}` : v}</span>
                    </div>
                  );
                  return (
                    <>
                      <div className="row" style={{ fontSize: 11 }}>
                        <span className="faint">{t('ui.dyn.base')}</span>
                        <span className="spacer" />
                        <span className="b">{b.base}</span>
                      </div>
                      {row('form', b.form)}
                      {row('morale', b.morale)}
                      {row('readiness', b.readiness)}
                      <div className="row" style={{ fontSize: 12, borderTop: '1px solid var(--line)', marginTop: 3, paddingTop: 3 }}>
                        <span className="dim">{t('ui.dyn.today')}</span>
                        <span className="spacer" />
                        <span className="b">{b.total}</span>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
          </div>
          <button className="btn" onClick={() => openPlayer(null)}>
            {t('ui.close')}
          </button>
        </div>
        <div className="modal-body">
          <SubTabs
            tabs={[
              { id: 'attributes', label: t('ui.player.tab.attributes') },
              { id: 'positions', label: t('ui.player.tab.positions') },
              { id: 'medical', label: t('ui.player.tab.medical') },
              { id: 'analysis', label: report ? t('ui.player.tab.analysisReady') : t('ui.player.tab.analysis') },
              { id: 'career', label: t('ui.player.tab.career') },
              ...(mine && !p.academy ? [{ id: 'growth' as const, label: t('ui.player.tab.growth') }] : []),
            ]}
            value={tab}
            onChange={setTab}
          />
          {tab === 'growth' && mine && <GrowthPlanPanel p={p} />}
          {tab === 'attributes' && (
            <div className="grid c4">
              {group(t('ui.squad.technical'), TECHNICAL)}
              {group(t('ui.squad.physical'), PHYSICAL)}
              {group(t('ui.squad.mental'), MENTAL)}
              <div className="grid" style={{ alignContent: 'start' }}>
                {p.position === 'GK' && group(t('ui.player.goalkeeping'), GOALKEEPING)}
                <Panel title={t('ui.player.styleFamiliarity')}>
                  {TACTICAL_STYLES.map((s) => (
                    <div key={s} style={{ marginBottom: 6 }}>
                      <div className="row" style={{ fontSize: 12 }}>
                        <span className="dim">{t(`ui.style.${s}`)}</span>
                        <span className="spacer" />
                        {(mine || report) && <span className="b">{pct(styleFit(p, s))}</span>}
                      </div>
                      <Meter value={mine || margin ? p.styleFamiliarity[s] : 0} />
                    </div>
                  ))}
                </Panel>
                {mine && (
                  <Panel title={t('ui.player.staffReport')}>
                    {HIDDEN_KEYS.map((k) => (
                      <div key={k} className="row" style={{ fontSize: 13 }}>
                        <span className="dim">{t(`hidden.${k}`)}</span>
                        <span className="spacer" />
                        <span>{hiddenWord(p.hidden[k])}</span>
                      </div>
                    ))}
                    <div className="row" style={{ fontSize: 13 }}>
                      <span className="dim">{t('ui.player.potential')}</span>
                      <span className="spacer" />
                      <span className="b">{p.potential}</span>
                    </div>
                    {(p.ovrHistory?.length ?? 0) >= 2 && (
                      <div className="row" style={{ fontSize: 13 }}>
                        <span className="dim">{t('ui.player.evolution')}</span>
                        <span className="spacer" />
                        <Spark values={(p.ovrHistory ?? []).map((h) => h.ovr)} />
                      </div>
                    )}
                  </Panel>
                )}
              </div>
            </div>
          )}
          {tab === 'positions' && (
            <Panel title={t('ui.player.tab.positions')}>
              <p className="dim" style={{ marginTop: 0, fontSize: 12 }}>
                {t('ui.player.positionsHelp')}
              </p>
              <Pitch maxWidth={420} noLanes>
                {POSITION_ZONES.map(({ pos, lane, height }) => {
                  const ovr = Math.round(overallAt(p, TACTICAL_POSITION_BASE[pos]));
                  const natural = TACTICAL_POSITION_BASE[pos] === p.position;
                  const cx = 10 + (lane / (ZONE_LANES - 1)) * 80;
                  const cy = 10 + (height / (ZONE_HEIGHTS - 1)) * 80;
                  return (
                    <div
                      key={pos}
                      title={`${pos} · ${ovr}`}
                      className={`pos-cell ${natural ? 'natural' : ''}`}
                      style={{ left: `${cx}%`, top: `${cy}%`, background: ovrColor(ovr) }}
                    >
                      <b>{ovr}</b>
                      <i>{pos}</i>
                    </div>
                  );
                })}
              </Pitch>
              <div className="row" style={{ marginTop: 12, gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
                <span className="row nw" style={{ gap: 6 }}>
                  <PosBadge pos={p.position} />
                  <span className="dim">{t('ui.player.naturalPos')}</span>
                </span>
              </div>
            </Panel>
          )}
          {tab === 'medical' && (
            <Panel title={t('ui.player.tab.medical')} flush>
              {(p.injuryHistory ?? []).length === 0 ? (
                <p className="dim" style={{ padding: 12, margin: 0 }}>
                  {t('ui.player.medicalNone')}
                </p>
              ) : (
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>{t('ui.col.season')}</th>
                      <th>{t('ui.player.medicalInjury')}</th>
                      <th className="n">{t('ui.player.medicalDays')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...(p.injuryHistory ?? [])].reverse().map((r, i) => (
                      <tr key={`${r.season}-${r.type}-${i}`}>
                        <td>{r.season}</td>
                        <td>{t(`injury.${r.type}`)}</td>
                        <td className="n">{r.durationDays}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>
          )}
          {tab === 'analysis' && (
            <div className="grid c-main">
              {report?.analysis ? (
                <AnalysisReport report={report} />
              ) : (
                <Panel title={t('ui.player.tab.analysis')}>
                  <p className="dim" style={{ marginTop: 0 }}>
                    {t('ui.player.analysisHelp')}
                  </p>
                </Panel>
              )}
              <Panel title={t('ui.player.requestAnalysis')}>
                {mine ? (
                  <span className="dim">{t('ui.player.ownPlayer')}</span>
                ) : running ? (
                  <>
                    <div className="dim">{t('ui.player.analysisRunning', { scout: `${g.scouts[running.scoutId]?.firstName ?? ''} ${g.scouts[running.scoutId]?.lastName ?? ''}` })}</div>
                    <Meter value={(running.daysElapsed / running.durationDays) * 100} />
                    <div className="faint" style={{ fontSize: 12 }}>
                      {t('ui.player.daysLeft', { n: running.durationDays - running.daysElapsed })}
                    </div>
                  </>
                ) : (
                  <div className="grid">
                    <select value={scoutId} onChange={(e) => setScoutId(e.target.value)}>
                      <option value="">{t('ui.player.pickScout')}</option>
                      {scouts.map((s) => (
                        <option key={s.id} value={s.id} disabled={busy.has(s.id)}>
                          {s.firstName} {s.lastName} · {t('ui.player.knowledge', { n: Math.round(s.countryKnowledge[club?.countryCode ?? p.nationality] ?? 0) })}
                          {busy.has(s.id) ? ` · ${t('ui.busy')}` : ''}
                        </option>
                      ))}
                    </select>
                    <button className="btn primary" disabled={!scoutId} onClick={analyse}>
                      {t('ui.player.analyse')}
                    </button>
                  </div>
                )}
              </Panel>
            </div>
          )}
          {tab === 'career' && (
            <Panel title={t('ui.player.tab.career')} flush>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>{t('ui.col.season')}</th>
                    <th>{t('ui.col.club')}</th>
                    <th className="n">{t('ui.col.apps')}</th>
                    <th className="n">{t('ui.col.goals')}</th>
                    <th className="n">{t('ui.col.assists')}</th>
                    <th className="n">{t('ui.col.rating')}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{g.season}</td>
                    <td>{club?.name ?? '–'}</td>
                    <td className="n">{p.stats.apps}</td>
                    <td className="n">{p.stats.goals}</td>
                    <td className="n">{p.stats.assists}</td>
                    <td className="n">{p.stats.apps ? (p.stats.ratingSum / p.stats.apps).toFixed(2) : '–'}</td>
                  </tr>
                  {[...p.career].reverse().map((c) => (
                    <tr key={`${c.season}-${c.clubId}`}>
                      <td>{c.season}</td>
                      <td>{c.clubId ? g.clubs[c.clubId]?.name : '–'}</td>
                      <td className="n">{c.apps}</td>
                      <td className="n">{c.goals}</td>
                      <td className="n">{c.assists}</td>
                      <td className="n">{c.avgRating.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}
          <Panel title={t('ui.player.actions')} style={{ marginTop: 12 }}>
            {!userClub ? (
              <span className="dim">{t('ui.player.needClub')}</span>
            ) : mine && ex ? (
              <div className="grid c3">
                <div className="grid">
                  <div className="dim" style={{ fontSize: 13 }}>
                    {t('ui.player.agentAsks', { wage: ex.idealWage, years: ex.years, fee: ex.agentFee, happy: Math.round(p.happiness) })}
                  </div>
                  <div className="row">
                    <input type="number" value={wage ?? ex.idealWage} onChange={(e) => setWage(Number(e.target.value))} style={{ width: 130 }} />
                    <button className="btn primary" onClick={renew}>
                      {t('ui.player.renew')}
                    </button>
                  </div>
                  {loanedToUs && p.loan?.buyOption ? (
                    <button
                      className="btn acc"
                      onClick={() => {
                        const ok = mutate((s) => exerciseBuyOption(s, p.id));
                        notify(ok ? t('ui.player.optionExercised') : t('ui.player.optionFailed'));
                      }}
                    >
                      {t('ui.player.buyOption', { fee: p.loan.buyOption })}
                    </button>
                  ) : null}
                </div>
                <div className="grid">
                  <div className="faint" style={{ fontSize: 12 }}>
                    {t('ui.player.talk')}
                    {p.promise ? ` · ${t('ui.player.promiseActive', { kind: t(`ui.promise.${p.promise.kind}`) })}` : ''}
                  </div>
                  <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                    {TALKS.map((k) => (
                      <button key={k} className="btn sm" onClick={() => talk(k)}>
                        {t(`ui.talkTo.${k}`)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid">
                  {!p.loan && (
                    <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                      <button className={`btn sm ${p.listed === 'transfer' ? 'on' : ''}`} onClick={() => mutate(() => (p.listed = p.listed === 'transfer' ? null : 'transfer'))}>
                        {p.listed === 'transfer' ? t('ui.player.unlist') : t('ui.player.listTransfer')}
                      </button>
                      <button className={`btn sm ${p.listed === 'loan' ? 'on' : ''}`} onClick={() => mutate(() => (p.listed = p.listed === 'loan' ? null : 'loan'))}>
                        {p.listed === 'loan' ? t('ui.player.unlist') : t('ui.player.listLoan')}
                      </button>
                    </div>
                  )}
                  {!p.loan && (
                    <button
                      className="btn danger"
                      onClick={() => {
                        if (!window.confirm(t('ui.player.releaseConfirm', { p: fullName(p) }))) return;
                        const cost = mutate((s) => releasePlayer(s, userClub.id, p.id, true));
                        notify(t('ui.player.released', { amount: cost }));
                        openPlayer(null);
                      }}
                    >
                      {t('ui.player.release')}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="row" style={{ flexWrap: 'wrap' }}>
                <button className="btn primary" onClick={() => negotiate('transfer')}>
                  {p.clubId ? t('ui.player.negotiate') : t('ui.player.offerContract')}
                </button>
                {p.clubId && (
                  <button className="btn" onClick={() => negotiate('loan')}>
                    {t('ui.player.askLoan')}
                  </button>
                )}
                <button className="btn" onClick={() => setTab('analysis')}>
                  {t('ui.player.analyse')}
                </button>
                <button className="btn ghost" onClick={() => mutate((s) => (shortlisted ? (s.shortlist = s.shortlist.filter((x) => x !== id)) : s.shortlist.push(id)))}>
                  {shortlisted ? t('ui.player.unfollow') : t('ui.player.follow')}
                </button>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

// Informe de ojeo por fases (estilo FC 27): sin veredicto "ficha / evita"; la valoración llega DESPUÉS del fichaje.
export function AnalysisReport({ report }: { report: ScoutReport }) {
  const g = useGame((s) => s.game);
  if (!g || !report.analysis) return null;
  const a = report.analysis;
  const p = g.players[report.playerId];
  const me = g.userClubId ? g.clubs[g.userClubId] : null;
  const cmp = a.comparisonId ? g.players[a.comparisonId] : null;
  const scout = g.scouts[report.scoutId];
  const ex = p && me ? playerExpectations(g, p, me) : null;
  const profile = p ? growthProfileOf(p) : null;
  const lo = Math.max(1, report.estimatedOverall - report.errorMargin);
  const hi = Math.min(99, report.estimatedOverall + report.errorMargin);
  const phase = (key: string, icon: string, body: ReactNode) => (
    <div className="phase" data-phase={key}>
      <div className="phase-h">
        <span className="ic">{icon}</span>
        <span>{t(`ui.phase.${key}`)}</span>
      </div>
      {body}
    </div>
  );
  return (
    <Panel title={t('ui.analysis.title', { scout: scout ? `${scout.firstName} ${scout.lastName}` : '' })}>
      <div className="row" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 6 }}>
        <span className="tag">{t('ui.analysis.ovr', { lo, hi })}</span>
        <span className="tag">{t('ui.analysis.potential', { lo: report.potentialRange[0], hi: report.potentialRange[1] })}</span>
        <span className="tag">{t('ui.phase.margin', { n: report.errorMargin })}</span>
      </div>
      <div className="phases">
        {phase(
          'tactical',
          '🎯',
          <>
            <div className="row" style={{ fontSize: 13 }}>
              <span className="dim">{t('ui.analysis.tacticFit')}</span>
              <span className="spacer" />
              <span className="b">{a.tacticFit}%</span>
            </div>
            <Meter value={a.tacticFit} />
            <div className="row" style={{ gap: 4, margin: '8px 0' }}>
              {a.bestPositions.map((x) => (
                <PosBadge key={x} pos={x} />
              ))}
            </div>
            <div className="row" style={{ flexWrap: 'wrap', gap: 4 }}>
              {a.strengths.map((k) => (
                <span key={k} className="tag good">
                  {t(`attr.${k}`)}
                </span>
              ))}
              {a.weaknesses.map((k) => (
                <span key={k} className="tag bad">
                  {t(`attr.${k}`)}
                </span>
              ))}
            </div>
            {cmp && (
              <div className="row" style={{ fontSize: 13, marginTop: 8 }}>
                <span className="dim">{t('ui.analysis.vsStarter', { p: cmp.lastName })}</span>
                <span className="spacer" />
                <OvrChip v={a.comparisonOverall} />
              </div>
            )}
          </>,
        )}
        {phase(
          'future',
          '📈',
          <>
            <div className="row" style={{ fontSize: 13 }}>
              <span className="dim">{t('ui.analysis.potential', { lo: report.potentialRange[0], hi: report.potentialRange[1] })}</span>
            </div>
            {profile && (
              <div style={{ marginTop: 8 }}>
                <span className="tag acc">{t(`ui.profile.${profile}`)}</span>
                <p className="dim" style={{ fontSize: 12, margin: '6px 0 0' }}>
                  {t(`ui.profile.${profile}.d`)}
                </p>
              </div>
            )}
            {p && (
              <div className="faint" style={{ fontSize: 12, marginTop: 6 }}>
                {t('ui.ageN', { n: p.age })}
              </div>
            )}
          </>,
        )}
        {phase(
          'finance',
          '💶',
          <>
            <div className="row" style={{ fontSize: 13 }}>
              <span className="dim">{t('ui.analysis.maxFee')}</span>
              <span className="spacer" />
              <span className="b">{formatMoney(a.maxFee)}</span>
            </div>
            <div className="row" style={{ fontSize: 13 }}>
              <span className="dim">{t('ui.analysis.maxWage')}</span>
              <span className="spacer" />
              <span className="b">{formatMoney(a.maxWage)}</span>
            </div>
            {ex && (
              <>
                <div className="row" style={{ fontSize: 13, marginTop: 8 }}>
                  <span className="dim">{t('ui.phase.interest')}</span>
                  <span className="spacer" />
                  <span className="b">{ex.interest}%</span>
                </div>
                <Meter value={ex.interest} color={ex.interest >= 60 ? 'var(--good)' : ex.interest >= 30 ? 'var(--warn)' : 'var(--bad)'} />
              </>
            )}
          </>,
        )}
        {phase(
          'status',
          '🩺',
          <>
            {p && (
              <>
                <div className="row" style={{ fontSize: 13 }}>
                  <span className="dim">{t('ui.phase.happiness')}</span>
                  <span className="spacer" />
                  <span className="b">{hiddenWord(p.happiness)}</span>
                </div>
                <div className="row" style={{ fontSize: 13 }}>
                  <span className="dim">{t('ui.phase.contract')}</span>
                  <span className="spacer" />
                  <span className="b">{p.contract ? p.contract.expiresSeason + 1 : t('ui.freeAgent')}</span>
                </div>
                <div className="row" style={{ fontSize: 13 }}>
                  <span className="dim">{t('ui.phase.fitness')}</span>
                  <span className="spacer" />
                  <span className={p.injury ? 'bad b' : 'b'}>{p.injury ? t('ui.phase.injured') : `${Math.round(p.fitness)}%`}</span>
                </div>
              </>
            )}
            <div className="grid c2" style={{ gap: 4, marginTop: 8 }}>
              {HIDDEN_KEYS.map((k) => (
                <div key={k} className="row" style={{ fontSize: 12 }}>
                  <span className="dim ellipsis">{t(`hidden.${k}`)}</span>
                  <span className="spacer" />
                  <span className="stars">
                    {'★'.repeat(a.hidden[k])}
                    {'☆'.repeat(5 - a.hidden[k])}
                  </span>
                </div>
              ))}
            </div>
          </>,
        )}
      </div>
      <p className="dim" style={{ fontSize: 13, marginBottom: 0 }}>
        {tm(report.notes)}
      </p>
    </Panel>
  );
}
