// Manager career (FIFA Manager / EA FC): reputation, job offers, resignation, trophy cabinet,
// history, achievements — plus game settings and save management.
import {
  Rng,
  acceptJob,
  countryName,
  displayName,
  formatGameDate,
  managerName,
  resign,
  t,
  userManager,
} from '@pitchside/core';
import { Avatar } from '../components/Avatar';
import { Crest, Flag, Meter, Panel, Stat, ViewHead } from '../components/ui';
import { useGame, useGameState } from '../store/game';

const ACHIEVEMENTS = [
  'firstWin', 'bigWin', 'giantKiller', 'firstTrophy', 'tenTrophies', 'leagueTitle', 'promotionTitle', 'promotion', 'cupWin', 'continental', 'goldenBall', 'youthProduct', 'nationalTeam', 'smallLeagueChampion',
  'hatTrick', 'comeback', 'derbyWin', 'winStreak5', 'unbeaten10', 'firstSigning', 'bigSigning', 'growthPlanDone', 'perkBought', 'passTier10', 'deadlineDeal', 'deadlineSprint', 'deadlineHero', 'goodNose', 'legendMade',
];

function competitionLabel(g: ReturnType<typeof useGameState>, id: string): string {
  if (g.leagues[id]) return displayName(g.leagues[id].name);
  if (g.cups[id]) return displayName(g.cups[id].name);
  if (g.continental[id]) return displayName(g.continental[id].name);
  return id;
}

