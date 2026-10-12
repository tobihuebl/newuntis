import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays } from '@sp/shared';
import { Harness, type Client } from './support/harness';
import { enroll, lesson, occurrence, smallSchool, today } from './support/school';

const tomorrow = addDays(today, 1);

describe('Supplierung (Spec Abschnitt 11)', () => {
  let h: Harness;
  let tenantId = '';
  let principal: Client;
  let absentClient: Client;
  let subClient: Client;
  let student: Client;
  const ids = {} as Record<
    'tA' | 'tB' | 'tC' | 'tD' | 'student' | 'guardian' | 'o1' | 'o2' | 'o3' | 'r2' | 'abs',
    string
  >;

  const teachersOf = async (occurrenceId: string) =>
    (await h.owner.occurrenceTeacher.findMany({ where: { occurrenceId } })).map((t) => t.teacherId);

  beforeAll(async () => {
    h = await Harness.create();
    const t = await h.createTenant('su');
    tenantId = t.id;
    const s = await smallSchool(h, tenantId);
    ids.r2 = s.r2.id;
    const mk = async () => h.createUser(tenantId, [{ role: 'TEACHER' }]);
    const [a, b, c, d] = [await mk(), await mk(), await mk(), await mk()];
    ids.tA = a.personId; // fällt aus
    ids.tB = b.personId; // unterrichtet Mathematik (in 1B)
    ids.tC = c.personId; // frei, fachfremd
    ids.tD = d.personId; // selbst im Unterricht
    await h.owner.person.update({ where: { id: ids.tC }, data: { lastName: 'Auer' } });
    const st = await h.createUser(tenantId, [{ role: 'STUDENT' }], undefined, 'STUDENT');
    const g = await h.createUser(tenantId, [{ role: 'GUARDIAN' }], undefined, 'GUARDIAN');
    ids.student = st.personId;
    ids.guardian = g.personId;
    await enroll(h, tenantId, st.personId, s.c1.id);
    await h.owner.guardianLink.create({
      data: {
        tenantId,
        guardianId: g.personId,
        studentId: st.personId,
        validFrom: new Date('2020-01-01'),
      },
    });
    const l1 = await lesson(h, tenantId, s.version.id, {
      subjectId: s.math.id,
      classId: s.c1.id,
      roomId: s.r1.id,
      teacherId: ids.tA,
    });
    await lesson(h, tenantId, s.version.id, {
      subjectId: s.math.id,
      classId: s.c2.id,
      teacherId: ids.tB,
      period: 3,
    });
    ids.o1 = await occurrence(h, tenantId, {
      date: tomorrow,
      period: 1,
      subjectId: s.math.id,
      classId: s.c1.id,
      teacherId: ids.tA,
      roomId: s.r1.id,
      lessonId: l1.id,
    });
    ids.o2 = await occurrence(h, tenantId, {
      date: tomorrow,
      period: 1,
      subjectId: s.eng.id,
      classId: s.c2.id,
      teacherId: ids.tD,
      roomId: s.r2.id,
    });
    ids.o3 = await occurrence(h, tenantId, {
      date: tomorrow,
      period: 2,
      subjectId: s.eng.id,
      classId: s.c1.id,
      teacherId: ids.tD,
    });
    const pu = await h.createUser(tenantId, [{ role: 'PRINCIPAL' }], undefined, 'STAFF');
    principal = (await h.loginFully(t.slug, pu.email)).client;
    absentClient = (await h.loginFully(t.slug, a.email)).client;
    subClient = (await h.loginFully(t.slug, b.email)).client;
    student = (await h.loginFully(t.slug, st.email)).client;
  });
  afterAll(async () => h.close());

  it('Krankmeldung: Lehrkraft meldet nur sich selbst und nur Krankheit; Supplierung entsteht offen', async () => {
    expect(
      (
        await absentClient.post('/teacher-absences', {
          teacherId: ids.tB,
          fromDate: tomorrow,
          toDate: tomorrow,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await absentClient.post('/teacher-absences', {
          fromDate: tomorrow,
          toDate: tomorrow,
          kind: 'TRAINING',
        })
      ).status,
    ).toBe(403);
    const r = await absentClient.post('/teacher-absences', {
      fromDate: tomorrow,
      toDate: tomorrow,
      kind: 'SICK',
    });
    expect(r.status).toBe(201);
    expect(r.json.substitutions).toEqual({ open: 1, assigned: 0, published: 0 });
    ids.abs = r.json.id;
    // der Termin bleibt bis zur Veröffentlichung unverändert
    expect(await teachersOf(ids.o1)).toEqual([ids.tA]);
    expect((await absentClient.get('/substitutions')).status).toBe(403);
  });

  it('Vorschläge: frei und nicht abwesend, Fach vor Fairness; freie Räume', async () => {
    const day = await principal.get(`/substitutions?date=${tomorrow}`);
    expect(day.json.items).toHaveLength(1);
    expect(day.json.items[0]).toMatchObject({ status: 'OPEN', absentTeacher: { id: ids.tA } });
    const sug = await principal.get(`/substitutions/${day.json.items[0].id}/suggestions`);
    const names = sug.json.teachers.map((t: { teacher: { id: string } }) => t.teacher.id);
    expect(names[0]).toBe(ids.tB); // unterrichtet Mathematik
    expect(names).toContain(ids.tC);
    expect(names).not.toContain(ids.tD); // selbst im Unterricht
    expect(names).not.toContain(ids.tA); // abwesend
    expect(sug.json.teachers[0]).toMatchObject({ teachesSubject: true, count: 0 });
    // R2 ist durch die 1B belegt
    expect(sug.json.freeRooms.map((r: { id: string }) => r.id)).not.toContain(ids.r2);
  });

  it('Vertretung zuweisen und veröffentlichen: Termin geändert, Betroffene benachrichtigt', async () => {
    const id = (await principal.get(`/substitutions?date=${tomorrow}`)).json.items[0].id;
    expect((await principal.patch(`/substitutions/${id}`, { kind: 'SUBSTITUTE' })).status).toBe(
      400,
    );
    const a = await principal.patch(`/substitutions/${id}`, {
      kind: 'SUBSTITUTE',
      substituteTeacherId: ids.tB,
    });
    expect(a.json).toMatchObject({ status: 'ASSIGNED', substitute: { id: ids.tB } });
    expect(await teachersOf(ids.o1)).toEqual([ids.tA]);
    const p = await principal.post('/substitutions/publish', { date: tomorrow });
    expect(p.json.published).toBe(1);
    expect(await teachersOf(ids.o1)).toEqual([ids.tB]);
    expect((await h.owner.occurrence.findUniqueOrThrow({ where: { id: ids.o1 } })).status).toBe(
      'SUBSTITUTED',
    );
    for (const person of [ids.student, ids.guardian, ids.tA, ids.tB])
      expect(
        await h.owner.notification.count({
          where: { personId: person, type: 'substitution.published' },
        }),
      ).toBe(1);
    // die Vertretung sieht die Stunde und darf eintragen; die abwesende Lehrkraft liest nur noch
    // (Anwesenheit ihrer Klassen einsehen bleibt laut Rechte-Matrix erlaubt)
    expect(
      (await subClient.get('/today')).json.teacher.substitutions.map((x: { id: string }) => x.id),
    ).toContain(ids.o1);
    expect((await subClient.get(`/occurrences/${ids.o1}`)).json.canWrite).toBe(true);
    expect((await absentClient.get(`/occurrences/${ids.o1}`)).json.canWrite).toBe(false);
  });

  it('Entfall einer beliebigen Stunde ohne Abwesenheit (z. B. Ausflug)', async () => {
    const c = await principal.post('/substitutions', {
      occurrenceId: ids.o3,
      kind: 'CANCEL',
      note: 'Lehrausgang',
    });
    expect(c.status).toBe(201);
    expect(
      (await principal.post('/substitutions', { occurrenceId: ids.o3, kind: 'CANCEL' })).status,
    ).toBe(409);
    await principal.post('/substitutions/publish', { ids: [c.json.id] });
    expect((await h.owner.occurrence.findUniqueOrThrow({ where: { id: ids.o3 } })).status).toBe(
      'CANCELLED',
    );
    const plan = await student.get(`/me/timetable?from=${tomorrow}&to=${tomorrow}`);
    expect(plan.json.entries.find((e: { id: string }) => e.id === ids.o3).status).toBe('CANCELLED');
  });

  it('Rücknahme: gelöschte Abwesenheit setzt den veröffentlichten Termin zurück und meldet die Korrektur', async () => {
    expect((await principal.del(`/teacher-absences/${ids.abs}`)).status).toBe(204);
    expect(await teachersOf(ids.o1)).toEqual([ids.tA]);
    expect((await h.owner.occurrence.findUniqueOrThrow({ where: { id: ids.o1 } })).status).toBe(
      'SCHEDULED',
    );
    expect(await h.owner.substitution.count({ where: { occurrenceId: ids.o1 } })).toBe(0);
    expect(
      await h.owner.notification.count({
        where: { personId: ids.student, type: 'substitution.published' },
      }),
    ).toBe(3);
  });
});
