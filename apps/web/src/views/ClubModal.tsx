import {
  COUNTRY_BY_CODE,
  clubPlayers,
  computeTable,
  countryName,
  describeFormation,
  displayName,
  formatMoney,
  fullName,
  intlLocale,
  managerName,
  nearestPreset,
  overall,
  squadStrength,
  t,
  visibleAttributes,
} from '@pitchside/core';
import { Crest, Face, Flag, OvrChip, Panel, PosBadge, Stat, StatGrid } from '../components/ui';
import { displayValue } from '../lib/value';
import { useGame } from '../store/game';

export function ClubModal({ id }: { id: string }) {
  const g = useGame((s) => s.game);
  useGame((s) => s.version);
  const { openClub, openPlayer, openCountry } = useGame();
  if (!g) return null;
  const club = g.clubs[id];
  if (!club) return null;
  const league = g.leagues[club.leagueId];
  const table = computeTable(league);
  const pos = table.findIndex((r) => r.clubId === id) + 1;
  const manager = club.managerId ? g.managers[club.managerId] : null;
  const players = clubPlayers(g, id).filter((p) => !p.academy);
  const mine = id === g.userClubId;
  const known = (pid: string) => mine || !!visibleAttributes(g, pid);
  const country = COUNTRY_BY_CODE[club.countryCode];
  const cupWins = Object.values(g.cups).flatMap((c) => c.history.filter((h) => h.clubId === id).map((h) => ({ season: h.season, name: displayName(c.name) })));
  const contWins = Object.values(g.continental).flatMap((c) => c.history.filter((h) => h.clubId === id).map((h) => ({ season: h.season, name: displayName(c.name) })));
  const titles = [...league.champions.filter((c) => c.clubId === id).map((c) => ({ season: c.season, name: displayName(league.name) })), ...cupWins, ...contWins].sort((a, b) => b.season - a.season);

  return (
    <div className="modal-back" onClick={() => openClub(null)}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ ['--club-1' as string]: club.colors[0] }}>
        <div className="modal-hero">
          <Crest club={club} size={96} />
          <div style={{ minWidth: 0 }}>
            <div className="big">{club.name}</div>
            <div className="row dim" style={{ marginTop: 6, flexWrap: 'wrap' }}>
              <span className="row nw link" onClick={() => openCountry(club.countryCode)}>
                <Flag code={club.countryCode} size={18} /> {countryName(club.countryCode)}
              </span>
              <span>·</span>
              <span>{displayName(league.name)}</span>
              <span>·</span>
              <span>{t('ui.ordinal', { n: pos })}</span>
              {club.founded && <span>· {t('ui.club.founded', { n: club.founded })}</span>}
              {club.city && <span>· {club.city}</span>}
              <span className={`tag ${club.source === 'real' ? 'good' : club.source === 'custom' ? 'acc' : ''}`}>{t(`ui.source.${club.source}`)}</span>
            </div>
          </div>
          <div className="spacer" />
          <button className="btn" onClick={() => openClub(null)}>
            {t('ui.close')}
          </button>
        </div>
        <div className="modal-body">
          <div className="grid c4" style={{ marginBottom: 12 }}>
            <Panel>
              <Stat k={t('ui.club.level')} v={<OvrChip v={squadStrength(players)} />} />
            </Panel>
            <Panel>
              <Stat k={t('ui.club.reputation')} v={club.reputation} />
            </Panel>
            <Panel>
              <Stat k={club.stadium.name} v={club.stadium.capacity.toLocaleString(intlLocale())} />
            </Panel>
            <Panel>
              <Stat k={t('ui.club.squadValue')} v={club.id === g.userClubId ? formatMoney(players.reduce((s, p) => s + (displayValue(g, p) ?? 0), 0)) : '?'} />
            </Panel>
          </div>
          <div className="grid c-main">
            <Panel title={t('ui.club.squad', { n: players.length })} flush>
              <StatGrid
                rows={players}
                rowKey={(p) => p.id}
                onOpen={(p) => openPlayer(p.id)}
                initialSort={{ key: 'pos', dir: 1 }}
                maxHeight="52vh"
                columns={[
                  { key: 'f', label: '', render: (p) => <Face player={p} club={club} size={26} /> },
                  { key: 'pos', label: t('ui.col.pos'), render: (p) => <PosBadge pos={p.position} />, sort: (p) => 'GK RB CB LB DM CM AM RW LW ST'.indexOf(p.position) },
                  { key: 'n', label: t('ui.col.player'), render: (p) => <span className="link b" onClick={() => openPlayer(p.id)}>{fullName(p)}</span>, sort: (p) => p.lastName },
                  { key: 'nat', label: '', render: (p) => <Flag code={p.nationality} size={16} /> },
                  { key: 'age', label: t('ui.col.age'), num: true, render: (p) => p.age, sort: (p) => p.age },
                  { key: 'ovr', label: t('ui.col.ovr'), num: true, render: (p) => (known(p.id) ? <OvrChip v={overall(p)} /> : <span className="faint">?</span>), sort: (p) => (known(p.id) ? overall(p) : 0) },
                  { key: 'val', label: t('ui.col.value'), num: true, render: (p) => { const v = displayValue(g, p); return v === null ? <span className="faint">?</span> : formatMoney(v); }, sort: (p) => displayValue(g, p) ?? 0 },
                ]}
              />
            </Panel>
            <div className="grid" style={{ alignContent: 'start' }}>
              <Panel title={t('ui.club.manager')}>
                {manager ? (
                  <>
                    <div className="b" style={{ fontSize: 16 }}>
                      <Flag code={manager.nationality} size={16} /> {managerName(manager)}
                    </div>
                    <div className="dim" style={{ fontSize: 13 }}>
                      {t('ui.club.mgrInfo', { style: t(`ui.style.${manager.preferredStyle}`), formation: manager.preferredFormation, adapt: manager.adaptability })}
                    </div>
                  </>
                ) : (
                  <span className="dim">{t('ui.club.vacant')}</span>
                )}
                <div className="dim" style={{ fontSize: 13, marginTop: 8 }}>
                  {t('ui.club.plays', { style: t(`ui.style.${nearestPreset(club.tactic.tactic.sliders)}`), formation: describeFormation(club.tactic.tactic.slots) })}
                </div>
              </Panel>
              <Panel title={t('ui.club.economy')}>
                {(
                  [
                    ['market', `${countryName(country.code)} · ×${country.econ}`],
                    ['transferBudget', formatMoney(club.finances.transferBudget)],
                    ['wageBill', formatMoney(players.reduce((s, p) => s + (p.contract?.wage ?? 0), 0))],
                    ['facilities', `${club.youthFacilities} / ${club.trainingFacilities}`],
                    ['fans', club.fans ? `${Math.round(club.fans.satisfaction)}% · ${club.fans.members.toLocaleString(intlLocale())}` : '–'],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="row" style={{ fontSize: 13 }}>
                    <span className="dim">{t(`ui.club.${k}`)}</span>
                    <span className="spacer" />
                    {v}
                  </div>
                ))}
              </Panel>
              <Panel title={t('ui.club.honours')}>
                {titles.map((x, i) => (
                  <div key={i} className="row">
                    <span className="tag warn">{x.season}</span> {x.name}
                  </div>
                ))}
                {titles.length === 0 && <span className="dim">{t('ui.club.noTitles')}</span>}
              </Panel>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
