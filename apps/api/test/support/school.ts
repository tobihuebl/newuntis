import { DateTime } from 'luxon';
import { addDays } from '@sp/shared';
import type { Harness } from './harness';

export const TZ = 'Europe/Vienna';
export const today = DateTime.now().setZone(TZ).toISODate()!;
export const at = (date: string, time: string) =>
  DateTime.fromISO(`${date}T${time}`, { zone: TZ }).toUTC().toJSDate();
export const day = (s: string) => new Date(`${s}T00:00:00Z`);

/**
 * Kleine Schule direkt über den Eigentümer angelegt (schneller als über die Admin-API):
 * Schuljahr, Raster, Fächer, Räume, Klassen und eine veröffentlichte Version.
 */
export async function smallSchool(h: Harness, tenantId: string) {
  const o = h.owner;
  const year = await o.schoolYear.create({
    data: {
      tenantId,
      name: 'SJ',
      startsOn: day(addDays(today, -120)),
      endsOn: day(addDays(today, 200)),
      isCurrent: true,
    },
  });
  for (let n = 1; n <= 6; n++)
    await o.period.create({
      data: {
        tenantId,
        number: n,
        startTime: `${String(7 + n).padStart(2, '0')}:00`,
        endTime: `${String(7 + n).padStart(2, '0')}:50`,
      },
    });
  const math = await o.subject.create({ data: { tenantId, name: 'Mathematik', code: 'M' } });
  const eng = await o.subject.create({ data: { tenantId, name: 'Englisch', code: 'E' } });
  const r1 = await o.room.create({ data: { tenantId, name: 'R1' } });
  const r2 = await o.room.create({ data: { tenantId, name: 'R2' } });
  const c1 = await o.schoolClass.create({ data: { tenantId, schoolYearId: year.id, name: '1A' } });
  const c2 = await o.schoolClass.create({ data: { tenantId, schoolYearId: year.id, name: '1B' } });
  const version = await o.timetableVersion.create({
    data: {
      tenantId,
      schoolYearId: year.id,
      status: 'PUBLISHED',
      validFrom: day(addDays(today, -120)),
      publishedAt: new Date(Date.now() - 86_400_000),
    },
  });
  return { year, math, eng, r1, r2, c1, c2, version };
}

/** Regel in der veröffentlichten Version (Grundlage für "unterrichtet Fach/Klasse"). */
export async function lesson(
  h: Harness,
  tenantId: string,
  versionId: string,
  v: {
    subjectId: string;
    classId: string;
    roomId?: string;
    teacherId: string;
    weekday?: number;
    period?: number;
  },
) {
  const l = await h.owner.lesson.create({
    data: {
      tenantId,
      versionId,
      subjectId: v.subjectId,
      classId: v.classId,
      roomId: v.roomId ?? null,
      weekday: v.weekday ?? 1,
      periodStart: v.period ?? 1,
    },
  });
  await h.owner.lessonTeacher.create({
    data: { tenantId, lessonId: l.id, teacherId: v.teacherId },
  });
  return l;
}

/** Termin direkt anlegen (unabhängig vom Wochentag, an dem der Test läuft). */
export async function occurrence(
  h: Harness,
  tenantId: string,
  v: {
    date: string;
    period: number;
    subjectId: string;
    classId: string;
    teacherId: string;
    roomId?: string;
    lessonId?: string;
  },
) {
  const hh = String(7 + v.period).padStart(2, '0');
  const o = await h.owner.occurrence.create({
    data: {
      tenantId,
      lessonId: v.lessonId ?? null,
      date: day(v.date),
      periodStart: v.period,
      periodCount: 1,
      startsAt: at(v.date, `${hh}:00`),
      endsAt: at(v.date, `${hh}:50`),
      subjectId: v.subjectId,
      classId: v.classId,
      roomId: v.roomId ?? null,
    },
  });
  await h.owner.occurrenceTeacher.create({
    data: { tenantId, occurrenceId: o.id, teacherId: v.teacherId },
  });
  return o.id;
}

export async function enroll(h: Harness, tenantId: string, studentId: string, classId: string) {
  await h.owner.enrollment.create({
    data: { tenantId, studentId, classId, fromDate: day(addDays(today, -120)) },
  });
}

let n = 0;
export const mid = () => `mut-${Date.now().toString(36)}-${n++}`;
