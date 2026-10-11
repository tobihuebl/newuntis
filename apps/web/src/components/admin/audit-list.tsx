'use client';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, EmptyState, Input, Skeleton } from '@sp/ui';
import { apiRequest } from '../../lib/api-client';

interface Entry {
  id: string;
  createdAt: string;
  action: string;
  entity: string;
  entityId: string | null;
  actor: string | null;
}

export function AuditList() {
  const t = useTranslations('admin.audit');
  const c = useTranslations('common');
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
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <Input
        label={t('filter')}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        type="search"
      />
      <div
        className="overflow-x-auto rounded-md border border-border bg-surface"
        aria-live="polite"
        aria-busy={loading}
      >
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-muted">
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
              <tr key={r.id} className="border-b border-border last:border-b-0">
                <td className="whitespace-nowrap px-4 py-2 tabular-nums">
                  {new Date(r.createdAt).toLocaleString('de-AT')}
                </td>
                <td className="px-4 py-2 font-mono">{r.action}</td>
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
        {error ? (
          <EmptyState
            title={c('error')}
            action={<Button onClick={() => void load(null)}>{c('retry')}</Button>}
          />
        ) : null}
      </div>
      {cursor ? (
        <div className="flex justify-center">
          <Button variant="secondary" onClick={() => void load(cursor)} disabled={loading}>
            {c('loadMore')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
