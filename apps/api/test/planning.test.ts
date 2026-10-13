import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { addDays, type PlanningRunItem } from '@sp/shared';
import { Harness, type Client } from './support/harness';

const today = DateTime.now().setZone('Europe/Vienna').toISODate()!;

/** Stundenplan-Assistent (M7, ADR 0012): Freischaltung, Wünsche, Übersetzen, Läufe, Teilplanung, Soll/Ist. */
describe('Stundenplan-Assistent', () => {
  let h: Harness;
  let admin: Client;
  let tenantId = '';
  let slug = '';
  let version = '';
  const ids = {} as Record<'year' | 'm' | 'd' | 'bsp' | 'ts' | 'c1' | 'c2' | 'hu' | 'gr', string>;

  const enable = (on: boolean) =>
    h.owner.tenant.update({
      where: { id: tenantId },
      data: { settings: { features: { autoPlanning: on } } },
    });

  beforeAll(async () => {
    h = await Harness.create();
    const t = await h.tenantWithAdmin('pl');
    admin = t.admin;
    tenantId = t.tenant.id;
    slug = t.tenant.slug;
    ids.year = (
      await admin.post('/admin/school-years', {
        name: 'SJ',
        startsOn: addDays(today, -30),
        endsOn: addDays(today, 300),
        isCurrent: true,
      })
    ).json.id;
    await admin.post('/admin/periods/default-template');
    ids.m = (await admin.post('/admin/subjects', { name: 'Mathematik', code: 'M' })).json.id;
    ids.d = (await admin.post('/admin/subjects', { name: 'Deutsch', code: 'D' })).json.id;
    ids.bsp = (
      await admin.post('/admin/subjects', { name: 'Bewegung und Sport', code: 'BSP' })
    ).json.id;
    ids.ts = (await admin.post('/admin/rooms', { name: 'Turnsaal' })).json.id;
    ids.c1 = (await admin.post('/admin/classes', { schoolYearId: ids.year, name: '1A' })).json.id;
    ids.c2 = (await admin.post('/admin/classes', { schoolYearId: ids.year, name: '1B' })).json.id;
    ids.hu = (
      await admin.post('/admin/persons', { kind: 'TEACHER', firstName: 'Anna', lastName: 'Huber' })
    ).json.id;
    ids.gr = (
      await admin.post('/admin/persons', { kind: 'TEACHER', firstName: 'Paul', lastName: 'Gruber' })
    ).json.id;
    version = (
      await admin.post('/admin/timetable-versions', {
        schoolYearId: ids.year,
        name: 'Lehrfächerverteilung',
      })
    ).json.id;
    for (const c of [ids.c1, ids.c2]) {
      await admin.post(`/admin/timetable-versions/${version}/requirements`, {
        subjectId: ids.m,
        classId: c,
        teacherId: ids.hu,
        hoursPerWeek: 4,
      });
      await admin.post(`/admin/timetable-versions/${version}/requirements`, {
        subjectId: ids.d,
        classId: c,
        teacherId: ids.gr,
        hoursPerWeek: 4,
      });
      await admin.post(`/admin/timetable-versions/${version}/requirements`, {
        subjectId: ids.bsp,
        classId: c,
        teacherId: ids.gr,
        hoursPerWeek: 2,
        preferDouble: true,
      });
    }
  });
  afterAll(async () => h.close());

  it('ohne Freischaltung: verständliche 403, Status meldet aus', async () => {
    expect((await admin.get('/admin/planning/status')).json).toEqual({ enabled: false, ai: false });
    const r = await admin.get(`/admin/planning/constraints?schoolYearId=${ids.year}`);
    expect(r.status).toBe(403);
    expect(r.json.title).toContain('nicht freigeschaltet');
  });

  it('Rechte: nur die Administration (timetable.edit)', async () => {
    await enable(true);
    for (const role of ['PRINCIPAL', 'TEACHER'] as const) {
      const u = await h.createUser(
        tenantId,
        [{ role }],
        undefined,
        role === 'PRINCIPAL' ? 'STAFF' : 'TEACHER',
      );
      const c = (await h.loginFully(slug, u.email)).client;
      expect((await c.post('/admin/planning/runs', { sourceVersionId: version })).status).toBe(403);
    }
  });

  it('Wünsche in Worten werden zu prüfbaren Vorschlägen; gespeichert erst nach Bestätigung', async () => {
    const tr = await admin.post('/admin/planning/translate', {
      schoolYearId: ids.year,
      text: 'Frau Huber hat freitags frei. Turnen nur im Turnsaal; Die Bibliothek ist zu',
    });
    expect(tr.status).toBe(200);
    expect(tr.json.engine).toBe('rules');
    expect(tr.json.unresolved).toEqual(['Die Bibliothek ist zu']);
    expect(tr.json.proposals.map((p: { summary: string }) => p.summary)).toEqual([
      'Anna Huber: Freitag nicht verfügbar',
      'Bewegung und Sport: nur in Turnsaal',
    ]);
    expect(
      (await admin.get(`/admin/planning/constraints?schoolYearId=${ids.year}`)).json.data,
    ).toEqual([]);
    const saved = await admin.post('/admin/planning/constraints', {
      schoolYearId: ids.year,
      constraints: tr.json.proposals.map((p: { constraint: unknown }) => p.constraint),
    });
    expect(saved.status).toBe(201);
    expect(saved.json.data).toHaveLength(2);
    expect(saved.json.data[0]).toMatchObject({
      source: 'TEXT',
      text: 'Frau Huber hat freitags frei',
    });
  });

  it('ungültige Wünsche werden abgelehnt (Schema und Stammdaten)', async () => {
    const bad = await admin.post('/admin/planning/constraints', {
      schoolYearId: ids.year,
      constraints: [{ kind: 'TEACHER_UNAVAILABLE', teacherId: ids.hu }],
    });
    expect(bad.status).toBe(400);
    const unknown = await admin.post('/admin/planning/constraints', {
      schoolYearId: ids.year,
      constraints: [{ kind: 'TEACHER_UNAVAILABLE', teacherId: 'gibt-es-nicht', weekday: 1 }],
    });
    expect(unknown.status).toBe(400);
  });

  let first: PlanningRunItem;
  it('Lauf erzeugt einen neuen Entwurf ohne harte Konflikte, hält Wünsche ein und ist reproduzierbar', async () => {
    const r = await admin.post('/admin/planning/runs', { sourceVersionId: version, seed: 42 });
    expect(r.status).toBe(201);
    first = r.json as PlanningRunItem;
    expect(first.status).toBe('DONE');
    expect(first.stats).toMatchObject({ hard: 0, required: 20, planned: 20 });
    expect(first.unplaced).toEqual([]);
    const v = await admin.get(`/admin/timetable-versions/${first.resultVersionId}`);
    expect(v.json.version.status).toBe('DRAFT');
    const lessons = v.json.lessons as {
      weekday: number;
      teacherIds: string[];
      subjectId: string;
      roomId: string | null;
    }[];
    expect(lessons.filter((l) => l.teacherIds.includes(ids.hu) && l.weekday === 5)).toEqual([]);
    expect(lessons.filter((l) => l.subjectId === ids.bsp).every((l) => l.roomId === ids.ts)).toBe(
      true,
    );
    expect(v.json.coverage.every((c: { diff: number }) => c.diff === 0)).toBe(true);
    // gleicher Startwert, gleicher Plan
    const again = (await admin.post('/admin/planning/runs', { sourceVersionId: version, seed: 42 }))
      .json as PlanningRunItem;
    const w = await admin.get(`/admin/timetable-versions/${again.resultVersionId}`);
    const slots = (x: typeof lessons) =>
      x.map((l) => JSON.stringify(l, ['weekday', 'periodStart', 'subjectId', 'classId'])).sort();
    expect(slots(w.json.lessons)).toEqual(slots(lessons));
  });

  it('Teilplanung: festgepinnte Stunden bleiben, nur der Umfang wird neu geplant', async () => {
    const vid = first.resultVersionId!;
    const v = await admin.get(`/admin/timetable-versions/${vid}`);
    const keep = (
      v.json.lessons as { id: string; classId: string; weekday: number; periodStart: number }[]
    ).find((l) => l.classId === ids.c1)!;
    expect(
      (
        await admin.patch(`/admin/timetable-versions/${vid}/lessons/${keep.id}/pin`, {
          pinned: true,
        })
      ).status,
    ).toBe(200);
    const run = (
      await admin.post('/admin/planning/runs', {
        sourceVersionId: vid,
        scope: { kind: 'classes', ids: [ids.c1] },
        seed: 7,
      })
    ).json as PlanningRunItem;
    expect(run.status).toBe('DONE');
    expect(run.stats?.hard).toBe(0);
    const next = await admin.get(`/admin/timetable-versions/${run.resultVersionId}`);
    const lessons = next.json.lessons as {
      classId: string;
      weekday: number;
      periodStart: number;
      pinned: boolean;
    }[];
    expect(lessons.filter((l) => l.pinned)).toEqual([
      expect.objectContaining({
        classId: ids.c1,
        weekday: keep.weekday,
        periodStart: keep.periodStart,
      }),
    ]);
    // 1B blieb unverändert
    const before = (v.json.lessons as typeof lessons)
      .filter((l) => l.classId === ids.c2)
      .map((l) => `${l.weekday}-${l.periodStart}`)
      .sort();
    expect(
      lessons
        .filter((l) => l.classId === ids.c2)
        .map((l) => `${l.weekday}-${l.periodStart}`)
        .sort(),
    ).toEqual(before);
  });

  it('Veröffentlichen prüft Soll gegen Ist und verlangt bei Abweichung eine Bestätigung', async () => {
    const vid = first.resultVersionId!;
    const v = await admin.get(`/admin/timetable-versions/${vid}`);
    const one = (v.json.lessons as { id: string }[])[0]!;
    await admin.del(`/admin/timetable-versions/${vid}/lessons/${one.id}`);
    const validFrom = addDays(today, 1);
    const blocked = await admin.post(`/admin/timetable-versions/${vid}/publish`, { validFrom });
    expect(blocked.status).toBe(422);
    expect(blocked.json.code).toBe('COVERAGE');
    expect(blocked.json.coverage[0].diff).toBeLessThan(0);
    const ok = await admin.post(`/admin/timetable-versions/${vid}/publish`, {
      validFrom,
      acceptCoverage: true,
    });
    expect(ok.status).toBe(200);
  });

  it('Editor zeigt weiche Regeln und verletzte Wünsche als Warnung', async () => {
    const draft = (
      await admin.post('/admin/timetable-versions', { schoolYearId: ids.year, name: 'Hand' })
    ).json.id;
    await admin.post(`/admin/timetable-versions/${draft}/lessons`, {
      subjectId: ids.m,
      classId: ids.c1,
      weekday: 5,
      periodStart: 1,
      teacherIds: [ids.hu],
    });
    await admin.post(`/admin/timetable-versions/${draft}/lessons`, {
      subjectId: ids.d,
      classId: ids.c1,
      weekday: 5,
      periodStart: 4,
      teacherIds: [ids.gr],
    });
    const d = await admin.get(`/admin/timetable-versions/${draft}`);
    const codes = (d.json.conflicts as { code: string; severity: string }[])
      .map((c) => `${c.code}:${c.severity}`)
      .sort();
    expect(codes).toEqual(['GAP_STUDENT:soft', 'WISH_VIOLATED:soft']);
  });
});

