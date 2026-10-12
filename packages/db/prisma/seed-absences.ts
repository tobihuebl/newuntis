/**
 * Demodaten für M5 (Abwesenheit und Supplierung): Fehlzeiten aus den "abwesend"-Einträgen des Klassenbuchs
 * (offen, gemeldet, entschuldigt) und eine kranke Lehrkraft am nächsten Schultag mit offenen Supplierungen.
 * Läuft auch auf einer bestehenden Demoschule (einmalig: nur wenn es noch keine Fehlzeiten gibt).
 */
import { absenceBlocks, nextWeekday } from '@sp/shared';
import { DateTime } from 'luxon';
import type { Db } from '../src/index';

export async function seedAbsencesDemo(prisma: Db, tenantId: string): Promise<boolean> {
  if ((await prisma.absence.count({ where: { tenantId } })) > 0) return false;
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const today = DateTime.now().setZone(tenant.timezone).toISODate()!;

  const absent = await prisma.attendance.findMany({
    where: { tenantId, status: 'ABSENT' },
    select: {
      studentId: true,
      recordedById: true,
      occurrence: { select: { date: true, startsAt: true, endsAt: true } },
    },
  });
  const groups = new Map<string, typeof absent>();
  for (const a of absent) {
    const key = `${a.studentId}|${a.occurrence.date.toISOString().slice(0, 10)}`;
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  const blocks = [...groups.values()]
    .flatMap((list) =>
      absenceBlocks(list.map((a) => a.occurrence)).map((b) => ({
        ...b,
        studentId: list[0]!.studentId,
        recordedById: list[0]!.recordedById,
      })),
    )
    .sort((a, b) => b.fromAt.getTime() - a.fromAt.getTime());

  for (const [i, b] of blocks.entries()) {
    // Mischung für die Demo: jüngste offen, eine gemeldet (für den Klassenvorstand), ältere entschuldigt
    const guardian =
      i === 2
        ? await prisma.guardianLink.findFirst({ where: { tenantId, studentId: b.studentId } })
        : null;
    const status = i < 2 ? 'OPEN' : i === 2 ? 'REPORTED' : 'EXCUSED';
    await prisma.absence.create({
      data: {
        tenantId,
        studentId: b.studentId,
        fromAt: b.fromAt,
        toAt: b.toAt,
        origin: status === 'REPORTED' ? 'REPORT' : 'CLASSBOOK',
        status,
        reasonCode: status === 'OPEN' ? null : 'ILLNESS',
        reason: status === 'REPORTED' ? 'Fieber, war beim Hausarzt.' : null,
        reportedById: guardian?.guardianId ?? b.recordedById,
        reviewedAt: status === 'EXCUSED' ? new Date() : null,
      },
    });
  }

  // Kranke Lehrkraft am nächsten Schultag (nicht der Klassenvorstand der 3A, der hat die Demo-Supplierung)
  const day = nextWeekday(today);
  const date = new Date(`${day}T00:00:00.000Z`);
  const homeroom3A = await prisma.roleAssignment.findFirst({
    where: { tenantId, role: 'HOMEROOM', class: { name: '3A' } },
    select: { personId: true },
  });
  const candidate = await prisma.occurrenceTeacher.findFirst({
    where: {
      tenantId,
      teacherId: { not: homeroom3A?.personId },
      occurrence: { date, status: 'SCHEDULED', substitution: { is: null } },
    },
    select: { teacherId: true },
  });
  if (candidate) {
    const fromAt = DateTime.fromISO(`${day}T00:00`, { zone: tenant.timezone }).toUTC().toJSDate();
    const toAt = DateTime.fromISO(`${day}T23:59:59`, { zone: tenant.timezone }).toUTC().toJSDate();
    const absence = await prisma.teacherAbsence.create({
      data: {
        tenantId,
        teacherId: candidate.teacherId,
        fromAt,
        toAt,
        kind: 'SICK',
        createdById: candidate.teacherId,
      },
    });
    const affected = await prisma.occurrence.findMany({
      where: {
        tenantId,
        date,
        status: 'SCHEDULED',
        substitution: { is: null },
        teachers: { some: { teacherId: candidate.teacherId } },
      },
      select: { id: true },
    });
    await prisma.substitution.createMany({
      data: affected.map((o) => ({
        tenantId,
        occurrenceId: o.id,
        kind: 'SUBSTITUTE' as const,
        status: 'OPEN' as const,
        teacherAbsenceId: absence.id,
      })),
    });
  }
  return true;
}
