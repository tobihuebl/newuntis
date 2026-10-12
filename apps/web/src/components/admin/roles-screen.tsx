'use client';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ACTIONS, PERMISSION_MATRIX, ROLES, type Role } from '@sp/shared';
import { Card, EmptyState, Skeleton } from '@sp/ui';
import { useApi } from '../../lib/use-api';

interface Holders {
  holders: {
    role: Role;
    person: { id: string; name: string };
    class: { id: string; name: string } | null;
  }[];
  counts: Partial<Record<Role, number>>;
}

/**
 * Rollen und Rechte (AD-01): Übersicht der Rollenträger:innen und die Rechte-Matrix (Spec Abschnitt 3).
 * Die Matrix ist fest im Code (packages/shared/src/permissions.ts), vergeben wird je Person bzw. Klasse.
 */
export function RolesScreen() {
  const t = useTranslations('rolesAdmin');
  const tr = useTranslations('roles');
  const tc = useTranslations('common');
  const q = useApi<Holders>(['admin', 'roles'], '/admin/roles');

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4">
      <div>
        <h1 className="text-h1">{t('title')}</h1>
        <p className="text-body-sm text-ink-muted">{t('intro')}</p>
      </div>

      <section aria-labelledby="holders-h" className="flex flex-col gap-2">
        <h2 id="holders-h" className="text-h3">
          {t('holders')}
        </h2>
        {q.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : !q.data ? (
          <Card>
            <EmptyState title={tc('error')} />
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {(['ADMIN', 'PRINCIPAL', 'HOMEROOM'] as const).map((role) => {
              const list = q.data.holders.filter((h) => h.role === role);
              return (
                <Card key={role} className="flex flex-col gap-2">
                  <h3 className="font-medium">
                    {tr(role)}{' '}
                    <span className="text-body-sm text-ink-muted tabular-nums">({list.length})</span>
                  </h3>
                  {list.length === 0 ? (
                    <p className="text-body-sm text-ink-muted">{t('nobody')}</p>
                  ) : (
                    <ul className="flex flex-col">
                      {list.map((h) => (
                        <li
                          key={`${h.person.id}-${h.class?.id ?? ''}`}
                          className="min-h-9 py-1 text-body-sm"
                        >
                          <Link
                            href={`/admin/personen/${h.person.id}`}
                            className="underline-offset-2 hover:underline"
                          >
                            {h.person.name}
                          </Link>
                          {h.class ? <span className="text-ink-muted"> · {h.class.name}</span> : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              );
            })}
          </div>
        )}
        <p className="text-body-sm text-ink-muted">{t('howTo')}</p>
        {q.data ? (
          <p className="text-body-sm text-ink-muted">
            {(['STUDENT', 'GUARDIAN', 'TEACHER'] as const)
              .map((r) => `${tr(r)}: ${q.data!.counts[r] ?? 0}`)
              .join(' · ')}
          </p>
        ) : null}
      </section>

      <section aria-labelledby="matrix-h" className="flex flex-col gap-2">
        <h2 id="matrix-h" className="text-h3">
          {t('matrix')}
        </h2>
        <div className="overflow-x-auto rounded-md border border-line bg-bg-raised">
          <table className="w-full text-body-sm">
            <caption className="sr-only">{t('matrix')}</caption>
            <thead>
              <tr className="border-b border-line text-left text-ink-muted">
                <th scope="col" className="px-3 py-2 font-medium">
                  {t('action')}
                </th>
                {ROLES.map((r) => (
                  <th key={r} scope="col" className="px-3 py-2 font-medium">
                    {tr(r)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ACTIONS.map((a) => (
                <tr key={a} className="border-b border-line last:border-b-0">
                  <th scope="row" className="px-3 py-2 text-left font-normal">
                    {t(`a_${a.replaceAll('.', '_')}`)}
                  </th>
                  {ROLES.map((r) => {
                    const scope = PERMISSION_MATRIX[a][r];
                    return (
                      <td key={r} className={scope ? 'px-3 py-2' : 'px-3 py-2 text-ink-muted'}>
                        {scope ? t(`scope_${scope}`) : t('no')}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
