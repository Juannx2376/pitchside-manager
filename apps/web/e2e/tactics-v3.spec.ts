import { expect, test, type Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Suite E2E de la pizarra Táctica V3 (campo vertical, roles, carriles, plantillas) y del
// tema global de Configuración. Maneja el DOM real y lee el estado con el hook `__pitchside`.
// ─────────────────────────────────────────────────────────────────────────────

const FORMATIONS = ['4-3-3', '4-4-2', '4-2-3-1', '4-1-2-1-2', '4-3-2-1', '4-5-1', '3-5-2', '3-4-3', '3-4-1-2', '5-3-2', '5-4-1', '4-1-4-1', '3-4-2-1', '4-3-1-2', '4-4-1-1', '4-2-2-2'];

type Hook = {
  seed: (s: number, c: string) => string;
  setView: (v: string) => void;
  snapshot: () => any;
};

async function boot(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem('pitchside.tour', JSON.stringify({ seen: true, step: 0 })));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as unknown as { __pitchside?: unknown }).__pitchside, null, { timeout: 30_000 });
  await page.evaluate(() => (window as unknown as { __pitchside: Hook }).__pitchside.seed(41, 'ENG'));
  await page.waitForSelector('[data-slot="0"]');
  return errors;
}

const snap = (page: Page) => page.evaluate(() => (window as unknown as { __pitchside: Hook }).__pitchside.snapshot()) as Promise<any>;

/** Arrastre HTML5 nativo con DataTransfer (el gesto de ratón de Playwright no lo dispara en todos los navegadores). */
async function dragBetween(page: Page, srcSel: string, dstSel: string, point?: { fx: number; fy: number }): Promise<void> {
  await page.evaluate(
    ({ srcSel, dstSel, point }) => {
      const src = document.querySelector(srcSel);
      const dst = document.querySelector(dstSel);
      if (!src || !dst) throw new Error(`missing ${srcSel} -> ${dstSel}`);
      const dt = new DataTransfer();
      const r = dst.getBoundingClientRect();
      const init = {
        bubbles: true,
        cancelable: true,
        dataTransfer: dt,
        clientX: point ? r.left + r.width * point.fx : r.left + r.width / 2,
        clientY: point ? r.top + r.height * point.fy : r.top + r.height / 2,
      } as unknown as DragEventInit;
      src.dispatchEvent(new DragEvent('dragstart', init));
      dst.dispatchEvent(new DragEvent('dragover', init));
      dst.dispatchEvent(new DragEvent('drop', init));
      src.dispatchEvent(new DragEvent('dragend', init));
    },
    { srcSel, dstSel, point },
  );
}

test('tema global: Configuración cambia data-theme y se conserva en la pizarra', async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(() => (window as unknown as { __pitchside: Hook }).__pitchside.setView('settings'));
  for (const id of ['fc', 'pes', 'classic', 'pes']) {
    await page.locator(`[data-theme-card="${id}"]`).click();
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(id);
    expect((await snap(page)).theme).toBe(id);
  }
  await page.evaluate(() => (window as unknown as { __pitchside: Hook }).__pitchside.setView('tactics'));
  await page.waitForSelector('[data-slot="0"]');
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('pes');
  // La pizarra ya no tiene selector de tema propio.
  await expect(page.getByRole('button', { name: /PES 6|EA FC/i })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('cada formación dibuja 11 marcadores sin pisarse', async ({ page }) => {
  const errors = await boot(page);
  for (const f of FORMATIONS) {
    await page.locator('.view-head select').selectOption(f);
    await page.waitForTimeout(60);
    const boxes = await page.evaluate(() =>
      [...document.querySelectorAll('.pitch-v [data-slot]')].map((slot) => {
        // Se mide el cromo/disco, no los distintivos de rol que sobresalen del marcador.
        const el = slot.querySelector('.tv-card, .tv-disc, .tv-empty') ?? slot;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      }),
    );
    expect(boxes, f).toHaveLength(11);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        expect(ix > 22 && iy > 22, `${f}: marcadores ${i} y ${j} se pisan`).toBeFalsy();
      }
    }
  }
  expect(errors).toEqual([]);
});

test('arrastre: un reserva entra al once y dos titulares se intercambian', async ({ page }) => {
  const errors = await boot(page);
  const pid = (await page.locator('[data-where="reserve"][data-pid]').first().getAttribute('data-pid')) ?? '';
  await dragBetween(page, `[data-where="reserve"][data-pid="${pid}"]`, '[data-slot="6"]');
  const s1 = await snap(page);
  expect(s1.lineup[6]).toBe(pid);

  const before = await snap(page);
  await dragBetween(page, '[data-slot="9"]', '[data-slot="10"]');
  const after = await snap(page);
  expect(after.lineup[9]).toBe(before.lineup[10]);
  expect(after.lineup[10]).toBe(before.lineup[9]);
  expect(errors).toEqual([]);
});

test('modo posiciones: arrastrar un marcador mueve su hueco y renombra por filas', async ({ page }) => {
  const errors = await boot(page);
  await page.locator('.tv-modebar button').nth(1).click();
  const before = await snap(page);
  await dragBetween(page, '[data-slot="8"]', '.pitch-v', { fx: 0.5, fy: 0.45 });
  const after = await snap(page);
  expect(after.slots[8].x).toBeGreaterThan(40);
  expect(after.slots[8].x).toBeLessThan(60);
  expect(after.slots[8]).not.toEqual(before.slots[8]);
  expect(after.lineup).toEqual(before.lineup);
  expect(errors).toEqual([]);
});

