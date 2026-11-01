// Global search: countries first, then clubs, then players (as requested: países → clubes).
import { COUNTRIES, countryName, displayName, fullName, overall, t, type Club, type CountryDef, type Player } from '@pitchside/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '../store/game';
import { Crest, Face, Flag, OvrChip, PosBadge } from './ui';

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

type Hit = { kind: 'country'; c: CountryDef } | { kind: 'club'; c: Club } | { kind: 'player'; p: Player };

export function GlobalSearch() {
  const game = useGame((s) => s.game);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const hits = useMemo<Hit[]>(() => {
    const s = norm(q.trim());
    if (!game || s.length < 2) return [];
    const starts = (name: string) => norm(name).startsWith(s);
    const has = (name: string) => norm(name).includes(s);
    const countries = COUNTRIES.filter((c) => has(countryName(c.code)) || has(c.name) || has(c.nameEn) || norm(c.code) === s)
      .sort((a, b) => Number(starts(countryName(b.code))) - Number(starts(countryName(a.code))))
      .slice(0, 6)
      .map((c): Hit => ({ kind: 'country', c }));
    const clubs = Object.values(game.clubs)
      .filter((c) => has(c.name) || has(c.shortName) || (c.city && has(c.city)))
      .sort((a, b) => Number(starts(b.name)) - Number(starts(a.name)) || b.reputation - a.reputation)
      .slice(0, 8)
      .map((c): Hit => ({ kind: 'club', c }));
    const players: Hit[] = [];
    if (s.length >= 3) {
      const found: Player[] = [];
      for (const p of Object.values(game.players)) {
        if (p.retired || p.academy) continue;
        if (has(`${p.firstName} ${p.lastName}`)) found.push(p);
      }
      found.sort((a, b) => b.reputation - a.reputation);
      for (const p of found.slice(0, 8)) players.push({ kind: 'player', p });
    }
    return [...countries, ...clubs, ...players];
  }, [q, game]);

  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const go = (h: Hit) => {
    const st = useGame.getState();
    if (h.kind === 'country') st.openCountry(h.c.code);
    else if (h.kind === 'club') st.openClub(h.c.id);
    else st.openPlayer(h.p.id);
    setOpen(false);
    setQ('');
  };

  let lastKind = '';
  return (
    <div className="gsearch" ref={box}>
      <input
        ref={input}
        value={q}
        placeholder={t('ui.search.placeholder')}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setSel((v) => Math.min(hits.length - 1, v + 1));
          else if (e.key === 'ArrowUp') setSel((v) => Math.max(0, v - 1));
          else if (e.key === 'Enter' && hits[sel]) go(hits[sel]);
          else if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && hits.length > 0 && (
        <div className="gsearch-pop">
          {hits.map((h, i) => {
            const header = h.kind !== lastKind ? <div className="gs-h">{t(`ui.search.${h.kind}`)}</div> : null;
            lastKind = h.kind;
            const club = h.kind === 'player' && h.p.clubId ? game?.clubs[h.p.clubId] : null;
            return (
              <div key={h.kind + (h.kind === 'country' ? h.c.code : h.kind === 'club' ? h.c.id : h.p.id)}>
                {header}
                <div className={`gs-row ${i === sel ? 'sel' : ''}`} onMouseEnter={() => setSel(i)} onClick={() => go(h)}>
                  {h.kind === 'country' && (
                    <>
                      <Flag code={h.c.code} size={22} />
                      <span className="b">{countryName(h.c.code)}</span>
                      <span className="faint">{h.c.confederation}</span>
                    </>
                  )}
                  {h.kind === 'club' && (
                    <>
                      <Crest club={h.c} size={22} />
                      <span className="b ellipsis">{h.c.name}</span>
                      <Flag code={h.c.countryCode} size={16} />
                      <span className="faint">{game?.leagues[h.c.leagueId] ? displayName(game.leagues[h.c.leagueId].name) : ''}</span>
                    </>
                  )}
                  {h.kind === 'player' && (
                    <>
                      <Face player={h.p} size={24} club={club} />
                      <span className="b ellipsis">{fullName(h.p)}</span>
                      <PosBadge pos={h.p.position} />
                      <span className="faint ellipsis">{club?.name ?? t('ui.freeAgent')}</span>
                      <OvrChip v={overall(h.p)} />
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
