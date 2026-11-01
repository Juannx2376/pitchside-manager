import {
  CALENDAR,
  COUNTRIES,
  MAX_INSTALMENTS,
  MAX_PLAYERS_IN_DEAL,
  POSITIONS,
  Rng,
  absDayOf,
  askingPrice,
  clubPlayers,
  counterIncomingBid,
  countryName,
  delegateNegotiation,
  exerciseBuyBack,
  expectedRole,
  formatGameDate,
  formatMoney,
  fullName,
  fundingOptions,
  isWindowOpen,
  latestReportFor,
  offeredPlayersValue,
  overall,
  pendingCommitments,
  playerExpectations,
  playerTradeValue,
  playerValue,
  positionName,
  queueBid,
  queueContract,
  queueLoanBid,
  rebalanceBudgets,
  resolveRenegotiation,
  respondToIncomingBid,
  signingOutcome,
  startPlayerAnalysis,
  t,
  tm,
  suggestSales,
  tradeablePlayers,
  transferOutlook,
  transferPool,
  type ClubBid,
  type ContractOffer,
  type GameState,
  type LoanTerms,
  type Negotiation,
  type Player,
  type Position,
  type SquadStatus,
} from '@pitchside/core';
import { useMemo, useState, type ChangeEvent, type ReactNode } from 'react';
import { Attr, ClubName, Crest, Face, Flag, Meter, Panel, PosBadge, StatGrid, SubTabs } from '../components/ui';
import '../tactics.css';
import { AnalysisReport } from './PlayerModal';
import { LiveMarket } from '../components/LiveMarket';
import { useGame, useGameState } from '../store/game';

type Area = 'scout' | 'deals';
type ScoutTab = 'search' | 'reports' | 'wishlist';
type DealTab = 'active' | 'live' | 'lists' | 'contracts' | 'history';

/** Estados que cuentan como "negociación activa" (cualquier fase que aún espera algo). */
const ACTIVE_STAGES = ['enquiry', 'club', 'player', 'renegotiation'] as const;
const isActive = (n: Negotiation): boolean => (ACTIVE_STAGES as readonly string[]).includes(n.stage) || (n.stage === 'agreed' && !!n.entryAbs);

export function Transfers() {
  const g = useGameState();
  const [area, setArea] = useState<Area>('deals');
  const [scoutTab, setScoutTab] = useState<ScoutTab>('search');
  const [dealTab, setDealTab] = useState<DealTab>('active');
  const club = g.clubs[g.userClubId as string];
  const open = isWindowOpen(g.day);
  const windowEnd = [CALENDAR.summerWindow, CALENDAR.winterWindow].find((w) => g.day >= w[0] && g.day <= w[1])?.[1] ?? g.day;
  const windowLeft = Math.max(0, windowEnd - g.day);
  const incoming = Object.values(g.negotiations).filter((n) => n.incoming && n.stage === 'club');
  const mine = Object.values(g.negotiations).filter((n) => n.buyerClubId === club.id && !n.incoming);
  const active = mine.filter(isActive);
  const reports = Object.values(g.scoutReports).filter((r) => r.analysis && g.scoutAssignments[r.assignmentId]?.clubId === club.id);
  const wageRoom = club.finances.wageBudget - clubPlayers(g, club.id).reduce((s, p) => s + (p.contract?.wage ?? 0), 0);
  const commitments = pendingCommitments(club.finances);
  const outlook = transferOutlook(g, club.id);
  const liveN = (g.meta?.agentOffers?.length ?? 0) + (g.meta?.deadline?.deals.length ?? 0) + (g.meta?.rumours?.filter((r) => r.status === 'open').length ?? 0);

  return (
    <>
      <div className="tr-bar">
        <div className="tr-stat">
          <span className="k">{t('ui.tr.window')}</span>
          <span className={`v ${open ? 'good' : ''}`} data-window-left={open ? '' : undefined}>
            {open ? t('ui.tr.windowDays', { n: windowLeft }) : t('ui.tr.windowClosed')}
          </span>
        </div>
        <div className="tr-stat" title={t('ui.tr.availableTip')} data-available>
          <span className="k">{t('ui.tr.available')}</span>
          <span className="v">{formatMoney(outlook.available)}</span>
        </div>
        <div className="tr-stat">
          <span className="k">{t('ui.tr.wageRoomShort')}</span>
          <span className={`v ${wageRoom < 0 ? 'bad' : ''}`}>{formatMoney(wageRoom)}</span>
        </div>
        <div className="tr-stat">
          <span className="k">{t('ui.tr.committed')}</span>
          <span className="v">{formatMoney(commitments.instalments)}</span>
        </div>
      </div>
      <MoneyPanel />
      {club.finances.fpf.transferEmbargo && (
        <div className="panel" style={{ padding: 10, marginBottom: 12, borderColor: 'var(--bad)' }}>
          {t('ui.tr.embargo')}
        </div>
      )}
      <div className="area-toggle" role="tablist">
        <button role="tab" aria-selected={area === 'scout'} className={`area-btn ${area === 'scout' ? 'on' : ''}`} onClick={() => setArea('scout')} data-area="scout">
          <b>{t('ui.tr.area.scout')}</b>
          <span>{t('ui.tr.area.scoutS', { n: reports.length })}</span>
        </button>
        <button role="tab" aria-selected={area === 'deals'} className={`area-btn ${area === 'deals' ? 'on' : ''}`} onClick={() => setArea('deals')} data-area="deals">
          <b>{t('ui.tr.area.deals')}</b>
          <span>{t('ui.tr.area.dealsS', { n: active.length + incoming.length })}</span>
        </button>
      </div>

      {area === 'scout' && (
        <>
          <SubTabs<ScoutTab>
            value={scoutTab}
            onChange={setScoutTab}
            tabs={[
              { id: 'search', label: t('ui.tr.tab.search') },
              { id: 'reports', label: t('ui.tr.tab.reports', { n: reports.length }) },
              { id: 'wishlist', label: t('ui.tr.tab.shortlist', { n: g.shortlist.length }) },
            ]}
          />
          {scoutTab === 'search' && <Search />}
          {scoutTab === 'wishlist' && <PlayerList ids={g.shortlist} />}
          {scoutTab === 'reports' && (
            <div className="grid c2">
              {reports.length === 0 && <Panel title={t('ui.tr.tab.reports', { n: 0 })}>{t('ui.tr.noReports')}</Panel>}
              {[...reports]
                .sort((a, b) => b.season * 400 + b.day - (a.season * 400 + a.day))
                .map((r) => (
                  <div key={r.id}>
                    <div className="row link" style={{ marginBottom: 4 }} onClick={() => useGame.getState().openPlayer(r.playerId)}>
                      <Face player={g.players[r.playerId]} size={28} />
                      <span className="b">{g.players[r.playerId] ? fullName(g.players[r.playerId]) : '?'}</span>
                      <span className="faint">{formatGameDate(r.season, r.day)}</span>
                    </div>
                    <AnalysisReport report={r} />
                  </div>
                ))}
            </div>
          )}
        </>
      )}

      {area === 'deals' && (
        <>
          <SubTabs<DealTab>
            value={dealTab}
            onChange={setDealTab}
            tabs={[
              { id: 'active', label: t('ui.tr.tab.active', { n: active.length + incoming.length }) },
              { id: 'live', label: t('ui.tr.tab.live', { n: liveN }) },
              { id: 'lists', label: t('ui.tr.tab.lists') },
              { id: 'contracts', label: t('ui.tr.tab.contracts') },
              { id: 'history', label: t('ui.tr.tab.history') },
            ]}
          />
          {dealTab === 'active' && (
            <div className="grid">
              <Deals deals={mine.filter((d) => isActive(d) || d.stage === 'collapsed' || d.stage === 'agreed')} />
              {incoming.length > 0 && <Incoming list={incoming} />}
            </div>
          )}
          {dealTab === 'live' && <LiveMarket />}
          {dealTab === 'lists' && <MyMarket />}
          {dealTab === 'contracts' && (
            <div className="grid">
              <Contracts />
              <BuyBacks />
            </div>
          )}
          {dealTab === 'history' && <History />}
        </>
      )}
    </>
  );
}

