import { expect, test, type Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Ganchos estilo FC 26: cartas, plan de crecimiento, perks/camino, revelaciones,
// resumen de partido y mercado vivo.
// ─────────────────────────────────────────────────────────────────────────────

type Hook = {
  seed: (s: number, c: string) => string;
  setView: (v: string) => void;
  giveLevels: (level: number, points: number) => void;
  reveal: () => void;
  advance: (days: number) => void;
  meta: () => { reveals: number; perks: string[]; claimed: number[]; level: number; points: number };
  enquire: () => string | null;
  resign: () => void;
};

const hook = <T>(page: Page, fn: (h: Hook) => T): Promise<T> => page.evaluate((src) => (new Function('h', `return (${src})(h)`) as (h: unknown) => T)((window as unknown as { __pitchside: Hook }).__pitchside), fn.toString());

async function boot(page: Page, tourSeen = true): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // El tutorial se ofrece al empezar: se marca como visto salvo en su propia prueba.
  if (tourSeen) await page.addInitScript(() => localStorage.setItem('pitchside.tour', JSON.stringify({ seen: true, step: 0 })));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as unknown as { __pitchside?: unknown }).__pitchside, null, { timeout: 30_000 });
  await page.evaluate(() => (window as unknown as { __pitchside: Hook }).__pitchside.seed(41, 'ENG'));
  await page.waitForSelector('[data-slot="0"]');
  return errors;
}

test('plantilla en cartas y plan de crecimiento desde la ficha del jugador', async ({ page }) => {
  const errors = await boot(page);
  await hook(page, (h) => h.setView('squad'));
  await page.locator('.subtab', { hasText: /^Cards$/ }).click();
  await page.waitForSelector('[data-squad-cards] .fc-card');
  expect(await page.locator('[data-squad-cards] .fc-card').count()).toBeGreaterThanOrEqual(11);
  await page.locator('[data-squad-cards] .fc-card').first().click();
  await page.locator('.subtab', { hasText: /Growth plan/ }).click();
  await page.locator('[data-plan] button').first().click();
  await expect(page.getByText(/Milestones 0\/3/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('perks y camino: comprar un perk y reclamar recompensas', async ({ page }) => {
  const errors = await boot(page);
  await hook(page, (h) => h.giveLevels(6, 3));
  await hook(page, (h) => h.setView('objectives'));
  await page.locator('.subtab', { hasText: /Perks/ }).click();
  await page.locator('[data-perk="drill"] button').click();
  expect((await hook(page, (h) => h.meta())).perks).toContain('drill');
  // El logro "Skill tree" abre una revelación que hay que cerrar antes de seguir.
  await page.waitForSelector('[data-reveal="achievement"]');
  await page.keyboard.press('Enter');
  await page.locator('.subtab', { hasText: /Manager path/ }).click();
  await page.locator('[data-claim-all]').click();
  expect((await hook(page, (h) => h.meta())).claimed).toEqual([1, 2, 3, 4, 5, 6]);
  // El nivel 5 es "grande": aparece una revelación (junto al logro del perk).
  await expect(page.locator('.reveal-wrap')).toBeVisible();
  expect(errors).toEqual([]);
});

test('revelación de fichaje: sobre, carta y cierre con Enter', async ({ page }) => {
  const errors = await boot(page);
  await hook(page, (h) => h.reveal());
  await page.waitForSelector('[data-reveal="signing"][data-stage="pack"]');
  await page.keyboard.press('Enter'); // abre el sobre
  await page.waitForSelector('[data-reveal="signing"][data-stage="open"] .fc-card');
  await page.keyboard.press('Enter'); // continuar
  await expect(page.locator('.reveal-wrap')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('resumen del partido incluye la repetición 2D con 22 fichas', async ({ page }) => {
  const errors = await boot(page);
  await hook(page, (h) => h.advance(70));
  await hook(page, (h) => h.setView('match'));
  await page.waitForSelector('[data-replay]');
  expect(await page.locator('[data-replay] .rp-dot').count()).toBe(22);
  await expect(page.locator('[data-replay] .rp-ball')).toBeVisible();
  expect(errors).toEqual([]);
});

test('tutorial guiado: oferta, pasos y cierre; ayuda con glosario', async ({ page }) => {
  const errors = await boot(page, false);
  await page.waitForSelector('[data-tour-offer]');
  await page.getByRole('button', { name: 'Start the tour' }).click();
  await page.waitForSelector('[data-tour-step="welcome"]');
  await page.locator('[data-tour-next]').click();
  await page.waitForSelector('[data-tour-step="hub"]');
  for (let i = 0; i < 16; i++) await page.locator('[data-tour-next]').click();
  await expect(page.locator('[data-tour-active]')).toHaveCount(0);
  await page.locator('[data-tour="nav-help"]').click();
  await page.locator('input[placeholder^="Search a term"]').fill('morale');
  await expect(page.locator('[data-term="morale"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('rumores y desempleo: mercado vivo y pantalla tras dimitir', async ({ page }) => {
  const errors = await boot(page);
  await hook(page, (h) => h.setView('transfers'));
  await page.locator('.subtab', { hasText: /Live market/ }).click();
  await expect(page.getByText(/Rumours/).first()).toBeVisible();
  await hook(page, (h) => h.resign());
  await page.waitForSelector('[data-wait-offers]');
  await expect(page.getByText('Between jobs').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('resumen del partido: MVP, historia y jugadas destacadas', async ({ page }) => {
  const errors = await boot(page);
  await hook(page, (h) => h.advance(70));
  await hook(page, (h) => h.setView('match'));
  await page.waitForSelector('.ms-hero');
  await expect(page.locator('.ms-hero .fc-card').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('mercado vivo: pestaña con día de cierre y agentes', async ({ page }) => {
  const errors = await boot(page);
  await hook(page, (h) => h.setView('transfers'));
  await page.locator('.subtab', { hasText: /Live market/ }).click();
  await expect(page.getByText(/Deadline day/i).first()).toBeVisible();
  await expect(page.getByText(/Agent offers/i).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('traspaso por fases: consulta, espera y negociación sin veredicto previo', async ({ page }) => {
  const errors = await boot(page);
  const id = await hook(page, (h) => h.enquire());
  expect(id).not.toBeNull();
  await hook(page, (h) => h.setView('transfers'));
  await page.waitForSelector('[data-deal-card]');
  await expect(page.locator('.stepper .step.now')).toContainText(/Enquiry/i);
  await hook(page, (h) => h.advance(4));
  // Nunca aparece una nota de estrellas (ficha / evita) antes de fichar.
  await expect(page.locator('[data-verdict] .stars')).toHaveCount(0);
  await expect(page.locator('[data-tension]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('finanzas: resumen con tres cifras y salud del club', async ({ page }) => {
  const errors = await boot(page);
  await hook(page, (h) => h.setView('finances'));
  await page.waitForSelector('.fin-cards');
  expect(await page.locator('.fin-card').count()).toBe(3);
  await expect(page.locator('.health').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('navegación por secciones: menú superior y pestañas pill', async ({ page }) => {
  const errors = await boot(page);
  await hook(page, (h) => h.setView('hub'));
  await expect(page.locator('.topnav .nav-btn')).toHaveCount(6);
  await page.locator('[data-section="market"]').click();
  await expect(page.locator('.pill.on')).toContainText(/Transfers/i);
  await page.locator('[data-section="home"]').click();
  await expect(page.locator('.taskbar')).toBeVisible();
  await expect(page.locator('.action-tile')).toHaveCount(4);
  expect(errors).toEqual([]);
});
