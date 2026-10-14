'use client';
import {
  ArrowLeft,
  Check,
  Eye,
  FilePen,
  MessageSquare,
  Pencil,
  Plus,
  Send,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  ASSESSMENT_KINDS,
  GRADE_VALUES,
  type AssessmentItem,
  type AssessmentKind,
  type CourseDetail,
  type CourseRef,
  type GradeWeights,
} from '@sp/shared';
import {
  Banner,
  Button,
  Card,
  Chip,
  EmptyState,
  Input,
  Select,
  Sheet,
  Skeleton,
  Textarea,
  cn,
  useToast,
} from '@sp/ui';
import { shortDate, todayVienna, weekdayDate } from '../../lib/dates';
import { useApi, useApiMutation, useProblemText } from '../../lib/use-api';
import { useT } from '../../lib/i18n';
import { FormError } from '../form-bits';
import { LoadError } from '../load-error';
import { PageTitle } from '../page-title';
import { courseHref, formatAverage, GradeSpread, WeightsLine } from './grade-bits';

const queryOf = (c: CourseRef) =>
  `/grades/course?${c.classId ? `classId=${c.classId}` : `groupId=${c.groupId}`}&subjectId=${c.subjectId}`;

/**
 * Noten eines Kurses (Fach in Klasse oder Gruppe). Ohne Auswahl: Gewichtung, Leistungen und Übersicht; mit
 * `selected` die Erfassung einer Leistung. Nur die Lehrkraft des Kurses schreibt, alle anderen lesen.
 */
export function CourseScreen({ course, selected }: { course: CourseRef; selected?: string }) {
  const t = useT('grades');
  const key = ['grades', 'course', course.classId ?? course.groupId, course.subjectId];
  const q = useApi<CourseDetail>(key, queryOf(course));
  const d = q.data;
  const assessment = d?.assessments.find((a) => a.id === selected);
  const back = d?.canWrite || !course.classId ? '/noten' : `/noten/klasse/${course.classId}`;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 pt-4 pb-8 lg:px-6 lg:pt-6">
      <Button variant="ghost" size="sm" asChild iconLeft={ArrowLeft} className="self-start">
        <Link href={assessment ? courseHref(course) : back}>
          {assessment ? t('backToCourse') : t('backToGrades')}
        </Link>
      </Button>
      {q.isPending ? (
        <Skeleton className="h-64 w-full rounded-lg" />
      ) : !d ? (
        <LoadError error={q.error} onRetry={() => void q.refetch()} />
      ) : assessment ? (
        <AssessmentPanel d={d} a={assessment} queryKey={key} />
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <PageTitle area="noten">
              {d.course.subject.name} · {d.course.label}
            </PageTitle>
            {d.canWrite ? null : (
              <p className="flex items-center gap-2 text-body-sm text-ink-muted">
                <Eye aria-hidden="true" className="size-4" />
                {t('readOnly')}
              </p>
            )}
          </div>
          <WeightingCard d={d} queryKey={key} />
          <AssessmentsSection d={d} queryKey={key} />
          {d.assessments.length ? <OverviewTable d={d} /> : null}
        </>
      )}
    </div>
  );
}

// ───────────── Gewichtung ─────────────

