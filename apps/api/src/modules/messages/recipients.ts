import type { Tx } from '@sp/db';
import { type PolicyUser, type Recipient, type Role } from '@sp/shared';
import { asDate, todayIn } from '../timetable/data';

const STAFF_ROLES: Role[] = ['TEACHER', 'HOMEROOM', 'PRINCIPAL', 'ADMIN'];
export const isStaffRole = (r: Role) => STAFF_ROLES.includes(r);

/** Erreichbar: mit Konto (eingeladen oder aktiv), nicht anonymisiert, Verarbeitung nicht eingeschränkt. */
export const reachable = {
  anonymizedAt: null,
  restrictedAt: null,
  user: { isNot: null },
} as const;

export const fullName = (p: { firstName: string; lastName: string }) =>
  `${p.firstName} ${p.lastName}`.trim();

/** Aktuelle Klassen-Einschreibungen (Schüler:in → Klasse). */
export async function currentEnrollments(
  tx: Tx,
  where: { classId?: { in: string[] }; studentId?: { in: string[] } },
  day: string,
) {
  return tx.enrollment.findMany({
    where: {
      ...where,
      fromDate: { lte: asDate(day) },
      OR: [{ toDate: null }, { toDate: { gte: asDate(day) } }],
    },
    select: { studentId: true, classId: true, class: { select: { name: true } } },
  });
}

/** Gültige Eltern-Verknüpfungen zu den Schüler:innen. */
export async function guardianLinks(tx: Tx, studentIds: string[], day: string) {
  return tx.guardianLink.findMany({
    where: {
      studentId: { in: studentIds },
      validFrom: { lte: asDate(day) },
      OR: [{ validTo: null }, { validTo: { gte: asDate(day) } }],
    },
    select: { guardianId: true, studentId: true },
  });
}

/**
 * Wem darf die Person ein neues Gespräch schreiben (Rechte-Matrix `message.send`, ADR 0009)?
 * - Direktion und Administration: alle Erreichbaren der Schule
 * - Lehrkräfte und Klassenvorstand: alle Lehrkräfte und Verwaltung, dazu Schüler:innen und Eltern der
 *   eigenen Klassen
 * - Eltern: Lehrkräfte und Klassenvorstand der Klassen ihrer Kinder sowie die Direktion
 * - Schüler:innen: niemand (Antworten in bestehenden Gesprächen sind erlaubt)
 */
export async function allowedRecipients(
  tx: Tx,
  tz: string,
  user: PolicyUser,
): Promise<Map<string, Recipient>> {
  const day = todayIn(tz);
  const out = new Map<string, Recipient>();
  const all = user.roles.some((r) => r === 'PRINCIPAL' || r === 'ADMIN');
  const teacherLike = user.roles.some((r) => r === 'TEACHER' || r === 'HOMEROOM');
  const guardian = user.roles.includes('GUARDIAN');
  if (!all && !teacherLike && !guardian) return out;

  // Personal der Schule (für Lehrkräfte und Direktion alle, für Eltern eingeschränkt, siehe unten)
  const staff = await tx.person.findMany({
    where: { ...reachable, roles: { some: { role: { in: STAFF_ROLES } } } },
    select: { id: true, firstName: true, lastName: true, roles: { select: { role: true } } },
  });

  if (all || teacherLike) {
    for (const p of staff)
      out.set(p.id, { id: p.id, name: fullName(p), kind: 'staff', context: null });
    const classIds = all
      ? null
      : [...new Set([...(user.teachesClassIds ?? []), ...(user.homeroomClassIds ?? [])])];
    const enr = await currentEnrollments(tx, classIds ? { classId: { in: classIds } } : {}, day);
    const className = new Map(enr.map((e) => [e.studentId, e.class.name]));
    const students = await tx.person.findMany({
      where: { id: { in: enr.map((e) => e.studentId) }, anonymizedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        restrictedAt: true,
        user: { select: { id: true } },
      },
    });
    const studentName = new Map(students.map((s) => [s.id, s]));
    for (const s of students)
      if (s.user && !s.restrictedAt)
        out.set(s.id, {
          id: s.id,
          name: fullName(s),
          kind: 'student',
          context: className.get(s.id) ?? null,
        });
    const links = await guardianLinks(
      tx,
      enr.map((e) => e.studentId),
      day,
    );
    const guardians = await tx.person.findMany({
      where: { ...reachable, id: { in: [...new Set(links.map((l) => l.guardianId))] } },
      select: { id: true, firstName: true, lastName: true },
    });
    const kidsOf = new Map<string, string[]>();
    for (const l of links) {
      const kid = studentName.get(l.studentId);
      if (!kid) continue;
      const label = `${kid.firstName} (${className.get(l.studentId) ?? ''})`.replace(' ()', '');
      kidsOf.set(l.guardianId, [...(kidsOf.get(l.guardianId) ?? []), label]);
    }
    for (const g of guardians)
      if (!out.has(g.id))
        out.set(g.id, {
          id: g.id,
          name: fullName(g),
          kind: 'guardian',
          context: (kidsOf.get(g.id) ?? []).join(', ') || null,
        });
  }

  if (guardian) {
    const kids = user.guardianOfStudentIds ?? [];
    const enr = await currentEnrollments(tx, { studentId: { in: [...kids] } }, day);
    const classIds = [...new Set(enr.map((e) => e.classId))];
    const lessons = await tx.lesson.findMany({
      where: { classId: { in: classIds }, timetable: { status: 'PUBLISHED' } },
      select: { teachers: { select: { teacherId: true } } },
    });
    const homerooms = await tx.roleAssignment.findMany({
      where: { role: 'HOMEROOM', classId: { in: classIds } },
      select: { personId: true },
    });
    const wanted = new Set([
      ...lessons.flatMap((l) => l.teachers.map((t) => t.teacherId)),
      ...homerooms.map((h) => h.personId),
      ...staff.filter((p) => p.roles.some((r) => r.role === 'PRINCIPAL')).map((p) => p.id),
    ]);
    for (const p of staff)
      if (wanted.has(p.id) && !out.has(p.id))
        out.set(p.id, { id: p.id, name: fullName(p), kind: 'staff', context: null });
  }
  return out;
}
