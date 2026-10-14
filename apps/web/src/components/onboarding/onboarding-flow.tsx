'use client';
import { Check, MonitorSmartphone, PartyPopper } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { OnboardingFlowId, OnboardingStepState } from '@sp/shared';
import { Banner, Button, Skeleton, cn } from '@sp/ui';
import { useT } from '../../lib/i18n';
import { LoadError } from '../load-error';
import {
  GuardianChildrenStep,
  NotifyStep,
  PrivacyStep,
  PushStep,
  StudentClassStep,
  StudentProfileStep,
  TeacherDataStep,
  TeacherTimetableStep,
  type StepProps,
} from './steps';
import {
  isFlowScreen,
  tourHref,
  useOnboarding,
  useStepUpdate,
  useStepViewed,
} from './use-onboarding';

const PUSH_KIND: Record<OnboardingFlowId, string> = {
  admin: 'office',
  principal: 'office',
  teacher: 'teacher',
  guardian: 'guardian',
  student: 'student',
};

/**
 * Ablauf /willkommen (Onboarding-Engine, ADR 0020): rendert die offenen Schritte aus Willkommen und Einrichtung
 * aller Rollen der Person, am Ende den Aha-Moment der Startrolle mit Weg zur echten Seite (Coachmark).
 * Am Computer mit Schrittliste links, auf dem Handy als Vollbild mit fixierter Aktionsleiste.
 * Mit `replay` (Hilfe und Tour) erscheinen alle Schritte, auch erledigte.
 */
export function OnboardingFlow({
  firstName,
  lastName,
  school,
  home,
  noticeUrl,
  replay,
}: {
  firstName: string;
  lastName: string;
  school: string;
  home: string;
  noticeUrl: string | null;
  replay: boolean;
}) {
  const t = useT('onboarding');
  const router = useRouter();
  const q = useOnboarding();
  const update = useStepUpdate();
  const [screens, setScreens] = useState<OnboardingStepState[] | null>(null);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const viewed = useRef(new Set<string>());
  const heading = useRef<HTMLDivElement>(null);
  const d = q.data;

  // Liste beim ersten Laden festhalten: erledigte Schritte sollen nicht unter den Füßen verschwinden
  useEffect(() => {
    if (d && screens === null)
      setScreens(d.steps.filter((s) => isFlowScreen(s) && (replay || s.status === 'OPEN')));
  }, [d, screens, replay]);

  const current = screens && index < screens.length ? screens[index]! : null;
  const { mutate } = useStepViewed();
  useEffect(() => {
    const id = current?.id ?? 'final';
    if (!screens || viewed.current.has(id)) return;
    viewed.current.add(id);
    if (current) mutate({ stepId: current.id, status: 'VIEWED' });
    heading.current?.querySelector<HTMLElement>('#ob-h')?.focus();
  }, [current, screens, mutate]);

  if (q.isError) return <LoadError error={q.error} onRetry={() => void q.refetch()} />;
  if (!d || !screens) return <Skeleton className="h-96 w-full rounded-lg" />;

  const primary = d.primary ?? 'student';
  const aha = d.steps.find((s) => s.phase === 'aha' && s.flow === primary) ?? null;
  const total = screens.length + 1;

  async function mark(s: OnboardingStepState, status: 'DONE' | 'SKIPPED') {
    setBusy(true);
    try {
      if (s.id !== 'privacy') await update.mutateAsync({ stepId: s.id, status });
      setIndex((i) => i + 1);
    } finally {
      setBusy(false);
    }
  }

  function finish(href: string) {
    router.replace(href);
    router.refresh();
  }

  const stepProps = (s: OnboardingStepState): StepProps => ({
    next: () => mark(s, 'DONE'),
    back: index > 0 ? () => setIndex((i) => i - 1) : null,
    skip: s.required || replay ? null : () => mark(s, 'SKIPPED'),
    busy,
    context: d.context,
    replay,
  });

  function screen(s: OnboardingStepState) {
    const p = stepProps(s);
    switch (s.id) {
      case 'privacy':
        return <PrivacyStep {...p} firstName={firstName} school={school} noticeUrl={noticeUrl} />;
      case 'push':
        return <PushStep {...p} kind={PUSH_KIND[primary]} />;
      case 'notify':
        return <NotifyStep {...p} />;
      case 'teacherData':
        return <TeacherDataStep {...p} />;
      case 'teacherTimetable':
        return <TeacherTimetableStep {...p} />;
      case 'studentProfile':
        return <StudentProfileStep {...p} firstName={firstName} lastName={lastName} />;
      case 'studentClass':
        return <StudentClassStep {...p} />;
      case 'guardianChildren':
        return <GuardianChildrenStep {...p} onLinked={() => void q.refetch()} />;
      default:
        // Unbekannter Schritt (neuere Version der Konfiguration): nicht blockieren
        return (
          <Button onClick={() => void p.next()} className="self-start">
            {t('next')}
          </Button>
        );
    }
  }

  const finalHref = primary === 'admin' ? '/admin' : aha ? (tourHref(aha) ?? home) : home;

  return (
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-3 lg:gap-8">
      {/* Am Computer: Schrittliste (Stepper); auf dem Handy: Kachel-Leiste */}
      <nav aria-label={t('stepsLabel')} className="hidden lg:block">
        <ol className="flex flex-col gap-1">
          {[...screens.map((s) => s.id), 'final'].map((id, i) => (
            <li
              key={id}
              aria-current={i === index ? 'step' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-body-sm',
                i === index ? 'bg-brand-soft text-ink' : 'text-ink-muted',
              )}
            >
              <span
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-xs text-label',
                  i < index ? 'bg-brand text-on-brand' : 'bg-bg-sunken',
                )}
                aria-hidden="true"
              >
                {i < index ? <Check className="size-4" /> : i + 1}
              </span>
              {t(`title_${id}`)}
            </li>
          ))}
        </ol>
      </nav>

      <div ref={heading} className="flex flex-col gap-5 lg:col-span-2">
        <div className="flex flex-col gap-2 lg:hidden">
          <div aria-hidden="true" className="flex gap-2">
            {Array.from({ length: total }, (_, i) => (
              <span
                key={i}
                className={cn('h-2 flex-1 rounded-xs', i <= index ? 'bg-brand' : 'bg-bg-sunken')}
              />
            ))}
          </div>
        </div>
        <p className="text-overline text-ink-muted" aria-live="polite">
          {t('step', { n: index + 1, total })}
        </p>

        {current ? (
          <section key={current.id} aria-labelledby="ob-h" className="flex flex-col gap-4">
            {screen(current)}
          </section>
        ) : (
          <section aria-labelledby="ob-h" className="flex flex-col gap-4">
            <PartyPopper aria-hidden="true" className="size-8 text-brand-text" />
            <h1 id="ob-h" className="text-h1" tabIndex={-1}>
              {t(`aha_${primary}_title`)}
            </h1>
            <p className="text-body-lg">{t(`aha_${primary}_text`)}</p>
            {primary === 'admin' ? (
              <Banner tone="brand" icon={MonitorSmartphone} className="lg:hidden">
                {t('desktopHint')}
              </Banner>
            ) : null}
            <p className="text-body-sm text-ink-muted">{t('checklistHint')}</p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => finish(finalHref)}>{t(`aha_${primary}_action`)}</Button>
              {index > 0 ? (
                <Button variant="ghost" onClick={() => setIndex((i) => i - 1)}>
                  {t('back')}
                </Button>
              ) : null}
              {finalHref !== home ? (
                <Button variant="ghost" onClick={() => finish(home)} className="ml-auto">
                  {t('later')}
                </Button>
              ) : null}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
