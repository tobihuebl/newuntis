import { expect, test } from '@playwright/test';
import { accounts, login } from './helpers';

/**
 * KO-05 Einverständniserklärungen: Der Klassenvorstand der 3A verschickt eine Erklärung an die ganze Klasse,
 * ein Elternteil sieht den Hinweis unter "Heute" und stimmt zu, die Lehrkraft sieht die Zustimmung.
 */
test('Einverständniserklärung von der Lehrkraft zu den Eltern und zurück', async ({ browser }) => {
  test.setTimeout(180_000);
  const { teacherEmail, guardianEmail } = accounts();

  const kv = await browser.newPage();
  await login(kv, teacherEmail, /\/heute$/);
  await kv.goto('/einverstaendnis');
  await kv.getByRole('link', { name: 'Neue Erklärung' }).click();
  await kv.getByLabel('Titel').fill('Wandertag Kahlenberg');
  await kv.getByLabel('Text an die Eltern').fill('Treffpunkt 8 Uhr am Schultor, Jause mitnehmen.');
  await kv.getByRole('checkbox', { name: /^Ganze 3A/ }).check();
  await kv.getByRole('button', { name: /verschicken$/ }).click();
  await expect(kv.getByRole('heading', { name: 'Wandertag Kahlenberg' })).toBeVisible();
  const detail = kv.url();

  const g = await browser.newPage();
  await login(g, guardianEmail, /\/heute$/);
  await g.getByRole('link', { name: /wartet auf Ihre Antwort/ }).click();
  await expect(g).toHaveURL(/\/einverstaendnis$/);
  const card = g.getByRole('listitem').filter({ hasText: 'Wandertag Kahlenberg' }).first();
  await card.getByLabel('Anmerkung (optional)').first().fill('Bitte an die Nussallergie denken');
  await card.getByRole('button', { name: 'Ja, einverstanden' }).first().click();
  await expect(card.getByText('Zugestimmt').first()).toBeVisible();
  await g.close();

  await kv.goto(detail);
  await expect(kv.getByText('1 zugestimmt')).toBeVisible();
  await expect(kv.getByText('Anmerkung: Bitte an die Nussallergie denken')).toBeVisible();
  await kv.close();
});
