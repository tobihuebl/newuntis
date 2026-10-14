import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays } from '@sp/shared';
import { AbsenceWarningsService } from '../src/modules/absences/warnings.service';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { Harness, type Client } from './support/harness';
import { at, enroll, occurrence, smallSchool, today } from './support/school';

/** Frühwarnung bei Häufung von Fehlzeiten (AB-05). */
describe('Frühwarnung Fehlzeiten', () => {
  let h: Harness;
  let tenantId = '';
  let homeroom: Client;
  let teacher: Client;
  let principal: Client;
  const ids = {} as Record<'c1' | 'c2' | 's1' | 's2' | 'hr' | 'teacher', string>;

  beforeAll(async () => {
    h = await Harness.create();
    const t = await h.createTenant('fw');
    tenantId = t.id;
    await h.owner.tenant.update({
      where: { id: tenantId },
      data: {
        settings: { absence: { warnUnexcusedLessons: 2, warnLessons: 3, warnWindowDays: 30 } },
      },
    });
    const s = await smallSchool(h, tenantId);
    ids.c1 = s.c1.id;
    ids.c2 = s.c2.id;
    const tu = await h.createUser(tenantId, [{ role: 'TEACHER' }]);
    const hu = await h.createUser(tenantId, [
      { role: 'TEACHER' },
      { role: 'HOMEROOM', classId: s.c1.id },
    ]);
    const pu = await h.createUser(tenantId, [{ role: 'PRINCIPAL' }], undefined, 'STAFF');
    ids.teacher = tu.personId;
    ids.hr = hu.personId;
    for (const k of ['s1', 's2'] as const) {
      const st = await h.createUser(tenantId, [{ role: 'STUDENT' }], undefined, 'STUDENT');
      ids[k] = st.personId;
      await enroll(h, tenantId, st.personId, s.c1.id);
    }
    // s1: drei Stunden gestern abwesend und unentschuldigt; s2: eine Stunde
    const yesterday = addDays(today, -1);
    for (const p of [1, 2, 3]) {
      const o = await occurrence(h, tenantId, {
        date: yesterday,
        period: p,
        subjectId: s.math.id,
        classId: s.c1.id,
        teacherId: tu.personId,
      });
      for (const st of p === 1 ? [ids.s1, ids.s2] : [ids.s1])
        await h.owner.attendance.create({
          data: {
            tenantId,
            occurrenceId: o,
            studentId: st,
            status: 'ABSENT',
            recordedById: tu.personId,
          },
        });
    }
    await h.owner.absence.create({
      data: {
        tenantId,
        studentId: ids.s1,
        fromAt: at(yesterday, '07:00'),
        toAt: at(yesterday, '18:00'),
        status: 'UNEXCUSED',
        origin: 'CLASSBOOK',
        reportedById: tu.personId,
      },
    });
    homeroom = (await h.loginFully(t.slug, hu.email)).client;
    teacher = (await h.loginFully(t.slug, tu.email)).client;
    principal = (await h.loginFully(t.slug, pu.email)).client;
  });
  afterAll(async () => h.close());

  it('Klassenvorstand sieht Schüler:innen über der Schwelle seiner Klasse', async () => {
    const r = await homeroom.get(`/absences/warnings?classId=${ids.c1}`);
    expect(r.status).toBe(200);
    expect(r.json.data).toEqual([
      expect.objectContaining({
        studentId: ids.s1,
        unexcused: 3,
        recent: 3,
        kinds: ['UNEXCUSED', 'FREQUENT'],
        classId: ids.c1,
      }),
    ]);
  });

  it('Rechte: Lehrkraft nicht, KV nur eigene Klasse, Direktion die ganze Schule', async () => {
    expect((await teacher.get(`/absences/warnings?classId=${ids.c1}`)).status).toBe(403);
    expect((await homeroom.get(`/absences/warnings?classId=${ids.c2}`)).status).toBe(403);
    expect((await homeroom.get('/absences/warnings')).status).toBe(403);
    const all = await principal.get('/absences/warnings');
    expect(all.status).toBe(200);
    expect(all.json.data.map((w: { studentId: string }) => w.studentId)).toEqual([ids.s1]);
  });

  it('täglicher Hinweis an den Klassenvorstand: einmal, ohne Namen', async () => {
    const svc = h.app.get(AbsenceWarningsService);
    const prisma = h.app.get(PrismaService);
    const run = () => prisma.runAsTenant(tenantId, (tx) => svc.notifyNew(tx, tenantId));
    expect(await run()).toBe(1);
    expect(await run()).toBe(0);
    const notes = await h.owner.notification.findMany({
      where: { tenantId, type: 'absence.warning' },
    });
    expect(notes.map((n) => n.personId)).toEqual([ids.hr]);
    expect(await h.owner.absenceWarning.count({ where: { tenantId } })).toBe(2);
  });
});