/** "Tu dinero": de dónde sale lo disponible, qué está reservado y qué entraría vendiendo. */
function MoneyPanel() {
  const g = useGameState();
  const club = g.clubs[g.userClubId as string];
  const o = transferOutlook(g, club.id);
  const row = (k: string, v: string, tone?: 'good' | 'bad') => (
    <div className="money-row" key={k}>
      <span className="dim">{t(`ui.tr.money.${k}`)}</span>
      <span className={`b ${tone ?? ''}`}>{v}</span>
    </div>
  );
  return (
    <details className="money-panel" data-money-panel>
      <summary>
        {t('ui.tr.myMoney')} <span className="faint">· {t('ui.tr.money.renewsIn', { n: o.daysToNewSeason })}</span>
      </summary>
      <div className="money-grid">
        {row('budget', formatMoney(o.budget))}
        {row('reserved', `− ${formatMoney(o.reserved)}`)}
        {row('available', formatMoney(o.available), 'good')}
        {row('instalments', formatMoney(o.instalments))}
        {row('wageRoom', formatMoney(o.wageRoom), o.wageRoom < 0 ? 'bad' : undefined)}
        {row('sales', `+ ${formatMoney(o.expectedSales)}`, o.expectedSales > 0 ? 'good' : undefined)}
        {row('carry', `+ ${formatMoney(o.carryEstimate)}`)}
        {row('prize', `+ ${formatMoney(o.prizeEstimate)}`)}
      </div>
      <p className="faint money-note">{t('ui.tr.money.note')}</p>
    </details>
  );
}

/** Asistente "te faltan X": vender, mover dinero de salarios o pagar a plazos, sin salir de la negociación. */
function FundingHelper({ payNow, onInstalments }: { payNow: number; onInstalments: () => void }) {
  const g = useGameState();
  const { mutate, notify } = useGame();
  const club = g.clubs[g.userClubId as string];
  const f = fundingOptions(g, club.id, payNow);
  if (f.shortfall <= 0) return null;
  const wages = Math.min(f.fromWages, Math.ceil(f.shortfall / 100_000) * 100_000);
  return (
    <div className="funding" data-funding>
      <div className="b">{t('ui.tr.short.title', { amount: f.shortfall })}</div>
      <div className="funding-acts">
        {f.sales.picks.slice(0, 3).map((s) => (
          <button
            key={s.player.id}
            className="btn sm"
            disabled={!!s.player.listed}
            data-list-sale={s.player.id}
            onClick={() => {
              mutate(() => (s.player.listed = 'transfer'));
              notify(t('ui.tr.short.listedToast', { p: fullName(s.player) }));
            }}
          >
            {s.player.listed ? t('ui.tr.short.alreadyListed', { p: s.player.lastName }) : t('ui.tr.short.sell', { p: s.player.lastName, amount: s.income })}
          </button>
        ))}
        {wages > 0 && (
          <button className="btn sm" data-move-wages onClick={() => mutate(() => rebalanceBudgets(club, wages))}>
            {t('ui.tr.short.wages', { amount: wages })}
          </button>
        )}
        <button className="btn sm" onClick={onInstalments}>
          {t('ui.tr.short.instalments')}
        </button>
      </div>
      <div className="faint" style={{ fontSize: 12 }}>{t('ui.tr.short.help')}</div>
    </div>
  );
}

function reportOverall(g: GameState, playerId: string): number | null {
  let best: number | null = null;
  for (const r of Object.values(g.scoutReports)) if (r.playerId === playerId) best = r.estimatedOverall;
  return best;
}

function PlayerList({ ids }: { ids: string[] }) {
  const g = useGameState();
  const { openPlayer, openClub } = useGame();
  const rows = ids.map((id) => g.players[id]).filter((p): p is Player => !!p && !p.retired);
  return (
    <Panel title={t('ui.tr.players', { n: rows.length })} flush>
      <StatGrid
        rows={rows}
        rowKey={(p) => p.id}
        onOpen={(p) => openPlayer(p.id)}
        initialSort={{ key: 'rep', dir: -1 }}
        limit={400}
        columns={[
          { key: 'f', label: '', render: (p) => <Face player={p} size={26} club={p.clubId ? g.clubs[p.clubId] : null} /> },
          { key: 'pos', label: t('ui.col.pos'), render: (p) => <PosBadge pos={p.position} />, sort: (p) => p.position },
          { key: 'name', label: t('ui.col.name'), render: (p) => <span className="link b" onClick={() => openPlayer(p.id)}>{fullName(p)}</span>, sort: (p) => p.lastName },
          { key: 'age', label: t('ui.col.age'), num: true, render: (p) => p.age, sort: (p) => p.age },
          { key: 'nat', label: '', render: (p) => <Flag code={p.nationality} size={16} />, sort: (p) => p.nationality },
          {
            key: 'club',
            label: t('ui.col.club'),
            render: (p) => (p.clubId ? <ClubName club={g.clubs[p.clubId]} onOpen={openClub} size={18} /> : <span className="tag">{t('ui.free')}</span>),
            sort: (p) => (p.clubId ? g.clubs[p.clubId].name : ''),
          },
          { key: 'lst', label: '', render: (p) => (p.listed ? <span className="tag warn">{t(`ui.listed.${p.listed}`)}</span> : '') },
          {
            key: 'est',
            label: t('ui.col.report'),
            num: true,
            render: (p) => {
              const r = reportOverall(g, p.id);
              return r ? <Attr v={r} /> : <span className="faint">?</span>;
            },
            sort: (p) => reportOverall(g, p.id) ?? 0,
          },
          { key: 'rep', label: t('ui.col.rep'), num: true, render: (p) => p.reputation, sort: (p) => p.reputation },
          { key: 'val', label: t('ui.col.value'), num: true, render: (p) => formatMoney(playerValue(g, p)), sort: (p) => playerValue(g, p) },
          { key: 'ask', label: t('ui.col.asking'), num: true, render: (p) => formatMoney(askingPrice(g, p)), sort: (p) => askingPrice(g, p) },
        ]}
      />
    </Panel>
  );
}

