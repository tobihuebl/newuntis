'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { ABSENCE_REASONS, addDays, type AbsenceItem, type TodayChild } from '@sp/shared';
import { CircleCheck, FileWarning, Send } from 'lucide-react';
import { Banner, Button, Card, Checkbox, Input, SegmentedControl, Select, Textarea } from '@sp/ui';
import { FormError } from '../form-bits';
import { StatusSteps } from './status-steps';
import { ApiError, apiRequest, apiUpload } from '../../lib/api-client';
import { todayVienna } from '../../lib/dates';
import { useApi, useProblemText } from '../../lib/use-api';
import { useSession } from '../providers';
import { useT } from '../../lib/i18n';

type Span = 'today' | 'yesterday' | 'range';
const PERIODS = Array.from({ length: 10 }, (_, i) => ({
  value: String(i + 1),
  label: `${i + 1}.`,
}));

/**
 * Abwesenheit melden (AB-01, Spec Abschnitt 5): ein Bildschirm mit Kind, Zeitraum (heute, gestern, Zeitraum),
 * Grund und optional Foto. Eltern wählen ihr Kind, Schüler:innen melden sich selbst, die Administration sucht.
 */
export function AbsenceForm({
  mode,
  selfId,
}: {
  mode: 'guardian' | 'student' | 'admin';
  selfId: string;
}) {
  const t = useT('absence');
  const tc = useT('common');
  const problem = useProblemText();
  const { csrfToken } = useSession();
  const search = useSearchParams();
  const today = todayVienna();
  const preFrom = search.get('von');
  const preTo = search.get('bis');
  const children = useApi<{ data: TodayChild[] }>(
    ['children'],
    mode === 'guardian' ? '/me/children' : null,
  );
  const [query, setQuery] = useState('');
  const found = useApi<{
    data: { id: string; firstName: string; lastName: string; className?: string | null }[];
  }>(
    ['students', query],
    mode === 'admin' && query.trim().length >= 2
      ? `/admin/persons?kind=STUDENT&limit=10&q=${encodeURIComponent(query.trim())}`
      : null,
  );
  const [studentId, setStudentId] = useState<string>(
    search.get('kind') ?? (mode === 'student' ? selfId : ''),
  );
  const [span, setSpan] = useState<Span>(preFrom ? 'range' : 'today');
  const [from, setFrom] = useState(preFrom ?? today);
  const [to, setTo] = useState(preTo ?? today);
  const [partial, setPartial] = useState(false);
  const [fromPeriod, setFromPeriod] = useState('1');
  const [toPeriod, setToPeriod] = useState('1');
  const [reasonCode, setReasonCode] = useState<(typeof ABSENCE_REASONS)[number]>('ILLNESS');
  const [reason, setReason] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ item: AbsenceItem; uploadError: string | null } | null>(
    null,
  );

  const kids = children.data?.data ?? [];
  const chosen = studentId || (kids.length === 1 ? kids[0]!.id : '');
  const range =
    span === 'today'
      ? { fromDate: today, toDate: today }
      : span === 'yesterday'
        ? { fromDate: addDays(today, -1), toDate: addDays(today, -1) }
        : { fromDate: from, toDate: to };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!chosen) return setError(t('child'));
    setBusy(true);
    try {
      const item = await apiRequest<AbsenceItem>(
        'POST',
        '/absences',
        {
          studentId: chosen,
          ...range,
          fromPeriod: partial ? Number(fromPeriod) : null,
          toPeriod: partial ? Number(toPeriod) : null,
          reasonCode,
          reason: reason || null,
        },
        csrfToken,
      );
      let uploadError: string | null = null;
      let final = item;
      if (file) {
        try {
          final = await apiUpload<AbsenceItem>(`/absences/${item.id}/attachments`, file, csrfToken);
        } catch (err) {
          uploadError = err instanceof ApiError ? err.problem.title : tc('error');
        }
      }
      setResult({ item: final, uploadError });
    } catch (err) {
      setError(problem(err));
    } finally {
      setBusy(false);
    }
  }

  if (result)
    return (
      <Card className="flex flex-col gap-4" role="status">
        <p className="flex items-center gap-2 text-h3">
          <CircleCheck aria-hidden="true" className="size-6 text-brand-text" />
          {t('sent')}
        </p>
        <StatusSteps current="reported" />
        {result.uploadError ? (
          <FormError message={t('uploadFailed', { error: result.uploadError })} />
        ) : null}
        {result.item.attachmentRequired && !result.item.hasAttachment ? (
          <Banner icon={FileWarning}>{t('photoMissing')}</Banner>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" asChild>
            <Link href={`/kind/${result.item.student.id}/fehlzeiten`}>{t('history')}</Link>
          </Button>
          <Button variant="ghost" onClick={() => setResult(null)}>
            {t('title')}
          </Button>
        </div>
      </Card>
    );

  if (mode === 'guardian' && children.data && kids.length === 0)
    return (
      <Card>
        <p className="text-ink-muted">{t('noChildren')}</p>
      </Card>
    );

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      {mode === 'guardian' && kids.length > 1 ? (
        <SegmentedControl
          label={t('child')}
          value={chosen}
          onChange={setStudentId}
          options={kids.map((k) => ({ value: k.id, label: k.firstName }))}
        />
      ) : null}
      {mode === 'admin' ? (
        <div className="flex flex-col gap-2">
          <Input
            label={t('searchStudent')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
          {found.data?.data.length ? (
            <Select
              label={t('student')}
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              emptyLabel="–"
              options={found.data.data.map((s) => ({
                value: s.id,
                label: `${s.lastName} ${s.firstName}`,
              }))}
            />
          ) : null}
        </div>
      ) : null}

      <SegmentedControl
        label={t('period')}
        value={span}
        onChange={setSpan}
        options={(['today', 'yesterday', 'range'] as const).map((v) => ({ value: v, label: t(v) }))}
      />
      {span === 'range' ? (
        <div className="flex flex-wrap gap-3">
          <Input
            label={t('from')}
            type="date"
            value={from}
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
      ) : null}
      <Checkbox
        label={t('onlyLessons')}
        checked={partial}
        onChange={(e) => setPartial(e.target.checked)}
      />
      {partial ? (
        <div className="flex flex-wrap gap-3">
          <Select
            label={t('fromPeriod')}
            value={fromPeriod}
            onChange={(e) => setFromPeriod(e.target.value)}
            options={PERIODS}
          />
          <Select
            label={t('toPeriod')}
            value={toPeriod}
            onChange={(e) => setToPeriod(e.target.value)}
            options={PERIODS}
          />
        </div>
      ) : null}

      <SegmentedControl
        label={t('reason')}
        value={reasonCode}
        onChange={setReasonCode}
        options={ABSENCE_REASONS.map((r) => ({ value: r, label: t(`reasons.${r}`) }))}
      />
      <Textarea
        label={t('note')}
        value={reason}
        maxLength={1000}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="flex flex-col gap-1">
        <label htmlFor="absence-file" className="pf-field__label">
          {t('photo')}
        </label>
        <input
          id="absence-file"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
          capture="environment"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="min-h-(--tap-comfort) text-body-sm file:mr-3 file:min-h-(--tap-comfort) file:rounded-md file:border-0 file:bg-bg-raised file:px-4 file:font-bold file:text-ink file:ring-control"
        />
        <p className="pf-field__hint">{t('photoHelp')}</p>
      </div>
      <FormError message={error} />
      <Button type="submit" block size="lg" iconLeft={Send} loading={busy} disabled={!chosen}>
        {t('send')}
      </Button>
    </form>
  );
}
