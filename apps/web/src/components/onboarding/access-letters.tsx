'use client';
import { ArrowLeft, Printer, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import type { AccessLetter, AccessStatus, ClassAccessView } from '@sp/shared';
import { Banner, Button, Card, Checkbox, Chip, EmptyState, Skeleton } from '@sp/ui';
import { shortDate } from '../../lib/dates';
import { useT } from '../../lib/i18n';
import { useApi, useApiMutation, useProblemText } from '../../lib/use-api';
import { FormError } from '../form-bits';
import { LoadError } from '../load-error';
import { PageTitle } from '../page-title';

const TONE: Record<AccessStatus, 'ok' | 'late' | 'absent'> = {
  active: 'ok',
  issued: 'late',
  none: 'absent',
};

/**
 * Zugangsbriefe (Onboarding, ADR 0020): Der Klassenvorstand sieht, wer schon Zugang hat, und druckt Briefe mit
 * persönlichem Code und QR-Code, auf Wunsch mit Eltern-Code. Codes stehen nur in dieser Antwort; ein neuer Brief
 * ersetzt offene Codes und hilft auch bei vergessenem Passwort.
 */
export function AccessLettersScreen({ classId }: { classId: string }) {
  const t = useT('access');
  const problem = useProblemText();
  const key = ['access', classId];
  const q = useApi<ClassAccessView>(key, `/classes/${classId}/access`);
  const issue = useApiMutation<
    { studentIds: string[]; withGuardianCodes: boolean },
    { data: AccessLetter[] }
  >('POST', () => `/classes/${classId}/access-codes`, [key, ['onboarding']]);
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [withGuardians, setWithGuardians] = useState(true);
  const [letters, setLetters] = useState<AccessLetter[] | null>(null);
  const d = q.data;

  // Vorauswahl: alle ohne aktives Konto
  useEffect(() => {
    if (d && picked === null)
      setPicked(new Set(d.rows.filter((r) => r.status !== 'active').map((r) => r.studentId)));
  }, [d, picked]);

  if (letters) return <Letters letters={letters} onDone={() => setLetters(null)} />;

  const sel = picked ?? new Set<string>();
  const toggle = (id: string, on: boolean) => {
    const n = new Set(sel);
    if (on) n.add(id);
    else n.delete(id);
    setPicked(n);
  };

  return (
    <div
      className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-4 pb-8 lg:px-6 lg:pt-6"
      data-tour="page"
    >
      <Button variant="ghost" size="sm" asChild iconLeft={ArrowLeft} className="self-start">
        <Link href={`/klassen/${classId}`}>{t('backToClass')}</Link>
      </Button>
      {q.isError ? (
        <LoadError error={q.error} onRetry={() => void q.refetch()} />
      ) : !d ? (
        <Skeleton className="h-64 w-full rounded-lg" />
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <PageTitle area="klassenvorstand">{t('lettersTitle', { name: d.className })}</PageTitle>
            <p className="text-body-sm text-ink-muted">{t('lettersIntro')}</p>
          </div>
          {d.rows.length === 0 ? (
            <Card flat>
              <EmptyState title={t('noStudents')} />
            </Card>
          ) : (
            <Card className="p-0">
              <ul>
                {d.rows.map((r) => (
                  <li
                    key={r.studentId}
                    className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2 last:border-b-0"
                  >
                    <Checkbox
                      label={r.name}
                      checked={sel.has(r.studentId)}
                      onChange={(e) => toggle(r.studentId, e.target.checked)}
                      className="flex-1"
                    />
                    <span className="flex flex-wrap items-center gap-2">
                      {r.username ? (
                        <span className="text-mono-sm text-ink-muted">{r.username}</span>
                      ) : null}
                      <Chip tone={TONE[r.status]}>
                        {r.status === 'issued' && r.expiresAt
                          ? t('status_issued', { date: shortDate(r.expiresAt.slice(0, 10)) })
                          : t(`status_${r.status}`)}
                      </Chip>
                      {r.guardians === 0 ? <Chip tone="absent">{t('noGuardian')}</Chip> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Checkbox
            label={t('withGuardians')}
            hint={t('withGuardiansHelp')}
            checked={withGuardians}
            onChange={(e) => setWithGuardians(e.target.checked)}
          />
          <Banner tone="signal" icon={TriangleAlert}>
            {t('onceHint')}
          </Banner>
          {issue.error ? <FormError message={problem(issue.error)} /> : null}
          <Button
            className="self-start"
            iconLeft={Printer}
            disabled={sel.size === 0}
            loading={issue.isPending}
            onClick={() =>
              issue.mutate(
                { studentIds: [...sel], withGuardianCodes: withGuardians },
                { onSuccess: (r) => setLetters(r.data) },
              )
            }
          >
            {t('create', { count: sel.size })}
          </Button>
        </>
      )}
    </div>
  );
}

/** Druckansicht: ein Brief je Seite mit Benutzername, Code und QR-Code; Eltern-Code als eigener Abschnitt. */
function Letters({ letters, onDone }: { letters: AccessLetter[]; onDone: () => void }) {
  const t = useT('access');
  const [qr, setQr] = useState<Record<string, string>>({});
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  useEffect(() => {
    let alive = true;
    void Promise.all(
      letters.map(
        async (l) =>
          [
            l.personId,
            await QRCode.toDataURL(`${origin}/zugang#code=${l.code}`, { margin: 1, width: 160 }),
          ] as const,
      ),
    ).then((pairs) => alive && setQr(Object.fromEntries(pairs)));
    return () => {
      alive = false;
    };
  }, [letters, origin]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-4 pb-8 lg:px-6 lg:pt-6 print:max-w-none print:p-0">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Button iconLeft={Printer} onClick={() => window.print()}>
          {t('print')}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          {t('printDone')}
        </Button>
        <p className="w-full text-body-sm text-ink-muted">{t('printHelp')}</p>
      </div>
      {letters.map((l) => (
        <article
          key={l.personId}
          className="flex break-after-page flex-col gap-4 rounded-lg bg-bg-raised p-6 ring-1 ring-line print:rounded-none print:ring-0"
        >
          <header className="flex flex-col gap-1">
            <p className="text-overline text-ink-muted">{t('letterOverline')}</p>
            <h2 className="text-h2">
              {l.firstName} {l.lastName}
              {l.className ? ` · ${l.className}` : ''}
            </h2>
          </header>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-3 sm:col-span-2">
              <p className="text-body">{t('letterStudent')}</p>
              <ol className="list-decimal pl-5 text-body-sm">
                <li>{t('letterStep1', { url: `${origin}/zugang` })}</li>
                <li>{t('letterStep2')}</li>
                <li>{t('letterStep3')}</li>
              </ol>
              <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
                <dt className="text-label text-ink-muted">{t('username')}</dt>
                <dd className="text-mono">{l.username}</dd>
                <dt className="text-label text-ink-muted">{t('code')}</dt>
                <dd className="text-mono text-h3">{l.code}</dd>
                <dt className="text-label text-ink-muted">{t('validUntil')}</dt>
                <dd className="text-body-sm">{shortDate(l.expiresAt.slice(0, 10))}</dd>
              </dl>
            </div>
            {qr[l.personId] ? (
              // QR-Code als Data-URL (wie bei der Zwei-Faktor-Einrichtung), CSP-konform
              <img
                src={qr[l.personId]}
                alt={t('qrAlt')}
                width={160}
                height={160}
                className="self-start"
              />
            ) : (
              <Skeleton className="size-40" />
            )}
          </div>
          {l.guardianCode ? (
            <section className="flex flex-col gap-2 border-t border-dashed border-line-strong pt-4">
              <h3 className="text-h3">{t('letterGuardianTitle')}</h3>
              <p className="text-body-sm">
                {t('letterGuardian', { url: `${origin}/eltern-code` })}
              </p>
              <p className="text-mono text-h3">{l.guardianCode}</p>
            </section>
          ) : null}
        </article>
      ))}
    </div>
  );
}
