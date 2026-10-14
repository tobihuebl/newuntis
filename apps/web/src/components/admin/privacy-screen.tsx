'use client';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Clock, Download, Lock, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import {
  PRIVACY_REQUEST_KINDS,
  type PrivacyRequestItem,
  type PrivacyRequestKind,
  type TenantSettings,
} from '@sp/shared';
import { Chip, Button, Card, EmptyState, Select, Sheet, Skeleton, Textarea } from '@sp/ui';
import { apiRequest } from '../../lib/api-client';
import { dateTimeOf } from '../../lib/dates';
import { useApi, useProblemText } from '../../lib/use-api';
import { useSession } from '../providers';
import { PersonPicker } from './person-picker';
import { useT } from '../../lib/i18n';
import { PageTitle } from '../page-title';
import { FormError } from '../form-bits';
import { LoadError } from '../load-error';

/**
 * Datenschutz (Spec Abschnitt 13, /admin/datenschutz): Anfragen zu Betroffenenrechten erfassen und erledigen,
 * Datenauskunft herunterladen, Aufbewahrungsfristen einsehen.
 */
export function PrivacyScreen() {
  const t = useT('privacy');
  const tc = useT('common');
  const problem = useProblemText();
  const { csrfToken } = useSession();
  const qc = useQueryClient();
  const q = useApi<{ data: PrivacyRequestItem[] }>(
    ['privacy', 'requests'],
    '/admin/privacy/requests',
  );
  const settings = useApi<TenantSettings>(['admin', 'settings'], '/admin/settings');
  const [person, setPerson] = useState<{ id: string; name: string } | null>(null);
  const [kind, setKind] = useState<PrivacyRequestKind>('ACCESS');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [resolve, setResolve] = useState<PrivacyRequestItem | null>(null);
  const [resolveNote, setResolveNote] = useState('');
  const refresh = () => void qc.invalidateQueries({ queryKey: ['privacy'] });

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!person) return;
    setError(null);
    try {
      await apiRequest(
        'POST',
        '/admin/privacy/requests',
        { personId: person.id, kind, note: note || null },
        csrfToken,
      );
      setPerson(null);
      setNote('');
      refresh();
    } catch (err) {
      setError(problem(err));
    }
  }

  async function finish(status: 'DONE' | 'REJECTED', lift = false) {
    if (!resolve) return;
    setError(null);
    try {
      await apiRequest(
        'PATCH',
        `/admin/privacy/requests/${resolve.id}`,
        { status, note: resolveNote || resolve.note, lift },
        csrfToken,
      );
      setResolve(null);
      setResolveNote('');
      refresh();
    } catch (err) {
      setError(problem(err));
    }
  }

  const exportLinks = (personId: string) => (
    <span className="flex flex-wrap gap-2">
      {(['json', 'pdf'] as const).map((f) => (
        <Button key={f} variant="ghost" size="sm" asChild iconLeft={Download}>
          <a href={`/api/v1/admin/privacy/persons/${personId}/export?format=${f}`} download>
            {t(`export_${f}`)}
          </a>
        </Button>
      ))}
    </span>
  );

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 pt-4 pb-8 lg:px-6 lg:pt-6">
      <PageTitle area="administration">{t('title')}</PageTitle>

      <section aria-labelledby="new-h" className="flex flex-col gap-3">
        <h2 id="new-h" className="text-h3">
          {t('newRequest')}
        </h2>
        <Card>
          <form onSubmit={create} className="flex flex-col gap-4" noValidate>
            {person ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-body">
                  {t('person')}: <strong className="text-body-strong">{person.name}</strong>
                </p>
                <Button type="button" variant="ghost" size="sm" onClick={() => setPerson(null)}>
                  {t('otherPerson')}
                </Button>
              </div>
            ) : (
              <PersonPicker
                label={t('searchPerson')}
                onPick={(id, name) => setPerson({ id, name })}
              />
            )}
            <Select
              label={t('kind')}
              value={kind}
              onChange={(e) => setKind(e.target.value as PrivacyRequestKind)}
              options={PRIVACY_REQUEST_KINDS.map((k) => ({ value: k, label: t(`kind_${k}`) }))}
            />
            <p className="text-body-sm text-ink-muted">{t(`help_${kind}`)}</p>
            <Textarea
              label={t('note')}
              value={note}
              maxLength={2000}
              onChange={(e) => setNote(e.target.value)}
            />
            {error && !resolve ? <FormError message={error} /> : null}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={!person}>
                {t('record')}
              </Button>
              {person ? exportLinks(person.id) : null}
            </div>
          </form>
        </Card>
      </section>

      <section aria-labelledby="list-h" className="flex flex-col gap-3">
        <h2 id="list-h" className="text-h3">
          {t('requests')}
        </h2>
        {q.isPending ? (
          <Skeleton className="h-32 w-full rounded-lg" />
        ) : q.isError ? (
          <LoadError error={q.error} onRetry={() => void q.refetch()} />
        ) : q.data.data.length === 0 ? (
          <Card flat>
            <EmptyState as="h3" title={t('empty')} />
          </Card>
        ) : (
          <Card className="p-0">
            <ul>
              {q.data.data.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-col gap-2 border-b border-line px-4 py-3 last:border-b-0"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-body-strong">
                      {r.person.anonymized ? (
                        t('anonymized')
                      ) : (
                        <Link
                          href={`/admin/personen/${r.person.id}`}
                          className="pf-focusable text-brand-text underline underline-offset-4"
                        >
                          {r.person.name}
                        </Link>
                      )}
                      <span className="text-body-sm text-ink-muted"> · {t(`kind_${r.kind}`)}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      {r.person.restricted ? (
                        <Chip tone="late" icon={Lock}>
                          {t('restricted')}
                        </Chip>
                      ) : null}
                      <Chip
                        tone={r.status === 'OPEN' ? 'late' : r.status === 'DONE' ? 'ok' : 'absent'}
                        icon={r.status === 'OPEN' ? Clock : r.status === 'DONE' ? Check : X}
                      >
                        {t(`status_${r.status}`)}
                      </Chip>
                    </span>
                  </div>
                  <p className="text-caption text-ink-muted">
                    {t('createdBy', { name: r.createdBy ?? '–', time: dateTimeOf(r.createdAt) })}
                    {r.resolvedAt
                      ? ` · ${t('resolvedBy', { name: r.resolvedBy ?? '–', time: dateTimeOf(r.resolvedAt) })}`
                      : ''}
                  </p>
                  {r.note ? <p className="text-body-sm whitespace-pre-wrap">{r.note}</p> : null}
                  <div className="flex flex-wrap gap-2">
                    {r.status === 'OPEN' ? (
                      <Button variant="secondary" size="sm" onClick={() => setResolve(r)}>
                        {t('handle')}
                      </Button>
                    ) : null}
                    {!r.person.anonymized && (r.kind === 'ACCESS' || r.status === 'OPEN')
                      ? exportLinks(r.person.id)
                      : null}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <section aria-labelledby="ret-h" className="flex flex-col gap-3">
        <h2 id="ret-h" className="text-h3">
          {t('retention')}
        </h2>
        <Card className="flex flex-col gap-2">
          <p className="text-body-sm text-ink-muted">{t('retentionHelp')}</p>
          {settings.data ? (
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-body-sm">
              {(
                [
                  'messagesDays',
                  'absencesDays',
                  'attachmentsDays',
                  'notificationsDays',
                  'remarksDays',
                  'auditLogDays',
                ] as const
              ).map((k) => (
                <div key={k} className="contents">
                  <dt>{t(`ret_${k}`)}</dt>
                  <dd className="text-right text-mono">
                    {t('days', { count: settings.data!.retention[k] })}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <Skeleton className="h-24 w-full" />
          )}
          <Button variant="ghost" size="sm" asChild className="self-start">
            <Link href="/admin/einstellungen#aufbewahrung">{t('changeRetention')}</Link>
          </Button>
        </Card>
      </section>

      <Sheet
        open={resolve !== null}
        onOpenChange={(o) => (o ? undefined : setResolve(null))}
        title={resolve ? `${t(`kind_${resolve.kind}`)}: ${resolve.person.name}` : ''}
        description={resolve ? t(`resolve_${resolve.kind}`) : ''}
        closeLabel={tc('cancel')}
      >
        <div className="flex flex-col gap-3">
          <Textarea
            label={t('note')}
            value={resolveNote}
            maxLength={2000}
            onChange={(e) => setResolveNote(e.target.value)}
          />
          {error && resolve ? <FormError message={error} /> : null}
          <div className="flex flex-wrap gap-2">
            {resolve?.kind === 'ERASURE' ? (
              <Button variant="danger" onClick={() => void finish('DONE')}>
                {t('doErase')}
              </Button>
            ) : resolve?.kind === 'RESTRICTION' ? (
              <>
                <Button onClick={() => void finish('DONE')}>{t('doRestrict')}</Button>
                {resolve.person.restricted ? (
                  <Button variant="secondary" onClick={() => void finish('DONE', true)}>
                    {t('doLift')}
                  </Button>
                ) : null}
              </>
            ) : (
              <Button onClick={() => void finish('DONE')}>{t('doDone')}</Button>
            )}
            <Button variant="ghost" onClick={() => void finish('REJECTED')}>
              {t('doReject')}
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
