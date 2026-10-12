import { expect, test } from '@playwright/test';
import { accounts, login } from './helpers';

test('Lehrkraft trägt eine Stunde offline ein, danach wird fehlerfrei synchronisiert', async ({
  page,
  context,
}) => {
  await login(page, accounts().teacherEmail, /\/heute$/);
  await expect(page.getByRole('heading', { name: 'Meine Stunden heute' })).toBeVisible();
  // Service Worker steuert die Seite (App-Hülle offline verfügbar)
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, undefined, {
    timeout: 20_000,
  });

  await page.goto('/klassenbuch');
  const openLinks = page.locator('section[aria-labelledby="open"] a');
  await expect(openLinks.first()).toBeVisible();
  await openLinks.first().click();
  await expect(page).toHaveURL(/\/klassenbuch\/[^/?]+/);
  const id = new URL(page.url()).pathname.split('/').pop()!;
  const rows = page.locator('li[data-student]');
  await expect(rows.first()).toBeVisible();
  const students = await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-student')!));
  expect(students.length).toBeGreaterThan(3);

  // Seite liegt im Service-Worker-Cache (wie nach jedem Öffnen mit Verbindung)
  await page.waitForFunction(
    async (path) => Boolean(await caches.match(path)),
    `/klassenbuch/${id}`,
    { timeout: 20_000 },
  );

  // ── offline eintragen ──
  await context.setOffline(true);
  await rows.nth(0).getByRole('button').first().click(); // anwesend -> abwesend
  await rows.nth(1).getByRole('button').first().click();
  await rows.nth(1).getByRole('button').first().click(); // und zurück: zusammengefasst
  await rows
    .nth(2)
    .getByRole('button', { name: /Verspätung eintragen/ })
    .click();
  await page.getByRole('button', { name: '10', exact: true }).click();
  await page.getByRole('button', { name: 'Übernehmen' }).click();
  await page
    .getByRole('textbox', { name: 'Stoff', exact: true })
    .fill('Offline eingetragen: Bruchrechnen');
  await page.getByRole('textbox', { name: 'Hausübung', exact: true }).fill('Buch S. 50, Nr. 1');
  await page.getByRole('button', { name: 'Stunde abschließen' }).click();

  // Abschluss ist lokal vorgemerkt (sichtbar), erst dann neu laden
  await expect(page.getByText(/^Abgeschlossen am/)).toBeVisible();
  await expect(rows.nth(0)).toHaveAttribute('data-status', 'ABSENT');
  await expect(rows.nth(1)).toHaveAttribute('data-status', 'PRESENT');
  await expect(rows.nth(2)).toHaveAttribute('data-status', 'LATE');
  const status = page.locator('[data-sync-state]').first();
  await expect(status).toHaveAttribute('data-sync-state', 'warn');
  await expect(status).toContainText('warten auf Verbindung');

  // Neu laden ohne Verbindung: Seite aus dem Service Worker, Stand aus IndexedDB
  await page.reload();
  await expect(rows.nth(0)).toHaveAttribute('data-status', 'ABSENT');
  await expect(rows.nth(2)).toHaveAttribute('data-status', 'LATE');
  await expect(page.getByRole('textbox', { name: 'Stoff', exact: true })).toHaveValue(
    'Offline eingetragen: Bruchrechnen',
  );
  await expect(page.getByRole('textbox', { name: 'Hausübung', exact: true })).toHaveValue(
    'Buch S. 50, Nr. 1',
  );

  // ── wieder online: Outbox wird abgearbeitet ──
  await context.setOffline(false);
  await expect(status).toHaveAttribute('data-sync-state', 'ok', { timeout: 30_000 });
  await expect(status).toHaveAttribute('data-pending', '0');
  await expect(status).toContainText('Synchronisiert');

  const res = await page.request.get(`/api/v1/occurrences/${id}`);
  expect(res.status()).toBe(200);
  const d = (await res.json()) as {
    entry: { topic: string; homework: string; closedAt: string | null; version: number };
    attendance: Record<string, { status: string; lateMinutes: number | null }>;
  };
  expect(d.entry.topic).toBe('Offline eingetragen: Bruchrechnen');
  expect(d.entry.homework).toBe('Buch S. 50, Nr. 1');
  expect(d.entry.closedAt).toBeTruthy();
  expect(d.entry.version).toBe(1); // genau eine Änderung angekommen, keine Doppelung
  expect(d.attendance[students[0]!]!.status).toBe('ABSENT');
  expect(d.attendance[students[1]!]!.status).toBe('PRESENT');
  expect(d.attendance[students[2]!]).toMatchObject({ status: 'LATE', lateMinutes: 10 });
  // beim Abschließen sind alle Nicht-Eingetragenen als anwesend festgehalten
  expect(Object.keys(d.attendance).sort()).toEqual([...students].sort());

  // Der offene Eintrag ist erledigt
  await page.goto('/klassenbuch');
  await expect(
    page.locator(`section[aria-labelledby="open"] a[href^="/klassenbuch/${id}"]`),
  ).toHaveCount(0);
});
