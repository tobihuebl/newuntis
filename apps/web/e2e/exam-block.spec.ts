import { expect, test } from '@playwright/test';
import pg from 'pg';
import { accounts, login } from './helpers';

/** Montag der übernächsten Woche (YYYY-MM-DD), damit Termine erzeugt und keine Wochenenden getroffen werden. */
function mondayIn2Weeks(): string {
  const d = new Date();
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 14);
  return d.toISOString().slice(0, 10);
}

/**
 * ADR 0024: Die Lehrkraft trägt eine Schularbeit über drei Stunden ein; die Schülerin sieht sie am Handy als
 * Block mit goldenem Rahmen in Tages- und Wochenansicht, dazu einen schulfreien Tag als eigenen Eintrag.
 */
test('Mehrstündige Schularbeit und schulfreier Tag im Plan', async ({ browser }) => {
  test.setTimeout(180_000);
  const { databaseUrl, teacherEmail, studentEmail } = accounts();
  const monday = mondayIn2Weeks();
  const tuesday = new Date(`${monday}T00:00:00Z`);
  tuesday.setUTCDate(tuesday.getUTCDate() + 1);
  const db = new pg.Client({ connectionString: databaseUrl });
  await db.connect();
  await db.query(
    `INSERT INTO "SchoolFreeDay" (id, "tenantId", "schoolYearId", "fromDate", "toDate", label, "updatedAt")
     SELECT 'e2e-free', y."tenantId", y.id, $1::date, $1::date, 'Schulautonom frei', now()
     FROM "SchoolYear" y WHERE y."isCurrent" ON CONFLICT (id) DO NOTHING`,
    [tuesday.toISOString().slice(0, 10)],
  );
  await db.end();

  const kv = await browser.newPage();
  await login(kv, teacherEmail, /\/heute$/);
  await kv.goto('/pruefungen');
  await kv.getByRole('button', { name: 'Prüfung eintragen' }).click();
  const sheet = kv.getByRole('dialog');
  await sheet.getByLabel('Klasse').selectOption({ label: '3A' });
  await sheet.getByLabel('Fach').selectOption({ index: 1 });
  await sheet.getByLabel('Datum').fill(monday);
  await sheet.getByLabel('Von Stunde').selectOption({ index: 2 });
  await sheet.getByLabel('Bis Stunde').selectOption({ index: 2 });
  await expect(sheet.getByText('entfallen automatisch')).toBeVisible();
  await sheet.getByLabel('Bezeichnung').fill('Schularbeit E2E');
  await sheet.getByRole('button', { name: 'Eintragen' }).click();
  await expect(sheet).toBeHidden();
  await kv.close();

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const st = await ctx.newPage();
  await login(st, studentEmail, /\/heute$/);
  await st.goto(`/plan?from=${monday}`);
  // Tagesansicht: Montag mit Prüfungsblock
  await expect(st.getByText('Schularbeit E2E ·')).toBeVisible();
  await st.getByRole('tab', { name: 'Di' }).click();
  await expect(
    st.getByRole('tabpanel', { name: 'Di' }).getByText('Schulautonom frei'),
  ).toBeVisible();
  // Wochenansicht
  await st.getByRole('group', { name: 'Ansicht' }).getByText('Woche', { exact: true }).click();
  // Im Wochenraster steht der freie Tag als eigene Spalte, die Tagesliste ist ausgeblendet
  await expect(st.locator('small', { hasText: 'Schulautonom frei' })).toBeVisible();
  await expect(st.getByRole('tab', { name: 'Di' })).toBeHidden();
  await ctx.close();
});
