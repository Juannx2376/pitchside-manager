import { describe, expect, it } from 'vitest';
import { FORMATIONS, FORMATION_LIST, closestFormation, describeFormation, formationSlots, makeTactic, positionFromSlot, tacticalPositionFromSlot, ZONE_GRID, ZONE_HEIGHTS, ZONE_LANES } from '../src';

/** Formaciones añadidas con la Táctica V2 (selectores rápidos de la pizarra). */
const NEW_FORMATIONS = ['3-4-2-1', '4-3-1-2', '4-4-1-1', '4-2-2-2'] as const;

describe('formaciones', () => {
  it('las 16 formaciones tienen 11 huecos, portero primero y etiqueta exacta', () => {
    for (const f of FORMATION_LIST) {
      const slots = formationSlots(f);
      expect(slots).toHaveLength(11);
      expect(positionFromSlot(slots[0], true)).toBe('GK');
      // La etiqueta ya no depende del recuento de bandas: sale el nombre real de la formación.
      expect(describeFormation(slots)).toBe(f);
      expect(closestFormation(slots)).toBe(f);
    }
  });

  it('las formaciones expandidas existen y concuerdan con su tabla de posiciones', () => {
    for (const f of NEW_FORMATIONS) {
      expect(FORMATION_LIST).toContain(f);
      const bases = formationSlots(f).map((s, i) => positionFromSlot(s, i === 0));
      expect(bases).toEqual([...FORMATIONS[f]]);
      // Todas las zonas caen dentro de la rejilla 5×7.
      for (const s of formationSlots(f)) {
        const pos = tacticalPositionFromSlot(s);
        const z = ZONE_GRID[pos];
        expect(z.lane).toBeGreaterThanOrEqual(0);
        expect(z.lane).toBeLessThan(ZONE_LANES);
        expect(z.height).toBeGreaterThanOrEqual(0);
        expect(z.height).toBeLessThan(ZONE_HEIGHTS);
      }
    }
  });

  it('ninguna formación deja dos jugadores en la misma coordenada exacta', () => {
    for (const f of FORMATION_LIST) {
      const slots = formationSlots(f);
      const keys = slots.map((s) => `${s.x}:${s.y}`);
      expect(new Set(keys).size).toBe(11);
    }
  });

  it('hacer una formación desde un preset rellena los 11 huecos', () => {
    const tc = makeTactic('t', 't', 'BALANCED', '4-3-1-2');
    expect(tc.slots).toHaveLength(11);
    expect(describeFormation(tc.slots)).toBe('4-3-1-2');
  });
});
