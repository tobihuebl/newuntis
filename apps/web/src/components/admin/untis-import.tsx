'use client';
import { CalendarRange, Check, FileText, Plus, TriangleAlert, Upload } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { UntisMatch, UntisPreview, UntisResult } from '@sp/shared';
import { Banner, Button, Card, CardTitle, Chip, Input, Select, Skeleton, cn } from '@sp/ui';
import { ApiError, apiRequest } from '../../lib/api-client';
import { useT } from '../../lib/i18n';
import { useApi } from '../../lib/use-api';
import { FormError } from '../form-bits';
import { PageTitle } from '../page-title';
import { readText } from './import-wizard';

type FileKey = 'gpu001' | 'gpu002' | 'gpu004' | 'gpu005' | 'gpu006';
const KEYS: FileKey[] = ['gpu001', 'gpu002', 'gpu004', 'gpu005', 'gpu006'];

/** GPU001.TXT, gpu1.txt, "GPU004 (1).TXT" … → Schlüssel; andere Dateien werden ignoriert. */
function keyOf(name: string): FileKey | null {
  const m = /gpu0*(\d+)/i.exec(name);
  const k = m ? (`gpu00${m[1]}` as FileKey) : null;
  return k && KEYS.includes(k) ? k : null;
}

const MATCH_TONE: Record<UntisMatch, 'ok' | 'late'> = {
  existing: 'ok',
  email: 'ok',
  name: 'ok',
  new: 'late',
};

/**
 * Stundenplan aus Untis übernehmen (SD-06, ADR 0023): GPU-Dateien wählen (mehrere auf einmal), Vorschau mit
 * Zuordnung, Übernahme als neuer Entwurf. Danach im Editor prüfen und wie gewohnt veröffentlichen.
 */
