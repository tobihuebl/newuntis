'use client';
import Link from 'next/link';
import { useState } from 'react';
import { MailCheck } from 'lucide-react';
import { Banner, Button, Input } from '@sp/ui';
import { apiPost } from '../lib/api-client';
import { FormError, authLinkClass, useErrorText } from './form-bits';
import { useT } from '../lib/i18n';

export function ResetRequestForm() {
  const t = useT('auth');
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
      <p className="text-body text-ink-muted">{t('resetRequestHelp')}</p>
      {done ? (
        <Banner tone="brand" icon={MailCheck} role="status">
          {t('resetRequestDone')}
        </Banner>
      ) : (
        <>
          <Input label={t('email')} name="email" type="email" autoComplete="username" required />
          <FormError message={error} />
          <Button type="submit" block loading={busy}>
            {t('resetRequestSubmit')}
          </Button>
        </>
      )}
      <Link href="/login" className={authLinkClass}>
        {t('back')}
      </Link>
    </form>
  );
}
