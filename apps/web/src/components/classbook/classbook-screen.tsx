'use client';
import { ArrowLeft, Check, Eye, Lock, TriangleAlert, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  nextWeekday,
  type AttendanceStatusName,
  type ClassbookEntryState,
  type OccurrenceDetail,
} from '@sp/shared';
import {
  AttendanceRow,
  Banner,
  Chip,
  Button,
  Card,
  EmptyState,
  Input,
  Sheet,
  Skeleton,
  StatusBadge,
  Textarea,
  useToast,
} from '@sp/ui';
import { ApiError } from '../../lib/api-client';
import { dateTimeOf, longDate, timeOf, todayVienna, weekdayDate } from '../../lib/dates';
import { OfflineMissError } from '../../offline/cached';
import { useOccurrence } from '../../offline/hooks';
import { statusOf, type OutboxItem } from '../../offline/mutations';
import { sync } from '../../offline/sync';
import { SyncStatus } from '../sync-status';
import { periodLabel } from '../today/lesson-row';
import { useT } from '../../lib/i18n';

const AUTOSAVE_MS = 700;
const LATE_PRESETS = [5, 10, 15, 20, 30];

type Student = OccurrenceDetail['students'][number];
type EntryFields = { topic: string; homework: string; homeworkDueOn: string };

const fieldsOf = (e: ClassbookEntryState | null): EntryFields => ({
  topic: e?.topic ?? '',
  homework: e?.homework ?? '',
  homeworkDueOn: e?.homeworkDueOn ?? '',
});

