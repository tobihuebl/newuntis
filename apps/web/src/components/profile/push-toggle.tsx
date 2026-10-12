'use client';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@sp/ui';
import { apiRequest } from '../../lib/api-client';
import { useSession } from '../providers';

type State = 'loading' | 'unsupported' | 'denied' | 'on' | 'off';

const urlBase64ToUint8Array = (base64: string) => {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** Web-Push für dieses Gerät ein- und ausschalten (Spec Abschnitt 12, iOS nur in der installierten App). */
export function PushToggle({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const t = useTranslations('profile');
  const { csrfToken } = useSession();
  const [state, setState] = useState<State>('loading');
  const [busy, setBusy] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    setIos(isIos() && !isStandalone());
    if (
      !('serviceWorker' in navigator) ||
      !('PushManager' in window) ||
      !('Notification' in window)
    ) {
      setState('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setState('denied');
      return;
    }
    void navigator.serviceWorker.getRegistration().then(async (reg) => {
      if (!reg) return setState('unsupported');
      setState((await reg.pushManager.getSubscription()) ? 'on' : 'off');
    });
  }, []);

  if (!vapidPublicKey) return <p className="text-body-sm text-ink-muted">{t('pushUnavailable')}</p>;

  async function enable() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'off');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey!),
      });
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      await apiRequest(
        'POST',
        '/push/subscribe',
        { endpoint: json.endpoint, keys: json.keys },
        csrfToken,
      );
      setState('on');
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await apiRequest('DELETE', '/push/subscribe', { endpoint: sub.endpoint }, csrfToken).catch(
          () => undefined,
        );
        await sub.unsubscribe();
      }
      setState('off');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2" aria-live="polite">
      {state === 'unsupported' ? (
        <p className="text-body-sm text-ink-muted">{t('pushUnsupported')}</p>
      ) : null}
      {state === 'denied' ? <p className="text-body-sm text-signal-ink">{t('pushDenied')}</p> : null}
      {state === 'on' || state === 'off' ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-body-sm">{state === 'on' ? t('pushOn') : t('pushOff')}</p>
          <Button
            variant={state === 'on' ? 'secondary' : 'primary'}
            disabled={busy}
            onClick={() => void (state === 'on' ? disable() : enable())}
          >
            {state === 'on' ? t('pushDisable') : t('pushEnable')}
          </Button>
        </div>
      ) : null}
      {ios ? (
        <div className="rounded-sm border border-brand p-3 text-body-sm">
          <p className="font-medium">{t('iosHint')}</p>
          <p>{t('iosStep1')}</p>
          <p>{t('iosStep2')}</p>
        </div>
      ) : null}
    </div>
  );
}
