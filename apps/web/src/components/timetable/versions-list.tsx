'use client';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Chip, Button, EmptyState, Input, Select, Sheet } from '@sp/ui';
import { ApiError, apiRequest } from '../../lib/api-client';
import { useT } from '../../lib/i18n';
import { PageTitle } from '../page-title';
import { FormError } from '../form-bits';

export interface VersionRow {
  id: string;
  name: string | null;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  validFrom: string;
  publishedAt: string | null;
  schoolYear: { id: string; name: string };
  lessonCount: number;
}

export function VersionsList({
  rows,
  schoolYearId,
  csrfToken,
  canEdit,
}: {
  rows: VersionRow[];
  schoolYearId: string | null;
  csrfToken: string;
  canEdit: boolean;
}) {
  const t = useT('timetable');
  const c = useT('common');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const published = rows.find((r) => r.status === 'PUBLISHED');

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setError(null);
    try {
      const res = await apiRequest<{ id: string }>(
        'POST',
        '/admin/timetable-versions',
        {
          schoolYearId,
          name: String(f.get('name') ?? '').trim() || null,
          copyFromVersionId: String(f.get('copyFrom') ?? '') || null,
        },
        csrfToken,
      );
      router.push(`/admin/stundenplan/${res.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.problem.title : c('error'));
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 pt-4 pb-8 lg:px-6 lg:pt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PageTitle area="stundenplan">{t('versions')}</PageTitle>
        {canEdit && schoolYearId ? (
          <Button onClick={() => setOpen(true)}>
            <Plus aria-hidden="true" size={18} />
            {t('newDraft')}
          </Button>
        ) : null}
      </div>
      {!schoolYearId ? <p className="text-ink-muted">{t('noYear')}</p> : null}
      {rows.length === 0 ? (
        <div className="rounded-md border border-line bg-bg-raised">
          <EmptyState title={t('noVersions')} description={t('noVersionsHelp')} />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-line bg-bg-raised">
          <table className="w-full text-left text-body-sm">
            <thead className="border-b border-line text-ink-muted">
              <tr>
                <th scope="col" className="px-4 py-3">
                  {t('name')}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t('status')}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t('validFrom')}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t('lessons')}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-b-0">
                  <td className="px-4 py-3">
                    <Link className="text-brand-text underline" href={`/admin/stundenplan/${r.id}`}>
                      {r.name ?? `${t('statuses.' + r.status)} ${r.schoolYear.name}`}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Chip
                      tone={
                        r.status === 'PUBLISHED' ? 'ok' : r.status === 'DRAFT' ? 'ok' : 'neutral'
                      }
                    >
                      {t(`statuses.${r.status}`)}
                    </Chip>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{r.validFrom}</td>
                  <td className="px-4 py-3 tabular-nums">{r.lessonCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Sheet open={open} onOpenChange={setOpen} title={t('newDraft')} closeLabel={c('close')}>
        <form onSubmit={create} className="flex flex-col gap-4" noValidate>
          <Input label={t('name')} name="name" />
          <Select
            label={t('copyFrom')}
            name="copyFrom"
            defaultValue={published?.id ?? ''}
            emptyLabel={t('emptyStart')}
            options={rows.map((r) => ({
              value: r.id,
              label: `${r.name ?? r.schoolYear.name} (${t('statuses.' + r.status)}, ${r.validFrom})`,
            }))}
          />
          {error ? <FormError message={error} /> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {c('cancel')}
            </Button>
            <Button type="submit">{c('create')}</Button>
          </div>
        </form>
      </Sheet>
    </div>
  );
}
