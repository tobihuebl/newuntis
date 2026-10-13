'use client';
import { useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { TenantSettings, TenantSettingsPatch } from '@sp/shared';
import { Button, Card, Input, Skeleton, useToast } from '@sp/ui';
import { apiRequest } from '../../lib/api-client';
import { useApi, useProblemText } from '../../lib/use-api';
import { useSession } from '../providers';
import { useT } from '../../lib/i18n';
import { PageTitle } from '../page-title';
import { FormError } from '../form-bits';
import { LoadError } from '../load-error';

type SectionKey = keyof TenantSettingsPatch;
type FieldKind = 'int' | 'intList' | 'url';
interface Field {
  key: string;
  kind: FieldKind;
  min?: number;
  max?: number;
}

/** Einstellbare Abschnitte (Schema: tenantSettingsSchema in @sp/shared). */
const SECTIONS: { key: SectionKey; id: string; fields: Field[] }[] = [
  {
    key: 'absence',
    id: 'abwesenheit',
    fields: [
      { key: 'excuseDeadlineDays', kind: 'int', min: 0 },
      { key: 'attachmentRequiredFromDays', kind: 'int', min: 1 },
      { key: 'reminderAfterDays', kind: 'intList', min: 0 },
    ],
  },
  {
    key: 'exams',
    id: 'pruefungen',
    fields: [
      { key: 'maxPerDayPerClass', kind: 'int', min: 1 },
      { key: 'maxPerWeekPerClass', kind: 'int', min: 1 },
    ],
  },
  {
    key: 'communication',
    id: 'kommunikation',
    fields: [{ key: 'announcementReminderAfterDays', kind: 'int', min: 0, max: 30 }],
  },
  {
    key: 'ageLimits',
    id: 'altersgrenzen',
    fields: [
      { key: 'studentLoginFrom', kind: 'int', min: 0 },
      { key: 'selfExcuseFrom', kind: 'int', min: 0 },
      { key: 'seeGradesFrom', kind: 'int', min: 0 },
    ],
  },
  {
    key: 'security',
    id: 'sicherheit',
    fields: [
      { key: 'sessionIdleMinutes', kind: 'int', min: 5 },
      { key: 'maxFailedLogins', kind: 'int', min: 3 },
      { key: 'lockoutMinutes', kind: 'int', min: 1 },
    ],
  },
  {
    key: 'offline',
    id: 'offline',
    fields: [{ key: 'clearAfterIdleDays', kind: 'int', min: 1, max: 60 }],
  },
  {
    key: 'retention',
    id: 'aufbewahrung',
    fields: [
      { key: 'messagesDays', kind: 'int', min: 1 },
      { key: 'absencesDays', kind: 'int', min: 1 },
      { key: 'attachmentsDays', kind: 'int', min: 1 },
      { key: 'notificationsDays', kind: 'int', min: 7 },
      { key: 'auditLogDays', kind: 'int', min: 90 },
    ],
  },
  { key: 'privacy', id: 'datenschutz', fields: [{ key: 'noticeUrl', kind: 'url' }] },
];

type Draft = Record<string, Record<string, string>>;

function toDraft(s: TenantSettings): Draft {
  const out: Draft = {};
  for (const sec of SECTIONS) {
    const values = (s[sec.key] ?? {}) as Record<string, unknown>;
    out[sec.key] = Object.fromEntries(
      sec.fields.map((f) => {
        const v = values[f.key];
        return [
          f.key,
          Array.isArray(v) ? v.join(', ') : v === undefined || v === null ? '' : String(v),
        ];
      }),
    );
  }
  return out;
}

function fromDraft(
  sec: (typeof SECTIONS)[number],
  d: Record<string, string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of sec.fields) {
    const raw = (d[f.key] ?? '').trim();
    if (f.kind === 'url') {
      if (raw) out[f.key] = raw;
    } else if (f.kind === 'intList')
      out[f.key] = raw
        .split(/[,;\s]+/)
        .filter(Boolean)
        .map(Number);
    else out[f.key] = Number(raw);
  }
  return out;
}

/** Schuleinstellungen: Fristen, Grenzwerte, Aufbewahrung (Administration ändert, Direktion liest). */
export function SettingsScreen({ readOnly }: { readOnly: boolean }) {
  const t = useT('settings');
  const tc = useT('common');
  const problem = useProblemText();
  const { csrfToken } = useSession();
  const qc = useQueryClient();
  const q = useApi<TenantSettings>(['admin', 'settings'], '/admin/settings');
  const [draft, setDraft] = useState<Draft | null>(null);
  const toast = useToast();
  const [failed, setFailed] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    if (q.data) setDraft(toDraft(q.data));
  }, [q.data]);

  async function save(sec: (typeof SECTIONS)[number]) {
    if (!draft) return;
    setFailed((s) => ({ ...s, [sec.key]: null }));
    setBusy(sec.key);
    try {
      const next = await apiRequest<TenantSettings>(
        'PATCH',
        '/admin/settings',
        { [sec.key]: fromDraft(sec, draft[sec.key] ?? {}) },
        csrfToken,
      );
      qc.setQueryData(['admin', 'settings'], next);
      toast({ text: `${t(`section_${sec.key}`)}: ${tc('saved')}`, icon: Check });
    } catch (err) {
      setFailed((s) => ({ ...s, [sec.key]: problem(err) ?? tc('error') }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-4 pb-8 lg:px-6 lg:pt-6">
      <div className="flex flex-col gap-2">
        <PageTitle area="administration">{t('title')}</PageTitle>
        <p className="text-body-sm text-ink-muted">{readOnly ? t('readOnly') : t('intro')}</p>
      </div>
      {q.isError ? (
        <LoadError error={q.error} onRetry={() => void q.refetch()} />
      ) : !draft ? (
        <Skeleton className="h-96 w-full rounded-lg" />
      ) : (
        SECTIONS.map((sec) => (
          <section
            key={sec.key}
            id={sec.id}
            aria-labelledby={`${sec.id}-h`}
            className="flex scroll-mt-20 flex-col gap-3"
          >
            <h2 id={`${sec.id}-h`} className="text-h3">
              {t(`section_${sec.key}`)}
            </h2>
            <Card>
              <form
                className="flex flex-col gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void save(sec);
                }}
                noValidate
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {sec.fields.map((f) => (
                    <Input
                      key={f.key}
                      label={t(`field_${f.key}`)}
                      hint={t.has(`hint_${f.key}`) ? t(`hint_${f.key}`) : undefined}
                      type={f.kind === 'int' ? 'number' : f.kind === 'url' ? 'url' : 'text'}
                      inputMode={f.kind === 'url' ? 'url' : 'numeric'}
                      min={f.min}
                      max={f.max}
                      value={draft[sec.key]?.[f.key] ?? ''}
                      readOnly={readOnly}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          [sec.key]: { ...draft[sec.key], [f.key]: e.target.value },
                        })
                      }
                    />
                  ))}
                </div>
                {failed[sec.key] ? <FormError message={failed[sec.key] ?? null} /> : null}
                {readOnly ? null : (
                  <Button
                    type="submit"
                    variant="secondary"
                    loading={busy === sec.key}
                    className="self-start"
                  >
                    {tc('save')}
                  </Button>
                )}
              </form>
            </Card>
          </section>
        ))
      )}
    </div>
  );
}
