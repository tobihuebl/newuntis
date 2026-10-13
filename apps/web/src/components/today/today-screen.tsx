'use client';
import {
  BookOpenCheck,
  CalendarDays,
  CloudOff,
  FileClock,
  MessageSquare,
  UserRoundCog,
  UserRoundX,
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  addDays,
  fachColorOf,
  mondayOf,
  nextWeekday,
  type TodayLesson,
  type TodayResponse,
} from '@sp/shared';
import {
  Banner,
  Button,
  Card,
  CardSub,
  CardTitle,
  Chip,
  EmptyState,
  FACH_BORDER,
  KpiTile,
  SegmentedNav,
  Skeleton,
  cn,
} from '@sp/ui';
import { dateTimeOf, longDate, shortDate, timeOf, weekdayDate } from '../../lib/dates';
import { OfflineMissError, type Cached } from '../../offline/cached';
import { useCached, useOutbox } from '../../offline/hooks';
import { cachePlanPages, prefetchTeacher } from '../../offline/prefetch';
import { SyncStatus } from '../sync-status';
import { NowCard } from './now-card';
import { LessonRow, PlanStatusBadge, lessonDetail, periodLabel } from './lesson-row';
import { useT } from '../../lib/i18n';
import { greetingKey } from '../../lib/now';

/** Aktuelle Zeit, minütlich aktualisiert ("läuft gerade", "nächste Stunde"). */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/** Ende der vorigen Stunden je Eintrag (für die Zeitlinie in Pausen). */
export function previousEnds<T extends { startsAt: string; endsAt: string }>(
  list: T[],
): (string | null)[] {
  let latest: string | null = null;
  return list.map((l) => {
    const prev = latest;
    if (!latest || l.endsAt > latest) latest = l.endsAt;
    return prev;
  });
}

export function TodaySkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      <Skeleton className="h-40 w-full rounded-lg" />
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-14 w-full" />
    </div>
  );
}

export function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const t = useT();
  return (
    <Card>
      <EmptyState
        title={error instanceof OfflineMissError ? t('offline.title') : t('common.error')}
        description={error instanceof OfflineMissError ? t('offline.description') : undefined}
        action={
          <Button variant="secondary" onClick={onRetry}>
            {t('common.retry')}
          </Button>
        }
      />
    </Card>
  );
}

function CachedHint({ result }: { result: Cached<unknown> }) {
  const t = useT('today');
  if (!result.fromCache) return null;
  return <Banner icon={CloudOff}>{t('cachedAt', { time: dateTimeOf(result.savedAt) })}</Banner>;
}

/**
 * Heute (Design System, Screens "Heute"): Begrüßung in display-lg, die aktuelle bzw. nächste Stunde als
 * Nachtkarte, darunter die Tagesliste; ab 1024 px zweispaltig mit Hinweisen rechts.
 */
export function TodayScreen({ firstName }: { firstName: string }) {
  const t = useT('today');
  const now = useNow();
  const child = useSearchParams().get('kind');
  const key = child ?? 'me';
  const q = useCached<TodayResponse>(
    ['today', key],
    `today:${key}`,
    `/today${child ? `?studentId=${encodeURIComponent(child)}` : ''}`,
  );
  const online = q.data && !q.data.fromCache;
  const day = q.data?.data.date;
  useEffect(() => {
    if (online && day) void cachePlanPages(addDays(mondayOf(day), 7));
  }, [online, day]);
  return (
    <div className="mx-auto flex w-full max-w-(--content-max) flex-col gap-6 px-4 pt-4 pb-8 lg:px-6 lg:pt-6">
      <header className="flex flex-col gap-1">
        <p className="text-overline text-brand-text">
          {q.data ? longDate(q.data.data.date) : t('title')}
        </p>
        <h1 className="text-display-lg">{t(greetingKey(now), { name: firstName })}</h1>
      </header>
      {q.isPending ? (
        <TodaySkeleton />
      ) : q.isError ? (
        <LoadError error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <CachedHint result={q.data} />
          {q.data.data.view === 'teacher' ? (
            <TeacherToday data={q.data.data} fromCache={q.data.fromCache} />
          ) : q.data.data.view === 'none' ? (
            <Card>
              <EmptyState title={t('noPlanTitle')} description={t('noPlanDescription')} />
            </Card>
          ) : (
            <StudentToday data={q.data.data} />
          )}
        </>
      )}
    </div>
  );
}

