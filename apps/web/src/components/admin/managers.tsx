'use client';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { CrudManager } from './crud-manager';
import { DefaultPeriodsButton } from './default-periods-button';

interface Common {
  csrfToken: string;
  readOnly: boolean;
}

// ───────────── Fächer ─────────────
export interface SubjectRow {
  id: string;
  name: string;
  code: string;
  color: string | null;
}
export function SubjectsManager({ rows, csrfToken, readOnly }: Common & { rows: SubjectRow[] }) {
  const t = useTranslations('admin.subjects');
  return (
    <CrudManager<SubjectRow>
      resource="subjects"
      rows={rows}
      title={t('title')}
      newLabel={t('new')}
      emptyTitle={t('emptyTitle')}
      emptyDescription={t('emptyDescription')}
      csrfToken={csrfToken}
      readOnly={readOnly}
      columns={[
        { key: 'name', label: t('name'), render: (r) => r.name },
        { key: 'code', label: t('code'), render: (r) => r.code },
        {
          key: 'color',
          label: t('color'),
          render: (r) =>
            r.color ? (
              <span className="inline-flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="size-4 rounded-full border border-line"
                  style={{ background: r.color }}
                />
                {r.color}
              </span>
            ) : (
              '–'
            ),
        },
      ]}
      fields={[
        { name: 'name', label: t('name'), type: 'text', required: true },
        { name: 'code', label: t('code'), type: 'text', required: true },
        { name: 'color', label: t('color'), type: 'color' },
      ]}
      toForm={(r) => ({ name: r.name, code: r.code, color: r.color ?? '#4f46e5' })}
    />
  );
}

// ───────────── Räume ─────────────
export interface RoomRow {
  id: string;
  name: string;
  capacity: number | null;
  kind: string | null;
}
export function RoomsManager({ rows, csrfToken, readOnly }: Common & { rows: RoomRow[] }) {
  const t = useTranslations('admin.rooms');
  return (
    <CrudManager<RoomRow>
      resource="rooms"
      rows={rows}
      title={t('title')}
      newLabel={t('new')}
      emptyTitle={t('emptyTitle')}
      emptyDescription={t('emptyDescription')}
      csrfToken={csrfToken}
      readOnly={readOnly}
      columns={[
        { key: 'name', label: t('name'), render: (r) => r.name },
        { key: 'capacity', label: t('capacity'), render: (r) => r.capacity ?? '–' },
        { key: 'kind', label: t('kind'), render: (r) => r.kind ?? '–' },
      ]}
      fields={[
        { name: 'name', label: t('name'), type: 'text', required: true },
        { name: 'capacity', label: t('capacity'), type: 'number' },
        { name: 'kind', label: t('kind'), type: 'text' },
      ]}
      toForm={(r) => ({
        name: r.name,
        capacity: r.capacity === null ? '' : String(r.capacity),
        kind: r.kind ?? '',
      })}
    />
  );
}

// ───────────── Raster ─────────────
export interface PeriodRow {
  id: string;
  number: number;
  startTime: string;
  endTime: string;
  blocksDouble: boolean;
}
export function PeriodsManager({ rows, csrfToken, readOnly }: Common & { rows: PeriodRow[] }) {
  const t = useTranslations('admin.periods');
  const c = useTranslations('common');
  return (
    <>
      <CrudManager<PeriodRow>
        resource="periods"
        rows={rows}
        title={t('title')}
        newLabel={t('new')}
        emptyTitle={t('emptyTitle')}
        emptyDescription={t('emptyDescription')}
        csrfToken={csrfToken}
        readOnly={readOnly}
        headerExtra={
          !readOnly && rows.length === 0 ? <DefaultPeriodsButton csrfToken={csrfToken} /> : null
        }
        columns={[
          { key: 'number', label: t('number'), render: (r) => r.number },
          { key: 'startTime', label: t('startTime'), render: (r) => r.startTime },
          { key: 'endTime', label: t('endTime'), render: (r) => r.endTime },
          {
            key: 'blocksDouble',
            label: t('blocksDouble'),
            render: (r) => (r.blocksDouble ? c('yes') : c('no')),
          },
        ]}
        fields={[
          { name: 'number', label: t('number'), type: 'number', required: true },
          { name: 'startTime', label: t('startTime'), type: 'time', required: true },
          { name: 'endTime', label: t('endTime'), type: 'time', required: true },
          { name: 'blocksDouble', label: t('blocksDouble'), type: 'checkbox' },
        ]}
        toForm={(r) => ({
          number: String(r.number),
          startTime: r.startTime,
          endTime: r.endTime,
          blocksDouble: r.blocksDouble,
        })}
      />
      <p className="mx-auto max-w-4xl px-4 text-body-sm text-ink-muted">{t('hint')}</p>
    </>
  );
}

