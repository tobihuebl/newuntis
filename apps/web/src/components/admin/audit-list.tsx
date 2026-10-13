'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card, EmptyState, Input, Skeleton } from '@sp/ui';
import { dateTimeOf } from '../../lib/dates';
import { apiRequest } from '../../lib/api-client';
import { useT } from '../../lib/i18n';
import { PageTitle } from '../page-title';
import { LoadError } from '../load-error';

interface Entry {
  id: string;
  createdAt: string;
  action: string;
  entity: string;
  entityId: string | null;
  actor: string | null;
}

export function AuditList() {
  const t = useT('admin.audit');
  const c = useT('common');
  const [filter, setFilter] = useState('');
  const [rows, setRows] = useState<Entry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const seq = useRef(0);

  const load = useCallback(
    async (after: string | null) => {
      const mine = ++seq.current;
      setLoading(true);
      setError(false);
      const params = new URLSearchParams({ limit: '50' });
      if (filter.trim()) params.set('action', filter.trim());
      if (after) params.set('cursor', after);
      try {
        const page = await apiRequest<{ data: Entry[]; nextCursor: string | null }>(
          'GET',
          `/admin/audit?${params}`,
        );
        if (mine !== seq.current) return;
        setRows((prev) => (after ? [...prev, ...page.data] : page.data));
        setCursor(page.nextCursor);
      } catch {
        if (mine === seq.current) setError(true);
      }
      if (mine === seq.current) setLoading(false);
    },
    [filter],
  );

  useEffect(() => {
    const timer = setTimeout(() => void load(null), 250);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <div className="mx-auto flex w-full max-w-(--content-max) flex-col gap-6 px-4 pt-4 pb-8 lg:px-6 lg:pt-6">
      <PageTitle area="administration">{t('title')}</PageTitle>
      <Input
        className="max-w-sm"
        label={t('filter')}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        type="search"
      />
      {error ? <LoadError onRetry={() => void load(null)} /> : null}
      <Card className="overflow-x-auto p-0" aria-live="polite" aria-busy={loading}>
        <table className="w-full text-left text-body-sm">
          <thead className="border-b border-line text-label text-ink-muted">
            <tr>
              <th scope="col" className="px-4 py-2">
                {t('time')}
              </th>
              <th scope="col" className="px-4 py-2">
                {t('action')}
              </th>
              <th scope="col" className="px-4 py-2">
                {t('actor')}
              </th>
              <th scope="col" className="px-4 py-2">
                {t('entity')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-b-0">
                <td className="px-4 py-2 text-mono-sm whitespace-nowrap">
                  {dateTimeOf(r.createdAt)}
                </td>
                <td className="px-4 py-2 text-mono-sm">{r.action}</td>
                <td className="px-4 py-2">{r.actor ?? t('system')}</td>
                <td className="px-4 py-2">{r.entity}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && rows.length === 0 ? (
          <div className="flex flex-col gap-2 p-4">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        ) : null}
        {!loading && !error && rows.length === 0 ? <EmptyState title={t('empty')} /> : null}
      </Card>
      {cursor ? (
        <div className="flex justify-center">
          <Button variant="secondary" onClick={() => void load(cursor)} loading={loading}>
            {c('loadMore')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
