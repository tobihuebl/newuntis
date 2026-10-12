'use client';
import { ApiError } from '../lib/api-client';
import { useT } from '../lib/i18n';

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-body-sm text-danger-ink">
      {message}
    </p>
  );
}

/** Wandelt einen API-Fehler in einen verständlichen Text; `fallback` für 400/401. */
export function useErrorText() {
  const t = useT('auth');
  return (err: unknown, fallback: string): string => {
    if (err instanceof ApiError) {
      if (err.problem.status === 429) return t('tooMany');
      if (err.problem.status === 400 || err.problem.status === 401) return fallback;
    }
    return t('genericError');
  };
}
