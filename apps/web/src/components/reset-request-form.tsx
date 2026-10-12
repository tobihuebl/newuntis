'use client';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button, Input } from '@sp/ui';
import { apiPost } from '../lib/api-client';
import { FormError, useErrorText } from './form-bits';

export function ResetRequestForm() {
  const t = useTranslations('auth');
  const errorText = useErrorText();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiPost('/auth/password/reset-request', {
        email: new FormData(e.currentTarget).get('email'),
      });
      setDone(true);
    } catch (err) {
      setError(errorText(err, t('genericError')));
      setBusy(false);
    }
  }

  return (
    <form method="post" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <h1 className="text-h1">{t('resetRequestTitle')}</h1>
      <p className="text-ink-muted">{t('resetRequestHelp')}</p>
      {done ? (
        <p role="status">{t('resetRequestDone')}</p>
      ) : (
        <>
          <Input label={t('email')} name="email" type="email" autoComplete="username" required />
          <FormError message={error} />
          <Button type="submit" disabled={busy}>
            {t('resetRequestSubmit')}
          </Button>
        </>
      )}
      <Link href="/login" className="text-center text-body-sm text-brand-text underline">
        {t('back')}
      </Link>
    </form>
  );
}
