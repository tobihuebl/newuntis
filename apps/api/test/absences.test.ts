import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays } from '@sp/shared';
import { AbsencesService } from '../src/modules/absences/absences.service';
import { ObjectStore } from '../src/modules/files/files.service';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { Harness, type Client } from './support/harness';
import { at, day, enroll, mid, occurrence, smallSchool, today } from './support/school';

const stored: string[] = [];
class FakeStore {
  async put(key: string) {
    stored.push(key);
  }
  async signedUrl(key: string) {
    return `https://dateien.test/${key}?signiert`;
  }
}
const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001', 'hex');

describe('Abwesenheit (Spec Abschnitt 11)', () => {
  let h: Harness;
  let tenantId = '';
  let teacher: Client;
  let other: Client;
  let homeroom: Client;
  let guardian: Client;
  let guardianNoExcuse: Client;
  let studentSelf: Client;
  const ids = {} as Record<'teacher' | 's1' | 's2' | 'g1' | 'hr' | 'c1' | 'math', string>;
  const occ: string[] = [];

  const mark = (o: string, studentId: string, status: 'ABSENT' | 'PRESENT') =>
    teacher.put(`/occurrences/${o}/attendance`, {
      items: [
        { studentId, status, clientMutationId: mid(), clientUpdatedAt: new Date().toISOString() },
      ],
    });
  const list = async (c: Client, q: string) =>
    (await c.get(`/absences?${q}`)).json.data as {
      id: string;
      status: string;
      origin: string;
      canExcuse: boolean;
      canReview: boolean;
      lessons: number;
      deadline: string | null;
      attachmentRequired: boolean;
      hasAttachment: boolean;
    }[];

  beforeAll(async () => {
    h = await Harness.create({ overrides: [[ObjectStore, new FakeStore()]] });
    const t = await h.createTenant('ab');
    tenantId = t.id;
    const s = await smallSchool(h, tenantId);
    ids.c1 = s.c1.id;
    ids.math = s.math.id;
    const tu = await h.createUser(tenantId, [{ role: 'TEACHER' }]);
    const ou = await h.createUser(tenantId, [{ role: 'TEACHER' }]);
    const hu = await h.createUser(tenantId, [
      { role: 'TEACHER' },
      { role: 'HOMEROOM', classId: s.c1.id },
    ]);
    ids.teacher = tu.personId;
    ids.hr = hu.personId;
    const s1 = await h.createUser(tenantId, [{ role: 'STUDENT' }], undefined, 'STUDENT');
    const s2 = await h.createUser(tenantId, [{ role: 'STUDENT' }], undefined, 'STUDENT');
    ids.s1 = s1.personId;
    ids.s2 = s2.personId;
    // s1 ist 15 Jahre alt: darf ab 14 (Standard) selbst entschuldigen
    await h.owner.person.update({
      where: { id: s1.personId },
      data: { birthDate: day(addDays(today, -15 * 366)) },
    });
    for (const st of [s1, s2]) await enroll(h, tenantId, st.personId, s.c1.id);
    const g1 = await h.createUser(tenantId, [{ role: 'GUARDIAN' }], undefined, 'GUARDIAN');
    const g2 = await h.createUser(tenantId, [{ role: 'GUARDIAN' }], undefined, 'GUARDIAN');
    ids.g1 = g1.personId;
    await h.owner.guardianLink.create({
      data: {
        tenantId,
        guardianId: g1.personId,
        studentId: s1.personId,
        validFrom: day(addDays(today, -100)),
      },
    });
    await h.owner.guardianLink.create({
      data: {
        tenantId,
        guardianId: g2.personId,
        studentId: s2.personId,
        validFrom: day(addDays(today, -100)),
        canExcuse: false,
      },
    });
    for (const p of [1, 2, 4, 5])
      occ.push(
        await occurrence(h, tenantId, {
          date: today,
          period: p,
          subjectId: s.math.id,
          classId: s.c1.id,
          teacherId: tu.personId,
        }),
      );
    teacher = (await h.loginFully(t.slug, tu.email)).client;
    other = (await h.loginFully(t.slug, ou.email)).client;
    homeroom = (await h.loginFully(t.slug, hu.email)).client;
    guardian = (await h.loginFully(t.slug, g1.email)).client;
    guardianNoExcuse = (await h.loginFully(t.slug, g2.email)).client;
    studentSelf = (await h.loginFully(t.slug, s1.email)).client;
  });
  afterAll(async () => h.close());

  it('"abwesend" im Klassenbuch ergibt offene Fehlzeiten; aufeinanderfolgende Stunden werden ein Block', async () => {
    await mark(occ[0]!, ids.s1, 'ABSENT');
    await mark(occ[1]!, ids.s1, 'ABSENT');
    await mark(occ[2]!, ids.s1, 'ABSENT');
    let rows = await list(guardian, `studentId=${ids.s1}`);
    // 1.+2. Stunde ein Block, 4. Stunde (nach einer freien Stunde) eigener Block
    expect(rows.map((r) => r.lessons).sort()).toEqual([1, 2]);
    expect(rows.every((r) => r.status === 'OPEN' && r.origin === 'CLASSBOOK' && r.canExcuse)).toBe(
      true,
    );
    expect(rows[0]!.deadline).toBe(addDays(today, 7));
    // Korrektur: 2. Stunde doch anwesend
    await mark(occ[1]!, ids.s1, 'PRESENT');
    rows = await list(guardian, `studentId=${ids.s1}`);
    expect(rows.map((r) => r.lessons)).toEqual([1, 1]);
  });

  it('Eltern entschuldigen: offene Fehlzeiten gehen in der Meldung auf, Klassenvorstand wird benachrichtigt', async () => {
    const r = await guardian.post('/absences', {
      studentId: ids.s1,
      fromDate: today,
      toDate: today,
      reasonCode: 'ILLNESS',
      reason: 'Fieber',
    });
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({
      status: 'REPORTED',
      origin: 'REPORT',
      lessons: 4,
      attachmentRequired: false,
    });
    const rows = await list(guardian, `studentId=${ids.s1}`);
    expect(rows).toHaveLength(1);
    expect(
      await h.owner.notification.count({ where: { personId: ids.hr, type: 'absence.reported' } }),
    ).toBe(1);
    // weitere Stunde als abwesend: liegt in der Meldung, keine neue offene Fehlzeit
    await mark(occ[3]!, ids.s1, 'ABSENT');
    expect(await list(guardian, `studentId=${ids.s1}`)).toHaveLength(1);
    // doppelte Meldung
    expect(
      (
        await guardian.post('/absences', {
          studentId: ids.s1,
          fromDate: today,
          toDate: today,
          reasonCode: 'OTHER',
        })
      ).status,
    ).toBe(409);
  });

  it('nur berechtigte Personen melden: Eltern ohne Entschuldigungsrecht und fremde Kinder nicht', async () => {
    const body = (studentId: string) => ({
      studentId,
      fromDate: addDays(today, 1),
      toDate: addDays(today, 1),
      reasonCode: 'DOCTOR',
    });
    expect((await guardianNoExcuse.post('/absences', body(ids.s2))).status).toBe(403);
    expect((await guardian.post('/absences', body(ids.s2))).status).toBe(403);
    expect((await teacher.post('/absences', body(ids.s1))).status).toBe(403);
    // Schüler:in ab der Altersgrenze darf selbst melden
    expect((await studentSelf.post('/absences', body(ids.s1))).status).toBe(201);
    // Eltern sehen keine Fehlzeiten fremder Kinder
    expect((await guardian.get(`/absences?studentId=${ids.s2}`)).status).toBe(403);
  });

  it('Klassenvorstand nimmt an oder lehnt ab, Eltern werden benachrichtigt; andere Lehrkräfte nicht', async () => {
    const rows = await list(homeroom, `classId=${ids.c1}&status=REPORTED`);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]!.canReview).toBe(true);
    expect(
      (await other.patch(`/absences/${rows[0]!.id}/review`, { decision: 'EXCUSED' })).status,
    ).toBe(403);
    const r = await homeroom.patch(`/absences/${rows[0]!.id}/review`, {
      decision: 'EXCUSED',
      comment: 'Gute Besserung',
    });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ status: 'EXCUSED', reviewComment: 'Gute Besserung' });
    expect(
      await h.owner.notification.count({ where: { personId: ids.g1, type: 'absence.reviewed' } }),
    ).toBe(1);
    // Lesen fremder Fehlzeiten wird protokolliert
    expect(
      await h.owner.auditLog.count({
        where: { tenantId, action: 'absence.read', actorId: ids.hr },
      }),
    ).toBeGreaterThan(0);
  });

  it('ab 3 Tagen ist eine Bestätigung Pflicht: Upload mit Typprüfung, Link nur für Berechtigte', async () => {
    const r = await guardian.post('/absences', {
      studentId: ids.s1,
      fromDate: addDays(today, 3),
      toDate: addDays(today, 6),
      reasonCode: 'ILLNESS',
    });
    expect(r.json.attachmentRequired).toBe(true);
    const id = r.json.id as string;
    const text = await guardian.request(
      'POST',
      `/absences/${id}/attachments`,
      Buffer.from('hallo'),
      {
        'content-type': 'application/octet-stream',
      },
    );
    expect(text.status).toBe(422);
    const up = await guardian.request('POST', `/absences/${id}/attachments`, PNG, {
      'content-type': 'image/png',
    });
    expect(up.status).toBe(201);
    expect(up.json.hasAttachment).toBe(true);
    expect(stored).toHaveLength(1);
    const link = await homeroom.get(`/absences/${id}/attachment`);
    expect(link.json.url).toContain('signiert');
    expect((await other.get(`/absences/${id}/attachment`)).status).toBe(403);
  });

  it('täglicher Job: Erinnerungen nach 1 und 4 Tagen, nach 7 Tagen unentschuldigt (idempotent)', async () => {
    const start = addDays(today, -10);
    const a = await h.owner.absence.create({
      data: {
        tenantId,
        studentId: ids.s1,
        fromAt: at(start, '08:00'),
        toAt: at(start, '08:50'),
        status: 'OPEN',
        origin: 'CLASSBOOK',
        reportedById: ids.teacher,
      },
    });
    const svc = h.app.get(AbsencesService);
    const prisma = h.app.get(PrismaService);
    const run = (d: string) => prisma.runAsTenant(tenantId, (tx) => svc.daily(tx, tenantId, d));
    const reminders = () =>
      h.owner.notification.count({ where: { personId: ids.g1, type: 'absence.reminder' } });
    await run(start);
    expect(await reminders()).toBe(0);
    await run(addDays(start, 1));
    await run(addDays(start, 1));
    expect(await reminders()).toBe(1);
    await run(addDays(start, 4));
    expect(await reminders()).toBe(2);
    await run(addDays(start, 7));
    expect((await h.owner.absence.findUniqueOrThrow({ where: { id: a.id } })).status).toBe(
      'UNEXCUSED',
    );
    // nachmelden ist weiterhin möglich und beginnt wieder bei REPORTED
    const late = await guardian.post('/absences', {
      studentId: ids.s1,
      fromDate: start,
      toDate: start,
      reasonCode: 'ILLNESS',
    });
    expect(late.json.status).toBe('REPORTED');
    expect(await h.owner.absence.findUnique({ where: { id: a.id } })).toBeNull();
  });
});
