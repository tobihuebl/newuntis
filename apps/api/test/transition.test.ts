import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays } from '@sp/shared';
import { Harness, type Client } from './support/harness';
import { day, enroll, smallSchool, today } from './support/school';

/**
 * Schuljahreswechsel (SD-05): KV entscheidet, Administration legt Folgeklassen an und übernimmt; nach dem
 * Umstellen des Schuljahres wird eine Wiederholungsprüfung eingetragen.
 */
describe('Schuljahreswechsel', () => {
  let h: Harness;
  let tenantId = '';
  let slug = '';
  let admin: Client;
  let kv: Client;
  let teacher: Client;
  const ids = {} as Record<
    'year' | 'next' | 'c1' | 'c2' | 'c4' | 'kv' | 's1' | 's2' | 's3' | 's4' | 'new2A' | 'new1A',
    string
  >;

  beforeAll(async () => {
    h = await Harness.create();
    const t = await h.tenantWithAdmin('sj');
    tenantId = t.tenant.id;
    slug = t.tenant.slug;
    admin = t.admin;
    const s = await smallSchool(h, tenantId);
    // Laufendes Schuljahr endet gestern, das nächste beginnt heute (noch nicht aktiv)
    await h.owner.schoolYear.update({
      where: { id: s.year.id },
      data: { startsOn: day(addDays(today, -300)), endsOn: day(addDays(today, -1)) },
    });
    ids.year = s.year.id;
    ids.next = (
      await h.owner.schoolYear.create({
        data: {
          tenantId,
          name: 'SJ neu',
          startsOn: day(today),
          endsOn: day(addDays(today, 300)),
        },
      })
    ).id;
    ids.c1 = s.c1.id;
    ids.c2 = s.c2.id;
    ids.c4 = (
      await h.owner.schoolClass.create({ data: { tenantId, schoolYearId: s.year.id, name: '4A' } })
    ).id;
    const k = await h.createUser(tenantId, [
      { role: 'TEACHER' },
      { role: 'HOMEROOM', classId: s.c1.id },
    ]);
    ids.kv = k.personId;
    await h.owner.schoolClass.update({
      where: { id: s.c1.id },
      data: { homeroomTeacherId: k.personId },
    });
    const tu = await h.createUser(tenantId, [{ role: 'TEACHER' }]);
    for (const [key, cls] of [
      ['s1', s.c1.id],
      ['s2', s.c1.id],
      ['s3', s.c1.id],
      ['s4', ids.c4],
    ] as const) {
      const u = await h.createUser(tenantId, [{ role: 'STUDENT' }], undefined, 'STUDENT');
      ids[key] = u.personId;
      await enroll(h, tenantId, u.personId, cls);
    }
    kv = (await h.loginFully(slug, k.email)).client;
    teacher = (await h.loginFully(slug, tu.email)).client;
  });
  afterAll(async () => h.close());

  it('Klassenvorstand sieht seine Klasse mit "steigt auf" als Standard und entscheidet', async () => {
    const v = await kv.get(`/promotions?classId=${ids.c1}`);
    expect(v.status).toBe(200);
    expect(v.json).toMatchObject({
      className: '1A',
      finalLevel: false,
      nextYear: { id: ids.next },
    });
    expect(
      v.json.rows.every(
        (r: { decision: string; isDefault: boolean }) => r.decision === 'PROMOTE' && r.isDefault,
      ),
    ).toBe(true);
    expect((await kv.get(`/promotions?classId=${ids.c2}`)).status).toBe(403);
    expect((await teacher.get(`/promotions?classId=${ids.c1}`)).status).toBe(403);
    const put = await kv.put('/promotions', {
      classId: ids.c1,
      items: [
        { studentId: ids.s2, decision: 'REPEAT', note: 'Klassenkonferenz 30.6.' },
        { studentId: ids.s3, decision: 'EXAM' },
      ],
    });
    expect(put.status).toBe(200);
    expect(
      (
        await kv.put('/promotions', {
          classId: ids.c1,
          items: [{ studentId: ids.s4, decision: 'LEAVE' }],
        })
      ).status,
    ).toBe(422);
    const sum = await kv.get(`/promotions/summary?classId=${ids.c1}`);
    expect(sum.json).toMatchObject({
      counts: { PROMOTE: 1, REPEAT: 1, EXAM: 1, LEAVE: 0 },
      decided: 2,
    });
  });

  it('Administration: Plan mit Vorschlägen, Folgeklassen anlegen (mit KV), letzte Stufe schließt ab', async () => {
    const plan = await admin.get(`/admin/year-transition?toYearId=${ids.next}`);
    expect(plan.status).toBe(200);
    const byName = Object.fromEntries(
      plan.json.classes.map((c: { name: string; suggestion: string | null }) => [
        c.name,
        c.suggestion,
      ]),
    );
    expect(byName).toEqual({ '1A': '2A', '1B': '2B', '4A': null });
    const r = await admin.post('/admin/year-transition/classes', {
      toYearId: ids.next,
      items: [
        { fromClassId: ids.c1, name: '2A', takeHomeroom: true },
        { fromClassId: ids.c2, name: '2B', takeHomeroom: true },
        { fromClassId: ids.c4, name: null },
      ],
      newClasses: ['1A', '1B'],
    });
    expect(r.json.created).toBe(4);
    const classes = await h.owner.schoolClass.findMany({ where: { schoolYearId: ids.next } });
    const c2A = classes.find((c) => c.name === '2A')!;
    ids.new2A = c2A.id;
    ids.new1A = classes.find((c) => c.name === '1A')!.id;
    expect(c2A).toMatchObject({ previousClassId: ids.c1, homeroomTeacherId: ids.kv });
    expect(
      await h.owner.roleAssignment.count({
        where: { role: 'HOMEROOM', classId: c2A.id, personId: ids.kv },
      }),
    ).toBe(1);
    // Wiederholen: Klasse gleichen Namens im neuen Jahr
    const again = await admin.get(`/admin/year-transition?toYearId=${ids.next}`);
    const target = (id: string) =>
      again.json.students.find((s: { studentId: string }) => s.studentId === id).target?.name ??
      null;
    expect([target(ids.s1), target(ids.s2), target(ids.s3), target(ids.s4)]).toEqual([
      '2A',
      '1A',
      '2A',
      null,
    ]);
  });

  it('Übernehmen: neue Einschreibungen ab Schulbeginn, alte enden mit dem Schuljahr; wiederholbar', async () => {
    const r = await admin.post('/admin/year-transition/students', { toYearId: ids.next });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ total: 4, moved: 3, PROMOTE: 2, REPEAT: 1, EXAM: 1 });
    const enr = await h.owner.enrollment.findMany({
      where: { studentId: ids.s2 },
      orderBy: { fromDate: 'asc' },
      include: { class: true },
    });
    expect(enr.map((e) => [e.class.name, e.class.schoolYearId === ids.next])).toEqual([
      ['1A', false],
      ['1A', true],
    ]);
    expect(enr[0]!.toDate?.toISOString().slice(0, 10)).toBe(addDays(today, -1));
    expect(
      await h.owner.enrollment.count({
        where: { studentId: ids.s4, class: { schoolYearId: ids.next } },
      }),
    ).toBe(0);
    expect(
      (await admin.post('/admin/year-transition/students', { toYearId: ids.next })).json.total,
    ).toBe(0);
  });

  it('nach dem Umstellen: KV-Rollen der alten Klassen fallen weg, Wiederholungsprüfung nicht bestanden', async () => {
    const act = await admin.patch(`/admin/school-years/${ids.next}`, { isCurrent: true });
    expect(act.status).toBe(200);
    expect(
      await h.owner.roleAssignment.count({ where: { role: 'HOMEROOM', classId: ids.c1 } }),
    ).toBe(0);
    const kv2 = kv;
    const sum = await kv2.get(`/promotions/summary?classId=${ids.new2A}`);
    expect(sum.json.pendingExams).toEqual([
      expect.objectContaining({ studentId: ids.s3, fromClass: '1A' }),
    ]);
    const res = await kv2.post('/promotions/exam', { studentId: ids.s3, passed: false });
    expect(res.status).toBe(200);
    expect(res.json.movedTo).toEqual({ id: ids.new1A, name: '1A' });
    expect((await kv2.get(`/promotions/summary?classId=${ids.new2A}`)).json.pendingExams).toEqual(
      [],
    );
  });
});
