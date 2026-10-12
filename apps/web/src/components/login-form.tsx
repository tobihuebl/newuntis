'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Input } from '@sp/ui';
import { apiPost } from '../lib/api-client';
import { FormError, useErrorText } from './form-bits';
import { useT } from '../lib/i18n';

export function LoginForm() {
  const t = useT('auth');
  const errorText = useErrorText();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await apiPost('/auth/login', { email: data.get('email'), password: data.get('password') });
      router.replace('/'); // die Startseite leitet je nach Zustand (2FA, Rolle) weiter
      router.refresh();
    } catch (err) {
      setError(errorText(err, t('loginFailed')));
      setBusy(false);
    }
  }

  // POST: auch wenn vor dem Laden von JavaScript abgeschickt, landen Zugangsdaten nie in der URL
  return (
    <form method="post" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <h1 className="text-h1">{t('loginTitle')}</h1>
      <Input label={t('email')} name="email" type="email" autoComplete="username" required />
      <Input
        label={t('password')}
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />
      <FormError message={error} />
      <Button type="submit" block loading={busy}>
        {t('login')}
      </Button>
      <div className="flex flex-col items-center gap-1">
        <Link
          href="/passwort-vergessen"
          className="inline-flex min-h-(--tap-min) items-center text-label text-brand-text underline-offset-4 hover:underline"
        >
          {t('forgot')}
        </Link>
        <Link
          href="/eltern-code"
          className="inline-flex min-h-(--tap-min) items-center text-center text-label text-brand-text underline-offset-4 hover:underline"
        >
          {t('guardianCode')}
        </Link>
      </div>
    </form>
  );
}
