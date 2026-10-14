import { expect, test } from '@playwright/test';
import pg from 'pg';
import { accounts, login } from './helpers';

/**
 * SD-05 Schuljahreswechsel: Klassenvorstand trägt "wiederholt" ein, die Administration legt die Folgeklassen an
 * und übernimmt die Schüler:innen. Das nächste Schuljahr legt der Test direkt an (beginnt nach dem aktuellen).
 */
test('Schuljahreswechsel vom Klassenvorstand bis zur Übernahme', async ({ browser }) => {
  const { databaseUrl, teacherEmail, adminEmail } = accounts();
  const db = new pg.Client({ connectionString: databaseUrl });
  await db.connect();
  await db.query(`
    INSERT INTO "SchoolYear" (id, "tenantId", name, "startsOn", "endsOn", "isCurrent", "updatedAt")
    SELECT 'e2e-next-year', y."tenantId", '2027/28', y."endsOn" + 60, y."endsOn" + 360, false, now()
    FROM "SchoolYear" y WHERE y."isCurrent" ON CONFLICT (id) DO NOTHING`);
  await db.end();

  // Klassenvorstand der 3A: eine Schülerin wiederholt
  const kv = await browser.newPage();
  await login(kv, teacherEmail, /\/heute$/);
  await kv.goto('/klasse');
  const card = kv.getByRole('region', { name: 'Schuljahresende' });
  await expect(card).toBeVisible();
  await card.getByRole('link', { name: 'Aufstieg festlegen' }).click();
  await expect(kv.getByRole('heading', { name: 'Schuljahresende 3A' })).toBeVisible();
  const first = kv.getByRole('combobox', { name: /^Entscheidung für / }).first();
  await first.selectOption('REPEAT');
  await kv.getByLabel('Anmerkung').fill('Klassenkonferenz');
  await kv.getByRole('button', { name: 'Speichern' }).click();
  await expect(kv.getByText('Alles gespeichert')).toBeVisible();
  await kv.getByRole('link', { name: 'Zur Klasse' }).click();
  await expect(
    kv.getByRole('region', { name: 'Schuljahresende' }).getByText('1 wiederholen'),
  ).toBeVisible();
  await kv.close();

  // Administration: Assistent
  const page = await browser.newPage();
  await login(page, adminEmail, /\/admin$/);
  await page.goto('/admin/schuljahr');
  await page.getByRole('link', { name: 'Schuljahreswechsel starten' }).click();
  await expect(page.getByRole('heading', { name: 'Schuljahreswechsel', level: 1 })).toBeVisible();
  await expect(page.getByLabel('Folgeklasse von 3A')).toHaveValue('4A');
  await expect(page.getByLabel('Folgeklasse von 4A')).toHaveValue('');
  await page.getByRole('button', { name: 'Klassen anlegen' }).click();
  await expect(page.getByText('angelegt: 4A')).toBeVisible();
  await expect(
    page.getByRole('region', { name: '2. Entscheidungen prüfen' }).getByText('1 wiederholen'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Schüler:innen übernehmen' }).click();
  await expect(page.getByText('Alle Schüler:innen sind übernommen.')).toBeVisible();
  await page.close();
});
