// Finanzas del club: un Resumen sencillo (tres cifras, salud del club, compromisos) y, aparte, el detalle.
import {
  COUNTRY_BY_CODE,
  FPF_REGIMES,
  INCOME_CATEGORIES,
  LEDGER_CATEGORIES,
  PROJECTS,
  canBuild,
  clubPlayers,
  countryName,
  estimateSeasonRevenue,
  evaluateFPF,
  expansionSeats,
  facilityLevel,
  facilityUpkeepPerLevel,
  formatMoney,
  fullName,
  gameDate,
  intlLocale,
  loanRate,
  maxLoan,
  pendingCommitments,
  projectCost,
  rebalanceBudgets,
  repayLoanEarly,
  signSponsor,
  startProject,
  summarizeLedger,
  t,
  takeLoan,
  ticketDemandFactor,
  ticketPrice,
  tm,
  weeklyStadiumCost,
  weeklyStaffCost,
  weeklyWageBill,
  weeklyYouthCost,
  type ProjectType,
  type SponsorSlot,
} from '@pitchside/core';
import { useState } from 'react';
import { BarPairs, LineChart } from '../components/Charts';
import { Flag, Meter, Panel, Stat, SubTabs, ViewHead } from '../components/ui';
import { useGame, useGameState } from '../store/game';

type Tab = 'summary' | 'budget' | 'commercial' | 'stadium' | 'bank' | 'detail' | 'history';
const SLOTS: SponsorSlot[] = ['shirt', 'kit', 'stadium', 'sleeve'];
const PROJECT_TYPES = Object.keys(PROJECTS) as ProjectType[];

export function Finances() {
  const g = useGameState();
  const [tab, setTab] = useState<Tab>('summary');
  const club = g.clubs[g.userClubId as string];
  const country = COUNTRY_BY_CODE[club.countryCode];

  return (
    <>
      <ViewHead
        title={t('ui.nav.finances')}
        meta={
          <span className="row">
            <Flag code={country.code} size={16} /> {t('ui.fin.meta', { country: countryName(country.code), econ: country.econ, tax: (country.taxRate * 100).toFixed(1) })}
          </span>
        }
      />
      <SubTabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'summary', label: t('ui.fin.tab.summary') },
          { id: 'budget', label: t('ui.fin.tab.budget') },
          { id: 'commercial', label: g.sponsorOffers.length ? `${t('ui.fin.tab.commercial')} (${g.sponsorOffers.length})` : t('ui.fin.tab.commercial') },
          { id: 'stadium', label: t('ui.fin.tab.stadium') },
          { id: 'bank', label: t('ui.fin.tab.bank') },
          { id: 'detail', label: t('ui.fin.tab.detail') },
          { id: 'history', label: t('ui.fin.tab.history') },
        ]}
      />
      <div style={{ marginTop: 12 }}>
        {tab === 'summary' && <Summary />}
        {tab === 'budget' && <Budget />}
        {tab === 'commercial' && <Commercial />}
        {tab === 'stadium' && <Stadium />}
        {tab === 'bank' && <Bank />}
        {tab === 'detail' && <Overview />}
        {tab === 'history' && <History />}
      </div>
    </>
  );
}

/** Semáforo de "salud del club". */
function Health({ label, value, tone, hint }: { label: string; value: string; tone: 'good' | 'warn' | 'bad'; hint: string }) {
  return (
    <div className={`health ${tone}`} title={hint}>
      <span className="dot" />
      <div>
        <div className="k">{label}</div>
        <div className="v">{value}</div>
      </div>
    </div>
  );
}

