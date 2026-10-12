/**
 * Reine Logik der Offline-Outbox (Spec Abschnitt 12), ohne Browser-APIs und daher direkt testbar:
 * Änderungen zusammenfassen, optimistisch auf den Serverstand anwenden und Versionen nachziehen.
 */
import type { AttendanceStatusName, ClassbookEntryState, OccurrenceDetail } from '@sp/shared';

export type Mutation =
  | {
      kind: 'attendance';
      occurrenceId: string;
      studentId: string;
      status: AttendanceStatusName;
      lateMinutes: number | null;
      clientMutationId: string;
      clientUpdatedAt: string;
    }
  | {
      kind: 'entry';
      occurrenceId: string;
      /** Serverversion, auf der die Änderung beruht (wird nach eigenen erfolgreichen Änderungen nachgezogen). */
      baseVersion: number;
      topic: string | null;
      homework: string | null;
      homeworkDueOn: string | null;
      clientMutationId: string;
    }
  | { kind: 'close'; occurrenceId: string; clientMutationId: string; closedAt: string };

export type OutboxState = 'pending' | 'sending' | 'conflict' | 'failed';

export type OutboxItem = Mutation & {
  seq?: number;
  state: OutboxState;
  /** Wie oft gesendet: nie gesendete Einträge dürfen noch zusammengefasst werden. */
  attempts: number;
  createdAt: number;
  error?: string;
  /** Bei 409: der aktuelle Stand auf dem Server. */
  conflict?: ClassbookEntryState | null;
};

export type NewMutation =
  | Omit<Extract<Mutation, { kind: 'attendance' }>, 'clientMutationId' | 'clientUpdatedAt'>
  | Omit<Extract<Mutation, { kind: 'entry' }>, 'clientMutationId' | 'baseVersion'>
  | Omit<Extract<Mutation, { kind: 'close' }>, 'clientMutationId' | 'closedAt'>;

export interface EnqueuePlan {
  /** Bestehenden, noch nie gesendeten Eintrag ersetzen (gleiche seq). */
  replace?: OutboxItem & { seq: number };
  add?: OutboxItem;
}

/**
 * Wie eine neue Änderung in die Outbox kommt: Anwesenheit und Eintrag eines Termins werden mit einem noch nie
 * gesendeten Vorgänger zusammengefasst; sonst wird angehängt. `serverVersion` ist die bekannte Version des Eintrags.
 */
export function planEnqueue(
  outbox: OutboxItem[],
  m: NewMutation,
  serverVersion: number,
  newId: () => string,
  now: Date,
): EnqueuePlan {
  const base = { state: 'pending' as const, attempts: 0, createdAt: now.getTime() };
  if (m.kind === 'attendance') {
    const item: OutboxItem = {
      ...m,
      ...base,
      clientMutationId: newId(),
      clientUpdatedAt: now.toISOString(),
    };
    const prev = outbox.find(
      (o) =>
        o.kind === 'attendance' &&
        o.occurrenceId === m.occurrenceId &&
        o.studentId === m.studentId &&
        o.state === 'pending' &&
        o.attempts === 0 &&
        o.seq !== undefined,
    );
    return prev ? { replace: { ...item, seq: prev.seq! } } : { add: item };
  }
  if (m.kind === 'entry') {
    const chain = outbox.filter(
      (o): o is Extract<OutboxItem, { kind: 'entry' }> =>
        o.kind === 'entry' && o.occurrenceId === m.occurrenceId && o.state !== 'conflict',
    );
    const last = chain[chain.length - 1];
    if (last && last.state === 'pending' && last.attempts === 0 && last.seq !== undefined)
      return { replace: { ...last, ...m, ...base, seq: last.seq } };
    return {
      add: {
        ...m,
        ...base,
        baseVersion: last ? last.baseVersion : serverVersion,
        clientMutationId: newId(),
      },
    };
  }
  if (outbox.some((o) => o.kind === 'close' && o.occurrenceId === m.occurrenceId)) return {};
  return { add: { ...m, ...base, clientMutationId: newId(), closedAt: now.toISOString() } };
}

/**
 * Nach einer erfolgreichen eigenen Änderung des Eintrags: Nachfolger, die auf derselben Version aufgebaut haben,
 * beruhen nun auf der neuen Version (sonst meldete der Server einen Konflikt mit sich selbst).
 */
export function rebaseAfter(
  outbox: OutboxItem[],
  sent: Extract<Mutation, { kind: 'entry' }>,
  newVersion: number,
): (OutboxItem & { seq: number })[] {
  return outbox
    .filter(
      (o): o is Extract<OutboxItem, { kind: 'entry' }> & { seq: number } =>
        o.kind === 'entry' &&
        o.occurrenceId === sent.occurrenceId &&
        o.clientMutationId !== sent.clientMutationId &&
        o.baseVersion === sent.baseVersion &&
        o.seq !== undefined,
    )
    .map((o) => ({ ...o, baseVersion: newVersion }));
}

/** Serverstand plus noch nicht bestätigte eigene Änderungen (optimistische Anzeige). */
export function applyPending(detail: OccurrenceDetail, outbox: OutboxItem[]): OccurrenceDetail {
  const mine = outbox
    .filter((o) => o.occurrenceId === detail.id)
    .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  if (mine.length === 0) return detail;
  const attendance = { ...detail.attendance };
  let entry = detail.entry;
  for (const o of mine) {
    if (o.state === 'failed') continue;
    if (o.kind === 'attendance') {
      const prev = attendance[o.studentId];
      if (prev?.clientUpdatedAt && prev.clientUpdatedAt > o.clientUpdatedAt) continue;
      attendance[o.studentId] = {
        status: o.status,
        lateMinutes: o.lateMinutes,
        clientUpdatedAt: o.clientUpdatedAt,
      };
    } else if (o.kind === 'entry') {
      entry = {
        topic: o.topic,
        homework: o.homework,
        homeworkDueOn: o.homeworkDueOn,
        closedAt: entry?.closedAt ?? null,
        version: entry?.version ?? 0,
      };
    } else {
      for (const s of detail.students)
        attendance[s.id] ??= { status: 'PRESENT', lateMinutes: null, clientUpdatedAt: null };
      entry = {
        topic: entry?.topic ?? null,
        homework: entry?.homework ?? null,
        homeworkDueOn: entry?.homeworkDueOn ?? null,
        version: entry?.version ?? 0,
        closedAt: entry?.closedAt ?? o.closedAt,
      };
    }
  }
  return { ...detail, attendance, entry };
}

/** Bestätigten Serverstand in den Zwischenspeicher übernehmen. */
export function mergeServer(
  detail: OccurrenceDetail,
  patch: {
    entry?: ClassbookEntryState;
    attendance?: OccurrenceDetail['attendance'];
  },
): OccurrenceDetail {
  return {
    ...detail,
    ...(patch.entry ? { entry: patch.entry } : {}),
    ...(patch.attendance ? { attendance: { ...detail.attendance, ...patch.attendance } } : {}),
  };
}

/** Anwesenheit eines Kindes, Standard ist "anwesend" (KB-02). */
export const statusOf = (detail: OccurrenceDetail, studentId: string): AttendanceStatusName =>
  detail.attendance[studentId]?.status ?? 'PRESENT';
