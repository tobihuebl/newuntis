import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { accounts, login } from './helpers';

/**
 * Design System D6 (Umsetzung Abschnitt 7): Screenshots der Kernseiten hell/dunkel bei 390 × 844 und 1280 × 800,
 * dazu je Aufnahme axe (serious, critical) und kein waagrechtes Scrollen; Tastatur, reduzierte Bewegung, PWA, LCP.
 * Die Aufnahmen liegen in test-results/design (CI lädt sie als Artefakt hoch). Pixelvergleiche gibt es bewusst
 * nicht: Inhalte hängen vom Tag und der Uhrzeit ab (Audit E18).
 */

const SHOTS = resolve(__dirname, '..', 'test-results', 'design');
const VIEWPORTS = [
  { name: '390', width: 390, height: 844 },
  { name: '1280', width: 1280, height: 800 },
] as const;
const SCHEMES = ['light', 'dark'] as const;

type Shot = { name: string; path: string | ((page: Page) => Promise<string>) };

async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
}

async function inspect(page: Page, label: string) {
  const overflow = await page.evaluate(
    () => document.scrollingElement!.scrollWidth - document.documentElement.clientWidth,
  );
  const offenders =
    overflow > 1
      ? await page.evaluate(() =>
          [...document.querySelectorAll('body *')]
            .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
            .slice(-4)
            .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 80)}`),
        )
      : [];
  expect(overflow, `${label}: waagrechtes Scrollen ${offenders.join(' | ')}`).toBeLessThanOrEqual(
    1,
  );
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const serious = axe.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  expect(serious, `${label}: axe`).toEqual([]);
}

/** Alle Kombinationen aus Theme und Breite für die Seiten einer Rolle; ein Login je Rolle (Sitzung wird geteilt). */
async function shoot(
  browser: Browser,
  storageState: Awaited<ReturnType<BrowserContext['storageState']>> | undefined,
  shots: Shot[],
) {
  mkdirSync(SHOTS, { recursive: true });
  for (const scheme of SCHEMES) {
    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({
        storageState,
        colorScheme: scheme,
        viewport: { width: vp.width, height: vp.height },
        locale: 'de-AT',
        timezoneId: 'Europe/Vienna',
      });
      const page = await ctx.newPage();
      for (const s of shots) {
        const path = typeof s.path === 'string' ? s.path : await s.path(page);
        await page.goto(path);
        await settle(page);
        const label = `${s.name} ${scheme} ${vp.name}`;
        await page.screenshot({
          path: `${SHOTS}/${s.name}-${scheme}-${vp.name}.png`,
          fullPage: true,
        });
        await inspect(page, label);
      }
      await ctx.close();
    }
  }
}

test.describe('Screenshots hell/dunkel × 390/1280', () => {
  test('Anmeldung', async ({ browser }) => {
    await shoot(browser, undefined, [{ name: 'anmeldung', path: '/login' }]);
  });

  test('Lehrkraft: Heute, Klassenbuch, Stundenplan', async ({ page, browser }) => {
    await login(page, accounts().teacherEmail, /\/heute$/);
    const state = await page.context().storageState();
    await shoot(browser, state, [
      { name: 'heute', path: '/heute' },
      {
        name: 'klassenbuch',
        path: async (p) => {
          await p.goto('/klassenbuch');
          const first = p.locator('section a[href^="/klassenbuch/"]').first();
          await expect(first).toBeVisible();
          return (await first.getAttribute('href'))!;
        },
      },
      { name: 'stundenplan', path: '/plan' },
    ]);
  });

  test('Direktion: Lagebild', async ({ page, browser }) => {
    await login(page, accounts().principalEmail, /\/lagebild$/);
    await shoot(browser, await page.context().storageState(), [
      { name: 'lagebild', path: '/lagebild' },
    ]);
  });
});

test.describe('Tastatur', () => {
  test('Anmeldung in Leserichtung, Fokusring sichtbar', async ({ page }) => {
    await page.goto('/login');
    await settle(page);
    const order: string[] = [];
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
      order.push(
        await page.evaluate(() => {
          const el = document.activeElement as HTMLElement;
          return el.getAttribute('name') ?? el.textContent?.trim() ?? el.tagName;
        }),
      );
    }
    expect(order).toEqual([
      'email',
      'password',
      'Anmelden',
      'Passwort vergessen?',
      'Eltern: Zugang mit Code aus dem Brief',
    ]);
    // Fokusring: 3 px, nicht unterdrückt (ui-grundlagen)
    await page.getByLabel('E-Mail').focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const ring = await page.evaluate(() => {
      const s = getComputedStyle(document.activeElement!);
      return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
    });
    expect(ring.style).not.toBe('none');
    expect(ring.width).toBeGreaterThanOrEqual(2);
  });

  test('App: erster Tab-Stopp springt zum Inhalt', async ({ page }) => {
    await login(page, accounts().teacherEmail, /\/heute$/);
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Zum Inhalt springen' });
    await expect(skip).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#main$/);
    await expect(page.locator('#main')).toBeInViewport();
  });
});

test.describe('Reduzierte Bewegung', () => {
  test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });

  test('Sheets erscheinen ohne Animation', async ({ page }) => {
    await login(page, accounts().teacherEmail, /\/heute$/);
    await page.locator('nav.pf-tabbar').getByRole('button', { name: 'Mehr' }).click();
    const sheet = page.getByRole('dialog', { name: 'Mehr' });
    await expect(sheet).toBeVisible();
    const duration = await sheet.evaluate((el) => {
      const s = getComputedStyle(el);
      return Math.max(parseFloat(s.animationDuration) || 0, parseFloat(s.transitionDuration) || 0);
    });
    expect(duration).toBeLessThan(0.02);
  });
});

test.describe('PWA', () => {
  test('Manifest, Icons und theme-color je Theme', async ({ page, request }) => {
    await page.goto('/login');
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBeTruthy();
    const manifest = (await (await request.get(href!)).json()) as {
      name: string;
      display: string;
      start_url: string;
      theme_color: string;
      background_color: string;
      icons: { src: string; sizes: string; purpose?: string }[];
    };
    expect(manifest.name).toBe('PROfessor');
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/heute');
    expect(manifest.theme_color).toMatch(/^#/);
    expect(manifest.background_color).toMatch(/^#/);
    for (const size of ['192x192', '512x512'])
      expect(manifest.icons.some((i) => i.sizes === size && (i.purpose ?? 'any') === 'any')).toBe(
        true,
      );
    expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);
    for (const icon of manifest.icons) {
      const res = await request.get(icon.src);
      expect(res.ok(), icon.src).toBe(true);
      expect(res.headers()['content-type']).toContain('image/png');
    }
    // System: zwei theme-color mit media; Cookie "dunkel": eine feste Farbe
    const colors = page.locator('meta[name="theme-color"]');
    await expect(colors).toHaveCount(2);
    expect(await colors.nth(0).getAttribute('content')).toBe('#f6f5f1');
    expect(await colors.nth(1).getAttribute('content')).toBe('#0e192d');
    await page.context().addCookies([{ name: 'pf-theme', value: 'dark', url: page.url() }]);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(colors).toHaveCount(1);
    expect((await colors.first().getAttribute('content'))?.toLowerCase()).toBe('#0e192d');
  });

  test('Offline-Start nach dem ersten Laden', async ({ page, context }) => {
    await login(page, accounts().studentEmail, /\/heute$/);
    await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, undefined, {
      timeout: 20_000,
    });
    await page.reload();
    await page.waitForFunction(async () => Boolean(await caches.match('/heute')), undefined, {
      timeout: 20_000,
    });
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.getByText('Offline', { exact: false }).first()).toBeVisible();
    await context.setOffline(false);
  });
});

test.describe('Leistung', () => {
  test('LCP auf Heute unter 2 s (mobil, gedrosselt), keine Layout-Sprünge', async ({
    page,
    browser,
  }) => {
    await login(page, accounts().studentEmail, /\/heute$/);
    const ctx = await browser.newContext({
      storageState: await page.context().storageState(),
      viewport: { width: 412, height: 823 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      serviceWorkers: 'block',
    });
    const p = await ctx.newPage();
    // Mobiles Profil wie Lighthouse: langsames 4G (150 ms RTT, 1,6 Mbit/s) und vierfach gedrosselte CPU
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await p.goto('/heute', { waitUntil: 'load' });
    const metrics = await p.evaluate(
      () =>
        new Promise<{ lcp: number; cls: number }>((done) => {
          let lcp = 0;
          let cls = 0;
          new PerformanceObserver((l) => {
            for (const e of l.getEntries()) lcp = e.startTime;
          }).observe({ type: 'largest-contentful-paint', buffered: true });
          new PerformanceObserver((l) => {
            for (const e of l.getEntries() as (PerformanceEntry & {
              value: number;
              hadRecentInput: boolean;
            })[])
              if (!e.hadRecentInput) cls += e.value;
          }).observe({ type: 'layout-shift', buffered: true });
          setTimeout(() => done({ lcp, cls }), 3000);
        }),
    );
    test.info().annotations.push({
      type: 'Leistung',
      description: `LCP ${Math.round(metrics.lcp)} ms, CLS ${metrics.cls.toFixed(3)}`,
    });
    console.log(`Heute mobil: LCP ${Math.round(metrics.lcp)} ms, CLS ${metrics.cls.toFixed(3)}`);
    expect(metrics.lcp).toBeGreaterThan(0);
    expect(metrics.lcp).toBeLessThan(2000);
    expect(metrics.cls).toBeLessThan(0.1);
    await ctx.close();
  });
});
