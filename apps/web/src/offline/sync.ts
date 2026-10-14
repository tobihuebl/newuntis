'use client';
import type { ClassbookEntryState, OccurrenceDetail, RemarkItem } from '@sp/shared';
import { ApiError, apiRequest } from '../lib/api-client';
import { db } from './db';
import {
  mergeServer,
  planEnqueue,
  rebaseAfter,
  type Mutation,
  type NewMutation,
  type OutboxItem,
} from './mutations';

export const occurrenceKey = (id: string) => `occurrence:${id}`;

export interface EngineState {
  online: boolean;
  sending: boolean;
  /** Sitzung abgelaufen: Senden wartet auf neue Anmeldung. */
  authExpired: boolean;
  lastSyncedAt: number | null;
}

const RETRY_MS = 15_000;
const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

type Result =
  | { entry: ClassbookEntryState }
  | { attendance: OccurrenceDetail['attendance']; applied: number }
  | { remark: RemarkItem };

/**
 * Arbeitet die Outbox in Reihenfolge ab, sobald eine Verbindung besteht (online-Ereignis, App im Vordergrund,
 * Zeitgeber, nach jeder neuen Änderung). Die Idempotenz auf dem Server verhindert Doppelungen bei Wiederholung.
 */
class SyncEngine {
  private csrf = '';
  private running = false;
  private again = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly listeners = new Set<() => void>();
  private confirmed: (ids: string[], reload: string[]) => void = () => undefined;
  private state: EngineState = {
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    sending: false,
    authExpired: false,
    lastSyncedAt: null,
  };

  /** Vom Provider der App aufgerufen: aktuelles CSRF-Token und Rückruf zum Neuladen bestätigter Termine. */
  configure(csrfToken: string, onConfirmed: (ids: string[], reload: string[]) => void): () => void {
    const changed = this.csrf !== csrfToken;
    this.csrf = csrfToken;
    this.confirmed = onConfirmed;
    if (changed && this.state.authExpired) this.set({ authExpired: false });
    const online = () => {
      this.set({ online: true });
      void this.process();
    };
    const offline = () => this.set({ online: false });
    const visible = () => {
      if (document.visibilityState === 'visible') void this.process();
    };
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    document.addEventListener('visibilitychange', visible);
    this.timer = setInterval(() => void this.process(), RETRY_MS);
    void this.process();
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      document.removeEventListener('visibilitychange', visible);
      if (this.timer) clearInterval(this.timer);
    };
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getState = (): EngineState => this.state;

