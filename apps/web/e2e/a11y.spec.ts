import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';
import { accounts, completeOnboarding, login } from './helpers';

/** Barrierefreiheit (Spec Abschnitt 13): Kernseiten ohne Verstöße gegen WCAG 2.2 AA (axe). */
async function check(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const summary = result.violations.map(
    (v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`,
  );
  expect(summary, `${path}`).toEqual([]);
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`Barrierefreiheit (${scheme})`, () => {
    test.use({ colorScheme: scheme });

    test('öffentliche Seiten', async ({ page }) => {
      await check(page, '/login');
      await check(page, '/passwort-vergessen');
    });

    test('Lehrkraft: Heute, Klassenbuch, Plan', async ({ page }) => {
      await login(page, accounts().teacherEmail, /\/heute$/);
      await check(page, '/heute');
      await check(page, '/klassenbuch');
      const first = page.locator('section[aria-labelledby="open"] a').first();
      const href = await first.getAttribute('href');
      await check(page, href!);
      await check(page, '/plan');
      await check(page, '/pruefungen');
      await check(page, '/krankmeldung');
      await check(page, '/klasse');
      await check(page, '/klassen');
      await check(page, '/nachrichten');
      await check(page, '/nachrichten/neu');
      await check(page, '/raeume');
    });

    test('Einführung nach dem ersten Login', async ({ page }) => {
      const { studentEmail, databaseUrl } = accounts();
      await login(page, studentEmail, /\/heute$/);
      // Einführung erneut fällig machen (z. B. neue Fassung des Datenschutzhinweises)
      const db = new pg.Client({ connectionString: databaseUrl });
      await db.connect();
      await db.query('UPDATE "User" SET "onboardedAt" = NULL WHERE email = $1', [studentEmail]);
      await db.end();
      await page.goto('/heute');
      await expect(page).toHaveURL(/\/willkommen$/);
      await check(page, '/willkommen');
      await completeOnboarding(page);
      await expect(page).toHaveURL(/\/heute$/);
    });

    test('Schüler:in: Heute, Plan, Aufgaben, Profil, Benachrichtigungen', async ({ page }) => {
      await login(page, accounts().studentEmail, /\/heute$/);
      await check(page, '/heute');
      await check(page, '/plan');
      await check(page, '/aufgaben');
      await check(page, '/profil');
      await check(page, '/benachrichtigungen');
      await check(page, '/nachrichten?ansicht=rundschreiben');
    });

    test('Eltern: Abwesenheit melden, Fehlzeiten, Termine', async ({ page }) => {
      await login(page, accounts().guardianEmail, /\/heute(\?.*)?$/);
      await check(page, '/abwesenheit/neu');
      await check(page, '/termine');
      await page.goto('/heute');
      const href = await page
        .getByRole('link', { name: 'Fehlzeiten' })
        .first()
        .getAttribute('href');
      await check(page, href!);
    });

    test('Direktion: Lagebild, Supplierung, Auswertung, Rundschreiben', async ({ page }) => {
      await login(page, accounts().principalEmail, /\/lagebild$/);
      await check(page, '/lagebild');
      await check(page, '/supplierung');
      await check(page, '/auswertung');
      await check(page, '/auswertung?ansicht=supplierungen');
      await check(page, '/rundschreiben');
      await check(page, '/rundschreiben/neu');
      await check(page, '/freigaben');
    });

    test('Administration: Personen und Stundenplan', async ({ page }) => {
      await login(page, accounts().adminEmail, /\/admin\/personen$/);
      await check(page, '/admin/personen');
      await check(page, '/admin/stundenplan');
      await check(page, '/admin/datenschutz');
      await check(page, '/admin/einstellungen');
      await check(page, '/admin/rollen');
    });
  });
}