// ───────────── Klassen und Gruppen ─────────────
export interface ClassRow {
  id: string;
  name: string;
  homeroomTeacher: { id: string; firstName: string; lastName: string } | null;
  studentCount: number;
}
export interface Option {
  value: string;
  label: string;
}
export function ClassesManager({
  rows,
  teachers,
  schoolYearId,
  csrfToken,
  readOnly,
}: Common & { rows: ClassRow[]; teachers: Option[]; schoolYearId: string }) {
  const t = useTranslations('admin.classes');
  return (
    <CrudManager<ClassRow>
      resource="classes"
      rows={rows}
      title={t('title')}
      newLabel={t('new')}
      emptyTitle={t('emptyTitle')}
      emptyDescription={t('emptyDescription')}
      csrfToken={csrfToken}
      readOnly={readOnly}
      createExtra={{ schoolYearId }}
      columns={[
        {
          key: 'name',
          label: t('name'),
          render: (r) => (
            <Link className="text-brand-text underline" href={`/admin/klassen/${r.id}`}>
              {r.name}
            </Link>
          ),
        },
        {
          key: 'homeroom',
          label: t('homeroom'),
          render: (r) =>
            r.homeroomTeacher
              ? `${r.homeroomTeacher.firstName} ${r.homeroomTeacher.lastName}`
              : '–',
        },
        { key: 'students', label: t('students'), render: (r) => r.studentCount },
      ]}
      fields={[
        { name: 'name', label: t('name'), type: 'text', required: true },
        {
          name: 'homeroomTeacherId',
          label: t('homeroom'),
          type: 'select',
          options: teachers,
          emptyLabel: t('noHomeroom'),
        },
      ]}
      toForm={(r) => ({ name: r.name, homeroomTeacherId: r.homeroomTeacher?.id ?? '' })}
    />
  );
}

export interface GroupRow {
  id: string;
  name: string;
  memberCount: number;
}
export function GroupsManager({
  rows,
  schoolYearId,
  csrfToken,
  readOnly,
}: Common & { rows: GroupRow[]; schoolYearId: string }) {
  const t = useTranslations('admin.classes');
  return (
    <CrudManager<GroupRow>
      resource="groups"
      rows={rows}
      title={t('groups')}
      newLabel={t('newGroup')}
      emptyTitle={t('noGroups')}
      emptyDescription=""
      csrfToken={csrfToken}
      readOnly={readOnly}
      createExtra={{ schoolYearId }}
      columns={[
        { key: 'name', label: t('groupName'), render: (r) => r.name },
        { key: 'members', label: t('members'), render: (r) => r.memberCount },
      ]}
      fields={[{ name: 'name', label: t('groupName'), type: 'text', required: true }]}
      toForm={(r) => ({ name: r.name })}
    />
  );
}

// ───────────── Schuljahre und Ferien ─────────────
export interface YearRow {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  isCurrent: boolean;
  classCount?: number;
  freeDayCount?: number;
}
export function YearsManager({
  rows,
  selectedId,
  csrfToken,
  readOnly,
}: Common & { rows: YearRow[]; selectedId: string | null }) {
  const t = useTranslations('admin.years');
  const c = useTranslations('common');
  return (
    <CrudManager<YearRow>
      resource="school-years"
      rows={rows}
      title={t('title')}
      newLabel={t('new')}
      emptyTitle={t('emptyTitle')}
      emptyDescription={t('emptyDescription')}
      csrfToken={csrfToken}
      readOnly={readOnly}
      columns={[
        {
          key: 'name',
          label: t('name'),
          render: (r) => (
            <Link
              className={
                r.id === selectedId
                  ? 'font-semibold text-brand-text underline'
                  : 'text-brand-text underline'
              }
              href={`/admin/schuljahr?year=${r.id}`}
            >
              {r.name}
            </Link>
          ),
        },
        { key: 'startsOn', label: t('startsOn'), render: (r) => r.startsOn },
        { key: 'endsOn', label: t('endsOn'), render: (r) => r.endsOn },
        {
          key: 'current',
          label: t('current'),
          render: (r) => (r.isCurrent ? c('yes') : c('none')),
        },
      ]}
      fields={[
        { name: 'name', label: t('name'), type: 'text', required: true, placeholder: '2026/27' },
        { name: 'startsOn', label: t('startsOn'), type: 'date', required: true },
        { name: 'endsOn', label: t('endsOn'), type: 'date', required: true },
        { name: 'isCurrent', label: t('isCurrent'), type: 'checkbox' },
      ]}
      toForm={(r) => ({
        name: r.name,
        startsOn: r.startsOn,
        endsOn: r.endsOn,
        isCurrent: r.isCurrent,
      })}
    />
  );
}

export interface FreeDayRow {
  id: string;
  fromDate: string;
  toDate: string;
  label: string;
}
export function FreeDaysManager({
  rows,
  yearId,
  csrfToken,
  readOnly,
}: Common & { rows: FreeDayRow[]; yearId: string }) {
  const t = useTranslations('admin.years');
  return (
    <CrudManager<FreeDayRow>
      resource={`school-years/${yearId}/free-days`}
      rows={rows}
      title={t('freeDays')}
      newLabel={t('addFree')}
      emptyTitle={t('noFree')}
      emptyDescription=""
      csrfToken={csrfToken}
      readOnly={readOnly}
      canEdit={false}
      columns={[
        { key: 'label', label: t('freeLabel'), render: (r) => r.label },
        { key: 'from', label: t('freeFrom'), render: (r) => r.fromDate },
        { key: 'to', label: t('freeTo'), render: (r) => r.toDate },
      ]}
      fields={[
        { name: 'label', label: t('freeLabel'), type: 'text', required: true },
        { name: 'fromDate', label: t('freeFrom'), type: 'date', required: true },
        { name: 'toDate', label: t('freeTo'), type: 'date', required: true },
      ]}
      toForm={(r) => ({ label: r.label, fromDate: r.fromDate, toDate: r.toDate })}
    />
  );
}
