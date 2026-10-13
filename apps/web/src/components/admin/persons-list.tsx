'use client';
import { Eye, Mail, Plus, Upload, UserCheck, UserX } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Chip,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Input,
  ListRow,
  Select,
  Sheet,
  Skeleton,
  type SelectOption,
} from '@sp/ui';
import { ApiError, apiRequest } from '../../lib/api-client';
import { useT } from '../../lib/i18n';
import { PageTitle } from '../page-title';
import { FormError } from '../form-bits';
import { LoadError } from '../load-error';

export interface PersonRow {
  id: string;
  kind: 'STUDENT' | 'TEACHER' | 'GUARDIAN' | 'STAFF';
  firstName: string;
  lastName: string;
  email: string | null;
  externalId: string | null;
  className: string | null;
  roles: string[];
  account: 'active' | 'invited' | 'none';
}
interface Page {
  data: PersonRow[];
  nextCursor: string | null;
}

const KINDS = ['STUDENT', 'TEACHER', 'GUARDIAN', 'STAFF'] as const;

/** Zugang als Chip: aktiv (ok), eingeladen (Hinweis), kein Konto (inaktiv). */
export function AccountChip({ account }: { account: PersonRow['account'] }) {
  const t = useT('admin.persons');
  return (
    <Chip
      tone={account === 'active' ? 'ok' : account === 'invited' ? 'late' : 'absent'}
      icon={account === 'active' ? UserCheck : account === 'invited' ? Mail : UserX}
    >
      {t(`account.${account}`)}
    </Chip>
  );
}

export function PersonsList({
  classes,
  csrfToken,
  readOnly,
}: {
  classes: SelectOption[];
  csrfToken: string;
  readOnly: boolean;
}) {
  const t = useT('admin.persons');
  const c = useT('common');
  const router = useRouter();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [classId, setClassId] = useState('');
  const [rows, setRows] = useState<PersonRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [newKind, setNewKind] = useState('STUDENT');
  const seq = useRef(0);

  const load = useCallback(
    async (after: string | null) => {
      const mine = ++seq.current;
      setLoading(true);
      setError(false);
      const params = new URLSearchParams({ limit: '25' });
      if (q.trim()) params.set('q', q.trim());
      if (kind) params.set('kind', kind);
      if (classId) params.set('classId', classId);
      if (after) params.set('cursor', after);
      try {
        const page = await apiRequest<Page>('GET', `/admin/persons?${params}`);
        if (mine !== seq.current) return; // eine neuere Suche läuft
        setRows((prev) => (after ? [...prev, ...page.data] : page.data));
        setCursor(page.nextCursor);
      } catch {
        if (mine === seq.current) setError(true);
      }
      if (mine === seq.current) setLoading(false);
    },
    [q, kind, classId],
  );

  // Suche mit kleiner Verzögerung, damit nicht jeder Tastendruck eine Anfrage auslöst
  useEffect(() => {
    const timer = setTimeout(() => void load(null), 250);
    return () => clearTimeout(timer);
  }, [load]);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (name: string) => String(f.get(name) ?? '').trim() || null;
    const extraRoles = ['PRINCIPAL', 'ADMIN'].filter((r) => f.get(`role-${r}`) === 'on');
    setFormError(null);
    try {
      const res = await apiRequest<{ id: string }>(
        'POST',
        '/admin/persons',
        {
          kind: newKind,
          firstName: text('firstName'),
          lastName: text('lastName'),
          email: text('email'),
          externalId: text('externalId'),
          birthDate: text('birthDate'),
          classId: newKind === 'STUDENT' ? text('classId') : null,
          extraRoles,
        },
        csrfToken,
      );
      setCreating(false);
      router.push(`/admin/personen/${res.id}`);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.problem.title : c('error'));
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 pt-4 pb-8 lg:px-6 lg:pt-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageTitle area="stammdaten">{t('title')}</PageTitle>
        {readOnly ? (
          <Chip tone="absent" icon={Eye}>
            {c('readOnly')}
          </Chip>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" asChild iconLeft={Upload}>
              <Link href="/admin/import">{t('importLink')}</Link>
            </Button>
            <Button iconLeft={Plus} onClick={() => setCreating(true)}>
              {t('new')}
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Input
          label={c('search')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('search')}
          type="search"
        />
        <Select
          label={t('kind')}
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          emptyLabel={t('all')}
          options={KINDS.map((k) => ({ value: k, label: t(`kinds.${k}`) }))}
        />
        <Select
          label={t('class')}
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          emptyLabel={t('allClasses')}
          options={classes}
        />
      </div>

      {error ? <LoadError onRetry={() => void load(null)} /> : null}
      <Card className="p-0" aria-live="polite" aria-busy={loading}>
        {rows.length > 0 ? (
          <ul aria-label={t('title')}>
            {rows.map((p) => (
              <ListRow
                key={p.id}
                as="li"
                href={`/admin/personen/${p.id}`}
                linkAs={Link}
                title={`${p.lastName} ${p.firstName}`}
                subtitle={[t(`kinds.${p.kind}`), p.className, p.externalId, p.email]
                  .filter(Boolean)
                  .join(' · ')}
                trailing={<AccountChip account={p.account} />}
              />
            ))}
          </ul>
        ) : null}
        {loading && rows.length === 0 ? (
          <div className="flex flex-col gap-2 p-4" aria-hidden="true">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : null}
        {!loading && !error && rows.length === 0 ? (
          <EmptyState title={t('emptyTitle')} description={t('emptyDescription')} />
        ) : null}
      </Card>
      {cursor ? (
        <div className="flex justify-center">
          <Button variant="secondary" onClick={() => void load(cursor)} loading={loading}>
            {c('loadMore')}
          </Button>
        </div>
      ) : null}

      <Sheet open={creating} onOpenChange={setCreating} title={t('new')} closeLabel={c('close')}>
        <form onSubmit={create} className="flex flex-col gap-4" noValidate>
          <Select
            label={t('kind')}
            name="kind"
            value={newKind}
            onChange={(e) => setNewKind(e.target.value)}
            options={KINDS.map((k) => ({ value: k, label: t(`kinds.${k}`) }))}
          />
          <Input label={t('firstName')} name="firstName" required />
          <Input label={t('lastName')} name="lastName" required />
          <Input label={t('email')} name="email" type="email" />
          {newKind === 'STUDENT' ? (
            <>
              <Input label={t('externalId')} name="externalId" />
              <Input label={t('birthDate')} name="birthDate" type="date" />
              <Select
                label={t('class')}
                name="classId"
                options={classes}
                emptyLabel={t('noClass')}
              />
            </>
          ) : null}
          {newKind === 'TEACHER' || newKind === 'STAFF' ? (
            <fieldset className="flex flex-col">
              <legend className="text-label">{t('roles')}</legend>
              <Checkbox name="role-PRINCIPAL" label={t('extra.PRINCIPAL')} />
              <Checkbox name="role-ADMIN" label={t('extra.ADMIN')} />
            </fieldset>
          ) : null}
          {formError ? <FormError message={formError} /> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setCreating(false)}>
              {c('cancel')}
            </Button>
            <Button type="submit">{c('create')}</Button>
          </div>
        </form>
      </Sheet>
    </div>
  );
}
