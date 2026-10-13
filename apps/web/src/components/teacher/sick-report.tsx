'use client';
import { Check } from 'lucide-react';
import { useState } from 'react';
import { addDays, type TeacherAbsenceItem } from '@sp/shared';
import {
  Button,
  Card,
  Checkbox,
  EmptyState,
  Input,
  Select,
  Skeleton,
  Textarea,
  useToast,
} from '@sp/ui';
import { dateTimeOf, todayVienna } from '../../lib/dates';
import { useApi, useApiMutation, useProblemText } from '../../lib/use-api';
import { useT } from '../../lib/i18n';
import { PageTitle } from '../page-title';
import { FormError } from '../form-bits';
import { LoadError } from '../load-error';

const PERIODS = Array.from({ length: 10 }, (_, i) => ({
  value: String(i + 1),
  label: `${i + 1}.`,
}));

/** Krankmeldung der Lehrkraft (AB-04): löst die Supplierungsplanung aus. */
export function SickReport() {
  const t = useT('sick');
  const problem = useProblemText();
  const today = todayVienna();
  const list = useApi<{ data: TeacherAbsenceItem[] }>(
    ['teacher-absences', 'mine'],
    `/teacher-absences?from=${today}&to=${addDays(today, 60)}`,
  );
  const create = useApiMutation<object, TeacherAbsenceItem>('POST', () => '/teacher-absences', [
    ['teacher-absences'],
  ]);
  const remove = useApiMutation<string>('DELETE', (id) => `/teacher-absences/${id}`, [
    ['teacher-absences'],
  ]);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [partial, setPartial] = useState(false);
  const [fp, setFp] = useState('1');
  const [tp, setTp] = useState('6');
  const [note, setNote] = useState('');
  const toast = useToast();

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 pt-4 pb-8 lg:px-6 lg:pt-6">
      <PageTitle area="unterricht">{t('title')}</PageTitle>
      <p className="text-body text-ink-muted">{t('help')}</p>
      <Card>
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            await create.mutateAsync({
              fromDate: from,
              toDate: to,
              fromPeriod: partial ? Number(fp) : null,
              toPeriod: partial ? Number(tp) : null,
              kind: 'SICK',
              note: note || null,
            });
            toast({ text: t('sent'), icon: Check });
            setNote('');
          }}
        >
          <div className="flex flex-wrap gap-3">
            <Input
              label={t('from')}
              type="date"
              value={from}
              min={today}
              onChange={(e) => setFrom(e.target.value)}
              className="w-44"
            />
            <Input
              label={t('to')}
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
              className="w-44"
            />
          </div>
          <Checkbox
            label={t('onlyLessons')}
            checked={partial}
            onChange={(e) => setPartial(e.target.checked)}
          />
          {partial ? (
            <div className="flex flex-wrap gap-3">
              <Select
                label={t('fromPeriod')}
                value={fp}
                onChange={(e) => setFp(e.target.value)}
                options={PERIODS}
              />
              <Select
                label={t('toPeriod')}
                value={tp}
                onChange={(e) => setTp(e.target.value)}
                options={PERIODS}
              />
            </div>
          ) : null}
          <Textarea
            label={t('note')}
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
          />
          {create.error ? <FormError message={problem(create.error)} /> : null}
          <Button type="submit" loading={create.isPending} className="self-start">
            {t('send')}
          </Button>
        </form>
      </Card>
      <section aria-labelledby="mine" className="flex flex-col gap-3">
        <h2 id="mine" className="text-h3">
          {t('mine')}
        </h2>
        {list.isError ? (
          <LoadError error={list.error} onRetry={() => void list.refetch()} />
        ) : !list.data ? (
          <Skeleton className="h-16 w-full" />
        ) : list.data.data.length === 0 ? (
          <Card flat>
            <EmptyState as="h3" title={t('none')} />
          </Card>
        ) : (
          <Card className="p-0">
            <ul>
              {list.data.data.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 last:border-b-0"
                >
                  <div>
                    <p className="text-body-strong">
                      {dateTimeOf(a.fromAt)} – {dateTimeOf(a.toAt)}
                    </p>
                    <p className="text-body-sm text-ink-muted">
                      {t('affected', {
                        n:
                          a.substitutions.open +
                          a.substitutions.assigned +
                          a.substitutions.published,
                      })}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(a.id)}
                  >
                    {t('delete')}
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}
