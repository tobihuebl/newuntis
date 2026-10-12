'use client';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { EXAM_KINDS, addDays, type ExamItem, type ExamWarning } from '@sp/shared';
import { Button, Card, EmptyState, Input, Select, Skeleton } from '@sp/ui';
import { ApiError } from '../../lib/api-client';
import { todayVienna, weekdayDate } from '../../lib/dates';
import { useApi, useApiMutation, useProblemText } from '../../lib/use-api';

interface Options {
  classes: { id: string; name: string; subjects: { id: string; name: string }[] }[];
}

/** Prüfungskalender (PN-01) mit Kollisionswarnung: bewusst "trotzdem eintragen". */
export function ExamsScreen() {
  const t = useTranslations('exams');
  const problem = useProblemText();
  const today = todayVienna();
  const options = useApi<Options>(['exams', 'options'], '/exams/options');
  const list = useApi<{ data: ExamItem[] }>(
    ['exams', 'list'],
    `/exams?from=${today}&to=${addDays(today, 180)}`,
  );
  const create = useApiMutation<object, { warnings: ExamWarning[] }>('POST', () => '/exams', [
    ['exams'],
  ]);
  const remove = useApiMutation<string>('DELETE', (id) => `/exams/${id}`, [['exams']]);
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [date, setDate] = useState(addDays(today, 7));
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<(typeof EXAM_KINDS)[number]>('Schularbeit');
  const [warnings, setWarnings] = useState<ExamWarning[] | null>(null);
  const cls = options.data?.classes.find((c) => c.id === classId);
  const warningText = (w: ExamWarning[]) =>
    w
      .map((x) =>
        t(x.code === 'EXAM_DAY_LIMIT' ? 'dayLimit' : 'weekLimit', {
          count: x.count,
          limit: x.limit,
        }),
      )
      .join('; ');

  async function submit(force: boolean) {
    setWarnings(null);
    try {
      await create.mutateAsync({ classId, subjectId, date, title, kind, force });
      setTitle('');
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.problem.status === 409 &&
        Array.isArray(err.problem.warnings)
      )
        setWarnings(err.problem.warnings as ExamWarning[]);
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <Card>
        {!options.data ? (
          <Skeleton className="h-40 w-full" />
        ) : options.data.classes.length === 0 ? (
          <p className="text-muted">{t('noPairs')}</p>
        ) : (
          <form
            className="flex flex-col gap-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void submit(false);
            }}
          >
            <h2 className="text-lg font-semibold">{t('add')}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                label={t('class')}
                value={classId}
                emptyLabel="–"
                onChange={(e) => {
                  setClassId(e.target.value);
                  setSubjectId('');
                }}
                options={options.data.classes.map((c) => ({ value: c.id, label: c.name }))}
              />
              <Select
                label={t('subject')}
                value={subjectId}
                emptyLabel="–"
                disabled={!cls}
                onChange={(e) => setSubjectId(e.target.value)}
                options={(cls?.subjects ?? []).map((s) => ({ value: s.id, label: s.name }))}
              />
              <Input
                label={t('date')}
                type="date"
                min={today}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
              <Select
                label={t('kind')}
                value={kind}
                onChange={(e) => setKind(e.target.value as (typeof EXAM_KINDS)[number])}
                options={EXAM_KINDS.map((k) => ({ value: k, label: t(`kinds.${k}`) }))}
              />
            </div>
            <Input
              label={t('name')}
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
            />
            {warnings ? (
              <div
                role="alert"
                className="flex flex-col gap-2 rounded-sm border border-warning p-3 text-sm"
              >
                <p>{t('warning', { messages: warningText(warnings) })}</p>
                <Button
                  variant="secondary"
                  className="self-start"
                  onClick={() => void submit(true)}
                >
                  {t('force')}
                </Button>
              </div>
            ) : create.error &&
              !(create.error instanceof ApiError && create.error.problem.status === 409) ? (
              <p role="alert" className="text-sm text-danger">
                {problem(create.error)}
              </p>
            ) : null}
            <Button
              type="submit"
              disabled={!classId || !subjectId || !title.trim() || create.isPending}
              className="self-start"
            >
              {t('save')}
            </Button>
          </form>
        )}
      </Card>
      <section aria-labelledby="upcoming" className="flex flex-col gap-2">
        <h2 id="upcoming" className="text-lg font-semibold">
          {t('upcoming')}
        </h2>
        {!list.data ? (
          <Skeleton className="h-24 w-full" />
        ) : list.data.data.length === 0 ? (
          <Card>
            <EmptyState title={t('none')} />
          </Card>
        ) : (
          <Card className="p-0">
            <ExamRows items={list.data.data} onDelete={(id) => remove.mutate(id)} />
          </Card>
        )}
      </section>
    </div>
  );
}

export function ExamRows({
  items,
  onDelete,
}: {
  items: ExamItem[];
  onDelete?: (id: string) => void;
}) {
  const t = useTranslations('exams');
  return (
    <ul>
      {items.map((x) => (
        <li
          key={x.id}
          className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 last:border-b-0"
        >
          <div className="min-w-0">
            <p className="font-medium">{x.title}</p>
            <p className="text-sm text-muted">
              {x.subject.name}
              {x.class ? ` · ${x.class.name}` : ''} · {t(`kinds.${x.kind}`)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm tabular-nums">{weekdayDate(x.date)}</span>
            {onDelete && x.canEdit ? (
              <Button variant="ghost" onClick={() => onDelete(x.id)}>
                {t('delete')}
              </Button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
