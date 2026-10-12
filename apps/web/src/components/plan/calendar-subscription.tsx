'use client';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button, Card, Input } from '@sp/ui';
import { apiRequest } from '../../lib/api-client';

export function CalendarSubscription({
  csrfToken,
  active: initiallyActive,
}: {
  csrfToken: string;
  active: boolean;
}) {
  const t = useTranslations('plan');
  const c = useTranslations('common');
  const [url, setUrl] = useState<string | null>(null);
  const [active, setActive] = useState(initiallyActive);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setError(null);
    try {
      const res = await apiRequest<{ url: string }>(
        'POST',
        '/me/calendar-token',
        undefined,
        csrfToken,
      );
      setUrl(res.url);
      setActive(true);
      setCopied(false);
    } catch {
      setError(c('error'));
    }
  }
  async function stop() {
    await apiRequest('DELETE', '/me/calendar-token', undefined, csrfToken).catch(() => undefined);
    setUrl(null);
    setActive(false);
  }

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t('calendar')}</h2>
      <p className="text-sm text-muted">{t('calendarHelp')}</p>
      {url ? (
        <>
          <Input
            label={t('calendar')}
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={async () => {
                await navigator.clipboard.writeText(url);
                setCopied(true);
              }}
            >
              {copied ? t('calendarCopied') : t('calendarCopy')}
            </Button>
            <Button variant="secondary" asChild>
              <a href={url.replace(/^https?:/, 'webcal:')}>{t('calendarOpen')}</a>
            </Button>
          </div>
        </>
      ) : active ? (
        <p className="text-sm">{t('calendarActive')}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button variant={active ? 'secondary' : 'primary'} onClick={create}>
          {active ? t('calendarRenew') : t('calendarCreate')}
        </Button>
        {active ? (
          <Button variant="ghost" onClick={stop}>
            {t('calendarStop')}
          </Button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
