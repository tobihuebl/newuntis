'use client';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Input, ListRow } from '@sp/ui';
import { apiRequest } from '../../lib/api-client';

interface Hit {
  id: string;
  firstName: string;
  lastName: string;
  className: string | null;
  email: string | null;
}

/** Sucht Personen einer Art und meldet die gewählte zurück. */
export function PersonPicker({
  kind,
  label,
  onPick,
}: {
  kind: 'STUDENT' | 'GUARDIAN';
  label: string;
  onPick: (id: string, name: string) => void;
}) {
  const c = useTranslations('common');
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);

  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    const timer = setTimeout(() => {
      apiRequest<{ data: Hit[] }>(
        'GET',
        `/admin/persons?kind=${kind}&limit=8&q=${encodeURIComponent(q.trim())}`,
      )
        .then((r) => setHits(r.data))
        .catch(() => setHits([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [q, kind]);

  return (
    <div className="flex flex-col gap-2">
      <Input
        label={label}
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={c('search')}
      />
      <ul className="rounded-sm border border-border">
        {hits.map((h) => (
          <li key={h.id}>
            <button
              type="button"
              className="block w-full text-left hover:bg-surface-2"
              onClick={() => onPick(h.id, `${h.lastName} ${h.firstName}`)}
            >
              <ListRow
                title={`${h.lastName} ${h.firstName}`}
                subtitle={[h.className, h.email].filter(Boolean).join(' · ')}
              />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
