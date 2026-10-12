'use client';
import { ArrowLeft, Check, ChevronUp, Clock, Lock, X } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import {
  nextWeekday,
  type AttendanceStatusName,
  type ClassbookEntryState,
  type OccurrenceDetail,
} from '@sp/shared';
import { Badge, Button, Card, EmptyState, Input, Sheet, Skeleton, StatusBadge, cn } from '@sp/ui';
import { ApiError } from '../../lib/api-client';
import { dateTimeOf, longDate, timeOf } from '../../lib/dates';
import { OfflineMissError } from '../../offline/cached';
import { useOccurrence } from '../../offline/hooks';
import { statusOf, type OutboxItem } from '../../offline/mutations';
import { sync } from '../../offline/sync';
import { SyncStatus } from '../sync-status';
import { periodLabel } from '../today/lesson-row';

const LONG_PRESS_MS = 500;
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
  const t = useTranslations('classbook');
  const tc = useTranslations('common');
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
  const t = useTranslations('classbook');
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <Link
        href={backHref}
        className="inline-flex min-h-11 items-center gap-2 self-start rounded-sm pr-3 text-body-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft aria-hidden="true" size={18} />
        {t('back')}
      </Link>
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
  const t = useTranslations('classbook');
  const tt = useTranslations('today');
  const tp = useTranslations('plan');
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

  const setStatus = (s: Student, status: AttendanceStatusName, lateMinutes: number | null = null) =>
    void sync.enqueue(
      { kind: 'attendance', occurrenceId: detail.id, studentId: s.id, status, lateMinutes },
      serverVersion,
    );

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-h1">
          {detail.subject.name} · {detail.class?.name ?? detail.group?.name}
        </h1>
        <p className="text-ink-muted">
          {longDate(detail.date)} · {periodLabel(tt, detail)} ·{' '}
          {tt('time', { from: timeOf(detail.startsAt), to: timeOf(detail.endsAt) })}
          {detail.room ? ` · ${detail.room.name}` : ''}
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          {detail.substitution ? (
            <StatusBadge status="substituted" label={tp('substituted')} />
          ) : null}
          {closed ? (
            <Badge tone="success">
              <Lock aria-hidden="true" size={14} />
              {t('closedAt', { time: dateTimeOf(closed) })}
            </Badge>
          ) : null}
        </div>
        {detail.substitution ? <p className="text-body-sm text-ink-muted">{t('substitution')}</p> : null}
      </header>

      {writable ? <SyncStatus /> : null}
      {detail.status === 'CANCELLED' ? (
        <Card>
          <p>{t('cancelled')}</p>
        </Card>
      ) : !writable ? (
        <Card>
          <p className="text-ink-muted">{t('readOnly')}</p>
        </Card>
      ) : null}

      {conflicts.length > 0 ? <ConflictPanel detail={detail} conflicts={conflicts} /> : null}
      {failed.map((f) => (
        <Card key={f.seq} className="flex flex-col gap-2 border-danger" role="alert">
          <p className="text-danger-ink">{t('failed', { error: f.error ?? '' })}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void sync.retry(f.seq!)}>
              {t('retry')}
            </Button>
            <Button variant="ghost" onClick={() => void sync.discard(f.seq!)}>
              {t('discard')}
            </Button>
          </div>
        </Card>
      ))}

      <section aria-labelledby="students" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="students" className="text-h3">
            {t('students')}
          </h2>
          <p className="text-body-sm text-ink-muted" aria-live="polite">
            {t('summary', { present: counts.PRESENT, absent: counts.ABSENT, late: counts.LATE })}
          </p>
        </div>
        {writable ? <p className="text-body-sm text-ink-muted">{t('toggleHint')}</p> : null}
        {detail.students.length === 0 ? (
          <Card>
            <p className="text-ink-muted">{t('noStudents')}</p>
          </Card>
        ) : (
          <Card className="p-0">
            <ul>
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
          </Card>
        )}
      </section>

      {detail.status !== 'CANCELLED' ? (
        <EntryBar detail={detail} serverVersion={serverVersion} outbox={outbox} />
      ) : null}

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
  const t = useTranslations('classbook');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const name = `${student.lastName} ${student.firstName}`;
  const label =
    status === 'LATE'
      ? t('lateMinutes', { minutes: lateMinutes ?? 0 })
      : status === 'ABSENT'
        ? t('absent')
        : t('present');
  const badge = status === 'LATE' ? 'late' : status === 'ABSENT' ? 'absent' : 'present';
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  return (
    <li
      className={cn(
        'flex items-center border-b border-l-4 border-b-line last:border-b-0',
        status === 'ABSENT'
          ? 'border-l-danger'
          : status === 'LATE'
            ? 'border-l-signal'
            : 'border-l-transparent',
      )}
      data-student={student.id}
      data-status={status}
    >
      <button
        type="button"
        disabled={disabled}
        aria-label={t('toggleLabel', { name, status: label })}
        className="flex min-h-14 flex-1 select-none items-center justify-between gap-3 px-4 py-2 text-left hover:bg-bg-sunken disabled:cursor-default disabled:hover:bg-transparent"
        onPointerDown={() => {
          longPressed.current = false;
          cancel();
          timer.current = setTimeout(() => {
            longPressed.current = true;
            onLate();
          }, LONG_PRESS_MS);
        }}
        onPointerUp={cancel}
        onPointerLeave={cancel}
        onPointerCancel={cancel}
        onContextMenu={(e) => e.preventDefault()}
        onClick={() => {
          if (longPressed.current) {
            longPressed.current = false;
            return;
          }
          onToggle(status);
        }}
      >
        <span className="min-w-0 truncate font-medium">{name}</span>
        <StatusBadge status={badge} label={label} className="shrink-0" />
      </button>
      {disabled ? null : (
        <button
          type="button"
          onClick={onLate}
          aria-label={`${t('markLate')}: ${name}`}
          className="inline-flex min-h-14 min-w-14 items-center justify-center border-l border-line text-ink-muted hover:bg-bg-sunken hover:text-ink"
        >
          <Clock aria-hidden="true" size={20} />
        </button>
      )}
    </li>
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
  const t = useTranslations('classbook');
  const tc = useTranslations('common');
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
  const t = useTranslations('classbook');
  const [fields, setFields] = useState<EntryFields>(() => fieldsOf(detail.entry));
  const [expanded, setExpanded] = useState(false);
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
    <div className="sticky bottom-16 z-30 -mx-4 flex flex-col gap-3 border-t border-line bg-bg-raised p-4 md:bottom-0 md:mx-0 md:rounded-md md:border">
      {/* Mobil eingeklappt, damit die Schülerliste sichtbar bleibt; ab Tablet immer offen */}
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={`entry-${detail.id}`}
        onClick={() => setExpanded((v) => !v)}
        className="flex min-h-11 items-center gap-2 rounded-sm text-left text-body-sm md:hidden"
      >
        <ChevronUp
          aria-hidden="true"
          size={18}
          className={cn('shrink-0 transition-transform', expanded && 'rotate-180')}
        />
        <span className="font-medium">{t('entryToggle')}</span>
        <span className="min-w-0 flex-1 truncate text-ink-muted">
          {fields.topic.trim() || t('entryEmpty')}
        </span>
      </button>
      <div
        id={`entry-${detail.id}`}
        className={cn('gap-3 md:grid md:grid-cols-2', expanded ? 'grid' : 'hidden')}
      >
        <label className="flex flex-col gap-1 text-label">
          {t('topic')}
          <textarea
            rows={2}
            disabled={!writable}
            value={fields.topic}
            placeholder={t('topicPlaceholder')}
            onChange={(e) => change({ topic: e.target.value })}
            onBlur={() => flush(fields)}
            className="min-h-11 rounded-sm border border-line bg-bg-sunken px-3 py-2 text-body font-normal text-ink disabled:opacity-60"
          />
        </label>
        <div className="flex flex-col gap-1">
          <label className="flex flex-col gap-1 text-label">
            {t('homework')}
            <textarea
              rows={2}
              disabled={!writable}
              value={fields.homework}
              placeholder={t('homeworkPlaceholder')}
              onChange={(e) => change({ homework: e.target.value })}
              onBlur={() => flush(fields)}
              className="min-h-11 rounded-sm border border-line bg-bg-sunken px-3 py-2 text-body font-normal text-ink disabled:opacity-60"
            />
          </label>
          {fields.homework.trim() ? (
            <Input
              label={t('dueOn')}
              type="date"
              disabled={!writable}
              value={fields.homeworkDueOn}
              min={detail.date}
              onChange={(e) => change({ homeworkDueOn: e.target.value })}
              onBlur={() => flush(fields)}
              className="w-auto self-start"
            />
          ) : null}
        </div>
      </div>
      {writable ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={!detail.canClose || Boolean(closed) || closing}
            onClick={() => {
              flush(fields);
              void sync.enqueue({ kind: 'close', occurrenceId: detail.id }, serverVersion);
            }}
          >
            <Check aria-hidden="true" size={18} />
            {closed ? t('closed') : t('close')}
          </Button>
          <p className={cn('text-body-sm text-ink-muted md:block', !expanded && 'hidden')}>
            {!detail.canClose ? t('futureHint') : closed ? null : t('closeHint')}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function ConflictPanel({
  detail,
  conflicts,
}: {
  detail: OccurrenceDetail;
  conflicts: Extract<OutboxItem, { kind: 'entry' }>[];
}) {
  const t = useTranslations('classbook');
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
    <Card className="flex flex-col gap-3 border-signal" role="alert">
      <div>
        <p className="font-semibold text-signal-ink">{t('conflictTitle')}</p>
        <p className="text-body-sm text-ink-muted">{t('conflictText')}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1 rounded-sm border border-line p-3">
          <p className="text-label">{t('conflictTheirs')}</p>
          {show(theirs ?? { topic: null, homework: null })}
        </div>
        <div className="flex flex-col gap-1 rounded-sm border border-line p-3">
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
          onClick={() => void sync.resolveConflict(detail.id, 'theirs', mine)}
        >
          <X aria-hidden="true" size={16} />
          {t('takeTheirs')}
        </Button>
      </div>
    </Card>
  );
}
