'use client';
import { Pencil } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { TeacherProfile } from '@sp/shared';
import { Button, Card, ChoiceChips, Chip, Input, Sheet } from '@sp/ui';
import { ApiError, apiRequest } from '../../lib/api-client';
import { useT } from '../../lib/i18n';
import { FormError } from '../form-bits';

export interface SubjectOption {
  id: string;
  code: string;
  name: string;
}

/** "10,5" oder "10.5" → 10.5; leer → null; ungültig → NaN. */
function parseHours(s: string): number | null {
  const v = s.trim().replace(',', '.');
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && Number.isInteger(n * 2) ? n : NaN;
}

/**
 * Lehrkräfte: Fächer (Lehrbefähigung) und Stundenausmaß. Beschäftigungsausmaß laut Vertrag, davon Unterricht als
 * Soll für die Lehrfächerverteilung; dazu das Ist im veröffentlichten Stundenplan.
 */
export function TeachingCard({
  personId,
  teaching,
  subjects,
  csrfToken,
  readOnly,
}: {
  personId: string;
  teaching: TeacherProfile;
  subjects: SubjectOption[];
  csrfToken: string;
  readOnly: boolean;
}) {
  const t = useT('admin.person');
  const c = useT('common');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hours = (n: number | null) => (n === null ? t('notSet') : t('hoursValue', { hours: n }));
  const diff =
    teaching.teachingHours === null ? null : teaching.plannedHours - teaching.teachingHours;

  function edit() {
    setChosen(teaching.subjects.map((s) => s.id));
    setError(null);
    setOpen(true);
  }

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const employmentHours = parseHours(String(f.get('employmentHours') ?? ''));
    const teachingHours = parseHours(String(f.get('teachingHours') ?? ''));
    if (Number.isNaN(employmentHours) || Number.isNaN(teachingHours))
      return setError(t('hoursInvalid'));
    if (employmentHours !== null && teachingHours !== null && teachingHours > employmentHours)
      return setError(t('hoursTooMany'));
    setBusy(true);
    setError(null);
    try {
      await apiRequest(
        'PUT',
        `/admin/persons/${personId}/teaching`,
        { subjectIds: chosen, employmentHours, teachingHours },
        csrfToken,
      );
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.problem.title : c('error'));
    }
    setBusy(false);
  }

  return (
    <Card className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-h3">{t('teaching')}</h2>
        {readOnly ? null : (
          <Button
            variant="secondary"
            size="sm"
            iconLeft={Pencil}
            onClick={edit}
            aria-label={t('teachingEdit')}
          >
            {c('edit')}
          </Button>
        )}
      </div>
      <p className="text-body-sm text-ink-muted">{t('teachingHelp')}</p>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2 text-body-sm">
        <span className="text-ink-muted">{t('subjects')}</span>
        {teaching.subjects.length ? (
          <span className="flex flex-wrap justify-end gap-1.5">
            {teaching.subjects.map((s) => (
              <Chip key={s.id} tone="absent">
                <abbr title={s.name} className="no-underline">
                  {s.code}
                </abbr>
              </Chip>
            ))}
          </span>
        ) : (
          <span className="text-label">{t('notSet')}</span>
        )}
      </div>
      <Row label={t('employmentHours')} value={hours(teaching.employmentHours)} />
      <Row label={t('teachingHours')} value={hours(teaching.teachingHours)} />
      <div className="flex flex-wrap items-center justify-between gap-2 py-2 text-body-sm">
        <span className="text-ink-muted">{t('plannedHours')}</span>
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-label">{t('hoursValue', { hours: teaching.plannedHours })}</span>
          {diff === null ? null : diff === 0 ? (
            <Chip tone="ok">{t('onTarget')}</Chip>
          ) : (
            <Chip tone="late">
              {diff > 0 ? t('overTarget', { hours: diff }) : t('underTarget', { hours: -diff })}
            </Chip>
          )}
        </span>
      </div>

      <Sheet
        open={open}
        onOpenChange={(o) => !o && setOpen(false)}
        title={t('teaching')}
        description={t('teachingHelp')}
        closeLabel={c('close')}
      >
        <form onSubmit={save} className="flex flex-col gap-4" noValidate>
          <ChoiceChips
            label={t('subjects')}
            options={subjects.map((s) => ({ value: s.id, label: s.name }))}
            value={chosen}
            onChange={setChosen}
          />
          <Input
            label={t('employmentHours')}
            hint={t('employmentHint')}
            name="employmentHours"
            inputMode="decimal"
            mono
            defaultValue={teaching.employmentHours?.toString().replace('.', ',') ?? ''}
          />
          <Input
            label={t('teachingHours')}
            hint={t('teachingHint')}
            name="teachingHours"
            inputMode="decimal"
            mono
            defaultValue={teaching.teachingHours?.toString().replace('.', ',') ?? ''}
          />
          {error ? <FormError message={error} /> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {c('cancel')}
            </Button>
            <Button type="submit" loading={busy}>
              {c('save')}
            </Button>
          </div>
        </form>
      </Sheet>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-2 border-b border-line py-2 text-body-sm">
      <span className="text-ink-muted">{label}</span>
      <span className="text-label">{value}</span>
    </div>
  );
}
