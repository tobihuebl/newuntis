import { expect, test } from '@playwright/test';
import pg from 'pg';
import { accounts, login } from './helpers';

/**
 * AB-05: Frühwarnung bei Häufung von Fehlzeiten. Die Demodaten haben keine vergangenen Stunden; der Test legt
 * gestern zwei abwesende, unentschuldigte Stunden einer Schülerin der 3A an und senkt die Schwelle auf 2.
 */
test('Klassenvorstand und Direktion sehen die Frühwarnung', async ({ browser }) => {
  const { databaseUrl, teacherEmail, principalEmail } = accounts();
  const db = new pg.Client({ connectionString: databaseUrl });
  await db.connect();
  const { rows } = await db.query<{
    tenantId: string;
    classId: string;
    studentId: string;
    name: string;
    subjectId: string;
    teacherId: string;
  }>(`
    SELECT c."tenantId", c.id AS "classId", p.id AS "studentId", p."lastName" || ' ' || p."firstName" AS name,
           (SELECT id FROM "Subject" s WHERE s."tenantId" = c."tenantId" LIMIT 1) AS "subjectId",
           (SELECT r."personId" FROM "RoleAssignment" r WHERE r.role = 'HOMEROOM' AND r."classId" = c.id LIMIT 1)
             AS "teacherId"
    FROM "SchoolClass" c
    JOIN "Enrollment" e ON e."classId" = c.id
    JOIN "Person" p ON p.id = e."studentId"
    WHERE c.name = '3A' ORDER BY p."lastName" DESC LIMIT 1`);
  const r = rows[0]!;
  await db.query(
    `UPDATE "Tenant" SET settings = jsonb_set(settings, '{absence}',
       coalesce(settings->'absence', '{}'::jsonb) || '{"warnUnexcusedLessons": 2}'::jsonb)
     WHERE id = $1`,
    [r.tenantId],
  );
  const y = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  for (const p of [1, 2]) {
    const id = `e2e-warn-${p}-${Date.now()}`;
    await db.query(
      `INSERT INTO "Occurrence" (id, "tenantId", date, "periodStart", "periodCount", "startsAt", "endsAt",
         "classId", "subjectId", status, "updatedAt")
       VALUES ($1, $2, $3::date, $4, 1, $3::date + make_interval(hours => 6 + $4), $3::date + make_interval(hours => 6 + $4, mins => 50),
         $5, $6, 'SCHEDULED', now())`,
      [id, r.tenantId, y, p, r.classId, r.subjectId],
    );
    await db.query(
      `INSERT INTO "Attendance" (id, "tenantId", "occurrenceId", "studentId", status, "recordedById", "updatedAt")
       VALUES ($1, $2, $3, $4, 'ABSENT', $5, now())`,
      [`${id}-a`, r.tenantId, id, r.studentId, r.teacherId],
    );
  }
  await db.query(
    `INSERT INTO "Absence" (id, "tenantId", "studentId", "fromAt", "toAt", status, origin, "reportedById", "updatedAt")
     VALUES ($1, $2, $3, $4::date, $4::date + interval '1 day', 'UNEXCUSED', 'CLASSBOOK', $5, now())`,
    [`e2e-warn-abs-${Date.now()}`, r.tenantId, r.studentId, y, r.teacherId],
  );
  await db.end();

  const kv = await browser.newPage();
  await login(kv, teacherEmail, /\/heute$/);
  await kv.goto(`/klasse/${r.classId}/fehlzeiten`);
  await expect(kv.getByRole('heading', { name: /Frühwarnung: 1 Schüler:in/ })).toBeVisible();
  const warning = kv.getByRole('region', { name: /Frühwarnung/ }).getByRole('listitem');
  await expect(warning).toHaveCount(1);
  await expect(warning).toContainText(r.name);
  await expect(warning).toContainText('2 Stunden unentschuldigt im Schuljahr');
  await kv.close();

  const page = await browser.newPage();
  await login(page, principalEmail, /\/lagebild$/);
  const card = page.getByRole('heading', { name: /Frühwarnung Fehlzeiten/ });
  await expect(card).toBeVisible();
  await page.getByRole('link', { name: /3A/ }).filter({ hasText: 'Schüler:in' }).click();
  await expect(page).toHaveURL(new RegExp(`/klasse/${r.classId}/fehlzeiten$`));
  await page.close();
});

/** Klassenseite (Durchgang Bedienbarkeit): Wer ist heute da, wer nicht – für Lehrkraft und Direktion. */
test('Klassenseite zeigt, wer heute da ist', async ({ page }) => {
  await login(page, accounts().principalEmail, /\/lagebild$/);
  await page
    .getByRole('navigation', { name: 'Hauptnavigation' })
    .getByRole('link', { name: 'Klassen' })
    .click();
  await expect(page).toHaveURL(/\/klassen$/);
  await page.locator('main a[href^="/klassen/"]').first().click();
  const today = page.getByRole('region', { name: 'Heute' });
  await expect(today).toBeVisible();
  await expect(today.getByText(/da|kein Unterricht/).first()).toBeVisible();
  // Reiter der Klasse für die Direktion, inklusive Vermerke
  const tabs = page.getByRole('navigation', { name: 'Ansicht' });
  await expect(tabs.getByRole('link', { name: 'Übersicht' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(tabs.getByRole('link', { name: 'Vermerke' })).toBeVisible();
});