describe('Lehrfächerverteilung per CSV', () => {
  it('Vorschau mit Fehlern, Übernehmen ersetzt die Soll-Stunden', async () => {
    const h = await Harness.create();
    try {
      const t = await h.tenantWithAdmin('lf');
      const admin = t.admin;
      const year = (
        await admin.post('/admin/school-years', {
          name: 'SJ',
          startsOn: addDays(today, -1),
          endsOn: addDays(today, 200),
          isCurrent: true,
        })
      ).json.id;
      await admin.post('/admin/subjects', { name: 'Mathematik', code: 'M' });
      await admin.post('/admin/classes', { schoolYearId: year, name: '1A' });
      await admin.post('/admin/persons', {
        kind: 'TEACHER',
        firstName: 'Anna',
        lastName: 'Huber',
        email: 'huber@schule.test',
      });
      const vid = (
        await admin.post('/admin/timetable-versions', { schoolYearId: year, name: 'LFV' })
      ).json.id;
      const bad = await admin.post(`/admin/timetable-versions/${vid}/requirements/import`, {
        csv: 'Klasse;Fach;Lehrkraft;Wochenstunden\n1A;M;huber@schule.test;4\n1Z;M;Huber;4',
        commit: true,
      });
      expect(bad.status).toBe(200);
      expect(bad.json).toMatchObject({ valid: 1, invalid: 1, committed: false });
      expect(bad.json.rows[1].errors).toEqual(['Klasse "1Z" unbekannt']);
      const ok = await admin.post(`/admin/timetable-versions/${vid}/requirements/import`, {
        csv: 'Klasse;Fach;Lehrkraft;Wochenstunden;Doppelstunde\n1A;M;huber@schule.test;4;ja',
        commit: true,
      });
      expect(ok.json).toMatchObject({ valid: 1, invalid: 0, committed: true });
      const v = await admin.get(`/admin/timetable-versions/${vid}`);
      expect(v.json.requirements).toEqual([
        expect.objectContaining({ hoursPerWeek: 4, preferDouble: true }),
      ]);
    } finally {
      await h.close();
    }
  });
});
