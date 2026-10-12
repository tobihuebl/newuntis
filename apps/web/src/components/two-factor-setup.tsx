'use client';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import QRCode from 'qrcode';
import { useState } from 'react';
import { Button, Input } from '@sp/ui';
import { apiPost } from '../lib/api-client';
import { FormError, useErrorText } from './form-bits';

type Step =
  | { name: 'start' }
  | { name: 'confirm'; secret: string; qr: string }
  | { name: 'codes'; codes: string[] };

export function TwoFactorSetup({ csrfToken }: { csrfToken: string }) {
  const t = useTranslations('auth');
  const errorText = useErrorText();
  const router = useRouter();
  const [step, setStep] = useState<Step>({ name: 'start' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiPost<{ secret: string; otpauthUri: string }>(
        '/auth/2fa/setup',
        undefined,
        csrfToken,
      );
      setStep({
        name: 'confirm',
        secret: res.secret,
        qr: await QRCode.toDataURL(res.otpauthUri, { margin: 1, width: 192 }),
      });
    } catch (err) {
      setError(errorText(err, t('genericError')));
    }
    setBusy(false);
  }

  async function confirm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get('code') ?? '').trim();
    setBusy(true);
    setError(null);
    try {
      const res = await apiPost<{ recoveryCodes: string[] }>(
        '/auth/2fa/enable',
        { code },
        csrfToken,
      );
      setStep({ name: 'codes', codes: res.recoveryCodes });
    } catch (err) {
      setError(errorText(err, t('codeInvalid')));
    }
    setBusy(false);
  }

  if (step.name === 'codes') {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-h1">{t('recoveryTitle')}</h1>
        <p className="text-ink-muted">{t('recoveryHelp')}</p>
        <ul className="grid grid-cols-2 gap-2 rounded-sm bg-bg-sunken p-3 font-mono text-body-sm">
          {step.codes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <Button
          onClick={() => {
            router.replace('/');
            router.refresh();
          }}
        >
          {t('recoveryDone')}
        </Button>
      </div>
    );
  }

  if (step.name === 'confirm') {
    return (
      <form method="post" onSubmit={confirm} className="flex flex-col gap-4" noValidate>
        <h1 className="text-h1">{t('setupTitle')}</h1>
        <p className="text-ink-muted">{t('setupHelp')}</p>
        <img
          src={step.qr}
          alt=""
          width={192}
          height={192}
          className="self-center rounded-sm bg-creme"
        />
        <p className="text-body-sm text-ink-muted">{t('setupManual')}</p>
        <code className="break-all rounded-sm bg-bg-sunken p-2 text-body-sm">{step.secret}</code>
        <Input
          label={t('code')}
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
        />
        <FormError message={error} />
        <Button type="submit" disabled={busy}>
          {t('enable')}
        </Button>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-h1">{t('setupTitle')}</h1>
      <p className="text-ink-muted">{t('setupHelp')}</p>
      <FormError message={error} />
      <Button onClick={start} disabled={busy}>
        {t('setupStart')}
      </Button>
    </div>
  );
}