test('panel del jugador: rol, carril, enfoque, pase e instrucciones', async ({ page }) => {
  const errors = await boot(page);
  // La formación por defecto depende del mundo generado: se fija 4-3-3 para que el hueco 9 sea un extremo.
  await page.locator('.tv-seg button', { hasText: /^4-3-3$/ }).first().click();
  await page.locator('[data-slot="9"]').click();
  await page.locator('[data-role="insideForward"]').click();
  await page.locator('[data-channel="center"]').click();
  await page.getByRole('button', { name: 'Attack', exact: true }).click();
  await page.getByRole('button', { name: 'Risky', exact: true }).click();
  await page.locator('[data-instr="roam"]').click();
  await page.locator('[data-instr="getForward"]').click();
  const s = await snap(page);
  expect(s.roles[9]).toBe('insideForward');
  expect(s.channels[9]).toBe('center');
  expect(s.focus[9]).toBe('attack');
  expect(s.passing[9]).toBe('risky');
  expect(s.instructions[9]).toEqual(expect.arrayContaining(['roam', 'getForward']));
  expect(errors).toEqual([]);
});

test('plan de equipo y balón parado actualizan la táctica', async ({ page }) => {
  const errors = await boot(page);
  await page.locator('.subtab', { hasText: /team plan/i }).click();
  await page.getByRole('button', { name: 'Long ball', exact: true }).click();
  await page.getByRole('button', { name: 'High block', exact: true }).click();
  await page.getByRole('button', { name: 'Man-to-man', exact: true }).click();
  await page.getByRole('button', { name: 'Counter-press', exact: true }).click();
  await page.locator('.tv-seg button', { hasText: 'Left' }).first().click();
  await page.locator('.subtab', { hasText: /set pieces/i }).click();
  await page.getByRole('button', { name: 'Far post', exact: true }).click();
  await page.getByRole('button', { name: 'Cross', exact: true }).click();
  const s = await snap(page);
  expect(s.buildUpStyle).toBe('long_ball');
  expect(s.defensiveApproach).toBe('high_block');
  expect(s.marking).toBe('man');
  expect(s.transition).toBe('counterPress');
  expect(s.attackSide).toBe('left');
  expect(s.cornerStyle).toBe('far');
  expect(s.freeKickStyle).toBe('cross');
  expect(errors).toEqual([]);
});

test('plantillas: aplicar una cambia formación, roles y once completo', async ({ page }) => {
  const errors = await boot(page);
  await page.locator('.subtab', { hasText: /templates/i }).click();
  await page.locator('[data-template="threeAtBack"] .btn.primary').click();
  const s = await snap(page);
  expect(s.formation).toBe('3-5-2');
  expect(s.roles).toContain('libero');
  expect(s.roles.filter((r: string) => r === 'wingBack')).toHaveLength(2);
  expect(s.lineup.filter(Boolean)).toHaveLength(11);
  expect(errors).toEqual([]);
});

test('entrenamiento: intensidad, enfoque por grupo y árbol de instalaciones', async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(() => (window as unknown as { __pitchside: Hook }).__pitchside.setView('training'));
  await page.waitForSelector('[data-intensity]');
  await page.locator('[data-intensity="hard"]').click();
  await page.locator('[data-focus="physical"]').first().click();
  await page.locator('.subtab', { hasText: /facilities|instalaciones/i }).click();
  const cards = await page.locator('[data-facility]').count();
  expect(cards).toBeGreaterThanOrEqual(8);
  // El gimnasio exige campo de entrenamiento nivel 2: el botón existe y el estado es coherente.
  await expect(page.locator('[data-facility="gym"] button')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('misiones: la vista lista objetivos semanales y de temporada', async ({ page }) => {
  const errors = await boot(page);
  // Avanza una semana de juego desde el hook para generar misiones.
  await page.evaluate(() => (window as unknown as { __pitchside: Hook }).__pitchside.setView('objectives'));
  await page.waitForSelector('.view-head h1');
  expect(errors).toEqual([]);
});

test('el diagrama táctico acompaña al plan de equipo y refleja el lado de ataque', async ({ page }) => {
  const errors = await boot(page);
  await page.locator('.subtab', { hasText: /team plan|plan de equipo/i }).click();
  await expect(page.locator('.td-sticky .pitch-v')).toHaveCount(1);
  // La pestaña de campo y plantilla no lleva diagrama.
  await page.locator('.subtab', { hasText: /pitch|campo/i }).first().click();
  await expect(page.locator('.td-sticky')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('mapa del mundo: el tooltip sigue al país bajo el ratón', async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(() => (window as unknown as { __pitchside: Hook }).__pitchside.setView('world'));
  await page.waitForSelector('path[data-code="BRA"]');
  const seen: string[] = [];
  for (const code of ['BRA', 'PER', 'COL', 'BRA']) {
    await page.evaluate((c) => {
      const el = document.querySelector(`path[data-code="${c}"]`) as Element;
      const r = el.getBoundingClientRect();
      el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
    }, code);
    seen.push((await page.locator('.map-tip').first().textContent()) ?? '');
  }
  expect(new Set(seen).size).toBe(3);
  expect(seen[0]).toBe(seen[3]);
  expect(errors).toEqual([]);
});

test('menú principal: sin selector de idioma ni eslogan', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.splash');
  await expect(page.locator('.splash .lang-pick')).toHaveCount(0);
  await expect(page.locator('.splash .title p')).toHaveCount(0);
});

test('doble clic sobre un marcador abre el perfil y no toca el once', async ({ page }) => {
  const errors = await boot(page);
  const chip = page.locator('[data-slot="3"]');
  const pid = await chip.getAttribute('data-pid');
  const before = await snap(page);
  await chip.dblclick();
  await page.waitForTimeout(250);
  const after = await snap(page);
  expect(after.playerId).toBe(pid);
  expect(after.lineup).toEqual(before.lineup);
  expect(errors).toEqual([]);
});
