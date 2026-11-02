import { expect, test, type Page } from '@playwright/test';

// Flujo completo de fichajes en sus 4 fases: consulta → club → jugador → cierre (con cuotas, prima y cláusulas).
// El mundo es determinista (semilla 41), así que el recorrido es reproducible.

interface Neg {
  stage: string;
  awaiting: string | null;
  playerAgreed: boolean;
  hasCounter: boolean;
  bid: { fee: number; instalments: number; bonus: number } | null;
  contract: { wage: number; years: number; role: string | null; appearanceBonus: number } | null;
  playerClub: string | null;
  day: number;
  commitments: number;
}
type Hook = {
  seed: (s: number, c: string) => string;
  setView: (v: string) => void;
  enquire: () => string | null;
  advance: (d: number) => void;
  negotiation: (id: string) => Neg | null;
  bidClub: (id: string) => boolean;
  offerContract: (id: string) => boolean;
  snapshot: () => { view: string } | null;
};

const call = <T>(page: Page, body: string, arg?: unknown): Promise<T> =>
  page.evaluate(([src, a]) => (new Function('h', 'a', `return (${src})`) as (h: unknown, a: unknown) => T)((window as unknown as { __pitchside: Hook }).__pitchside, a), [body, arg] as [string, unknown]);

async function boot(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem('pitchside.tour', JSON.stringify({ seen: true, step: 0 })));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as unknown as { __pitchside?: unknown }).__pitchside, null, { timeout: 30_000 });
  await call(page, 'h.seed(41, "ENG")');
  await page.waitForSelector('[data-slot="0"]');
  return errors;
}

const neg = (page: Page, id: string): Promise<Neg | null> => call<Neg | null>(page, 'h.negotiation(a)', id);

/** Avanza día a día hasta que se cumpla la condición (máx. 12 días); falla si nunca llega. */
async function waitUntil(page: Page, id: string, ok: (n: Neg) => boolean): Promise<Neg> {
  for (let i = 0; i < 12; i++) {
    const n = await neg(page, id);
    if (n && ok(n)) return n;
    await call(page, 'h.advance(1)');
  }
  throw new Error(`condición no alcanzada: ${JSON.stringify(await neg(page, id))}`);
}

test('Deadline Day: un trato abierto aparece en la mesa, avanza hora a hora y el reloj llega al cierre', async ({ page }) => {
  const errors = await boot(page);
  const pid = (await call<string | null>(page, 'h.enquire()')) as string;
  expect(pid).toBeTruthy();
  await call(page, 'h.advance(1)');
  await call(page, 'h.toDeadline()');
  await page.locator('[data-tour="continue"]').click();
  await page.waitForSelector('[data-deadline-live]');
  await expect(page.locator('[data-dl-deal]')).toHaveCount(1);
  // Cada +1 h mueve el reloj; el mercado cierra a las 24:00.
  for (const hh of ['05:00', '06:00', '07:00']) {
    await page.locator('[data-dl-advance="1"]').click();
    await expect(page.locator('[data-dl-time]')).toHaveText(hh);
  }
  await page.locator('[data-dl-advance="2"]').click();
  await expect(page.locator('[data-dl-time]')).toHaveText('09:00');
  await page.locator('[data-dl-finish]').click();
  await expect(page.locator('[data-dl-done]')).toBeVisible();
  await expect(page.locator('[data-dl-advance="1"]')).toHaveCount(0);
  await page.locator('[data-dl-done]').click();
  await expect(page.locator('[data-deadline-live]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('fichaje por fases: consulta, negociación con el club, contrato del jugador y cierre con cláusulas', async ({ page }) => {
  const errors = await boot(page);

  // Fase 1 · consulta: la puerta se abre y la respuesta tarda días (nunca es instantánea).
  const pid = (await call<string | null>(page, 'h.enquire()')) as string;
  expect(pid).toBeTruthy();
  const opened = await neg(page, pid);
  expect(opened?.stage).toBe('enquiry');
  expect(opened?.awaiting).toBe('enquiry');
  await call(page, 'h.setView("transfers")');
  await expect(page.locator('[data-money-panel]')).toBeVisible();

  const afterEnquiry = await waitUntil(page, pid, (n) => n.stage === 'club' && !n.awaiting);
  expect(afterEnquiry.day).toBeGreaterThan(opened!.day);

  // Fase 2 · club: la oferta (con cuotas y prima) queda pendiente de respuesta y se resuelve días después.
  let bidAccepted = false;
  for (let attempt = 0; attempt < 4 && !bidAccepted; attempt++) {
    expect(await call<boolean>(page, 'h.bidClub(a)', pid)).toBe(true);
    const waiting = await neg(page, pid);
    expect(waiting?.awaiting).toBe('bid');
    expect(waiting?.bid?.instalments).toBe(2);
    expect(waiting?.bid?.bonus).toBeGreaterThan(0);
    const reply = await waitUntil(page, pid, (n) => !n.awaiting);
    bidAccepted = reply.stage === 'player' || reply.playerAgreed || reply.stage === 'agreed';
    expect(reply.stage).not.toBe('collapsed');
  }
  expect(bidAccepted).toBe(true);

  // Fase 3 · jugador: contrato con rol, prima por aparición y cláusulas automáticas.
  let contractAccepted = false;
  for (let attempt = 0; attempt < 4 && !contractAccepted; attempt++) {
    const queued = await call<boolean>(page, 'h.offerContract(a)', pid);
    expect(queued).toBe(true);
    const waiting = await neg(page, pid);
    expect(waiting?.awaiting).toBe('contract');
    expect(waiting?.contract?.role).toBe('rotation');
    expect(waiting?.contract?.appearanceBonus).toBe(2000);
    const reply = await waitUntil(page, pid, (n) => !n.awaiting);
    contractAccepted = reply.stage === 'agreed' || reply.playerClub !== null;
    expect(reply.stage).not.toBe('collapsed');
  }

  // Fase 4 · cierre: el jugador ya está en la plantilla y los pagos aplazados quedan como compromisos.
  const closed = await waitUntil(page, pid, (n) => n.stage === 'agreed' || n.stage === 'renegotiation' || !n.awaiting);
  expect(['agreed', 'renegotiation']).toContain(closed.stage);
  expect(closed.commitments).toBeGreaterThan(0);

  await call(page, 'h.setView("squad")');
  await expect(page.locator('body')).toBeVisible();
  expect(errors).toEqual([]);
});
