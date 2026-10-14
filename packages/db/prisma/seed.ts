/**
 * Seed einer Demoschule (Fantasiedaten, keine echten Personen).
 * Läuft als Tabelleneigentümer und umgeht daher Row-Level-Security.
 * Alle Demo-Konten haben das Passwort aus DEMO_PASSWORD (nur für lokale Entwicklung).
 */
import { randomUUID } from 'node:crypto';
import { hash } from '@node-rs/argon2';
import { addDays, DEFAULT_PERIODS, planDay, tenantSettingsSchema } from '@sp/shared';
import { DateTime } from 'luxon';
import { createPrisma } from '../src/index';
import type { Prisma } from '@prisma/client';
import { seedAbsencesDemo } from './seed-absences';
import { seedClassbookDemo } from './seed-classbook';
import { seedMessagesDemo } from './seed-messages';

export const DEMO_PASSWORD = 'demo-passwort-1';
const SLUG = 'demo';

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url).pathname);
} catch {
  // keine .env: Variablen kommen aus der Umgebung
}

// deterministischer Zufall, damit Seed-Daten reproduzierbar sind
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(2026);
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T;
const id = () => randomUUID();
const date = (s: string) => new Date(`${s}T00:00:00.000Z`);

const FIRST = [
  'Anna',
  'Lukas',
  'Mia',
  'Jonas',
  'Emma',
  'Felix',
  'Lena',
  'Paul',
  'Sophie',
  'Elias',
  'Laura',
  'Noah',
  'Hannah',
  'Leon',
  'Marie',
  'Tobias',
  'Julia',
  'David',
  'Clara',
  'Samuel',
  'Nora',
  'Ben',
  'Lisa',
  'Matteo',
];
const LAST = [
  'Gruber',
  'Huber',
  'Bauer',
  'Wagner',
  'Pichler',
  'Steiner',
  'Moser',
  'Mayer',
  'Hofer',
  'Leitner',
  'Berger',
  'Fuchs',
  'Eder',
  'Fischer',
  'Schmid',
  'Winkler',
  'Weber',
  'Schwarz',
  'Maier',
  'Reiter',
  'Mayr',
  'Egger',
  'Brunner',
  'Lang',
];

const SUBJECTS = [
  { code: 'D', name: 'Deutsch', color: 'koralle' },
  { code: 'M', name: 'Mathematik', color: 'kobalt' },
  { code: 'E', name: 'Englisch', color: 'rosa' },
  { code: 'GWK', name: 'Geografie und Wirtschaftskunde', color: 'sand' },
  { code: 'GS', name: 'Geschichte', color: 'sand' },
  { code: 'BIU', name: 'Biologie und Umweltkunde', color: 'mint' },
  { code: 'PH', name: 'Physik', color: 'himmel' },
  { code: 'CH', name: 'Chemie', color: 'himmel' },
  { code: 'BSP', name: 'Bewegung und Sport', color: 'limette' },
  { code: 'MU', name: 'Musik', color: 'flieder' },
  { code: 'BE', name: 'Bildnerische Erziehung', color: 'flieder' },
  { code: 'INF', name: 'Informatik', color: 'sand' },
] as const;

// Wochenstunden je Fach und Jahrgang (1 bis 4), grob nach Mittelschul-Stundentafel
const HOURS: Record<string, [number, number, number, number]> = {
  D: [4, 4, 4, 4],
  M: [4, 4, 4, 4],
  E: [3, 3, 3, 3],
  GWK: [2, 2, 2, 2],
  GS: [0, 1, 2, 2],
  BIU: [2, 2, 1, 2],
  PH: [0, 1, 2, 2],
  CH: [0, 0, 2, 2],
  BSP: [3, 3, 2, 2],
  MU: [2, 1, 1, 1],
  BE: [2, 1, 1, 1],
  INF: [1, 1, 1, 0],
};
// Fächer mit Fachraum
const SPECIAL_ROOM: Record<string, string> = {
  BSP: 'Turnsaal',
  MU: 'Musiksaal',
  INF: 'EDV-Raum',
  PH: 'Physiksaal',
  CH: 'Physiksaal',
};

const CLASS_NAMES = ['1A', '1B', '2A', '2B', '3A', '4A'];

