'use client';
import { useQueryClient } from '@tanstack/react-query';
import { Download, LogOut } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  CHECKLIST_HIDDEN,
  avatarOf,
  type AvatarColor,
  type AvatarSymbol,
  type Channel,
  type NotificationType,
  type PreferencesResponse,
} from '@sp/shared';
import { Button, Card, Input, SegmentedControl, Skeleton, Switch, useToast } from '@sp/ui';
import { dateTimeOf } from '../../lib/dates';
import { useApi, useApiMutation, useProblemText } from '../../lib/use-api';
import { FormError } from '../form-bits';
import { LoadError } from '../load-error';
import { clearOfflineData } from '../../offline/db';
import { applyTheme, readTheme, type Theme } from '../../lib/theme';
import { PushToggle } from './push-toggle';
import { AvatarPicker } from '../onboarding/avatar';
import { LinkChildForm } from '../onboarding/steps';
import { ONBOARDING_KEY, useOnboarding, useStepUpdate } from '../onboarding/use-onboarding';
import { useT } from '../../lib/i18n';
import { PageTitle } from '../page-title';

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
  email: string | null;
  username: string | null;
  avatar: string | null;
  roleLabels: string[];
  twoFactor: boolean;
  isTeacher: boolean;
  isStudent: boolean;
  isGuardian: boolean;
}

