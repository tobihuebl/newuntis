'use client';
import {
  ArrowLeftRight,
  BookX,
  CalendarX2,
  ChevronLeft,
  ChevronRight,
  FileClock,
  UserRoundX,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { addDays, nextWeekday, type PrincipalDashboard, type TimelineKind } from '@sp/shared';
import { Chip, Button, Card, EmptyState, Skeleton, cn } from '@sp/ui';
import { longDate, timeOf, todayVienna, weekdayDate } from '../../lib/dates';
import { useApi } from '../../lib/use-api';
import { useT } from '../../lib/i18n';

const TONE: Record<TimelineKind, 'danger' | 'late' | 'ok' | 'neutral'> = {
  cancelled: 'danger',
  open: 'late',
  substituted: 'late',
  supervision: 'late',
  roomChanged: 'ok',
  missingClassbook: 'neutral',
};

function prevWeekday(date: string): string {
  let d = addDays(date, -1);
  while ([0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay())) d = addDays(d, -1);
  return d;
}

/**
 * Lagebild der Direktion (DB-02, Spec Abschnitt 5): Karten mit Fehlenden, Entfall, offenen Supplierungen und
 * fehlenden Klassenbuch-Einträgen, darunter der Zeitstrahl des Tages. Jede Karte führt zur Aktion.
 */
export function DashboardScreen() {
  const t = useT('dashboard');
  const tc = useT('common');
  const router = useRouter();
  const today = todayVienna();
  const date = useSearchParams().get('datum') ?? today;
  const q = useApi<PrincipalDashboard>(['dashboard', date], `/dashboard/principal?date=${date}`);
  const d = q.data;
  const go = (to: string) => router.push(to === today ? '/lagebild' : `/lagebild?datum=${to}`);

  const cards: {
    key: keyof PrincipalDashboard['cards'];
    icon: LucideIcon;
    href: string;
    tone: 'danger' | 'late' | 'ok' | 'neutral';
  }[] = [
    {
      key: 'teachersAbsent',
      icon: UserRoundX,
      href: `/supplierung?datum=${date}`,
      tone: 'late',
    },
    {
      key: 'openSubstitutions',
      icon: ArrowLeftRight,
      href: `/supplierung?datum=${date}`,
      tone: 'late',
    },
    { key: 'cancelled', icon: CalendarX2, href: `/supplierung?datum=${date}`, tone: 'danger' },
    { key: 'missingClassbook', icon: BookX, href: '#fehlend', tone: 'neutral' },
    { key: 'studentsAbsent', icon: UsersRound, href: '/auswertung', tone: 'ok' },
    { key: 'pendingExcuses', icon: FileClock, href: '/klasse', tone: 'ok' },
  ];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-h1">{t('title')}</h1>
          <p className="text-body-sm text-ink-muted">{longDate(date)}</p>
        </div>
        <nav aria-label={t('day')} className="flex gap-2">
          <Button variant="secondary" onClick={() => go(prevWeekday(date))}>
            <ChevronLeft aria-hidden="true" size={18} />
            <span className="sr-only sm:not-sr-only">{t('prev')}</span>
          </Button>
          {date !== today ? (
            <Button variant="ghost" onClick={() => go(today)}>
              {t('today')}
            </Button>
          ) : null}
          <Button variant="secondary" onClick={() => go(nextWeekday(date))}>
            <span className="sr-only sm:not-sr-only">{t('next')}</span>
            <ChevronRight aria-hidden="true" size={18} />
          </Button>
        </nav>
      </div>

      {q.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : q.isError || !d ? (
        <Card>
          <EmptyState
            title={tc('error')}
            action={
              <Button variant="secondary" onClick={() => void q.refetch()}>
                {tc('retry')}
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {cards.map((c) => {
              const n = d.cards[c.key];
              const Icon = c.icon;
              return (
                <li key={c.key}>
                  <Link
                    href={c.href}
                    className={cn(
                      'flex min-h-24 flex-col justify-between gap-2 rounded-md border bg-bg-raised p-4 hover:bg-bg-sunken',
                      n > 0 && c.tone === 'danger' && 'border-danger',
                      n > 0 && c.tone === 'late' && 'border-signal',
                      (n === 0 || c.tone === 'ok' || c.tone === 'neutral') && 'border-line',
                    )}
                  >
                    <span className="flex items-center gap-2 text-body-sm text-ink-muted">
                      <Icon aria-hidden="true" size={18} />
                      {t(`card_${c.key}`)}
                    </span>
                    <span className="text-h1 tabular-nums">{n}</span>
                  </Link>
                </li>
              );
            })}
          </ul>

          {d.teachersAbsent.length > 0 ? (
            <section aria-labelledby="absent-h" className="flex flex-col gap-2">
              <h2 id="absent-h" className="text-h3">
                {t('absentTeachers')}
              </h2>
              <Card className="p-0">
                <ul>
                  {d.teachersAbsent.map((a) => (
                    <li
                      key={a.id}
                      className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2 last:border-b-0"
                    >
                      <span>
                        <span className="font-medium">{a.teacher.name}</span>
                        <span className="text-body-sm text-ink-muted">
                          {' '}
                          · {t(`kind_${a.kind}`)}
                        </span>
                      </span>
                      <span className="flex items-center gap-2 text-body-sm">
                        {t('affected', { count: a.affected })}
                        {a.open > 0 ? (
                          <Chip tone="late">{t('open', { count: a.open })}</Chip>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          ) : null}

          <section aria-labelledby="timeline-h" className="flex flex-col gap-2">
            <h2 id="timeline-h" className="text-h3">
              {t('timeline')}
            </h2>
            {d.timeline.length === 0 ? (
              <Card>
                <p className="text-ink-muted">{t('timelineEmpty')}</p>
              </Card>
            ) : (
              <Card className="p-0">
                <ol>
                  {d.timeline.map((x) => (
                    <li
                      key={x.occurrenceId}
                      className="flex min-h-14 items-center gap-3 border-b border-line px-4 py-2 last:border-b-0"
                    >
                      <span className="w-24 shrink-0 text-body-sm tabular-nums">
                        <span className="block font-medium">
                          {x.periodCount > 1
                            ? t('periods', {
                                from: x.periodStart,
                                to: x.periodStart + x.periodCount - 1,
                              })
                            : t('period', { n: x.periodStart })}
                        </span>
                        <span className="block text-caption text-ink-muted">
                          {timeOf(x.startsAt)}
                        </span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {x.className ? `${x.className} · ` : ''}
                          {x.subject}
                        </span>
                        <span className="block truncate text-body-sm text-ink-muted">
                          {x.teachers.join(', ')}
                        </span>
                      </span>
                      {x.kind === 'missingClassbook' ? (
                        <Link
                          href={`/klassenbuch/${x.occurrenceId}`}
                          className="text-body-sm text-brand-text underline-offset-2 hover:underline"
                        >
                          {t('kindmissingClassbook')}
                        </Link>
                      ) : (
                        <Chip tone={TONE[x.kind]}>{t(`kind${x.kind}`)}</Chip>
                      )}
                    </li>
                  ))}
                </ol>
              </Card>
            )}
          </section>

          <section
            id="fehlend"
            aria-labelledby="missing-h"
            className="flex scroll-mt-4 flex-col gap-2"
          >
            <h2 id="missing-h" className="text-h3">
              {t('missing', { count: d.cards.missingClassbook })}
            </h2>
            {d.missingClassbook.length === 0 ? (
              <Card>
                <p className="text-ink-muted">{t('missingEmpty')}</p>
              </Card>
            ) : (
              <Card className="p-0">
                <ul>
                  {d.missingClassbook.map((m) => (
                    <li key={m.occurrenceId} className="border-b border-line last:border-b-0">
                      <Link
                        href={`/klassenbuch/${m.occurrenceId}`}
                        className="flex min-h-12 items-center gap-3 px-4 py-2 hover:bg-bg-sunken"
                      >
                        <span className="w-28 shrink-0 text-body-sm tabular-nums">
                          {weekdayDate(m.date)}, {t('period', { n: m.periodStart })}
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          {m.className ? `${m.className} · ` : ''}
                          {m.subject}
                        </span>
                        <span className="hidden truncate text-body-sm text-ink-muted sm:block">
                          {m.teachers.join(', ')}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </section>
        </>
      )}
    </div>
  );
}