export function ClassbookScreen({ id, backHref }: { id: string; backHref: string }) {
  const t = useT('classbook');
  const tc = useT('common');
  const { detail, server, outbox, query } = useOccurrence(id);
  // Auch per Client-Navigation geöffnete Stunden sofort offline verfügbar machen
  useEffect(() => {
    navigator.serviceWorker?.controller?.postMessage({
      type: 'cache-pages',
      urls: [`/klassenbuch/${encodeURIComponent(id)}`],
    });
  }, [id]);

  if (!detail) {
    return (
      <Shell backHref={backHref}>
        {query.isError ? (
          <Card>
            <EmptyState
              title={
                query.error instanceof OfflineMissError
                  ? t('notCached')
                  : query.error instanceof ApiError &&
                      [403, 404].includes(query.error.problem.status)
                    ? t('notFound')
                    : tc('error')
              }
              action={
                <Button variant="secondary" onClick={() => void query.refetch()}>
                  {tc('retry')}
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="flex flex-col gap-3" aria-hidden="true">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-6 w-64" />
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        )}
      </Shell>
    );
  }
  return (
    <Shell backHref={backHref}>
      <Loaded detail={detail} serverVersion={server?.entry?.version ?? 0} outbox={outbox} />
    </Shell>
  );
}

function Shell({ backHref, children }: { backHref: string; children: React.ReactNode }) {
  const t = useT('classbook');
  return (
    <div className="mx-auto flex w-full max-w-(--content-max) flex-col gap-6 px-4 pt-2 pb-8 lg:px-6 lg:pt-4">
      <Button variant="ghost" size="sm" asChild iconLeft={ArrowLeft} className="-ml-4 self-start">
        <Link href={backHref}>{t('back')}</Link>
      </Button>
      {children}
    </div>
  );
}

function Loaded({
  detail,
  serverVersion,
  outbox,
}: {
  detail: OccurrenceDetail;
  serverVersion: number;
  outbox: OutboxItem[];
}) {
  const t = useT('classbook');
  const tt = useT('today');
  const tp = useT('plan');
  const [lateFor, setLateFor] = useState<Student | null>(null);
  const writable = detail.canWrite;
  const closed = detail.entry?.closedAt ?? null;
  const counts = { PRESENT: 0, ABSENT: 0, LATE: 0 } as Record<AttendanceStatusName, number>;
  for (const s of detail.students) counts[statusOf(detail, s.id)]++;
  const conflicts = outbox.filter(
    (o): o is Extract<OutboxItem, { kind: 'entry' }> =>
      o.kind === 'entry' && o.state === 'conflict',
  );
  const failed = outbox.filter((o) => o.state === 'failed');

  /**
   * Tastatur am Desktop (Design System, Klassenbuch): Pfeile wechseln die Zeile, A wechselt anwesend/abwesend,
   * V öffnet die Verspätung, Strg/Cmd+Enter schließt die Stunde ab (Enter allein bleibt der Button der Zeile).
   */
  const onListKey = (e: React.KeyboardEvent<HTMLElement>) => {
    const rows = [
      ...e.currentTarget.querySelectorAll<HTMLButtonElement>(
        'li[data-student] > button:first-child',
      ),
    ];
    const i = rows.findIndex((b) => b === document.activeElement);
    if (i < 0 || e.altKey) return;
    const student = detail.students.find((x) => x.id === rows[i]!.closest('li')?.dataset.student);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus();
    } else if ((e.key === 'a' || e.key === 'A') && !e.metaKey && !e.ctrlKey && student) {
      e.preventDefault();
      const cur = statusOf(detail, student.id);
      setStatus(student, cur === 'PRESENT' ? 'ABSENT' : 'PRESENT');
    } else if ((e.key === 'v' || e.key === 'V') && !e.metaKey && !e.ctrlKey && student) {
      e.preventDefault();
      setLateFor(student);
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      document.querySelector<HTMLButtonElement>('[data-close-lesson]')?.click();
    }
  };

  const setStatus = (s: Student, status: AttendanceStatusName, lateMinutes: number | null = null) =>
    void sync.enqueue(
      { kind: 'attendance', occurrenceId: detail.id, studentId: s.id, status, lateMinutes },
      serverVersion,
    );

  return (
    <>
      {/* Kopf (Design System, Klassenbuch): overline Tag, Titel Klasse · Fach, darunter Stunde und Raum */}
      <header className="flex flex-col gap-1">
        <p className="text-overline text-brand-text">
          {detail.date === todayVienna() ? tt('title') : longDate(detail.date)}
        </p>
        <h1 className="text-h1">
          {detail.class?.name ?? detail.group?.name} · {detail.subject.name}
        </h1>
        <p className="text-body-sm text-ink-muted">
          {periodLabel(tt, detail)}
          {detail.room ? `, ${detail.room.name}` : ''} ·{' '}
          <span className="font-data">
            {tt('time', { from: timeOf(detail.startsAt), to: timeOf(detail.endsAt) })}
          </span>
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          {detail.substitution ? (
            <StatusBadge status="substituted" label={tp('substituted')} />
          ) : null}
          {closed ? (
            <Chip tone="ok" icon={Lock}>
              {t('closedAt', { time: dateTimeOf(closed) })}
            </Chip>
          ) : null}
        </div>
        {detail.substitution ? (
          <p className="text-body-sm text-ink-muted">{t('substitution')}</p>
        ) : null}
      </header>

      {writable ? <SyncStatus /> : null}
      {detail.status === 'CANCELLED' ? (
        <Card>
          <p>{t('cancelled')}</p>
        </Card>
      ) : !writable ? (
        <Banner tone="brand" icon={Eye}>
          {t('readOnly')}
        </Banner>
      ) : null}

      {conflicts.length > 0 ? <ConflictPanel detail={detail} conflicts={conflicts} /> : null}
      {failed.map((f) => (
        <Banner
          key={f.seq}
          tone="danger"
          icon={TriangleAlert}
          role="alert"
          action={
            <span className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => void sync.retry(f.seq!)}>
                {t('retry')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void sync.discard(f.seq!)}>
                {t('discard')}
              </Button>
            </span>
          }
        >
          {t('failed', { error: f.error ?? '' })}
        </Banner>
      ))}

      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <section
          aria-labelledby="students"
          className="flex flex-col gap-3"
          onKeyDown={writable ? onListKey : undefined}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="students" className="text-h2">
              {t('students')}
            </h2>
            <p className="text-body-sm text-ink-muted" aria-live="polite">
              {t('summary', { present: counts.PRESENT, absent: counts.ABSENT, late: counts.LATE })}
            </p>
          </div>
          {writable ? (
            <p className="text-body-sm text-ink-muted">
              {t('toggleHint')} <span className="hidden lg:inline">{t('keyboardHint')}</span>
            </p>
          ) : null}
          {detail.students.length === 0 ? (
            <Card flat>
              <EmptyState as="h3" title={t('noStudents')} />
            </Card>
          ) : (
            <ul className="pf-list">
              {detail.students.map((s) => (
                <StudentRow
                  key={s.id}
                  student={s}
                  status={statusOf(detail, s.id)}
                  lateMinutes={detail.attendance[s.id]?.lateMinutes ?? null}
                  disabled={!writable}
                  onToggle={(cur) => setStatus(s, cur === 'PRESENT' ? 'ABSENT' : 'PRESENT')}
                  onLate={() => setLateFor(s)}
                />
              ))}
            </ul>
          )}
        </section>

        {detail.status !== 'CANCELLED' ? (
          <div className="flex flex-col gap-4 lg:sticky lg:top-[calc(var(--topbar-h)+var(--space-4))]">
            <EntryBar detail={detail} serverVersion={serverVersion} outbox={outbox} />
            <RecentEntries detail={detail} />
          </div>
        ) : null}
      </div>

      <LateSheet
        student={lateFor}
        current={lateFor ? (detail.attendance[lateFor.id]?.lateMinutes ?? null) : null}
        onClose={() => setLateFor(null)}
        onSave={(minutes) => {
          if (lateFor) setStatus(lateFor, minutes ? 'LATE' : 'PRESENT', minutes);
          setLateFor(null);
        }}
      />
    </>
  );
}

