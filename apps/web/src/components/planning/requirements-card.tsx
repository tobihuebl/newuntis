'use client';
import { FileUp, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';
import type { RequirementsImportResponse, TeacherLoadRow } from '@sp/shared';
import { Banner, Button, Card, CardTitle, Chip, Select, useToast } from '@sp/ui';
import { useApiMutation, useProblemText } from '../../lib/use-api';
import { useT } from '../../lib/i18n';
import { FormError } from '../form-bits';

export interface LoadData {
  rows: TeacherLoadRow[];
  teachers: { id: string; firstName: string; lastName: string }[];
  subjects: { id: string; code: string }[];
}

export interface VersionOption {
  id: string;
  name: string | null;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  schoolYear: { id: string; name: string };
  lessonCount: number;
}

/**
 * Lehrfächerverteilung (M7): Grundlage wählen (Version mit Soll-Stunden) und bei Entwürfen per CSV ersetzen.
 * Vorschau mit Fehlern je Zeile, Übernehmen erst ohne Fehler.
 */
export function RequirementsCard({
  versions,
  versionId,
  onVersion,
  requirementCount,
  hours,
  load,
  onImported,
}: {
  versions: VersionOption[];
  versionId: string;
  onVersion: (id: string) => void;
  requirementCount: number;
  hours: number;
  load: LoadData | null;
  onImported: () => void;
}) {
  const t = useT('assistant');
  const problem = useProblemText();
  const toast = useToast();
  const file = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [preview, setPreview] = useState<RequirementsImportResponse | null>(null);
  const run = useApiMutation<{ csv: string; commit: boolean }, RequirementsImportResponse>(
    'POST',
    () => `/admin/timetable-versions/${versionId}/requirements/import`,
  );
  const current = versions.find((v) => v.id === versionId);
  const draft = current?.status === 'DRAFT';

  async function readFile(f: File) {
    const text = await f.text();
    setCsv(text);
    setPreview(await run.mutateAsync({ csv: text, commit: false }));
  }
  async function commit() {
    if (!csv) return;
    const r = await run.mutateAsync({ csv, commit: true });
    setPreview(r);
    if (r.committed) {
      toast({ text: t('importDone', { count: r.valid }) });
      setCsv(null);
      setPreview(null);
      onImported();
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <CardTitle as="h2">{t('requirements')}</CardTitle>
        <p className="text-body-sm text-ink-muted">{t('requirementsHelp')}</p>
      </div>
      <Select
        label={t('sourceVersion')}
        value={versionId}
        onChange={(e) => onVersion(e.target.value)}
        options={versions.map((v) => ({
          value: v.id,
          label: `${v.name ?? v.schoolYear.name} (${t(`status_${v.status}`)})`,
        }))}
      />
      <p className="flex flex-wrap items-center gap-2 text-body-sm">
        <Chip tone={requirementCount ? 'ok' : 'late'}>
          {t('rows', { count: requirementCount })}
        </Chip>
        <span className="text-ink-muted">{t('hours', { count: hours })}</span>
        <Link
          href={`/admin/stundenplan/${versionId}`}
          className="pf-focusable text-label text-brand-text underline underline-offset-4"
        >
          {t('openEditor')}
        </Link>
      </p>

      {load && requirementCount ? <TeacherLoad load={load} /> : null}

      {draft ? (
        <div className="flex flex-col gap-3">
          <input
            ref={file}
            type="file"
            accept=".csv,text/csv,text/plain"
            className="sr-only"
            tabIndex={-1}
            aria-label={t('importCsv')}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void readFile(f);
            }}
          />
          <Button
            variant="secondary"
            iconLeft={FileUp}
            className="self-start"
            loading={run.isPending && !preview}
            onClick={() => file.current?.click()}
          >
            {t('importCsv')}
          </Button>
          <p className="text-caption text-ink-muted">{t('csvColumns')}</p>
        </div>
      ) : (
        <p className="text-body-sm text-ink-muted">{t('importOnlyDraft')}</p>
      )}

      {run.error ? <FormError message={problem(run.error)} /> : null}
      {preview ? (
        <div className="flex flex-col gap-3 rounded-lg bg-bg-sunken p-4">
          {preview.missingColumns.length ? (
            <Banner tone="danger" icon={TriangleAlert}>
              {t('missingColumns', { columns: preview.missingColumns.join(', ') })}
            </Banner>
          ) : (
            <>
              <p className="text-body-sm">
                {t('previewRows', { valid: preview.valid, invalid: preview.invalid })}
              </p>
              {preview.rows.some((r) => r.warnings.length) ? (
                <ul className="flex flex-col gap-2" aria-label={t('importWarnings')}>
                  {preview.rows
                    .filter((r) => r.warnings.length)
                    .slice(0, 20)
                    .map((r) => (
                      <li key={r.line} className="flex flex-wrap items-center gap-2 text-body-sm">
                        <span className="text-mono-sm text-ink-muted">
                          {t('line', { n: r.line })}
                        </span>
                        {r.warnings.map((w) => (
                          <Chip key={w} tone="late">
                            {w}
                          </Chip>
                        ))}
                      </li>
                    ))}
                </ul>
              ) : null}
              {preview.invalid ? (
                <ul className="flex flex-col gap-2">
                  {preview.rows
                    .filter((r) => r.errors.length)
                    .slice(0, 20)
                    .map((r) => (
                      <li key={r.line} className="flex flex-wrap items-center gap-2 text-body-sm">
                        <span className="text-mono-sm text-ink-muted">
                          {t('line', { n: r.line })}
                        </span>
                        {r.errors.map((e) => (
                          <Chip key={e} tone="danger" icon={TriangleAlert}>
                            {e}
                          </Chip>
                        ))}
                      </li>
                    ))}
                </ul>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={() => void commit()}
                  disabled={preview.invalid > 0 || preview.valid === 0}
                  loading={run.isPending}
                >
                  {t('importCommit', { count: preview.valid })}
                </Button>
                <Button variant="ghost" onClick={() => setPreview(null)}>
                  {t('discard')}
                </Button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </Card>
  );
}

/**
 * Auslastung der Lehrkräfte: Lehrfächerverteilung gegen das Unterrichtsausmaß aus den Personen-Stammdaten, dazu
 * Fächer ohne hinterlegte Lehrbefähigung. Zeigt nur Abweichungen.
 */
function TeacherLoad({ load }: { load: LoadData }) {
  const t = useT('assistant');
  const teacher = new Map(load.teachers.map((x) => [x.id, x]));
  const code = new Map(load.subjects.map((x) => [x.id, x.code]));
  const withTarget = load.rows.filter((r) => r.target !== null).length;
  const off = load.rows.filter((r) => (r.diff ?? 0) !== 0 || r.unqualified.length);
  return (
    <section aria-labelledby="load-h" className="flex flex-col gap-2">
      <h3 id="load-h" className="text-label">
        {t('load')}
      </h3>
      {withTarget === 0 ? (
        <p className="text-body-sm text-ink-muted">
          {t('loadNoTargets')}{' '}
          <Link
            href="/admin/personen?kind=TEACHER"
            className="pf-focusable text-label text-brand-text underline underline-offset-4"
          >
            {t('loadToPersons')}
          </Link>
        </p>
      ) : off.length === 0 ? (
        <p className="flex items-center gap-2 text-body-sm">
          <Chip tone="ok">{t('loadOk', { count: withTarget })}</Chip>
        </p>
      ) : null}
      {off.length ? (
        <ul className="flex flex-col divide-y divide-line">
          {off.map((r) => {
            const p = teacher.get(r.teacherId);
            return (
              <li key={r.teacherId} className="flex flex-wrap items-center gap-2 py-2 text-body-sm">
                <Link
                  href={`/admin/personen/${r.teacherId}`}
                  className="pf-focusable flex-1 text-label text-brand-text underline underline-offset-4"
                >
                  {p ? `${p.lastName} ${p.firstName}` : '?'}
                </Link>
                <span className="pf-num font-data text-ink-muted">
                  {r.target === null
                    ? t('loadAssigned', { hours: r.assigned })
                    : t('loadOf', { hours: r.assigned, target: r.target })}
                </span>
                {r.diff ? (
                  <Chip tone="late">
                    {r.diff > 0
                      ? t('loadOver', { hours: r.diff })
                      : t('loadUnder', { hours: -r.diff })}
                  </Chip>
                ) : null}
                {r.unqualified.length ? (
                  <Chip tone="danger" icon={TriangleAlert}>
                    {t('loadUnqualified', {
                      subjects: r.unqualified.map((s) => code.get(s) ?? '?').join(', '),
                    })}
                  </Chip>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