export function UntisImport({ csrfToken, nav }: { csrfToken: string; nav?: React.ReactNode }) {
  const t = useT('admin.untis');
  const c = useT('common');
  const years = useApi<{ data: { id: string; name: string; isCurrent: boolean }[] }>(
    ['admin', 'school-years'],
    '/admin/school-years',
  );
  const [yearId, setYearId] = useState('');
  const [name, setName] = useState('');
  const [files, setFiles] = useState<Partial<Record<FileKey, { name: string; text: string }>>>({});
  const [ignored, setIgnored] = useState<string[]>([]);
  const [preview, setPreview] = useState<UntisPreview | null>(null);
  const [done, setDone] = useState<UntisResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cur = years.data?.data.find((y) => y.isCurrent) ?? years.data?.data[0];
    if (cur && !yearId) {
      setYearId(cur.id);
      setName(t('defaultName', { year: cur.name }));
    }
  }, [years.data, yearId, t]);

  const body = () => ({
    schoolYearId: yearId,
    name: name.trim() || t('defaultName', { year: '' }),
    files: Object.fromEntries(Object.entries(files).map(([k, v]) => [k, v.text])),
  });
  const fail = (err: unknown) => setError(err instanceof ApiError ? err.problem.title : c('error'));

  async function onFiles(list: FileList | null) {
    if (!list) return;
    const next = { ...files };
    const skipped: string[] = [];
    for (const f of Array.from(list)) {
      const k = keyOf(f.name);
      if (k) next[k] = { name: f.name, text: await readText(f) };
      else skipped.push(f.name);
    }
    setFiles(next);
    setIgnored(skipped);
    setPreview(null);
    setDone(null);
  }

  async function check() {
    setBusy(true);
    setError(null);
    try {
      setPreview(await apiRequest<UntisPreview>('POST', '/admin/import/untis', body(), csrfToken));
    } catch (err) {
      setPreview(null);
      fail(err);
    }
    setBusy(false);
  }

  async function commit() {
    setBusy(true);
    setError(null);
    try {
      setDone(
        await apiRequest<UntisResult>('POST', '/admin/import/untis/commit', body(), csrfToken),
      );
    } catch (err) {
      fail(err);
    }
    setBusy(false);
  }

  if (done) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 pt-4 pb-8 lg:px-6 lg:pt-6">
        <PageTitle area="stammdaten">{t('doneTitle')}</PageTitle>
        <Card className="flex flex-col gap-3" role="status">
          <p>{t('doneText', { lessons: done.lessons, requirements: done.requirements })}</p>
          <p className="text-body-sm text-ink-muted">
            {t('doneCreated', {
              classes: done.created.classes,
              groups: done.created.groups,
              subjects: done.created.subjects,
              rooms: done.created.rooms,
              teachers: done.created.teachers,
            })}
          </p>
          {done.created.groups > 0 ? <Banner tone="signal">{t('groupsHint')}</Banner> : null}
          <p className="text-body-sm">{t('nextSteps')}</p>
          <Button asChild iconLeft={CalendarRange} className="self-start">
            <Link href={`/admin/stundenplan/${done.versionId}`}>{t('openDraft')}</Link>
          </Button>
        </Card>
      </div>
    );
  }

  const have = KEYS.filter((k) => files[k]);
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 pt-4 pb-8 lg:px-6 lg:pt-6">
      <PageTitle area="stammdaten">{t('title')}</PageTitle>
      {nav}
      <Card className="flex flex-col gap-4">
        <CardTitle as="h2">{t('step1')}</CardTitle>
        <p className="text-body-sm text-ink-muted">{t('exportHelp')}</p>
        <ol className="list-decimal pl-5 text-body-sm">
          <li>{t('export1')}</li>
          <li>{t('export2')}</li>
          <li>{t('export3')}</li>
        </ol>
        <label className="pf-focusable flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-line-strong p-6 text-center hover:bg-brand-soft has-focus-visible:ring-3 has-focus-visible:ring-focus">
          <Upload aria-hidden="true" className="size-6 text-brand-text" />
          <span className="text-body-strong">{t('chooseFiles')}</span>
          <span className="text-body-sm text-ink-muted">{t('chooseHelp')}</span>
          <input
            type="file"
            multiple
            accept=".txt,.TXT,text/plain"
            className="sr-only"
            onChange={(e) => void onFiles(e.target.files)}
          />
        </label>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {KEYS.map((k) => (
            <li key={k} className="flex items-center gap-2 text-body-sm">
              {files[k] ? (
                <Check aria-hidden="true" className="size-4 text-brand-text" />
              ) : (
                <FileText aria-hidden="true" className="size-4 text-ink-subtle" />
              )}
              <span className={cn(!files[k] && 'text-ink-muted')}>
                {t(`file_${k}`)}
                {k === 'gpu001' ? ` (${t('required')})` : ''}
              </span>
            </li>
          ))}
        </ul>
        {ignored.length ? (
          <p className="text-caption text-ink-muted">
            {t('ignored', { names: ignored.join(', ') })}
          </p>
        ) : null}
      </Card>

      <Card className="flex flex-col gap-4">
        <CardTitle as="h2">{t('step2')}</CardTitle>
        {years.data ? (
          <Select
            label={t('schoolYear')}
            value={yearId}
            onChange={(e) => {
              setYearId(e.target.value);
              setPreview(null);
            }}
            options={years.data.data.map((y) => ({ value: y.id, label: y.name }))}
            fieldClassName="sm:max-w-xs"
          />
        ) : (
          <Skeleton className="h-12 w-full sm:max-w-xs" />
        )}
        <Input
          label={t('draftName')}
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          fieldClassName="sm:max-w-md"
        />
        {error ? <FormError message={error} /> : null}
        <Button
          className="self-start"
          disabled={!files.gpu001 || !yearId}
          loading={busy && !preview}
          onClick={() => void check()}
        >
          {t('check', { count: have.length })}
        </Button>
      </Card>

      {preview ? <PreviewCard p={preview} busy={busy} onCommit={() => void commit()} /> : null}
    </div>
  );
}