/** Zeile der Anwesenheit (Design System, Klassenbuch-Zeile): Tap wechselt, langes Drücken = Verspätung. */
function StudentRow({
  student,
  status,
  lateMinutes,
  disabled,
  onToggle,
  onLate,
}: {
  student: Student;
  status: AttendanceStatusName;
  lateMinutes: number | null;
  disabled: boolean;
  onToggle: (current: AttendanceStatusName) => void;
  onLate: () => void;
}) {
  const t = useT('classbook');
  const name = `${student.lastName} ${student.firstName}`;
  const label =
    status === 'LATE'
      ? t('lateMinutes', { minutes: lateMinutes ?? 0 })
      : status === 'ABSENT'
        ? t('absent')
        : t('present');
  return (
    <AttendanceRow
      name={name}
      initial={(student.firstName || student.lastName).slice(0, 1)}
      status={status === 'LATE' ? 'late' : status === 'ABSENT' ? 'absent' : 'present'}
      statusLabel={label}
      toggleLabel={t('toggleLabel', { name, status: label })}
      lateLabel={`${t('markLate')}: ${name}`}
      disabled={disabled}
      onToggle={() => onToggle(status)}
      onLate={onLate}
      data={{ 'data-student': student.id, 'data-status': status }}
    />
  );
}

