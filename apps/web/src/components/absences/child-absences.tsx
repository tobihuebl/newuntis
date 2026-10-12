'use client';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRef, useState } from 'react';
import type { AbsenceItem } from '@sp/shared';
import { Button, Card, EmptyState, Skeleton } from '@sp/ui';
import { ApiError, apiUpload } from '../../lib/api-client';
import { useApi } from '../../lib/use-api';
import { useSession } from '../providers';
import { AbsenceList } from './absence-list';
import { useT } from '../../lib/i18n';

/** Fehlzeiten eines Kindes (Eltern, Spec Abschnitt 5: /kind/[id]/fehlzeiten). */
export function ChildAbsences({ studentId }: { studentId: string }) {
  const t = useT('absence');
  const tc = useT('common');
  const { csrfToken } = useSession();
  const qc = useQueryClient();
  const q = useApi<{ data: AbsenceItem[] }>(
    ['absences', studentId],
    `/absences?studentId=${studentId}`,
  );
  const input = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<AbsenceItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-h1">{t('list')}</h1>
        <Button asChild>
          <Link href={`/abwesenheit/neu?kind=${studentId}`}>{t('title')}</Link>
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-body-sm text-danger-ink">
          {error}
        </p>
      ) : null}
      {q.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : q.isError ? (
        <Card>
          <EmptyState
            title={
              q.error instanceof ApiError && q.error.problem.status === 403
                ? tc('forbidden')
                : tc('error')
            }
          />
        </Card>
      ) : q.data.data.length === 0 ? (
        <Card>
          <EmptyState title={t('listEmpty')} />
        </Card>
      ) : (
        <Card className="p-0">
          <AbsenceList
            items={q.data.data}
            onUpload={(a) => {
              setTarget(a);
              input.current?.click();
            }}
          />
        </Card>
      )}
      <input
        ref={input}
        type="file"
        aria-label={t('addAttachment')}
        accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
        className="sr-only"
        tabIndex={-1}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file || !target) return;
          setError(null);
          try {
            await apiUpload(`/absences/${target.id}/attachments`, file, csrfToken);
            void qc.invalidateQueries({ queryKey: ['absences'] });
          } catch (err) {
            setError(err instanceof ApiError ? err.problem.title : tc('error'));
          }
        }}
      />
    </div>
  );
}
