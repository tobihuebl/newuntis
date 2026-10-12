import { afterAll, describe, expect, it } from 'vitest';
import { createPrisma } from '../src/index';

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url).pathname);
} catch {
  // CI: Variablen kommen aus der Umgebung
}

const prisma = createPrisma();
afterAll(async () => prisma.$disconnect());

// Voraussetzung: `pnpm db:migrate` und `pnpm db:seed` sind gelaufen.
describe('Demoschule (Seed)', () => {
  it('enthält alle Rollen und einen veröffentlichten Stundenplan', async () => {
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: 'demo' } });
    const roles = await prisma.roleAssignment.groupBy({
      by: ['role'],
      where: { tenantId: tenant.id },
    });
    expect(roles.map((r) => r.role).sort()).toEqual([
      'ADMIN',
      'GUARDIAN',
      'HOMEROOM',
      'PRINCIPAL',
      'STUDENT',
      'TEACHER',
    ]);
    const version = await prisma.timetableVersion.findFirstOrThrow({
      where: { tenantId: tenant.id, status: 'PUBLISHED' },
    });
    expect(version.status).toBe('PUBLISHED');
  });

  it('hat einen konfliktfreien Stundenplan (Lehrer, Raum, Klasse)', async () => {
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: 'demo' } });
    const lessons = await prisma.lesson.findMany({
      // nur die gültige Version: archivierte und Entwürfe enthalten dieselben Stunden noch einmal
      where: { tenantId: tenant.id, timetable: { status: 'PUBLISHED' } },
      include: { teachers: true },
    });
    expect(lessons.length).toBeGreaterThan(100);
    const seen = new Map<string, string>();
    const clash: string[] = [];
    for (const l of lessons) {
      for (let p = l.periodStart; p < l.periodStart + l.periodCount; p++) {
        const keys = [
          ...l.teachers.map((t) => `T|${t.teacherId}`),
          ...(l.roomId ? [`R|${l.roomId}`] : []),
          ...(l.classId ? [`C|${l.classId}`] : []),
        ];
        for (const k of keys) {
          const slot = `${k}|${l.weekday}|${p}`;
          if (seen.has(slot)) clash.push(slot);
          seen.set(slot, l.id);
        }
      }
    }
    expect(clash).toEqual([]);
  });

  it('verknüpft jedes Kind mit mindestens einem Elternteil', async () => {
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: 'demo' } });
    const students = await prisma.person.count({ where: { tenantId: tenant.id, kind: 'STUDENT' } });
    const linked = await prisma.guardianLink.groupBy({
      by: ['studentId'],
      where: { tenantId: tenant.id },
    });
    expect(linked.length).toBe(students);
  });
});
