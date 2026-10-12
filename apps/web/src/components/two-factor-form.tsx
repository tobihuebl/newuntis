'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Input } from '@sp/ui';
import { apiPost } from '../lib/api-client';
import { FormError, useErrorText } from './form-bits';
import { useT } from '../lib/i18n';

export function TwoFactorForm({ csrfToken }: { csrfToken: string }) {
  const t = useT('auth');
  const errorText = useErrorText();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get('code') ?? '').trim();
    setBusy(true);
    setError(null);
    try {
      await apiPost('/auth/2fa/verify', { code }, csrfToken);
      router.replace('/');
      router.refresh();
    } catch (err) {
      setError(errorText(err, t('codeInvalid')));
      setBusy(false);
    }
  }

  return (
    <form method="post" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <h1 className="text-h1">{t('twoFactorTitle')}</h1>
      <p className="text-ink-muted">{t('twoFactorHelp')}</p>
      <Input label={t('code')} name="code" inputMode="text" autoComplete="one-time-code" required />
      <FormError message={error} />
      <Button type="submit" disabled={busy}>
        {t('verify')}
      </Button>
    </form>
  );
}