export function ProfileScreen(p: ProfileProps) {
  const t = useT('profile');
  const [theme, setTheme] = useState<Theme>('system');
  useEffect(() => setTheme(readTheme()), []);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-4 pb-8 lg:px-6 lg:pt-6">
      <PageTitle area="konto">{t('title')}</PageTitle>

      <Section title={t('account')}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body-sm">
          <dt className="text-ink-muted">{t('name')}</dt>
          <dd>{p.name}</dd>
          {p.email ? (
            <>
              <dt className="text-ink-muted">{t('email')}</dt>
              <dd className="break-all">{p.email}</dd>
            </>
          ) : null}
          {p.username ? (
            <>
              <dt className="text-ink-muted">{t('username')}</dt>
              <dd className="text-mono">{p.username}</dd>
            </>
          ) : null}
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

      {p.isStudent ? <AvatarSection avatar={p.avatar} /> : null}

      {p.isGuardian ? <ChildrenSection /> : null}

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
          <span className="text-label">{t('language')}</span>
          <span>{t('languageValue')}</span>
          <span className="text-ink-muted">{t('languageMore')}</span>
        </div>
      </Section>

      <Devices twoFactor={p.twoFactor} />

      <HelpSection />

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
  const toast = useToast();
  const problem = useProblemText();
  const [quiet, setQuiet] = useState<{ from: string; to: string } | null>(null);
  useEffect(() => {
    if (q.data) setQuiet(q.data.quiet);
  }, [q.data]);
  const enabled = (type: NotificationType, channel: Channel) =>
    q.data?.channels.find((c) => c.type === type && c.channel === channel)?.enabled ?? false;
  const persist = async (body: object) => {
    await save.mutateAsync(body);
    toast({ text: t('saved') });
  };

  return (
    <Section title={t('notifications')}>
      {q.isError ? (
        <LoadError error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <>
          <div className="flex flex-col gap-1" data-tour="push">
            <h3 className="text-label">{t('push')}</h3>
            <PushToggle vapidPublicKey={q.data.vapidPublicKey} />
          </div>
          {/* Liste statt Tabelle (Design System, Responsive Muster): je Art eine Zeile mit Push und E-Mail */}
          <div className="flex flex-col">
            <p className="text-body-sm text-ink-muted">{t('inAppAlways')}</p>
            <div
              aria-hidden="true"
              className="mt-3 grid grid-cols-[1fr_4rem_4rem] gap-2 border-b border-line pb-2 text-caption text-ink-muted"
            >
              <span>{t('type')}</span>
              <span className="text-center">{t('channelPush')}</span>
              <span className="text-center">{t('channelEmail')}</span>
            </div>
            <ul aria-label={t('channels')}>
              {q.data.types.map((type) => {
                const label = t(`types.${type.replace('.', '_')}`);
                return (
                  <li
                    key={type}
                    className="grid min-h-13 grid-cols-[1fr_4rem_4rem] items-center gap-2 border-b border-line py-2 last:border-b-0"
                  >
                    <span className="text-body-sm">
                      {label}
                      {q.data.mandatory.some((m) => m.type === type) ? (
                        <span className="block text-caption text-ink-muted">{t('mandatory')}</span>
                      ) : null}
                    </span>
                    {(['push', 'email'] as const).map((channel) => (
                      <span key={channel} className="flex justify-center">
                        <Switch
                          checked={enabled(type, channel)}
                          disabled={q.data!.mandatory.some(
                            (m) => m.type === type && m.channel === channel,
                          )}
                          hideLabel
                          label={`${label}: ${channel === 'push' ? t('channelPush') : t('channelEmail')}`}
                          onCheckedChange={(v) =>
                            void persist({ channels: [{ type, channel, enabled: v }] })
                          }
                        />
                      </span>
                    ))}
                  </li>
                );
              })}
            </ul>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-label">{t('quiet')}</legend>
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
          {save.error ? <FormError message={problem(save.error)} /> : null}
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
        <Button variant="secondary" asChild iconLeft={Download}>
          <a href="/api/v1/me/export?format=pdf" download>
            {t('exportPdf')}
          </a>
        </Button>
        <Button variant="ghost" asChild iconLeft={Download}>
          <a href="/api/v1/me/export?format=json" download>
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
        {t('twoFactor')}:{' '}
        <strong className="text-body-strong">
          {twoFactor ? t('twoFactorOn') : t('twoFactorOff')}
        </strong>
      </p>
      <div className="flex flex-col gap-2">
        <h3 className="text-label">{t('devices')}</h3>
        {q.isError ? (
          <LoadError error={q.error} onRetry={() => void q.refetch()} />
        ) : !q.data ? (
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
                  <Button variant="ghost" size="sm" onClick={() => end.mutate(s.id)}>
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
          variant="secondary"
          iconLeft={LogOut}
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

/** Avatar der Schüler:innen: Symbol und Farbe, kein Foto. */
function AvatarSection({ avatar }: { avatar: string | null }) {
  const t = useT('profile');
  const toast = useToast();
  const router = useRouter();
  const problem = useProblemText();
  const [value, setValue] = useState<{ symbol: AvatarSymbol; color: AvatarColor }>(
    avatarOf(avatar) ?? { symbol: 'star', color: 'kobalt' },
  );
  const save = useApiMutation<typeof value>('PUT', () => '/me/avatar');
  return (
    <Section title={t('avatar')}>
      <AvatarPicker symbol={value.symbol} color={value.color} onChange={setValue} />
      {save.error ? <FormError message={problem(save.error) ?? ''} /> : null}
      <Button
        className="self-start"
        loading={save.isPending}
        onClick={() =>
          save.mutate(value, {
            onSuccess: () => {
              toast({ text: t('avatarSaved') });
              router.refresh();
            },
          })
        }
      >
        {t('save')}
      </Button>
    </Section>
  );
}

/** Eltern: verknüpfte Kinder und weiteres Kind mit Code aus dem Elternbrief (PL-04). */
function ChildrenSection() {
  const t = useT('profile');
  const q = useOnboarding();
  const qc = useQueryClient();
  const children = q.data?.context.guardian?.children ?? [];
  return (
    <section aria-labelledby="s-children" className="flex flex-col gap-3" data-tour="children">
      <h2 id="s-children" className="text-h3">
        {t('children')}
      </h2>
      <Card className="flex flex-col gap-4">
        {q.data ? (
          <ul className="flex flex-col gap-1 text-body">
            {children.map((c) => (
              <li key={c.id}>
                {c.firstName} {c.lastName}
                {c.className ? <span className="text-ink-muted"> · {c.className}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <Skeleton className="h-12 w-full" />
        )}
        <LinkChildForm
          onLinked={() => {
            void qc.invalidateQueries({ queryKey: ONBOARDING_KEY });
            void qc.invalidateQueries({ queryKey: ['children'] });
          }}
        />
      </Card>
    </section>
  );
}

/** Hilfe und Tour: Einführung wiederholen, ausgeblendete Checkliste zurückholen. */
function HelpSection() {
  const t = useT('profile');
  const q = useOnboarding();
  const update = useStepUpdate();
  return (
    <Section title={t('help')}>
      <p className="text-body-sm text-ink-muted">{t('helpText')}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" asChild>
          <Link href="/willkommen?wiederholen">{t('helpReplay')}</Link>
        </Button>
        {q.data?.checklistHidden ? (
          <Button
            variant="ghost"
            loading={update.isPending}
            onClick={() => update.mutate({ stepId: CHECKLIST_HIDDEN, status: 'OPEN' })}
          >
            {t('helpChecklist')}
          </Button>
        ) : null}
      </div>
    </Section>
  );
}
