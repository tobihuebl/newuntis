'use client';
import { BellRing, BookOpenCheck, CheckCircle2, ShieldCheck, Smartphone } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PRIVACY_NOTICE_VERSION, type PreferencesResponse, type Role } from '@sp/shared';
import { Banner, Button, Card, Checkbox, Skeleton, cn } from '@sp/ui';
import { apiRequest } from '../../lib/api-client';
import { useApi, useProblemText } from '../../lib/use-api';
import { PushToggle } from '../profile/push-toggle';
import { useSession } from '../providers';
import { useT } from '../../lib/i18n';
import { FormError } from '../form-bits';

type Step = 'privacy' | 'notifications' | 'role';

/**
 * Einführung nach dem ersten Login (M6, Onboarding für Eltern und Lehrkräfte): Datenschutzhinweis bestätigen
 * (mit Version), Push einrichten (iOS in zwei Schritten, E-Mail als Rückfall), kurze Hinweise je Rolle.
 */
export function OnboardingFlow({
  firstName,
  school,
  roles,
  home,
  noticeUrl,
}: {
  firstName: string;
  school: string;
  roles: Role[];
  home: string;
  noticeUrl: string | null;
}) {
  const t = useT('onboarding');
  const problem = useProblemText();
  const { csrfToken } = useSession();
  const router = useRouter();
  const [step, setStep] = useState<Step>('privacy');
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prefs = useApi<PreferencesResponse>(
    ['preferences'],
    step === 'notifications' ? '/me/preferences' : null,
  );
  const kind: 'guardian' | 'teacher' | 'student' | 'office' = roles.some(
    (r) => r === 'TEACHER' || r === 'HOMEROOM',
  )
    ? 'teacher'
    : roles.includes('GUARDIAN')
      ? 'guardian'
      : roles.includes('STUDENT')
        ? 'student'
        : 'office';
  const steps: Step[] = ['privacy', 'notifications', 'role'];
  const index = steps.indexOf(step);

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      await apiRequest(
        'POST',
        '/me/onboarding',
        { privacyNoticeVersion: PRIVACY_NOTICE_VERSION },
        csrfToken,
      );
      router.replace(home);
      router.refresh();
    } catch (err) {
      setError(problem(err));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Fortschritt als Kachel-Leiste (Design System): erledigt und aktuell Kobalt, offen bg-sunken */}
      <div className="flex flex-col gap-2">
        <div aria-hidden="true" className="grid grid-cols-3 gap-2">
          {steps.map((s, i) => (
            <span
              key={s}
              className={cn('h-2 rounded-xs', i <= index ? 'bg-brand' : 'bg-bg-sunken')}
            />
          ))}
        </div>
        <p className="text-overline text-ink-muted" aria-live="polite">
          {t('step', { n: index + 1, total: steps.length })}
        </p>
      </div>

      {step === 'privacy' ? (
        <section aria-labelledby="ob-h" className="flex flex-col gap-4">
          <ShieldCheck aria-hidden="true" className="size-8 text-brand-text" />
          <h1 id="ob-h" className="text-h1">
            {t('welcome', { name: firstName })}
          </h1>
          <p className="text-body-lg">{t('intro', { school })}</p>
          <Card flat className="flex flex-col gap-2 text-body-sm">
            <h2 className="text-h3">{t('privacyTitle')}</h2>
            <p>{t('privacyWho', { school })}</p>
            <ul className="list-disc pl-5">
              <li>{t('privacyWhat')}</li>
              <li>{t('privacyWhere')}</li>
              <li>{t('privacyDevice')}</li>
              <li>{t('privacyRights')}</li>
            </ul>
            {noticeUrl ? (
              <a
                href={noticeUrl}
                target="_blank"
                rel="noreferrer"
                className="pf-focusable self-start text-label text-brand-text underline underline-offset-4"
              >
                {t('privacyFull')}
              </a>
            ) : null}
            <p className="text-caption text-ink-muted">
              {t('version', { version: PRIVACY_NOTICE_VERSION })}
            </p>
          </Card>
          <Checkbox
            label={t('accept')}
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
          />
          <Button
            onClick={() => setStep('notifications')}
            disabled={!accepted}
            className="self-start"
          >
            {t('next')}
          </Button>
        </section>
      ) : null}

      {step === 'notifications' ? (
        <section aria-labelledby="ob-h" className="flex flex-col gap-4">
          <BellRing aria-hidden="true" className="size-8 text-brand-text" />
          <h1 id="ob-h" className="text-h1">
            {t('notifyTitle')}
          </h1>
          <p className="text-body-lg">{t(`notify_${kind}`)}</p>
          {prefs.data ? (
            <PushToggle vapidPublicKey={prefs.data.vapidPublicKey} />
          ) : prefs.isError ? null : (
            <Skeleton className="h-12 w-full" />
          )}
          <Banner tone="brand" icon={Smartphone}>
            <div className="flex flex-col gap-1 text-body-sm">
              <p className="text-body-strong">{t('iosTitle')}</p>
              <ol className="list-decimal pl-5">
                <li>{t('ios1')}</li>
                <li>{t('ios2')}</li>
              </ol>
              <p className="text-ink-muted">{t('emailFallback')}</p>
            </div>
          </Banner>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setStep('role')}>{t('next')}</Button>
            <Button variant="ghost" onClick={() => setStep('privacy')}>
              {t('back')}
            </Button>
          </div>
        </section>
      ) : null}

      {step === 'role' ? (
        <section aria-labelledby="ob-h" className="flex flex-col gap-4">
          {kind === 'teacher' ? (
            <BookOpenCheck aria-hidden="true" className="size-8 text-brand-text" />
          ) : (
            <CheckCircle2 aria-hidden="true" className="size-8 text-brand-text" />
          )}
          <h1 id="ob-h" className="text-h1">
            {t(`roleTitle_${kind}`)}
          </h1>
          <ul className="flex flex-col gap-2">
            {[1, 2, 3].map((n) => (
              <li key={n} className="flex gap-2">
                <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-brand-text" />
                <span className="text-body">{t(`tip_${kind}_${n}`)}</span>
              </li>
            ))}
          </ul>
          {error ? <FormError message={error} /> : null}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void finish()} disabled={busy}>
              {t('done')}
            </Button>
            <Button variant="ghost" onClick={() => setStep('notifications')}>
              {t('back')}
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
