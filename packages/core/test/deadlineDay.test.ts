import { describe, expect, it } from 'vitest';
import {
  CALENDAR,
  advanceDeadlineHours,
  createWorld,
  deadlineLive,
  deadlineLiveAvailable,
  finishDeadlineLive,
  isDeadlineDay,
  setUserClub,
  startDeadlineLive,
  startEnquiry,
  type GameState,
} from '../src';

function setup(seed = 17): GameState {
  const g = createWorld({ seed, season: 2026, loadedCountries: ['ENG'] });
  const club = Object.values(g.clubs).find((c) => c.countryCode === 'ENG' && !c.isUser)!;
  setUserClub(g, club.id, { firstName: 'QA', lastName: 'Bot', nationality: 'ENG' });
  return g;
}

describe('Deadline Day en vivo', () => {
  it('sólo está disponible el último día de la ventana', () => {
    const g = setup();
    g.day = CALENDAR.summerWindow[1] - 1;
    expect(deadlineLiveAvailable(g)).toBe(false);
    g.day = CALENDAR.summerWindow[1];
    expect(isDeadlineDay(g.day)).toBe(true);
    expect(deadlineLiveAvailable(g)).toBe(true);
  });

  it('avanza hora a hora, es determinista y cierra el día a las 20 h', () => {
    const run = () => {
      const g = setup();
      g.day = CALENDAR.summerWindow[1];
      const target = Object.values(g.players).find((p) => p.clubId && p.clubId !== g.userClubId && p.reputation <= 55 && p.contract)!;
      g.clubs[g.userClubId!].finances.transferBudget = 500e6;
      startEnquiry(g, target.id, g.userClubId!);
      startDeadlineLive(g);
      advanceDeadlineHours(g, 1);
      expect(deadlineLive(g)!.hour).toBe(1);
      advanceDeadlineHours(g, 30);
      const live = deadlineLive(g)!;
      expect(live.finished).toBe(true);
      expect(live.hour).toBe(20);
      return live.feed.map((e) => `${e.hour}:${e.kind}`).join('|');
    };
    expect(run()).toBe(run());
  });

  it('al cerrar no deja respuestas colgadas para hoy y no vuelve a abrirse', () => {
    const g = setup();
    g.day = CALENDAR.summerWindow[1];
    startDeadlineLive(g);
    finishDeadlineLive(g);
    expect(deadlineLiveAvailable(g)).toBe(false);
    const pending = Object.values(g.negotiations).filter((n) => n.awaiting && n.awaiting.replyHour !== undefined);
    expect(pending).toHaveLength(0);
  });
});