  private set(patch: Partial<EngineState>) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }

  /** Neue Änderung lokal festhalten (sofort sichtbar) und Senden anstoßen. */
  async enqueue(m: NewMutation, serverVersion: number): Promise<void> {
    const table = db().outbox;
    await db().transaction('rw', table, async () => {
      const plan = planEnqueue(
        await table.where('occurrenceId').equals(m.occurrenceId).sortBy('seq'),
        m,
        serverVersion,
        newId,
        new Date(),
      );
      if (plan.replace) await table.put(plan.replace);
      if (plan.add) await table.add(plan.add);
    });
    void this.process();
  }

  async retry(seq: number): Promise<void> {
    await db().outbox.update(seq, { state: 'pending', error: undefined });
    void this.process();
  }

  async discard(seq: number): Promise<void> {
    await db().outbox.delete(seq);
  }

  /**
   * Konflikt bei Stoff/Hausübung (Spec Abschnitt 12): beide Stände zeigen und wählen lassen.
   * "mine" schickt die eigene Fassung auf Basis des aktuellen Serverstands erneut, "theirs" übernimmt den Server.
   */
  async resolveConflict(
    occurrenceId: string,
    keep: 'mine' | 'theirs',
    mine: {
      topic: string | null;
      homework: string | null;
      homeworkDueOn: string | null;
      note?: string | null;
    },
  ): Promise<void> {
    const table = db().outbox;
    await db().transaction('rw', table, db().snapshots, async () => {
      const items = await table.where('occurrenceId').equals(occurrenceId).toArray();
      const entries = items.filter(
        (o): o is Extract<OutboxItem, { kind: 'entry' }> => o.kind === 'entry',
      );
      const conflicts = entries.filter((o) => o.state === 'conflict');
      const server = conflicts
        .map((o) => o.conflict ?? null)
        .reduce<ClassbookEntryState | null>(
          (a, b) => (b && (!a || b.version > a.version) ? b : a),
          null,
        );
      await table.bulkDelete(entries.map((o) => o.seq!));
      const snap = await db().snapshots.get(occurrenceKey(occurrenceId));
      if (snap && server)
        await db().snapshots.put({
          ...snap,
          data: mergeServer(snap.data as OccurrenceDetail, { entry: server }),
        });
      if (keep === 'mine')
        await table.add({
          kind: 'entry',
          occurrenceId,
          ...mine,
          baseVersion: server?.version ?? 0,
          clientMutationId: newId(),
          state: 'pending',
          attempts: 0,
          createdAt: Date.now(),
        });
    });
    this.confirmed([occurrenceId], [occurrenceId]);
    void this.process();
  }

  /** Outbox in Reihenfolge senden; bei fehlender Verbindung anhalten und später weitermachen. */
  async process(): Promise<void> {
    if (this.running) {
      this.again = true;
      return;
    }
    if (!this.csrf || this.state.authExpired) return;
    // Ohne Verbindung nicht senden: Änderungen bleiben "nie gesendet" und lassen sich zusammenfassen
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.set({ online: false });
      return;
    }
    this.running = true;
    const touched = new Set<string>();
    // Abschließen ergänzt serverseitig die Anwesenheit: diese Termine neu laden, sonst genügt die Antwort
    const reload = new Set<string>();
    try {
      do {
        this.again = false;
        const items = await db().outbox.where('state').anyOf('pending', 'sending').sortBy('seq');
        if (items.length === 0) break;
        this.set({ sending: true });
        const done = new Set<number>();
        for (const item of items) {
          if (done.has(item.seq!)) continue;
          // Anwesenheit eines Termins geht gesammelt in einer Anfrage (die API nimmt Listen)
          const batch =
            item.kind === 'attendance'
              ? items.filter((o) => o.kind === 'attendance' && o.occurrenceId === item.occurrenceId)
              : [item];
          for (const b of batch) done.add(b.seq!);
          const outcome = await this.send(batch);
          if (outcome === 'stop') {
            this.again = false;
            break;
          }
          touched.add(item.occurrenceId);
          if (item.kind === 'close') reload.add(item.occurrenceId);
        }
      } while (this.again);
    } finally {
      this.running = false;
      this.set({ sending: false });
      if (touched.size) this.confirmed([...touched], [...reload]);
    }
  }

  private async send(batch: OutboxItem[]): Promise<'next' | 'stop'> {
    const item = batch[0]!;
    const seqs = batch.map((b) => b.seq!);
    const mark = (patch: Partial<OutboxItem>) =>
      db().outbox.bulkUpdate(seqs.map((key) => ({ key, changes: patch })));
    await db().outbox.bulkUpdate(
      batch.map((b) => ({ key: b.seq!, changes: { state: 'sending', attempts: b.attempts + 1 } })),
    );
    let result: Result;
    try {
      result = await this.call(batch);
    } catch (err) {
      if (err instanceof ApiError) {
        const status = err.problem.status;
        if (status === 409 && item.kind === 'entry') {
          await mark({
            state: 'conflict',
            conflict: (err.problem.current as ClassbookEntryState | null | undefined) ?? null,
          });
          return 'next';
        }
        if (status === 401 || (status === 403 && /CSRF|Zweiter Faktor/.test(err.problem.title))) {
          await mark({ state: 'pending' });
          this.set({ authExpired: true });
          return 'stop';
        }
        if (status >= 400 && status < 500) {
          await mark({ state: 'failed', error: err.problem.title });
          return 'next';
        }
      }
      // keine Verbindung oder Serverfehler: später erneut versuchen
      await mark({ state: 'pending' });
      this.set({ online: typeof navigator === 'undefined' ? false : navigator.onLine });
      return 'stop';
    }
    await db().transaction('rw', db().outbox, db().snapshots, async () => {
      await db().outbox.bulkDelete(seqs);
      if (item.kind === 'entry' && 'entry' in result) {
        const rest = await db().outbox.where('occurrenceId').equals(item.occurrenceId).toArray();
        for (const r of rebaseAfter(rest, item, result.entry.version)) await db().outbox.put(r);
      }
      const snap = await db().snapshots.get(occurrenceKey(item.occurrenceId));
      if (snap)
        await db().snapshots.put({
          ...snap,
          data: mergeServer(snap.data as OccurrenceDetail, result),
          savedAt: Date.now(),
        });
    });
    this.set({ online: true, lastSyncedAt: Date.now() });
    return 'next';
  }

  private call(batch: Mutation[]): Promise<Result> {
    const m = batch[0]!;
    const base = `/occurrences/${encodeURIComponent(m.occurrenceId)}`;
    if (m.kind === 'attendance')
      return apiRequest(
        'PUT',
        `${base}/attendance`,
        {
          items: batch.flatMap((a) =>
            a.kind === 'attendance'
              ? [
                  {
                    studentId: a.studentId,
                    status: a.status,
                    lateMinutes: a.lateMinutes,
                    clientMutationId: a.clientMutationId,
                    clientUpdatedAt: a.clientUpdatedAt,
                  },
                ]
              : [],
          ),
        },
        this.csrf,
      );
    if (m.kind === 'entry')
      return apiRequest(
        'PUT',
        `${base}/classbook`,
        {
          baseVersion: m.baseVersion,
          topic: m.topic,
          homework: m.homework,
          homeworkDueOn: m.homeworkDueOn,
          ...(m.note !== undefined ? { note: m.note } : {}),
          clientMutationId: m.clientMutationId,
        },
        this.csrf,
      );
    if (m.kind === 'remark')
      return apiRequest<RemarkItem>(
        'POST',
        `${base}/remarks`,
        { studentId: m.studentId, text: m.text, clientMutationId: m.clientMutationId },
        this.csrf,
      ).then((remark) => ({ remark }));
    return apiRequest('POST', `${base}/close`, { clientMutationId: m.clientMutationId }, this.csrf);
  }
}

export const sync = new SyncEngine();
