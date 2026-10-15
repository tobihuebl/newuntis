import { expect, test } from '@playwright/test';
import { accounts, login } from './helpers';

/** SD-06: Die Administration lädt GPU-Dateien hoch, prüft die Vorschau und übernimmt einen Entwurf. */
test('Stundenplan aus Untis übernehmen', async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, accounts().adminEmail, /\/admin$/);
  await page.goto('/admin/import');
  await page.getByRole('link', { name: 'Stundenplan aus Untis' }).click();
  await expect(
    page.getByRole('heading', { name: 'Stundenplan aus Untis übernehmen' }),
  ).toBeVisible();
  const file = (name: string, lines: string[]) => ({
    name,
    mimeType: 'text/plain',
    buffer: Buffer.from(lines.join('\r\n'), 'latin1'),
  });
  await page
    .getByLabel('GPU-Dateien auswählen')
    .setInputFiles([
      file('GPU001.TXT', [
        '1,"3A","XUN","M","",1,1,,',
        '1,"3A","XUN","M","",1,2,,',
        '2,"3A","YUN","DGB","",2,3,,',
      ]),
      file('GPU006.TXT', ['"DGB","Digitale Grundbildung"']),
      file('notizen.txt', ['egal']),
    ]);
  await expect(page.getByText('Nicht verwendet: notizen.txt')).toBeVisible();
  await page.getByRole('button', { name: '2 Dateien prüfen' }).click();
  await expect(page.getByRole('heading', { name: '3. Vorschau' })).toBeVisible();
  await expect(page.getByText('1 Doppelstunden')).toBeVisible();
  await expect(page.getByText('DGB · Digitale Grundbildung')).toBeVisible();
  await page.getByRole('button', { name: /Als Entwurf übernehmen/ }).click();
  await expect(page.getByRole('heading', { name: 'Stundenplan übernommen' })).toBeVisible();
  await page.getByRole('link', { name: 'Entwurf öffnen' }).click();
  await expect(page).toHaveURL(/\/admin\/stundenplan\/[^/]+$/);
});
