// Backroom staff (FIFA Manager / EA FC): hire and fire coaches, physios, analysts and youth scouts.
import {
  COUNTRIES,
  STAFF_LIMITS,
  STAFF_ROLES,
  academyCoachBoost,
  clubStaff,
  coachingFactor,
  countryName,
  fireStaff,
  formatMoney,
  hireStaff,
  physioBoost,
  roleQuality,
  t,
  weeklyStaffCost,
  type StaffMember,
  type StaffRole,
} from '@pitchside/core';
import { useState } from 'react';
import { Attr, Flag, Meter, Panel, Stat, ViewHead } from '../components/ui';
import { pct } from '../lib/labels';
import { useGame, useGameState } from '../store/game';

export function Staff() {
  const g = useGameState();
  const { mutate, notify } = useGame();
  const club = g.clubs[g.userClubId as string];
  const staff = clubStaff(g, club);
  const [role, setRole] = useState<StaffRole | 'all'>('all');
  const market = g.staffMarket
    .map((id) => g.staff[id])
    .filter((m): m is StaffMember => !!m && !m.clubId && (role === 'all' || m.role === role))
    .sort((a, b) => b.ability - a.ability);

  const fire = (m: StaffMember) => {
    if (!window.confirm(t('ui.staff.fireConfirm', { name: `${m.firstName} ${m.lastName}` }))) return;
    const comp = mutate((s) => fireStaff(s, club, m.id));
    notify(t('ui.staff.fired', { amount: comp }));
  };
  const hire = (m: StaffMember) => {
    try {
      mutate((s) => hireStaff(s, club, m.id));
      notify(t('ui.staff.hired', { name: `${m.firstName} ${m.lastName}` }));
    } catch (e) {
      notify(t((e as Error).message));
    }
  };

  return (
    <>
      <ViewHead title={t('ui.nav.staff')} meta={t('ui.staff.meta', { n: staff.length, wages: weeklyStaffCost(g, club) })} />
      <div className="grid c4" style={{ marginBottom: 12 }}>
        <Panel>
          <Stat k={t('ui.staff.coaching')} v={pct(coachingFactor(g, club, false))} />
        </Panel>
        <Panel>
          <Stat k={t('ui.staff.gkCoaching')} v={pct(coachingFactor(g, club, true))} />
        </Panel>
        <Panel>
          <Stat k={t('ui.staff.medical')} v={`${Math.round(physioBoost(g, club) * 100)}`} />
        </Panel>
        <Panel>
          <Stat k={t('ui.staff.academy')} v={pct(academyCoachBoost(g, club))} />
        </Panel>
      </div>
      <div className="grid c2">
        <Panel title={t('ui.staff.current')} flush>
          {STAFF_ROLES.map((r) => {
            const members = staff.filter((m) => m.role === r);
            return (
              <div key={r} style={{ borderBottom: '1px solid var(--line)', padding: '6px 10px' }}>
                <div className="row" style={{ fontSize: 12 }}>
                  <span className="b">{t(`staff.role.${r}`)}</span>
                  <span className="faint">
                    {members.length}/{STAFF_LIMITS[r]}
                  </span>
                  <span className="spacer" />
                  <span className="faint">{t('ui.staff.quality', { n: Math.round(roleQuality(g, club, r)) })}</span>
                  <div style={{ width: 80 }}>
                    <Meter value={roleQuality(g, club, r)} />
                  </div>
                </div>
                {members.map((m) => (
                  <div key={m.id} className="row" style={{ padding: '4px 0', fontSize: 13, flexWrap: 'wrap', minWidth: 0 }}>
                    <Flag code={m.nationality} size={16} />
                    <span className="ellipsis">
                      {m.firstName} {m.lastName}
                    </span>
                    <span className="faint">{t('ui.ageN', { n: m.age })}</span>
                    {r === 'youthScout' && (
                      <select style={{ maxWidth: 150, minWidth: 0 }} value={m.region ?? club.countryCode} onChange={(e) => mutate(() => (m.region = e.target.value))} title={t('ui.staff.region')}>
                        {[...COUNTRIES]
                          .sort((a, b) => countryName(a.code).localeCompare(countryName(b.code)))
                          .map((c) => (
                            <option key={c.code} value={c.code}>
                              {countryName(c.code)}
                            </option>
                          ))}
                      </select>
                    )}
                    <span className="spacer" />
                    <Attr v={m.ability} />
                    <span className="faint" style={{ width: 64, textAlign: 'right' }}>
                      {formatMoney(m.wage)}
                    </span>
                    <span className="faint" style={{ fontSize: 11 }}>
                      {t('ui.juneN', { n: m.contractUntil + 1 })}
                    </span>
                    <button className="btn sm ghost" onClick={() => fire(m)}>
                      {t('ui.staff.fire')}
                    </button>
                  </div>
                ))}
                {members.length === 0 && <div className="faint" style={{ fontSize: 12 }}>{t('ui.staff.vacant')}</div>}
              </div>
            );
          })}
        </Panel>
        <Panel
          title={t('ui.staff.market', { n: market.length })}
          flush
          actions={
            <select value={role} onChange={(e) => setRole(e.target.value as StaffRole | 'all')}>
              <option value="all">{t('ui.all')}</option>
              {STAFF_ROLES.map((r) => (
                <option key={r} value={r}>
                  {t(`staff.role.${r}`)}
                </option>
              ))}
            </select>
          }
        >
          <div style={{ maxHeight: 640, overflow: 'auto' }}>
            {market.length === 0 && <div className="dim" style={{ padding: 12 }}>{t('ui.staff.noMarket')}</div>}
            {market.map((m) => {
              const full = staff.filter((s) => s.role === m.role).length >= STAFF_LIMITS[m.role];
              return (
                <div key={m.id} className="row nw" style={{ padding: '6px 10px', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
                  <Flag code={m.nationality} size={16} />
                  <div style={{ minWidth: 0 }}>
                    <div className="ellipsis b">
                      {m.firstName} {m.lastName}
                    </div>
                    <div className="faint" style={{ fontSize: 11 }}>
                      {t(`staff.role.${m.role}`)} · {t('ui.ageN', { n: m.age })}
                    </div>
                  </div>
                  <span className="spacer" />
                  <Attr v={m.ability} />
                  <span className="faint" style={{ width: 70, textAlign: 'right' }}>
                    {formatMoney(m.wage)}/{t('ui.weekShort')}
                  </span>
                  <button className="btn sm acc" disabled={full} title={full ? t('staff.limit') : undefined} onClick={() => hire(m)}>
                    {t('ui.staff.hire')}
                  </button>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>
    </>
  );
}
