'use client';
import Link from 'next/link';
import { ACTIONS, PERMISSION_MATRIX, ROLES, type Role } from '@sp/shared';
import { Card, Chip, Skeleton } from '@sp/ui';
import { useApi } from '../../lib/use-api';
import { useT } from '../../lib/i18n';
import { PageTitle } from '../page-title';
import { LoadError } from '../load-error';

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
  const t = useT('rolesAdmin');
  const tr = useT('roles');
  const q = useApi<Holders>(['admin', 'roles'], '/admin/roles');

  return (
    <div className="mx-auto flex w-full max-w-(--content-max) flex-col gap-6 px-4 pt-4 pb-8 lg:px-6 lg:pt-6">
      <div className="flex flex-col gap-2">
        <PageTitle area="administration">{t('title')}</PageTitle>
        <p className="text-body-sm text-ink-muted">{t('intro')}</p>
      </div>

      <section aria-labelledby="holders-h" className="flex flex-col gap-3">
        <h2 id="holders-h" className="text-h3">
          {t('holders')}
        </h2>
        {q.isPending ? (
          <Skeleton className="h-40 w-full rounded-lg" />
        ) : !q.data ? (
          <LoadError error={q.error} onRetry={() => void q.refetch()} />
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {(['ADMIN', 'PRINCIPAL', 'HOMEROOM'] as const).map((role) => {
              const list = q.data.holders.filter((h) => h.role === role);
              return (
                <Card key={role} className="flex flex-col gap-2">
                  <h3 className="flex items-center justify-between gap-2 text-h3">
                    {tr(role)}
                    <Chip tone="mono">{list.length}</Chip>
                  </h3>
                  {list.length === 0 ? (
                    <p className="text-body-sm text-ink-muted">{t('nobody')}</p>
                  ) : (
                    <ul className="flex flex-col divide-y divide-line">
                      {list.map((h) => (
                        <li
                          key={`${h.person.id}-${h.class?.id ?? ''}`}
                          className="flex min-h-11 items-center gap-1 py-1 text-body-sm"
                        >
                          <Link
                            href={`/admin/personen/${h.person.id}`}
                            className="pf-focusable text-label text-brand-text underline underline-offset-4"
                          >
                            {h.person.name}
                          </Link>
                          {h.class ? (
                            <span className="text-ink-muted"> · {h.class.name}</span>
                          ) : null}
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

      <section aria-labelledby="matrix-h" className="flex flex-col gap-3">
        <h2 id="matrix-h" className="text-h3">
          {t('matrix')}
        </h2>
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-body-sm">
            <caption className="sr-only">{t('matrix')}</caption>
            <thead>
              <tr className="border-b border-line text-left text-label text-ink-muted">
                <th scope="col" className="sticky left-0 bg-bg-raised px-3 py-3">
                  {t('action')}
                </th>
                {ROLES.map((r) => (
                  <th key={r} scope="col" className="px-3 py-3">
                    {tr(r)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ACTIONS.map((a) => (
                <tr key={a} className="border-b border-line last:border-b-0">
                  <th
                    scope="row"
                    className="sticky left-0 bg-bg-raised px-3 py-2 text-left text-body-sm"
                  >
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
        </Card>
      </section>
    </div>
  );
}
