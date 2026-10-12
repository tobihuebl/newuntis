'use client';
import { Download } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { addDays, type AttendanceReport, type SubstitutionReport } from '@sp/shared';
import { Button, Card, EmptyState, Input, SegmentedControl, Select, Skeleton } from '@sp/ui';
import { todayVienna } from '../../lib/dates';
import { useApi } from '../../lib/use-api';
import { useT } from '../../lib/i18n';
import { PageTitle } from '../page-title';
import { FormError } from '../form-bits';

type Tab = 'attendance' | 'substitutions';

function Table({
  caption,
  head,
  rows,
}: {
  caption: string;
  head: string[];
  rows: (string | number)[][];
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-line bg-bg-raised">
      <table className="w-full text-body-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line text-left text-ink-muted">
            {head.map((h, i) => (
              <th
                key={h}
                scope="col"
                className={i === 0 ? 'px-4 py-2 font-medium' : 'px-3 py-2 text-right font-medium'}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line last:border-b-0">
              {r.map((c, j) =>
                j === 0 ? (
                  <th key={j} scope="row" className="px-4 py-2 text-left font-normal">
                    {c}
                  </th>
                ) : (
                  <td key={j} className="px-3 py-2 text-right tabular-nums">
                    {c}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Basis-Auswertungen (DB-03): Anwesenheit je Klasse und Schüler:in, Supplierstunden, Export als CSV. */
export function ReportsScreen({ schoolWide }: { schoolWide: boolean }) {
  const t = useT('reports');
  const tc = useT('common');
  const router = useRouter();
  const search = useSearchParams();
  const today = todayVienna();
  const [from, setFrom] = useState(search.get('von') ?? `${today.slice(0, 8)}01`);
  const [to, setTo] = useState(search.get('bis') ?? today);
  const [tab, setTab] = useState<Tab>(
    schoolWide && search.get('ansicht') === 'supplierungen' ? 'substitutions' : 'attendance',
  );
  const [classId, setClassId] = useState(search.get('klasse') ?? '');
  const valid = from <= to;
  const qs = `from=${from}&to=${to}${classId ? `&classId=${classId}` : ''}`;
  const attendance = useApi<AttendanceReport>(
    ['reports', 'attendance', qs],
    valid && tab === 'attendance' ? `/reports/attendance?${qs}` : null,
  );
  const subs = useApi<SubstitutionReport>(
    ['reports', 'substitutions', from, to],
    valid && tab === 'substitutions' ? `/reports/substitutions?from=${from}&to=${to}` : null,
  );
  const classes = useApi<AttendanceReport>(
    ['reports', 'classes', from, to],
    valid && schoolWide ? `/reports/attendance?from=${from}&to=${to}` : null,
  );
  const sync = (next: Record<string, string>) => {
    const p = new URLSearchParams({
      von: from,
      bis: to,
      ...(classId ? { klasse: classId } : {}),
      ...next,
    });
    router.replace(`/auswertung?${p}`);
  };
  const preset = (days: number | 'month' | 'year') => {
    const f =
      days === 'month'
        ? `${today.slice(0, 8)}01`
        : days === 'year'
          ? addDays(today, -364)
          : addDays(today, -days);
    setFrom(f);
    setTo(today);
    sync({ von: f, bis: today });
  };
  const csv =
    tab === 'attendance'
      ? `/api/v1/reports/attendance?${qs}&format=csv`
      : `/api/v1/reports/substitutions?from=${from}&to=${to}&format=csv`;
  const absenceHead = [
    t('absent'),
    t('late'),
    t('open'),
    t('reported'),
    t('excused'),
    t('rejected'),
    t('unexcused'),
  ];

  return (
    <div className="mx-auto flex w-full max-w-(--content-max) flex-col gap-6 px-4 pt-4 pb-8 lg:px-6 lg:pt-6">
      <PageTitle area="direktion">{t('title')}</PageTitle>
      {schoolWide ? (
        <SegmentedControl
          label={t('view')}
          value={tab}
          onChange={(v) => {
            setTab(v);
            sync({ ansicht: v === 'substitutions' ? 'supplierungen' : 'anwesenheit' });
          }}
          options={[
            { value: 'attendance', label: t('attendance') },
            { value: 'substitutions', label: t('substitutions') },
          ]}
        />
      ) : null}
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <Input
            label={t('from')}
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
            onBlur={() => sync({})}
            className="w-44"
          />
          <Input
            label={t('to')}
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
            onBlur={() => sync({})}
            className="w-44"
          />
          {schoolWide && tab === 'attendance' ? (
            <Select
              label={t('class')}
              value={classId}
              emptyLabel={t('allClasses')}
              onChange={(e) => {
                setClassId(e.target.value);
                sync({ klasse: e.target.value });
              }}
              options={(classes.data?.classes ?? []).map((c) => ({
                value: c.classId,
                label: c.className,
              }))}
            />
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => preset('month')}>
            {t('thisMonth')}
          </Button>
          <Button variant="ghost" onClick={() => preset(30)}>
            {t('last30')}
          </Button>
          <Button variant="ghost" onClick={() => preset('year')}>
            {t('lastYear')}
          </Button>
        </div>
        {!valid ? <FormError message={t('invalidRange')} /> : null}
      </Card>

      <div className="flex justify-end">
        <Button variant="secondary" asChild>
          <a href={csv} download>
            <Download aria-hidden="true" size={18} />
            {t('csv')}
          </a>
        </Button>
      </div>

      {tab === 'attendance' ? (
        attendance.isPending ? (
          <Skeleton className="h-48 w-full" />
        ) : !attendance.data ? (
          <Card>
            <EmptyState title={tc('error')} />
          </Card>
        ) : attendance.data.classes.length === 0 ? (
          <Card>
            <EmptyState title={t('empty')} />
          </Card>
        ) : (
          <>
            <Table
              caption={t('attendanceByClass')}
              head={[t('class'), t('students'), t('lessons'), ...absenceHead]}
              rows={attendance.data.classes.map((c) => [
                c.className,
                c.students,
                c.lessons,
                c.absentLessons,
                c.lateLessons,
                c.absences.open,
                c.absences.reported,
                c.absences.excused,
                c.absences.rejected,
                c.absences.unexcused,
              ])}
            />
            {attendance.data.students ? (
              <section aria-labelledby="students-h" className="flex flex-col gap-2">
                <h2 id="students-h" className="text-h3">
                  {t('byStudent')}
                </h2>
                <Table
                  caption={t('byStudent')}
                  head={[t('student'), ...absenceHead, t('lateMinutes')]}
                  rows={attendance.data.students.map((s) => [
                    s.name,
                    s.absentLessons,
                    s.lateLessons,
                    s.absences.open,
                    s.absences.reported,
                    s.absences.excused,
                    s.absences.rejected,
                    s.absences.unexcused,
                    s.lateMinutes,
                  ])}
                />
              </section>
            ) : null}
            <p className="text-body-sm text-ink-muted">{t('attendanceNote')}</p>
          </>
        )
      ) : subs.isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : !subs.data ? (
        <Card>
          <EmptyState title={tc('error')} />
        </Card>
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(['substitutions', 'supervisions', 'cancelled', 'roomChanges'] as const).map((k) => (
              <li key={k} className="rounded-md border border-line bg-bg-raised p-4">
                <p className="text-body-sm text-ink-muted">{t(`total_${k}`)}</p>
                <p className="text-h1 tabular-nums">{subs.data!.totals[k]}</p>
              </li>
            ))}
          </ul>
          {subs.data.teachers.length === 0 ? (
            <Card>
              <EmptyState title={t('emptySubstitutions')} />
            </Card>
          ) : (
            <Table
              caption={t('byTeacher')}
              head={[t('teacher'), t('substituted'), t('supervised'), t('missed')]}
              rows={subs.data.teachers.map((r) => [r.name, r.substituted, r.supervised, r.missed])}
            />
          )}
          <p className="text-body-sm text-ink-muted">{t('substitutionNote')}</p>
        </>
      )}
    </div>
  );
}
