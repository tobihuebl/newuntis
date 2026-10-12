import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Tx } from '@sp/db';

/** Schutzregeln vor dem Anonymisieren: nicht sich selbst, nicht die letzte Administration. */
export async function assertCanAnonymize(tx: Tx, actorId: string, personId: string): Promise<void> {
  if (personId === actorId)
    throw new BadRequestException({ title: 'Das eigene Konto kann nicht anonymisiert werden' });
  const p = await tx.person.findUnique({ where: { id: personId }, include: { roles: true } });
  if (!p) throw new NotFoundException({ title: 'Person nicht gefunden' });
  if (
    p.roles.some((r) => r.role === 'ADMIN') &&
    (await tx.roleAssignment.count({ where: { role: 'ADMIN', NOT: { personId } } })) === 0
  )
    throw new BadRequestException({
      title: 'Die letzte Administration kann nicht anonymisiert werden',
    });
}

/**
 * Löschen einer Person = Anonymisieren (Spec Abschnitt 8): Klassenbuch, Anwesenheit und Fehlzeiten bleiben als
 * Schulunterlagen gültig, der Personenbezug (Name, Kontakt, Konto, Geräte, Einstellungen) verschwindet.
 * Prüfungen (letzte Administration, eigenes Konto) und das Audit macht der Aufrufer.
 */
export async function anonymizePerson(tx: Tx, personId: string): Promise<void> {
  await tx.user.deleteMany({ where: { personId } }); // Sitzungen, Wiederherstellungs- und Reset-Codes per Cascade
  await tx.invitation.deleteMany({ where: { personId } });
  await tx.guardianCode.deleteMany({ where: { studentId: personId } });
  await tx.pushSubscription.deleteMany({ where: { personId } });
  await tx.calendarToken.deleteMany({ where: { personId } });
  await tx.notificationPreference.deleteMany({ where: { personId } });
  await tx.notification.deleteMany({ where: { personId } });
  await tx.roleAssignment.deleteMany({ where: { personId } });
  await tx.schoolClass.updateMany({
    where: { homeroomTeacherId: personId },
    data: { homeroomTeacherId: null },
  });
  await tx.person.update({
    where: { id: personId },
    data: {
      firstName: 'Anonymisiert',
      lastName: '',
      birthDate: null,
      externalId: null,
      email: null,
      anonymizedAt: new Date(),
    },
  });
}
