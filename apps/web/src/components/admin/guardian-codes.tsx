'use client';
import { useState } from 'react';
import { Download, KeyRound, Printer } from 'lucide-react';
import { Button } from '@sp/ui';
import { shortDate } from '../../lib/dates';
import { ApiError, apiPost } from '../../lib/api-client';
import { useT } from '../../lib/i18n';
import { FormError } from '../form-bits';

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
  const t = useT('admin.classes');
  const c = useT('common');
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
        {error ? <FormError message={error} /> : null}
        <Button
          variant="secondary"
          iconLeft={KeyRound}
          onClick={generate}
          loading={busy}
          disabled={studentIds.length === 0}
          className="self-start"
        >
          {label ?? t('codes')}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3" id="codes">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <h2 className="text-h3">
          {t('codesFor')} {scope}
        </h2>
        <Button variant="secondary" size="sm" iconLeft={Printer} onClick={() => window.print()}>
          {t('codesPrint')}
        </Button>
        <Button variant="secondary" size="sm" iconLeft={Download} onClick={downloadCsv}>
          {t('codesCsv')}
        </Button>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {rows.map((r) => (
          <li key={r.studentId} className="flex flex-col gap-1 rounded-md bg-bg-sunken p-4">
            <p className="text-body-strong">
              {r.lastName} {r.firstName}
              {r.className ? ` (${r.className})` : ''}
            </p>
            <p className="font-mono text-h3 tracking-widest">{r.code}</p>
            <p className="text-caption text-ink-muted">
              {t('codesValid')} {shortDate(r.expiresAt.slice(0, 10))}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
