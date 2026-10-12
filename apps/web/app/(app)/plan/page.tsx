import Link from 'next/link';
import { can, type PlanResponse } from '@sp/shared';
import { Button } from '@sp/ui';
import { CalendarSubscription } from '../../../src/components/plan/calendar-subscription';
import { PlanPicker } from '../../../src/components/plan/plan-picker';
import { WeekPlan, type PlanPerspective } from '../../../src/components/plan/week-plan';
import { apiGet } from '../../../src/lib/api-server';
import { shortDate, weekOf } from '../../../src/lib/dates';
import { requireRoute } from '../../../src/lib/route-guard';
import { getT } from '../../../src/lib/nav-server';

interface Search {
  from?: string;
  class?: string;
  teacher?: string;
  room?: string;
  child?: string;
}
interface Child {
  id: string;
  firstName: string;
  lastName: string;
  className: string | null;
}
interface Directory {
  classes: { id: string; name: string }[];
  teachers: { id: string; name: string }[];
  rooms: { id: string; name: string }[];
}

export default async function PlanPage({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requireRoute('/plan');
  const q = await searchParams;
  const t = await getT('plan');
  const roles = me.user.roles.map((r) => r.role);
  const canOther = can({ personId: me.user.personId, roles }, 'timetable.read.other');
  const week = weekOf(q.from);
  const range = `from=${week.from}&to=${week.to}`;

  const directory = canOther ? await apiGet<Directory>('/timetable/directory') : null;
  let plan: PlanResponse;
  let title = t('mine');
  let perspective: PlanPerspective =
    roles.includes('STUDENT') || roles.includes('GUARDIAN') ? 'student' : 'teacher';
  let current: { kind: 'class' | 'teacher' | 'room'; id: string } | null = null;
  let children: Child[] = [];
  let child: Child | undefined;
  const keep = new URLSearchParams();

  if (canOther && (q.class || q.teacher || q.room)) {
    const kind = q.class ? 'class' : q.teacher ? 'teacher' : 'room';
    const id = (q.class ?? q.teacher ?? q.room)!;
    current = { kind, id };
    keep.set(kind, id);
    const path = kind === 'class' ? 'classes' : kind === 'teacher' ? 'teachers' : 'rooms';
    plan = await apiGet<PlanResponse>(`/${path}/${encodeURIComponent(id)}/timetable?${range}`);
    const list =
      kind === 'class'
        ? directory!.classes
        : kind === 'teacher'
          ? directory!.teachers
          : directory!.rooms;
    title = `${t(kind)} ${list.find((x) => x.id === id)?.name ?? ''}`;
    perspective = kind === 'class' ? 'student' : kind;
  } else if (roles.includes('GUARDIAN') && !roles.includes('STUDENT')) {
    children = (await apiGet<{ data: Child[] }>('/me/children')).data;
    child = children.find((c) => c.id === q.child) ?? children[0];
    if (child) keep.set('child', child.id);
    plan = child
      ? await apiGet<PlanResponse>(`/me/timetable?${range}&studentId=${child.id}`)
      : { from: week.from, to: week.to, periods: [], entries: [] };
    perspective = 'student';
    if (child) title = `${child.firstName}${child.className ? ` (${child.className})` : ''}`;
  } else {
    plan = await apiGet<PlanResponse>(`/me/timetable?${range}`);
  }
  const calendar = await apiGet<{ active: boolean }>('/me/calendar-token');
  const link = (from: string) =>
    `/plan?${new URLSearchParams({ ...Object.fromEntries(keep), from })}`;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-h1">{title}</h1>
          <p className="text-body-sm text-ink-muted">
            {t('week', { from: shortDate(week.from), to: shortDate(week.to) })}
          </p>
        </div>
        <nav aria-label={t('title')} className="flex flex-wrap gap-2">
          <Button variant="secondary" asChild>
            <Link href={link(week.prev)}>{t('prevWeek')}</Link>
          </Button>
          <Button variant="ghost" asChild>
            <Link href={link('')}>{t('thisWeek')}</Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link href={link(week.next)}>{t('nextWeek')}</Link>
          </Button>
        </nav>
      </div>

      {children.length > 1 ? (
        <nav aria-label={t('child')} className="flex flex-wrap gap-2">
          {children.map((c) => (
            <Button key={c.id} variant={c.id === child?.id ? 'primary' : 'secondary'} asChild>
              <Link
                href={`/plan?child=${c.id}&from=${week.from}`}
                aria-current={c.id === child?.id ? 'page' : undefined}
              >
                {c.firstName}
              </Link>
            </Button>
          ))}
        </nav>
      ) : null}

      {directory ? <PlanPicker directory={directory} from={week.from} current={current} /> : null}

      <WeekPlan plan={plan} perspective={perspective} />

      {current ? null : <CalendarSubscription csrfToken={me.csrfToken} active={calendar.active} />}
    </div>
  );
}
