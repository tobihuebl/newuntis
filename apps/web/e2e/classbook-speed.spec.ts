import { expect, test } from '@playwright/test';
import { accounts, login } from './helpers';

/**
 * Zehn-Sekunden-Regel (Design System, Umsetzung D4): Klassenbuch öffnen, eine Schülerin abwesend tippen, Stoff
 * eintragen, Stunde abschließen. Höchstens vier Taps und unter zehn Sekunden Interaktionszeit.
 */
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test('Stunde abschließen in höchstens vier Taps und unter zehn Sekunden', async ({ page }) => {
  await login(page, accounts().teacherEmail, /\/heute$/);
  await page.goto('/klassenbuch');
  const open = page.locator('section[aria-labelledby="open"] a').first();
  await expect(open).toBeVisible();

  let taps = 0;
  const started = Date.now();

  await open.tap(); // 1: Stunde öffnen
  taps++;
  const rows = page.locator('li[data-student]');
  await expect(rows.first()).toBeVisible();

  await rows.first().getByRole('button').first().tap(); // 2: abwesend
  taps++;
  await expect(rows.first()).toHaveAttribute('data-status', 'ABSENT');

  const topic = page.getByRole('textbox', { name: 'Stoff', exact: true });
  await topic.tap(); // 3: Stoff-Feld
  taps++;
  await topic.fill('Bruchrechnen: Kürzen und Erweitern');

  await page.getByRole('button', { name: /abschließen/i }).tap(); // 4: abschließen
  taps++;
  await expect(page.getByText(/^Abgeschlossen am/)).toBeVisible();

  const seconds = (Date.now() - started) / 1000;
  test
    .info()
    .annotations.push({ type: 'Dauer', description: `${seconds.toFixed(1)} s, ${taps} Taps` });
  expect(taps).toBeLessThanOrEqual(4);
  expect(seconds).toBeLessThan(10);
});
