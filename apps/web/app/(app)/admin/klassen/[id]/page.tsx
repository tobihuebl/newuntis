import Link from 'next/link';
import { Card, ListRow } from '@sp/ui';
import { GuardianCodes } from '../../../../../src/components/admin/guardian-codes';
import { adminPage } from '../../../../../src/lib/admin';
import { apiGet } from '../../../../../src/lib/api-server';
import { getT } from '../../../../../src/lib/nav-server';
import { PageTitle } from '../../../../../src/components/page-title';

interface ClassDetail {
  id: string;
  name: string;
  homeroomTeacher: { firstName: string; lastName: string } | null;
  students: { id: string; firstName: string; lastName: string; externalId: string | null }[];
}

export default async function ClassDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { csrfToken, readOnly } = await adminPage(`/admin/klassen/${id}`);
  const t = await getT('admin.classes');
  const c = await apiGet<ClassDetail>(`/admin/classes/${id}`);
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 pt-4 pb-8 lg:px-6 lg:pt-6">
      <div>
        <Link href="/admin/klassen" className="text-body-sm text-brand-text underline">
          {t('title')}
        </Link>
        <PageTitle area="stammdaten">{c.name}</PageTitle>
        <p className="text-ink-muted">
          {t('homeroom')}:{' '}
          {c.homeroomTeacher
            ? `${c.homeroomTeacher.firstName} ${c.homeroomTeacher.lastName}`
            : t('noHomeroom')}
        </p>
      </div>
      <Card className="p-0">
        <h2 className="border-b border-line px-4 py-3 text-h3">
          {t('studentList')} ({c.students.length})
        </h2>
        {c.students.map((s) => (
          <ListRow
            key={s.id}
            title={
              <Link
                className="text-brand-text underline"
                href={`/admin/personen/${s.id}`}
              >{`${s.lastName} ${s.firstName}`}</Link>
            }
            subtitle={s.externalId ?? undefined}
          />
        ))}
      </Card>
      {readOnly ? null : (
        <Card>
          <GuardianCodes
            studentIds={c.students.map((s) => s.id)}
            csrfToken={csrfToken}
            scope={c.name}
          />
        </Card>
      )}
    </div>
  );
}
