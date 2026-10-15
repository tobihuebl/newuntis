'use client';
import {
  ArrowLeft,
  BellRing,
  Check,
  CircleDashed,
  FileSignature,
  Lock,
  Plus,
  Printer,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type {
  ConsentAnswer,
  ConsentCounts,
  ConsentFormDetail,
  ConsentFormItem,
  ConsentFormOptions,
  MyConsentForm,
} from '@sp/shared';
import {
  Banner,
  Button,
  Card,
  CardSub,
  CardTitle,
  Checkbox,
  Chip,
  EmptyState,
  Input,
  Select,
  Skeleton,
  Textarea,
  useToast,
} from '@sp/ui';
import { dateTimeOf, shortDate } from '../../lib/dates';
import { useT } from '../../lib/i18n';
import { useApi, useApiMutation, useProblemText } from '../../lib/use-api';
import { FormError } from '../form-bits';
import { LoadError } from '../load-error';
import { PageTitle } from '../page-title';

const PAGE = 'mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-4 pb-8 lg:px-6 lg:pt-6';

function AnswerChip({ answer, onPaper }: { answer: ConsentAnswer; onPaper?: boolean }) {
  const t = useT('consent');
  const label = t(`answer_${answer}`) + (onPaper ? ` · ${t('onPaper')}` : '');
  if (answer === 'YES')
    return (
      <Chip tone="ok" icon={Check}>
        {label}
      </Chip>
    );
  if (answer === 'NO')
    return (
      <Chip tone="absent" icon={X}>
        {label}
      </Chip>
    );
  return (
    <Chip tone="late" icon={CircleDashed}>
      {label}
    </Chip>
  );
}

function Counts({ c }: { c: ConsentCounts }) {
  const t = useT('consent');
  return (
    <p className="flex flex-wrap gap-2">
      <Chip tone="ok" icon={Check}>
        {t('countYes', { count: c.yes })}
      </Chip>
      {c.no ? (
        <Chip tone="absent" icon={X}>
          {t('countNo', { count: c.no })}
        </Chip>
      ) : null}
      {c.open ? (
        <Chip tone="late" icon={CircleDashed}>
          {t('countOpen', { count: c.open })}
        </Chip>
      ) : null}
    </p>
  );
}

// ───────────────────────── Lehrkräfte, Direktion, Administration ─────────────────────────

/** Liste der Erklärungen mit Stand der Antworten. */
export function ConsentFormsScreen() {
  const t = useT('consent');
  const q = useApi<{ data: ConsentFormItem[] }>(['consent-forms'], '/consent-forms');
  return (
    <div className={PAGE}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <PageTitle area="kommunikation">{t('title')}</PageTitle>
          <p className="text-body-sm text-ink-muted">{t('intro')}</p>
        </div>
        <Button asChild iconLeft={Plus}>
          <Link href="/einverstaendnis/neu">{t('new')}</Link>
        </Button>
      </div>
      {q.isError ? (
        <LoadError error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <Skeleton className="h-40 w-full rounded-lg" />
      ) : q.data.data.length === 0 ? (
        <Card flat>
          <EmptyState as="h2" title={t('empty')} description={t('emptyText')} />
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {q.data.data.map((f) => (
            <li key={f.id}>
              <Card interactive asChild className="flex flex-col gap-2">
                <Link href={`/einverstaendnis/${f.id}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <CardTitle as="h2">{f.title}</CardTitle>
                    {f.closed ? (
                      <Chip icon={Lock}>{t('closed')}</Chip>
                    ) : f.dueOn ? (
                      <Chip>{t('dueOn', { date: shortDate(f.dueOn) })}</Chip>
                    ) : null}
                  </div>
                  <CardSub className="mt-0">
                    {[f.classes.join(', '), f.createdBy].filter(Boolean).join(' · ')}
                  </CardSub>
                  <Counts c={f.counts} />
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Neue Erklärung: Text, Frist, Klassen ganz oder einzelne Schüler:innen. */
export function NewConsentForm() {
  const t = useT('consent');
  const problem = useProblemText();
  const toast = useToast();
  const router = useRouter();
  const opts = useApi<ConsentFormOptions>(['consent-forms', 'options'], '/consent-forms/options');
  const create = useApiMutation<
    { title: string; body: string; dueOn: string | null; studentIds: string[] },
    { id: string; notified: number }
  >('POST', () => '/consent-forms', [['consent-forms']]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [dueOn, setDueOn] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const set = (ids: string[], on: boolean) => {
    const n = new Set(picked);
    for (const id of ids) {
      if (on) n.add(id);
      else n.delete(id);
    }
    setPicked(n);
  };
  const paperOnly = (opts.data?.classes ?? [])
    .flatMap((c) => c.students)
    .filter((s) => picked.has(s.id) && s.guardians === 0).length;

  return (
    <div className={PAGE}>
      <Button variant="ghost" size="sm" asChild iconLeft={ArrowLeft} className="self-start">
        <Link href="/einverstaendnis">{t('back')}</Link>
      </Button>
      <PageTitle area="kommunikation">{t('new')}</PageTitle>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate(
            { title, body, dueOn: dueOn || null, studentIds: [...picked] },
            {
              onSuccess: (r) => {
                toast({ text: t('sent', { count: r.notified }) });
                router.push(`/einverstaendnis/${r.id}`);
              },
            },
          );
        }}
      >
        <Input
          label={t('fieldTitle')}
          placeholder={t('fieldTitlePlaceholder')}
          value={title}
          maxLength={120}
          required
          onChange={(e) => setTitle(e.target.value)}
        />
        <Textarea
          label={t('fieldBody')}
          hint={t('fieldBodyHint')}
          value={body}
          rows={6}
          maxLength={5000}
          required
          onChange={(e) => setBody(e.target.value)}
        />
        <Input
          label={t('fieldDue')}
          hint={t('fieldDueHint')}
          type="date"
          value={dueOn}
          onChange={(e) => setDueOn(e.target.value)}
          fieldClassName="sm:max-w-xs"
        />
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-label">{t('fieldWho')}</legend>
          {opts.isError ? (
            <LoadError error={opts.error} onRetry={() => void opts.refetch()} />
          ) : !opts.data ? (
            <Skeleton className="h-24 w-full" />
          ) : opts.data.classes.length === 0 ? (
            <p className="text-body-sm text-ink-muted">{t('noClasses')}</p>
          ) : (
            opts.data.classes.map((c) => {
              const ids = c.students.map((s) => s.id);
              const n = ids.filter((id) => picked.has(id)).length;
              return (
                <Card key={c.id} flat className="flex flex-col gap-2">
                  <Checkbox
                    label={t('wholeClass', { name: c.name, count: c.students.length })}
                    checked={n > 0 && n === ids.length}
                    onChange={(e) => set(ids, e.target.checked)}
                  />
                  <details className="group">
                    <summary className="pf-focusable cursor-pointer rounded-xs text-label text-brand-text">
                      {t('pickStudents', { picked: n, total: ids.length })}
                    </summary>
                    <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
                      {c.students.map((s) => (
                        <li key={s.id}>
                          <Checkbox
                            label={s.name}
                            hint={s.guardians === 0 ? t('paperOnly') : undefined}
                            checked={picked.has(s.id)}
                            onChange={(e) => set([s.id], e.target.checked)}
                          />
                        </li>
                      ))}
                    </ul>
                  </details>
                </Card>
              );
            })
          )}
        </fieldset>
        {paperOnly ? (
          <Banner tone="signal">{t('paperOnlyHint', { count: paperOnly })}</Banner>
        ) : null}
        {create.error ? <FormError message={problem(create.error)} /> : null}
        <Button
          type="submit"
          className="self-start"
          iconLeft={FileSignature}
          loading={create.isPending}
          disabled={!title.trim() || !body.trim() || picked.size === 0}
        >
          {t('send', { count: picked.size })}
        </Button>
      </form>
    </div>
  );
}

/** Stand je Kind, Zettel-Antworten nachtragen, erinnern, abschließen, drucken. */
export function ConsentFormDetailScreen({ id }: { id: string }) {
  const t = useT('consent');
  const tc = useT('common');
  const problem = useProblemText();
  const toast = useToast();
  const key = ['consent-forms', id];
  const q = useApi<ConsentFormDetail>(key, `/consent-forms/${id}`);
  const remind = useApiMutation<object, { reminded: number }>(
    'POST',
    () => `/consent-forms/${id}/remind`,
    [key],
  );
  const close = useApiMutation<object>('POST', () => `/consent-forms/${id}/close`, [
    key,
    ['consent-forms'],
  ]);
  const paper = useApiMutation<{ studentId: string; answer: ConsentAnswer }>(
    'PUT',
    (b) => `/consent-forms/${id}/answers/${b.studentId}`,
    [key, ['consent-forms']],
  );
  const d = q.data;
  const error = remind.error ?? close.error ?? paper.error;

  return (
    <div className={PAGE}>
      <Button
        variant="ghost"
        size="sm"
        asChild
        iconLeft={ArrowLeft}
        className="self-start print:hidden"
      >
        <Link href="/einverstaendnis">{t('back')}</Link>
      </Button>
      {q.isError ? (
        <LoadError error={q.error} onRetry={() => void q.refetch()} />
      ) : !d ? (
        <Skeleton className="h-64 w-full rounded-lg" />
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <PageTitle area="kommunikation">{d.title}</PageTitle>
            <p className="text-body-sm text-ink-muted">
              {[
                d.classes.join(', '),
                d.createdBy,
                d.dueOn ? t('dueOn', { date: shortDate(d.dueOn) }) : t('noDue'),
              ].join(' · ')}
            </p>
          </div>
          <Card flat>
            <p className="whitespace-pre-line text-body">{d.body}</p>
          </Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Counts c={d.counts} />
            <div className="flex flex-wrap gap-2 print:hidden">
              {!d.closed && d.counts.open > 0 ? (
                <Button
                  size="sm"
                  variant="secondary"
                  iconLeft={BellRing}
                  loading={remind.isPending}
                  onClick={() =>
                    remind.mutate(
                      {},
                      { onSuccess: (r) => toast({ text: t('reminded', { count: r.reminded }) }) },
                    )
                  }
                >
                  {t('remind')}
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" iconLeft={Printer} onClick={() => window.print()}>
                {t('print')}
              </Button>
              {d.mine && !d.closed ? (
                <Button
                  size="sm"
                  variant="ghost"
                  iconLeft={Lock}
                  loading={close.isPending}
                  onClick={() =>
                    close.mutate({}, { onSuccess: () => toast({ text: t('closedToast') }) })
                  }
                >
                  {t('close')}
                </Button>
              ) : null}
            </div>
          </div>
          {d.closed ? <Banner tone="brand">{t('closedHint')}</Banner> : null}
          {error ? <FormError message={problem(error) ?? tc('error')} /> : null}
          <Card className="p-0">
            <ul>
              {d.rows.map((r) => (
                <li
                  key={r.studentId}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-3 last:border-b-0"
                >
                  <span className="flex min-w-48 flex-1 flex-col">
                    <span className="text-body-strong">
                      {r.name} <span className="text-body-sm text-ink-muted">{r.className}</span>
                    </span>
                    {r.note ? (
                      <span className="text-body-sm">{t('note', { note: r.note })}</span>
                    ) : null}
                    {r.answeredBy && r.answeredAt ? (
                      <span className="text-caption text-ink-muted">
                        {t('answeredBy', { name: r.answeredBy, at: dateTimeOf(r.answeredAt) })}
                      </span>
                    ) : r.guardians === 0 ? (
                      <span className="text-caption text-ink-muted">{t('paperOnly')}</span>
                    ) : null}
                  </span>
                  <AnswerChip answer={r.answer} onPaper={r.onPaper} />
                  {r.answer === 'OPEN' || r.onPaper ? (
                    <Select
                      label={t('paperFor', { name: r.name })}
                      hideLabel
                      fieldClassName="w-full sm:w-44 print:hidden"
                      value={r.onPaper ? r.answer : ''}
                      onChange={(e) =>
                        paper.mutate({
                          studentId: r.studentId,
                          answer: (e.target.value || 'OPEN') as ConsentAnswer,
                        })
                      }
                      options={[
                        { value: '', label: t('paperNone') },
                        { value: 'YES', label: t('paperYes') },
                        { value: 'NO', label: t('paperNo') },
                      ]}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}

// ───────────────────────── Eltern ─────────────────────────

/** Erklärungen für die eigenen Kinder: je Kind Ja oder Nein, optional mit Anmerkung. */
export function MyConsentForms() {
  const t = useT('consent');
  const q = useApi<{ data: MyConsentForm[] }>(['consent-forms', 'mine'], '/me/consent-forms');
  return (
    <div className={PAGE}>
      <div className="flex flex-col gap-2">
        <PageTitle area="familie">{t('title')}</PageTitle>
        <p className="text-body-sm text-ink-muted">{t('mineIntro')}</p>
      </div>
      {q.isError ? (
        <LoadError error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <Skeleton className="h-40 w-full rounded-lg" />
      ) : q.data.data.length === 0 ? (
        <Card flat>
          <EmptyState as="h2" title={t('mineEmpty')} />
        </Card>
      ) : (
        <ul className="flex flex-col gap-4">
          {q.data.data.map((f) => (
            <li key={f.id}>
              <MyForm f={f} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MyForm({ f }: { f: MyConsentForm }) {
  const t = useT('consent');
  const open = !f.closed && f.children.some((c) => c.answer === 'OPEN');
  return (
    <Card className="flex flex-col gap-3" tone={open ? 'signal' : undefined}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <CardTitle as="h2">{f.title}</CardTitle>
        {f.closed ? (
          <Chip icon={Lock}>{t('closed')}</Chip>
        ) : f.dueOn ? (
          <Chip tone={open ? 'late' : undefined}>
            {t('answerBy', { date: shortDate(f.dueOn) })}
          </Chip>
        ) : null}
      </div>
      <CardSub className="mt-0">{t('from', { name: f.createdBy })}</CardSub>
      <p className="whitespace-pre-line text-body">{f.body}</p>
      <ul className="flex flex-col gap-3">
        {f.children.map((c) => (
          <li key={c.studentId}>
            <ChildAnswer formId={f.id} closed={f.closed} c={c} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ChildAnswer({
  formId,
  closed,
  c,
}: {
  formId: string;
  closed: boolean;
  c: MyConsentForm['children'][number];
}) {
  const t = useT('consent');
  const problem = useProblemText();
  const toast = useToast();
  const [note, setNote] = useState(c.note ?? '');
  const save = useApiMutation<{ answer: 'YES' | 'NO'; note: string | null }>(
    'PUT',
    () => `/me/consent-forms/${formId}/answers/${c.studentId}`,
    [['consent-forms', 'mine']],
  );
  const send = (answer: 'YES' | 'NO') =>
    save.mutate(
      { answer, note: note.trim() || null },
      { onSuccess: () => toast({ text: t(answer === 'YES' ? 'savedYes' : 'savedNo') }) },
    );
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-bg-raised p-3 ring-1 ring-line">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-body-strong">{c.firstName}</span>
        <AnswerChip answer={c.answer} onPaper={c.onPaper} />
      </div>
      {c.answeredBy && c.answeredAt ? (
        <span className="text-caption text-ink-muted">
          {t('answeredBy', { name: c.answeredBy, at: dateTimeOf(c.answeredAt) })}
        </span>
      ) : null}
      {closed ? null : (
        <>
          <Input
            label={t('noteLabel')}
            hint={t('noteHint')}
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
          />
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label={t('answerFor', { name: c.firstName })}
          >
            <Button
              variant={c.answer === 'YES' ? 'primary' : 'secondary'}
              iconLeft={Check}
              aria-pressed={c.answer === 'YES'}
              loading={save.isPending && save.variables?.answer === 'YES'}
              onClick={() => send('YES')}
            >
              {t('yes')}
            </Button>
            <Button
              variant={c.answer === 'NO' ? 'primary' : 'secondary'}
              iconLeft={X}
              aria-pressed={c.answer === 'NO'}
              loading={save.isPending && save.variables?.answer === 'NO'}
              onClick={() => send('NO')}
            >
              {t('no')}
            </Button>
          </div>
          {save.error ? <FormError message={problem(save.error)} /> : null}
        </>
      )}
    </div>
  );
}

/** Hinweis unter "Heute" für Eltern: offene Erklärungen mit Weg zur Antwort. */
export function ConsentHint() {
  const t = useT('consent');
  const q = useApi<{ data: MyConsentForm[] }>(['consent-forms', 'mine'], '/me/consent-forms');
  const open = (q.data?.data ?? []).filter(
    (f) => !f.closed && f.children.some((c) => c.answer === 'OPEN'),
  );
  if (open.length === 0) return null;
  return (
    <Card interactive tone="signal" flat asChild className="flex items-center gap-3">
      <Link href="/einverstaendnis">
        <FileSignature aria-hidden="true" className="size-6 shrink-0 text-brand-text" />
        <span className="flex flex-col">
          <span className="text-body-strong">{t('hint', { count: open.length })}</span>
          <span className="text-body-sm">{open.map((f) => f.title).join(' · ')}</span>
        </span>
      </Link>
    </Card>
  );
}
