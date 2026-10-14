import { expect, test } from '@playwright/test';
import { accounts, login } from './helpers';

/** KB-07: Lehrkraft erfasst Notiz und Vermerk im Klassenbuch, die Direktion findet den Vermerk bei der Klasse. */
test('Notiz und besonderes Vorkommnis im Klassenbuch', async ({ browser }) => {
  const text = `Vermerk ${Date.now().toString(36)}`;
  const teacherPage = await browser.newPage();
  await login(teacherPage, accounts().teacherEmail, /\/heute$/);
  await teacherPage.goto('/klassenbuch');
  await teacherPage.locator('section[aria-labelledby="open"] a').first().click();
  await expect(teacherPage.locator('li[data-student]').first()).toBeVisible();
  const heading = (await teacherPage.getByRole('heading', { level: 1 }).textContent()) ?? '';
  const className = heading.split(' · ')[0]!.trim();

  await teacherPage.getByLabel('Notiz zur Stunde').fill('Klasse sehr unruhig');
  await teacherPage.getByLabel('Notiz zur Stunde').blur();

  await teacherPage.getByRole('button', { name: 'Vermerk hinzufügen' }).click();
  const sheet = teacherPage.getByRole('dialog', { name: 'Vermerk hinzufügen' });
  const select = sheet.getByLabel('Schüler:in');
  await select.selectOption({ index: 1 });
  const student = (await select.locator('option:checked').textContent())!.trim();
  await sheet.getByLabel('Vermerk', { exact: true }).fill(text);
  await sheet.getByRole('button', { name: 'Speichern' }).click();
  const remarks = teacherPage.getByRole('region', { name: 'Besondere Vorkommnisse' });
  await expect(remarks.getByText(text)).toBeVisible();
  // Nach dem Senden erscheint die Lehrkraft als Verfasser:in mit Zeit
  await expect(remarks.getByText('wird gesendet')).toHaveCount(0);
  await teacherPage.reload();
  await expect(teacherPage.getByLabel('Notiz zur Stunde')).toHaveValue('Klasse sehr unruhig');
  await expect(remarks.getByText(text)).toBeVisible();
  await teacherPage.close();

  const page = await browser.newPage();
  await login(page, accounts().principalEmail, /\/lagebild$/);
  await page.goto('/klassen');
  await page.getByRole('link', { name: new RegExp(`^${className}\\b`) }).click();
  await page.getByRole('link', { name: 'Vermerke' }).click();
  await expect(page).toHaveURL(/\/vermerke$/);
  const list = page.getByRole('list', { name: 'Vermerke' });
  await expect(list.getByText(text)).toBeVisible();
  await expect(list.getByText(student)).toBeVisible();
  await page.close();
});
