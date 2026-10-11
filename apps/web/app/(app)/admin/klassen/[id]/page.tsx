import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Card, ListRow } from '@sp/ui';
import { GuardianCodes } from '../../../../../src/components/admin/guardian-codes';
import { adminPage } from '../../../../../src/lib/admin';
import { apiGet } from '../../../../../src/lib/api-server';

interface ClassDetail {
  id: string;
  name: string;
  homeroomTeacher: { firstName: string; lastName: string } | null;
  students: { id: string; firstName: string; lastName: string; externalId: string | null }[];
}

export default async function ClassDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { csrfToken, readOnly } = await adminPage(`/admin/klassen/${id}`);
  const t = await getTranslations('admin.classes');
  const c = await apiGet<ClassDetail>(`/admin/classes/${id}`);
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
      <div>
        <Link href="/admin/klassen" className="text-sm text-primary underline">
          {t('title')}
        </Link>
        <h1 className="text-2xl font-semibold">{c.name}</h1>
        <p className="text-muted">
          {t('homeroom')}:{' '}
          {c.homeroomTeacher
            ? `${c.homeroomTeacher.firstName} ${c.homeroomTeacher.lastName}`
            : t('noHomeroom')}
        </p>
      </div>
      <Card className="p-0">
        <h2 className="border-b border-border px-4 py-3 text-lg font-semibold">
          {t('studentList')} ({c.students.length})
        </h2>
        {c.students.map((s) => (
          <ListRow
            key={s.id}
            title={
              <Link
                className="text-primary underline"
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
