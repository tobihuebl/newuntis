'use client';
import {
  Ban,
  BookX,
  ChevronLeft,
  ChevronRight,
  Clock,
  DoorOpen,
  TriangleAlert,
  UserRoundCog,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  addDays,
  nextWeekday,
  type AttendanceReport,
  type PrincipalDashboard,
  type TimelineKind,
} from '@sp/shared';
import {
  Banner,
  Button,
  Card,
  CardSub,
  CardTitle,
  Chip,
  EmptyState,
  KpiTile,
  Skeleton,
} from '@sp/ui';
import { longDate, timeOf, todayVienna, weekdayDate } from '../../lib/dates';
import { useApi } from '../../lib/use-api';
import { useT } from '../../lib/i18n';
import { PageTitle } from '../page-title';

/** Zustände im Zeitstrahl (Status-Abbildung im Design-Audit 2a: Rot nur für Fehler). */
const TONE: Record<TimelineKind, { tone: 'late' | 'ok' | 'absent'; icon: LucideIcon }> = {
  cancelled: { tone: 'late', icon: Ban },
  open: { tone: 'late', icon: Clock },
  substituted: { tone: 'ok', icon: UserRoundCog },
  supervision: { tone: 'ok', icon: UsersRound },
  roomChanged: { tone: 'late', icon: DoorOpen },
  missingClassbook: { tone: 'absent', icon: BookX },
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

  // Fehlstunden je Klasse aus der vorhandenen Auswertung (kein eigener Endpunkt), für die Balken
  const att = useApi<AttendanceReport>(
    ['dashboard', 'attendance', date],
    `/reports/attendance?from=${date}&to=${date}`,
  );
  const classes = (att.data?.classes ?? []).filter((c) => c.absentLessons > 0);
  const maxAbsent = Math.max(1, ...classes.map((c) => c.absentLessons));

  const tiles: {
    key: Exclude<keyof PrincipalDashboard['cards'], 'studentsAbsent'>;
    href: string;
    /** Amber nur für Zahlen, die Handlung verlangen (Design System, KpiTile). */
    action?: boolean;
  }[] = [
    { key: 'openSubstitutions', href: `/supplierung?datum=${date}`, action: true },
    { key: 'teachersAbsent', href: `/supplierung?datum=${date}` },
    { key: 'cancelled', href: `/supplierung?datum=${date}` },
    { key: 'missingClassbook', href: '#fehlend' },
    { key: 'pendingExcuses', href: '/klasse' },
  ];

  return (
    <div className="mx-auto flex w-full max-w-(--content-max) flex-col gap-8 px-4 pt-4 pb-8 lg:px-6 lg:pt-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <PageTitle area="direktion">{t('title')}</PageTitle>
          <p className="text-body-sm text-ink-muted">{longDate(date)}</p>
        </div>
        <nav aria-label={t('day')} className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => go(prevWeekday(date))}>
            <ChevronLeft aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">{t('prev')}</span>
          </Button>
          {date !== today ? (
            <Button variant="ghost" size="sm" onClick={() => go(today)}>
              {t('today')}
            </Button>
          ) : null}
          <Button variant="secondary" size="sm" onClick={() => go(nextWeekday(date))}>
            <span className="sr-only sm:not-sr-only">{t('next')}</span>
            <ChevronRight aria-hidden="true" />
          </Button>
        </nav>
      </header>

      {q.isPending ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3" aria-hidden="true">
          <Skeleton className="h-80 rounded-lg" />
          <Skeleton className="h-80 rounded-lg" />
          <Skeleton className="h-80 rounded-lg" />
        </div>
      ) : q.isError || !d ? (
        <Banner
          tone="danger"
          icon={TriangleAlert}
          action={
            <Button size="sm" variant="secondary" onClick={() => void q.refetch()}>
              {tc('retry')}
            </Button>
          }
        >
          {tc('error')}
        </Banner>
      ) : (
        <>
          {/* Drei Spalten ab 1280 px (Design System, Lagebild); mobil als Stapel */}
          <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-3">
            <section aria-labelledby="kpi-h" className="flex flex-col gap-3">
              <h2 id="kpi-h" className="sr-only">
                {t('kpis')}
              </h2>
              {tiles.map((c) => (
                <KpiTile
                  key={c.key}
                  as={Link}
                  href={c.href}
                  value={d.cards[c.key]}
                  label={t(`card_${c.key}`)}
                  tone={c.action && d.cards[c.key] > 0 ? 'signal' : 'brand'}
                />
              ))}
            </section>

            <section aria-labelledby="absences-h" className="flex flex-col gap-4">
              <KpiTile
                as={Link}
                href="/auswertung"
                size="big"
                value={d.cards.studentsAbsent}
                label={t('card_studentsAbsent')}
              />
              <Card className="flex flex-col gap-4">
                <CardTitle as="h2" id="absences-h">
                  {t('byClass')}
                </CardTitle>
                {classes.length === 0 ? (
                  <CardSub className="mt-0">{t('byClassEmpty')}</CardSub>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {classes.map((c) => (
                      <li key={c.classId} className="grid grid-cols-[3rem_1fr] items-center gap-3">
                        <span className="text-label">{c.className}</span>
                        <span className="flex items-center gap-2">
                          <span
                            aria-hidden="true"
                            className="h-6 rounded-xs bg-brand"
                            style={{ width: `${(c.absentLessons / maxAbsent) * 100}%` }}
                          />
                          <span className="text-mono">
                            {t('lessonsShort', { count: c.absentLessons })}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              {d.teachersAbsent.length > 0 ? (
                <Card className="flex flex-col gap-3">
                  <CardTitle as="h2">{t('absentTeachers')}</CardTitle>
                  <ul className="flex flex-col divide-y divide-line">
                    {d.teachersAbsent.map((a) => (
                      <li
                        key={a.id}
                        className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
                      >
                        <span>
                          <span className="text-body-strong">{a.teacher.name}</span>
                          <span className="text-body-sm text-ink-muted">
                            {' '}
                            · {t(`kind_${a.kind}`)}
                          </span>
                        </span>
                        <span className="flex items-center gap-2 text-body-sm">
                          {t('affected', { count: a.affected })}
                          {a.open > 0 ? (
                            <Chip tone="late" icon={Clock}>
                              {t('open', { count: a.open })}
                            </Chip>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              ) : null}
            </section>

            <section aria-labelledby="timeline-h" className="flex flex-col gap-3">
              <Card className="flex flex-col gap-3">
                <CardTitle as="h2" id="timeline-h">
                  {t('timeline')}
                </CardTitle>
                {d.timeline.length === 0 ? (
                  <EmptyState as="h3" title={t('timelineEmpty')} />
                ) : (
                  <ol className="flex flex-col divide-y divide-line">
                    {d.timeline.map((x) => (
                      <li
                        key={x.occurrenceId}
                        className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                      >
                        <span className="w-14 shrink-0">
                          <span className="block text-mono">{timeOf(x.startsAt)}</span>
                          <span className="block text-caption text-ink-muted">
                            {x.periodCount > 1
                              ? t('periods', {
                                  from: x.periodStart,
                                  to: x.periodStart + x.periodCount - 1,
                                })
                              : t('period', { n: x.periodStart })}
                          </span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-body-strong break-words">
                            {x.className ? `${x.className} · ` : ''}
                            {x.subject}
                          </span>
                          <span className="block truncate text-body-sm text-ink-muted">
                            {x.teachers.join(', ')}
                          </span>
                        </span>
                        {x.kind === 'missingClassbook' ? (
                          <Button size="sm" variant="ghost" asChild>
                            <Link href={`/klassenbuch/${x.occurrenceId}`}>
                              {t('kindmissingClassbook')}
                            </Link>
                          </Button>
                        ) : (
                          <Chip tone={TONE[x.kind].tone} icon={TONE[x.kind].icon}>
                            {t(`kind${x.kind}`)}
                          </Chip>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </Card>
            </section>
          </div>

          <section
            id="fehlend"
            aria-labelledby="missing-h"
            className="flex scroll-mt-20 flex-col gap-3"
          >
            <h2 id="missing-h" className="text-h2">
              {t('missing', { count: d.cards.missingClassbook })}
            </h2>
            {d.missingClassbook.length === 0 ? (
              <Card flat>
                <EmptyState as="h3" title={t('missingEmpty')} />
              </Card>
            ) : (
              <Card className="p-0">
                <ul>
                  {d.missingClassbook.map((m) => (
                    <li key={m.occurrenceId} className="border-b border-line last:border-b-0">
                      <Link
                        href={`/klassenbuch/${m.occurrenceId}`}
                        className="flex min-h-13 items-center gap-3 px-4 py-2 hover:bg-brand-soft"
                      >
                        <span className="w-32 shrink-0 text-body-sm">
                          {weekdayDate(m.date)}, {t('period', { n: m.periodStart })}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-body-strong">
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
