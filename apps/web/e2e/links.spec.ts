import { expect, test, type Page } from '@playwright/test';
import { accounts, login } from './helpers';

/**
 * Rundgang je Rolle (Bedienbarkeit): alle Seiten aus der Navigation und alle Links darauf bis zur zweiten Ebene.
 * Kein Link darf auf "gibt es nicht", "Kein Zugriff", "Kommt bald" oder einen Fehler führen, keine API-Anfrage
 * darf scheitern.
 */
const BAD = [
  ['404', 'Diese Seite gibt es nicht.'],
  ['kein-zugriff', 'Diese Seite ist für Ihre Rolle nicht freigegeben.'],
  ['kommt-bald', 'Kommt bald'],
  ['fehler', 'Etwas ist schiefgelaufen'],
  ['fehler', 'Application error'],
  ['fehler', 'Unhandled Runtime Error'],
] as const;
const norm = (href: string) => {
  const u = new URL(href, 'http://x');
  const path = u.pathname
    .split('/')
    .map((s) => (/^[0-9a-f-]{20,}$|^c[a-z0-9]{20,}$|^e2e-/.test(s) ? ':id' : s))
    .join('/');
  return (
    path +
    [...u.searchParams.keys()]
      .sort()
      .map((k) => '?' + k)
      .join('')
  );
};

async function crawl(page: Page, role: string) {
  const issues: { role: string; page: string; from: string; kind: string; detail: string }[] = [];
  const api: string[] = [];
  page.on('response', (r) => {
    const u = r.url();
    if (u.includes('/api/v1/') && r.status() >= 400 && r.status() !== 401)
      api.push(
        r.status() + ' ' + r.request().method() + ' ' + new URL(u).pathname + new URL(u).search,
      );
  });
  page.on('pageerror', (e) => api.push('pageerror ' + e.message.slice(0, 160)));
  const seen = new Set<string>();
  const queue: { href: string; from: string; depth: number }[] = [];
  const add = (href: string, from: string, depth: number) => {
    if (
      !href.startsWith('/') ||
      href.startsWith('/api') ||
      href.includes('format=csv') ||
      href.includes('format=pdf')
    )
      return;
    const k = norm(href);
    if (seen.has(k)) return;
    seen.add(k);
    queue.push({ href, from, depth });
  };
  await page.goto('/mehr');
  await page.waitForLoadState('networkidle');
  for (const h of await page
    .locator('a[href^="/"]')
    .evaluateAll((as) => as.map((a) => a.getAttribute('href')!)))
    add(h, 'nav', 0);
  while (queue.length && seen.size < 140) {
    const { href, from, depth } = queue.shift()!;
    api.length = 0;
    const res = await page.goto(href).catch(() => null);
    await page.waitForLoadState('networkidle').catch(() => undefined);
    const text =
      (await page
        .locator('body')
        .innerText()
        .catch(() => '')) ?? '';
    for (const [kind, needle] of BAD)
      if (text.includes(needle)) issues.push({ role, page: href, from, kind, detail: page.url() });
    if (res && res.status() >= 400)
      issues.push({ role, page: href, from, kind: 'http', detail: String(res.status()) });
    for (const a of api) issues.push({ role, page: href, from, kind: 'api', detail: a });
    const main = (await page
      .locator('main a[href^="/"]')
      .evaluateAll((as) => as.map((a) => a.getAttribute('href')!))
      .catch(() => [])) as string[];
    if (depth < 2) for (const h of main) add(h, href, depth + 1);
  }
  return { issues, pages: [...seen] };
}

for (const role of [
  'teacherEmail',
  'principalEmail',
  'adminEmail',
  'studentEmail',
  'guardianEmail',
] as const) {
  test('Rundgang ' + role, async ({ page }) => {
    test.setTimeout(600_000);
    await login(page, accounts()[role], /\/(heute|lagebild|admin)(\?.*)?$/);
    const r = await crawl(page, role);
    expect(r.issues, r.pages.join(' ')).toEqual([]);
  });
}
