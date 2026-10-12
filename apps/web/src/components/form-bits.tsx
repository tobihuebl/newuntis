'use client';
import { TriangleAlert } from 'lucide-react';
import { ApiError } from '../lib/api-client';
import { useT } from '../lib/i18n';

/** Fehler am Formular (Design System: mit Icon und Anweisung, Fläche danger-soft, nie als Alert-Dialog). */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-md bg-danger-soft px-4 py-3 text-label text-danger-ink"
    >
      <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
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
