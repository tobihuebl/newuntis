import { describe, expect, it } from 'vitest';
import type { OccurrenceDetail } from '@sp/shared';
import {
  applyPending,
  mergeServer,
  planEnqueue,
  rebaseAfter,
  statusOf,
  type OutboxItem,
} from './mutations';

let n = 0;
const id = () => `m${n++}`;
const now = new Date('2026-10-12T08:10:00Z');

const detail = (over: Partial<OccurrenceDetail> = {}): OccurrenceDetail => ({
  id: 'o1',
  date: '2026-10-12',
  periodStart: 1,
  periodCount: 1,
  startsAt: '2026-10-12T06:00:00Z',
  endsAt: '2026-10-12T06:50:00Z',
  status: 'SCHEDULED',
  subject: { id: 's', name: 'Mathematik', code: 'M', color: null },
  class: { id: 'c', name: '2A' },
  group: null,
  room: null,
  teachers: [],
  substitution: null,
  students: [
    { id: 'a', firstName: 'Anna', lastName: 'A' },
    { id: 'b', firstName: 'Ben', lastName: 'B' },
  ],
  attendance: {},
  entry: null,
  canWrite: true,
  canClose: true,
  ...over,
});

/** Outbox wie in IndexedDB: Pläne anwenden und laufende Nummern vergeben. */
function apply(outbox: OutboxItem[], plan: ReturnType<typeof planEnqueue>): OutboxItem[] {
  let next = outbox;
  if (plan.replace) next = next.map((o) => (o.seq === plan.replace!.seq ? plan.replace! : o));
  if (plan.add) next = [...next, { ...plan.add, seq: (next.at(-1)?.seq ?? 0) + 1 }];
  return next;
}

describe('Outbox', () => {
  it('fasst noch nie gesendete Anwesenheit desselben Kindes zusammen, gesendete nicht', () => {
    let box: OutboxItem[] = [];
    const tap = (status: 'ABSENT' | 'PRESENT') =>
      (box = apply(
        box,
        planEnqueue(
          box,
          { kind: 'attendance', occurrenceId: 'o1', studentId: 'a', status, lateMinutes: null },
          0,
          id,
          now,
        ),
      ));
    tap('ABSENT');
    tap('PRESENT');
    expect(box).toHaveLength(1);
    expect(box[0]).toMatchObject({ status: 'PRESENT', seq: 1 });
    box = box.map((o) => ({ ...o, attempts: 1 })); // Antwort verloren gegangen
    tap('ABSENT');
    expect(box).toHaveLength(2);
  });

  it('Eintrag: Nachfolger erben die Basisversion und werden nach Erfolg nachgezogen', () => {
    let box: OutboxItem[] = [];
    const type = (topic: string) =>
      (box = apply(
        box,
        planEnqueue(
          box,
          { kind: 'entry', occurrenceId: 'o1', topic, homework: null, homeworkDueOn: null },
          3,
          id,
          now,
        ),
      ));
    type('Br');
    type('Brüche');
    expect(box).toHaveLength(1);
    expect(box[0]).toMatchObject({ topic: 'Brüche', baseVersion: 3 });
    box = box.map((o) => ({ ...o, state: 'sending', attempts: 1 }));
    type('Brüche kürzen');
    expect(box).toHaveLength(2);
    expect(box[1]).toMatchObject({ baseVersion: 3 });
    const sent = box[0] as Extract<OutboxItem, { kind: 'entry' }>;
    const rebased = rebaseAfter(box, sent, 4);
    expect(rebased).toHaveLength(1);
    expect(rebased[0]).toMatchObject({ topic: 'Brüche kürzen', baseVersion: 4 });
  });

  it('Abschließen wird nur einmal vorgemerkt', () => {
    let box: OutboxItem[] = [];
    for (let i = 0; i < 2; i++)
      box = apply(box, planEnqueue(box, { kind: 'close', occurrenceId: 'o1' }, 0, id, now));
    expect(box).toHaveLength(1);
  });
});

