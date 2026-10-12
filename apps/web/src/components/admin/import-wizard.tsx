'use client';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Chip, Button, Card, Checkbox, Select } from '@sp/ui';
import { IMPORT_FIELDS, type ImportField, type ImportPreview } from '@sp/shared';
import { ApiError, apiRequest } from '../../lib/api-client';

/** Byte-Order-Mark, damit Excel UTF-8 erkennt. */
const BOM = String.fromCharCode(0xfeff);

interface CommitResult {
  summary: ImportPreview['summary'];
  result: {
    created: number;
    updated: number;
    skipped: number;
    classesCreated: number;
    linksCreated: number;
  };
  invitations: { sent: number } | null;
}

const FIELD_LABEL: Record<ImportField, string> = {
  firstName: 'Vorname',
  lastName: 'Nachname',
  role: 'Rolle',
  class: 'Klasse',
  email: 'E-Mail',
  externalId: 'Schülernummer',
  birthDate: 'Geburtsdatum',
  childExternalIds: 'Kind-Schülernummer',
};
const TEMPLATE = [
  'Vorname;Nachname;Rolle;Klasse;E-Mail;Schülernummer;Geburtsdatum;Kind-Schülernummer',
  'Anna;Beispiel;Schüler;1A;;S001;05.03.2014;',
  'Maria;Beispiel;Eltern;;maria.beispiel@example.test;;;S001',
  'Paul;Muster;Lehrer;;paul.muster@example.test;;;',
].join('\r\n');

/** Dateien aus Excel sind oft Windows-1252: erst streng als UTF-8 lesen, sonst als Windows-1252. */
async function readText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

