'use client';
import { useQueryClient } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { Channel, NotificationType, PreferencesResponse } from '@sp/shared';
import { Button, Card, Input, SegmentedControl, Skeleton, Switch } from '@sp/ui';
import { dateTimeOf } from '../../lib/dates';
import { useApi, useApiMutation } from '../../lib/use-api';
import { clearOfflineData } from '../../offline/db';
import { applyTheme, readTheme, type Theme } from '../../lib/theme';
import { PushToggle } from './push-toggle';
import { useT } from '../../lib/i18n';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const id = `s-${title.replace(/\W+/g, '-')}`;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-h3">
        {title}
      </h2>
      <Card className="flex flex-col gap-4">{children}</Card>
    </section>
  );
}

export interface ProfileProps {
  name: string;
  email: string;
  roleLabels: string[];
  twoFactor: boolean;
  isTeacher: boolean;
}

export function ProfileScreen(p: ProfileProps) {
  const t = useT('profile');
  const [theme, setTheme] = useState<Theme>('system');
  useEffect(() => setTheme(readTheme()), []);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4">
      <h1 className="text-h1">{t('title')}</h1>

      <Section title={t('account')}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body-sm">
          <dt className="text-ink-muted">{t('name')}</dt>
          <dd>{p.name}</dd>
          <dt className="text-ink-muted">{t('email')}</dt>
          <dd className="break-all">{p.email}</dd>
          <dt className="text-ink-muted">{t('roles')}</dt>
          <dd>{p.roleLabels.join(', ')}</dd>
        </dl>
        {p.isTeacher ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" asChild>
              <Link href="/krankmeldung">{t('sick')}</Link>
            </Button>
            <span className="text-body-sm text-ink-muted">{t('sickHelp')}</span>
          </div>
        ) : null}
      </Section>

      <NotificationSettings />

      <Section title={t('appearance')}>
        <SegmentedControl
          label={t('theme')}
          value={theme}
          onChange={(v) => {
            setTheme(v);
            applyTheme(v);
          }}
          options={(['system', 'light', 'dark'] as const).map((v) => ({
            value: v,
            label: t(`themes.${v}`),
          }))}
        />
        <div className="flex flex-col gap-1 text-body-sm">
          <span className="font-medium">{t('language')}</span>
          <span>{t('languageValue')}</span>
          <span className="text-ink-muted">{t('languageMore')}</span>
        </div>
      </Section>

      <Devices twoFactor={p.twoFactor} />

      <MyData />
    </div>
  );
}