function LateSheet({
  student,
  current,
  onClose,
  onSave,
}: {
  student: Student | null;
  current: number | null;
  onClose: () => void;
  onSave: (minutes: number | null) => void;
}) {
  const t = useT('classbook');
  const tc = useT('common');
  const [minutes, setMinutes] = useState<string>('');
  useEffect(() => setMinutes(current ? String(current) : ''), [student, current]);
  const value = Number.parseInt(minutes, 10);
  const valid = Number.isInteger(value) && value >= 1 && value <= 240;
  return (
    <Sheet
      open={student !== null}
      onOpenChange={(o) => (o ? undefined : onClose())}
      title={student ? t('lateTitle', { name: `${student.firstName} ${student.lastName}` }) : ''}
      closeLabel={tc('close')}
    >
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('minutes')}>
        {LATE_PRESETS.map((m) => (
          <Button
            key={m}
            variant={String(m) === minutes ? 'primary' : 'secondary'}
            aria-pressed={String(m) === minutes}
            onClick={() => setMinutes(String(m))}
          >
            {m}
          </Button>
        ))}
      </div>
      <Input
        label={t('minutesCustom')}
        type="number"
        inputMode="numeric"
        min={1}
        max={240}
        value={minutes}
        onChange={(e) => setMinutes(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <Button disabled={!valid} onClick={() => onSave(value)}>
          {t('saveLate')}
        </Button>
        <Button variant="secondary" onClick={() => onSave(null)}>
          {t('removeLate')}
        </Button>
      </div>
    </Sheet>
  );
}

/** Feste Leiste unten: Stoff, Hausübung, Abschließen. Speichert automatisch (entprellt, beim Verlassen sofort). */
function EntryBar({
  detail,
  serverVersion,
  outbox,
}: {
  detail: OccurrenceDetail;
  serverVersion: number;
  outbox: OutboxItem[];
}) {
  const t = useT('classbook');
  const toast = useToast();
  const [fields, setFields] = useState<EntryFields>(() => fieldsOf(detail.entry));
  const latest = useRef(fields);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const writable = detail.canWrite;
  const closed = detail.entry?.closedAt ?? null;
  const closing = outbox.some((o) => o.kind === 'close');

  // Fremde Änderungen übernehmen, solange hier nichts Eigenes ungespeichert ist
  const incoming = fieldsOf(detail.entry);
  useEffect(() => {
    // `incoming` enthält schon die eigenen, noch nicht bestätigten Änderungen (applyPending);
    // Vorrang haben nur Eingaben, die noch nicht in der Outbox liegen.
    if (!dirty.current) {
      setFields(incoming);
      latest.current = incoming;
    }
    // Abhängig von den Werten (nicht vom jeweils neuen Objekt), damit eigene Eingaben nicht überschrieben werden
  }, [incoming.topic, incoming.homework, incoming.homeworkDueOn]);

  const flush = (next: EntryFields) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!dirty.current) return;
    dirty.current = false;
    void sync.enqueue(
      {
        kind: 'entry',
        occurrenceId: detail.id,
        topic: next.topic.trim() ? next.topic : null,
        homework: next.homework.trim() ? next.homework : null,
        homeworkDueOn: next.homework.trim() ? next.homeworkDueOn || null : null,
      },
      serverVersion,
    );
  };
  const change = (patch: Partial<EntryFields>) => {
    const next = { ...fields, ...patch };
    if (patch.homework !== undefined && patch.homework.trim() && !next.homeworkDueOn)
      next.homeworkDueOn = nextWeekday(detail.date);
    setFields(next);
    latest.current = next;
    dirty.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => flush(next), AUTOSAVE_MS);
  };
  // Beim Verlassen (Zurück, App schließen, in den Hintergrund) nichts Getipptes verlieren
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => {
    const save = () => flushRef.current(latest.current);
    const onHide = () => {
      if (document.visibilityState === 'hidden') save();
    };
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', save);
      document.removeEventListener('visibilitychange', onHide);
      save();
    };
  }, []);

  return (
    <>
      <section aria-label={t('entryToggle')} className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Textarea
          label={t('topic')}
          rows={2}
          disabled={!writable}
          value={fields.topic}
          placeholder={t('topicPlaceholder')}
          onChange={(e) => change({ topic: e.target.value })}
          onBlur={() => flush(fields)}
          className="min-h-20"
        />
        <div className="flex flex-col gap-3">
          <Textarea
            label={t('homework')}
            rows={2}
            disabled={!writable}
            value={fields.homework}
            placeholder={t('homeworkPlaceholder')}
            onChange={(e) => change({ homework: e.target.value })}
            onBlur={() => flush(fields)}
            className="min-h-20"
          />
          {fields.homework.trim() ? (
            <Input
              label={t('dueOn')}
              type="date"
              disabled={!writable}
              value={fields.homeworkDueOn}
              min={detail.date}
              onChange={(e) => change({ homeworkDueOn: e.target.value })}
              onBlur={() => flush(fields)}
              fieldClassName="self-start"
            />
          ) : null}
        </div>
      </section>
      {writable ? (
        <>
          {!detail.canClose || !closed ? (
            <p className="text-body-sm text-ink-muted">
              {!detail.canClose ? t('futureHint') : t('closeHint')}
            </p>
          ) : null}
          {/* Hauptaktion unten angeheftet, über der Tab-Leiste und mit Safe-Area (Design System, Klassenbuch) */}
          <div className="sticky bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))] z-nav -mx-4 bg-bg px-4 py-3 lg:bottom-0 lg:mx-0 lg:px-0">
            <Button
              block
              iconLeft={Check}
              data-close-lesson=""
              disabled={!detail.canClose || Boolean(closed) || closing}
              onClick={() => {
                flush(fields);
                void sync.enqueue({ kind: 'close', occurrenceId: detail.id }, serverVersion);
                toast({ text: t('closedToast') });
              }}
            >
              {closed ? t('closed') : t('close')}
            </Button>
          </div>
        </>
      ) : null}
    </>
  );
}