describe('Optimistische Anzeige', () => {
  it('eigene Änderungen liegen über dem Serverstand; fehlgeschlagene nicht', () => {
    const d = detail({
      attendance: {
        a: { status: 'ABSENT', lateMinutes: null, clientUpdatedAt: '2026-10-12T08:00:00Z' },
      },
    });
    const box: OutboxItem[] = [
      {
        kind: 'attendance',
        occurrenceId: 'o1',
        studentId: 'a',
        status: 'LATE',
        lateMinutes: 5,
        clientMutationId: 'x',
        clientUpdatedAt: '2026-10-12T08:05:00Z',
        state: 'pending',
        attempts: 0,
        createdAt: 0,
        seq: 1,
      },
      {
        kind: 'entry',
        occurrenceId: 'o1',
        baseVersion: 0,
        topic: 'Brüche',
        homework: null,
        homeworkDueOn: null,
        clientMutationId: 'y',
        state: 'failed',
        attempts: 1,
        createdAt: 0,
        seq: 2,
      },
    ];
    const v = applyPending(d, box);
    expect(v.attendance.a).toMatchObject({ status: 'LATE', lateMinutes: 5 });
    expect(v.entry).toBeNull();
    expect(statusOf(v, 'b')).toBe('PRESENT');
  });

  it('ältere lokale Anwesenheit verdrängt keine neuere vom Server', () => {
    const d = detail({
      attendance: {
        a: { status: 'ABSENT', lateMinutes: null, clientUpdatedAt: '2026-10-12T08:09:00Z' },
      },
    });
    const v = applyPending(d, [
      {
        kind: 'attendance',
        occurrenceId: 'o1',
        studentId: 'a',
        status: 'PRESENT',
        lateMinutes: null,
        clientMutationId: 'x',
        clientUpdatedAt: '2026-10-12T08:01:00Z',
        state: 'pending',
        attempts: 0,
        createdAt: 0,
        seq: 1,
      },
    ]);
    expect(v.attendance.a!.status).toBe('ABSENT');
  });

  it('vorgemerktes Abschließen zeigt alle als anwesend und den Abschluss', () => {
    const v = applyPending(detail(), [
      {
        kind: 'close',
        occurrenceId: 'o1',
        clientMutationId: 'z',
        closedAt: '2026-10-12T08:10:00Z',
        state: 'pending',
        attempts: 0,
        createdAt: 0,
        seq: 1,
      },
    ]);
    expect(v.entry?.closedAt).toBe('2026-10-12T08:10:00Z');
    expect(Object.keys(v.attendance)).toEqual(['a', 'b']);
  });

  it('Serverantwort wird in den Zwischenspeicher übernommen', () => {
    const m = mergeServer(detail(), {
      entry: { topic: 'T', homework: null, homeworkDueOn: null, closedAt: null, version: 2 },
    });
    expect(m.entry?.version).toBe(2);
  });
});

describe('Notiz und Vermerke (KB-07)', () => {
  it('Vermerke werden nie zusammengefasst und erscheinen sofort als eigene, noch nicht gesendete', () => {
    let box: OutboxItem[] = [];
    for (const text of ['Handy', 'Hilfsbereit'])
      box = apply(
        box,
        planEnqueue(box, { kind: 'remark', occurrenceId: 'o1', studentId: 'a', text }, 0, id, now),
      );
    expect(box).toHaveLength(2);
    const shown = applyPending(detail({ notesVisible: true, remarks: [] }), box);
    expect(shown.remarks?.map((r) => [r.text, r.own, r.id.startsWith('pending-')])).toEqual([
      ['Handy', true, true],
      ['Hilfsbereit', true, true],
    ]);
    // Ohne Sichtbarkeit (z. B. Administration) bleibt die Liste weg
    expect(applyPending(detail(), box).remarks).toBeUndefined();
  });

  it('bestätigter Vermerk ersetzt keinen anderen; Notiz fehlt in alten Einträgen und bleibt dann erhalten', () => {
    const remark = { id: 'r1', studentId: 'a', text: 'x', createdAt: '', author: 'L', own: true };
    const merged = mergeServer(detail({ remarks: [] }), { remark });
    expect(mergeServer(merged, { remark }).remarks).toEqual([remark]);

    const withNote = detail({
      entry: {
        topic: null,
        homework: null,
        homeworkDueOn: null,
        note: 'unruhig',
        closedAt: null,
        version: 1,
      },
    });
    const old: OutboxItem = {
      kind: 'entry',
      occurrenceId: 'o1',
      baseVersion: 1,
      topic: 'Brüche',
      homework: null,
      homeworkDueOn: null,
      clientMutationId: 'c1',
      state: 'pending',
      attempts: 0,
      createdAt: 0,
      seq: 1,
    };
    expect(applyPending(withNote, [old]).entry?.note).toBe('unruhig');
    expect(applyPending(withNote, [{ ...old, note: null }]).entry?.note).toBeNull();
  });
});
