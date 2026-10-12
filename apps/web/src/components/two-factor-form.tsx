'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, CodeInput, Input } from '@sp/ui';
import { apiPost } from '../lib/api-client';
import { useT } from '../lib/i18n';
import { FormError, useErrorText } from './form-bits';

/**
 * Zwei-Faktor-Bestätigung (Design System, Anmeldung): sechs Ziffernfelder, Absenden nach der sechsten Ziffer;
 * alternativ ein Wiederherstellungscode.
 */
export function TwoFactorForm({ csrfToken }: { csrfToken: string }) {
  const t = useT('auth');
  const errorText = useErrorText();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recovery, setRecovery] = useState(false);

  async function submit(code: string) {
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
    <form
      method="post"
      onSubmit={(e) => {
        e.preventDefault();
        const code = String(new FormData(e.currentTarget).get('code') ?? '').trim();
        if (!recovery && !/^\d{6}$/.test(code)) setError(t('codeIncomplete'));
        else void submit(code);
      }}
      className="flex flex-col gap-4"
      noValidate
    >
      <h1 className="text-h1">{t('twoFactorTitle')}</h1>
      <p className="text-body-sm text-ink-muted">{t('twoFactorHelp')}</p>
      {recovery ? (
        <Input label={t('recoveryCode')} name="code" mono autoComplete="off" autoFocus required />
      ) : (
        <CodeInput label={t('code')} autoFocus disabled={busy} onComplete={(c) => void submit(c)} />
      )}
      <FormError message={error} />
      <Button type="submit" block loading={busy}>
        {t('verify')}
      </Button>
      <Button
        variant="ghost"
        onClick={() => {
          setRecovery((r) => !r);
          setError(null);
        }}
      >
        {recovery ? t('useCode') : t('useRecovery')}
      </Button>
    </form>
  );
}