export function ImportWizard({ csrfToken }: { csrfToken: string }) {
  const t = useTranslations('admin.import');
  const c = useTranslations('common');
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [mapping, setMapping] = useState<Partial<Record<ImportField, string>>>({});
  const [createClasses, setCreateClasses] = useState(false);
  const [skipErrors, setSkipErrors] = useState(false);
  const [sendInvitations, setSendInvitations] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [done, setDone] = useState<CommitResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onlyProblems, setOnlyProblems] = useState(false);

  const fail = (err: unknown) => setError(err instanceof ApiError ? err.problem.title : c('error'));

  async function check(text: string, map: Partial<Record<ImportField, string>>, create: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await apiRequest<ImportPreview>(
        'POST',
        '/admin/import/persons?dryRun=true',
        { csv: text, mapping: map, createClasses: create },
        csrfToken,
      );
      setPreview(res);
      setMapping((prev) => ({ ...res.mapping, ...prev }));
    } catch (err) {
      setPreview(null);
      fail(err);
    }
    setBusy(false);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await readText(file);
    setCsv(text);
    setFileName(file.name);
    setMapping({});
    setDone(null);
    await check(text, {}, createClasses);
  }

  async function commit() {
    if (!csv) return;
    setBusy(true);
    setError(null);
    try {
      setDone(
        await apiRequest<CommitResult>(
          'POST',
          '/admin/import/persons/commit',
          { csv, mapping, createClasses, skipErrors, sendInvitations },
          csrfToken,
        ),
      );
    } catch (err) {
      if (err instanceof ApiError && err.problem.preview)
        setPreview(err.problem.preview as ImportPreview);
      fail(err);
    }
    setBusy(false);
  }

  function downloadTemplate() {
    const blob = new Blob([`${BOM}${TEMPLATE}`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'personen-vorlage.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function reset() {
    setCsv(null);
    setFileName('');
    setPreview(null);
    setDone(null);
    setMapping({});
    setError(null);
  }

  const s = preview?.summary;
  const blocked = !!s && s.errors > 0 && !skipErrors;
  const rows =
    preview?.rows.filter((r) => !onlyProblems || r.action === 'error' || r.messages.length > 0) ??
    [];

  if (done) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
        <h1 className="text-h1">{t('done')}</h1>
        <Card className="flex flex-col gap-2" role="status">
          <p>
            {t('result', {
              created: done.result.created,
              updated: done.result.updated,
              skipped: done.result.skipped,
              links: done.result.linksCreated,
              classes: done.result.classesCreated,
            })}
          </p>
          {done.invitations ? <p>{t('invitations', { sent: done.invitations.sent })}</p> : null}
        </Card>
        <div className="flex gap-2">
          <Button onClick={reset}>{t('again')}</Button>
          <Button variant="secondary" asChild>
            <Link href="/admin/personen">{c('back')}</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
      <h1 className="text-h1">{t('title')}</h1>

      <Card className="flex flex-col gap-3">
        <h2 className="text-h3">{t('step1')}</h2>
        <p className="text-body-sm text-ink-muted">{t('fileHelp')}</p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex min-h-11 cursor-pointer items-center rounded-sm bg-brand px-4 text-label text-on-brand focus-within:outline-2">
            {t('chooseFile')}
            <input type="file" accept=".csv,.txt,text/csv" className="sr-only" onChange={onFile} />
          </label>
          {fileName ? <span className="text-body-sm">{fileName}</span> : null}
          <Button variant="ghost" onClick={downloadTemplate}>
            {t('template')}
          </Button>
        </div>
      </Card>

      {error ? (
        <p role="alert" className="text-body-sm text-danger-ink">
          {error}
        </p>
      ) : null}

      {preview && preview.unmappedRequired.length > 0 ? (
        <Card className="flex flex-col gap-3">
          <h2 className="text-h3">{t('mapping')}</h2>
          <p className="text-body-sm text-ink-muted">{t('mappingHelp')}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {IMPORT_FIELDS.filter((f) => preview.unmappedRequired.includes(f)).map((f) => (
              <Select
                key={f}
                label={FIELD_LABEL[f]}
                value={mapping[f] ?? ''}
                emptyLabel={t('unmapped')}
                options={preview.headers.map((h) => ({ value: h, label: h }))}
                onChange={(e) => setMapping({ ...mapping, [f]: e.target.value })}
              />
            ))}
          </div>
          <div>
            <Button onClick={() => csv && check(csv, mapping, createClasses)} disabled={busy}>
              {t('check')}
            </Button>
          </div>
        </Card>
      ) : null}

      {preview && preview.unmappedRequired.length === 0 && s ? (
        <>
          <Card className="flex flex-col gap-3">
            <h2 className="text-h3">{t('step2')}</h2>
            <p aria-live="polite">
              {t('summary', {
                total: s.total,
                create: s.create,
                update: s.update,
                unchanged: s.unchanged,
                errors: s.errors,
              })}
            </p>
            {s.newClasses.length > 0 ? (
              <p className="text-body-sm">
                {t('newClasses')}: {s.newClasses.join(', ')}
              </p>
            ) : null}
            <Checkbox
              label={t('createClasses')}
              checked={createClasses}
              onChange={(e) => {
                setCreateClasses(e.target.checked);
                if (csv) void check(csv, mapping, e.target.checked);
              }}
            />
            {s.total === 0 ? <p className="text-ink-muted">{t('empty')}</p> : null}
          </Card>

          {s.total > 0 ? (
            <div className="overflow-x-auto rounded-md border border-line bg-bg-raised">
              <div className="border-b border-line px-4 py-2">
                <Checkbox
                  label="nur Zeilen mit Fehlern oder Hinweisen"
                  checked={onlyProblems}
                  onChange={(e) => setOnlyProblems(e.target.checked)}
                />
              </div>
              <table className="w-full text-left text-body-sm">
                <thead className="border-b border-line text-ink-muted">
                  <tr>
                    <th scope="col" className="px-4 py-2">
                      {t('line')}
                    </th>
                    <th scope="col" className="px-4 py-2">
                      {t('action')}
                    </th>
                    <th scope="col" className="px-4 py-2">
                      {t('person')}
                    </th>
                    <th scope="col" className="px-4 py-2">
                      {t('messages')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 500).map((r) => (
                    <tr key={r.line} className="border-b border-line align-top last:border-b-0">
                      <td className="px-4 py-2 tabular-nums">{r.line}</td>
                      <td className="px-4 py-2">
                        <Chip
                          tone={
                            r.action === 'error'
                              ? 'danger'
                              : r.action === 'create'
                                ? 'ok'
                                : r.action === 'update'
                                  ? 'ok'
                                  : 'neutral'
                          }
                        >
                          {t(`actions.${r.action}`)}
                        </Chip>
                      </td>
                      <td className="px-4 py-2">
                        {r.record.lastName} {r.record.firstName}
                      </td>
                      <td className="px-4 py-2">
                        {r.messages.map((m) => (
                          <p
                            key={m}
                            className={m.startsWith('Hinweis') ? 'text-ink-muted' : 'text-danger-ink'}
                          >
                            {m}
                          </p>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {s.total > 0 ? (
            <Card className="flex flex-col gap-2">
              <h2 className="text-h3">{t('step3')}</h2>
              {s.errors > 0 ? (
                <Checkbox
                  label={t('skipErrors')}
                  checked={skipErrors}
                  onChange={(e) => setSkipErrors(e.target.checked)}
                />
              ) : null}
              <Checkbox
                label={t('sendInvitations')}
                checked={sendInvitations}
                onChange={(e) => setSendInvitations(e.target.checked)}
              />
              {blocked ? <p className="text-body-sm text-danger-ink">{t('errorsBlock')}</p> : null}
              <div>
                <Button onClick={commit} disabled={busy || blocked || s.create + s.update === 0}>
                  {skipErrors && s.errors > 0 ? t('commitSkip') : t('commit')}
                </Button>
              </div>
            </Card>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
