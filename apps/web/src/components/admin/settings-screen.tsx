'use client';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { TenantSettings, TenantSettingsPatch } from '@sp/shared';
import { Button, Card, Input, Skeleton } from '@sp/ui';
import { apiRequest } from '../../lib/api-client';
import { useApi, useProblemText } from '../../lib/use-api';
import { useSession } from '../providers';

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
  const t = useTranslations('settings');
  const tc = useTranslations('common');
  const problem = useProblemText();
  const { csrfToken } = useSession();
  const qc = useQueryClient();
  const q = useApi<TenantSettings>(['admin', 'settings'], '/admin/settings');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [status, setStatus] = useState<Record<string, { ok: boolean; text: string }>>({});
  useEffect(() => {
    if (q.data) setDraft(toDraft(q.data));
  }, [q.data]);

  async function save(sec: (typeof SECTIONS)[number]) {
    if (!draft) return;
    setStatus((s) => ({ ...s, [sec.key]: { ok: true, text: '' } }));
    try {
      const next = await apiRequest<TenantSettings>(
        'PATCH',
        '/admin/settings',
        { [sec.key]: fromDraft(sec, draft[sec.key] ?? {}) },
        csrfToken,
      );
      qc.setQueryData(['admin', 'settings'], next);
      setStatus((s) => ({ ...s, [sec.key]: { ok: true, text: tc('saved') } }));
    } catch (err) {
      setStatus((s) => ({ ...s, [sec.key]: { ok: false, text: problem(err) ?? tc('error') } }));
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4">
      <div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-muted">{readOnly ? t('readOnly') : t('intro')}</p>
      </div>
      {!draft ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        SECTIONS.map((sec) => (
          <section
            key={sec.key}
            id={sec.id}
            aria-labelledby={`${sec.id}-h`}
            className="flex scroll-mt-4 flex-col gap-2"
          >
            <h2 id={`${sec.id}-h`} className="text-lg font-semibold">
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
                <div className="grid gap-4 sm:grid-cols-2">
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
                {readOnly ? null : (
                  <div className="flex flex-wrap items-center gap-3">
                    <Button type="submit" variant="secondary">
                      {tc('save')}
                    </Button>
                    <p
                      role={status[sec.key]?.ok === false ? 'alert' : 'status'}
                      className={
                        status[sec.key]?.ok === false
                          ? 'text-sm text-danger'
                          : 'text-sm text-success'
                      }
                    >
                      {status[sec.key]?.text ?? ''}
                    </p>
                  </div>
                )}
              </form>
            </Card>
          </section>
        ))
      )}
    </div>
  );
}
