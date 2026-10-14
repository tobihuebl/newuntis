'use client';
import { FileUp, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';
import type { RequirementsImportResponse } from '@sp/shared';
import { Banner, Button, Card, CardTitle, Chip, Select, useToast } from '@sp/ui';
import { useApiMutation, useProblemText } from '../../lib/use-api';
import { useT } from '../../lib/i18n';
import { FormError } from '../form-bits';

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
  onImported,
}: {
  versions: VersionOption[];
  versionId: string;
  onVersion: (id: string) => void;
  requirementCount: number;
  hours: number;
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

  async function load(f: File) {
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
              if (f) void load(f);
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
