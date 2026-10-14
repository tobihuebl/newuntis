import { expect, test } from '@playwright/test';
import pg from 'pg';
import { PASSWORD, accounts, login } from './helpers';

/**
 * Onboarding (ADR 0020): Der Klassenvorstand druckt einen Zugangsbrief, die Schülerin löst den Code ein, meldet
 * sich mit dem Benutzernamen an, durchläuft ihren Flow (Avatar, Klasse) und findet die Checkliste mit Coachmark.
 */
test('Zugangsbrief bis zur ersten Coachmark', async ({ browser }) => {
  test.setTimeout(180_000);
  const { databaseUrl, teacherEmail } = accounts();
  const db = new pg.Client({ connectionString: databaseUrl });
  await db.connect();
  // Schülerin ohne Konto in der 3A (wie nach dem CSV-Import)
  await db.query(`
    INSERT INTO "Person" (id, "tenantId", kind, "firstName", "lastName", "updatedAt")
    SELECT 'e2e-ob-student', c."tenantId", 'STUDENT', 'Ida', 'Neumann', now()
    FROM "SchoolClass" c JOIN "SchoolYear" y ON y.id = c."schoolYearId" AND y."isCurrent"
    WHERE c.name = '3A' ON CONFLICT (id) DO NOTHING`);
  await db.query(`
    INSERT INTO "Enrollment" (id, "tenantId", "studentId", "classId", "fromDate", "updatedAt")
    SELECT 'e2e-ob-enr', c."tenantId", 'e2e-ob-student', c.id, y."startsOn", now()
    FROM "SchoolClass" c JOIN "SchoolYear" y ON y.id = c."schoolYearId" AND y."isCurrent"
    WHERE c.name = '3A' ON CONFLICT (id) DO NOTHING`);
  await db.end();

  const kv = await browser.newPage();
  await login(kv, teacherEmail, /\/heute$/);
  await kv.goto('/klasse');
  await kv.getByRole('link', { name: 'Zugangsbriefe' }).click();
  await expect(kv.getByRole('heading', { name: 'Zugangsbriefe 3A' })).toBeVisible();
  // nur der neue Brief
  for (const box of await kv.getByRole('listitem').getByRole('checkbox').all())
    await box.setChecked(false);
  await kv.getByRole('checkbox', { name: 'Neumann Ida' }).check();
  await kv.getByRole('button', { name: '1 Brief erstellen' }).click();
  const letter = kv.getByRole('article').filter({ hasText: 'Ida Neumann' });
  await expect(letter.getByRole('img', { name: 'QR-Code zum Einlösen' })).toBeVisible();
  const username = (await letter.locator('dd').nth(0).textContent())!.trim();
  const code = (await letter.locator('dd').nth(1).textContent())!.trim();
  expect(username).toBe('ida.neumann');
  await kv.close();

  // Schülerin: Code einlösen (wie über den QR-Code, Code im Fragment)
  const st = await browser.newPage();
  await st.goto(`/zugang#code=${code}`);
  await expect(st.getByLabel('Code')).toHaveValue(code);
  await st.getByRole('button', { name: 'Weiter' }).click();
  await expect(st.getByRole('heading', { name: 'Hallo Ida' })).toBeVisible();
  await st.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
  await st.getByLabel('Passwort wiederholen').fill(PASSWORD);
  await st.getByRole('button', { name: 'Passwort festlegen' }).click();
  await expect(st.getByText('Benutzernamen ida.neumann')).toBeVisible();

  // Anmeldung mit Benutzername; der Flow der Schülerin (Datenschutz, Push, Avatar, Klasse) läuft im Helfer
  await login(st, username, /\/heute$/);
  const list = st.getByRole('heading', { name: 'Erste Schritte' });
  await expect(list).toBeVisible();
  await st.getByRole('link', { name: 'Deine nächste Stunde ansehen' }).click();
  const mark = st.getByRole('dialog', { name: 'Deine nächste Stunde' });
  await expect(mark).toBeVisible();
  await mark.getByRole('button', { name: 'Verstanden' }).click();
  await expect(mark).toBeHidden();
  await expect(st).toHaveURL(/\/heute$/);
  await expect(st.locator('#main').getByText('1 von 4')).toBeVisible();
  await st.close();
});
