import Link from 'next/link';
import { CalendarRange, FileCheck, FilePen } from 'lucide-react';
import type { AbsenceItem } from '@sp/shared';
import { Chip, Card, EmptyState, ListRow } from '@sp/ui';
import { apiGet } from '../../../src/lib/api-server';
import { shortDate } from '../../../src/lib/dates';
import { requireRoute } from '../../../src/lib/route-guard';
import { getT } from '../../../src/lib/nav-server';
import { PageTitle } from '../../../src/components/page-title';

interface Version {
  id: string;
  name: string | null;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  validFrom: string;
  schoolYear: { name: string };
  lessonCount: number;
}

/**
 * Freigaben der Direktion: alles, was auf eine Entscheidung wartet, an einem Ort. Stundenplan-Entwürfe
 * veröffentlichen und gemeldete Entschuldigungen je Klasse (sonst Sache des Klassenvorstands, die Direktion darf
 * ebenfalls entscheiden).
 */
export default async function FreigabenPage() {
  await requireRoute('/freigaben');
  const t = await getT('approvals');
  const [{ data }, reported, directory] = await Promise.all([
    apiGet<{ data: Version[] }>('/admin/timetable-versions'),
    apiGet<{ data: AbsenceItem[] }>('/absences?status=REPORTED'),
    apiGet<{ classes: { id: string; name: string }[] }>('/timetable/directory'),
  ]);
  const drafts = data.filter((v) => v.status === 'DRAFT');
  const current = data.find((v) => v.status === 'PUBLISHED');
  const byClass = new Map<string, number>();
  for (const a of reported.data)
    if (a.student.className)
      byClass.set(a.student.className, (byClass.get(a.student.className) ?? 0) + 1);
  const excuses = directory.classes.filter((c) => byClass.has(c.name));
  const nothing = drafts.length === 0 && excuses.length === 0;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-4 pb-8 lg:px-6 lg:pt-6">
      <div className="flex flex-col gap-2">
        <PageTitle area="direktion">{t('title')}</PageTitle>
        <p className="text-body-sm text-ink-muted">{t('intro')}</p>
      </div>
      {nothing ? (
        <Card flat>
          <EmptyState title={t('empty')} description={t('emptyText')} />
        </Card>
      ) : null}

      {drafts.length ? (
        <section aria-labelledby="drafts-h" className="flex flex-col gap-3">
          <h2 id="drafts-h" className="text-h3">
            {t('drafts')}
          </h2>
          <Card className="p-0">
            <ul>
              {drafts.map((v) => (
                <ListRow
                  key={v.id}
                  as="li"
                  href={`/admin/stundenplan/${v.id}`}
                  linkAs={Link}
                  className="min-h-16 py-3"
                  title={v.name ?? t('unnamed')}
                  subtitle={`${v.schoolYear.name} · ${t('validFrom', { date: shortDate(v.validFrom) })} · ${t('lessons', { count: v.lessonCount })}`}
                  trailing={
                    <Chip tone="absent" icon={FilePen}>
                      {t('draft')}
                    </Chip>
                  }
                />
              ))}
            </ul>
          </Card>
        </section>
      ) : null}

      {excuses.length ? (
        <section aria-labelledby="excuses-h" className="flex flex-col gap-3">
          <h2 id="excuses-h" className="text-h3">
            {t('excuses')}
          </h2>
          <Card className="p-0">
            <ul>
              {excuses.map((c) => (
                <ListRow
                  key={c.id}
                  as="li"
                  href={`/klasse/${c.id}/entschuldigungen`}
                  linkAs={Link}
                  title={c.name}
                  trailing={
                    <Chip tone="late" icon={FileCheck}>
                      {t('excusesOpen', { count: byClass.get(c.name) ?? 0 })}
                    </Chip>
                  }
                />
              ))}
            </ul>
          </Card>
        </section>
      ) : null}

      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-ink-muted">
        {current ? (
          <span>
            {t('current', {
              name: current.name ?? current.schoolYear.name,
              date: shortDate(current.validFrom),
            })}
          </span>
        ) : null}
        <Link
          href="/admin/stundenplan"
          className="pf-focusable inline-flex items-center gap-1 text-label text-brand-text underline underline-offset-4"
        >
          <CalendarRange aria-hidden="true" className="size-4" />
          {t('allVersions')}
        </Link>
      </p>
    </div>
  );
}