function WeightingCard({ d, queryKey }: { d: CourseDetail; queryKey: unknown[] }) {
  const t = useT('grades');
  const tc = useT('common');
  const problem = useProblemText();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<GradeWeights>(d.weights);
  const save = useApiMutation<{ course: CourseRef; weights: GradeWeights }>(
    'PUT',
    () => '/grades/weighting',
    [queryKey],
  );
  const sum = ASSESSMENT_KINDS.reduce((s, k) => s + (draft[k] || 0), 0);
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-h3">{t('weighting')}</h2>
        {d.canWrite ? (
          <Button
            variant="secondary"
            size="sm"
            iconLeft={Pencil}
            aria-label={t('weightingEdit')}
            onClick={() => {
              setDraft(d.weights);
              save.reset();
              setOpen(true);
            }}
          >
            {tc('edit')}
          </Button>
        ) : null}
      </div>
      <p className="text-body-sm">
        <WeightsLine weights={d.weights} />
      </p>
      <p className="text-caption text-ink-muted">
        {d.defaultWeights ? t('weightingDefault') : t('weightingHelp')}
      </p>
      <Sheet
        open={open}
        onOpenChange={(o) => !o && setOpen(false)}
        title={t('weighting')}
        description={t('weightingHelp')}
        closeLabel={tc('close')}
      >
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(
              {
                course: {
                  classId: d.course.classId,
                  groupId: d.course.groupId,
                  subjectId: d.course.subjectId,
                },
                weights: draft,
              },
              { onSuccess: () => setOpen(false) },
            );
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            {ASSESSMENT_KINDS.map((k) => (
              <Input
                key={k}
                label={t(`kind_${k}`)}
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                mono
                value={String(draft[k])}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    [k]: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                  })
                }
              />
            ))}
          </div>
          <p className={cn('text-label', sum === 100 ? 'text-ink-muted' : 'text-danger-ink')}>
            {t('weightingSum', { sum })}
          </p>
          {save.error ? <FormError message={problem(save.error) ?? tc('error')} /> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button type="submit" disabled={sum !== 100} loading={save.isPending}>
              {tc('save')}
            </Button>
          </div>
        </form>
      </Sheet>
    </Card>
  );
}

// ───────────── Leistungen ─────────────