async function main() {
  const prisma = createPrisma();
  const existing = await prisma.tenant.findUnique({ where: { slug: SLUG } });
  if (existing) {
    const kv = await seedClassbookDemo(prisma, existing.id);
    const absences = await seedAbsencesDemo(prisma, existing.id);
    const messages = await seedMessagesDemo(prisma, existing.id);
    console.log(
      kv || absences || messages
        ? `Demodaten ergänzt (${[kv && 'Klassenbuch', absences && 'Abwesenheit/Supplierung', messages && 'Nachrichten'].filter(Boolean).join(', ')}).`
        : `Mandant "${SLUG}" existiert bereits. Zum Neuaufbau: pnpm db:reset`,
    );
    await prisma.$disconnect();
    return;
  }
  const passwordHash = await hash(DEMO_PASSWORD, { algorithm: 2 /* Argon2id */ });

  const tenant = await prisma.tenant.create({
    data: {
      name: 'Mittelschule Beispielstadt (Demo)',
      slug: SLUG,
      settings: tenantSettingsSchema.parse({
        abWeekReferenceMonday: '2026-09-07',
        // Demoschule zeigt alle Pakete, auch den Stundenplan-Assistenten (ADR 0012)
        features: { autoPlanning: true },
      }) as Prisma.InputJsonValue,
    },
  });
  const tenantId = tenant.id;

  const schoolYearId = id();
  await prisma.schoolYear.create({
    data: {
      id: schoolYearId,
      tenantId,
      name: '2026/27',
      startsOn: date('2026-09-07'),
      endsOn: date('2027-07-02'),
      isCurrent: true,
    },
  });
  await prisma.schoolFreeDay.createMany({
    data: [
      ['2026-10-26', '2026-10-26', 'Nationalfeiertag'],
      ['2026-11-01', '2026-11-01', 'Allerheiligen'],
      ['2026-12-08', '2026-12-08', 'Mariä Empfängnis'],
      ['2026-12-24', '2027-01-06', 'Weihnachtsferien'],
      ['2027-02-01', '2027-02-07', 'Semesterferien'],
      ['2027-03-22', '2027-03-30', 'Osterferien'],
      ['2027-05-01', '2027-05-01', 'Staatsfeiertag'],
      ['2027-05-14', '2027-05-14', 'Christi Himmelfahrt'],
      ['2027-05-24', '2027-05-25', 'Pfingstferien'],
      ['2027-06-03', '2027-06-03', 'Fronleichnam'],
    ].map(([f, t, label]) => ({
      tenantId,
      schoolYearId,
      fromDate: date(f!),
      toDate: date(t!),
      label: label!,
    })),
  });
  await prisma.period.createMany({ data: DEFAULT_PERIODS.map((p) => ({ tenantId, ...p })) });

  const subjectId = new Map<string, string>();
  for (const s of SUBJECTS) subjectId.set(s.code, id());
  await prisma.subject.createMany({
    data: SUBJECTS.map((s) => ({ id: subjectId.get(s.code)!, tenantId, ...s })),
  });

  const rooms: { id: string; name: string; capacity: number; kind: string }[] = [
    ...CLASS_NAMES.map((n) => ({
      id: id(),
      name: `Klassenraum ${n}`,
      capacity: 26,
      kind: 'Klassenraum',
    })),
    { id: id(), name: 'Turnsaal', capacity: 60, kind: 'Sport' },
    { id: id(), name: 'Musiksaal', capacity: 30, kind: 'Fachraum' },
    { id: id(), name: 'EDV-Raum', capacity: 26, kind: 'Fachraum' },
    { id: id(), name: 'Physiksaal', capacity: 28, kind: 'Fachraum' },
  ];
  await prisma.room.createMany({ data: rooms.map((r) => ({ tenantId, ...r })) });
  const roomByName = new Map(rooms.map((r) => [r.name, r.id]));

  // Personen
  type P = {
    id: string;
    kind: 'STUDENT' | 'TEACHER' | 'GUARDIAN' | 'STAFF';
    firstName: string;
    lastName: string;
  };
  const people: P[] = [];
  const usedNames = new Set<string>();
  const person = (kind: P['kind'], lastName?: string): P => {
    for (;;) {
      const firstName = pick(FIRST);
      const ln = lastName ?? pick(LAST);
      const key = `${kind}|${firstName}|${ln}`;
      if (usedNames.has(key)) continue;
      usedNames.add(key);
      const p = { id: id(), kind, firstName, lastName: ln };
      people.push(p);
      return p;
    }
  };

  const teachers = Array.from({ length: 16 }, () => person('TEACHER'));
  const principal = person('STAFF');
  const admin = person('STAFF');

  // Lehrerzuordnung je Fach: 16 Lehrkräfte, jedes Fach hat 1 bis 2 Lehrkräfte (rotierend)
  const teacherBySubject = new Map<string, P[]>();
  SUBJECTS.forEach((s, i) =>
    teacherBySubject.set(s.code, [
      teachers[i % teachers.length]!,
      teachers[(i + 12) % teachers.length]!,
    ]),
  );

  // Klassen, Schüler, Eltern
  const classes = CLASS_NAMES.map((name, i) => ({
    id: id(),
    name,
    grade: Number(name[0]),
    homeroom: teachers[i]!,
  }));
  const studentsByClass = new Map<string, P[]>();
  const guardianLinks: { guardian: P; student: P }[] = [];
  for (const c of classes) {
    const students: P[] = [];
    for (let i = 0; i < 14; i++) {
      const s = person('STUDENT');
      students.push(s);
      const g = person('GUARDIAN', s.lastName);
      guardianLinks.push({ guardian: g, student: s });
    }
    studentsByClass.set(c.id, students);
  }

  await prisma.person.createMany({
    data: people.map((p) => ({
      id: p.id,
      tenantId,
      kind: p.kind,
      firstName: p.firstName,
      lastName: p.lastName,
      externalId: p.kind === 'STUDENT' ? `S${1000 + people.indexOf(p)}` : null,
    })),
  });
  await prisma.schoolClass.createMany({
    data: classes.map((c) => ({
      id: c.id,
      tenantId,
      schoolYearId,
      name: c.name,
      homeroomTeacherId: c.homeroom.id,
    })),
  });
  await prisma.enrollment.createMany({
    data: classes.flatMap((c) =>
      studentsByClass
        .get(c.id)!
        .map((s) => ({ tenantId, studentId: s.id, classId: c.id, fromDate: date('2026-09-07') })),
    ),
  });
  await prisma.guardianLink.createMany({
    data: guardianLinks.map((l) => ({
      tenantId,
      guardianId: l.guardian.id,
      studentId: l.student.id,
      validFrom: date('2026-09-07'),
    })),
  });

  // Benutzerkonten: Lehrkräfte, Direktion, Administration, dazu Schüler und Eltern der Klasse 3A
  const slug = (s: string) =>
    s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
  const email = (p: P, i: number) =>
    `${slug(p.firstName)}.${slug(p.lastName)}${i}@demo.schule.test`;
  const class3A = classes.find((c) => c.name === '3A')!;
  const userPeople: P[] = [
    ...teachers,
    principal,
    admin,
    ...studentsByClass.get(class3A.id)!,
    ...guardianLinks
      .filter((l) => studentsByClass.get(class3A.id)!.includes(l.student))
      .map((l) => l.guardian),
  ];
  await prisma.user.createMany({
    data: userPeople.map((p, i) => ({
      tenantId,
      personId: p.id,
      email: email(p, i),
      passwordHash,
    })),
  });
  const roleRows: {
    personId: string;
    role: 'TEACHER' | 'HOMEROOM' | 'PRINCIPAL' | 'ADMIN' | 'STUDENT' | 'GUARDIAN';
    classId?: string;
  }[] = [
    ...teachers.map((t) => ({ personId: t.id, role: 'TEACHER' as const })),
    ...classes.map((c) => ({ personId: c.homeroom.id, role: 'HOMEROOM' as const, classId: c.id })),
    { personId: principal.id, role: 'PRINCIPAL' },
    { personId: admin.id, role: 'ADMIN' },
    ...people
      .filter((p) => p.kind === 'STUDENT')
      .map((p) => ({ personId: p.id, role: 'STUDENT' as const })),
    ...people
      .filter((p) => p.kind === 'GUARDIAN')
      .map((p) => ({ personId: p.id, role: 'GUARDIAN' as const })),
  ];
  await prisma.roleAssignment.createMany({ data: roleRows.map((r) => ({ tenantId, ...r })) });

  // Stundenplan: gierige, konfliktfreie Verteilung
  const versionId = id();
  await prisma.timetableVersion.create({
    data: {
      id: versionId,
      tenantId,
      schoolYearId,
      status: 'PUBLISHED',
      validFrom: date('2026-09-07'),
      publishedAt: new Date('2026-08-31T08:00:00Z'),
      publishedById: admin.id,
    },
  });
  const busy = { teacher: new Set<string>(), room: new Set<string>(), cls: new Set<string>() };
  const slotKey = (who: string, wd: number, p: number) => `${who}|${wd}|${p}`;
  const lessons: Prisma.LessonCreateManyInput[] = [];
  const lessonTeachers: Prisma.LessonTeacherCreateManyInput[] = [];
  const requirements: Prisma.LessonRequirementCreateManyInput[] = [];
  const perDaySubject = new Set<string>();

  for (const c of classes) {
    const homeRoom = roomByName.get(`Klassenraum ${c.name}`)!;
    // Fächer mit Fachraum zuerst, sie sind der knappste Engpass
    const ordered = [...SUBJECTS].sort(
      (a, b) => Number(!!SPECIAL_ROOM[b.code]) - Number(!!SPECIAL_ROOM[a.code]),
    );
    for (const subj of ordered) {
      const hours = HOURS[subj.code]![c.grade - 1]!;
      if (!hours) continue;
      const list = teacherBySubject.get(subj.code)!;
      const teacher = list[c.grade % list.length]!;
      requirements.push({
        tenantId,
        versionId,
        subjectId: subjectId.get(subj.code)!,
        classId: c.id,
        teacherId: teacher.id,
        hoursPerWeek: hours,
        preferDouble: false,
      });
      const room = SPECIAL_ROOM[subj.code] ? roomByName.get(SPECIAL_ROOM[subj.code]!)! : homeRoom;
      for (let h = 0; h < hours; h++) {
        let placed = false;
        for (let attempt = 0; attempt < 2 && !placed; attempt++) {
          // Durchlauf 0: kompakt (ohne Hohlstunden, bis Stunde 6); Durchlauf 1: bis Stunde 8, Hohlstunden erlaubt
          for (let p = 1; p <= (attempt === 0 ? 6 : 8) && !placed; p++) {
            for (let wd = 1; wd <= 5 && !placed; wd++) {
              const dayKey = `${c.id}|${subj.code}|${wd}`;
              if (attempt === 0 && perDaySubject.has(dayKey)) continue; // erst auf verschiedene Tage verteilen
              if (
                busy.cls.has(slotKey(c.id, wd, p)) ||
                busy.teacher.has(slotKey(teacher.id, wd, p)) ||
                busy.room.has(slotKey(room, wd, p))
              )
                continue;
              // keine Hohlstunden: Stunde p nur belegen, wenn p = 1 oder p-1 belegt ist
              if (attempt === 0 && p > 1 && !busy.cls.has(slotKey(c.id, wd, p - 1))) continue;
              const lessonId = id();
              lessons.push({
                id: lessonId,
                tenantId,
                versionId,
                subjectId: subjectId.get(subj.code)!,
                classId: c.id,
                roomId: room,
                weekday: wd,
                periodStart: p,
                periodCount: 1,
                weekPattern: 'EVERY',
              });
              lessonTeachers.push({ tenantId, lessonId, teacherId: teacher.id });
              busy.cls.add(slotKey(c.id, wd, p));
              busy.teacher.add(slotKey(teacher.id, wd, p));
              busy.room.add(slotKey(room, wd, p));
              perDaySubject.add(dayKey);
              placed = true;
            }
          }
        }
        if (!placed)
          throw new Error(`Seed: ${c.name} ${subj.code} Stunde ${h + 1} nicht einplanbar`);
      }
    }
  }
  await prisma.lessonRequirement.createMany({ data: requirements });
  await prisma.lesson.createMany({ data: lessons });
  await prisma.lessonTeacher.createMany({ data: lessonTeachers });

  // Lehrkräfte: Fächer (Lehrbefähigung) und Stundenausmaß. Unterricht = Soll aus der Lehrfächerverteilung,
  // Beschäftigungsausmaß mit vier Stunden für Tätigkeiten außerhalb des Unterrichts.
  await prisma.teacherSubject.createMany({
    data: [...teacherBySubject].flatMap(([code, list]) =>
      [...new Set(list)].map((t) => ({
        tenantId,
        teacherId: t.id,
        subjectId: subjectId.get(code)!,
      })),
    ),
  });
  for (const t of teachers) {
    const hours = requirements
      .filter((r) => r.teacherId === t.id)
      .reduce((sum, r) => sum + r.hoursPerWeek, 0);
    await prisma.person.update({
      where: { id: t.id },
      data: { teachingHours: hours, employmentHours: hours + 4 },
    });
  }

  // Noten der 3A (PN-02): je Fach eine freigegebene Leistung, in Mathematik dazu ein Test vor der Freigabe.
  // Eigener Zufallsgenerator, damit die übrigen Demodaten unverändert bleiben.
  const gradeRand = mulberry32(7);
  const gradeOf = () => {
    const r = gradeRand();
    return r < 0.15 ? 1 : r < 0.45 ? 2 : r < 0.75 ? 3 : r < 0.93 ? 4 : 5;
  };
  const grades3A = requirements.filter((r) => r.classId === class3A.id);
  for (const r of grades3A) {
    const code = SUBJECTS.find((x) => subjectId.get(x.code) === r.subjectId)!.code;
    const written = ['M', 'D', 'E'].includes(code);
    const items = [
      {
        kind: written ? ('SCHULARBEIT' as const) : ('TEST' as const),
        title: written ? '1. Schularbeit' : '1. Test',
        date: '2026-10-01',
        released: true,
      },
      ...(code === 'M'
        ? [
            {
              kind: 'TEST' as const,
              title: 'Test Bruchrechnen',
              date: '2026-10-09',
              released: false,
            },
          ]
        : []),
    ];
    for (const a of items) {
      const assessmentId = id();
      await prisma.assessment.create({
        data: {
          id: assessmentId,
          tenantId,
          schoolYearId,
          courseKey: `${class3A.id}:${r.subjectId}`,
          subjectId: r.subjectId,
          classId: class3A.id,
          kind: a.kind,
          title: a.title,
          date: date(a.date),
          releasedAt: a.released ? date(a.date) : null,
          createdById: r.teacherId,
        },
      });
      await prisma.grade.createMany({
        data: studentsByClass.get(class3A.id)!.map((st) => ({
          tenantId,
          assessmentId,
          studentId: st.id,
          value: gradeOf(),
          updatedById: r.teacherId,
        })),
      });
    }
  }

  // Termine für das gleitende Fenster (heute bis heute + 28 Tage), wie es der Job generate-occurrences täte
  const freeDays = await prisma.schoolFreeDay.findMany({ where: { tenantId } });
  const today = DateTime.now().setZone('Europe/Vienna').toISODate()!;
  const rules = lessons.map((l) => ({
    id: l.id!,
    weekday: l.weekday,
    periodStart: l.periodStart,
    periodCount: l.periodCount ?? 1,
    weekPattern: l.weekPattern ?? ('EVERY' as const),
    subjectId: l.subjectId,
    classId: l.classId ?? null,
    groupId: null,
    roomId: l.roomId ?? null,
    teacherIds: lessonTeachers.filter((t) => t.lessonId === l.id).map((t) => t.teacherId),
  }));
  const occurrences: Prisma.OccurrenceCreateManyInput[] = [];
  const occurrenceTeachers: Prisma.OccurrenceTeacherCreateManyInput[] = [];
  for (
    let d = today < '2026-09-07' ? '2026-09-07' : today;
    d <= addDays(today, 28);
    d = addDays(d, 1)
  ) {
    for (const o of planDay(d, {
      lessons: rules,
      periods: [...DEFAULT_PERIODS],
      freeDays: freeDays.map((f) => ({
        fromDate: f.fromDate.toISOString().slice(0, 10),
        toDate: f.toDate.toISOString().slice(0, 10),
      })),
      referenceMonday: '2026-09-07',
      timezone: 'Europe/Vienna',
    })) {
      const occId = id();
      occurrences.push({
        id: occId,
        tenantId,
        lessonId: o.lessonId,
        date: date(o.date),
        periodStart: o.periodStart,
        periodCount: o.periodCount,
        startsAt: o.startsAt,
        endsAt: o.endsAt,
        subjectId: o.subjectId,
        classId: o.classId,
        roomId: o.roomId,
      });
      occurrenceTeachers.push(
        ...o.teacherIds.map((teacherId) => ({ tenantId, occurrenceId: occId, teacherId })),
      );
    }
  }
  await prisma.occurrence.createMany({ data: occurrences });
  await prisma.occurrenceTeacher.createMany({ data: occurrenceTeachers });

  console.log(
    `Demoschule angelegt: ${people.length} Personen, ${userPeople.length} Konten, ${lessons.length} Unterrichtseinheiten, ${occurrences.length} Termine.`,
  );
  const kv = await seedClassbookDemo(prisma, tenantId);
  await seedAbsencesDemo(prisma, tenantId);
  await seedMessagesDemo(prisma, tenantId);
  console.log(`Login (lokal): z. B. ${email(admin, userPeople.indexOf(admin))} / ${DEMO_PASSWORD}`);
  if (kv) console.log(`Klassenvorstand 3A (Klassenbuch): ${kv} / ${DEMO_PASSWORD}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
