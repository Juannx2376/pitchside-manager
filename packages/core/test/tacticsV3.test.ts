import { describe, expect, it } from 'vitest';
import {
  ATTACK_SIDES,
  FORMATION_COORDS,
  PLAYER_CHANNELS,
  PLAYER_ROLES,
  ROLE_DEFS,
  TACTICAL_POSITIONS,
  TACTIC_TEMPLATES,
  applyTemplate,
  channelLane,
  cloneTactic,
  createWorld,
  ensureTacticV3,
  laneProfile,
  makeTactic,
  migrateState,
  rolesForPosition,
  roleFit,
  roleMultiplier,
  slotPositions,
  slotShape,
  suggestRoles,
  tacticMods,
  tacticalPositionsOf,
  zoneCenter,
  zoneFromCoords,
  type Formation,
  type Player,
} from '../src';

const FORMATIONS = Object.keys(FORMATION_COORDS) as Formation[];

describe('Táctica V3 · posiciones y roles', () => {
  it('cada formación recibe 11 etiquetas válidas y un único portero', () => {
    for (const f of FORMATIONS) {
      const t = makeTactic('t', 't', 'BALANCED', f);
      const labels = tacticalPositionsOf(t.slots);
      expect(labels).toHaveLength(11);
      expect(labels.filter((p) => p === 'POR')).toHaveLength(1);
      for (const l of labels) expect(TACTICAL_POSITIONS).toContain(l);
      expect(slotPositions(t)).toHaveLength(11);
    }
  });

  it('la rejilla de zonas es estable: una zona se proyecta a sí misma', () => {
    for (const f of FORMATIONS) {
      for (const s of makeTactic('t', 't', 'BALANCED', f).slots) {
        const z = zoneFromCoords(s);
        expect(zoneFromCoords(zoneCenter(z))).toEqual(z);
      }
    }
  });

  it('todos los roles tienen definición y cada posición ofrece roles reales', () => {
    for (const r of PLAYER_ROLES) expect(ROLE_DEFS[r]).toBeTruthy();
    for (const p of TACTICAL_POSITIONS) {
      const roles = rolesForPosition(p);
      expect(roles).toContain('default');
      for (const r of roles) expect(PLAYER_ROLES).toContain(r);
    }
  });

  it('encaje y multiplicador de rol están acotados', () => {
    const state = createWorld({ seed: 5, season: 2026, loadedCountries: ['ENG'] });
    const players = Object.values(state.players).slice(0, 80) as Player[];
    for (const p of players) {
      for (const r of PLAYER_ROLES) {
        const fit = roleFit(p, r);
        expect(fit).toBeGreaterThanOrEqual(0);
        expect(fit).toBeLessThanOrEqual(99);
        const m = roleMultiplier(p, r);
        expect(m).toBeGreaterThanOrEqual(0.88);
        expect(m).toBeLessThanOrEqual(1.07);
      }
      expect(roleMultiplier(p, 'default')).toBe(1);
    }
  });

  it('el carril forzado cambia por dónde amenaza el jugador pero no por dónde cubre', () => {
    const auto = slotShape('EI', 'winger', 'auto', 18);
    const inside = slotShape('EI', 'winger', 'center', 18);
    expect(auto.threatLane).toBe(0);
    expect(inside.threatLane).toBe(2);
    expect(inside.coverLane).toBe(auto.coverLane);
    for (const c of PLAYER_CHANNELS) {
      const l = channelLane(c, 50);
      expect(l).toBeGreaterThanOrEqual(0);
      expect(l).toBeLessThanOrEqual(4);
    }
  });

  it('el perfil por carriles se mueve con los carriles asignados', () => {
    const t = makeTactic('t', 't', 'BALANCED', '4-3-3');
    const ovr = new Array(11).fill(70);
    const base = laneProfile(t, ovr);
    const t2 = cloneTactic(t);
    t2.channels = t2.channels!.map((c, i) => (i >= 6 ? 'right' : c));
    const shifted = laneProfile(t2, ovr);
    expect(shifted.threat[4]).toBeGreaterThanOrEqual(base.threat[4]);
    for (const v of [...base.threat, ...base.cover, ...shifted.threat, ...shifted.cover]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});

describe('Táctica V3 · plantillas y migración', () => {
  it('cada plantilla genera 11 huecos coherentes y roles válidos', () => {
    for (const tpl of TACTIC_TEMPLATES) {
      const base = makeTactic('x', 'x', 'BALANCED');
      const t = applyTemplate(base, tpl);
      expect(t.slots).toHaveLength(11);
      expect(t.roles).toHaveLength(11);
      expect(t.channels).toHaveLength(11);
      expect(t.passing).toHaveLength(11);
      expect(t.name).toBe(tpl.id);
      const labels = tacticalPositionsOf(t.slots);
      t.roles.forEach((r, i) => expect(rolesForPosition(labels[i])).toContain(r === 'default' ? 'default' : r));
    }
  });

  it('las plantillas nunca salen del rango de modificadores del motor', () => {
    for (const tpl of TACTIC_TEMPLATES) {
      const m = tacticMods(applyTemplate(makeTactic('x', 'x', 'BALANCED'), tpl));
      for (const v of Object.values(m)) {
        if (typeof v === 'number') {
          expect(Number.isFinite(v)).toBe(true);
          expect(Math.abs(v)).toBeLessThan(2);
        }
      }
    }
  });

  it('ensureTacticV3 completa tácticas antiguas y es idempotente', () => {
    const t = makeTactic('t', 't', 'COUNTER');
    const old = t as unknown as Record<string, unknown>;
    delete old.channels;
    delete old.passing;
    delete old.attackSide;
    delete old.marking;
    delete old.transition;
    delete old.cornerStyle;
    delete old.freeKickStyle;
    ensureTacticV3(t);
    expect(t.channels).toHaveLength(11);
    expect(t.passing).toHaveLength(11);
    expect(ATTACK_SIDES).toContain(t.attackSide);
    expect(t.marking).toBe('mixed');
    expect(t.transition).toBe('regroup');
    const snapshot = JSON.stringify(t);
    ensureTacticV3(t);
    expect(JSON.stringify(t)).toBe(snapshot);
  });

  it('migrateState no falla con partidas v2 y deja las tácticas en V3', () => {
    const state = createWorld({ seed: 9, season: 2026, loadedCountries: ['ENG'] });
    (state as { version: number }).version = 2;
    for (const c of Object.values(state.clubs)) {
      const t = c.tactic?.tactic as unknown as Record<string, unknown> | undefined;
      if (t) {
        delete t.channels;
        delete t.passing;
        delete t.marking;
      }
    }
    const s = migrateState(state);
    for (const c of Object.values(s.clubs)) {
      const t = c.tactic?.tactic;
      if (t) {
        expect(t.channels).toHaveLength(t.slots.length);
        expect(t.marking).toBeTruthy();
      }
    }
  });

  it('suggestRoles propone sólo roles permitidos para su posición', () => {
    const state = createWorld({ seed: 11, season: 2026, loadedCountries: ['ENG'] });
    const club = Object.values(state.clubs)[0];
    const players = club.playerIds.slice(0, 11).map((id) => state.players[id]);
    const t = makeTactic('t', 't', 'TIKI_TAKA');
    const roles = suggestRoles(t, players);
    const labels = tacticalPositionsOf(t.slots);
    expect(roles).toHaveLength(11);
    roles.forEach((r, i) => expect(rolesForPosition(labels[i])).toContain(r));
  });
});
