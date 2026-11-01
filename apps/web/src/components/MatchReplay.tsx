// Repetición 2D de una jugada: campo vertical con las 22 fichas, balón con estela y controles.
import { REPLAY_STEP_MS, buildReplay, shortName, t, type Club, type Highlight, type Player, type TacticSlot } from '@pitchside/core';
import { useEffect, useMemo, useState } from 'react';
import '../hooks.css';

const FALLBACK: TacticSlot[] = [
  { x: 50, y: 95 }, { x: 85, y: 75 }, { x: 62, y: 78 }, { x: 38, y: 78 }, { x: 15, y: 75 },
  { x: 70, y: 55 }, { x: 50, y: 58 }, { x: 30, y: 55 }, { x: 80, y: 30 }, { x: 50, y: 25 }, { x: 20, y: 30 },
];

const slotsOf = (c: Club): TacticSlot[] => (c.tactic.tactic.slots.length === 11 ? c.tactic.tactic.slots : FALLBACK);

export function MatchReplay({ h, home, away, players }: { h: Highlight; home: Club; away: Club; players: Record<string, Player> }) {
  const frames = useMemo(() => buildReplay(h, slotsOf(home), slotsOf(away)), [h, home, away]);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const key = `${h.minute}:${h.type}:${h.playerId ?? ''}`;

  useEffect(() => {
    setStep(0);
    setPlaying(true);
  }, [key]);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setStep((s) => {
        if (s >= frames.length - 1) {
          window.clearInterval(id);
          setPlaying(false);
          return s;
        }
        return s + 1;
      });
    }, REPLAY_STEP_MS / speed);
    return () => window.clearInterval(id);
  }, [playing, speed, frames.length, key]);

  const f = frames[Math.min(step, frames.length - 1)];
  const last = step >= frames.length - 1;
  const scorer = h.playerId ? players[h.playerId] : null;
  const banner = last && (f.kind === 'goal' || f.kind === 'save' || f.kind === 'miss') ? f.kind : null;
  const trail = frames.slice(Math.max(0, step - 3), step);
  const carrierId = (c: Club, idx: number): string | undefined => c.tactic.lineup[idx];

  const dot = (side: 'home' | 'away', club: Club, i: number, p: { u: number; v: number }) => {
    const isCarrier = f.carrier.side === side && f.carrier.idx === i;
    const color = i === 0 ? '#f5c518' : club.colors[side === 'home' ? 0 : 1] || club.colors[0];
    return (
      <span
        key={`${side}${i}`}
        className={`rp-dot ${side} ${isCarrier ? 'carrier' : ''}`}
        style={{ left: `${p.u}%`, top: `${100 - p.v}%`, background: club.colors[0], borderColor: color }}
        title={players[carrierId(club, i) ?? '']?.lastName}
      >
        {i === 0 ? 'P' : i + 1}
      </span>
    );
  };

  return (
    <div className="rp" data-replay>
      <div className="rp-pitch">
        <svg viewBox="0 0 68 105" preserveAspectRatio="none" className="rp-lines" aria-hidden>
          <rect x="1" y="1" width="66" height="103" fill="none" stroke="rgba(255,255,255,.7)" strokeWidth=".5" />
          <line x1="1" y1="52.5" x2="67" y2="52.5" stroke="rgba(255,255,255,.7)" strokeWidth=".5" />
          <circle cx="34" cy="52.5" r="9" fill="none" stroke="rgba(255,255,255,.7)" strokeWidth=".5" />
          <rect x="14" y="1" width="40" height="16" fill="none" stroke="rgba(255,255,255,.7)" strokeWidth=".5" />
          <rect x="14" y="88" width="40" height="16" fill="none" stroke="rgba(255,255,255,.7)" strokeWidth=".5" />
          <rect x="25" y="1" width="18" height="5" fill="none" stroke="rgba(255,255,255,.7)" strokeWidth=".5" />
          <rect x="25" y="99" width="18" height="5" fill="none" stroke="rgba(255,255,255,.7)" strokeWidth=".5" />
        </svg>
        {f.home.map((p, i) => dot('home', home, i, p))}
        {f.away.map((p, i) => dot('away', away, i, p))}
        {trail.map((fr, i) => (
          <span key={i} className="rp-trail" style={{ left: `${fr.ball.u}%`, top: `${100 - fr.ball.v}%`, opacity: 0.15 + i * 0.12 }} />
        ))}
        <span className="rp-ball" style={{ left: `${f.ball.u}%`, top: `${100 - f.ball.v}%` }} />
        {banner && (
          <div className={`rp-banner ${banner}`}>
            {t(`ui.replay.${banner}`)}
            {scorer && banner === 'goal' ? ` · ${shortName(scorer)}` : ''}
          </div>
        )}
      </div>
      <div className="rp-controls">
        <button className="btn sm" onClick={() => (last ? (setStep(0), setPlaying(true)) : setPlaying((p) => !p))} aria-label={t('ui.replay.play')}>
          {last ? '⟲' : playing ? '❚❚' : '▶'}
        </button>
        <input
          type="range"
          min={0}
          max={frames.length - 1}
          value={step}
          onChange={(e) => {
            setPlaying(false);
            setStep(Number(e.target.value));
          }}
          aria-label={t('ui.replay.scrub')}
        />
        <button className="btn sm ghost" onClick={() => setSpeed((s) => (s === 1 ? 2 : s === 2 ? 0.5 : 1))}>
          ×{speed}
        </button>
      </div>
    </div>
  );
}
