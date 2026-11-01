import { expect, test, type Page } from '@playwright/test';

// Ronda 2: Deadline Day en vivo, marcador centrado y menú superior.

type Hook = {
  seed: (s: number, c: string) => string;
  setView: (v: string) => void;
  toDeadline: () => void;
  toPrematch: () => boolean;
  enquire: () => string | null;
};

const hook = <T>(page: Page, fn: (h: Hook) => T): Promise<T> => page.evaluate((src) => (new Function('h', `return (${src})(h)`) as (h: unknown) => T)((window as unknown as { __pitchside: Hook }).__pitchside), fn.toString());

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

test('Deadline Day: Continuar abre la pantalla, +1 h avanza el reloj y se cierra el día', async ({ page }) => {
  const errors = await boot(page);
  await hook(page, (h) => h.enquire());
  await hook(page, (h) => h.toDeadline());
  await page.locator('[data-tour="continue"]').click();
  await page.waitForSelector('[data-deadline-live]');
  await expect(page.locator('[data-dl-time]')).toHaveText('04:00');
  await page.locator('[data-dl-advance="1"]').click();
  await expect(page.locator('[data-dl-time]')).toHaveText('05:00');
  await expect(page.locator('[data-dl-feed] .dl-ev').first()).toBeVisible();
  await page.locator('[data-dl-finish]').click();
  await expect(page.locator('[data-dl-done]')).toBeVisible();
  // Tras el cierre ya no vuelve a abrirse: Continuar avanza el día.
  await page.locator('[data-dl-done]').click();
  await expect(page.locator('[data-deadline-live]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('marcador: el VS queda centrado y los escudos simétricos', async ({ page }) => {
  const errors = await boot(page);
  expect(await hook(page, (h) => h.toPrematch())).toBe(true);
  await hook(page, (h) => h.setView('match'));
  await page.waitForSelector('.scoreboard.prematch .mid');
  const geo = await page.evaluate(() => {
    const sb = document.querySelector('.scoreboard.prematch') as HTMLElement;
    const mid = sb.querySelector('.mid') as HTMLElement;
    const a = sb.getBoundingClientRect();
    const m = mid.getBoundingClientRect();
    const teams = sb.querySelectorAll('.team');
    const l = teams[0].getBoundingClientRect();
    const r = teams[1].getBoundingClientRect();
    return { board: a.left + a.width / 2, mid: m.left + m.width / 2, lc: l.left + l.width / 2, rc: r.left + r.width / 2 };
  });
  expect(Math.abs(geo.board - geo.mid)).toBeLessThanOrEqual(2);
  expect(Math.abs(geo.mid - geo.lc - (geo.rc - geo.mid))).toBeLessThanOrEqual(2);
  expect(errors).toEqual([]);
});

test('fichajes: sin presupuesto aparece el asistente y se puede poner a un jugador en venta', async ({ page }) => {
  const errors = await boot(page);
  await hook(page, (h) => h.enquire());
  await page.evaluate(() => (window as unknown as { __pitchside: { advance: (d: number) => void } }).__pitchside.advance(4));
  await page.evaluate(() => (window as unknown as { __pitchside: { setBudget: (v: number) => void } }).__pitchside.setBudget(0));
  await hook(page, (h) => h.setView('transfers'));
  await expect(page.locator('[data-money-panel]')).toBeVisible();
  await page.locator('[data-deal-card]').first().click();
  await page.waitForSelector('[data-funding]');
  const sell = page.locator('[data-list-sale]').first();
  await sell.click();
  await expect(sell).toBeDisabled();
  expect(errors).toEqual([]);
});

const call = <T>(page: Page, name: string, ...args: unknown[]): Promise<T> =>
  page.evaluate(([n, a]) => ((window as unknown as { __pitchside: Record<string, (...x: unknown[]) => unknown> }).__pitchside[n as string] as (...x: unknown[]) => T)(...(a as unknown[])), [name, args] as const);

test('ofertas entrantes: se puede negociar con una contraoferta', async ({ page }) => {
  const errors = await boot(page);
  expect(await call<string | null>(page, 'incomingOffer')).not.toBeNull();
  await hook(page, (h) => h.setView('transfers'));
  await page.locator('[data-incoming]').first().waitFor();
  await page.locator('[data-negotiate]').first().click();
  await expect(page.locator('[data-counter-form]')).toBeVisible();
  await page.locator('[data-send-counter]').click();
  // Tras la respuesta (acepta, contraoferta o se retira) no hay errores y la vista sigue viva.
  await expect(page.locator('.tr-bar')).toBeVisible();
  expect(errors).toEqual([]);
});

test('entrenamiento: campamento de pretemporada y pestaña de progreso', async ({ page }) => {
  const errors = await boot(page);
  await call(page, 'setBudget', 1e9);
  await page.evaluate(() => {
    const g = (window as unknown as { __pitchside: { snapshot: () => unknown } }).__pitchside;
    return g.snapshot();
  });
  await hook(page, (h) => h.setView('training'));
  await page.locator('[data-camp="technical"]').click();
  await expect(page.locator('[data-camp-active]')).toBeVisible();
  await page.locator('.subtab', { hasText: /Progress/ }).click();
  await expect(page.getByText(/Progress appears after|Biggest risers/).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('cantera: la cosecha llega como promesas y se firma dentro de las plazas', async ({ page }) => {
  const errors = await boot(page);
  await call(page, 'newSeason');
  await hook(page, (h) => h.setView('squad'));
  await page.locator('.subtab', { hasText: /Academy/ }).click();
  await page.waitForSelector('[data-academy-head]');
  const before = await page.locator('[data-sign-prospect]').count();
  expect(before).toBeGreaterThan(0);
  await page.locator('[data-sign-best]').click();
  expect(await page.locator('[data-sign-prospect]').count()).toBeLessThan(before);
  await page.locator('[data-policy="potential"]').click();
  expect(errors).toEqual([]);
});

test('menú superior: seis secciones y el submenú de la sección activa', async ({ page }) => {
  const errors = await boot(page);
  await hook(page, (h) => h.setView('transfers'));
  await expect(page.locator('.topnav .nav-btn')).toHaveCount(6);
  await expect(page.locator('.nav-btn.on')).toHaveAttribute('data-section', 'market');
  await expect(page.locator('.subbar .pill', { hasText: /Deadline Day/i })).toBeVisible();
  expect(errors).toEqual([]);
});
