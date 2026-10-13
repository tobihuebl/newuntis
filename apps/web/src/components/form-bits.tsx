'use client';
import { CircleCheck, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { Banner, Button } from '@sp/ui';
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

/** Textlink unter Anmeldeformularen: tippbar (44 px), Kobalt-Text, Unterstreichung beim Zeigen. */
export const authLinkClass =
  'pf-focusable inline-flex min-h-(--tap-min) items-center justify-center text-center text-label text-brand-text underline-offset-4 hover:underline';

/** Erfolg nach einem Anmelde-Schritt (Passwort gesetzt, Konto angelegt): Banner und Weg zur Anmeldung. */
export function AuthDone({ text, action }: { text: string; action: string }) {
  return (
    <div className="flex flex-col gap-4">
      <Banner tone="brand" icon={CircleCheck} role="status">
        {text}
      </Banner>
      <Button asChild block>
        <Link href="/login">{action}</Link>
      </Button>
    </div>
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
