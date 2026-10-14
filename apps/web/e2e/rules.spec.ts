import { expect, test, type Page } from '@playwright/test';
import { accounts, login } from './helpers';

/**
 * Regeln aus "Dinge, die nicht passieren dürfen" (Design System, Umsetzung Abschnitt 6) auf allen Seiten jeder Rolle
 * bei 390 und 1280 px: höchstens eine Hauptaktion je Ansicht (je Prüfzeile darf eine eigene stehen), keine Karte
 * in Karte, Bedienelemente mindestens 40 px hoch (pf-btn--sm, Audit E23).
 */
const ROUTES: Record<string, string[]> = {
  teacherEmail: [
    '/heute',
    '/klassenbuch',
    '/plan',
    '/pruefungen',
    '/krankmeldung',
    '/klasse',
    '/klassen',
    '/nachrichten',
    '/nachrichten/neu',
    '/raeume',
    '/profil',
    '/benachrichtigungen',
    '/mehr',
  ],
  principalEmail: [
    '/lagebild',
    '/supplierung',
    '/auswertung',
    '/freigaben',
    '/rundschreiben',
    '/rundschreiben/neu',
    '/pruefungen',
    '/admin/personen',
    '/admin/stundenplan',
    '/klasse',
  ],
  adminEmail: [
    '/admin',
    '/admin/import',
    '/admin/personen',
    '/admin/klassen',
    '/admin/faecher',
    '/admin/raeume',
    '/admin/schuljahr',
    '/admin/raster',
    '/admin/rollen',
    '/admin/protokoll',
    '/admin/datenschutz',
    '/admin/einstellungen',
    '/admin/stundenplan',
    '/admin/assistent',
  ],
  guardianEmail: ['/heute', '/plan', '/abwesenheit/neu', '/termine', '/nachrichten', '/profil'],
  studentEmail: ['/heute', '/plan', '/aufgaben', '/nachrichten', '/profil'],
};

async function audit(page: Page, path: string, vp: string): Promise<string[]> {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  const r = await page.evaluate(() => {
    const visible = (el: Element) => {
      const b = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return b.width > 0 && b.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    const main = document.querySelector('main') ?? document.body;
    const primaries = [...main.querySelectorAll('.pf-btn--primary')]
      .filter(visible)
      // Prüflisten: je Zeile eine eigene Hauptaktion (Design System, Entschuldigungen prüfen)
      .filter(
        (e, i, all) =>
          !e.closest('li[data-absence]') ||
          all.findIndex((x) => x.closest('li[data-absence]')) === i,
      )
      .map((e) => e.textContent?.trim());
    const nested = [...document.querySelectorAll('.pf-card .pf-card')].filter(visible).length;
    const small = [
      ...main.querySelectorAll(
        'button, a.pf-btn, [role="button"], select, input:not([type="hidden"]):not(.sr-only), textarea',
      ),
    ]
      .filter(visible)
      .filter((e) => !(e as HTMLElement).closest('p, li > p'))
      .map((e) => ({ e, b: e.getBoundingClientRect() }))
      .filter(
        ({ b, e }) =>
          (b.height < 40 || b.width < 24) && !(e as HTMLInputElement).type?.match(/checkbox|radio/),
      )
      .map(
        ({ e, b }) =>
          `${e.tagName.toLowerCase()}"${(e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 25)}" ${Math.round(b.width)}x${Math.round(b.height)}`,
      );
    return { primaries, nested, small: small.slice(0, 6), title: document.title };
  });
  const issues: string[] = [];
  if (r.primaries.length > 1)
    issues.push(`Primär ×${r.primaries.length}: ${r.primaries.join(' | ')}`);
  if (r.nested) issues.push(`Karte in Karte ×${r.nested}`);
  if (r.small.length) issues.push(`klein: ${r.small.join(', ')}`);
  return issues.map((i) => `[${vp}] ${path}: ${i}`);
}

for (const [who, routes] of Object.entries(ROUTES)) {
  test(`Design-Regeln ${who}`, async ({ page, browser }) => {
    const landing =
      who === 'principalEmail'
        ? /\/lagebild$/
        : who === 'adminEmail'
          ? /\/admin$/
          : /\/heute(\?.*)?$/;
    await login(page, accounts()[who as 'teacherEmail'], landing);
    const state = await page.context().storageState();
    const found: string[] = [];
    for (const vp of [
      { width: 390, height: 844 },
      { width: 1280, height: 800 },
    ]) {
      const ctx = await browser.newContext({ storageState: state, viewport: vp });
      const p = await ctx.newPage();
      for (const r of routes) found.push(...(await audit(p, r, String(vp.width))));
      await ctx.close();
    }
    expect(found).toEqual([]);
  });
}
