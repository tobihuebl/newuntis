import { expect, test } from '@playwright/test';
import { accounts, login } from './helpers';

/** PN-02 Noten: eintragen und freigeben (Lehrkraft), sehen (Schüler:in), lesen (Direktion über die Klasse). */
test('Lehrkraft legt eine Leistung an, benotet und gibt frei', async ({ page }) => {
  await login(page, accounts().teacherEmail, /\/heute$/);
  await page.goto('/noten');
  await page.getByRole('link', { name: /· 3A/ }).first().click();
  await expect(page).toHaveURL(/\/noten\/kurs\?klasse=/);
  await expect(page.getByRole('heading', { name: 'Gewichtung' })).toBeVisible();

  // Gewichtung anpassen: Summe muss 100 % sein
  await page.getByRole('button', { name: 'Gewichtung bearbeiten' }).click();
  const w = page.getByRole('dialog', { name: 'Gewichtung' });
  await w.getByLabel('Schularbeit').fill('40');
  await expect(w.getByRole('button', { name: 'Speichern' })).toBeDisabled();
  await w.getByLabel('Test').fill('35');
  await w.getByRole('button', { name: 'Speichern' }).click();
  await expect(w).toBeHidden();
  await expect(page.getByText(/Schularbeit 40 % · Test 35 %/)).toBeVisible();

  // Neue Leistung, eine Note, freigeben
  await page.getByRole('button', { name: 'Leistung anlegen' }).click();
  const sheet = page.getByRole('dialog', { name: 'Leistung anlegen' });
  await sheet.getByLabel('Art').selectOption('TEST');
  await sheet.getByLabel('Bezeichnung').fill('E2E-Test');
  await sheet.getByRole('button', { name: 'Speichern' }).click();
  await expect(page).toHaveURL(/leistung=/);
  await expect(page.getByRole('heading', { name: 'E2E-Test' })).toBeVisible();
  const first = page.getByRole('group', { name: /^Note für / }).first();
  await first.getByRole('button', { name: '2 Gut' }).click();
  await expect(first.getByRole('button', { name: '2 Gut' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByText(/^1 von \d+ benotet$/)).toBeVisible();
  await page.getByRole('button', { name: 'Noten freigeben' }).click();
  await page
    .getByRole('dialog', { name: 'Noten freigeben?' })
    .getByRole('button', { name: 'Noten freigeben' })
    .click();
  await expect(page.getByText(/^freigegeben am/)).toBeVisible();
});

test('Schüler:in sieht nur freigegebene Noten mit Durchschnitt', async ({ page }) => {
  await login(page, accounts().studentEmail, /\/heute$/);
  await page.goto('/noten');
  await expect(page.getByRole('heading', { name: 'Mathematik' })).toBeVisible();
  await expect(page.getByText('1. Schularbeit').first()).toBeVisible();
  await expect(page.getByText('Test Bruchrechnen')).toHaveCount(0);
});

test('Direktion liest Noten über die Klassenseite', async ({ page }) => {
  await login(page, accounts().principalEmail, /\/lagebild$/);
  await page.goto('/klassen');
  await page.getByRole('link', { name: /^3A\b/ }).click();
  await page.getByRole('link', { name: 'Noten' }).click();
  await expect(page.getByRole('heading', { name: 'Noten 3A' })).toBeVisible();
  await page.getByRole('link', { name: 'M', exact: true }).click();
  await expect(
    page.getByText('Nur lesen. Eintragen kann die Lehrkraft dieses Fachs.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Leistung anlegen' })).toHaveCount(0);
});
