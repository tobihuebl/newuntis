import { expect, test } from '@playwright/test';
import { accounts, login } from './helpers';

/**
 * M6 (Spec Abschnitt 14): Kommunikation ohne WhatsApp-Gruppen. Klassenvorstand schreibt den Eltern der Klasse
 * (je Familie ein Gespräch), Eltern antworten privat; Direktion schickt ein Rundschreiben mit Lesebestätigung.
 */
test('Nachricht an die Eltern der Klasse, Antwort, Rundschreiben mit Lesebestätigung, Lagebild', async ({
  browser,
}) => {
  const tag = Date.now().toString(36);

  // Klassenvorstand 3A: Nachricht an alle Eltern der Klasse
  const kvCtx = await browser.newContext();
  const kv = await kvCtx.newPage();
  await login(kv, accounts().teacherEmail, /\/heute$/);
  await kv.goto('/klassen');
  await kv.getByRole('link', { name: /3A/ }).first().click();
  await kv.getByRole('link', { name: 'Nachricht an Eltern' }).click();
  await expect(kv).toHaveURL(/\/nachrichten\/neu\?klasse=/);
  await expect(kv.getByRole('radio', { name: 'Klasse' })).toBeChecked();
  await kv.getByLabel('Betreff', { exact: true }).fill(`Wandertag ${tag}`);
  await kv
    .getByRole('textbox', { name: 'Nachricht', exact: true })
    .fill('Am Freitag ist Wandertag. Bitte feste Schuhe mitgeben.');
  await kv.getByRole('button', { name: 'Senden' }).click();
  await expect(kv.getByRole('status').filter({ hasText: 'Gespräche angelegt' })).toBeVisible();

  // Elternteil: Hinweis in Heute, Gespräch öffnen, antworten
  const parentCtx = await browser.newContext();
  const parent = await parentCtx.newPage();
  await login(parent, accounts().guardianEmail, /\/heute(\?.*)?$/);
  await expect(parent.getByRole('link', { name: /neue Nachricht/ })).toBeVisible();
  await parent.goto('/nachrichten');
  await parent.getByRole('link', { name: new RegExp(`Wandertag ${tag}`) }).click();
  await expect(parent.getByText('Bitte feste Schuhe mitgeben.')).toBeVisible();
  await parent
    .getByRole('textbox', { name: 'Antwort', exact: true })
    .fill(`Danke, ist notiert (${tag}).`);
  await parent.getByRole('button', { name: 'Senden' }).click();
  await expect(parent.getByText(`Danke, ist notiert (${tag}).`)).toBeVisible();

  // Klassenvorstand sieht die Antwort im eigenen Posteingang (Echtzeit oder Neuladen)
  await kv.goto('/nachrichten');
  await expect(kv.getByText(`Danke, ist notiert (${tag}).`)).toBeVisible();

  // Direktion: Rundschreiben mit Lesebestätigung an die Eltern der 3A
  const pCtx = await browser.newContext();
  const principal = await pCtx.newPage();
  await login(principal, accounts().principalEmail, /\/lagebild$/);
  await expect(principal.getByRole('heading', { name: 'Lagebild' })).toBeVisible();
  await expect(principal.getByRole('link', { name: /Offene Supplierungen/ })).toBeVisible();
  await principal.goto('/rundschreiben/neu');
  await principal.getByLabel('Titel', { exact: true }).fill(`Elternabend ${tag}`);
  await principal
    .getByLabel('Text', { exact: true })
    .fill('Elternabend am Dienstag um 18 Uhr im Festsaal.');
  await principal.locator('fieldset label', { hasText: /^Klassen oder Gruppen$/ }).click();
  await principal.getByRole('checkbox', { name: '3A', exact: true }).check();
  await principal.getByRole('switch', { name: 'Lesebestätigung anfordern' }).click();
  await expect(
    principal.getByRole('status').filter({ hasText: /Geht an \d+ Person/ }),
  ).toBeVisible();
  await principal.getByRole('button', { name: 'Veröffentlichen' }).click();
  await expect(principal).toHaveURL(/\/rundschreiben\/[^/]+$/);
  await expect(principal.getByText(/^0 von \d+ gelesen$/)).toBeVisible();

  // Elternteil bestätigt
  await parent.goto('/nachrichten?ansicht=rundschreiben');
  await expect(parent.getByText('Lesebestätigung ausständig').first()).toBeVisible();
  await parent.getByRole('link', { name: new RegExp(`Elternabend ${tag}`) }).click();
  await parent.getByRole('button', { name: 'Gelesen und verstanden' }).click();
  await expect(parent.getByText(/Gelesen bestätigt am/)).toBeVisible();

  await principal.reload();
  await expect(principal.getByText(/^1 von \d+ gelesen$/)).toBeVisible();

  await Promise.all([kvCtx.close(), parentCtx.close(), pCtx.close()]);
});
