import { expect, test } from '@playwright/test';
import { accounts, login } from './helpers';

/** Spec Abschnitt 13: Supplierung veröffentlichen (Direktion). Der Seed meldet eine Lehrkraft für den nächsten Schultag krank. */
test('Direktion weist eine Vertretung zu und veröffentlicht', async ({ page }) => {
  await login(page, accounts().principalEmail, /\/lagebild$/);
  // Seed: Lehrkraft am nächsten Schultag krank
  const d = new Date();
  do d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6);
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(d);
  await page.goto(`/supplierung?datum=${day}`);
  const open = page.locator('li[data-substitution="OPEN"]').first();
  await expect(open).toBeVisible();
  await open.getByRole('button', { name: 'Bearbeiten' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('input[name="substitute"]').first().check();
  await dialog.getByRole('button', { name: 'Übernehmen' }).click();
  await expect(page.locator('li[data-substitution="ASSIGNED"]')).toHaveCount(1);
  await page.getByRole('button', { name: /^Veröffentlichen \(1\)$/ }).click();
  await expect(page.getByText(/1 Änderung veröffentlicht/)).toBeVisible();
  await expect(page.locator('li[data-substitution="PUBLISHED"]')).toHaveCount(1);
});
