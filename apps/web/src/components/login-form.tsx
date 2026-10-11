'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button, Input } from '@sp/ui';
import { apiPost } from '../lib/api-client';
import { FormError, useErrorText } from './form-bits';

export function LoginForm() {
  const t = useTranslations('auth');
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

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <h1 className="text-2xl font-semibold">{t('loginTitle')}</h1>
      <Input label={t('email')} name="email" type="email" autoComplete="username" required />
      <Input
        label={t('password')}
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />
      <FormError message={error} />
      <Button type="submit" disabled={busy}>
        {t('login')}
      </Button>
      <Link href="/passwort-vergessen" className="text-center text-sm text-primary underline">
        {t('forgot')}
      </Link>
    </form>
  );
}
