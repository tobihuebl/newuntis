'use client';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button, Input } from '@sp/ui';
import { ApiError, apiPost } from '../lib/api-client';
import { FormError } from './form-bits';

export function GuardianCodeForm() {
  const t = useTranslations('guardianCode');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const password = String(f.get('password') ?? '');
    if (password.length < 12) return setError(t('password'));
    setBusy(true);
    setError(null);
    try {
      await apiPost('/auth/guardian-code/redeem', {
        code: f.get('code'),
        firstName: f.get('firstName'),
        lastName: f.get('lastName'),
        email: f.get('email'),
        password,
      });
      setDone(true);
    } catch (err) {
      setError(
        err instanceof ApiError && err.problem.title.includes('schon ein Konto')
          ? t('exists')
          : t('invalid'),
      );
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col gap-4">
        <p role="status">{t('done')}</p>
        <Link href="/login" className="text-primary underline">
          Anmelden
        </Link>
      </div>
    );
  }
  return (
    <form method="post" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <p className="text-muted">{t('help')}</p>
      <Input label={t('code')} name="code" autoComplete="off" required placeholder="XXXX-XXXX-XX" />
      <Input label={t('firstName')} name="firstName" autoComplete="given-name" required />
      <Input label={t('lastName')} name="lastName" autoComplete="family-name" required />
      <Input label={t('email')} name="email" type="email" autoComplete="username" required />
      <Input
        label={t('password')}
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={12}
      />
      <FormError message={error} />
      <Button type="submit" disabled={busy}>
        {t('submit')}
      </Button>
    </form>
  );
}
