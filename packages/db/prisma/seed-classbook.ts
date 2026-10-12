/**
 * Klassenbuch-Demodaten (M4) für die Demoschule: vergangene Stunden mit Einträgen und Anwesenheit,
 * zwei offene Einträge, Hausübungen, eine Schularbeit, eine Supplierung und ein Entfall.
 * Läuft auch auf einer bestehenden Demoschule (einmalig: nur wenn es noch keine Klassenbuch-Einträge gibt).
 */
import { randomUUID } from 'node:crypto';
import { addDays, nextWeekday, planDay, tenantSettingsSchema } from '@sp/shared';
import { DateTime } from 'luxon';
import type { Db, Prisma } from '../src/index';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const date = (s: string) => new Date(`${s}T00:00:00.000Z`);

const TOPICS: Record<string, string[]> = {
  D: [
    'Kommasetzung bei Nebensätzen',
    'Erörterung: Einleitung und Schluss',
    'Lesen: Kurzgeschichte',
  ],
  M: ['Bruchrechnen: Kürzen und Erweitern', 'Lineare Gleichungen', 'Prozentrechnung'],
  E: ['Present Perfect vs. Past Simple', 'Vocabulary Unit 3', 'Reading: A day in London'],
  GWK: ['Klimazonen Europas', 'Wirtschaftssektoren'],
  GS: ['Die Habsburger', 'Industrielle Revolution'],
  BIU: ['Der Wald als Lebensraum', 'Zellaufbau'],
  PH: ['Hebelgesetz', 'Elektrischer Stromkreis'],
  CH: ['Säuren und Basen', 'Atombau'],
  BSP: ['Ausdauerlauf', 'Volleyball: Pritschen'],
  MU: ['Rhythmusübungen', 'Instrumentenkunde'],
  BE: ['Perspektive zeichnen', 'Farbenlehre'],
  INF: ['Tabellenkalkulation', 'Sicher im Netz'],
};
const HOMEWORK: Record<string, string> = {
  M: 'Buch S. 48, Nr. 3a–d',
  D: 'Text zur Kurzgeschichte fertig schreiben (ca. 200 Wörter)',
  E: 'Workbook p. 21, ex. 4 and 5',
};