function NotificationSettings() {
  const t = useT('profile');
  const q = useApi<PreferencesResponse>(['preferences'], '/me/preferences');
  const save = useApiMutation<object, PreferencesResponse>('PATCH', () => '/me/preferences', [
    ['preferences'],
  ]);
  const [saved, setSaved] = useState(false);
  const [quiet, setQuiet] = useState<{ from: string; to: string } | null>(null);
  useEffect(() => {
    if (q.data) setQuiet(q.data.quiet);
  }, [q.data]);
  const enabled = (type: NotificationType, channel: Channel) =>
    q.data?.channels.find((c) => c.type === type && c.channel === channel)?.enabled ?? false;
  const persist = async (body: object) => {
    setSaved(false);
    await save.mutateAsync(body);
    setSaved(true);
  };

  return (
    <Section title={t('notifications')}>
      {!q.data ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <h3 className="font-medium">{t('push')}</h3>
            <PushToggle vapidPublicKey={q.data.vapidPublicKey} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-body-sm">
              <caption className="sr-only">{t('channels')}</caption>
              <thead>
                <tr className="text-left text-ink-muted">
                  <th scope="col" className="py-2 pr-2 font-medium">
                    {t('type')}
                  </th>
                  <th scope="col" className="px-2 py-2 font-medium">
                    {t('inApp')}
                  </th>
                  <th scope="col" className="px-2 py-2 font-medium">
                    {t('channelPush')}
                  </th>
                  <th scope="col" className="px-2 py-2 font-medium">
                    {t('channelEmail')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {q.data.types.map((type) => (
                  <tr key={type} className="border-t border-line">
                    <th scope="row" className="py-1 pr-2 text-left font-normal">
                      {t(`types.${type.replace('.', '_')}`)}
                      {q.data.mandatory.some((m) => m.type === type) ? (
                        <span className="block text-caption text-ink-muted">{t('mandatory')}</span>
                      ) : null}
                    </th>
                    <td className="px-2 text-ink-muted">{t('always')}</td>
                    {(['push', 'email'] as const).map((channel) => (
                      <td key={channel} className="px-2">
                        <Switch
                          checked={enabled(type, channel)}
                          disabled={q.data!.mandatory.some(
                            (m) => m.type === type && m.channel === channel,
                          )}
                          hideLabel
                          label={`${t(`types.${type.replace('.', '_')}`)}: ${channel === 'push' ? t('channelPush') : t('channelEmail')}`}
                          onCheckedChange={(v) =>
                            void persist({ channels: [{ type, channel, enabled: v }] })
                          }
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="font-medium">{t('quiet')}</legend>
            <p className="text-body-sm text-ink-muted">{t('quietHelp')}</p>
            <Switch
              checked={quiet !== null}
              label={t('quietOn')}
              onCheckedChange={(v) => {
                const next = v ? { from: '20:00', to: '07:00' } : null;
                setQuiet(next);
                void persist({ quiet: next });
              }}
            />
            {quiet ? (
              <div className="flex flex-wrap gap-3">
                <Input
                  label={t('quietFrom')}
                  type="time"
                  value={quiet.from}
                  onChange={(e) => setQuiet({ ...quiet, from: e.target.value })}
                  onBlur={() => void persist({ quiet })}
                  className="w-32"
                />
                <Input
                  label={t('quietTo')}
                  type="time"
                  value={quiet.to}
                  onChange={(e) => setQuiet({ ...quiet, to: e.target.value })}
                  onBlur={() => void persist({ quiet })}
                  className="w-32"
                />
              </div>
            ) : null}
          </fieldset>
          <p role="status" className="text-body-sm text-brand-text">
            {saved ? t('saved') : ''}
          </p>
        </>
      )}
    </Section>
  );
}

/** Datenauskunft zur Selbstbedienung (Spec Abschnitt 13: GET /me/export als JSON und PDF). */
function MyData() {
  const t = useT('profile');
  return (
    <Section title={t('myData')}>
      <p className="text-body-sm">{t('myDataText')}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" asChild>
          <a href="/api/v1/me/export?format=pdf" download>
            <Download aria-hidden="true" size={18} />
            {t('exportPdf')}
          </a>
        </Button>
        <Button variant="ghost" asChild>
          <a href="/api/v1/me/export?format=json" download>
            <Download aria-hidden="true" size={18} />
            {t('exportJson')}
          </a>
        </Button>
      </div>
      <p className="text-body-sm text-ink-muted">{t('myDataHelp')}</p>
    </Section>
  );
}

interface SessionRow {
  id: string;
  userAgent: string | null;
  lastSeenAt: string;
  current: boolean;
}

/** Grobe, verständliche Gerätebezeichnung aus dem User-Agent. */
function deviceName(ua: string | null, fallback: string): string {
  if (!ua) return fallback;
  const os = /iPhone|iPad/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Mac OS X/.test(ua)
        ? 'macOS'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Linux/.test(ua)
            ? 'Linux'
            : '';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : '';
  return [browser, os].filter(Boolean).join(' · ') || fallback;
}

function Devices({ twoFactor }: { twoFactor: boolean }) {
  const t = useT('profile');
  const router = useRouter();
  const qc = useQueryClient();
  const q = useApi<{ data: SessionRow[] }>(['sessions'], '/me/sessions');
  const end = useApiMutation<string>('DELETE', (id) => `/me/sessions/${id}`, [['sessions']]);
  const all = useApiMutation<undefined>('POST', () => '/auth/logout-all');
  return (
    <Section title={t('security')}>
      <p className="text-body-sm">
        {t('twoFactor')}: <strong>{twoFactor ? t('twoFactorOn') : t('twoFactorOff')}</strong>
      </p>
      <div className="flex flex-col gap-2">
        <h3 className="font-medium">{t('devices')}</h3>
        {!q.data ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <ul className="flex flex-col">
            {q.data.data.map((s) => (
              <li
                key={s.id}
                className="flex min-h-12 items-center justify-between gap-3 border-b border-line py-1 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-label">
                    {deviceName(s.userAgent, t('unknownDevice'))}
                    {s.current ? ` (${t('thisDevice')})` : ''}
                  </p>
                  <p className="text-caption text-ink-muted">
                    {t('lastSeen', { time: dateTimeOf(s.lastSeenAt) })}
                  </p>
                </div>
                {s.current ? null : (
                  <Button variant="ghost" onClick={() => end.mutate(s.id)}>
                    {t('signOut')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <Button
          variant="danger"
          className="self-start"
          onClick={async () => {
            await all.mutateAsync(undefined);
            await clearOfflineData().catch(() => undefined);
            qc.clear();
            router.replace('/login');
            router.refresh();
          }}
        >
          {t('signOutAll')}
        </Button>
        <p className="text-body-sm text-ink-muted">{t('signOutAllHelp')}</p>
      </div>
    </Section>
  );
}
