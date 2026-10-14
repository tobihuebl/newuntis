'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { AccessCodeInfo } from '@sp/shared';
import { Button, Card, Input } from '@sp/ui';
import { ApiError, apiPost } from '../lib/api-client';
import { AuthDone, FormError, authLinkClass } from './form-bits';
import { useT } from '../lib/i18n';

/**
 * Beitritt mit Zugangscode (Schüler:innen, ADR 0020): Code eingeben (oder per QR-Code aus dem Brief, der Code
 * steht dann im Fragment #code=… und geht nie in Server-Logs), Vorname und Klasse zur Bestätigung sehen,
 * Passwort festlegen. Danach Anmeldung mit dem Benutzernamen.
 */
export function AccessCodeForm() {
  const t = useT('access');
  const [code, setCode] = useState('');
  const [info, setInfo] = useState<AccessCodeInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pwError, setPwError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    const m = /code=([A-Za-z0-9-]+)/.exec(window.location.hash);
    if (m) {
      setCode(m[1]!);
      history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  const failed = (err: unknown) =>
    err instanceof ApiError && err.problem.status === 429 ? t('tooMany') : t('invalid');

  async function check(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      setInfo(await apiPost<AccessCodeInfo>('/auth/access-code/check', { code }));
    } catch (err) {
      setError(failed(err));
    } finally {
      setBusy(false);
    }
  }

  async function redeem(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const password = String(f.get('password') ?? '');
    const repeat = String(f.get('repeat') ?? '');
    setError(null);
    if (password.length < 12) return setPwError(t('passwordTooShort'));
    if (password !== repeat) return setPwError(t('passwordMismatch'));
    setPwError(null);
    setBusy(true);
    try {
      const r = await apiPost<{ username: string }>('/auth/access-code/redeem', { code, password });
      setDone(r.username);
    } catch (err) {
      setError(failed(err));
      setBusy(false);
    }
  }

  if (done) return <AuthDone text={t('done', { username: done })} action={t('toLogin')} />;

  if (info) {
    return (
      <form
        method="post"
        onSubmit={(e) => void redeem(e)}
        className="flex flex-col gap-4"
        noValidate
      >
        <h1 className="text-h1">{t('hello', { name: info.firstName })}</h1>
        <p className="text-body text-ink-muted">
          {info.className ? t('inClass', { name: info.className }) : null}{' '}
          {info.reset ? t('resetHelp') : t('passwordHelp')}
        </p>
        <Card flat className="flex flex-col gap-1">
          <span className="text-label text-ink-muted">{t('username')}</span>
          <span className="text-mono text-h3">{info.username}</span>
          <span className="text-caption text-ink-muted">{t('usernameHelp')}</span>
        </Card>
        {/* Benutzername für Passwort-Manager, unsichtbar */}
        <input type="hidden" name="username" autoComplete="username" value={info.username} />
        <Input
          label={t('password')}
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          hint={t('passwordHint')}
          error={pwError ?? undefined}
        />
        <Input
          label={t('repeat')}
          name="repeat"
          type="password"
          autoComplete="new-password"
          required
        />
        <FormError message={error} />
        <Button type="submit" block loading={busy}>
          {t('submit')}
        </Button>
        <button type="button" onClick={() => setInfo(null)} className={authLinkClass}>
          {t('notMe')}
        </button>
      </form>
    );
  }

  return (
    <form method="post" onSubmit={(e) => void check(e)} className="flex flex-col gap-4" noValidate>
      <h1 className="text-h1">{t('title')}</h1>
      <p className="text-body text-ink-muted">{t('help')}</p>
      <Input
        label={t('code')}
        name="code"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        required
        placeholder="XXXX-XXXX-XX"
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <FormError message={error} />
      <Button
        type="submit"
        block
        loading={busy}
        disabled={code.replace(/[^a-z0-9]/gi, '').length !== 10}
      >
        {t('check')}
      </Button>
      <Link href="/login" className={authLinkClass}>
        {t('toLogin')}
      </Link>
    </form>
  );
}