function Search() {
  const g = useGameState();
  const [pos, setPos] = useState<Position | ''>('');
  const [maxAge, setMaxAge] = useState(40);
  const [maxValue, setMaxValue] = useState(0);
  const [country, setCountry] = useState('');
  const [name, setName] = useState('');
  const [only, setOnly] = useState<'all' | 'free' | 'listed' | 'loan'>('all');
  const ids = useMemo(() => {
    const q = name.trim().toLowerCase();
    const out: string[] = [];
    for (const id of transferPool(g)) {
      const p = g.players[id];
      if (!p || p.retired || p.academy || p.prospect || p.clubId === g.userClubId) continue;
      if (pos && p.position !== pos && !p.secondaryPositions.includes(pos)) continue;
      if (p.age > maxAge) continue;
      if (country && p.nationality !== country) continue;
      if (only === 'free' && (p.clubId || p.contract)) continue;
      if (only === 'listed' && p.listed !== 'transfer') continue;
      if (only === 'loan' && p.listed !== 'loan') continue;
      if (q && !`${p.firstName} ${p.lastName}`.toLowerCase().includes(q)) continue;
      if (maxValue > 0 && playerValue(g, p) > maxValue) continue;
      out.push(id);
    }
    return out.sort((a, b) => g.players[b].reputation - g.players[a].reputation).slice(0, 400);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g, g.day, pos, maxAge, maxValue, country, only, name]);
  return (
    <div className="grid">
      <Panel title={t('ui.tr.filters')}>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <input placeholder={t('ui.tr.name')} value={name} onChange={(e) => setName(e.target.value)} style={{ width: 180 }} />
          <select value={pos} onChange={(e) => setPos(e.target.value as Position | '')}>
            <option value="">{t('ui.tr.anyPos')}</option>
            {POSITIONS.map((p) => (
              <option key={p} value={p}>
                {positionName(p)}
              </option>
            ))}
          </select>
          <label className="dim">{t('ui.tr.maxAge')}</label>
          <input type="number" value={maxAge} onChange={(e) => setMaxAge(Number(e.target.value))} style={{ width: 64 }} />
          <label className="dim">{t('ui.tr.maxValue')}</label>
          <input type="number" value={maxValue} onChange={(e) => setMaxValue(Number(e.target.value))} style={{ width: 120 }} />
          <select value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">{t('ui.tr.anyNat')}</option>
            {[...COUNTRIES]
              .sort((a, b) => countryName(a.code).localeCompare(countryName(b.code)))
              .map((c) => (
                <option key={c.code} value={c.code}>
                  {countryName(c.code)}
                </option>
              ))}
          </select>
          <select value={only} onChange={(e) => setOnly(e.target.value as typeof only)}>
            <option value="all">{t('ui.all')}</option>
            <option value="free">{t('ui.tr.onlyFree')}</option>
            <option value="listed">{t('ui.tr.onlyListed')}</option>
            <option value="loan">{t('ui.tr.onlyLoan')}</option>
          </select>
          <span className="faint">{t('ui.tr.results', { n: ids.length })}</span>
        </div>
      </Panel>
      <PlayerList ids={ids} />
    </div>
  );
}

const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);

const STEPS = ['enquiry', 'talks', 'agreement', 'presented'] as const;

function stepIndex(n: Negotiation): number {
  if (n.stage === 'enquiry') return 0;
  if (n.stage === 'club' || n.stage === 'player') return 1;
  if (n.stage === 'renegotiation') return 2;
  if (n.stage === 'agreed') return n.entryAbs ? 2 : 3;
  return -1;
}

function Deals({ deals }: { deals: Negotiation[] }) {
  const g = useGameState();
  const list = [...deals].sort((a, b) => Number(isActive(b)) - Number(isActive(a)) || b.season * 400 + b.day - (a.season * 400 + a.day));
  const [selId, setSelId] = useState<string | null>(list.find(isActive)?.id ?? null);
  const sel = selId ? g.negotiations[selId] : null;
  return (
    <div className="grid c-side">
      <Panel title={t('ui.tr.negotiations')} flush>
        {list.length === 0 && <div className="dim" style={{ padding: 14 }}>{t('ui.tr.noDeals')}</div>}
        {list.map((n) => {
          const p = g.players[n.playerId];
          if (!p) return null;
          const idx = stepIndex(n);
          return (
            <div key={n.id} className={`deal-card ${n.id === selId ? 'on' : ''}`} data-deal-card={n.id} onClick={() => setSelId(n.id)}>
              <Face player={p} size={38} club={n.sellerClubId ? g.clubs[n.sellerClubId] : null} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="b ellipsis">{fullName(p)}</div>
                <div className="faint" style={{ fontSize: 12 }}>
                  {n.sellerClubId ? g.clubs[n.sellerClubId].name : t('ui.free')} · {t(`ui.tr.kind.${n.kind}`)}
                </div>
                <div className="stepper mini">
                  {STEPS.map((s, i) => (
                    <i key={s} className={idx < 0 ? 'bad' : i <= idx ? 'on' : ''} />
                  ))}
                </div>
              </div>
              <span className={`tag ${n.stage === 'agreed' ? 'good' : n.stage === 'collapsed' ? 'bad' : n.stage === 'renegotiation' ? 'warn' : 'acc'}`}>{t(`ui.tr.stage.${n.stage}`)}</span>
            </div>
          );
        })}
      </Panel>
      {sel && g.players[sel.playerId] ? <NegotiationPanel key={sel.id} n={sel} /> : <Panel title={t('ui.tr.detail')}>{t('ui.tr.pickDeal')}</Panel>}
    </div>
  );
}

/** Pide un informe de ojeo cuando todavía no existe (la información llega con retraso). */
function OrderReport({ playerId }: { playerId: string }) {
  const g = useGameState();
  const { mutate, notify } = useGame();
  const club = g.clubs[g.userClubId as string];
  const running = Object.values(g.scoutAssignments).find((a) => a.kind === 'player' && a.targetPlayerId === playerId && !a.done && a.clubId === club.id);
  const scouts = club.scoutIds.map((id) => g.scouts[id]).filter(Boolean);
  const busy = new Set(Object.values(g.scoutAssignments).filter((a) => !a.done).map((a) => a.scoutId));
  const free = scouts.find((s) => !busy.has(s.id));
  return (
    <div className="verdict" data-verdict="none">
      <div className="b">{t('ui.tr.noReport')}</div>
      <p className="tv-help" style={{ margin: '4px 0 8px' }}>
        {t('ui.tr.noReportHelp')}
      </p>
      {running ? (
        <div>
          <Meter value={(running.daysElapsed / running.durationDays) * 100} />
          <div className="faint" style={{ fontSize: 12 }}>
            {t('ui.tr.analysisIn', { n: Math.max(1, running.durationDays - running.daysElapsed) })}
          </div>
        </div>
      ) : scouts.length === 0 ? (
        <span className="warn">{t('ui.tr.noScouts')}</span>
      ) : !free ? (
        <span className="warn">{t('ui.tr.scoutBusy')}</span>
      ) : (
        <button
          className="btn sm primary"
          data-order-analysis
          onClick={() => {
            try {
              const a = mutate((s) => startPlayerAnalysis(s, { scoutId: free.id, clubId: club.id, playerId }));
              notify(t('ui.tr.analysisIn', { n: a.durationDays }));
            } catch (e) {
              notify(t((e as Error).message));
            }
          }}
        >
          {t('ui.tr.orderAnalysis')}
        </button>
      )}
    </div>
  );
}

const ROLES: SquadStatus[] = ['key', 'first', 'rotation', 'backup', 'youth'];