/** Zweispaltig ab 1024 px: Tag links, Hinweise rechts; mobil untereinander. */
function Columns({ main, aside }: { main: React.ReactNode; aside: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      <div className="flex min-w-0 flex-col gap-6 lg:col-span-3">{main}</div>
      <aside className="flex min-w-0 flex-col gap-4 lg:col-span-2">{aside}</aside>
    </div>
  );
}

/** Ungelesene Nachrichten und Rundschreiben (Spec Abschnitt 5: "ungelesene Mitteilungen"). */
function InboxHint({ data }: { data: TodayResponse }) {
  const t = useT('today');
  // Ältere Offline-Stände haben noch keine Zähler
  const inbox = data.inbox as TodayResponse['inbox'] | undefined;
  if (!inbox || inbox.messages + inbox.announcements === 0) return null;
  return (
    <Card
      interactive
      tone={inbox.required > 0 ? 'signal' : 'brand'}
      flat
      asChild
      className="flex items-center gap-3"
    >
      <Link
        href={
          inbox.announcements > 0 && inbox.messages === 0
            ? '/nachrichten?ansicht=rundschreiben'
            : '/nachrichten'
        }
      >
        <MessageSquare aria-hidden="true" className="size-6 shrink-0 text-brand-text" />
        <span className="flex flex-col">
          <span className="text-body-strong">
            {[
              inbox.messages > 0 ? t('unreadMessages', { count: inbox.messages }) : null,
              inbox.announcements > 0
                ? t('unreadAnnouncements', { count: inbox.announcements })
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
          {inbox.required > 0 ? (
            <span className="text-body-sm text-signal-ink">
              {t('confirmRequired', { count: inbox.required })}
            </span>
          ) : null}
        </span>
      </Link>
    </Card>
  );
}

// ───────────── Lehrkraft ─────────────

/** Supplierungen für mich (Design System, Supplierung): Amber weich, je Stunde mit Weg ins Klassenbuch. */
function SubstitutionCard({
  subs,
  className,
}: {
  subs: NonNullable<TodayResponse['teacher']>['substitutions'];
  className?: string;
}) {
  const t = useT('today');
  return (
    <Card tone="signal" flat className={cn('flex flex-col gap-3', className)}>
      <p className="flex items-center gap-2 text-overline text-signal-ink">
        <UserRoundCog aria-hidden="true" className="size-4" />
        {t('substitutionsForYou', { count: subs.length })}
      </p>
      <ul className="flex flex-col gap-3">
        {subs.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-body-strong">
              {t('substituteFor', {
                day: weekdayDate(s.date),
                className: s.class?.name ?? s.group?.name ?? '',
                period: periodLabel(t, s),
                room: s.room?.name ?? '–',
              })}
            </span>
            <Button size="sm" variant="secondary" asChild iconLeft={BookOpenCheck}>
              <Link href={`/klassenbuch/${s.id}`}>{t('openClassbook')}</Link>
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function TeacherToday({ data, fromCache }: { data: TodayResponse; fromCache: boolean }) {
  const t = useT('today');
  const now = useNow();
  const outbox = useOutbox();
  useEffect(() => {
    if (!fromCache) void prefetchTeacher();
  }, [fromCache, data]);
  const closing = new Set(outbox.filter((o) => o.kind === 'close').map((o) => o.occurrenceId));
  const current = data.lessons.find(
    (l) =>
      l.status !== 'CANCELLED' &&
      Date.parse(l.startsAt) <= now + 5 * 60_000 &&
      Date.parse(l.endsAt) > now,
  );
  // Ist gerade keine Stunde, zeigt die Nachtkarte die nächste (Design System, Heute)
  const hero =
    current ?? data.lessons.find((l) => l.status !== 'CANCELLED' && Date.parse(l.startsAt) > now);
  const subs = data.teacher?.substitutions ?? [];
  const openEntries = data.teacher?.openEntries ?? 0;
  const teacherPrev = previousEnds(data.lessons);
  const progress = (l: TodayLesson) => {
    if (l.classbook === null) return null;
    if (closing.has(l.id) && l.classbook !== 'closed')
      return <Chip tone="ok">{t('progress_pending')}</Chip>;
    return (
      <Chip
        tone={l.classbook === 'closed' ? 'ok' : l.classbook === 'started' ? 'late' : 'absent'}
        icon={l.classbook === 'closed' ? BookOpenCheck : undefined}
      >
        {t(`progress_${l.classbook}`)}
      </Chip>
    );
  };

  const main = (
    <>
      {/* Mobil steht "Du vertrittst …" ganz oben (Design System, Supplierung); ab 1024 px rechts */}
      {subs.length > 0 ? <SubstitutionCard subs={subs} className="lg:hidden" /> : null}
      {hero ? (
        <NowCard
          overline={hero === current ? t('now') : t('next')}
          title={`${hero.class?.name ?? hero.group?.name ?? ''} · ${hero.subject.name}`}
          sub={[
            t('time', { from: timeOf(hero.startsAt), to: timeOf(hero.endsAt) }),
            periodLabel(t, hero),
            hero.room?.name,
          ]
            .filter(Boolean)
            .join(' · ')}
          status={
            hero.classbook === null
              ? undefined
              : hero.classbook === 'closed' || closing.has(hero.id)
                ? { label: t('progress_closed'), open: false }
                : { label: t('lessonOpen'), open: true }
          }
          action={
            hero.planned ? null : (
              <Button asChild iconLeft={BookOpenCheck}>
                <Link href={`/klassenbuch/${hero.id}`}>{t('openClassbook')}</Link>
              </Button>
            )
          }
        />
      ) : null}

      <section aria-labelledby="my-lessons" className="flex flex-col gap-3">
        <h2 id="my-lessons" className="text-h2">
          {t('myLessons')}
        </h2>
        {data.lessons.length === 0 ? (
          <Card flat>
            <EmptyState
              title={t('emptyTitle')}
              description={t('emptyDescription')}
              action={
                <Button variant="secondary" asChild iconLeft={CalendarDays}>
                  <Link href="/plan">{t('plan')}</Link>
                </Button>
              }
            />
          </Card>
        ) : (
          <Card className="p-0">
            <ul>
              {data.lessons.map((l, i) => (
                <LessonRow
                  key={l.id}
                  entry={l}
                  perspective="teacher"
                  href={l.status === 'CANCELLED' || l.planned ? undefined : `/klassenbuch/${l.id}`}
                  past={Date.parse(l.endsAt) <= now}
                  highlight={l.id === current?.id}
                  trailing={progress(l)}
                  timeline={{ previousEndsAt: teacherPrev[i] ?? null }}
                />
              ))}
            </ul>
          </Card>
        )}
      </section>
    </>
  );

  const aside = (
    <>
      <SyncStatus />
      <InboxHint data={data} />
      {openEntries > 0 ? (
        <KpiTile
          as={Link}
          href="/klassenbuch"
          value={openEntries}
          label={t('openEntriesLabel', { count: openEntries })}
        />
      ) : null}
      {subs.length > 0 ? <SubstitutionCard subs={subs} className="hidden lg:flex" /> : null}
      {openEntries === 0 && subs.length === 0 ? (
        <Card flat>
          <EmptyState as="h3" title={t('allDoneTitle')} description={t('allDoneText')} />
        </Card>
      ) : null}
    </>
  );

  return <Columns main={main} aside={aside} />;
}

// ───────────── Schüler:innen und Eltern ─────────────

function ChildSwitcher({ data }: { data: TodayResponse }) {
  const t = useT('today');
  if (data.children.length < 2) return null;
  return (
    <SegmentedNav
      label={t('child')}
      linkAs={Link}
      items={data.children.map((c) => ({
        key: c.id,
        href: `/heute?kind=${encodeURIComponent(c.id)}`,
        label: c.className ? `${c.firstName} (${c.className})` : c.firstName,
        current: c.id === data.studentId,
      }))}
    />
  );
}

function StudentToday({ data }: { data: TodayResponse }) {
  const t = useT('today');
  const now = useNow();
  if (data.view === 'guardian' && data.children.length === 0)
    return (
      <Card flat>
        <EmptyState
          title={t('noChildren')}
          description={t('noChildrenDescription')}
          action={
            <Button asChild>
              <Link href="/eltern-code">{t('linkChild')}</Link>
            </Button>
          }
        />
      </Card>
    );
  const lessons = data.lessons;
  const next = lessons.find((l) => l.status !== 'CANCELLED' && Date.parse(l.endsAt) > now);
  const changes = lessons.filter((l) => l.status !== 'SCHEDULED');
  const restPrev = previousEnds(lessons);
  const running = next && Date.parse(next.startsAt) <= now;
  const planHref =
    data.view === 'guardian' && data.studentId ? `/plan?child=${data.studentId}` : '/plan';

  const main = (
    <>
      <ChildSwitcher data={data} />
      {lessons.length === 0 ? (
        <Card flat>
          <EmptyState
            title={t('emptyTitle')}
            description={t('emptyDescription')}
            action={
              <Button variant="secondary" asChild iconLeft={CalendarDays}>
                <Link href={planHref}>{t('plan')}</Link>
              </Button>
            }
          />
        </Card>
      ) : next ? (
        <NowCard
          overline={running ? t('now') : t('next')}
          title={next.subject.name}
          sub={[
            t('time', { from: timeOf(next.startsAt), to: timeOf(next.endsAt) }),
            periodLabel(t, next),
            lessonDetail(next, 'student'),
          ]
            .filter(Boolean)
            .join(' · ')}
        >
          {next.status !== 'SCHEDULED' ? <PlanStatusBadge entry={next} /> : null}
        </NowCard>
      ) : (
        <Card flat>
          <EmptyState as="h2" title={t('doneForToday')} />
        </Card>
      )}

      {changes.length > 0 ? (
        <section aria-labelledby="changes" className="flex flex-col gap-3">
          <h2 id="changes" className="text-h2">
            {t('changes')}
          </h2>
          <Card className="p-0">
            <ul>
              {changes.map((l) => (
                <LessonRow key={l.id} entry={l} perspective="student" />
              ))}
            </ul>
          </Card>
        </section>
      ) : null}

      {lessons.length > 0 ? (
        <section aria-labelledby="rest" className="flex flex-col gap-3">
          <h2 id="rest" className="text-h2">
            {t('rest')}
          </h2>
          <Card className="p-0">
            <ul>
              {lessons.map((l, i) => (
                <LessonRow
                  key={l.id}
                  entry={l}
                  perspective="student"
                  past={Date.parse(l.endsAt) <= now}
                  highlight={l.id === next?.id && running}
                  timeline={{ previousEndsAt: restPrev[i] ?? null }}
                />
              ))}
            </ul>
          </Card>
        </section>
      ) : null}
    </>
  );

  const aside = (
    <>
      <InboxHint data={data} />
      {data.view === 'guardian' && data.studentId ? (
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" asChild iconLeft={UserRoundX}>
            <Link href={`/abwesenheit/neu?kind=${data.studentId}`}>{t('reportAbsence')}</Link>
          </Button>
          <Button variant="secondary" asChild iconLeft={FileClock}>
            <Link href={`/kind/${data.studentId}/fehlzeiten`}>{t('absences')}</Link>
          </Button>
        </div>
      ) : null}
      <Card className="flex flex-col gap-3">
        <CardTitle as="h2">{t('homework', { date: shortDate(nextWeekday(data.date)) })}</CardTitle>
        {data.homework.length === 0 ? (
          <CardSub className="mt-0">{t('homeworkEmpty')}</CardSub>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {data.homework.map((h) => (
              <li key={h.occurrenceId} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                <p
                  className={cn('border-l-4 pl-2 text-label', FACH_BORDER[fachColorOf(h.subject)])}
                >
                  {h.subject.name} · {weekdayDate(h.dueOn)}
                </p>
                <p className="whitespace-pre-line">{h.text}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="flex flex-col gap-3">
        <CardTitle as="h2">{t('exams')}</CardTitle>
        {data.exams.length === 0 ? (
          <CardSub className="mt-0">{t('examsEmpty')}</CardSub>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {data.exams.map((x) => (
              <li
                key={x.id}
                className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="text-body-strong">{x.title}</p>
                  <p className="text-body-sm text-ink-muted">
                    {x.subject.name} · {x.kind}
                  </p>
                </div>
                <Chip tone="mono">{weekdayDate(x.date)}</Chip>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );

  return <Columns main={main} aside={aside} />;
}
