'use client';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@sp/ui';
import { ApiError, apiPost } from '../../lib/api-client';

/** Byte-Order-Mark, damit Excel UTF-8 erkennt. */
const BOM = String.fromCharCode(0xfeff);

interface CodeRow {
  studentId: string;
  firstName: string;
  lastName: string;
  className: string | null;
  code: string;
  expiresAt: string;
}

const csvCell = (v: string) => `"${v.replace(/"/g, '""')}"`;

/** Erzeugt Elterncodes für die angegebenen Schüler:innen, zeigt sie einmalig an und bietet Druck und CSV-Export. */
export function GuardianCodes({
  studentIds,
  csrfToken,
  label,
  scope,
}: {
  studentIds: string[];
  csrfToken: string;
  label?: string;
  scope: string;
}) {
  const t = useTranslations('admin.classes');
  const c = useTranslations('common');
  const [rows, setRows] = useState<CodeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiPost<{ data: CodeRow[] }>(
        '/admin/guardian-codes',
        { studentIds },
        csrfToken,
      );
      setRows(res.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.problem.title : c('error'));
    }
    setBusy(false);
  }

  function downloadCsv() {
    if (!rows) return;
    const lines = [
      'Nachname;Vorname;Klasse;Code;Gültig bis',
      ...rows.map((r) =>
        [r.lastName, r.firstName, r.className ?? '', r.code, r.expiresAt.slice(0, 10)]
          .map(csvCell)
          .join(';'),
      ),
    ];
    const blob = new Blob([`${BOM}${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `elterncodes-${scope}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (!rows) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-body-sm text-ink-muted">{t('codesHelp')}</p>
        {error ? (
          <p role="alert" className="text-body-sm text-danger-ink">
            {error}
          </p>
        ) : null}
        <div>
          <Button variant="secondary" onClick={generate} disabled={busy || studentIds.length === 0}>
            {label ?? t('codes')}
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3" id="codes">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <h2 className="text-h3">
          {t('codesFor')} {scope}
        </h2>
        <Button variant="secondary" onClick={() => window.print()}>
          {t('codesPrint')}
        </Button>
        <Button variant="secondary" onClick={downloadCsv}>
          {t('codesCsv')}
        </Button>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {rows.map((r) => (
          <li key={r.studentId} className="rounded-sm border border-line p-3">
            <p className="font-medium">
              {r.lastName} {r.firstName}
              {r.className ? ` (${r.className})` : ''}
            </p>
            <p className="font-mono text-body-lg tracking-wider">{r.code}</p>
            <p className="text-caption text-ink-muted">
              {t('codesValid')} {r.expiresAt.slice(0, 10)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