function PreviewCard({
  p,
  busy,
  onCommit,
}: {
  p: UntisPreview;
  busy: boolean;
  onCommit: () => void;
}) {
  const t = useT('admin.untis');
  const newOf = <T extends { exists: boolean }>(xs: T[]) => xs.filter((x) => !x.exists);
  return (
    <section aria-labelledby="untis-preview" className="flex flex-col gap-4">
      <h2 id="untis-preview" className="text-h2">
        {t('step3')}
      </h2>
      {p.errors.length ? (
        <Banner tone="danger" icon={TriangleAlert}>
          <ul className="flex flex-col gap-1">
            {p.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Banner>
      ) : null}
      <Card className="flex flex-col gap-3">
        <p className="text-body">
          {t('summary', {
            lessons: p.counts.lessons,
            year: p.schoolYear.name,
            date: p.validFrom.split('-').reverse().join('.'),
          })}
        </p>
        <p className="flex flex-wrap gap-2">
          <Chip>{t('doubles', { count: p.counts.doubles })}</Chip>
          <Chip>{t('couplings', { count: p.counts.couplings })}</Chip>
          <Chip>{t('teamTeaching', { count: p.counts.teamTeaching })}</Chip>
          <Chip>{t('requirements', { count: p.counts.requirements })}</Chip>
        </p>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <NewList
          title={t('classes')}
          all={p.classes.length}
          items={newOf(p.classes).map((c) => c.name)}
        />
        <NewList
          title={t('groups')}
          all={p.groups.length}
          items={newOf(p.groups).map((g) => g.name)}
        />
        <NewList
          title={t('subjects')}
          all={p.subjects.length}
          items={newOf(p.subjects).map((s) =>
            s.name === s.code ? s.code : `${s.code} · ${s.name}`,
          )}
        />
        <NewList
          title={t('rooms')}
          all={p.rooms.length}
          items={newOf(p.rooms).map((r) => r.code)}
        />
      </div>

      <Card className="flex flex-col gap-3">
        <CardTitle as="h3">{t('teachers', { count: p.teachers.length })}</CardTitle>
        <p className="text-body-sm text-ink-muted">{t('teachersHelp')}</p>
        <ul className="flex flex-col divide-y divide-line">
          {p.teachers.map((x) => (
            <li key={x.code} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <span className="w-14 text-mono-sm">{x.code}</span>
              <span className="flex-1 text-body">{x.name}</span>
              <Chip tone={MATCH_TONE[x.match]} icon={x.match === 'new' ? Plus : Check}>
                {t(`match_${x.match}`)}
              </Chip>
            </li>
          ))}
        </ul>
      </Card>

      {p.warnings.length ? (
        <Card flat className="flex flex-col gap-2">
          <CardTitle as="h3">{t('warningsTitle')}</CardTitle>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-body-sm">
            {p.warnings.map((w) => (
              <li key={w.kind}>
                {t(`warn_${w.kind}`, { count: w.count, refs: w.refs.join(', ') })}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Banner tone="brand">{t('draftHint')}</Banner>
      <Button
        className="self-start"
        iconLeft={CalendarRange}
        disabled={p.errors.length > 0}
        loading={busy}
        onClick={onCommit}
      >
        {t('commit', { count: p.counts.lessons })}
      </Button>
    </section>
  );
}

function NewList({ title, all, items }: { title: string; all: number; items: string[] }) {
  const t = useT('admin.untis');
  return (
    <Card flat className="flex flex-col gap-2">
      <CardTitle as="h3">{title}</CardTitle>
      <p className="text-body-sm text-ink-muted">
        {t('found', { all, existing: all - items.length, created: items.length })}
      </p>
      {items.length ? (
        <p className="flex flex-wrap gap-1">
          {items.map((i) => (
            <Chip key={i} tone="late" icon={Plus}>
              {i}
            </Chip>
          ))}
        </p>
      ) : null}
    </Card>
  );
}
