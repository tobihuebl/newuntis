'use client';
import {
  BellRing,
  CalendarDays,
  CircleCheck,
  GraduationCap,
  ShieldCheck,
  Smartphone,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { useState } from 'react';
import {
  PRIVACY_NOTICE_VERSION,
  addDays,
  avatarOf,
  type AvatarColor,
  type AvatarSymbol,
  type NotificationType,
  type OnboardingContext,
  type PlanResponse,
  type PreferencesResponse,
} from '@sp/shared';
import { Banner, Button, Card, Checkbox, Chip, Input, Skeleton } from '@sp/ui';
import { apiRequest } from '../../lib/api-client';
import { todayVienna, weekOf, weekdayDate } from '../../lib/dates';
import { useT } from '../../lib/i18n';
import { useApi, useProblemText } from '../../lib/use-api';
import { FormError } from '../form-bits';
import { PushToggle } from '../profile/push-toggle';
import { useSession } from '../providers';
import { AvatarPicker } from './avatar';

/** Was jeder Schritt bekommt: weiter (erledigt), zurück, optional überspringen. */
export interface StepProps {
  next: () => Promise<void>;
  back: (() => void) | null;
  skip: (() => Promise<void>) | null;
  busy: boolean;
  context: OnboardingContext;
  /** Wiederholung über "Hilfe und Tour": nichts ist Pflicht, Bestätigungen sind schon gegeben. */
  replay: boolean;
}

function Header({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof ShieldCheck;
  title: string;
  text?: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Icon aria-hidden="true" className="size-8 text-brand-text" />
      <h1 id="ob-h" className="text-h1" tabIndex={-1}>
        {title}
      </h1>
      {text ? <p className="text-body-lg">{text}</p> : null}
    </div>
  );
}

/** Aktionsleiste: mobil unten fixiert (Karussell-Gefühl), am Computer unter dem Inhalt. */
export function StepActions({
  onNext,
  nextLabel,
  disabled,
  busy,
  back,
  skip,
  extra,
  error,
}: {
  extra?: { label: string; onClick: () => void } | null;
  onNext: () => void;
  nextLabel?: string;
  disabled?: boolean;
  busy: boolean;
  back: (() => void) | null;
  skip?: (() => void) | null;
  error?: string | null;
}) {
  const t = useT('onboarding');
  return (
    <div className="sticky bottom-0 -mx-4 mt-2 flex flex-col gap-3 border-t border-line bg-bg-raised px-4 pt-3 pb-[calc(var(--space-3)+env(safe-area-inset-bottom))] lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0">
      {error ? <FormError message={error} /> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={onNext} disabled={disabled || busy} loading={busy}>
          {nextLabel ?? t('next')}
        </Button>
        {back ? (
          <Button variant="ghost" onClick={back} disabled={busy}>
            {t('back')}
          </Button>
        ) : null}
        {extra ? (
          <Button variant="secondary" onClick={extra.onClick} disabled={busy}>
            {extra.label}
          </Button>
        ) : null}
        {skip ? (
          <Button variant="ghost" onClick={skip} disabled={busy} className="ml-auto">
            {t('skip')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

// ───────────────────────── Willkommen ─────────────────────────

export function PrivacyStep({
  firstName,
  school,
  noticeUrl,
  ...p
}: StepProps & { firstName: string; school: string; noticeUrl: string | null }) {
  const t = useT('onboarding');
  const problem = useProblemText();
  const { csrfToken } = useSession();
  const [accepted, setAccepted] = useState(p.replay);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function accept() {
    setError(null);
    setBusy(true);
    try {
      if (!p.replay) {
        await apiRequest(
          'POST',
          '/me/onboarding',
          { privacyNoticeVersion: PRIVACY_NOTICE_VERSION },
          csrfToken,
        );
      }
      await p.next();
    } catch (err) {
      setError(problem(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Header
        icon={ShieldCheck}
        title={t('welcome', { name: firstName })}
        text={t('intro', { school })}
      />
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
      {p.replay ? null : (
        <Checkbox
          label={t('accept')}
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
        />
      )}
      <StepActions
        onNext={() => void accept()}
        disabled={!accepted}
        busy={busy || p.busy}
        back={p.back}
        error={error}
      />
    </>
  );
}

/** Erklärung vor dem System-Dialog (Permission-Priming): erst lesen, dann selbst einschalten. */
export function PushStep({ kind, ...p }: StepProps & { kind: string }) {
  const t = useT('onboarding');
  const prefs = useApi<PreferencesResponse>(['preferences'], '/me/preferences');
  return (
    <>
      <Header icon={BellRing} title={t('notifyTitle')} text={t(`notify_${kind}`)} />
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
      <StepActions onNext={() => void p.next()} busy={p.busy} back={p.back} />
    </>
  );
}

/** Benachrichtigungen wählen (Eltern, Direktion): Gruppen statt einzelner Typen, Kanal Push. */
const NOTIFY_GROUPS: Record<string, NotificationType[]> = {
  absence: ['absence.reminder', 'absence.reviewed'],
  entries: ['grade.released', 'exam.created'],
  changes: ['substitution.published', 'timetable.published'],
  messages: ['message.new', 'announcement.published'],
};

export function NotifyStep(p: StepProps) {
  const t = useT('onboarding');
  const problem = useProblemText();
  const { csrfToken } = useSession();
  const prefs = useApi<PreferencesResponse>(['preferences'], '/me/preferences');
  const [choice, setChoice] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const d = prefs.data;
  const groups = Object.entries(NOTIFY_GROUPS)
    .map(([key, types]) => [key, types.filter((x) => d?.types.includes(x))] as const)
    .filter(([, types]) => types.length > 0);
  const enabled = (types: readonly NotificationType[]) =>
    types.every(
      (type) => d?.channels.find((c) => c.type === type && c.channel === 'push')?.enabled ?? true,
    );
  async function save() {
    setError(null);
    setBusy(true);
    try {
      const channels = groups.flatMap(([key, types]) =>
        key in choice
          ? types.map((type) => ({ type, channel: 'push' as const, enabled: choice[key]! }))
          : [],
      );
      if (channels.length) await apiRequest('PATCH', '/me/preferences', { channels }, csrfToken);
      await p.next();
    } catch (err) {
      setError(problem(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Header icon={BellRing} title={t('chooseTitle')} text={t('chooseText')} />
      {!d ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <fieldset className="flex flex-col gap-3">
          <legend className="sr-only">{t('chooseTitle')}</legend>
          {groups.map(([key, types]) => (
            <Checkbox
              key={key}
              label={t(`group_${key}`)}
              hint={t(`groupHelp_${key}`)}
              checked={choice[key] ?? enabled(types)}
              onChange={(e) => setChoice({ ...choice, [key]: e.target.checked })}
            />
          ))}
        </fieldset>
      )}
      <p className="text-body-sm text-ink-muted">{t('chooseLater')}</p>
      <StepActions
        onNext={() => void save()}
        busy={busy || p.busy}
        back={p.back}
        skip={p.skip ? () => void p.skip!() : null}
        error={error}
      />
    </>
  );
}

// ───────────────────────── Lehrkraft ─────────────────────────

export function TeacherDataStep(p: StepProps) {
  const t = useT('onboarding');
  const c = p.context.teacher;
  const hours = (n: number | null) => (n === null ? null : n.toLocaleString('de-AT'));
  return (
    <>
      <Header icon={UserRound} title={t('teacherDataTitle')} text={t('teacherDataText')} />
      {c ? (
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <dt className="text-label text-ink-muted">{t('subjects')}</dt>
            <dd className="flex flex-wrap gap-2">
              {c.subjects.length ? (
                c.subjects.map((s) => <Chip key={s}>{s}</Chip>)
              ) : (
                <span className="text-body-sm">{t('none')}</span>
              )}
            </dd>
          </div>
          <div className="flex flex-col gap-2">
            <dt className="text-label text-ink-muted">{t('hours')}</dt>
            <dd className="text-body">
              {c.employmentHours === null
                ? t('none')
                : t('hoursValue', {
                    employment: hours(c.employmentHours) ?? '',
                    teaching: hours(c.teachingHours ?? c.employmentHours) ?? '',
                  })}
            </dd>
          </div>
          <div className="flex flex-col gap-2">
            <dt className="text-label text-ink-muted">{t('classes')}</dt>
            <dd className="flex flex-wrap gap-2">
              {c.classes.length ? (
                c.classes.map((s) => <Chip key={s}>{s}</Chip>)
              ) : (
                <span className="text-body-sm">{t('noClasses')}</span>
              )}
            </dd>
          </div>
          {c.homeroomClass ? (
            <div className="flex flex-col gap-2">
              <dt className="text-label text-ink-muted">{t('homeroom')}</dt>
              <dd>
                <Chip tone="ok" icon={GraduationCap}>
                  {c.homeroomClass.name}
                </Chip>
              </dd>
            </div>
          ) : null}
        </dl>
      ) : (
        <Skeleton className="h-32 w-full" />
      )}
      <p className="text-body-sm text-ink-muted">{t('wrongData')}</p>
      <StepActions
        onNext={() => void p.next()}
        nextLabel={t('correct')}
        busy={p.busy}
        back={p.back}
      />
    </>
  );
}

/** Stundenplan prüfen: diese Woche (am Wochenende die nächste) als kompakte Liste je Tag. */
export function TeacherTimetableStep(p: StepProps) {
  const t = useT('onboarding');
  const today = todayVienna();
  const weekend = [0, 6].includes(new Date(`${today}T00:00:00Z`).getUTCDay());
  const week = weekOf(weekend ? addDays(today, 2) : today);
  const plan = useApi<PlanResponse>(
    ['onboarding', 'plan', week.from],
    `/me/timetable?from=${week.from}&to=${week.to}`,
  );
  const days = [0, 1, 2, 3, 4].map((i) => addDays(week.from, i));
  return (
    <>
      <Header icon={CalendarDays} title={t('timetableTitle')} text={t('timetableText')} />
      {plan.isError ? (
        <p className="text-body-sm text-ink-muted">{t('timetableError')}</p>
      ) : !plan.data ? (
        <Skeleton className="h-48 w-full" />
      ) : plan.data.entries.length === 0 ? (
        <Card flat>
          <p className="text-body-sm">{t('timetableEmpty')}</p>
        </Card>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-lg bg-bg-raised ring-1 ring-line">
          {days.map((d) => {
            const es = plan.data.entries
              .filter((e) => e.date === d && e.status !== 'CANCELLED')
              .sort((a, b) => a.periodStart - b.periodStart);
            return (
              <li key={d} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:gap-4">
                <span className="w-28 shrink-0 text-label">{weekdayDate(d)}</span>
                <span className="text-body-sm">
                  {es.length
                    ? es
                        .map(
                          (e) =>
                            `${e.periodStart}. ${e.subject.code} ${e.class?.name ?? e.group?.name ?? ''}`,
                        )
                        .join(' · ')
                    : t('free')}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-body-sm text-ink-muted">{t('wrongData')}</p>
      <StepActions
        onNext={() => void p.next()}
        nextLabel={t('correct')}
        busy={p.busy}
        back={p.back}
      />
    </>
  );
}

// ───────────────────────── Schüler:in ─────────────────────────

export function StudentProfileStep({
  firstName,
  lastName,
  ...p
}: StepProps & { firstName: string; lastName: string }) {
  const t = useT('onboarding');
  const problem = useProblemText();
  const { csrfToken } = useSession();
  const initial = avatarOf(p.context.student?.avatar);
  const [value, setValue] = useState<{ symbol: AvatarSymbol; color: AvatarColor }>(
    initial ?? { symbol: 'star', color: 'kobalt' },
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    setError(null);
    setBusy(true);
    try {
      await apiRequest('PUT', '/me/avatar', value, csrfToken);
      await p.next();
    } catch (err) {
      setError(problem(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Header icon={UserRound} title={t('studentProfileTitle')} />
      <Card flat className="flex flex-col gap-1">
        <span className="text-label text-ink-muted">{t('yourName')}</span>
        <span className="text-h3">
          {firstName} {lastName}
        </span>
      </Card>
      <AvatarPicker symbol={value.symbol} color={value.color} onChange={setValue} />
      <p className="text-body-sm text-ink-muted">{t('avatarHint')}</p>
      <StepActions onNext={() => void save()} busy={busy || p.busy} back={p.back} error={error} />
    </>
  );
}

export function StudentClassStep(p: StepProps) {
  const t = useT('onboarding');
  const c = p.context.student;
  const [wrong, setWrong] = useState(false);
  return (
    <>
      <Header icon={GraduationCap} title={t('studentClassTitle')} />
      {c?.className ? (
        <Card flat className="flex flex-col gap-1">
          <span className="text-h2">{t('yourClass', { name: c.className })}</span>
          {c.homeroomTeacher ? (
            <span className="text-body-sm text-ink-muted">
              {t('yourHomeroom', { name: c.homeroomTeacher })}
            </span>
          ) : null}
        </Card>
      ) : (
        <p className="text-body">{t('noClass')}</p>
      )}
      {wrong ? <Banner tone="signal">{t('classWrongHelp')}</Banner> : null}
      <StepActions
        onNext={() => void p.next()}
        nextLabel={wrong ? t('next') : t('classRight')}
        busy={p.busy}
        back={p.back}
        extra={
          wrong || !c?.className ? null : { label: t('classWrong'), onClick: () => setWrong(true) }
        }
      />
    </>
  );
}

// ───────────────────────── Eltern ─────────────────────────

/** Weiteres Kind mit dem Code aus dem Elternbrief verknüpfen (Onboarding und Profil). */
export function LinkChildForm({ onLinked }: { onLinked: () => void }) {
  const t = useT('onboarding');
  const problem = useProblemText();
  const { csrfToken } = useSession();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function link(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await apiRequest('POST', '/me/guardian-codes/redeem', { code }, csrfToken);
      setCode('');
      onLinked();
    } catch (err) {
      setError(problem(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <form onSubmit={(e) => void link(e)} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Input
          label={t('anotherChild')}
          hint={t('anotherChildHelp')}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoComplete="off"
          fieldClassName="flex-1"
        />
        <Button
          type="submit"
          variant="secondary"
          disabled={code.replace(/[^a-z0-9]/gi, '').length < 10}
          loading={busy}
        >
          {t('link')}
        </Button>
      </form>
      {error ? <FormError message={error} /> : null}
    </>
  );
}

export function GuardianChildrenStep(p: StepProps & { onLinked: () => void }) {
  const t = useT('onboarding');
  const children = p.context.guardian?.children ?? [];
  return (
    <>
      <Header icon={UsersRound} title={t('childrenTitle')} text={t('childrenText')} />
      <ul className="flex flex-col gap-2">
        {children.map((c) => (
          <li
            key={c.id}
            className="flex items-center gap-3 rounded-lg bg-bg-raised p-3 ring-1 ring-line"
          >
            <CircleCheck aria-hidden="true" className="size-5 text-brand-text" />
            <span className="flex-1 text-body-strong">
              {c.firstName} {c.lastName}
            </span>
            {c.className ? <Chip>{c.className}</Chip> : null}
          </li>
        ))}
      </ul>
      <LinkChildForm onLinked={p.onLinked} />
      <StepActions
        onNext={() => void p.next()}
        disabled={children.length === 0}
        busy={p.busy}
        back={p.back}
      />
    </>
  );
}