export async function seedClassbookDemo(prisma: Db, tenantId: string): Promise<string | null> {
  if ((await prisma.classbookEntry.count({ where: { tenantId } })) > 0) return null;
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const settings = tenantSettingsSchema.parse(tenant.settings);
  const today = DateTime.now().setZone(tenant.timezone).toISODate()!;
  const year = await prisma.schoolYear.findFirst({ where: { tenantId, isCurrent: true } });
  if (!year) return null;
  const cls = await prisma.schoolClass.findFirst({
    where: { tenantId, schoolYearId: year.id, name: '3A' },
  });
  if (!cls) return null;
  const homeroom = await prisma.roleAssignment.findFirst({
    where: { tenantId, role: 'HOMEROOM', classId: cls.id },
  });
  if (!homeroom) return null;
  const teacherId = homeroom.personId;
  const subjects = new Map(
    (await prisma.subject.findMany({ where: { tenantId } })).map((s) => [s.id, s.code]),
  );
  const periods = await prisma.period.findMany({ where: { tenantId }, orderBy: { number: 'asc' } });
  const freeDays = (await prisma.schoolFreeDay.findMany({ where: { tenantId } })).map((f) => ({
    fromDate: iso(f.fromDate),
    toDate: iso(f.toDate),
  }));
  const versions = await prisma.timetableVersion.findMany({
    where: { tenantId, status: { in: ['PUBLISHED', 'ARCHIVED'] }, publishedAt: { not: null } },
    include: { lessons: { include: { teachers: true } } },
    orderBy: { publishedAt: 'desc' },
  });
  const students = (
    await prisma.enrollment.findMany({
      where: { tenantId, classId: cls.id, toDate: null },
      select: { studentId: true },
    })
  ).map((e) => e.studentId);

  // Vergangene Schultage (bis zu 6) der Klasse 3A und der Klassenvorständin/des Klassenvorstands
  const past: {
    id: string;
    date: string;
    subjectId: string;
    classId: string | null;
    teacherIds: string[];
    startsAt: Date;
  }[] = [];
  const occurrences: Prisma.OccurrenceCreateManyInput[] = [];
  const occTeachers: Prisma.OccurrenceTeacherCreateManyInput[] = [];
  let days = 0;
  for (let d = addDays(today, -1); days < 6 && d >= iso(year.startsOn); d = addDays(d, -1)) {
    const v = versions.find((x) => iso(x.validFrom) <= d);
    if (!v) continue;
    const planned = planDay(d, {
      lessons: v.lessons.map((l) => ({
        id: l.id,
        weekday: l.weekday,
        periodStart: l.periodStart,
        periodCount: l.periodCount,
        weekPattern: l.weekPattern,
        subjectId: l.subjectId,
        classId: l.classId,
        groupId: l.groupId,
        roomId: l.roomId,
        teacherIds: l.teachers.map((t) => t.teacherId),
      })),
      periods,
      freeDays,
      referenceMonday: settings.abWeekReferenceMonday ?? iso(year.startsOn),
      timezone: tenant.timezone,
    }).filter((o) => o.classId === cls.id || o.teacherIds.includes(teacherId));
    if (planned.length === 0) continue;
    days++;
    const existing = new Set(
      (
        await prisma.occurrence.findMany({
          where: { tenantId, date: date(d), lessonId: { in: planned.map((p) => p.lessonId) } },
          select: { lessonId: true },
        })
      ).map((o) => o.lessonId),
    );
    for (const p of planned) {
      if (existing.has(p.lessonId)) continue;
      const id = randomUUID();
      occurrences.push({
        id,
        tenantId,
        lessonId: p.lessonId,
        date: date(p.date),
        periodStart: p.periodStart,
        periodCount: p.periodCount,
        startsAt: p.startsAt,
        endsAt: p.endsAt,
        subjectId: p.subjectId,
        classId: p.classId,
        groupId: p.groupId,
        roomId: p.roomId,
      });
      occTeachers.push(...p.teacherIds.map((t) => ({ tenantId, occurrenceId: id, teacherId: t })));
      past.push({
        id,
        date: p.date,
        subjectId: p.subjectId,
        classId: p.classId,
        teacherIds: p.teacherIds,
        startsAt: p.startsAt,
      });
    }
  }
  await prisma.occurrence.createMany({ data: occurrences });
  await prisma.occurrenceTeacher.createMany({ data: occTeachers });

  // Zwei jüngste Stunden der Lehrkraft bleiben offen (Hinweis "2 Klassenbucheinträge offen")
  const own = past
    .filter((p) => p.teacherIds.includes(teacherId))
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
  const open = new Set(own.slice(0, 2).map((p) => p.id));
  const due = nextWeekday(today);
  const homeworkGiven = new Set<string>();
  const entries: Prisma.ClassbookEntryCreateManyInput[] = [];
  const attendance: Prisma.AttendanceCreateManyInput[] = [];
  let k = 0;
  for (const p of [...past].sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())) {
    if (open.has(p.id)) continue;
    const code = subjects.get(p.subjectId) ?? '';
    const topics = TOPICS[code] ?? ['Wiederholung'];
    const giveHomework = p.classId === cls.id && HOMEWORK[code] && !homeworkGiven.has(code);
    if (giveHomework) homeworkGiven.add(code);
    entries.push({
      tenantId,
      occurrenceId: p.id,
      topic: topics[k++ % topics.length]!,
      homework: giveHomework ? HOMEWORK[code]! : null,
      homeworkDueOn: giveHomework ? date(due) : null,
      closedAt: new Date(p.startsAt.getTime() + 50 * 60_000),
      closedById: p.teacherIds[0] ?? null,
      updatedById: p.teacherIds[0] ?? null,
    });
    if (p.classId === cls.id)
      students.forEach((s, i) =>
        attendance.push({
          tenantId,
          occurrenceId: p.id,
          studentId: s,
          status: (i + k) % 13 === 0 ? 'ABSENT' : (i + k) % 17 === 0 ? 'LATE' : 'PRESENT',
          lateMinutes: (i + k) % 13 !== 0 && (i + k) % 17 === 0 ? 10 : null,
          recordedById: p.teacherIds[0] ?? teacherId,
        }),
      );
  }
  await prisma.classbookEntry.createMany({ data: entries });
  await prisma.attendance.createMany({ data: attendance });

  // Schularbeit in zwei Schultagen
  const math = [...subjects].find(([, c]) => c === 'M')?.[0];
  if (math)
    await prisma.exam.create({
      data: {
        tenantId,
        classId: cls.id,
        subjectId: math,
        date: date(nextWeekday(nextWeekday(today))),
        title: '1. Schularbeit',
        kind: 'Schularbeit',
        createdById: teacherId,
      },
    });

  // Heute bzw. nächster Schultag: eine Supplierung für die Lehrkraft und ein Entfall in 3A
  for (let d = today, tries = 0; tries < 5; d = nextWeekday(d), tries++) {
    const day = await prisma.occurrence.findMany({
      where: { tenantId, date: date(d), status: 'SCHEDULED' },
      include: { teachers: true, substitution: true },
      orderBy: { periodStart: 'desc' },
    });
    const busy = new Set(
      day
        .filter((o) => o.teachers.some((t) => t.teacherId === teacherId))
        .map((o) => o.periodStart),
    );
    const candidate = day.find(
      (o) =>
        o.classId !== cls.id &&
        !busy.has(o.periodStart) &&
        !o.substitution &&
        !o.teachers.some((t) => t.teacherId === teacherId),
    );
    const cancel = day.find(
      (o) => o.classId === cls.id && !o.teachers.some((t) => t.teacherId === teacherId),
    );
    if (!candidate || !cancel) continue;
    await prisma.occurrenceTeacher.deleteMany({ where: { occurrenceId: candidate.id } });
    await prisma.occurrenceTeacher.create({
      data: { tenantId, occurrenceId: candidate.id, teacherId },
    });
    await prisma.occurrence.update({
      where: { id: candidate.id },
      data: { status: 'SUBSTITUTED' },
    });
    await prisma.substitution.create({
      data: {
        tenantId,
        occurrenceId: candidate.id,
        kind: 'SUBSTITUTE',
        substituteTeacherId: teacherId,
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });
    await prisma.occurrence.update({ where: { id: cancel.id }, data: { status: 'CANCELLED' } });
    await prisma.substitution.create({
      data: {
        tenantId,
        occurrenceId: cancel.id,
        kind: 'CANCEL',
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });
    break;
  }

  const user = await prisma.user.findFirst({ where: { tenantId, personId: teacherId } });
  return user?.email ?? null;
}
