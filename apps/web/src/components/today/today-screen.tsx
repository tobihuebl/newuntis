'use client';
import {
  BookOpenCheck,
  CalendarDays,
  ClipboardList,
  MessageSquare,
  UserRoundCog,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { addDays, mondayOf, nextWeekday, type TodayLesson, type TodayResponse } from '@sp/shared';
import { Badge, Button, Card, EmptyState, Skeleton, cn } from '@sp/ui';
import { dateTimeOf, longDate, shortDate, timeOf, weekdayDate } from '../../lib/dates';
import { OfflineMissError, type Cached } from '../../offline/cached';
import { useCached, useOutbox } from '../../offline/hooks';
import { cachePlanPages, prefetchTeacher } from '../../offline/prefetch';
import { SyncStatus } from '../sync-status';
import { LessonRow, PlanStatusBadge, lessonDetail, periodLabel } from './lesson-row';

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
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}

export function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const t = useTranslations();
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
  const t = useTranslations('today');
  if (!result.fromCache) return null;
  return (
    <p className="text-body-sm text-signal-ink">{t('cachedAt', { time: dateTimeOf(result.savedAt) })}</p>
  );
}

export function TodayScreen() {
  const t = useTranslations('today');
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
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
      <div>
        <h1 className="text-h1">{t('title')}</h1>
        {q.data ? <p className="text-ink-muted">{longDate(q.data.data.date)}</p> : null}
      </div>
      {q.isPending ? (
        <TodaySkeleton />
      ) : q.isError ? (
        <LoadError error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <CachedHint result={q.data} />
          <InboxHint data={q.data.data} />
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

/** Ungelesene Nachrichten und Rundschreiben (Spec Abschnitt 5: "ungelesene Mitteilungen"). */
function InboxHint({ data }: { data: TodayResponse }) {
  const t = useTranslations('today');
  // Ältere Offline-Stände haben noch keine Zähler
  const inbox = data.inbox as TodayResponse['inbox'] | undefined;
  if (!inbox || inbox.messages + inbox.announcements === 0) return null;
  return (
    <Link
      href={
        inbox.announcements > 0 && inbox.messages === 0
          ? '/nachrichten?ansicht=rundschreiben'
          : '/nachrichten'
      }
      className={cn(
        'flex min-h-12 items-center gap-3 rounded-md border bg-bg-raised px-4 py-2 hover:bg-bg-sunken',
        inbox.required > 0 ? 'border-signal' : 'border-line',
      )}
    >
      <MessageSquare aria-hidden="true" size={20} className="shrink-0 text-brand-text" />
      <span className="flex flex-col">
        <span className="font-medium">
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
  );
}

// ───────────── Lehrkraft ─────────────

function TeacherToday({ data, fromCache }: { data: TodayResponse; fromCache: boolean }) {
  const t = useTranslations('today');
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
  const subs = data.teacher?.substitutions ?? [];
  const teacherPrev = previousEnds(data.lessons);
  const progress = (l: TodayLesson) => {
    if (l.classbook === null) return null;
    if (closing.has(l.id) && l.classbook !== 'closed')
      return <Badge tone="info">{t('progress_pending')}</Badge>;
    return (
      <Badge
        tone={
          l.classbook === 'closed' ? 'success' : l.classbook === 'started' ? 'warning' : 'neutral'
        }
      >
        {t(`progress_${l.classbook}`)}
      </Badge>
    );
  };

  return (
    <>
      <SyncStatus />
      {(data.teacher?.openEntries ?? 0) > 0 || subs.length > 0 ? (
        <div className="flex flex-col gap-2" role="region" aria-label={t('title')}>
          {(data.teacher?.openEntries ?? 0) > 0 ? (
            <Link
              href="/klassenbuch"
              className="flex min-h-11 items-center gap-3 rounded-md border border-signal bg-bg-raised px-4 py-3 text-signal-ink hover:bg-bg-sunken"
            >
              <ClipboardList aria-hidden="true" size={20} />
              <span className="font-medium">
                {t('openEntries', { count: data.teacher!.openEntries })}
              </span>
            </Link>
          ) : null}
          {subs.length > 0 ? (
            <Link
              href={`/klassenbuch/${subs[0]!.id}`}
              className="flex min-h-11 items-center gap-3 rounded-md border border-signal bg-bg-raised px-4 py-3 text-signal-ink hover:bg-bg-sunken"
            >
              <UserRoundCog aria-hidden="true" size={20} />
              <span className="font-medium">
                {t('substitutionsForYou', { count: subs.length })}
              </span>
              <span className="ml-auto text-body-sm text-ink-muted">
                {weekdayDate(subs[0]!.date)}, {periodLabel(t, subs[0]!)} ·{' '}
                {subs[0]!.class?.name ?? subs[0]!.group?.name}
              </span>
            </Link>
          ) : null}
        </div>
      ) : null}

      {current ? (
        <Card className="flex flex-col gap-3 border-brand">
          <p className="text-label text-brand-text">{t('now')}</p>
          <div>
            <p className="text-h3">
              {current.subject.name} · {current.class?.name ?? current.group?.name}
            </p>
            <p className="text-ink-muted">
              {t('time', { from: timeOf(current.startsAt), to: timeOf(current.endsAt) })} ·{' '}
              {periodLabel(t, current)}
              {current.room ? ` · ${current.room.name}` : ''}
            </p>
          </div>
          <Button asChild className="self-start">
            <Link href={`/klassenbuch/${current.id}`}>
              <BookOpenCheck aria-hidden="true" size={18} />
              {t('openClassbook')}
            </Link>
          </Button>
        </Card>
      ) : null}

      <section aria-labelledby="my-lessons" className="flex flex-col gap-2">
        <h2 id="my-lessons" className="text-h3">
          {t('myLessons')}
        </h2>
        {data.lessons.length === 0 ? (
          <Card>
            <EmptyState
              title={t('emptyTitle')}
              description={t('emptyDescription')}
              action={
                <Button variant="secondary" asChild>
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
      {subs.length > 1 ? (
        <section aria-labelledby="subs" className="flex flex-col gap-2">
          <h2 id="subs" className="text-h3">
            {t('upcomingSubstitutions')}
          </h2>
          <Card className="p-0">
            <ul>
              {subs.map((s) => (
                <LessonRow
                  key={s.id}
                  entry={s}
                  perspective="teacher"
                  href={`/klassenbuch/${s.id}`}
                  trailing={<span className="text-caption text-ink-muted">{weekdayDate(s.date)}</span>}
                />
              ))}
            </ul>
          </Card>
        </section>
      ) : null}
    </>
  );
}

// ───────────── Schüler:innen und Eltern ─────────────

function ChildSwitcher({ data }: { data: TodayResponse }) {
  const t = useTranslations('today');
  const router = useRouter();
  if (data.children.length < 2) return null;
  return (
    <nav aria-label={t('child')} className="flex flex-wrap gap-2">
      {data.children.map((c) => (
        <Button
          key={c.id}
          variant={c.id === data.studentId ? 'primary' : 'secondary'}
          aria-current={c.id === data.studentId ? 'page' : undefined}
          onClick={() => router.replace(`/heute?kind=${encodeURIComponent(c.id)}`)}
        >
          {c.firstName}
          {c.className ? ` (${c.className})` : ''}
        </Button>
      ))}
    </nav>
  );
}

function StudentToday({ data }: { data: TodayResponse }) {
  const t = useTranslations('today');
  const now = useNow();
  if (data.view === 'guardian' && data.children.length === 0)
    return (
      <Card>
        <EmptyState
          title={t('noChildren')}
          description={t('noChildrenDescription')}
          action={
            <Button variant="secondary" asChild>
              <Link href="/eltern-code">{t('linkChild')}</Link>
            </Button>
          }
        />
      </Card>
    );
  const lessons = data.lessons;
  const next = lessons.find((l) => l.status !== 'CANCELLED' && Date.parse(l.endsAt) > now);
  const changes = lessons.filter((l) => l.status !== 'SCHEDULED');
  // Ganzer Tag mit Zeitlinie; Änderungen stehen zusätzlich oben (Spec Abschnitt 5)
  const rest = lessons;
  const restPrev = previousEnds(rest);
  const running = next && Date.parse(next.startsAt) <= now;

  return (
    <>
      <ChildSwitcher data={data} />
      {data.view === 'guardian' && data.studentId ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" asChild>
            <Link href={`/kind/${data.studentId}/fehlzeiten`}>{t('absences')}</Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link href={`/abwesenheit/neu?kind=${data.studentId}`}>{t('reportAbsence')}</Link>
          </Button>
        </div>
      ) : null}
      {lessons.length === 0 ? (
        <Card>
          <EmptyState
            title={t('emptyTitle')}
            description={t('emptyDescription')}
            action={
              <Button variant="secondary" asChild>
                <Link
                  href={
                    data.view === 'guardian' && data.studentId
                      ? `/plan?child=${data.studentId}`
                      : '/plan'
                  }
                >
                  <CalendarDays aria-hidden="true" size={18} />
                  {t('plan')}
                </Link>
              </Button>
            }
          />
        </Card>
      ) : next ? (
        <Card
          className="flex flex-col gap-2"
          style={{ borderLeft: `6px solid ${next.subject.color ?? 'var(--brand)'}` }}
        >
          <p className="text-label text-brand-text">{running ? t('now') : t('next')}</p>
          <p className="text-h1">{next.subject.name}</p>
          <p className="text-body-lg tabular-nums">
            {t('time', { from: timeOf(next.startsAt), to: timeOf(next.endsAt) })} ·{' '}
            {periodLabel(t, next)}
          </p>
          <p className="text-ink-muted">{lessonDetail(next, 'student')}</p>
          <PlanStatusBadge entry={next} />
        </Card>
      ) : (
        <Card>
          <p className="text-ink-muted">{t('doneForToday')}</p>
        </Card>
      )}

      {changes.length > 0 ? (
        <section aria-labelledby="changes" className="flex flex-col gap-2">
          <h2 id="changes" className="text-h3 text-signal-ink">
            {t('changes')}
          </h2>
          <Card className="border-signal p-0">
            <ul>
              {changes.map((l) => (
                <LessonRow key={l.id} entry={l} perspective="student" />
              ))}
            </ul>
          </Card>
        </section>
      ) : null}

      {rest.length > 0 ? (
        <section aria-labelledby="rest" className="flex flex-col gap-2">
          <h2 id="rest" className="text-h3">
            {t('rest')}
          </h2>
          <Card className="p-0">
            <ul>
              {rest.map((l, i) => (
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

      <section aria-labelledby="homework" className="flex flex-col gap-2">
        <h2 id="homework" className="text-h3">
          {t('homework', { date: shortDate(nextWeekday(data.date)) })}
        </h2>
        <Card className={cn(data.homework.length > 0 && 'p-0')}>
          {data.homework.length === 0 ? (
            <p className="text-ink-muted">{t('homeworkEmpty')}</p>
          ) : (
            <ul>
              {data.homework.map((h) => (
                <li
                  key={h.occurrenceId}
                  className="flex flex-col gap-0.5 border-b border-line px-4 py-3 last:border-b-0"
                >
                  <p
                    className="border-l-4 pl-2 text-label"
                    style={{ borderColor: h.subject.color ?? 'var(--brand)' }}
                  >
                    {h.subject.name} · {weekdayDate(h.dueOn)}
                  </p>
                  <p className="whitespace-pre-line">{h.text}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <section aria-labelledby="exams" className="flex flex-col gap-2">
        <h2 id="exams" className="text-h3">
          {t('exams')}
        </h2>
        <Card className={cn(data.exams.length > 0 && 'p-0')}>
          {data.exams.length === 0 ? (
            <p className="text-ink-muted">{t('examsEmpty')}</p>
          ) : (
            <ul>
              {data.exams.map((x) => (
                <li
                  key={x.id}
                  className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{x.title}</p>
                    <p className="text-body-sm text-ink-muted">
                      {x.subject.name} · {x.kind}
                    </p>
                  </div>
                  <span className="shrink-0 text-body-sm tabular-nums">{weekdayDate(x.date)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </>
  );
}