function AssessmentsSection({ d, queryKey }: { d: CourseDetail; queryKey: unknown[] }) {
  const t = useT('grades');
  const [open, setOpen] = useState(false);
  const students = d.students.length;
  return (
    <section aria-labelledby="assessments-h" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="assessments-h" className="text-h3">
          {t('assessments')}
        </h2>
        {d.canWrite ? (
          <Button iconLeft={Plus} size="sm" onClick={() => setOpen(true)}>
            {t('assessmentNew')}
          </Button>
        ) : null}
      </div>
      {d.assessments.length === 0 ? (
        <Card flat>
          <EmptyState
            as="h3"
            title={t('assessmentsEmpty')}
            description={t('assessmentsEmptyText')}
          />
        </Card>
      ) : (
        <Card className="p-0">
          <ul>
            {d.assessments.map((a) => {
              const graded = Object.keys(d.grades[a.id] ?? {}).length;
              return (
                <li key={a.id} className="border-b border-line last:border-b-0">
                  <Link
                    href={courseHref(d.course, a.id)}
                    className="pf-focusable flex min-h-16 flex-wrap items-center gap-3 px-4 py-3 hover:bg-brand-soft"
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-body-strong">{a.title}</span>
                      <span className="text-body-sm text-ink-muted">
                        {t(`kind_${a.kind}`)} · {weekdayDate(a.date)} ·{' '}
                        {t('gradedOf', { graded, total: students })}
                      </span>
                    </span>
                    <span className="text-mono text-ink-muted">
                      {t('averageShort', { average: formatAverage(a.distribution.average) })}
                    </span>
                    {a.releasedAt ? (
                      <Chip tone="ok" icon={Check}>
                        {t('released')}
                      </Chip>
                    ) : (
                      <Chip tone="late" icon={FilePen}>
                        {t('notReleased')}
                      </Chip>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      {d.canWrite ? (
        <AssessmentSheet d={d} open={open} onClose={() => setOpen(false)} queryKey={queryKey} />
      ) : null}
    </section>
  );
}

/** Neue Leistung (oder bearbeiten): Art, Bezeichnung, Datum; Prüfungen aus dem Kalender als Vorschlag. */
function AssessmentSheet({
  d,
  open,
  onClose,
  queryKey,
  edit,
}: {
  d: CourseDetail;
  open: boolean;
  onClose: () => void;
  queryKey: unknown[];
  edit?: AssessmentItem;
}) {
  const t = useT('grades');
  const tc = useT('common');
  const problem = useProblemText();
  const router = useRouter();
  const [kind, setKind] = useState<AssessmentKind>(edit?.kind ?? 'SCHULARBEIT');
  const [title, setTitle] = useState(edit?.title ?? '');
  const [date, setDate] = useState(edit?.date ?? todayVienna());
  const [examId, setExamId] = useState<string | null>(null);
  const create = useApiMutation<Record<string, unknown>, AssessmentItem>(
    'POST',
    () => '/grades/assessments',
    [queryKey, ['grades', 'courses']],
  );
  const patch = useApiMutation<Record<string, unknown>, AssessmentItem>(
    'PATCH',
    () => `/grades/assessments/${edit?.id}`,
    [queryKey],
  );
  const busy = create.isPending || patch.isPending;
  const error = create.error ?? patch.error;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (edit) {
      patch.mutate({ kind, title, date }, { onSuccess: onClose });
      return;
    }
    create.mutate(
      {
        course: {
          classId: d.course.classId,
          groupId: d.course.groupId,
          subjectId: d.course.subjectId,
        },
        kind,
        title,
        date,
        examId,
      },
      {
        onSuccess: (a) => {
          onClose();
          router.push(courseHref(d.course, a.id));
        },
      },
    );
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={edit ? t('assessmentEdit') : t('assessmentNew')}
      closeLabel={tc('close')}
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {!edit && d.examSuggestions.length ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-label">{t('fromCalendar')}</legend>
            <div className="flex flex-wrap gap-2">
              {d.examSuggestions.map((x) => (
                <Button
                  key={x.id}
                  type="button"
                  size="sm"
                  variant={examId === x.id ? 'primary' : 'secondary'}
                  aria-pressed={examId === x.id}
                  onClick={() => {
                    setExamId(examId === x.id ? null : x.id);
                    setKind(x.kind);
                    setTitle(x.title);
                    setDate(x.date);
                  }}
                >
                  {x.title} · {shortDate(x.date)}
                </Button>
              ))}
            </div>
          </fieldset>
        ) : null}
        <Select
          label={t('kind')}
          value={kind}
          onChange={(e) => setKind(e.target.value as AssessmentKind)}
          options={ASSESSMENT_KINDS.map((k) => ({ value: k, label: t(`kind_${k}`) }))}
        />
        <Input
          label={t('assessmentTitle')}
          value={title}
          maxLength={120}
          placeholder={t('assessmentTitlePlaceholder')}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Input
          label={t('date')}
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        {error ? <FormError message={problem(error) ?? tc('error')} /> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {tc('cancel')}
          </Button>
          <Button type="submit" disabled={!title.trim() || !date} loading={busy}>
            {tc('save')}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

// ───────────── Übersicht ─────────────

function OverviewTable({ d }: { d: CourseDetail }) {
  const t = useT('grades');
  return (
    <section aria-labelledby="overview-h" className="flex flex-col gap-3">
      <h2 id="overview-h" className="text-h3">
        {t('overview')}
      </h2>
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-body-sm">
          <thead>
            <tr className="text-left text-label text-ink-muted">
              <th scope="col" className="sticky left-0 bg-bg-raised px-4 py-2">
                {t('student')}
              </th>
              {d.assessments.map((a) => (
                <th key={a.id} scope="col" className="px-2 py-2 text-center whitespace-nowrap">
                  <abbr
                    title={`${a.title} (${t(`kind_${a.kind}`)}, ${shortDate(a.date)})`}
                    className="no-underline"
                  >
                    {t(`kindShort_${a.kind}`)} {shortDate(a.date)}
                  </abbr>
                </th>
              ))}
              <th scope="col" className="px-4 py-2 text-right">
                {t('average')}
              </th>
            </tr>
          </thead>
          <tbody>
            {d.students.map((s) => (
              <tr key={s.id} className="border-t border-line">
                <th
                  scope="row"
                  className="sticky left-0 bg-bg-raised px-4 py-2 text-left text-body-sm whitespace-nowrap"
                >
                  {s.name}
                </th>
                {d.assessments.map((a) => (
                  <td key={a.id} className="px-2 py-2 text-center text-mono">
                    {d.grades[a.id]?.[s.id] ?? '–'}
                  </td>
                ))}
                <td className="px-4 py-2 text-right text-mono text-body-strong">
                  {formatAverage(d.averages[s.id])}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="text-caption text-ink-muted">{t('averageHint')}</p>
    </section>
  );
}

// ───────────── Erfassung einer Leistung ─────────────

function AssessmentPanel({
  d,
  a,
  queryKey,
}: {
  d: CourseDetail;
  a: AssessmentItem;
  queryKey: unknown[];
}) {
  const t = useT('grades');
  const tc = useT('common');
  const problem = useProblemText();
  const toast = useToast();
  const router = useRouter();
  const [local, setLocal] = useState<Record<string, number | null>>({});
  const [sheet, setSheet] = useState<'edit' | 'release' | 'delete' | null>(null);
  const [commentFor, setCommentFor] = useState<{ id: string; name: string } | null>(null);
  const [comment, setComment] = useState('');
  const put = useApiMutation<{
    items: { studentId: string; value: number | null; comment?: string | null }[];
  }>('PUT', () => `/grades/assessments/${a.id}/grades`, [queryKey]);
  const release = useApiMutation<void>('POST', () => `/grades/assessments/${a.id}/release`, [
    queryKey,
    ['grades', 'courses'],
  ]);
  const remove = useApiMutation<string>('DELETE', (id) => `/grades/assessments/${id}`, [
    queryKey,
    ['grades', 'courses'],
  ]);
  const value = (id: string): number | null =>
    id in local ? (local[id] ?? null) : (d.grades[a.id]?.[id] ?? null);
  const graded = d.students.filter((s) => value(s.id) !== null).length;
  const write = d.canWrite;

  function setGrade(studentId: string, v: number | null) {
    const before = value(studentId);
    setLocal((l) => ({ ...l, [studentId]: v }));
    put.mutate(
      { items: [{ studentId, value: v, comment: d.comments[a.id]?.[studentId] ?? null }] },
      {
        onError: () => setLocal((l) => ({ ...l, [studentId]: before })),
      },
    );
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <p className="text-overline text-brand-text">
          {d.course.subject.name} · {d.course.label}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-h1">{a.title}</h1>
          {write ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                iconLeft={Pencil}
                onClick={() => setSheet('edit')}
              >
                {tc('edit')}
              </Button>
              {a.releasedAt ? null : (
                <Button
                  variant="ghost"
                  size="sm"
                  iconLeft={Trash2}
                  onClick={() => setSheet('delete')}
                >
                  {tc('delete')}
                </Button>
              )}
            </div>
          ) : null}
        </div>
        <p className="flex flex-wrap items-center gap-2 text-body-sm text-ink-muted">
          {t(`kind_${a.kind}`)} · {weekdayDate(a.date)}
          {a.releasedAt ? (
            <Chip tone="ok" icon={Check}>
              {t('releasedAt', { date: shortDate(a.releasedAt.slice(0, 10)) })}
            </Chip>
          ) : (
            <Chip tone="late" icon={FilePen}>
              {t('notReleased')}
            </Chip>
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]">
        <section aria-labelledby="entry-h" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="entry-h" className="text-h3">
              {write ? t('entry') : t('student')}
            </h2>
            <p className="text-body-sm text-ink-muted" aria-live="polite">
              {t('gradedOf', { graded, total: d.students.length })}
            </p>
          </div>
          {write ? <p className="text-body-sm text-ink-muted">{t('entryHint')}</p> : null}
          {put.error ? <FormError message={problem(put.error) ?? tc('error')} /> : null}
          <Card className="p-0">
            <ul>
              {d.students.map((s) => {
                const v = value(s.id);
                const note = d.comments[a.id]?.[s.id];
                return (
                  <li
                    key={s.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-2 last:border-b-0"
                  >
                    <span className="flex min-w-40 flex-1 flex-col">
                      <span className="text-body">{s.name}</span>
                      {note ? <span className="text-caption text-ink-muted">{note}</span> : null}
                    </span>
                    {write ? (
                      <span
                        role="group"
                        aria-label={t('gradeFor', { name: s.name })}
                        className="flex items-center gap-1"
                      >
                        {GRADE_VALUES.map((g) => (
                          <button
                            key={g}
                            type="button"
                            aria-pressed={v === g}
                            aria-label={`${g} ${t(`grade_${g}`)}`}
                            title={t(`grade_${g}`)}
                            onClick={() => setGrade(s.id, v === g ? null : g)}
                            className={cn(
                              'pf-focusable inline-flex size-(--tap-min) items-center justify-center rounded-md text-mono transition-colors',
                              v === g
                                ? g === 5
                                  ? 'bg-signal text-on-signal'
                                  : 'bg-brand text-on-brand'
                                : 'bg-bg-sunken text-ink hover:bg-brand-soft',
                            )}
                          >
                            {g}
                          </button>
                        ))}
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={t('commentFor', { name: s.name })}
                          disabled={v === null}
                          onClick={() => {
                            setComment(note ?? '');
                            setCommentFor({ id: s.id, name: s.name });
                          }}
                        >
                          <MessageSquare aria-hidden="true" />
                        </Button>
                      </span>
                    ) : (
                      <span className="text-mono text-body-strong">
                        {v === null ? '–' : `${v} · ${t(`grade_${v}`)}`}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        </section>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-[calc(var(--topbar-h)+var(--space-4))]">
          <Card className="flex flex-col gap-3">
            <h2 className="text-h3">{t('spread')}</h2>
            <GradeSpread distribution={a.distribution} />
          </Card>
          {write && !a.releasedAt ? (
            <Card className="flex flex-col gap-3">
              <p className="text-body-sm text-ink-muted">{t('releaseHint')}</p>
              <Button iconLeft={Send} disabled={graded === 0} onClick={() => setSheet('release')}>
                {t('release')}
              </Button>
            </Card>
          ) : null}
          {write && a.releasedAt ? (
            <Banner tone="brand" icon={Check}>
              {t('releasedHint')}
            </Banner>
          ) : null}
        </aside>
      </div>

      <AssessmentSheet
        d={d}
        edit={a}
        open={sheet === 'edit'}
        onClose={() => setSheet(null)}
        queryKey={queryKey}
      />

      <Sheet
        open={sheet === 'release'}
        onOpenChange={(o) => !o && setSheet(null)}
        title={t('releaseConfirm')}
        description={t('releaseConfirmText', { graded, total: d.students.length })}
        closeLabel={tc('close')}
      >
        {release.error ? <FormError message={problem(release.error) ?? tc('error')} /> : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setSheet(null)}>
            {tc('cancel')}
          </Button>
          <Button
            iconLeft={Send}
            loading={release.isPending}
            onClick={() =>
              release.mutate(undefined, {
                onSuccess: () => {
                  setSheet(null);
                  toast({ text: t('releasedToast') });
                },
              })
            }
          >
            {t('release')}
          </Button>
        </div>
      </Sheet>

      <Sheet
        open={sheet === 'delete'}
        onOpenChange={(o) => !o && setSheet(null)}
        title={t('deleteConfirm')}
        description={t('deleteConfirmText')}
        closeLabel={tc('close')}
      >
        {remove.error ? <FormError message={problem(remove.error) ?? tc('error')} /> : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setSheet(null)}>
            {tc('cancel')}
          </Button>
          <Button
            variant="danger"
            loading={remove.isPending}
            onClick={() =>
              remove.mutate(a.id, { onSuccess: () => router.push(courseHref(d.course)) })
            }
          >
            {tc('delete')}
          </Button>
        </div>
      </Sheet>

      <Sheet
        open={commentFor !== null}
        onOpenChange={(o) => !o && setCommentFor(null)}
        title={commentFor ? t('commentFor', { name: commentFor.name }) : ''}
        description={t('commentHint')}
        closeLabel={tc('close')}
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!commentFor) return;
            put.mutate(
              {
                items: [
                  {
                    studentId: commentFor.id,
                    value: value(commentFor.id),
                    comment: comment.trim() || null,
                  },
                ],
              },
              { onSuccess: () => setCommentFor(null) },
            );
          }}
        >
          <Textarea
            label={t('comment')}
            rows={3}
            maxLength={500}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setCommentFor(null)}>
              {tc('cancel')}
            </Button>
            <Button type="submit" loading={put.isPending}>
              {tc('save')}
            </Button>
          </div>
        </form>
      </Sheet>
    </>
  );
}
