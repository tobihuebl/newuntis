'use client';
import { Archive, CircleCheck, FilePen, Info, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Banner, Button, Card, Chip, EmptyState, Input, ListRow, Select, Sheet } from '@sp/ui';
import { shortDate } from '../../lib/dates';
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

const STATUS_ICON = { PUBLISHED: CircleCheck, DRAFT: FilePen, ARCHIVED: Archive } as const;

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
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageTitle area="stundenplan">{t('versions')}</PageTitle>
        {canEdit && schoolYearId ? (
          <Button iconLeft={Plus} onClick={() => setOpen(true)}>
            {t('newDraft')}
          </Button>
        ) : null}
      </div>
      {!schoolYearId ? (
        <Banner tone="brand" icon={Info}>
          {t('noYear')}
        </Banner>
      ) : null}
      {rows.length === 0 ? (
        <Card flat>
          <EmptyState title={t('noVersions')} description={t('noVersionsHelp')} />
        </Card>
      ) : (
        <Card className="p-0">
          <ul aria-label={t('versions')}>
            {rows.map((r) => (
              <ListRow
                key={r.id}
                as="li"
                href={`/admin/stundenplan/${r.id}`}
                linkAs={Link}
                className="min-h-16 py-3"
                title={r.name ?? `${t('statuses.' + r.status)} ${r.schoolYear.name}`}
                subtitle={`${t('validFrom')} ${shortDate(r.validFrom)} · ${t('lessonCount', { count: r.lessonCount })}`}
                trailing={
                  <Chip
                    tone={
                      r.status === 'PUBLISHED' ? 'ok' : r.status === 'DRAFT' ? 'absent' : 'neutral'
                    }
                    icon={STATUS_ICON[r.status]}
                  >
                    {t(`statuses.${r.status}`)}
                  </Chip>
                }
              />
            ))}
          </ul>
        </Card>
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