function NegotiationPanel({ n }: { n: Negotiation }) {
  const g = useGameState();
  const { mutate, notify } = useGame();
  const p = g.players[n.playerId];
  const club = g.clubs[n.buyerClubId];
  const seller = n.sellerClubId ? g.clubs[n.sellerClubId] : null;
  const ex = playerExpectations(g, p, club);
  const ask = askingPrice(g, p);
  const awaiting = n.awaiting ?? null;
  const awaitDays = awaiting ? Math.max(1, awaiting.replyAbs - absDayOf(g)) : 0;
  const tension = Math.round(n.tension ?? 0);
  const report = latestReportFor(g, p.id, club.id);
  const wageRoom = club.finances.wageBudget - clubPlayers(g, club.id).reduce((s, q) => s + (q.contract?.wage ?? 0), 0);
  const role = expectedRole(g, p, club);

  // Club
  const [fee, setFee] = useState(n.sellerCounter?.fee ?? Math.round(ask * 0.9));
  const [inst, setInst] = useState(n.sellerCounter?.instalments ?? 1);
  const [bonus, setBonus] = useState(n.sellerCounter?.bonus ?? 0);
  const [sellOn, setSellOn] = useState(n.sellerCounter?.sellOnPercent ?? 0);
  const [entry, setEntry] = useState<NonNullable<ClubBid['entry']>>(n.sellerCounter?.entry ?? 'now');
  const [give, setGive] = useState<string[]>(n.sellerCounter?.playersOffered ?? []);
  const swapCandidates = useMemo(
    () =>
      tradeablePlayers(g, club.id)
        .filter((q) => q.id !== p.id)
        .sort((a, b) => playerTradeValue(g, b) - playerTradeValue(g, a)),
    [g, club.id, p.id],
  );
  const swapVal = offeredPlayersValue(g, { fee: 0, sellOnPercent: 0, playersOffered: give }, club.id);
  const timing = 1 - 0.04 * (Math.max(1, inst) - 1);
  const effective = fee * timing + swapVal + bonus * 0.5 + (sellOn / 100) * playerValue(g, p) * 0.25;
  const chance = Math.round(Math.max(0, Math.min(1, (effective / Math.max(1, ask) - 0.6) / 0.4)) * 100);
  const part = inst > 1 ? Math.round(fee / inst) : fee;
  const payNow = fee - part * (inst - 1);
  const [loanFee, setLoanFee] = useState(Math.round(ask * 0.04));
  const [loan, setLoan] = useState<LoanTerms>(n.loanCounter ?? { wageShare: 60, buyOption: null, obligatory: false });

  // Jugador
  const start: ContractOffer = n.playerCounter ?? { wage: ex.minWage, years: ex.years, releaseClause: null, goalBonus: 0, cleanSheetBonus: 0, signingBonus: 0, agentFee: Math.round(ex.agentFee * 0.8), role };
  const [offer, setOffer] = useState<ContractOffer>(start);
  const num = (k: keyof ContractOffer) => (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setOffer((o) => ({ ...o, [k]: raw === '' ? (k === 'releaseClause' ? null : 0) : Number(raw) }) as ContractOffer);
  };
  const seasonCost = offer.wage * 52 + offer.signingBonus / Math.max(1, offer.years) + offer.agentFee / Math.max(1, offer.years);

  const queueResult = (r: { queued: true; replyAbs: number } | { queued: false; message: Parameters<typeof tm>[0] }) =>
    notify(r.queued ? t('ui.tr.sentQueued', { n: Math.max(1, r.replyAbs - absDayOf(g)) }) : tm(r.message));
  const idx = stepIndex(n);
  const talks = n.stage === 'club' || n.stage === 'player';

  return (
    <Panel title={`${t(`ui.tr.kind.${n.kind}`)} · ${t(`ui.tr.stage.${n.stage}`)}`}>
      <div className="neg-head">
        <Face player={p} size={72} club={seller} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="disp link" style={{ fontSize: 26 }} onClick={() => useGame.getState().openPlayer(p.id)}>
            {fullName(p)}
          </div>
          <div className="row dim" style={{ fontSize: 13, flexWrap: 'wrap' }}>
            <PosBadge pos={p.position} /> {t('ui.ageN', { n: p.age })} <Flag code={p.nationality} size={16} />
            {seller && (
              <>
                <Crest club={seller} size={18} /> {seller.name}
              </>
            )}
          </div>
        </div>
        <div className="neg-meters">
          <div>
            <div className="row" style={{ fontSize: 12 }}>
              <span className="dim">{t('ui.neg.interest')}</span>
              <span className="spacer" />
              <span className="b">{ex.interest}%</span>
            </div>
            <Meter value={ex.interest} color={ex.interest >= 60 ? 'var(--good)' : ex.interest >= 30 ? 'var(--warn)' : 'var(--bad)'} />
          </div>
          <div data-tension>
            <div className="row" style={{ fontSize: 12 }}>
              <span className="dim">{t('ui.neg.tension')}</span>
              <span className="spacer" />
              <span className="b">{tension}%</span>
            </div>
            <Meter value={tension} color={tension >= 70 ? 'var(--bad)' : tension >= 40 ? 'var(--warn)' : 'var(--good)'} />
          </div>
        </div>
      </div>

      <div className="stepper">
        {STEPS.map((s, i) => (
          <div key={s} className={`step ${idx < 0 ? 'bad' : i < idx ? 'done' : i === idx ? 'now' : ''}`}>
            <i>{i + 1}</i>
            <span>{t(`ui.neg.step.${s}`)}</span>
          </div>
        ))}
      </div>

      {awaiting && (
        <div className="verdict" data-awaiting style={{ margin: '12px 0', borderLeftColor: 'var(--warn)' }}>
          <div className="b">{awaiting.kind === 'enquiry' ? t('ui.neg.enquiryWait', { n: awaitDays }) : t('ui.tr.awaiting', { n: awaitDays })}</div>
          <Meter value={((absDayOf(g) - awaiting.sentAbs) / Math.max(1, awaiting.replyAbs - awaiting.sentAbs)) * 100} />
        </div>
      )}

      {n.stage === 'enquiry' && !awaiting && <p className="dim">{t('ui.neg.enquiryHelp')}</p>}

      {n.stage === 'renegotiation' && n.renegotiation && (
        <div className="reneg" data-renegotiation>
          <h4>{t(`ui.neg.reneg.${n.renegotiation.reason}`)}</h4>
          <p className="dim">
            {n.renegotiation.feeRaisePct > 0
              ? t('ui.neg.reneg.fee', { pct: n.renegotiation.feeRaisePct, fee: Math.round((n.bid?.fee ?? 0) * (1 + n.renegotiation.feeRaisePct / 100)) })
              : t('ui.neg.reneg.wage', { pct: n.renegotiation.wageRaisePct, wage: Math.round((n.contract?.wage ?? 0) * (1 + n.renegotiation.wageRaisePct / 100)) })}
          </p>
          <div className="row">
            <button className="btn primary" onClick={() => notify(tm(mutate((s) => resolveRenegotiation(s, n.id, true, new Rng(s.rngState ^ s.day))).message))}>
              {t('ui.neg.reneg.accept')}
            </button>
            <button className="btn danger" onClick={() => notify(tm(mutate((s) => resolveRenegotiation(s, n.id, false)).message))}>
              {t('ui.neg.withdraw')}
            </button>
          </div>
        </div>
      )}

      {talks && (
        <>
          <div className="neg-cols">
            <section className={`neg-col ${n.stage === 'player' ? 'ok' : ''}`}>
              <h4>
                {t('ui.neg.club')}
                {n.stage === 'player' && <span className="tag good">✓ {formatMoney(n.bid?.fee ?? 0)}</span>}
              </h4>
              {n.stage === 'club' && n.kind === 'transfer' && (
                <div className="grid">
                  <div className="dim" style={{ fontSize: 13 }}>
                    {t('ui.tr.valueAsk', { value: playerValue(g, p), fee: ask })}
                    {p.contract?.releaseClause ? ` · ${t('ui.tr.clause', { amount: p.contract.releaseClause })}` : ''}
                  </div>
                  {n.sellerCounter && <div className="tag warn">{t('ui.tr.counter', { fee: n.sellerCounter.fee, pct: n.sellerCounter.sellOnPercent })}</div>}
                  <div className="grid c2">
                    <div className="field">
                      <label>{t('ui.tr.fee')}</label>
                      <input type="number" value={fee} onChange={(e) => setFee(Number(e.target.value))} />
                    </div>
                    <div className="field">
                      <label>{t('ui.neg.instalments')}</label>
                      <select value={inst} onChange={(e) => setInst(Number(e.target.value))}>
                        {Array.from({ length: MAX_INSTALMENTS }, (_, i) => i + 1).map((k) => (
                          <option key={k} value={k}>
                            {k === 1 ? t('ui.neg.upfront') : t('ui.neg.nPayments', { n: k })}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label>{t('ui.neg.bonus')}</label>
                      <input type="number" min={0} value={bonus} onChange={(e) => setBonus(Number(e.target.value))} />
                    </div>
                    <div className="field">
                      <label>{t('ui.tr.sellOn')}</label>
                      <input type="number" min={0} max={50} value={sellOn} onChange={(e) => setSellOn(Number(e.target.value))} />
                    </div>
                    <div className="field" style={{ gridColumn: 'span 2' }}>
                      <label>{t('ui.neg.entry')}</label>
                      <select value={entry} onChange={(e) => setEntry(e.target.value as typeof entry)}>
                        <option value="now">{t('ui.neg.entry.now')}</option>
                        <option value="nextWindow">{t('ui.neg.entry.nextWindow')}</option>
                        <option value="nextSeason">{t('ui.neg.entry.nextSeason')}</option>
                      </select>
                    </div>
                  </div>
                  <div className="neg-sum">
                    <span>{t('ui.neg.payNow', { amount: payNow })}</span>
                    <span>{t('ui.neg.payLater', { amount: fee - payNow })}</span>
                    {entry !== 'now' && <span>{t('ui.neg.entryOn', { when: t(`ui.neg.entry.${entry}`) })}</span>}
                  </div>
                  <FundingHelper payNow={payNow} onInstalments={() => setInst(MAX_INSTALMENTS)} />
                  <details className="neg-more">
                    <summary>{t('ui.tr.addPlayers')}</summary>
                    <p className="tv-help" style={{ marginTop: 6 }}>
                      {t('ui.tr.addPlayersHelp', { n: MAX_PLAYERS_IN_DEAL })}
                    </p>
                    <div style={{ maxHeight: 170, overflow: 'auto', border: '1px solid var(--line)' }}>
                      {swapCandidates.map((q) => {
                        const on = give.includes(q.id);
                        return (
                          <label key={q.id} className="tv-row" data-swap={q.id} style={{ cursor: 'pointer', opacity: !on && give.length >= MAX_PLAYERS_IN_DEAL ? 0.45 : 1 }}>
                            <input
                              type="checkbox"
                              checked={on}
                              disabled={!on && give.length >= MAX_PLAYERS_IN_DEAL}
                              onChange={() => setGive((arr) => (arr.includes(q.id) ? arr.filter((x) => x !== q.id) : arr.length >= MAX_PLAYERS_IN_DEAL ? arr : [...arr, q.id]))}
                            />
                            <PosBadge pos={q.position} />
                            <span className="nm ellipsis">{q.lastName}</span>
                            <span className="faint" style={{ fontSize: 11 }}>
                              {q.age}
                            </span>
                            <span className="b">{overall(q)}</span>
                            <span className="faint" style={{ minWidth: 70, textAlign: 'right' }}>
                              {formatMoney(playerTradeValue(g, q))}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </details>
                  <div>
                    <div className="row" style={{ fontSize: 12 }}>
                      <span className="dim">{t('ui.tr.dealMeter')}</span>
                      <span className="spacer" />
                      <span className="b">{t('ui.tr.chance', { n: chance })}</span>
                    </div>
                    <Meter value={Math.min(100, (effective / Math.max(1, ask)) * 100)} color={chance >= 75 ? 'var(--good)' : chance >= 35 ? 'var(--warn)' : 'var(--bad)'} />
                  </div>
                  <button
                    className="btn primary"
                    disabled={!!awaiting}
                    data-send-bid
                    onClick={() => {
                      queueResult(mutate((s) => queueBid(s, n.id, { fee, sellOnPercent: sellOn, playersOffered: give, instalments: inst, bonus, entry })));
                      setGive([]);
                    }}
                  >
                    {t('ui.tr.sendBid')}
                  </button>
                </div>
              )}
              {n.stage === 'club' && n.kind === 'loan' && (
                <div className="grid">
                  <div className="dim">{t('ui.tr.loanHelp', { wage: p.contract?.wage ?? 0 })}</div>
                  {n.loanCounter && (
                    <div className="tag warn">
                      {t('ui.tr.loanCounter', { share: n.loanCounter.wageShare })}
                      {n.loanCounter.buyOption ? ` · ${t('ui.tr.option', { fee: n.loanCounter.buyOption })}` : ''}
                    </div>
                  )}
                  <div className="grid c2">
                    <div className="field">
                      <label>{t('ui.tr.loanFee')}</label>
                      <input type="number" value={loanFee} onChange={(e) => setLoanFee(Number(e.target.value))} />
                    </div>
                    <div className="field">
                      <label>{t('ui.tr.wageShare', { n: loan.wageShare })}</label>
                      <input type="range" min={0} max={100} step={5} value={loan.wageShare} onChange={(e) => setLoan({ ...loan, wageShare: Number(e.target.value) })} />
                    </div>
                    <div className="field">
                      <label>{t('ui.tr.buyOption')}</label>
                      <input type="number" value={loan.buyOption ?? ''} placeholder={t('ui.tr.noOption')} onChange={(e) => setLoan({ ...loan, buyOption: e.target.value === '' ? null : Number(e.target.value) })} />
                    </div>
                    <label className="toggle" style={{ alignSelf: 'end' }}>
                      <input type="checkbox" checked={loan.obligatory} disabled={!loan.buyOption} onChange={(e) => setLoan({ ...loan, obligatory: e.target.checked })} />
                      <span>{t('ui.tr.obligatory')}</span>
                    </label>
                  </div>
                  <button className="btn primary" disabled={!!awaiting} onClick={() => queueResult(mutate((s) => queueLoanBid(s, n.id, loanFee, loan)))}>
                    {t('ui.tr.sendLoan')}
                  </button>
                </div>
              )}
            </section>

            <section className={`neg-col ${n.playerAgreed ? 'ok' : ''}`}>
              <h4>
                {t('ui.neg.player')}
                {n.playerAgreed && <span className="tag good">✓ {t('ui.neg.agreed')}</span>}
              </h4>
              {n.kind === 'loan' && n.stage === 'club' ? (
                <p className="dim">{t('ui.neg.loanPlayer')}</p>
              ) : (
                <div className="grid">
                  <div className="dim" style={{ fontSize: 13 }}>
                    {t('ui.tr.agentSuggests', { wage: ex.idealWage, minWage: ex.minWage, years: ex.years, fee: ex.agentFee, interest: ex.interest })}
                    {ex.revenueShare > 0.1 && <div className="bad">⚠ {t('ui.tr.wageWarning', { pct: Math.round(ex.revenueShare * 100) })}</div>}
                    {ex.reasons.map((r, i) => (
                      <div key={i} className="faint">
                        · {tm(r)}
                      </div>
                    ))}
                  </div>
                  <div className="grid c2">
                    <div className="field">
                      <label>{t('ui.tr.wage')}</label>
                      <input type="number" value={offer.wage} onChange={num('wage')} />
                    </div>
                    <div className="field">
                      <label>{t('ui.tr.years')}</label>
                      <input type="number" min={1} max={5} value={offer.years} onChange={num('years')} />
                    </div>
                    <div className="field" style={{ gridColumn: 'span 2' }}>
                      <label>
                        {t('ui.neg.role')} <span className="faint">({t('ui.neg.roleExpects', { role: t(`ui.status.${role}`) })})</span>
                      </label>
                      <select value={offer.role ?? role} onChange={(e) => setOffer((o) => ({ ...o, role: e.target.value as SquadStatus }))}>
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {t(`ui.status.${r}`)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label>{t('ui.tr.signingBonus')}</label>
                      <input type="number" value={offer.signingBonus} onChange={num('signingBonus')} />
                    </div>
                    <div className="field">
                      <label>{t('ui.tr.agentFee')}</label>
                      <input type="number" value={offer.agentFee} onChange={num('agentFee')} />
                    </div>
                  </div>
                  <details className="neg-more">
                    <summary>{t('ui.neg.clauses')}</summary>
                    <div className="grid c2" style={{ marginTop: 8 }}>
                      <div className="field">
                        <label>{t('ui.neg.appBonus')}</label>
                        <input type="number" value={offer.appearanceBonus ?? 0} onChange={num('appearanceBonus')} />
                      </div>
                      <div className="field">
                        <label>{t('ui.tr.goalBonus')}</label>
                        <input type="number" value={offer.goalBonus} onChange={num('goalBonus')} />
                      </div>
                      <div className="field">
                        <label>{t('ui.tr.csBonus')}</label>
                        <input type="number" value={offer.cleanSheetBonus} onChange={num('cleanSheetBonus')} />
                      </div>
                      <div className="field">
                        <label>{t('ui.tr.releaseClause')}</label>
                        <input type="number" value={offer.releaseClause ?? ''} onChange={num('releaseClause')} />
                      </div>
                      <div className="field">
                        <label>{t('ui.neg.autoRaise')}</label>
                        <input type="number" min={0} max={30} value={offer.autoRaisePct ?? 0} onChange={num('autoRaisePct')} />
                      </div>
                      <div className="field">
                        <label>{t('ui.neg.autoCut')}</label>
                        <input type="number" min={0} max={30} value={offer.autoCutPct ?? 0} onChange={num('autoCutPct')} />
                      </div>
                    </div>
                  </details>
                  <div className="neg-sum">
                    <span>{t('ui.neg.seasonCost', { amount: Math.round(seasonCost) })}</span>
                    <span className={wageRoom - offer.wage < 0 ? 'bad' : ''}>{t('ui.neg.wageLeft', { amount: wageRoom - offer.wage })}</span>
                  </div>
                  <button className="btn primary" disabled={!!awaiting || !!n.playerAgreed} data-send-contract onClick={() => queueResult(mutate((s) => queueContract(s, n.id, offer)))}>
                    {t('ui.tr.proposeContract')}
                  </button>
                </div>
              )}
            </section>
          </div>

          <div className="neg-foot">
            <button
              className="btn"
              disabled={!!awaiting || n.kind !== 'transfer'}
              data-delegate
              onClick={() => {
                const r = mutate((s) =>
                  delegateNegotiation(s, n.id, { maxFee: Math.round(Math.min(club.finances.transferBudget, ask * 1.08)), maxWage: Math.max(0, Math.round(wageRoom)) }, new Rng(s.rngState ^ s.day)),
                );
                notify(tm(r.message));
              }}
              title={t('ui.neg.delegateHelp')}
            >
              {t('ui.neg.delegate')}
            </button>
            <span className="spacer" />
            <button className="btn danger" onClick={() => mutate((s) => void (s.negotiations[n.id].stage = 'collapsed'))}>
              {t('ui.neg.withdraw')}
            </button>
          </div>
        </>
      )}

      {n.stage === 'agreed' && (
        <p className="dim">{n.entryAbs ? t('ui.neg.scheduled', { when: formatGameDate(Math.floor(n.entryAbs / 400), n.entryAbs % 400) }) : t('ui.tr.done')}</p>
      )}
      {n.stage === 'collapsed' && <p className="dim">{t('ui.tr.broken')}</p>}

      <div className="neg-report">
        {report?.analysis ? <AnalysisReport report={report} /> : <OrderReport playerId={p.id} />}
      </div>

      <div style={{ marginTop: 10 }}>
        {n.log.map((l, i) => (
          <div key={i} className="faint" style={{ fontSize: 12 }}>
            › {tm(l)}
          </div>
        ))}
      </div>
    </Panel>
  );
}

/** Contratos y cláusulas: vencimientos, cláusulas, primas y compromisos de pago futuros. */
function Contracts() {
  const g = useGameState();
  const { openPlayer } = useGame();
  const club = g.clubs[g.userClubId as string];
  const squad = clubPlayers(g, club.id).filter((p) => !p.academy && p.contract);
  const commitments = club.finances.commitments ?? [];
  const wages = squad.reduce((s, p) => s + (p.contract?.wage ?? 0), 0);
  return (
    <div className="grid">
      <div className="grid c3">
        <Panel>
          <div className="statbig">
            <div className="k">{t('ui.con.wageBill')}</div>
            <div className="v2">{formatMoney(wages)}</div>
          </div>
        </Panel>
        <Panel>
          <div className="statbig">
            <div className="k">{t('ui.con.expiring')}</div>
            <div className="v2">{squad.filter((p) => (p.contract?.expiresSeason ?? 0) <= g.season).length}</div>
          </div>
        </Panel>
        <Panel>
          <div className="statbig">
            <div className="k">{t('ui.con.future')}</div>
            <div className="v2">{formatMoney(commitments.reduce((s, c) => s + c.amount, 0))}</div>
          </div>
        </Panel>
      </div>
      <Panel title={t('ui.con.squad')} flush>
        <StatGrid
          rows={squad}
          rowKey={(p) => p.id}
          onOpen={(p) => openPlayer(p.id)}
          initialSort={{ key: 'exp', dir: 1 }}
          columns={[
            { key: 'f', label: '', render: (p) => <Face player={p} size={26} club={club} /> },
            { key: 'pos', label: t('ui.col.pos'), render: (p) => <PosBadge pos={p.position} />, sort: (p) => p.position },
            { key: 'name', label: t('ui.col.name'), render: (p) => <span className="link b">{fullName(p)}</span>, sort: (p) => p.lastName },
            { key: 'wage', label: t('ui.tr.wage'), num: true, render: (p) => formatMoney(p.contract?.wage ?? 0), sort: (p) => p.contract?.wage ?? 0 },
            { key: 'exp', label: t('ui.con.until'), num: true, render: (p) => <span className={(p.contract?.expiresSeason ?? 0) <= g.season ? 'warn b' : ''}>{(p.contract?.expiresSeason ?? 0) + 1}</span>, sort: (p) => p.contract?.expiresSeason ?? 0 },
            { key: 'role', label: t('ui.neg.role'), render: (p) => (p.contract?.role ? t(`ui.status.${p.contract.role}`) : '—') },
            { key: 'clause', label: t('ui.tr.releaseClause'), num: true, render: (p) => (p.contract?.releaseClause ? formatMoney(p.contract.releaseClause) : '—') },
            {
              key: 'cl',
              label: t('ui.neg.clauses'),
              render: (p) => (
                <span className="row" style={{ gap: 4 }}>
                  {p.contract?.autoRaisePct ? <span className="tag good">+{p.contract.autoRaisePct}%</span> : null}
                  {p.contract?.autoCutPct ? <span className="tag bad">−{p.contract.autoCutPct}%</span> : null}
                  {p.contract?.appearanceBonus ? <span className="tag">{t('ui.con.apps', { n: p.contract.appearanceBonus })}</span> : null}
                </span>
              ),
            },
          ]}
        />
      </Panel>
      <Panel title={t('ui.con.commitments', { n: commitments.length })} flush>
        {commitments.length === 0 && <div className="dim" style={{ padding: 14 }}>{t('ui.con.noCommitments')}</div>}
        {commitments.map((c) => (
          <div key={c.id} className="row nw" style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)' }}>
            <span className={`tag ${c.kind === 'bonus' ? 'warn' : 'acc'}`}>{t(`ui.con.kind.${c.kind}`)}</span>
            <span className="ellipsis">{g.players[c.playerId] ? fullName(g.players[c.playerId]) : '?'}</span>
            <span className="faint">{c.toClubId ? g.clubs[c.toClubId]?.name : ''}</span>
            <span className="spacer" />
            <span className="faint">{c.kind === 'bonus' ? t('ui.con.bonusWhen', { n: c.apps ?? 0 }) : t('ui.con.dueIn', { y: c.dueSeason })}</span>
            <span className="b">{formatMoney(c.amount)}</span>
          </div>
        ))}
      </Panel>
    </div>
  );
}

function Incoming({ list }: { list: Negotiation[] }) {
  const g = useGameState();
  if (list.length === 0) return <Panel title={t('ui.tr.incomingTitle')}>{t('ui.tr.noIncoming')}</Panel>;
  // La mejor oferta por jugador se marca y sube arriba.
  const bestFee = new Map<string, number>();
  for (const n of list) bestFee.set(n.playerId, Math.max(bestFee.get(n.playerId) ?? 0, n.bid?.fee ?? 0));
  const sorted = [...list].sort((a, b) => (b.bid?.fee ?? 0) - (a.bid?.fee ?? 0));
  return (
    <Panel title={t('ui.tr.incomingTitle')} flush>
      {sorted.map((n) => {
        if (!g.players[n.playerId] || !g.clubs[n.buyerClubId]) return null;
        const best = list.filter((x) => x.playerId === n.playerId).length > 1 && (n.bid?.fee ?? 0) === bestFee.get(n.playerId);
        return <IncomingRow key={n.id} n={n} best={best} />;
      })}
    </Panel>
  );
}

/** Una oferta entrante: aceptar, rechazar o negociar (precio, % de futura venta y cláusula de recompra). */
function IncomingRow({ n, best }: { n: Negotiation; best: boolean }) {
  const g = useGameState();
  const { mutate, notify } = useGame();
  const p = g.players[n.playerId];
  const buyer = g.clubs[n.buyerClubId];
  const [open, setOpen] = useState(false);
  const [fee, setFee] = useState(Math.round((n.bid?.fee ?? 0) * 1.15));
  const [sellOn, setSellOn] = useState(0);
  const [buyBack, setBuyBack] = useState(0);
  const swapped = (n.bid?.playersOffered ?? []).map((id) => g.players[id]).filter((q): q is Player => !!q);
  const rounds = n.incomingRounds ?? 0;
  const respond = (accept: boolean) => notify(tm(mutate((s) => respondToIncomingBid(s, n.id, accept, new Rng(s.rngState ^ s.day)))));
  return (
    <div className="inc-row" data-incoming={n.id}>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <Face player={p} size={34} />
        <span className="b link" onClick={() => useGame.getState().openPlayer(p.id)}>
          {fullName(p)}
        </span>
        <span className="dim">→</span>
        <Crest club={buyer} size={24} />
        <span>{buyer.name}</span>
        <span className="tag">{t(`ui.tr.kind.${n.kind}`)}</span>
        {best && <span className="tag good">{t('ui.tr.bestOffer')}</span>}
        <span className="disp" style={{ fontSize: 20 }}>
          {formatMoney(n.bid?.fee ?? 0)}
        </span>
        {swapped.map((q) => (
          <span key={q.id} className="tag acc" title={t('ui.tr.swapTip')}>
            + {fullName(q)} ({overall(q)})
          </span>
        ))}
        {n.bid?.buyBack ? <span className="tag warn">{t('ui.tr.buyBackTag', { amount: n.bid.buyBack })}</span> : null}
        {n.kind === 'loan' && n.loan && (
          <span className="faint">
            {t('ui.tr.loanTerms', { share: n.loan.wageShare })}
            {n.loan.buyOption ? ` · ${t('ui.tr.option', { fee: n.loan.buyOption })}` : ''}
          </span>
        )}
        <span className="faint">
          ({t('ui.tr.valueN', { value: playerValue(g, p) })}
          {p.wantsToLeave ? `, ${t('ui.wantsOut')}` : ''})
        </span>
        <span className="spacer" />
        <button className="btn sm primary" onClick={() => respond(true)}>
          {t('ui.accept')}
        </button>
        {n.kind === 'transfer' && rounds < 3 && (
          <button className="btn sm" data-negotiate onClick={() => setOpen((o) => !o)}>
            {t('ui.tr.negotiate')}
          </button>
        )}
        <button className="btn sm danger" onClick={() => respond(false)}>
          {t('ui.reject')}
        </button>
      </div>
      {open && n.kind === 'transfer' && (
        <div className="inc-form" data-counter-form>
          <div className="grid c3">
            <div className="field">
              <label>{t('ui.tr.counterFee')}</label>
              <input type="number" min={0} value={fee} onChange={(e) => setFee(Number(e.target.value))} />
            </div>
            <div className="field">
              <label>{t('ui.tr.sellOn')}</label>
              <input type="number" min={0} max={50} value={sellOn} onChange={(e) => setSellOn(Number(e.target.value))} />
            </div>
            <div className="field">
              <label>{t('ui.tr.buyBack')}</label>
              <input type="number" min={0} value={buyBack} onChange={(e) => setBuyBack(Number(e.target.value))} />
            </div>
          </div>
          <div className="faint" style={{ fontSize: 12 }}>
            {t('ui.tr.counterHelp', { n: 3 - rounds })}
          </div>
          <button
            className="btn sm acc"
            data-send-counter
            onClick={() => {
              const r = mutate((s) => counterIncomingBid(s, n.id, { fee, sellOnPercent: sellOn, buyBack: buyBack > 0 ? buyBack : null }, new Rng(s.rngState ^ s.day)));
              notify(tm(r.message));
              if (r.decision === 'counter') setFee(Math.round((g.negotiations[n.id]?.bid?.fee ?? fee) * 1.05));
              if (r.decision !== 'counter') setOpen(false);
            }}
          >
            {t('ui.tr.sendCounter')}
          </button>
        </div>
      )}
    </div>
  );
}

/** Jugadores vendidos con cláusula de recompra que aún puedes recuperar. */
function BuyBacks() {
  const g = useGameState();
  const { mutate, notify } = useGame();
  const club = g.clubs[g.userClubId as string];
  const list = Object.values(g.players).filter((p) => p.buyBack && p.buyBack.clubId === club.id && p.clubId !== club.id && !p.retired && g.season <= p.buyBack.untilSeason);
  return (
    <Panel title={t('ui.tr.buyBackTitle', { n: list.length })} flush>
      {list.length === 0 && <div className="dim" style={{ padding: 12 }}>{t('ui.tr.buyBackNone')}</div>}
      {list.map((p) => (
        <div key={p.id} className="row" style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
          <Face player={p} size={28} club={p.clubId ? g.clubs[p.clubId] : null} />
          <span className="b">{fullName(p)}</span>
          <span className="faint">{p.clubId ? g.clubs[p.clubId]?.name : ''}</span>
          <span className="faint">{t('ui.tr.buyBackUntil', { n: (p.buyBack?.untilSeason ?? g.season) + 1 })}</span>
          <span className="spacer" />
          <button className="btn sm acc" data-exercise-buyback={p.id} onClick={() => notify(tm(mutate((s) => exerciseBuyBack(s, p.id)).message))}>
            {t('ui.tr.buyBackDo', { amount: p.buyBack?.fee ?? 0 })}
          </button>
        </div>
      ))}
    </Panel>
  );
}

/** Your transfer list, loan list, players out on loan and players in on loan. */
function MyMarket() {
  const g = useGameState();
  const { openPlayer, mutate, openClub } = useGame();
  const club = g.clubs[g.userClubId as string];
  const mine = clubPlayers(g, club.id);
  const listed = mine.filter((p) => p.listed);
  const loanedIn = mine.filter((p) => p.loan);
  const loanedOut = Object.values(g.players).filter((p) => p.loan?.parentClubId === club.id);
  const row = (p: Player, extra: ReactNode) => (
    <div key={p.id} className="row nw" style={{ padding: '7px 10px', borderBottom: '1px solid var(--line)' }}>
      <Face player={p} size={28} club={p.clubId ? g.clubs[p.clubId] : null} />
      <PosBadge pos={p.position} />
      <span className="b link ellipsis" onClick={() => openPlayer(p.id)}>
        {fullName(p)}
      </span>
      <span className="spacer" />
      {extra}
    </div>
  );
  const raise = suggestSales(g, club.id, 25_000_000).picks;
  return (
    <>
    <div className="grid c3">
      <Panel title={t('ui.tr.myListed', { n: listed.length })} flush>
        {listed.length === 0 && <div className="dim" style={{ padding: 12 }}>{t('ui.tr.listHelp')}</div>}
        {listed.map((p) =>
          row(
            p,
            <>
              <span className="tag warn">{t(`ui.listed.${p.listed}`)}</span>
              <button className="btn sm ghost" onClick={() => mutate(() => (p.listed = null))}>
                ✕
              </button>
            </>,
          ),
        )}
      </Panel>
      <Panel title={t('ui.tr.loanedOut', { n: loanedOut.length })} flush>
        {loanedOut.length === 0 && <div className="dim" style={{ padding: 12 }}>—</div>}
        {loanedOut.map((p) =>
          row(
            p,
            <>
              {p.clubId && (
                <span className="link" onClick={() => openClub(p.clubId as string)}>
                  <Crest club={g.clubs[p.clubId]} size={18} />
                </span>
              )}
              <span className="faint" style={{ fontSize: 12 }}>
                {t('ui.tr.loanApps', { n: p.stats.apps, g: p.stats.goals })}
              </span>
            </>,
          ),
        )}
      </Panel>
      <Panel title={t('ui.tr.loanedIn', { n: loanedIn.length })} flush>
        {loanedIn.length === 0 && <div className="dim" style={{ padding: 12 }}>—</div>}
        {loanedIn.map((p) =>
          row(
            p,
            <span className="faint" style={{ fontSize: 12 }}>
              {p.loan?.buyOption ? t('ui.tr.option', { fee: p.loan.buyOption }) : t('ui.tr.untilN', { n: (p.loan?.untilSeason ?? g.season) + 1 })}
            </span>,
          ),
        )}
      </Panel>
    </div>
    <Panel title={t('ui.tr.raise')} flush>
      <p className="dim" style={{ margin: 0, padding: '10px 12px', fontSize: 13 }}>
        {t('ui.tr.raiseHelp')}
      </p>
      {raise.map((s) =>
        row(
          s.player,
          <>
            <span className="faint">{formatMoney(s.income)}</span>
            <button className="btn sm" disabled={!!s.player.listed} data-raise={s.player.id} onClick={() => mutate(() => (s.player.listed = 'transfer'))}>
              {s.player.listed ? t('ui.tr.short.listed') : t('ui.tr.putOnSale')}
            </button>
          </>,
        ),
      )}
    </Panel>
    </>
  );
}

function History() {
  const g = useGameState();
  const openClub = useGame((s) => s.openClub);
  const [mineOnly, setMineOnly] = useState(false);
  const rows = [...g.transfers]
    .reverse()
    .filter((x) => !mineOnly || x.toClubId === g.userClubId || x.fromClubId === g.userClubId)
    .slice(0, 400);
  return (
    <Panel
      title={t('ui.tr.historyTitle')}
      flush
      actions={
        <label className="toggle">
          <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
          <span>{t('ui.inbox.myClub')}</span>
        </label>
      }
    >
      <StatGrid
        rows={rows}
        rowKey={(x) => `${x.playerId}-${x.season}-${x.day}-${x.toClubId}`}
        columns={[
          { key: 'd', label: t('ui.col.season'), render: (x) => x.season },
          { key: 'p', label: t('ui.col.player'), render: (x) => (g.players[x.playerId] ? fullName(g.players[x.playerId]) : '?') },
          { key: 'f', label: t('ui.col.from'), render: (x) => (x.fromClubId && g.clubs[x.fromClubId] ? <ClubName club={g.clubs[x.fromClubId]} onOpen={openClub} size={18} /> : '–') },
          { key: 't', label: t('ui.col.to'), render: (x) => (g.clubs[x.toClubId] ? <ClubName club={g.clubs[x.toClubId]} onOpen={openClub} size={18} /> : '–') },
          { key: 'k', label: '', render: (x) => (x.loan ? <span className="tag">{t('ui.tr.kind.loan')}</span> : '') },
          { key: 'fee', label: t('ui.tr.fee'), num: true, render: (x) => formatMoney(x.fee), sort: (x) => x.fee },
          { key: 'w', label: t('ui.tr.wage'), num: true, render: (x) => formatMoney(x.wage), sort: (x) => x.wage },
          {
            key: 'v',
            label: t('ui.tr.col.result'),
            render: (x) => {
              const pl = g.players[x.playerId];
              if (!pl || x.toClubId !== g.userClubId || pl.clubId !== g.userClubId) return '';
              const o = signingOutcome(pl);
              return o.score === null ? (
                <span className="faint">{t('ui.tr.outcomeNone')}</span>
              ) : (
                <span title={t('ui.tr.appsRating', { apps: o.apps, r: o.avgRating.toFixed(1) })}>
                  <span className="stars">{stars(o.stars)}</span> <span className="faint">{o.score}</span>
                </span>
              );
            },
          },
        ]}
      />
    </Panel>
  );
}
