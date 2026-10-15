import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays } from '@sp/shared';
import { ConsentFormsService } from '../src/modules/consent-forms/consent-forms.service';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { Harness, type Client } from './support/harness';
import { day, enroll, lesson, smallSchool, today } from './support/school';

/**
 * Einverständniserklärungen (KO-05): Lehrkraft verschickt für die eigene Klasse, Eltern antworten je Kind,
 * Zettel-Antworten werden nachgetragen, Erinnerung manuell und am Tag vor der Frist, Abschließen.
 */
describe('Einverständniserklärungen', () => {
  let h: Harness;
  let tenantId = '';
  let teacher: Client;
  let other: Client;
  let guardian: Client;
  let principal: Client;
  const ids = {} as Record<'s1' | 's2' | 's3' | 'g' | 'form' | 'soon', string>;

  beforeAll(async () => {
    h = await Harness.create();
    const t = await h.tenantWithAdmin('cf');
    tenantId = t.tenant.id;
    const slug = t.tenant.slug;
    const s = await smallSchool(h, tenantId);
    const tu = await h.createUser(tenantId, [{ role: 'TEACHER' }]);
    const ou = await h.createUser(tenantId, [{ role: 'TEACHER' }]);
    await lesson(h, tenantId, s.version.id, {
      subjectId: s.math.id,
      classId: s.c1.id,
      teacherId: tu.personId,
    });
    await lesson(h, tenantId, s.version.id, {
      subjectId: s.eng.id,
      classId: s.c2.id,
      teacherId: ou.personId,
      period: 2,
    });
    for (const [key, cls] of [
      ['s1', s.c1.id],
      ['s2', s.c1.id],
      ['s3', s.c2.id],
    ] as const) {
      const u = await h.createUser(tenantId, [{ role: 'STUDENT' }], undefined, 'STUDENT');
      ids[key] = u.personId;
      await enroll(h, tenantId, u.personId, cls);
    }
    const g = await h.createUser(tenantId, [{ role: 'GUARDIAN' }], undefined, 'GUARDIAN');
    ids.g = g.personId;
    await h.owner.guardianLink.create({
      data: {
        tenantId,
        guardianId: g.personId,
        studentId: ids.s1,
        validFrom: day(addDays(today, -30)),
      },
    });
    const p = await h.createUser(tenantId, [{ role: 'PRINCIPAL' }]);
    teacher = (await h.loginFully(slug, tu.email)).client;
    other = (await h.loginFully(slug, ou.email)).client;
    guardian = (await h.loginFully(slug, g.email)).client;
    principal = (await h.loginFully(slug, p.email)).client;
  });
  afterAll(async () => h.close());

  it('Lehrkraft sieht nur die eigenen Klassen und verschickt; Eltern werden benachrichtigt', async () => {
    const o = await teacher.get('/consent-forms/options');
    expect(o.status).toBe(200);
    expect(o.json.classes).toHaveLength(1);
    expect(
      o.json.classes[0].students.map((x: { guardians: number }) => x.guardians).sort(),
    ).toEqual([0, 1]);
    const body = { title: 'Wandertag', body: 'Ausflug auf den Kahlenberg', studentIds: [ids.s1] };
    expect((await teacher.post('/consent-forms', { ...body, studentIds: [ids.s3] })).status).toBe(
      403,
    );
    expect(
      (await teacher.post('/consent-forms', { ...body, dueOn: addDays(today, -1) })).status,
    ).toBe(400);
    expect((await guardian.get('/consent-forms')).status).toBe(403);
    const r = await teacher.post('/consent-forms', {
      ...body,
      dueOn: addDays(today, 7),
      studentIds: [ids.s1, ids.s2],
    });
    expect(r.status).toBe(201);
    expect(r.json.notified).toBe(1);
    ids.form = r.json.id;
    expect(
      await h.owner.notification.count({ where: { personId: ids.g, type: 'consent.requested' } }),
    ).toBe(1);
  });

  it('Eltern antworten für das eigene Kind, nicht für fremde', async () => {
    const mine = await guardian.get('/me/consent-forms');
    expect(mine.json.data).toHaveLength(1);
    expect(mine.json.data[0]).toMatchObject({
      title: 'Wandertag',
      closed: false,
      children: [{ studentId: ids.s1, answer: 'OPEN' }],
    });
    expect(
      (await guardian.put(`/me/consent-forms/${ids.form}/answers/${ids.s2}`, { answer: 'YES' }))
        .status,
    ).toBe(403);
    expect(
      (
        await guardian.put(`/me/consent-forms/${ids.form}/answers/${ids.s1}`, {
          answer: 'YES',
          note: 'Nussallergie',
        })
      ).status,
    ).toBe(204);
  });

  it('Übersicht je Kind, Zettel-Antwort nachtragen; fremde Lehrkraft sieht nichts, Direktion alles', async () => {
    expect(
      (await teacher.put(`/consent-forms/${ids.form}/answers/${ids.s1}`, { answer: 'NO' })).status,
    ).toBe(409);
    expect(
      (await teacher.put(`/consent-forms/${ids.form}/answers/${ids.s2}`, { answer: 'NO' })).status,
    ).toBe(204);
    const d = await teacher.get(`/consent-forms/${ids.form}`);
    expect(d.json).toMatchObject({
      mine: true,
      counts: { yes: 1, no: 1, open: 0 },
      classes: ['1A'],
    });
    const s1 = d.json.rows.find((r: { studentId: string }) => r.studentId === ids.s1);
    expect(s1).toMatchObject({ answer: 'YES', note: 'Nussallergie', onPaper: false, guardians: 1 });
    expect(d.json.rows.find((r: { studentId: string }) => r.studentId === ids.s2)).toMatchObject({
      answer: 'NO',
      onPaper: true,
      guardians: 0,
    });
    expect((await other.get(`/consent-forms/${ids.form}`)).status).toBe(403);
    expect((await other.get('/consent-forms')).json.data).toEqual([]);
    const list = await principal.get('/consent-forms');
    expect(list.json.data[0]).toMatchObject({ id: ids.form, counts: { yes: 1, no: 1, open: 0 } });
  });

  it('Erinnern höchstens einmal am Tag; Abschließen sperrt Antworten der Eltern', async () => {
    await teacher.put(`/consent-forms/${ids.form}/answers/${ids.s2}`, { answer: 'OPEN' });
    await guardian.put(`/me/consent-forms/${ids.form}/answers/${ids.s1}`, { answer: 'NO' });
    // s1 hat geantwortet, s2 hat keine Eltern mit Konto: niemand zu erinnern
    const r = await teacher.post(`/consent-forms/${ids.form}/remind`);
    expect(r.json).toEqual({ reminded: 0 });
    expect((await teacher.post(`/consent-forms/${ids.form}/remind`)).status).toBe(409);
    expect((await other.post(`/consent-forms/${ids.form}/close`)).status).toBe(403);
    expect((await teacher.post(`/consent-forms/${ids.form}/close`)).status).toBe(204);
    expect(
      (await guardian.put(`/me/consent-forms/${ids.form}/answers/${ids.s1}`, { answer: 'YES' }))
        .status,
    ).toBe(409);
    expect((await guardian.get('/me/consent-forms')).json.data[0].closed).toBe(true);
  });

  it('am Tag vor der Frist erinnert der Job einmal an offene Antworten', async () => {
    const r = await teacher.post('/consent-forms', {
      title: 'Fotos',
      body: 'Fotos auf der Schulwebseite',
      dueOn: addDays(today, 1),
      studentIds: [ids.s1],
    });
    ids.soon = r.json.id;
    const svc = h.app.get(ConsentFormsService);
    const prisma = h.app.get(PrismaService);
    const run = () => prisma.runAsTenant(tenantId, (tx) => svc.daily(tx, tenantId));
    expect(await run()).toBe(1);
    expect(await run()).toBe(0);
    expect(
      await h.owner.notification.count({ where: { personId: ids.g, type: 'consent.reminder' } }),
    ).toBe(1);
  });

  it('Datenexport der Eltern enthält ihre Antworten', async () => {
    const e = await guardian.get('/me/export?format=json');
    expect(e.status).toBe(200);
    expect(e.json.consentForms).toEqual(
      expect.arrayContaining([expect.objectContaining({ title: 'Wandertag', answer: 'NO' })]),
    );
  });
});
