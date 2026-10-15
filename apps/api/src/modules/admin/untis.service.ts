import { Injectable } from '@nestjs/common';
import type { Tx } from '@sp/db';
import {
  buildLessons,
  buildRequirements,
  couplingName,
  parseDif,
  readLessons,
  readRooms,
  readSubjects,
  readTeachers,
  readTimetable,
  type UntisImportInput,
  type UntisMatch,
  type UntisPreview,
  type UntisResult,
} from '@sp/shared';
import { asDate, iso, todayIn } from '../timetable/data';
import { bad } from './util';

/** Personen-Schlüssel für Lehrkräfte aus Untis (externalId), damit ein zweiter Import dieselben findet. */
const untisKey = (code: string) => `untis:${code}`;

type Analysis = Awaited<ReturnType<UntisService['analyze']>>;

/**
 * Untis-Import (SD-06, ADR 0023): Vorschau und Übernahme teilen dieselbe Analyse. Übernommen wird immer als neuer
 * Stundenplan-Entwurf; veröffentlichte Pläne, Termine und Klassenbuch bleiben unberührt.
 */
@Injectable()
export class UntisService {
  async analyze(tx: Tx, tenantId: string, input: UntisImportInput) {
    const year = await tx.schoolYear.findUnique({ where: { id: input.schoolYearId } });
    if (!year) bad('Schuljahr nicht gefunden');
    const tz = (
      await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { timezone: true } })
    ).timezone;
    const today = todayIn(tz);
    const validFrom = iso(year.startsOn) > today ? iso(year.startsOn) : today;
    const errors: string[] = [];

    const periods = (await tx.period.findMany({ select: { number: true } })).map((p) => p.number);
    if (periods.length === 0)
      errors.push('Im Unterrichtsraster sind noch keine Stunden angelegt (Verwaltung → Raster).');
    const tt = readTimetable(parseDif(input.files.gpu001));
    const { lessons, warnings } = buildLessons(tt.slots, periods, tt.invalid);
    if (lessons.length === 0) errors.push('In GPU001.TXT wurde kein Unterricht gefunden.');
    const requirements = input.files.gpu002
      ? buildRequirements(readLessons(parseDif(input.files.gpu002)))
      : [];
    const untisTeachers = new Map(
      (input.files.gpu004 ? readTeachers(parseDif(input.files.gpu004)) : []).map((t) => [
        t.code,
        t,
      ]),
    );
    const untisRooms = new Map(
      (input.files.gpu005 ? readRooms(parseDif(input.files.gpu005)) : []).map((r) => [r.code, r]),
    );
    const untisSubjects = new Map(
      (input.files.gpu006 ? readSubjects(parseDif(input.files.gpu006)) : []).map((s) => [
        s.code,
        s,
      ]),
    );

    const uniq = (xs: string[]) =>
      [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de', { numeric: true }));
    const courses = [...lessons, ...requirements.map((r) => ({ ...r, teachers: [r.teacher] }))];
    const classNames = uniq(courses.flatMap((c) => c.classes));
    const groupNames = uniq(
      courses.filter((c) => c.classes.length > 1).map((c) => couplingName(c.classes, c.subject)),
    );
    const subjectCodes = uniq(courses.map((c) => c.subject));
    const roomCodes = uniq(lessons.map((l) => l.room ?? ''));
    const teacherCodes = uniq(courses.flatMap((c) => c.teachers));

    const [classes, groups, subjects, rooms] = await Promise.all([
      tx.schoolClass.findMany({
        where: { schoolYearId: year.id, name: { in: classNames } },
        select: { id: true, name: true },
      }),
      tx.group.findMany({
        where: { schoolYearId: year.id, name: { in: groupNames } },
        select: { id: true, name: true },
      }),
      tx.subject.findMany({
        where: { code: { in: subjectCodes } },
        select: { id: true, code: true },
      }),
      tx.room.findMany({ where: { name: { in: roomCodes } }, select: { id: true, name: true } }),
    ]);
    const teachers = await this.matchTeachers(tx, teacherCodes, untisTeachers);

    const preview: UntisPreview = {
      schoolYear: { id: year.id, name: year.name },
      validFrom,
      counts: {
        lessons: lessons.length,
        doubles: lessons.filter((l) => l.periodCount > 1).length,
        couplings: lessons.filter((l) => l.classes.length > 1).length,
        teamTeaching: lessons.filter((l) => l.teachers.length > 1).length,
        requirements: requirements.length,
      },
      classes: classNames.map((name) => ({ name, exists: classes.some((c) => c.name === name) })),
      groups: groupNames.map((name) => ({ name, exists: groups.some((g) => g.name === name) })),
      subjects: subjectCodes.map((code) => ({
        code,
        name: untisSubjects.get(code)?.name || code,
        exists: subjects.some((s) => s.code === code),
      })),
      rooms: roomCodes.map((code) => ({ code, exists: rooms.some((r) => r.name === code) })),
      teachers: teacherCodes.map((code) => {
        const t = teachers.get(code)!;
        return { code, name: t.name, email: t.email, match: t.match };
      }),
      warnings,
      errors,
    };
    return {
      preview,
      year,
      validFrom,
      lessons,
      requirements,
      maps: { classes, groups, subjects, rooms, teachers, untisRooms, untisSubjects },
    };
  }

  /** Kürzel → Person: zuerst früherer Import (externalId), dann E-Mail aus GPU004, dann eindeutiger Name. */
  private async matchTeachers(
    tx: Tx,
    codes: string[],
    untis: Map<string, { lastName: string; firstName: string; email: string }>,
  ) {
    const staff = await tx.person.findMany({
      where: {
        anonymizedAt: null,
        OR: [{ kind: 'TEACHER' }, { roles: { some: { role: { in: ['TEACHER', 'HOMEROOM'] } } } }],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        externalId: true,
        user: { select: { email: true } },
      },
    });
    const norm = (s: string) => s.trim().toLowerCase();
    const out = new Map<
      string,
      {
        personId: string | null;
        match: UntisMatch;
        name: string;
        email: string | null;
        first: string;
        last: string;
      }
    >();
    for (const code of codes) {
      const u = untis.get(code);
      const first = u?.firstName ?? '';
      const last = u?.lastName || code;
      const email = u?.email || null;
      const name = `${first} ${last}`.trim();
      const byKey = staff.find((p) => p.externalId === untisKey(code));
      const byEmail = email
        ? staff.find((p) => [p.email, p.user?.email].some((e) => e && norm(e) === email))
        : undefined;
      const byName = u?.lastName
        ? staff.filter(
            (p) =>
              norm(p.lastName) === norm(u.lastName) &&
              (!u.firstName || norm(p.firstName) === norm(u.firstName)),
          )
        : [];
      const hit: [string | null, UntisMatch] = byKey
        ? [byKey.id, 'existing']
        : byEmail
          ? [byEmail.id, 'email']
          : byName.length === 1
            ? [byName[0]!.id, 'name']
            : [null, 'new'];
      out.set(code, { personId: hit[0], match: hit[1], name, email, first, last });
    }
    return out;
  }

  /** Übernahme in einer Transaktion: fehlende Stammdaten anlegen, dann neuer Entwurf mit Stunden und Soll. */
  async apply(tx: Tx, tenantId: string, input: UntisImportInput): Promise<UntisResult> {
    const a: Analysis = await this.analyze(tx, tenantId, input);
    if (a.preview.errors.length) bad(a.preview.errors[0]!);
    const created = { classes: 0, groups: 0, subjects: 0, rooms: 0, teachers: 0 };
    const classId = new Map(a.maps.classes.map((c) => [c.name, c.id]));
    for (const c of a.preview.classes.filter((x) => !x.exists)) {
      const row = await tx.schoolClass.create({
        data: { tenantId, schoolYearId: a.year.id, name: c.name },
      });
      classId.set(c.name, row.id);
      created.classes++;
    }
    const groupId = new Map(a.maps.groups.map((g) => [g.name, g.id]));
    for (const g of a.preview.groups.filter((x) => !x.exists)) {
      const row = await tx.group.create({
        data: { tenantId, schoolYearId: a.year.id, name: g.name },
      });
      groupId.set(g.name, row.id);
      created.groups++;
    }
    const subjectId = new Map(a.maps.subjects.map((s) => [s.code, s.id]));
    for (const s of a.preview.subjects.filter((x) => !x.exists)) {
      const row = await tx.subject.create({ data: { tenantId, code: s.code, name: s.name } });
      subjectId.set(s.code, row.id);
      created.subjects++;
    }
    const roomId = new Map(a.maps.rooms.map((r) => [r.name, r.id]));
    for (const r of a.preview.rooms.filter((x) => !x.exists)) {
      const row = await tx.room.create({
        data: { tenantId, name: r.code, capacity: a.maps.untisRooms.get(r.code)?.capacity ?? null },
      });
      roomId.set(r.code, row.id);
      created.rooms++;
    }
    const teacherId = new Map<string, string>();
    for (const [code, t] of a.maps.teachers) {
      if (t.personId) {
        teacherId.set(code, t.personId);
        // Beim nächsten Import über das Kürzel wiederfinden (nur, wenn noch kein Schlüssel gesetzt ist)
        await tx.person.updateMany({
          where: { id: t.personId, externalId: null },
          data: { externalId: untisKey(code) },
        });
        continue;
      }
      const p = await tx.person.create({
        data: {
          tenantId,
          kind: 'TEACHER',
          firstName: t.first,
          lastName: t.last,
          email: t.email,
          externalId: untisKey(code),
        },
      });
      await tx.roleAssignment.create({ data: { tenantId, personId: p.id, role: 'TEACHER' } });
      teacherId.set(code, p.id);
      created.teachers++;
    }
    const target = (classes: string[], subject: string) =>
      classes.length > 1
        ? { classId: null, groupId: groupId.get(couplingName(classes, subject))! }
        : { classId: classId.get(classes[0]!)!, groupId: null };

    const version = await tx.timetableVersion.create({
      data: {
        tenantId,
        schoolYearId: a.year.id,
        name: input.name,
        validFrom: asDate(a.validFrom),
      },
    });
    for (const l of a.lessons) {
      const row = await tx.lesson.create({
        data: {
          tenantId,
          versionId: version.id,
          subjectId: subjectId.get(l.subject)!,
          ...target(l.classes, l.subject),
          roomId: l.room ? (roomId.get(l.room) ?? null) : null,
          weekday: l.weekday,
          periodStart: l.periodStart,
          periodCount: l.periodCount,
        },
      });
      const ids = [
        ...new Set(l.teachers.map((c) => teacherId.get(c)).filter((x): x is string => !!x)),
      ];
      if (ids.length)
        await tx.lessonTeacher.createMany({
          data: ids.map((teacherId) => ({ tenantId, lessonId: row.id, teacherId })),
        });
    }
    let requirements = 0;
    for (const r of a.requirements) {
      const teacher = teacherId.get(r.teacher);
      if (!teacher) continue;
      await tx.lessonRequirement.create({
        data: {
          tenantId,
          versionId: version.id,
          subjectId: subjectId.get(r.subject)!,
          ...target(r.classes, r.subject),
          teacherId: teacher,
          hoursPerWeek: r.hoursPerWeek,
        },
      });
      requirements++;
    }
    return { versionId: version.id, lessons: a.lessons.length, requirements, created };
  }
}
