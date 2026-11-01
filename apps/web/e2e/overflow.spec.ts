import { expect, test, type Page } from '@playwright/test';

// Auditoría de desbordes: ningún texto debe salirse de su caja ni de la pantalla.

type Hook = { seed: (s: number, c: string) => string; setView: (v: string) => void; advance: (d: number) => void };
const hook = <T>(page: Page, fn: (h: Hook) => T): Promise<T> => page.evaluate((src) => (new Function('h', `return (${src})(h)`) as (h: unknown) => T)((window as unknown as { __pitchside: Hook }).__pitchside), fn.toString());

const VIEWS = ['hub', 'inbox', 'objectives', 'squad', 'tactics', 'training', 'transfers', 'scouting', 'finances', 'staff', 'competition', 'calendar', 'career', 'settings', 'help'];

/** Devuelve selectores legibles de elementos con contenido recortado o fuera del viewport. */
function auditInPage(): string[] {
  const out: string[] = [];
  const vw = document.documentElement.clientWidth;
  const name = (el: Element) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : ''}`;
  const roots = document.querySelectorAll('.topbar, .subbar, .main, .modal');
  roots.forEach((root) => {
    root.querySelectorAll('*').forEach((el) => {
      const h = el as HTMLElement;
      const r = h.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const cs = getComputedStyle(h);
      if (cs.display === 'inline' || cs.visibility === 'hidden') return;
      if (h instanceof SVGElement || !(h.textContent ?? '').trim()) return; // escudos, adornos sin texto
      if (h.closest('.tv-chip, .nav-ico')) return; // insignias de rol/capitán y contadores sobresalen a propósito
      // contenedor con scroll propio o recorte voluntario con puntos suspensivos
      if (['auto', 'scroll'].includes(cs.overflowX)) return;
      if (cs.textOverflow === 'ellipsis') return;
      // ancestros con scroll horizontal (tablas) no cuentan
      let p: HTMLElement | null = h.parentElement;
      while (p && p !== root) {
        if (['auto', 'scroll'].includes(getComputedStyle(p).overflowX)) return;
        p = p.parentElement;
      }
      if (h.scrollWidth > h.clientWidth + 2 && h.clientWidth > 0) out.push(`${name(h)} clip ${h.scrollWidth}>${h.clientWidth} "${(h.textContent ?? '').trim().slice(0, 40)}"`);
      else if (r.right > vw + 2) out.push(`${name(h)} fuera-pantalla right=${Math.round(r.right)} "${(h.textContent ?? '').trim().slice(0, 40)}"`);
    });
  });
  return [...new Set(out)];
}

const CASES: [number, string][] = [
  [1280, 'en'],
  [1024, 'en'],
  [1280, 'ru'],
  [1024, 'es'],
  [390, 'en'],
];
for (const [width, locale] of CASES) {
  test(`sin desbordes de texto a ${width}px (${locale})`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height: 800 });
    await page.addInitScript(() => localStorage.setItem('pitchside.tour', JSON.stringify({ seen: true, step: 0 })));
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!(window as unknown as { __pitchside?: unknown }).__pitchside, null, { timeout: 30_000 });
    await page.evaluate(() => (window as unknown as { __pitchside: Hook }).__pitchside.seed(41, 'ENG'));
    await page.waitForSelector('[data-slot="0"]');
    await page.evaluate((l) => (window as unknown as { __pitchside: { setLanguage: (l: string) => void } }).__pitchside.setLanguage(l), locale);
    await page.evaluate(() => (window as unknown as { __pitchside: { enquire: () => string | null } }).__pitchside.enquire());
    await page.evaluate(() => (window as unknown as { __pitchside: { incomingOffer: () => unknown } }).__pitchside.incomingOffer());
    await hook(page, (h) => h.advance(3));
    const report: Record<string, string[]> = {};
    for (const v of VIEWS) {
      await page.evaluate((view) => (window as unknown as { __pitchside: Hook }).__pitchside.setView(view), v);
      await page.waitForTimeout(250);
      const issues = await page.evaluate(auditInPage);
      if (issues.length) report[v] = issues;
    }
    // Cantera con promesas y política juvenil tras empezar una temporada nueva.
    await page.evaluate(() => (window as unknown as { __pitchside: { newSeason: () => void } }).__pitchside.newSeason());
    await page.evaluate(() => (window as unknown as { __pitchside: Hook }).__pitchside.setView('squad'));
    await page.locator('.subtab', { hasText: /Academy|Cantera|Академия/ }).first().click();
    await page.waitForSelector('[data-academy-head]');
    const academyIssues = await page.evaluate(auditInPage);
    if (academyIssues.length) report['academy'] = academyIssues;
    // Fichas de jugador (propio y ajeno) con todas sus pestañas.
    for (const own of [true, false]) {
      await page.evaluate((o) => (window as unknown as { __pitchside: { openPlayer: (o: boolean) => void } }).__pitchside.openPlayer(o), own);
      await page.waitForSelector('.modal');
      const tabs = page.locator('.modal .subtab');
      const n = await tabs.count();
      for (let i = 0; i < n; i++) {
        await tabs.nth(i).click();
        await page.waitForTimeout(150);
        const issues = await page.evaluate(auditInPage);
        if (issues.length) report[`modal-${own ? 'own' : 'other'}-${i}`] = issues;
      }
      await page.evaluate(() => (window as unknown as { __pitchside: { closeModals: () => void } }).__pitchside.closeModals());
    }
    expect(report).toEqual({});
  });
}
