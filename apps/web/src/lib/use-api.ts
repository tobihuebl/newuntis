'use client';
import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useSession } from '../components/providers';
import { ApiError, apiRequest } from './api-client';

/** Online-Abfrage (Seiten außerhalb von Heute, Plan und Klassenbuch brauchen Verbindung). */
export function useApi<T>(key: QueryKey, path: string | null) {
  return useQuery({
    queryKey: key,
    queryFn: () => apiRequest<T>('GET', path!),
    enabled: path !== null,
  });
}

/** Schreibender Aufruf mit CSRF-Token; danach die genannten Abfragen neu laden. */
export function useApiMutation<TBody, TResult = unknown>(
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: (body: TBody) => string,
  invalidate: QueryKey[] = [],
) {
  const { csrfToken } = useSession();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: TBody) =>
      apiRequest<TResult>(method, path(body), method === 'DELETE' ? undefined : body, csrfToken),
    onSuccess: () => {
      for (const k of invalidate) void qc.invalidateQueries({ queryKey: k });
    },
  });
}

/** Verständlicher Fehlertext aus einer Problem-Antwort der API. */
export function useProblemText() {
  const t = useTranslations('common');
  return (err: unknown): string | null => {
    if (!err) return null;
    if (err instanceof ApiError) {
      if (err.problem.status === 403) return t('forbidden');
      const field = err.problem.errors?.[0]?.message;
      return field ? `${err.problem.title}: ${field}` : err.problem.title;
    }
    return t('error');
  };
}
