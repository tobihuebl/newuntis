'use client';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button, Input } from '@sp/ui';
import { apiPost } from '../lib/api-client';
import { FormError, useErrorText } from './form-bits';

/** Gemeinsames Formular für Einladung ("invite") und Passwort-Reset ("reset"): Token aus dem Link plus neues Passwort. */
export function TokenPasswordForm({ token, kind }: { token: string; kind: 'invite' | 'reset' }) {
  const t = useTranslations('auth');
  const errorText = useErrorText();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const texts =
    kind === 'invite'
      ? {
          title: t('inviteTitle'),
          submit: t('inviteSubmit'),
          invalid: t('inviteInvalid'),
          done: t('inviteDone'),
          path: '/auth/invite/accept',
        }
      : {
          title: t('resetTitle'),
          submit: t('resetSubmit'),
          invalid: t('resetInvalid'),
          done: t('resetDone'),
          path: '/auth/password/reset',
        };

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const password = String(new FormData(e.currentTarget).get('password') ?? '');
    if (password.length < 12) return setError(t('passwordTooShort'));
    setBusy(true);
    setError(null);
    try {
      await apiPost(texts.path, { token, password });
      setDone(true);
    } catch (err) {
      setError(errorText(err, texts.invalid));
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col gap-4">
        <p role="status">{texts.done}</p>
        <Link href="/login" className="text-brand-text underline">
          {t('back')}
        </Link>
      </div>
    );
  }
  return (
    <form method="post" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <h1 className="text-h1">{texts.title}</h1>
      <Input
        label={t('newPassword')}
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={12}
      />
      <FormError message={error} />
      <Button type="submit" disabled={busy}>
        {texts.submit}
      </Button>
    </form>
  );
}
