import { expect, test } from '@playwright/test';
import { accounts, login } from './helpers';

test('Administration veröffentlicht einen neuen Stundenplan', async ({ page }) => {
  await login(page, accounts().adminEmail, /\/admin$/);
  await page.goto('/admin/stundenplan');
  await page.getByRole('button', { name: 'Neuer Entwurf' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Bezeichnung').fill('E2E Entwurf');
  await dialog.getByRole('button', { name: 'Anlegen' }).click();
  await expect(page).toHaveURL(/\/admin\/stundenplan\/[^/]+$/);

  await page.getByRole('button', { name: 'Veröffentlichen' }).click();
  const publish = page.getByRole('dialog');
  await expect(publish.getByLabel('Gültig ab')).toBeVisible();
  await publish.getByRole('button', { name: 'Veröffentlichen' }).click();
  // danach ist die Version veröffentlicht und schreibgeschützt
  await expect(
    page.getByText('Diese Version ist veröffentlicht und schreibgeschützt.'),
  ).toBeVisible();

  await page.goto('/admin/stundenplan');
  // Versionen als Listenzeilen (Design System: Tabellen mobil als Karten-Liste)
  const row = page
    .getByRole('listitem')
    .filter({ hasText: 'E2E Entwurf' })
    .filter({ hasText: 'Veröffentlicht' });
  await expect(row).toHaveCount(1);
});
