import { expect, test } from '@playwright/test';
import { accounts, login } from './helpers';

/** M7 Stundenplan-Assistent: Wunsch in Worten, Vorschlag als Entwurf ohne harte Konflikte, Weg in den Editor. */
test('Administration lässt einen Stundenplan vorschlagen und prüft ihn', async ({ page }) => {
  await login(page, accounts().adminEmail, /\/admin$/);
  await page.goto('/admin/assistent');
  await expect(page.getByRole('heading', { name: 'Stundenplan-Assistent' })).toBeVisible();
  await expect(page.getByText('Die AI schlägt vor, die Schule entscheidet.')).toBeVisible();

  // Wunsch in Worten → Vorschlag prüfen → übernehmen
  await page.getByLabel('Wunsch in Worten').fill('Turnen nicht in der ersten Stunde');
  await page.getByRole('button', { name: 'Übersetzen' }).click();
  const proposal = page.getByRole('checkbox', {
    name: /Bewegung und Sport: nicht in der 1\. Stunde/,
  });
  await expect(proposal).toBeChecked();
  await page.getByRole('button', { name: '1 Wunsch übernehmen' }).click();
  await expect(
    page
      .getByRole('list', { name: 'Planungswünsche' })
      .getByText('Bewegung und Sport: nicht in der 1. Stunde'),
  ).toBeVisible();

  // Vorschlag erstellen: neuer Entwurf, Bewertung als Zahlen
  await page.getByRole('button', { name: 'Vorschlag erstellen' }).click();
  await expect(page.getByRole('heading', { name: 'Vorschlag', exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText('0 harte Konflikte')).toBeVisible();
  await expect(page.getByText(/von \d+ Stunden eingeplant/)).toBeVisible();

  // Feinschliff im Editor
  await page.getByRole('link', { name: 'Im Editor feinschleifen' }).click();
  await expect(page).toHaveURL(/\/admin\/stundenplan\/[^/]+$/);
  await expect(page.getByRole('button', { name: 'Vorschlag erstellen' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Vorschlag erstellen' })).toBeVisible();
});
