import { expect, test } from '@playwright/test';
import { accounts, login } from './helpers';

/** Spec Abschnitt 13: Abwesenheit melden (Eltern) und entschuldigen (Klassenvorstand), Ende zu Ende. */
test('Eltern melden eine Abwesenheit, der Klassenvorstand nimmt sie an, Eltern werden benachrichtigt', async ({
  browser,
}) => {
  const parentCtx = await browser.newContext();
  const parent = await parentCtx.newPage();
  await login(parent, accounts().guardianEmail, /\/heute(\?.*)?$/);
  await parent.getByRole('link', { name: 'Abwesenheit melden' }).first().click();
  await expect(parent).toHaveURL(/\/abwesenheit\/neu/);
  // Vorab-Meldung in zehn Tagen: kollidiert nicht mit Fehlzeiten aus dem Seed
  const d = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
  await parent.locator('fieldset label', { hasText: /^Zeitraum$/ }).click();
  await expect(parent.getByRole('radio', { name: 'Zeitraum' })).toBeChecked();
  await parent.getByLabel('Von').fill(d);
  await parent.getByLabel('Bis').fill(d);
  // Grund als Segment-Auswahl (Design System): Radio im Fieldset „Grund“
  await parent.getByRole('group', { name: 'Grund' }).getByText('Krankheit').click();
  await expect(parent.getByRole('radio', { name: 'Krankheit' })).toBeChecked();
  const note = `Fieber (E2E ${Date.now().toString(36)})`;
  await parent.getByLabel('Anmerkung (optional)').fill(note);
  await parent.getByRole('button', { name: 'Melden' }).click();
  await expect(parent.getByText('Abwesenheit gemeldet.')).toBeVisible();
  await parent.getByRole('link', { name: 'Bisherige Fehlzeiten' }).click();
  const reported = parent.locator('li[data-absence="REPORTED"]', { hasText: note });
  await expect(reported).toBeVisible();
  const studentName = (await parent.locator('h1').textContent()) ?? '';
  expect(studentName).toBe('Fehlzeiten');

  // Klassenvorstand prüft
  const kvCtx = await browser.newContext();
  const kv = await kvCtx.newPage();
  await login(kv, accounts().teacherEmail, /\/heute$/);
  await kv.goto('/klasse');
  await expect(kv).toHaveURL(/\/klasse\/[^/]+\/entschuldigungen$/);
  const row = kv.locator('li[data-absence="REPORTED"]', { hasText: note });
  await row.getByRole('button', { name: /^Mit Kommentar/ }).click();
  const dialog = kv.getByRole('dialog');
  await dialog.getByLabel('Kommentar (optional)').fill('Gute Besserung');
  await dialog.getByRole('button', { name: 'Entschuldigen' }).click();
  await expect(
    kv.locator('li[data-absence="EXCUSED"]', { hasText: 'Gute Besserung' }),
  ).toBeVisible();

  // Eltern sehen die Entscheidung und eine Benachrichtigung
  await parent.reload();
  await expect(
    parent.locator('li[data-absence="EXCUSED"]', { hasText: 'Gute Besserung' }),
  ).toBeVisible();
  await parent.goto('/benachrichtigungen');
  await expect(parent.getByText('Entschuldigung bearbeitet').first()).toBeVisible();
  await parentCtx.close();
  await kvCtx.close();
});

/** Design System Screens 6: Entschuldigen in einem Tipp, mit Rückgängig; gespeichert wird nach dem Toast. */
test('Klassenvorstand entschuldigt mit einem Tipp und kann es rückgängig machen', async ({
  browser,
}) => {
  const parentCtx = await browser.newContext();
  const parent = await parentCtx.newPage();
  await login(parent, accounts().guardianEmail, /\/heute(\?.*)?$/);
  await parent.goto('/abwesenheit/neu');
  const d = new Date(Date.now() + 11 * 86_400_000).toISOString().slice(0, 10);
  await parent.locator('fieldset label', { hasText: /^Zeitraum$/ }).click();
  await parent.getByLabel('Von').fill(d);
  await parent.getByLabel('Bis').fill(d);
  const note = `Arzt (E2E ${Date.now().toString(36)})`;
  await parent.getByLabel('Anmerkung (optional)').fill(note);
  await parent.getByRole('button', { name: 'Melden' }).click();
  await expect(parent.getByText('Abwesenheit gemeldet.')).toBeVisible();
  await parentCtx.close();

  const kvCtx = await browser.newContext();
  const kv = await kvCtx.newPage();
  await login(kv, accounts().teacherEmail, /\/heute$/);
  await kv.goto('/klasse');
  const row = kv.locator('li[data-absence="REPORTED"]', { hasText: note });
  await row.getByRole('button', { name: /^Entschuldigen:/ }).click();
  await expect(row).toBeHidden();
  const toast = kv.getByRole('status').filter({ hasText: 'entschuldigt' });
  await expect(toast).toBeVisible();
  await toast.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(row).toBeVisible();

  const saved = kv.waitForResponse(
    (r) => r.url().includes('/review') && r.request().method() === 'PATCH',
    { timeout: 10_000 },
  );
  await row.getByRole('button', { name: /^Entschuldigen:/ }).click();
  expect((await saved).ok()).toBe(true);
  await kv.reload();
  await expect(kv.locator('li[data-absence="EXCUSED"]', { hasText: note })).toBeVisible();
  await kvCtx.close();
});