function Summary() {
  const g = useGameState();
  const { mutate, setView } = useGame();
  const club = g.clubs[g.userClubId as string];
  const country = COUNTRY_BY_CODE[club.countryCode];
  const league = g.leagues[club.leagueId];
  const fin = club.finances;
  const players = clubPlayers(g, club.id);
  const wages = weeklyWageBill(players, club.id);
  const staff = weeklyStaffCost(g, club);
  const season = summarizeLedger(g.season, fin.ledger);
  const revenue = estimateSeasonRevenue(club, country, league.tier, league.clubIds.length - 1);
  const ratio = ((wages + staff) * 52) / Math.max(1, revenue);
  const fpf = evaluateFPF(club);
  const commitments = pendingCommitments(fin);
  const monthly = (fin.monthly ?? []).slice(-12);
  const labels = monthly.map((m) => monthLabel(m.season, m.month));
  const total = fin.transferBudget + fin.wageBudget * 52;
  const share = Math.round((fin.transferBudget / Math.max(1, total)) * 100);
  const wagePct = Math.min(130, (wages / Math.max(1, fin.wageBudget)) * 100);
  const step = Math.round(total * 0.05);

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="fin-cards">
        <div className="fin-card" data-fin="transfers">
          <div className="k">{t('ui.fin.transferBudget')}</div>
          <div className="v">{formatMoney(fin.transferBudget)}</div>
          <div className="s">{commitments.instalments > 0 ? t('ui.fin.committed', { amount: commitments.instalments }) : t('ui.fin.noCommitted')}</div>
        </div>
        <div className="fin-card" data-fin="wages">
          <div className="k">{t('ui.fin.wagesVsBudget')}</div>
          <div className={`v ${wages > fin.wageBudget ? 'bad' : ''}`}>{formatMoney(wages)}</div>
          <Meter value={wagePct} color={wages > fin.wageBudget ? 'var(--bad)' : wagePct > 90 ? 'var(--warn)' : undefined} />
          <div className="s">{t('ui.fin.ofBudget', { n: formatMoney(fin.wageBudget) })}</div>
        </div>
        <div className="fin-card" data-fin="balance">
          <div className="k">{t('ui.fin.balance')}</div>
          <div className={`v ${fin.balance < 0 ? 'bad' : ''}`}>{formatMoney(fin.balance)}</div>
          <div className={`s ${season.net < 0 ? 'bad' : 'good'}`}>{t('ui.fin.seasonNet', { n: formatMoney(season.net) })}</div>
        </div>
      </div>

      <div className="grid c-main" style={{ alignItems: 'start' }}>
        <Panel title={t('ui.fin.monthChart')}>
          <BarPairs income={monthly.map((m) => m.income)} expense={monthly.map((m) => m.expense)} labels={labels} />
          <LineChart points={monthly.map((m) => m.balance)} labels={labels} />
        </Panel>
        <div className="grid" style={{ alignContent: 'start' }}>
          <Panel title={t('ui.fin.health')}>
            <div className="health-grid">
              <Health label={t('ui.fin.h.fpf')} value={fpf.compliant ? t('ui.fin.h.ok') : t('ui.fin.h.risk')} tone={fpf.compliant ? 'good' : 'bad'} hint={tm(fpf.message)} />
              <Health label={t('ui.fin.h.wages')} value={`${Math.round(ratio * 100)}%`} tone={ratio < 0.65 ? 'good' : ratio < 0.8 ? 'warn' : 'bad'} hint={t('ui.fin.h.wagesHint')} />
              <Health label={t('ui.fin.h.cash')} value={formatMoney(fin.balance)} tone={fin.balance > 0 ? 'good' : 'bad'} hint={t('ui.fin.h.cashHint')} />
              <Health label={t('ui.fin.h.fans')} value={`${Math.round(club.fans?.satisfaction ?? 50)}%`} tone={(club.fans?.satisfaction ?? 50) >= 60 ? 'good' : (club.fans?.satisfaction ?? 50) >= 40 ? 'warn' : 'bad'} hint={t('ui.fin.h.fansHint')} />
            </div>
          </Panel>
          <Panel title={t('ui.fin.split')}>
            <div className="row" style={{ fontSize: 13 }}>
              <span className="dim">{t('ui.fin.transferBudget')}</span>
              <span className="spacer" />
              <span className="b">{share}%</span>
            </div>
            <Meter value={share} />
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn sm" onClick={() => mutate(() => rebalanceBudgets(club, -step))} disabled={fin.transferBudget < step}>
                {t('ui.fin.moreWages')}
              </button>
              <span className="spacer" />
              <button className="btn sm" onClick={() => mutate(() => rebalanceBudgets(club, step))} disabled={fin.wageBudget * 52 < step}>
                {t('ui.fin.moreTransfers')}
              </button>
            </div>
            <p className="faint" style={{ fontSize: 12, marginBottom: 0 }}>
              {t('ui.fin.splitHint', { n: formatMoney(step) })}
            </p>
          </Panel>
        </div>
      </div>

      <Panel
        title={t('ui.fin.commitments', { n: (fin.commitments ?? []).length })}
        actions={
          <button className="btn sm ghost" onClick={() => setView('transfers')}>
            {t('ui.fin.openContracts')}
          </button>
        }
        flush
      >
        {(fin.commitments ?? []).length === 0 && <div className="dim" style={{ padding: 14 }}>{t('ui.fin.noCommitments')}</div>}
        {(fin.commitments ?? []).map((c) => (
          <div key={c.id} className="row nw" style={{ padding: '8px 14px', borderBottom: '1px solid var(--line)' }}>
            <span className={`tag ${c.kind === 'bonus' ? 'warn' : 'acc'}`}>{t(`ui.con.kind.${c.kind}`)}</span>
            <span className="ellipsis">{g.players[c.playerId] ? fullName(g.players[c.playerId]) : '?'}</span>
            <span className="spacer" />
            <span className="faint">{c.kind === 'bonus' ? t('ui.con.bonusWhen', { n: c.apps ?? 0 }) : t('ui.con.dueIn', { y: c.dueSeason })}</span>
            <span className="b">{formatMoney(c.amount)}</span>
          </div>
        ))}
      </Panel>
    </div>
  );
}