export function Career() {
  const g = useGameState();
  const { mutate, notify, openClub } = useGame();
  const m = userManager(g);
  if (!m) return null;
  const club = m.clubId ? g.clubs[m.clubId] : null;
  const unlocked = new Map(g.achievements.map((a) => [a.id, a]));

  return (
    <>
      <ViewHead title={t('ui.nav.career')} meta={club ? t('ui.career.meta', { club: club.name }) : t('ui.unemployed')} />
      <div className="grid c4" style={{ marginBottom: 12 }}>
        <Panel>
          <div className="row nw">
            <Avatar index={m.avatar ?? 0} size={64} />
            <div style={{ minWidth: 0 }}>
              <div className="disp ellipsis" style={{ fontSize: 22 }}>
                {managerName(m)}
              </div>
              <div className="dim row nw" style={{ fontSize: 12 }}>
                <Flag code={m.nationality} size={16} /> {countryName(m.nationality)} · {t('ui.ageN', { n: m.age })}
              </div>
            </div>
          </div>
        </Panel>
        <Panel>
          <Stat k={t('ui.career.reputation')} v={m.reputation} />
          <Meter value={m.reputation} />
        </Panel>
        <Panel>
          <Stat k={t('ui.career.trophies')} v={m.trophies.length} />
        </Panel>
        <Panel>
          <Stat k={t('ui.career.achievements')} v={`${g.achievements.length}/${ACHIEVEMENTS.length}`} />
        </Panel>
      </div>
      <div className="grid c3">
        <div className="grid" style={{ alignContent: 'start' }}>
          <Panel title={t('ui.career.offers', { n: g.jobOffers.length })} flush>
            {g.jobOffers.length === 0 && <div className="dim" style={{ padding: 12 }}>{club ? t('ui.career.noOffers') : t('ui.career.waiting')}</div>}
            {g.jobOffers.map((o) => {
              const oc = o.clubId ? g.clubs[o.clubId] : null;
              return (
                <div key={o.id} className="row nw" style={{ padding: '10px 12px', borderBottom: '1px solid var(--line)' }}>
                  {oc ? <Crest club={oc} size={34} /> : <Flag code={o.nationalTeam ?? ''} size={34} />}
                  <div style={{ minWidth: 0 }}>
                    <div className="b ellipsis link" onClick={() => oc && openClub(oc.id)}>
                      {oc ? oc.name : t('ui.career.nationalTeam', { team: countryName(o.nationalTeam ?? '') })}
                    </div>
                    <div className="faint" style={{ fontSize: 12 }}>
                      {oc ? `${displayName(g.leagues[oc.leagueId].name)} · ${t('ui.repN', { n: oc.reputation })}` : t('ui.career.ntHint')} · {t('ui.career.expires', { n: Math.max(0, o.expiresDay - g.day) })}
                    </div>
                  </div>
                  <span className="spacer" />
                  <button
                    className="btn sm acc"
                    onClick={() => {
                      if (oc && club && !window.confirm(t('ui.career.acceptConfirm', { club: oc.name }))) return;
                      mutate((s) => acceptJob(s, o.id, new Rng(s.rngState ^ 0x10b)));
                      notify(oc ? t('ui.career.welcome', { club: oc.name }) : t('ui.career.ntAccepted'));
                      useGame.setState({ view: 'hub' });
                    }}
                  >
                    {t('ui.accept')}
                  </button>
                  <button className="btn sm ghost" onClick={() => mutate((s) => (s.jobOffers = s.jobOffers.filter((x) => x.id !== o.id)))}>
                    {t('ui.reject')}
                  </button>
                </div>
              );
            })}
          </Panel>
          {club && (
            <Panel title={t('ui.career.current')}>
              <div className="row nw link" onClick={() => openClub(club.id)}>
                <Crest club={club} size={40} />
                <div>
                  <div className="b">{club.name}</div>
                  <div className="faint" style={{ fontSize: 12 }}>
                    {t('ui.career.confidence', { n: Math.round(club.boardConfidence) })}
                  </div>
                </div>
              </div>
              {m.nationalTeam && (
                <div className="row nw" style={{ marginTop: 8 }}>
                  <Flag code={m.nationalTeam} size={28} /> <span className="b">{t('ui.career.nationalTeam', { team: countryName(m.nationalTeam) })}</span>
                </div>
              )}
              <button
                className="btn danger"
                style={{ marginTop: 10 }}
                onClick={() => {
                  if (!window.confirm(t('ui.career.resignConfirm', { club: club.name }))) return;
                  mutate((s) => resign(s, new Rng(s.rngState ^ 0x2e5)));
                  notify(t('ui.career.resigned'));
                }}
              >
                {t('ui.career.resign')}
              </button>
            </Panel>
          )}
          <Panel title={t('ui.career.attributes')}>
            {(
              [
                ['tacticalKnowledge', m.tacticalKnowledge],
                ['manManagement', m.manManagement],
                ['mediaHandling', m.mediaHandling],
                ['adaptability', m.adaptability],
                ['pressRelation', m.pressRelation],
              ] as const
            ).map(([k, v]) => (
              <div key={k}>
                <div className="row" style={{ fontSize: 12 }}>
                  <span className="dim">{t(`ui.career.attr.${k}`)}</span>
                  <span className="spacer" />
                  <span className="b">{Math.round(v)}</span>
                </div>
                <Meter value={v} />
              </div>
            ))}
          </Panel>
        </div>
        <div className="grid" style={{ alignContent: 'start' }}>
          <Panel title={t('ui.career.cabinet')}>
            {m.trophies.length === 0 && <span className="dim">{t('ui.career.noTrophies')}</span>}
            <div className="cabinet">
              {[...m.trophies].reverse().map((tr, i) => (
                <div key={i} className="trophy">
                  <div className="cup">🏆</div>
                  <div className="b ellipsis">{competitionLabel(g, tr.competition)}</div>
                  <div className="faint" style={{ fontSize: 11 }}>
                    {tr.season} · {tr.clubId ? g.clubs[tr.clubId]?.shortName : ''}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title={t('ui.career.history')} flush>
            {m.history.length === 0 && <div className="dim" style={{ padding: 12 }}>{t('ui.career.noHistory')}</div>}
            {[...m.history].reverse().map((h, i) => (
              <div key={i} className="row nw" style={{ padding: '6px 10px', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
                <span className="tag">{h.season}</span>
                {g.clubs[h.clubId] && <Crest club={g.clubs[h.clubId]} size={18} />}
                <span className="ellipsis">{g.clubs[h.clubId]?.name}</span>
                <span className="spacer" />
                <span className="faint">{g.leagues[h.leagueId] ? displayName(g.leagues[h.leagueId].name) : ''}</span>
                <span className="b">{t('ui.ordinal', { n: h.position })}</span>
              </div>
            ))}
          </Panel>
        </div>
        <div className="grid" style={{ alignContent: 'start' }}>
          <Panel title={t('ui.career.achievements')} flush>
            {ACHIEVEMENTS.map((id) => {
              const a = unlocked.get(id);
              return (
                <div key={id} className={`ach ${a ? 'on' : ''}`}>
                  <div className="medal">{a ? '★' : '☆'}</div>
                  <div style={{ minWidth: 0 }}>
                    <div className="b">{t(`ach.${id}.t`)}</div>
                    <div className="faint" style={{ fontSize: 12 }}>
                      {t(`ach.${id}.d`)}
                      {a ? ` · ${formatGameDate(a.season, a.day)}` : ''}
                    </div>
                  </div>
                </div>
              );
            })}
          </Panel>
          <Panel title={t('ui.nav.settings')}>
            <button className="btn" onClick={() => useGame.setState({ view: 'settings' })}>
              {t('ui.nav.settings')} →
            </button>
          </Panel>
        </div>
      </div>
    </>
  );
}