/** Verlauf der letzten Stunden (Design System, Klassenbuch Web): Stoff und Hausübung, neueste zuerst. */
function RecentEntries({ detail }: { detail: OccurrenceDetail }) {
  const t = useT('classbook');
  const tt = useT('today');
  const recent = detail.recent ?? [];
  if (recent.length === 0) return null;
  return (
    <section aria-labelledby="recent-h" className="flex flex-col gap-2">
      <h2 id="recent-h" className="text-h3">
        {t('recent')}
      </h2>
      <ol className="flex flex-col divide-y divide-line rounded-lg bg-bg-sunken px-4">
        {recent.map((r) => (
          <li key={r.occurrenceId} className="flex flex-col gap-1 py-3">
            <p className="text-mono-sm text-ink-muted">
              {weekdayDate(r.date)} · {tt('period', { n: r.periodStart })}
            </p>
            {r.topic ? <p className="text-body-sm whitespace-pre-line">{r.topic}</p> : null}
            {r.homework ? (
              <p className="text-body-sm whitespace-pre-line text-ink-muted">
                {t('homework')}: {r.homework}
              </p>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

function ConflictPanel({
  detail,
  conflicts,
}: {
  detail: OccurrenceDetail;
  conflicts: Extract<OutboxItem, { kind: 'entry' }>[];
}) {
  const t = useT('classbook');
  const theirs = conflicts.map((c) => c.conflict).find(Boolean) ?? null;
  const mine = {
    topic: detail.entry?.topic ?? null,
    homework: detail.entry?.homework ?? null,
    homeworkDueOn: detail.entry?.homeworkDueOn ?? null,
  };
  const show = (v: { topic: string | null; homework: string | null }) => (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-body-sm">
      <dt className="text-ink-muted">{t('topic')}</dt>
      <dd className="whitespace-pre-line">{v.topic || t('empty')}</dd>
      <dt className="text-ink-muted">{t('homework')}</dt>
      <dd className="whitespace-pre-line">{v.homework || t('empty')}</dd>
    </dl>
  );
  return (
    <Card tone="signal" flat className="flex flex-col gap-3" role="alert">
      <div className="flex flex-col gap-1">
        <Chip tone="solid" icon={TriangleAlert} className="self-start">
          {t('conflict')}
        </Chip>
        <p className="text-h3">{t('conflictTitle')}</p>
        <p className="text-body-sm">{t('conflictText')}</p>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1 rounded-md bg-bg-raised p-3">
          <p className="text-label">{t('conflictTheirs')}</p>
          {show(theirs ?? { topic: null, homework: null })}
        </div>
        <div className="flex flex-col gap-1 rounded-md bg-bg-raised p-3">
          <p className="text-label">{t('conflictMine')}</p>
          {show(mine)}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void sync.resolveConflict(detail.id, 'mine', mine)}>
          {t('keepMine')}
        </Button>
        <Button
          variant="secondary"
          iconLeft={X}
          onClick={() => void sync.resolveConflict(detail.id, 'theirs', mine)}
        >
          {t('takeTheirs')}
        </Button>
      </div>
    </Card>
  );
}