function monthLabel(season: number, month: number): string {
  const d = gameDate(season, 0);
  d.setUTCMonth(6 + month);
  return d.toLocaleDateString(intlLocale(), { month: 'short', timeZone: 'UTC' });
}

function Overview() {
  const g = useGameState();
  const club = g.clubs[g.userClubId as string];
  const country = COUNTRY_BY_CODE[club.countryCode];
  const fin = club.finances;
  const regime = FPF_REGIMES[country.confederation];
  const league = g.leagues[club.leagueId];
  const wages = weeklyWageBill(clubPlayers(g, club.id), club.id);
  const staff = weeklyStaffCost(g, club);
  const revenue = estimateSeasonRevenue(club, country, league.tier, league.clubIds.length - 1);
  const ratio = ((wages + staff) * 52) / Math.max(1, revenue);
  const maxCat = Math.max(1, ...LEDGER_CATEGORIES.map((c) => fin.ledger[c]));
  const monthly = (fin.monthly ?? []).slice(-12);
  const labels = monthly.map((m) => monthLabel(m.season, m.month));
  return (
    <div className="grid c3">
      <div className="grid" style={{ gridColumn: 'span 2', alignContent: 'start' }}>
        <Panel title={t('ui.fin.balanceChart')}>
          <LineChart points={monthly.map((m) => m.balance)} labels={labels} />
        </Panel>
        <Panel title={t('ui.fin.monthChart')}>
          <BarPairs income={monthly.map((m) => m.income)} expense={monthly.map((m) => m.expense)} labels={labels} />
        </Panel>
        <Panel title={t('ui.fin.ledger')} flush>
          <table className="tbl">
            <tbody>
              {LEDGER_CATEGORIES.filter((c) => fin.ledger[c] > 0).map((c) => {
                const inc = INCOME_CATEGORIES.includes(c);
                return (
                  <tr key={c}>
                    <td style={{ width: '45%' }}>{t(`ledger.${c}`)}</td>
                    <td>
                      <div className="meter" style={{ height: 4 }}>
                        <div style={{ width: `${(fin.ledger[c] / maxCat) * 100}%`, background: inc ? 'var(--good)' : 'var(--bad)' }} />
                      </div>
                    </td>
                    <td className={`n ${inc ? 'good' : 'bad'}`}>
                      {inc ? '+' : '−'}
                      {formatMoney(fin.ledger[c])}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      </div>
      <div className="grid" style={{ alignContent: 'start' }}>
        <Panel title={t('ui.fin.weekly')}>
          {(
            [
              ['squadWages', wages],
              ['staffWages', staff],
              ['stadiumUpkeep', weeklyStadiumCost(club, country)],
              ['youth', weeklyYouthCost(club, country)],
              ['loans', club.loans.reduce((s, l) => s + l.weeklyPayment, 0)],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="row" style={{ padding: '3px 0' }}>
              <span className="dim">{t(`ui.fin.w.${k}`)}</span>
              <span className="spacer" />
              <span className="b">{formatMoney(v)}</span>
            </div>
          ))}
          <div className="row" style={{ padding: '3px 0', marginTop: 6, borderTop: '1px solid var(--line)' }}>
            <span className="dim">{t('ui.fin.ticketPrice')}</span>
            <span className="spacer" />
            <span className="b">{formatMoney(ticketPrice(club, country) * club.tickets.priceMultiplier)}</span>
          </div>
          <div className="row" style={{ padding: '3px 0' }}>
            <span className="dim">{t('ui.fin.estRevenue')}</span>
            <span className="spacer" />
            <span className="b">{formatMoney(revenue)}</span>
          </div>
        </Panel>
        <Panel title={t(`ui.fpf.${regime.id}`)}>
          <div className="dim" style={{ fontSize: 13 }}>
            {t('ui.fin.fpfRules', { n: regime.windowSeasons, loss: regime.maxAggregateLoss * country.econ, pct: Math.round(regime.squadCostRatio * 100) })}
          </div>
          <div className="row" style={{ fontSize: 12, marginTop: 8 }}>
            <span className="dim">{t('ui.fin.squadCost')}</span>
            <span className="spacer" />
            <span className={`b ${ratio > regime.squadCostRatio ? 'bad' : ''}`}>{(ratio * 100).toFixed(0)}%</span>
          </div>
          <Meter value={ratio * 100} color={ratio > regime.squadCostRatio ? 'var(--bad)' : undefined} />
          <div style={{ marginTop: 8 }}>
            {t('ui.fin.breaches')}: <span className="b">{fin.fpf.breaches}</span> {fin.fpf.transferEmbargo && <span className="tag bad">{t('ui.fin.embargo')}</span>}
          </div>
          {fin.fpf.lastVerdict && (
            <p className="faint" style={{ fontSize: 12, marginBottom: 0 }}>
              {tm(fin.fpf.lastVerdict)}
            </p>
          )}
        </Panel>
        <Panel title={t('ui.fin.fans')}>
          <div className="row" style={{ fontSize: 13 }}>
            <span className="dim">{t('ui.fin.satisfaction')}</span>
            <span className="spacer" />
            <span className="b">{Math.round(club.fans.satisfaction)}%</span>
          </div>
          <Meter value={club.fans.satisfaction} color={club.fans.satisfaction < 40 ? 'var(--bad)' : undefined} />
          <div className="row" style={{ fontSize: 13, marginTop: 6 }}>
            <span className="dim">{t('ui.fin.members')}</span>
            <span className="spacer" />
            <span className="b">{club.fans.members.toLocaleString(intlLocale())}</span>
          </div>
        </Panel>
      </div>
    </div>
  );
}

/** EA FC style budget split: move money between transfers and the weekly wage budget. */
function Budget() {
  const g = useGameState();
  const { mutate } = useGame();
  const club = g.clubs[g.userClubId as string];
  const fin = club.finances;
  const total = fin.transferBudget + fin.wageBudget * 52;
  const [share, setShare] = useState(Math.round((fin.transferBudget / Math.max(1, total)) * 100));
  const targetTransfer = (total * share) / 100;
  const delta = targetTransfer - fin.transferBudget;
  return (
    <div className="grid c2">
      <Panel title={t('ui.fin.tab.budget')}>
        <p className="dim" style={{ marginTop: 0 }}>
          {t('ui.fin.budgetHelp')}
        </p>
        <input type="range" min={0} max={100} value={share} onChange={(e) => setShare(Number(e.target.value))} style={{ width: '100%' }} />
        <div className="grid c2" style={{ marginTop: 10 }}>
          <Stat k={t('ui.fin.transferBudget')} v={formatMoney(targetTransfer)} />
          <Stat k={t('ui.fin.wageBudget')} v={`${formatMoney((total - targetTransfer) / 52)}/${t('ui.weekShort')}`} />
        </div>
        <button className="btn primary" style={{ marginTop: 12 }} disabled={Math.abs(delta) < 1000} onClick={() => mutate(() => rebalanceBudgets(club, delta))}>
          {t('ui.fin.applyBudget')}
        </button>
      </Panel>
      <Panel title={t('ui.fin.wageStructure')}>
        {clubPlayers(g, club.id)
          .filter((p) => p.contract)
          .sort((a, b) => (b.contract?.wage ?? 0) - (a.contract?.wage ?? 0))
          .slice(0, 12)
          .map((p) => (
            <div key={p.id} className="row" style={{ fontSize: 13, padding: '2px 0' }}>
              <span className="ellipsis link" onClick={() => useGame.getState().openPlayer(p.id)}>
                {p.lastName}
              </span>
              <span className="spacer" />
              <div style={{ width: 120 }}>
                <Meter value={((p.contract?.wage ?? 0) / Math.max(1, fin.wageBudget)) * 300} />
              </div>
              <span className="b" style={{ width: 70, textAlign: 'right' }}>
                {formatMoney(p.contract?.wage ?? 0)}
              </span>
            </div>
          ))}
      </Panel>
    </div>
  );
}

function Commercial() {
  const g = useGameState();
  const { mutate, notify } = useGame();
  const club = g.clubs[g.userClubId as string];
  const country = COUNTRY_BY_CODE[club.countryCode];
  const tk = club.tickets;
  const demand = ticketDemandFactor(club);
  const setTk = (k: keyof typeof tk, v: number) => mutate(() => (club.tickets = { ...club.tickets, [k]: v }));
  return (
    <div className="grid c2">
      <div className="grid" style={{ alignContent: 'start' }}>
        <Panel title={t('ui.fin.sponsors')}>
          {SLOTS.map((slot) => {
            const sp = club.sponsors.find((s) => s.slot === slot && s.years > 0);
            return (
              <div key={slot} className="row nw" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                <span className="tag" style={{ width: 90, textAlign: 'center' }}>
                  {t(`sponsor.${slot}`)}
                </span>
                {sp ? (
                  <>
                    <span className="b">{sp.brand}</span>
                    <span className="spacer" />
                    <span className="faint" style={{ fontSize: 12 }}>
                      {t('ui.fin.sponsorTerms', { annual: sp.annual, years: sp.years })}
                    </span>
                  </>
                ) : (
                  <span className="dim">{t('ui.fin.noSponsor')}</span>
                )}
              </div>
            );
          })}
        </Panel>
        <Panel title={t('ui.fin.offers', { n: g.sponsorOffers.length })} flush>
          {g.sponsorOffers.length === 0 && <div className="dim" style={{ padding: 12 }}>{t('ui.fin.noOffers')}</div>}
          {g.sponsorOffers.map((o) => (
            <div key={o.id} className="row nw" style={{ padding: '8px 10px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
              <span className="tag">{t(`sponsor.${o.slot}`)}</span>
              <span className="b">{o.brand}</span>
              <span className="faint" style={{ fontSize: 12 }}>
                {t('ui.fin.offerTerms', { annual: o.annual, years: o.years, titleBonus: o.titleBonus, winBonus: o.winBonus })}
              </span>
              <span className="spacer" />
              <span className="faint" style={{ fontSize: 11 }}>
                {t('ui.fin.expiresIn', { n: Math.max(0, o.expiresDay - g.day) })}
              </span>
              <button
                className="btn sm acc"
                onClick={() => {
                  mutate((s) => {
                    signSponsor(s, club, o);
                    s.sponsorOffers = s.sponsorOffers.filter((x) => x.slot !== o.slot);
                  });
                  notify(t('ui.fin.signed', { brand: o.brand }));
                }}
              >
                {t('ui.fin.sign')}
              </button>
            </div>
          ))}
        </Panel>
      </div>
      <div className="grid" style={{ alignContent: 'start' }}>
        <Panel title={t('ui.fin.tickets')}>
          <div className="slider-row">
            <div className="row" style={{ fontSize: 13 }}>
              <span className="b">{t('ui.fin.ticketPriceLevel')}</span>
              <span className="spacer" />
              <span>{formatMoney(ticketPrice(club, country) * tk.priceMultiplier)}</span>
            </div>
            <input type="range" min={50} max={200} step={5} value={Math.round(tk.priceMultiplier * 100)} onChange={(e) => setTk('priceMultiplier', Number(e.target.value) / 100)} />
          </div>
          <div className="slider-row">
            <div className="row" style={{ fontSize: 13 }}>
              <span className="b">{t('ui.fin.seasonTicketDiscount')}</span>
              <span className="spacer" />
              <span>{Math.round((1 - tk.seasonTicketDiscount) * 100)}%</span>
            </div>
            <input type="range" min={0} max={60} step={5} value={Math.round((1 - tk.seasonTicketDiscount) * 100)} onChange={(e) => setTk('seasonTicketDiscount', 1 - Number(e.target.value) / 100)} />
          </div>
          <div className="slider-row">
            <div className="row" style={{ fontSize: 13 }}>
              <span className="b">{t('ui.fin.merchPrice')}</span>
              <span className="spacer" />
              <span>×{tk.merchMultiplier.toFixed(2)}</span>
            </div>
            <input type="range" min={60} max={180} step={5} value={Math.round(tk.merchMultiplier * 100)} onChange={(e) => setTk('merchMultiplier', Number(e.target.value) / 100)} />
          </div>
          <div className="row" style={{ fontSize: 13, marginTop: 6 }}>
            <span className="dim">{t('ui.fin.demand')}</span>
            <span className="spacer" />
            <span className={`b ${demand < 0.8 ? 'bad' : ''}`}>{Math.round(demand * 100)}%</span>
          </div>
          <Meter value={demand * 80} color={demand < 0.8 ? 'var(--warn)' : undefined} />
          <div className="row" style={{ fontSize: 13, marginTop: 6 }}>
            <span className="dim">{t('ui.fin.seasonTickets')}</span>
            <span className="spacer" />
            <span className="b">{tk.seasonTicketsSold.toLocaleString(intlLocale())}</span>
          </div>
          <p className="faint" style={{ fontSize: 12, marginBottom: 0 }}>
            {t('ui.fin.ticketHelp')}
          </p>
        </Panel>
      </div>
    </div>
  );
}

function Stadium() {
  const g = useGameState();
  const { mutate, notify } = useGame();
  const club = g.clubs[g.userClubId as string];
  return (
    <div className="grid c2">
      <div className="grid" style={{ alignContent: 'start' }}>
        <Panel title={club.stadium.name}>
          <div className="grid c3">
            <Stat k={t('ui.fin.capacity')} v={club.stadium.capacity.toLocaleString(intlLocale())} />
            <Stat k={t('ui.fin.condition')} v={`${Math.round(club.stadium.condition)}%`} />
            <Stat k={t('ui.fin.training')} v={`${Math.round(club.trainingFacilities)}`} />
          </div>
        </Panel>
        <Panel title={t('ui.fin.works', { n: club.projects.length })} flush>
          {club.projects.length === 0 && <div className="dim" style={{ padding: 12 }}>{t('ui.fin.noWorks')}</div>}
          {club.projects.map((p) => (
            <div key={p.id} style={{ padding: '8px 10px', borderBottom: '1px solid var(--line)' }}>
              <div className="row" style={{ fontSize: 13 }}>
                <span className="b">{t(`project.${p.type}`)}</span>
                <span className="faint">→ {p.type === 'stadiumExpansion' ? `+${expansionSeats(club).toLocaleString(intlLocale())}` : t('ui.fin.levelN', { n: p.toLevel })}</span>
                <span className="spacer" />
                <span className="faint">{t('ui.fin.daysLeft', { n: p.daysLeft })}</span>
              </div>
              <Meter value={((p.days - p.daysLeft) / p.days) * 100} />
            </div>
          ))}
        </Panel>
      </div>
      <Panel title={t('ui.fin.build')} flush>
        {PROJECT_TYPES.map((type) => {
          const lvl = facilityLevel(club, type);
          const cost = projectCost(club, type);
          const ok = canBuild(club, type);
          return (
            <div key={type} className="row nw" style={{ padding: '8px 10px', borderBottom: '1px solid var(--line)' }}>
              <div style={{ minWidth: 0 }}>
                <div className="b">{t(`project.${type}`)}</div>
                <div className="faint" style={{ fontSize: 12 }}>
                  {type === 'stadiumExpansion' ? t('ui.fin.addsSeats', { n: expansionSeats(club) }) : type === 'pitchRenovation' ? t('ui.fin.renewPitch') : t('ui.fin.levelOf', { n: lvl, max: PROJECTS[type].maxLevel })}
                  {' · '}
                  {t('ui.fin.daysN', { n: PROJECTS[type].days })}
                  {PROJECTS[type].maintenance ? ` · ${t('ui.fin.upkeep', { amount: facilityUpkeepPerLevel(club, type) })}` : ''}
                </div>
                <div className="faint" style={{ fontSize: 12 }}>
                  {t(`ui.fin.effect.${type}`)}
                </div>
              </div>
              <span className="spacer" />
              <span className="b">{formatMoney(cost)}</span>
              <button
                className="btn sm acc"
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
                {t('ui.fin.start')}
              </button>
            </div>
          );
        })}
      </Panel>
    </div>
  );
}

function Bank() {
  const g = useGameState();
  const { mutate, notify } = useGame();
  const club = g.clubs[g.userClubId as string];
  const country = COUNTRY_BY_CODE[club.countryCode];
  const league = g.leagues[club.leagueId];
  const revenue = estimateSeasonRevenue(club, country, league.tier, league.clubIds.length - 1);
  const limit = maxLoan(club, revenue);
  const rate = loanRate(club);
  const [amount, setAmount] = useState(Math.round(limit / 2));
  const [years, setYears] = useState(3);
  const r = rate / 52;
  const weekly = amount > 0 ? (amount * r) / (1 - Math.pow(1 + r, -years * 52)) : 0;
  return (
    <div className="grid c2">
      <Panel title={t('ui.fin.newLoan')}>
        <div className="dim" style={{ fontSize: 13 }}>
          {t('ui.fin.loanInfo', { amount: limit, rate: (rate * 100).toFixed(1) })}
        </div>
        <div className="field" style={{ marginTop: 10 }}>
          <label>{t('ui.fin.amount', { amount })}</label>
          <input type="range" min={0} max={Math.max(0, limit)} step={Math.max(1000, Math.round(limit / 100))} value={Math.min(amount, limit)} onChange={(e) => setAmount(Number(e.target.value))} />
        </div>
        <div className="field">
          <label>{t('ui.fin.years', { n: years })}</label>
          <input type="range" min={1} max={10} value={years} onChange={(e) => setYears(Number(e.target.value))} />
        </div>
        <div className="row" style={{ fontSize: 13 }}>
          <span className="dim">{t('ui.fin.weeklyPayment')}</span>
          <span className="spacer" />
          <span className="b">{formatMoney(weekly)}</span>
        </div>
        <div className="row" style={{ fontSize: 13 }}>
          <span className="dim">{t('ui.fin.totalCost')}</span>
          <span className="spacer" />
          <span className="b">{formatMoney(weekly * years * 52)}</span>
        </div>
        <button
          className="btn primary"
          style={{ marginTop: 10 }}
          disabled={amount <= 0 || amount > limit}
          onClick={() => {
            mutate((s) => takeLoan(s, club, Math.min(amount, limit), years));
            notify(t('ui.fin.loanTaken', { amount }));
          }}
        >
          {t('ui.fin.takeLoan')}
        </button>
      </Panel>
      <Panel title={t('ui.fin.activeLoans', { n: club.loans.length })} flush>
        {club.loans.length === 0 && <div className="dim" style={{ padding: 12 }}>{t('ui.fin.noLoans')}</div>}
        {club.loans.map((l) => (
          <div key={l.id} className="row nw" style={{ padding: '8px 10px', borderBottom: '1px solid var(--line)' }}>
            <div>
              <div className="b">{formatMoney(l.principal)}</div>
              <div className="faint" style={{ fontSize: 12 }}>
                {t('ui.fin.loanRow', { rate: (l.rate * 100).toFixed(1), weekly: l.weeklyPayment, weeks: l.weeksLeft })}
              </div>
            </div>
            <span className="spacer" />
            <button
              className="btn sm"
              onClick={() => {
                const paid = mutate(() => repayLoanEarly(club, l.id));
                notify(t('ui.fin.repaid', { amount: paid }));
              }}
            >
              {t('ui.fin.repay')}
            </button>
          </div>
        ))}
      </Panel>
    </div>
  );
}

function History() {
  const g = useGameState();
  const club = g.clubs[g.userClubId as string];
  const fin = club.finances;
  if (fin.history.length === 0) return <Panel title={t('ui.fin.tab.history')}>{t('ui.fin.noHistory')}</Panel>;
  return (
    <div className="grid">
      <Panel title={t('ui.fin.netBySeason')}>
        <LineChart points={fin.history.map((h) => h.net)} labels={fin.history.map((h) => String(h.season))} />
      </Panel>
      <Panel title={t('ui.fin.tab.history')} flush>
        <table className="tbl">
          <thead>
            <tr>
              <th>{t('ui.col.season')}</th>
              <th className="n">{t('ui.fin.revenue')}</th>
              <th className="n">{t('ui.fin.expenses')}</th>
              <th className="n">{t('ui.fin.net')}</th>
              <th className="n">{t('ui.fin.fpfNet')}</th>
              <th className="n">{t('ui.fin.wageBill')}</th>
            </tr>
          </thead>
          <tbody>
            {[...fin.history].reverse().map((h) => (
              <tr key={h.season}>
                <td>{h.season}</td>
                <td className="n">{formatMoney(h.revenue)}</td>
                <td className="n">{formatMoney(h.expenses)}</td>
                <td className={`n ${h.net < 0 ? 'bad' : 'good'}`}>{formatMoney(h.net)}</td>
                <td className="n">{formatMoney(h.fpfNet)}</td>
                <td className="n">{formatMoney(h.wageBill)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
