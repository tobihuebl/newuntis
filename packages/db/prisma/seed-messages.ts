/**
 * Demodaten für M6 (Nachrichten und Rundschreiben): Gespräche des Klassenvorstands der 3A mit Eltern (je Familie
 * eines, eine Antwort), ein Gespräch im Kollegium und ein Rundschreiben der Direktion mit Lesebestätigung.
 * Läuft auch auf einer bestehenden Demoschule (einmalig: nur wenn es noch keine Gespräche gibt).
 */
import type { Prisma } from '@prisma/client';
import type { Db } from '../src/index';

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

export async function seedMessagesDemo(prisma: Db, tenantId: string): Promise<boolean> {
  if ((await prisma.thread.count({ where: { tenantId } })) > 0) return false;
  const homeroom = await prisma.roleAssignment.findFirst({
    where: { tenantId, role: 'HOMEROOM', class: { name: '3A' } },
    select: { personId: true, classId: true },
  });
  const principal = await prisma.roleAssignment.findFirst({
    where: { tenantId, role: 'PRINCIPAL' },
    select: { personId: true },
  });
  if (!homeroom?.classId || !principal) return false;

  const students = await prisma.enrollment.findMany({
    where: { tenantId, classId: homeroom.classId, toDate: null },
    select: { studentId: true },
    orderBy: { student: { lastName: 'asc' } },
    take: 3,
  });
  const links = await prisma.guardianLink.findMany({
    where: {
      tenantId,
      studentId: { in: students.map((s) => s.studentId) },
      guardian: { user: { isNot: null } },
    },
    select: { guardianId: true, studentId: true },
  });

  // Nachricht an die Eltern der 3A: je Familie ein Gespräch, in einem davon eine Antwort
  let answered = false;
  for (const s of students) {
    const guardians = links.filter((l) => l.studentId === s.studentId).map((l) => l.guardianId);
    if (guardians.length === 0) continue;
    const sent = minutesAgo(26 * 60);
    const thread = await prisma.thread.create({
      data: {
        tenantId,
        subject: 'Wandertag am Freitag',
        createdById: homeroom.personId,
        aboutStudentId: s.studentId,
        classId: homeroom.classId,
        lastMessageAt: sent,
        participants: {
          create: [
            { tenantId, personId: homeroom.personId, lastReadAt: sent },
            ...guardians.map((personId) => ({ tenantId, personId })),
          ],
        },
        messages: {
          create: {
            tenantId,
            senderId: homeroom.personId,
            body: 'Liebe Eltern, am Freitag wandern wir auf den Kahlenberg. Treffpunkt 8:00 Uhr beim Schultor, Rückkehr gegen 13:00 Uhr. Bitte feste Schuhe, Regenjacke und Jause mitgeben.',
            createdAt: sent,
          },
        },
      },
    });
    if (!answered) {
      const at = minutesAgo(90);
      await prisma.message.create({
        data: {
          tenantId,
          threadId: thread.id,
          senderId: guardians[0]!,
          body: 'Danke für die Info! Darf sie ihr Handy mitnehmen?',
          createdAt: at,
        },
      });
      await prisma.thread.update({ where: { id: thread.id }, data: { lastMessageAt: at } });
      await prisma.threadParticipant.update({
        where: { threadId_personId: { threadId: thread.id, personId: guardians[0]! } },
        data: { lastReadAt: at },
      });
      answered = true;
    }
  }

  // Kollegium: Direktion und Klassenvorstand
  const at = minutesAgo(3 * 60);
  await prisma.thread.create({
    data: {
      tenantId,
      subject: 'Elternsprechtag',
      createdById: principal.personId,
      lastMessageAt: at,
      participants: {
        create: [
          { tenantId, personId: principal.personId, lastReadAt: at },
          { tenantId, personId: homeroom.personId },
        ],
      },
      messages: {
        create: {
          tenantId,
          senderId: principal.personId,
          body: 'Kannst du bis Mittwoch die Termine für die 3A eintragen? Danke!',
          createdAt: at,
        },
      },
    },
  });

  // Rundschreiben mit Lesebestätigung an alle Eltern, ein Teil hat schon bestätigt
  const guardians = await prisma.person.findMany({
    where: {
      tenantId,
      anonymizedAt: null,
      roles: { some: { role: 'GUARDIAN' } },
      user: { isNot: null },
    },
    select: { id: true },
  });
  const published = minutesAgo(2 * 24 * 60);
  const a = await prisma.announcement.create({
    data: {
      tenantId,
      title: 'Information zum Schulstart und Datenschutz',
      body: 'Liebe Eltern,\n\nab sofort laufen Krankmeldungen, Entschuldigungen und Mitteilungen der Schule über diese Plattform. Bitte melden Sie Abwesenheiten Ihres Kindes bis 8:00 Uhr unter „Abwesenheit“.\n\nBitte bestätigen Sie, dass Sie diese Information gelesen haben.\n\nDie Direktion',
      audience: { roles: ['GUARDIAN'], classIds: [], groupIds: [] } as Prisma.InputJsonValue,
      requiresRead: true,
      createdById: principal.personId,
      publishedAt: published,
    },
  });
  await prisma.announcementRead.createMany({
    data: guardians.map((g, i) => ({
      tenantId,
      announcementId: a.id,
      personId: g.id,
      readAt: i % 3 === 0 ? minutesAgo(24 * 60 - i) : null,
    })),
  });
  return true;
}
